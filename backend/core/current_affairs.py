import json
import logging
import os
import re
import threading
import time as time_module
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from email.utils import parsedate_to_datetime
from html import unescape
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests

from .models import CurrentAffair, ROLE_ADMIN, User

logger = logging.getLogger(__name__)
IST = ZoneInfo("Asia/Kolkata")
CURRENT_AFFAIRS_FEEDS = [
    "https://news.google.com/rss/search?q=India%20education%20science%20technology%20environment%20economy%20sports%20government%20policy%20when:2d&hl=en-IN&gl=IN&ceid=IN:en",
    "https://www.thehindu.com/news/national/feeder/default.rss",
    "https://indianexpress.com/section/education/feed/",
    "https://indianexpress.com/section/technology/science/feed/",
    "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3",
]
DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b"
DEFAULT_GROQ_BATCH_SIZE = 4
AUTO_UPDATE_RETRY_MINUTES = 60
_AUTO_UPDATE_LOCK = threading.Lock()
_AUTO_UPDATE_LAST_ATTEMPT = None
ALLOWED_CATEGORIES = {
    "India",
    "Education",
    "Science & Technology",
    "Environment",
    "Economy",
    "International",
    "Sports",
    "Government & Policy",
    "Awards & Achievements",
}
EDUCATIONAL_KEYWORDS = {
    "india",
    "education",
    "student",
    "exam",
    "science",
    "technology",
    "isro",
    "space",
    "environment",
    "climate",
    "economy",
    "policy",
    "government",
    "parliament",
    "award",
    "achievement",
    "sports",
    "international",
    "research",
}


@dataclass
class SourceArticle:
    title: str
    summary: str
    source_url: str
    source_name: str
    published_on: datetime
    image_url: str = ""


def can_run_daily_update(now=None):
    current = now.astimezone(IST) if now else datetime.now(IST)
    return current.time() >= time(6, 0)


def today_digest_count(now=None):
    current = now.astimezone(IST) if now else datetime.now(IST)
    return CurrentAffair.objects(digest_date=current.date().isoformat()).count()


def maybe_auto_update_current_affairs(target_count=8, now=None):
    global _AUTO_UPDATE_LAST_ATTEMPT

    try:
        desired_count = max(1, min(int(target_count), 10))
    except (TypeError, ValueError):
        desired_count = 8
    current = now.astimezone(IST) if now else datetime.now(IST)
    if not can_run_daily_update(current):
        return {"skipped": "before_daily_window"}
    if today_digest_count(current) >= desired_count:
        return {"skipped": "already_current"}
    if _AUTO_UPDATE_LAST_ATTEMPT and current - _AUTO_UPDATE_LAST_ATTEMPT < timedelta(minutes=AUTO_UPDATE_RETRY_MINUTES):
        return {"skipped": "recently_attempted"}
    if not _AUTO_UPDATE_LOCK.acquire(blocking=False):
        return {"skipped": "already_running"}
    try:
        if today_digest_count(current) >= desired_count:
            return {"skipped": "already_current"}
        _AUTO_UPDATE_LAST_ATTEMPT = current
        result = update_current_affairs(target_count=desired_count)
        logger.info("Current affairs auto-update result: %s", result)
        return result
    except Exception as exc:
        logger.warning("Current affairs auto-update failed: %s", exc, exc_info=True)
        return {"skipped": "failed", "error": exc.__class__.__name__}
    finally:
        _AUTO_UPDATE_LOCK.release()


def fetch_source_articles(limit=25, timeout=12):
    articles = []
    seen = set()
    for feed_url in CURRENT_AFFAIRS_FEEDS:
        try:
            response = requests.get(feed_url, timeout=timeout, headers={"User-Agent": "RedHeroCurrentAffairs/1.0"})
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("Current affairs source feed failed: %s", exc)
            continue
        for article in parse_feed(response.text, feed_url):
            key = normalize_url(article.source_url)
            if not key or key in seen or not is_educational_article(article):
                continue
            if not article.image_url:
                article.image_url = fetch_open_graph_image(article.source_url, timeout=min(timeout, 5))
            seen.add(key)
            articles.append(article)
            if len(articles) >= limit:
                return articles
    return articles


def parse_feed(xml_text, feed_url):
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        logger.warning("Current affairs feed XML parse failed for %s: %s", feed_url, exc)
        return []
    channel_title = text(root.find("./channel/title")) or source_name_from_url(feed_url)
    articles = []
    for item in root.findall("./channel/item"):
        title = clean_text(text(item.find("title")))
        raw_summary = text(item.find("description"))
        summary = clean_text(raw_summary)
        source_node = item.find("{*}source")
        source_url = source_node.attrib.get("url", "") if source_node is not None else ""
        source_name = clean_text(source_node.text) if source_node is not None and source_node.text else channel_title
        link = clean_text(text(item.find("link")))
        url = link if is_valid_url(link) else source_url
        if not title or not is_valid_url(url):
            continue
        image_url = extract_feed_image(item, raw_summary, url)
        articles.append(
            SourceArticle(
                title=title,
                summary=summary,
                source_url=url,
                source_name=source_name or source_name_from_url(url),
                published_on=parse_published_date(text(item.find("pubDate"))),
                image_url=image_url,
            )
        )
    return articles


def generate_current_affairs_digest(source_articles, target_count=8):
    stats = {"batches_attempted": 0, "batches_succeeded": 0, "batches_failed": 0}
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        logger.warning("GROQ_API_KEY is not configured; skipping AI current affairs update.")
        return [], stats
    if not source_articles:
        return [], stats
    try:
        from groq import APIConnectionError, APIStatusError, APITimeoutError, Groq, RateLimitError
    except ImportError as exc:
        logger.warning("groq SDK is unavailable; skipping AI current affairs update: %s", exc)
        return [], stats

    client = Groq(api_key=api_key, timeout=30)
    model = os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL)
    batch_size = safe_batch_size(os.getenv("GROQ_BATCH_SIZE", DEFAULT_GROQ_BATCH_SIZE))
    max_items = max(1, min(target_count, 10))
    items = []
    retry_errors = (APIConnectionError, APITimeoutError, RateLimitError)
    for batch in chunked(list(enumerate(source_articles)), batch_size):
        if len(items) >= max_items:
            break
        stats["batches_attempted"] += 1
        try:
            text_value = call_groq_batch(client, model, batch, max_items - len(items), retry_errors, APIStatusError)
        except Exception as exc:
            stats["batches_failed"] += 1
            logger.warning("Groq current affairs batch failed: %s", exc.__class__.__name__)
            continue
        parsed_items = parse_ai_items(text_value)
        if parsed_items:
            stats["batches_succeeded"] += 1
            items.extend(parsed_items[: max_items - len(items)])
        else:
            stats["batches_failed"] += 1
    return items, stats


def call_groq_batch(client, model, batch, remaining_count, retry_errors, status_error_cls):
    source_payload = [
        {
            "id": index,
            "title": article.title,
            "summary": article.summary[:700],
            "source_name": article.source_name,
            "published_on": article.published_on.date().isoformat(),
        }
        for index, article in batch
    ]
    prompt = (
        "Create a student-friendly current affairs digest for Indian school students.\n"
        "Use ONLY the source articles in the JSON below. Do not invent facts or URLs.\n"
        f"Return {remaining_count} or fewer useful items as strict JSON with an 'items' array.\n"
        "Each item must include exactly: source_id, title, category, summary, content.\n"
        "Categories must be one of: India, Education, Science & Technology, Environment, Economy, "
        "International, Sports, Government & Policy, Awards & Achievements.\n"
        "Keep summary to 1-2 sentences. Keep content concise, factual, and useful for school current-affairs preparation.\n\n"
        f"Sources: {json.dumps(source_payload, ensure_ascii=True)}"
    )
    messages = [
        {"role": "system", "content": "You summarize verified source material into factual JSON only. Never invent source IDs, URLs, or facts."},
        {"role": "user", "content": prompt},
    ]
    for attempt in range(1, 4):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.2,
                max_completion_tokens=1800,
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content or ""
        except status_error_cls as exc:
            if getattr(exc, "status_code", 0) not in {408, 409, 429, 500, 502, 503, 504} or attempt == 3:
                raise
        except retry_errors:
            if attempt == 3:
                raise
        time_module.sleep(2 ** (attempt - 1))
    return ""


def parse_ai_items(text_value):
    cleaned = re.sub(r"^```(?:json)?|```$", "", text_value.strip(), flags=re.IGNORECASE | re.MULTILINE).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Groq current affairs response was not valid JSON.")
        return []
    items = data.get("items") if isinstance(data, dict) else data
    return items if isinstance(items, list) else []


def save_current_affairs_digest(items, source_articles, created_by=None, dry_run=False):
    source_by_id = {index: article for index, article in enumerate(source_articles)}
    admin = created_by or User.objects(role=ROLE_ADMIN).first()
    stats = {"validated": 0, "rejected": 0, "duplicates": 0, "created": 0, "would_create": 0}
    if not admin and not dry_run:
        logger.warning("No admin user exists; cannot save AI current affairs digest.")
        stats["rejected"] = len(items)
        return stats
    today_ist = datetime.now(IST).date().isoformat()
    for item in items:
        source = source_by_id.get(safe_int(item.get("source_id")))
        if not source or not is_valid_digest_item(item, source):
            stats["rejected"] += 1
            continue
        stats["validated"] += 1
        source_key = normalize_url(source.source_url)
        normalized_title = normalize_title(item["title"])
        title_duplicate = CurrentAffair.objects(
            title__iexact=item["title"].strip(),
            published_on__gte=source.published_on - timedelta(days=1),
            published_on__lte=source.published_on + timedelta(days=1),
        ).first()
        if CurrentAffair.objects(source_url=source_key).first() or title_duplicate:
            stats["duplicates"] += 1
            continue
        if dry_run:
            stats["would_create"] += 1
            continue
        CurrentAffair(
            title=item["title"].strip(),
            summary=item["summary"].strip(),
            content=item["content"].strip(),
            category=normalize_category(item["category"]),
            source_url=source_key,
            source_name=source.source_name,
            image_url=normalize_url(source.image_url),
            generated_by_ai=True,
            digest_date=today_ist,
            fetched_at=datetime.utcnow(),
            published_on=source.published_on.replace(tzinfo=None),
            created_by=admin,
        ).save()
        stats["created"] += 1
        logger.info("Saved AI current affair: %s", normalized_title)
    return stats


def update_current_affairs(target_count=8):
    sources = fetch_source_articles()
    items, ai_stats = generate_current_affairs_digest(sources, target_count=target_count)
    stats = save_current_affairs_digest(items, sources)
    return {"sources": len(sources), "generated": len(items), **ai_stats, **stats}


def chunked(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def safe_batch_size(value):
    try:
        return max(1, min(int(value), 5))
    except (TypeError, ValueError):
        return DEFAULT_GROQ_BATCH_SIZE


def is_valid_digest_item(item, source):
    if not isinstance(item, dict):
        return False
    required = ["title", "category", "summary", "content"]
    if any(not str(item.get(field, "")).strip() for field in required):
        return False
    if normalize_category(item.get("category")) not in ALLOWED_CATEGORIES:
        return False
    if not is_valid_url(source.source_url):
        return False
    if source.published_on > datetime.utcnow() + timedelta(days=1):
        return False
    return True


def is_educational_article(article):
    haystack = f"{article.title} {article.summary}".lower()
    return any(keyword in haystack for keyword in EDUCATIONAL_KEYWORDS)


def normalize_category(value):
    category = str(value or "").strip()
    return category if category in ALLOWED_CATEGORIES else "India"


def parse_published_date(value):
    try:
        parsed = parsedate_to_datetime(value or "")
    except (TypeError, ValueError):
        parsed = None
    if not parsed:
        return datetime.utcnow()
    if parsed.tzinfo:
        return parsed.astimezone(IST).replace(tzinfo=None)
    return parsed


def is_valid_url(value):
    parsed = urlparse(str(value or ""))
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def normalize_url(value):
    if not is_valid_url(value):
        return ""
    parsed = urlparse(value.strip())
    return parsed._replace(fragment="").geturl()


def extract_feed_image(item, summary, article_url):
    candidates = []
    for tag_name in ["{*}thumbnail", "{*}content"]:
        for node in item.findall(tag_name):
            candidates.append(node.attrib.get("url", ""))
    enclosure = item.find("enclosure")
    if enclosure is not None and str(enclosure.attrib.get("type", "")).startswith("image/"):
        candidates.append(enclosure.attrib.get("url", ""))
    candidates.extend(re.findall(r"<img[^>]+src=[\"']([^\"']+)[\"']", unescape(summary or ""), flags=re.IGNORECASE))
    for candidate in candidates:
        image_url = normalize_url(urljoin(article_url, clean_text(candidate)))
        if image_url:
            return image_url
    return ""


def fetch_open_graph_image(article_url, timeout=5):
    if not is_valid_url(article_url):
        return ""
    try:
        response = requests.get(article_url, timeout=timeout, headers={"User-Agent": "RedHeroCurrentAffairs/1.0"})
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.debug("Current affairs image metadata fetch failed for %s: %s", article_url, exc)
        return ""
    html = response.text[:70000]
    patterns = [
        r"<meta[^>]+property=[\"']og:image(?::secure_url)?[\"'][^>]+content=[\"']([^\"']+)[\"']",
        r"<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']og:image(?::secure_url)?[\"']",
        r"<meta[^>]+name=[\"']twitter:image[\"'][^>]+content=[\"']([^\"']+)[\"']",
        r"<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+name=[\"']twitter:image[\"']",
    ]
    for pattern in patterns:
        match = re.search(pattern, html, flags=re.IGNORECASE)
        if match:
            image_url = normalize_url(urljoin(article_url, unescape(match.group(1).strip())))
            if image_url:
                return image_url
    return ""


def normalize_title(value):
    return re.sub(r"\s+", " ", str(value or "").lower()).strip()


def source_name_from_url(value):
    return urlparse(value).netloc.replace("www.", "")


def clean_text(value):
    text_value = re.sub(r"<[^>]+>", " ", unescape(value or ""))
    return re.sub(r"\s+", " ", text_value).strip()


def text(node):
    return node.text if node is not None and node.text else ""


def safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
