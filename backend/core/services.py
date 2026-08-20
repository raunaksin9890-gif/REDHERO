from datetime import datetime

from django.utils import timezone

from .models import Counter


def next_code(name, prefix):
    counter = Counter.objects(name=name).modify(upsert=True, new=True, inc__value=1)
    return f"{prefix}{counter.value:05d}"


def parse_date(value):
    if isinstance(value, datetime):
        parsed = value
    elif not value:
        parsed = timezone.localtime()
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if timezone.is_aware(parsed):
        parsed = timezone.localtime(parsed)
        return timezone.make_naive(parsed, timezone.get_default_timezone())
    return parsed


def schedule_time(value):
    if not value:
        return timezone.localtime()
    if timezone.is_aware(value):
        return timezone.localtime(value)
    return timezone.make_aware(value, timezone.get_default_timezone())


def schedule_now():
    return timezone.localtime()


def store_schedule_time(value):
    return timezone.make_naive(schedule_time(value), timezone.get_default_timezone())


def class_filter_for(user, student=None):
    if user.role == "student" and student:
        return student.class_level
    return None
