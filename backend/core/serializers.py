from datetime import datetime


def oid(value):
    return str(value.id) if value else None


def dt(value):
    return value.isoformat() if value else None


def user_json(user):
    return {
        "id": oid(user),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "approved": user.approved,
        "first_login": user.first_login,
        "force_password_change": user.force_password_change,
    }


def student_json(student):
    return {
        "id": oid(student),
        "user_id": oid(student.user),
        "student_id": student.student_id,
        "name": student.name,
        "email": student.email,
        "class_level": student.class_level,
        "division": student.division,
        "roll_number": student.roll_number,
        "profile_photo": student.profile_photo,
    }


def teacher_json(teacher):
    return {
        "id": oid(teacher),
        "user_id": oid(teacher.user),
        "teacher_id": teacher.teacher_id,
        "name": teacher.name,
        "email": teacher.email,
        "subjects": teacher.subjects,
        "assigned_classes": teacher.assigned_classes,
    }


def attendance_json(row):
    return {
        "id": oid(row),
        "student": student_json(row.student) if row.student else None,
        "class_level": row.class_level,
        "date": dt(row.date),
        "status": row.status,
        "marked_by": user_json(row.marked_by) if row.marked_by else None,
        "created_at": dt(row.created_at),
        "updated_at": dt(getattr(row, "updated_at", None)),
    }


def marks_json(row):
    percent = round((row.marks_obtained / row.max_marks) * 100, 2) if row.max_marks else 0
    return {
        "id": oid(row),
        "student": student_json(row.student) if row.student else None,
        "class_level": row.class_level,
        "subject": row.subject,
        "exam_type": row.exam_type,
        "marks_obtained": row.marks_obtained,
        "max_marks": row.max_marks,
        "percentage": percent,
    }


def notice_json(row):
    return {
        "id": oid(row),
        "title": row.title,
        "body": row.body,
        "class_level": row.class_level,
        "created_at": dt(row.created_at),
    }


def timetable_json(row):
    return {
        "id": oid(row),
        "class_level": row.class_level,
        "periods": [period.to_mongo().to_dict() for period in row.periods],
    }


def simple_json(row, fields):
    data = {"id": oid(row)}
    for field in fields:
        value = getattr(row, field)
        data[field] = dt(value) if isinstance(value, datetime) else value
    return data
