from datetime import datetime

from .models import Notification, Student


def notify_student(student, notification_type, title, message, target_url="", tone="red", icon="bell", related_object_id=""):
    if not student or not student.user:
        return None
    now = datetime.utcnow()
    related_id = str(related_object_id or "")
    existing = None
    if related_id:
        existing = Notification.objects(
            recipient=student.user,
            notification_type=notification_type,
            related_object_id=related_id,
        ).first()
    if existing:
        existing.update(
            title=title,
            message=message,
            target_url=target_url,
            tone=tone,
            icon=icon,
            is_read=False,
            dismissed=False,
            created_at=now,
            updated_at=now,
        )
        return Notification.objects(id=existing.id).first()
    return Notification(
        recipient=student.user,
        notification_type=notification_type,
        title=title,
        message=message,
        target_url=target_url,
        tone=tone,
        icon=icon,
        related_object_id=related_id,
        created_at=now,
        updated_at=now,
    ).save()


def notify_students_for_class(class_level, notification_type, title, message, target_url="", tone="red", icon="bell", related_object_id=""):
    class_value = str(class_level or "")
    students = Student.objects if class_value == "all" else Student.objects(class_level=class_value)
    count = 0
    for student in students:
        if notify_student(student, notification_type, title, message, target_url, tone, icon, related_object_id):
            count += 1
    return count


def notify_all_students(notification_type, title, message, target_url="", tone="red", icon="bell", related_object_id=""):
    return notify_students_for_class("all", notification_type, title, message, target_url, tone, icon, related_object_id)
