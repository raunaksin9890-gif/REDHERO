import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  ExternalLink,
  Filter,
  Megaphone,
  Newspaper,
  Pencil,
  Play,
  PlayCircle,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../components/AuthProvider.jsx";
import { ConfirmDialog, EmptyState, LoadingOverlay, useToast } from "../components/UX.jsx";

const endpoints = [
  {
    key: "notes",
    slug: "notes",
    title: "Notes / Lessons",
    shortTitle: "Notes",
    icon: BookOpen,
    path: "/notes/",
    countLabel: "Notes",
    empty: "No notes available",
    description: "Study notes, chapter-wise materials and important PDFs.",
    detailDescription: "All study notes and materials.",
    accent: "#d61f3a",
  },
  {
    key: "blogs",
    slug: "articles",
    title: "Articles / Blogs",
    shortTitle: "Articles",
    icon: Newspaper,
    path: "/blogs/",
    countLabel: "Articles",
    empty: "No articles available",
    description: "Read informative articles and learning blogs.",
    detailDescription: "Read and learn from informative articles.",
    accent: "#8b5cf6",
  },
  {
    key: "currentAffairs",
    slug: "current-affairs",
    title: "Current Affairs",
    shortTitle: "Current Affairs",
    icon: TrendingUp,
    path: "/current-affairs/",
    countLabel: "Updates",
    empty: "No updates available",
    description: "Stay updated with today's current affairs.",
    detailDescription: "Stay updated with the latest current affairs.",
    accent: "#16a34a",
  },
  {
    key: "videos",
    slug: "lecture-videos",
    title: "Lecture Videos",
    shortTitle: "Videos",
    icon: PlayCircle,
    path: "/videos/",
    countLabel: "Videos",
    empty: "No videos available",
    description: "Watch video lectures with fast resume controls.",
    detailDescription: "All video lessons in one place. Watch, learn and master every topic.",
    accent: "#0ea5e9",
  },
  {
    key: "notices",
    slug: "notice-board",
    title: "Notice Board",
    shortTitle: "Notices",
    icon: Megaphone,
    path: "/notices/",
    countLabel: "Notices",
    empty: "No notices available",
    description: "Important notices from your school and teachers.",
    detailDescription: "Important notices from school and teachers.",
    accent: "#f97316",
  },
];

export function Learning() {
  const { user, profile } = useAuth();
  const { sectionSlug, itemId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const activeSection = endpoints.find((section) => section.slug === sectionSlug);

  async function load() {
    try {
      setBusy(true);
      const pairs = await Promise.all(endpoints.map(async (item) => [item.key, (await api(item.path)).results || []]));
      setData(Object.fromEntries(pairs));
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (sectionSlug && !activeSection) navigate("/learning", { replace: true });
  }, [activeSection, navigate, sectionSlug]);

  const courseCards = endpoints.map((section) => ({ ...section, items: data[section.key] || [] }));

  return (
    <div className="learning-hub">
      <style>{learningHubStyles}</style>
      {activeSection ? (
        <LearningDetail
          data={data}
          itemId={itemId}
          onSaved={load}
          section={activeSection}
          setMessage={setMessage}
          user={user}
        />
      ) : (
        <LearningLanding
          cards={courseCards}
          onSaved={load}
          profile={profile}
          setMessage={setMessage}
          user={user}
        />
      )}
      <LoadingOverlay show={busy} label="Loading learning content" />
      {message && <div className="inline-message">{message}</div>}
    </div>
  );
}

function LearningLanding({ cards, onSaved, profile, setMessage, user }) {
  const studentClass = profile?.class_level ? `Class ${profile.class_level}` : "Learning Portal";
  return (
    <>
      <section className="learning-title-row">
        <div>
          <h1>Learning Hub</h1>
          <p>Continue your learning journey. Explore notes, videos, articles and more all in one place.</p>
        </div>
        <div className="student-pill">
          <Sparkles size={18} />
          <span>Hello, {profile?.name || user.name}</span>
          <strong>{studentClass}</strong>
        </div>
      </section>

      <section className="learning-card-grid" aria-label="Learning categories">
        {cards.map((course, index) => {
          const Icon = course.icon;
          return (
            <article className="learning-card" key={course.key} style={{ "--course-accent": course.accent, "--stagger": index }}>
              <div className="learning-card-icon"><Icon size={30} /></div>
              <h2>{course.title}</h2>
              <p>{course.description}</p>
              <strong className="learning-count">{course.items.length} {course.countLabel}</strong>
              <div className="learning-card-footer">
                <div className="count-ring" aria-label={`${course.items.length} ${course.countLabel}`}>
                  <strong>{course.items.length}</strong>
                </div>
                <Link className="continue-button" to={`/learning/${course.slug}`}>
                  <span>Continue Learning</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          );
        })}
      </section>

      {user.role !== "student" && <ContentForm user={user} onSaved={onSaved} setMessage={setMessage} />}
    </>
  );
}

function LearningDetail({ data, itemId, onSaved, section, setMessage, user }) {
  const items = data[section.key] || [];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(itemId || "");
  const selectedItem = useMemo(() => {
    if (!items.length) return null;
    return items.find((item) => item.id === selectedId) || items[0];
  }, [items, selectedId]);

  useEffect(() => {
    setSelectedId(itemId || "");
  }, [itemId, section.slug]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => searchableText(item).includes(needle));
  }, [items, query]);

  const Icon = section.icon;
  const isVideo = section.key === "videos";

  return (
    <section className={`learning-detail ${isVideo ? "video-detail" : ""}`}>
      <header className="detail-head">
        <Link className="back-link" to="/learning"><ArrowLeft size={16} /> Learning Hub</Link>
        <div className="detail-title">
          <div className="detail-icon" style={{ "--course-accent": section.accent }}><Icon size={28} /></div>
          <div>
            <h1>{section.title}</h1>
            <p>{section.detailDescription}</p>
          </div>
        </div>
      </header>

      <div className="detail-tools">
        <label className="detail-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section.shortTitle.toLowerCase()}...`} />
        </label>
        <button className="filter-button" type="button"><Filter size={16} /> Filter</button>
      </div>

      {user.role !== "student" && <ContentForm compact user={user} onSaved={onSaved} setMessage={setMessage} initialType={section.key} />}

      {isVideo ? (
        <VideoLearningPage
          items={filtered}
          onSaved={onSaved}
          section={section}
          selectedItem={selectedItem}
          setMessage={setMessage}
          setSelectedId={setSelectedId}
          user={user}
        />
      ) : (
        <ResourceDetailPage
          items={filtered}
          onSaved={onSaved}
          section={section}
          selectedItem={selectedItem}
          setMessage={setMessage}
          setSelectedId={setSelectedId}
          user={user}
        />
      )}
    </section>
  );
}

function ResourceDetailPage({ items, onSaved, section, selectedItem, setMessage, setSelectedId, user }) {
  return (
    <div className="resource-layout">
      <section className="resource-list-panel">
        <h2>All {section.countLabel} ({items.length})</h2>
        <div className="resource-list">
          {items.map((item, index) => (
            <button className={`resource-list-item ${selectedItem?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
              <span>{index + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{resourceMeta(section.key, item)}</small>
              </div>
              <ArrowRight size={15} />
            </button>
          ))}
          {!items.length && <EmptyState title={section.empty} message="Published content will appear here when available." />}
        </div>
      </section>

      <section className="resource-detail-panel">
        {selectedItem ? (
          <SelectedResource section={section} item={selectedItem} user={user} onSaved={onSaved} setMessage={setMessage} />
        ) : (
          <EmptyState title={section.empty} message="There is no content to open yet." />
        )}
      </section>
    </div>
  );
}

function VideoLearningPage({ items, onSaved, section, selectedItem, setMessage, setSelectedId, user }) {
  const selected = selectedItem || items[0];
  return (
    <div className="video-layout">
      <section className="video-list-panel">
        <h2>All Videos ({items.length})</h2>
        <div className="video-list">
          {items.map((item, index) => (
            <button className={`video-row ${selected?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
              <div className="mini-thumb" style={{ backgroundImage: thumbnailUrl(item.youtube_url) ? `url(${thumbnailUrl(item.youtube_url)})` : undefined }}>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div>
                <strong>{item.title}</strong>
                <small>{resourceMeta(section.key, item)}</small>
                {item.description && <em>{item.description}</em>}
              </div>
            </button>
          ))}
          {!items.length && <EmptyState title={section.empty} message="Published videos will appear here when available." />}
        </div>
      </section>

      <section className="video-player-panel">
        {selected ? (
          <>
            <div className="video-stage">
              {embedUrl(selected.youtube_url) ? (
                <iframe src={embedUrl(selected.youtube_url)} title={selected.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
              ) : (
                <div className="video-placeholder"><Play size={34} /><span>Video link available</span></div>
              )}
            </div>
            <SelectedResource section={section} item={selected} user={user} onSaved={onSaved} setMessage={setMessage} />
          </>
        ) : (
          <EmptyState title={section.empty} message="There is no video to play yet." />
        )}
      </section>
    </div>
  );
}

function SelectedResource({ section, item, user, onSaved, setMessage }) {
  return (
    <article className="selected-resource">
      <header>
        <span>{resourceTypeLabel(section.key)}</span>
        <h2>{item.title}</h2>
        <p>{resourceMeta(section.key, item)}</p>
      </header>

      <div className="detail-section">
        <h3>Description</h3>
        <p>{item.description || item.summary || item.content || item.body || "No description available."}</p>
      </div>

      {section.key === "notes" && (
        <div className="detail-section">
          <h3>PDFs and Attachments</h3>
          {item.pdf_url ? <a className="resource-action" href={item.pdf_url} target="_blank" rel="noreferrer"><Download size={17} /> Open PDF</a> : <span className="muted-line">No PDF attached.</span>}
        </div>
      )}

      {section.key === "videos" && (
        <div className="detail-section">
          <h3>Video Link</h3>
          {item.youtube_url ? <a className="resource-action" href={item.youtube_url} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Open video</a> : <span className="muted-line">No video link attached.</span>}
        </div>
      )}

      {["blogs", "currentAffairs", "notices"].includes(section.key) && (
        <div className="detail-section">
          <h3>Content</h3>
          <p>{item.content || item.summary || item.body || "No content available."}</p>
          {section.key === "currentAffairs" && item.source_url && (
            <a className="resource-action" href={item.source_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={17} /> Read Full Source →
            </a>
          )}
        </div>
      )}

      <div className="detail-section meta-grid">
        {item.class_level && <MetaTile label="Class" value={`Class ${item.class_level}`} />}
        {item.subject && <MetaTile label="Subject" value={item.subject} />}
        {item.chapter && <MetaTile label="Chapter" value={item.chapter} />}
        {item.category && <MetaTile label="Category" value={item.category} />}
        {item.created_at && <MetaTile label="Published" value={formatDate(item.created_at)} />}
        {item.published_on && <MetaTile label="Published" value={formatDate(item.published_on)} />}
      </div>

      <ContentItem section={section} item={item} user={user} onSaved={onSaved} setMessage={setMessage} />
    </article>
  );
}

function MetaTile({ label, value }) {
  return (
    <div className="meta-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ContentForm({ compact = false, initialType, user, onSaved, setMessage }) {
  const allowedEndpoints = user.role === "super_admin" ? endpoints : endpoints.filter((item) => ["notes", "videos", "notices"].includes(item.key));
  const fallbackType = allowedEndpoints.some((item) => item.key === initialType) ? initialType : allowedEndpoints[0].key;
  const [type, setType] = useState(fallbackType);
  const [form, setForm] = useState({ title: "", class_level: "10", subject: "Mathematics", chapter: "", description: "", url: "", body: "" });
  const [progress, setProgress] = useState(0);
  const toast = useToast();

  async function submit(event) {
    event.preventDefault();
    const bodyByType = {
      notes: { title: form.title, class_level: form.class_level, subject: form.subject, chapter: form.chapter, pdf_url: form.url },
      videos: { title: form.title, class_level: form.class_level, subject: form.subject, chapter: form.chapter, description: form.description, youtube_url: form.url },
      notices: { title: form.title, body: form.body, class_level: form.class_level },
      blogs: { title: form.title, category: "Study Tips", content: form.body, published: true },
      currentAffairs: { title: form.title, summary: form.body, category: "Educational News" },
    };
    const path = endpoints.find((item) => item.key === type).path;
    try {
      setProgress(45);
      await api(path, { method: "POST", body: JSON.stringify(bodyByType[type]) });
      setProgress(100);
      setMessage("Published successfully");
      toast?.show("Published successfully");
      setForm({ title: "", class_level: "10", subject: "Mathematics", chapter: "", description: "", url: "", body: "" });
      onSaved();
      window.setTimeout(() => setProgress(0), 700);
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
      setProgress(0);
    }
  }

  return (
    <section className={`publish-panel ${compact ? "compact" : ""}`}>
      <h2><Send size={20} /> Publish Learning Content</h2>
      <form className="content-form" onSubmit={submit}>
        <select value={type} onChange={(event) => setType(event.target.value)}>{allowedEndpoints.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}</select>
        <input placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        {["notes", "videos", "notices"].includes(type) && <input placeholder="Class" value={form.class_level} onChange={(event) => setForm({ ...form, class_level: event.target.value })} />}
        {["notes", "videos"].includes(type) && <input placeholder="Subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />}
        {["notes", "videos"].includes(type) && <input placeholder="Chapter" value={form.chapter} onChange={(event) => setForm({ ...form, chapter: event.target.value })} />}
        {type === "videos" && <input placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />}
        {["notes", "videos"].includes(type) && (
          <label className="upload-drop">
            <UploadCloud size={18} />
            <input placeholder={type === "notes" ? "PDF URL" : "YouTube URL"} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required />
          </label>
        )}
        {["notices", "blogs", "currentAffairs"].includes(type) && <textarea placeholder="Content" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required />}
        {progress > 0 && <div className="progress"><span style={{ width: `${progress}%` }} /></div>}
        <button className="primary">Publish</button>
      </form>
    </section>
  );
}

function ContentItem({ section, item, user, onSaved, setMessage }) {
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: item.title || "",
    class_level: item.class_level || "10",
    subject: item.subject || "Mathematics",
    chapter: item.chapter || "",
    description: item.description || "",
    url: item.pdf_url || item.youtube_url || "",
    body: item.body || item.content || item.summary || "",
    category: item.category || "Study Tips",
  });
  const canManage = user.role === "super_admin" || (user.role === "teacher" && ["notes", "videos", "notices"].includes(section.key));
  const toast = useToast();

  function payload() {
    if (section.key === "notes") return { id: item.id, title: draft.title, class_level: draft.class_level, subject: draft.subject, chapter: draft.chapter, pdf_url: draft.url };
    if (section.key === "videos") return { id: item.id, title: draft.title, class_level: draft.class_level, subject: draft.subject, chapter: draft.chapter, description: draft.description, youtube_url: draft.url };
    if (section.key === "notices") return { id: item.id, title: draft.title, body: draft.body, class_level: draft.class_level };
    if (section.key === "blogs") return { id: item.id, title: draft.title, category: draft.category, content: draft.body, published: true };
    return { id: item.id, title: draft.title, summary: draft.body, category: draft.category };
  }

  async function save() {
    try {
      await api(section.path, { method: "PUT", body: JSON.stringify(payload()) });
      setEditing(false);
      setMessage("Updated successfully");
      toast?.show("Updated successfully");
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  async function remove() {
    try {
      await api(`${section.path}?id=${item.id}`, { method: "DELETE" });
      setMessage("Deleted successfully");
      toast?.show("Deleted successfully");
      setConfirmOpen(false);
      onSaved();
    } catch (err) {
      setMessage(err.message);
      toast?.show(err.message, "error");
    }
  }

  if (!canManage) return null;

  if (editing) {
    return (
      <article className="manage-card editing-item">
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        {["notes", "videos", "notices"].includes(section.key) && <input value={draft.class_level} onChange={(event) => setDraft({ ...draft, class_level: event.target.value })} />}
        {["notes", "videos"].includes(section.key) && <input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />}
        {["notes", "videos"].includes(section.key) && <input value={draft.chapter} onChange={(event) => setDraft({ ...draft, chapter: event.target.value })} />}
        {section.key === "videos" && <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />}
        {["notes", "videos"].includes(section.key) && <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} />}
        {["notices", "blogs", "currentAffairs"].includes(section.key) && <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />}
        <div className="manage-actions">
          <button className="icon-button" title="Save" onClick={save}><Save size={16} /></button>
          <button className="icon-button" title="Cancel" onClick={() => setEditing(false)}><X size={16} /></button>
        </div>
      </article>
    );
  }

  return (
    <div className="manage-card">
      <span>Manage this item</span>
      <div className="manage-actions">
        <button className="icon-button" title="Edit" onClick={() => setEditing(true)}><Pencil size={16} /></button>
        <button className="icon-button" title="Delete" onClick={() => setConfirmOpen(true)}><Trash2 size={16} /></button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${item.title}?`}
        message="This removes the learning item from the library."
        confirmLabel="Delete"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remove}
      />
    </div>
  );
}

function resourceTypeLabel(key) {
  if (key === "notes") return "Notes / Lessons";
  if (key === "blogs") return "Article";
  if (key === "currentAffairs") return "Current Affairs";
  if (key === "videos") return "Lecture Video";
  return "Notice";
}

function resourceMeta(key, item) {
  if (key === "notes" || key === "videos") return [item.subject, item.chapter, item.class_level ? `Class ${item.class_level}` : ""].filter(Boolean).join(" / ");
  if (key === "notices") return [item.class_level === "all" ? "All classes" : item.class_level ? `Class ${item.class_level}` : "", formatDate(item.created_at)].filter(Boolean).join(" / ");
  return [item.category, formatDate(item.published_on || item.created_at)].filter(Boolean).join(" / ");
}

function searchableText(item) {
  return [item.title, item.subject, item.chapter, item.category, item.description, item.summary, item.content, item.body, item.class_level].filter(Boolean).join(" ").toLowerCase();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function youtubeId(url) {
  if (!url) return "";
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
  return match?.[1] || "";
}

function embedUrl(url) {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : "";
}

function thumbnailUrl(url) {
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : "";
}

const learningHubStyles = `
.learning-hub {
  min-height: calc(100vh - 112px);
  margin: -8px;
  padding: clamp(16px, 2.4vw, 28px);
  border-radius: 24px;
  background:
    radial-gradient(circle at 16% 8%, rgba(214,31,58,.22), transparent 30%),
    radial-gradient(circle at 84% 10%, rgba(14,165,233,.12), transparent 28%),
    linear-gradient(145deg, #101217, #171a22 48%, #0f1217);
  color: #f8fafc;
  animation: learningPageIn 320ms ease both;
}
.learning-title-row {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}
.learning-title-row h1, .detail-head h1 {
  margin: 0 0 8px;
  color: #ffffff;
  font-size: clamp(30px, 5vw, 46px);
  line-height: 1.05;
  letter-spacing: 0;
}
.learning-title-row p, .detail-head p {
  margin: 0;
  max-width: 680px;
  color: #d1d5db;
  line-height: 1.6;
}
.student-pill {
  min-width: 190px;
  display: grid;
  gap: 3px;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.075);
  box-shadow: 0 16px 46px rgba(0,0,0,.22);
}
.student-pill span { color: #ffffff; font-weight: 850; }
.student-pill strong { color: #d1d5db; font-size: 13px; }
.learning-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.learning-card {
  min-height: 292px;
  display: grid;
  grid-template-rows: auto auto 1fr auto auto;
  gap: 14px;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--course-accent), transparent 62%);
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--course-accent), transparent 78%), transparent 38%),
    linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
  box-shadow: 0 22px 70px rgba(0,0,0,.24);
  backdrop-filter: blur(22px);
  animation: learningCardIn 340ms ease both;
  animation-delay: calc(var(--stagger, 0) * 60ms);
}
.learning-card:nth-child(4) { margin-left: 18%; }
.learning-card h2 {
  margin: 0;
  color: #ffffff;
  font-size: 21px;
  letter-spacing: 0;
}
.learning-card p {
  margin: 0;
  color: #d1d5db;
  line-height: 1.55;
}
.learning-card-icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: #ffffff;
  background: linear-gradient(135deg, var(--course-accent), color-mix(in srgb, var(--course-accent), #111827 36%));
  box-shadow: 0 16px 34px color-mix(in srgb, var(--course-accent), transparent 72%);
}
.learning-count {
  color: #ffffff;
  font-size: 17px;
}
.learning-card-footer {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}
.count-ring {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  color: #ffffff;
  background: radial-gradient(circle at center, #111827 52%, transparent 53%), conic-gradient(var(--course-accent) 75%, rgba(255,255,255,.14) 0);
}
.count-ring strong { font-size: 15px; }
.continue-button, .back-link, .filter-button, .resource-action {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  color: #ffffff;
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(135deg, #d61f3a, #9d1430);
  box-shadow: 0 16px 34px rgba(214,31,58,.22);
  padding: 0 14px;
  font-weight: 850;
}
.detail-head {
  display: grid;
  gap: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(255,255,255,.12);
}
.back-link {
  width: fit-content;
  background: rgba(255,255,255,.08);
  box-shadow: none;
}
.detail-title {
  display: flex;
  align-items: center;
  gap: 16px;
}
.detail-icon {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--course-accent), transparent 72%);
  color: #ffffff;
  border: 1px solid color-mix(in srgb, var(--course-accent), transparent 44%);
}
.detail-tools {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  gap: 12px;
  margin: 18px 0;
}
.detail-search {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.075);
}
.detail-search input {
  border: 0;
  padding: 0;
  background: transparent;
  color: #ffffff;
}
.detail-search input::placeholder { color: #9ca3af; }
.filter-button {
  background: rgba(255,255,255,.075);
  box-shadow: none;
}
.resource-layout, .video-layout {
  display: grid;
  grid-template-columns: minmax(260px, .85fr) minmax(0, 1.25fr);
  gap: 18px;
}
.video-layout { grid-template-columns: minmax(340px, .95fr) minmax(0, 1.05fr); }
.resource-list-panel, .resource-detail-panel, .video-list-panel, .video-player-panel, .publish-panel {
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.10);
  background: linear-gradient(145deg, rgba(255,255,255,.10), rgba(255,255,255,.045));
  box-shadow: 0 22px 70px rgba(0,0,0,.22);
  backdrop-filter: blur(22px);
  padding: 18px;
}
.resource-list-panel h2, .video-list-panel h2, .publish-panel h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  color: #ffffff;
  font-size: 17px;
}
.resource-list, .video-list {
  display: grid;
  gap: 10px;
}
.resource-list-item, .video-row {
  width: 100%;
  min-height: 66px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px;
  padding: 12px;
  background: rgba(255,255,255,.065);
  color: #ffffff;
  text-align: left;
  cursor: pointer;
}
.resource-list-item.active, .video-row.active {
  border-color: rgba(214,31,58,.72);
  background: rgba(214,31,58,.12);
}
.resource-list-item > span {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(255,255,255,.10);
  font-weight: 900;
}
.resource-list-item strong, .video-row strong {
  display: block;
  overflow-wrap: anywhere;
}
.resource-list-item small, .video-row small, .video-row em {
  display: block;
  margin-top: 4px;
  color: #aeb6c4;
  font-style: normal;
  line-height: 1.35;
}
.video-row {
  grid-template-columns: 112px minmax(0, 1fr);
}
.mini-thumb {
  height: 64px;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(214,31,58,.26), rgba(14,165,233,.18)),
    #111827;
  background-position: center;
  background-size: cover;
  position: relative;
  overflow: hidden;
}
.mini-thumb span {
  position: absolute;
  left: 7px;
  top: 7px;
  min-width: 26px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: #111827;
  color: #ffffff;
  font-size: 12px;
  font-weight: 950;
  border: 1px solid rgba(255,255,255,.12);
}
.video-stage {
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: #070a10;
}
.video-stage iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
.video-placeholder {
  height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: #ffffff;
}
.selected-resource {
  display: grid;
  gap: 14px;
}
.selected-resource header {
  display: grid;
  gap: 6px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255,255,255,.10);
}
.selected-resource header span {
  width: fit-content;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  background: rgba(214,31,58,.16);
  color: #fecdd3;
  font-size: 12px;
  font-weight: 900;
}
.selected-resource h2 {
  margin: 0;
  color: #ffffff;
  font-size: clamp(22px, 3vw, 32px);
  letter-spacing: 0;
}
.selected-resource p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.65;
  white-space: pre-wrap;
}
.detail-section {
  display: grid;
  gap: 9px;
  padding: 14px;
  border-radius: 10px;
  background: rgba(8,10,15,.34);
  border: 1px solid rgba(255,255,255,.08);
}
.detail-section h3 {
  margin: 0;
  color: #ffffff;
  font-size: 15px;
  letter-spacing: 0;
}
.resource-action {
  width: fit-content;
}
.muted-line { color: #aeb6c4; }
.meta-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.meta-tile {
  display: grid;
  gap: 3px;
}
.meta-tile span {
  color: #9ca3af;
  font-size: 12px;
  font-weight: 850;
}
.meta-tile strong {
  color: #ffffff;
  overflow-wrap: anywhere;
}
.publish-panel {
  margin-top: 18px;
}
.publish-panel.compact {
  margin: 0 0 18px;
}
.learning-hub input,
.learning-hub select,
.learning-hub textarea {
  color: #f8fafc;
  background: rgba(10,12,18,.58);
  border-color: rgba(255,255,255,.12);
}
.learning-hub input::placeholder,
.learning-hub textarea::placeholder { color: #778195; }
.learning-hub .primary {
  background: linear-gradient(135deg, #d61f3a, #8f1026);
}
.learning-hub .secondary,
.learning-hub .icon-button {
  background: rgba(255,255,255,.09);
  color: #f8fafc;
  border-color: rgba(255,255,255,.12);
}
.learning-hub .empty-state { color: #aeb6c4; }
.learning-hub .empty-state strong { color: #ffffff; }
.manage-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 10px;
  padding: 12px;
  background: rgba(255,255,255,.055);
  border: 1px solid rgba(255,255,255,.08);
}
.manage-card > span { color: #cbd5e1; font-weight: 850; }
.manage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.editing-item {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.editing-item textarea, .editing-item .manage-actions {
  grid-column: 1 / -1;
}
@keyframes learningPageIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes learningCardIn { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (max-width: 1180px) {
  .learning-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .learning-card:nth-child(4) { margin-left: 0; }
  .resource-layout, .video-layout { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .learning-hub { margin: 0; padding: 14px; border-radius: 18px; }
  .learning-title-row, .detail-title { flex-direction: column; }
  .student-pill { width: 100%; }
  .learning-card-grid, .detail-tools, .meta-grid { grid-template-columns: 1fr; }
  .learning-card { min-height: 260px; }
  .learning-card-footer { grid-template-columns: 1fr; }
  .count-ring { display: none; }
  .continue-button, .resource-action { width: 100%; }
  .video-row { grid-template-columns: 96px minmax(0, 1fr); }
  .mini-thumb { height: 58px; }
  .editing-item { grid-template-columns: 1fr; }
}

html[data-theme="light"] .learning-hub {
  color: #172033;
  background:
    radial-gradient(circle at 16% 8%, rgba(214,31,58,.10), transparent 30%),
    radial-gradient(circle at 84% 10%, rgba(14,165,233,.08), transparent 28%),
    linear-gradient(145deg, #f8fafc, #ffffff 48%, #f7f9fc);
  border: 1px solid rgba(203,213,225,.78);
  box-shadow: 0 24px 70px rgba(15,23,42,.08);
}
html[data-theme="light"] .learning-hub .learning-title-row h1,
html[data-theme="light"] .learning-hub .detail-head h1,
html[data-theme="light"] .learning-hub .learning-card h2,
html[data-theme="light"] .learning-hub .learning-count,
html[data-theme="light"] .learning-hub .resource-list-panel h2,
html[data-theme="light"] .learning-hub .video-list-panel h2,
html[data-theme="light"] .learning-hub .publish-panel h2,
html[data-theme="light"] .learning-hub .resource-list-item,
html[data-theme="light"] .learning-hub .video-row,
html[data-theme="light"] .learning-hub .selected-resource h2,
html[data-theme="light"] .learning-hub .detail-section h3,
html[data-theme="light"] .learning-hub .meta-tile strong,
html[data-theme="light"] .learning-hub .empty-state strong { color: #172033; }
html[data-theme="light"] .learning-hub .learning-title-row p,
html[data-theme="light"] .learning-hub .detail-head p,
html[data-theme="light"] .learning-hub .learning-card p,
html[data-theme="light"] .learning-hub .resource-list-item small,
html[data-theme="light"] .learning-hub .video-row small,
html[data-theme="light"] .learning-hub .video-row em,
html[data-theme="light"] .learning-hub .selected-resource p,
html[data-theme="light"] .learning-hub .muted-line,
html[data-theme="light"] .learning-hub .meta-tile span,
html[data-theme="light"] .learning-hub .empty-state { color: #64748b; }
html[data-theme="light"] .learning-hub .student-pill,
html[data-theme="light"] .learning-hub .learning-card,
html[data-theme="light"] .learning-hub .resource-list-panel,
html[data-theme="light"] .learning-hub .resource-detail-panel,
html[data-theme="light"] .learning-hub .video-list-panel,
html[data-theme="light"] .learning-hub .video-player-panel,
html[data-theme="light"] .learning-hub .publish-panel {
  color: #172033;
  border-color: rgba(203,213,225,.82);
  background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(248,250,252,.94));
  box-shadow: 0 20px 56px rgba(15,23,42,.09);
}
html[data-theme="light"] .learning-hub .student-pill span { color: #172033; }
html[data-theme="light"] .learning-hub .student-pill strong { color: #64748b; }
html[data-theme="light"] .learning-hub .learning-card {
  border-color: color-mix(in srgb, var(--course-accent), transparent 68%);
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--course-accent), transparent 88%), transparent 38%),
    linear-gradient(145deg, rgba(255,255,255,.98), rgba(248,250,252,.94));
}
html[data-theme="light"] .learning-hub .count-ring { background: radial-gradient(circle at center, #ffffff 52%, transparent 53%), conic-gradient(var(--course-accent) 75%, #e2e8f0 0); }
html[data-theme="light"] .learning-hub .count-ring strong { color: #172033; }
html[data-theme="light"] .learning-hub .detail-head { border-bottom-color: rgba(203,213,225,.82); }
html[data-theme="light"] .learning-hub .back-link,
html[data-theme="light"] .learning-hub .filter-button,
html[data-theme="light"] .learning-hub .secondary,
html[data-theme="light"] .learning-hub .icon-button {
  color: #334155;
  background: #ffffff;
  border-color: rgba(203,213,225,.9);
}
html[data-theme="light"] .learning-hub .detail-search,
html[data-theme="light"] .learning-hub .resource-list-item,
html[data-theme="light"] .learning-hub .video-row,
html[data-theme="light"] .learning-hub .detail-section,
html[data-theme="light"] .learning-hub .manage-card {
  color: #172033;
  background: #f8fafc;
  border-color: rgba(203,213,225,.76);
}
html[data-theme="light"] .learning-hub .resource-list-item.active,
html[data-theme="light"] .learning-hub .video-row.active { background: #fff1f2; border-color: rgba(214,31,58,.46); }
html[data-theme="light"] .learning-hub .resource-list-item > span { color: #334155; background: #e2e8f0; }
html[data-theme="light"] .learning-hub .detail-search input,
html[data-theme="light"] .learning-hub input,
html[data-theme="light"] .learning-hub select,
html[data-theme="light"] .learning-hub textarea {
  color: #172033;
  background: #ffffff;
  border-color: rgba(203,213,225,.9);
}
html[data-theme="light"] .learning-hub .detail-search input { background: transparent; }
html[data-theme="light"] .learning-hub input::placeholder,
html[data-theme="light"] .learning-hub textarea::placeholder { color: #94a3b8; }
html[data-theme="light"] .learning-hub .selected-resource header { border-bottom-color: rgba(203,213,225,.76); }
html[data-theme="light"] .learning-hub .selected-resource header span { color: #9d1430; background: #fff1f2; }
html[data-theme="light"] .learning-hub .manage-card > span { color: #475569; }
`;
