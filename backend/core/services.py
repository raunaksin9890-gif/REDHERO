from datetime import datetime

from .models import Counter


def next_code(name, prefix):
    counter = Counter.objects(name=name).modify(upsert=True, new=True, inc__value=1)
    return f"{prefix}{counter.value:05d}"


def parse_date(value):
    if isinstance(value, datetime):
        return value
    if not value:
        return datetime.utcnow()
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)


def class_filter_for(user, student=None):
    if user.role == "student" and student:
        return student.class_level
    return None
