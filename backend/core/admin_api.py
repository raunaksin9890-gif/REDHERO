import os
from datetime import date, datetime, timedelta
from uuid import uuid4

from mongoengine.errors import NotUniqueError, ValidationError
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .models import (
    Assignment,
    Attendance,
    Blog,
    CurrentAffair,
    DEFAULT_PASSWORD,
    Exam,
    ExamAnswer,
    ExamAttempt,
    ExamQuestion,
    Fee,
    Marks,
    Note,
    Notice,
    PracticeAnswer,
    PracticeSession,
    QuestionBankQuestion,
    ROLE_ADMIN,
    ROLE_STUDENT,
    ROLE_TEACHER,
    Student,
    StudentMistake,
    StudyPlan,
    StudyPlanTask,
    Teacher,
    Timetable,
    TimetablePeriod,
    TopicPerformance,
    User,
    Video,
)
from .notifications import notify_all_students, notify_student, notify_students_for_class
from .security import current_user, hash_password, require_roles
from .services import next_code, parse_date


def ok(data=None, http_status=status.HTTP_200_OK):
    return Response(data or {}, status=http_status)


def bad(message, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=http_status)


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
        "force_password_change": user.force_password_change,
    } if user else None


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


def simple_json(row, fields):
    data = {"id": oid(row)}
    for field in fields:
        value = getattr(row, field)
        data[field] = dt(value) if isinstance(value, datetime) else value
    return data


def get_student_for_user(user):
    return Student.objects(user=user).first()


def get_teacher_for_user(user):
    return Teacher.objects(user=user).first()


def teacher_classes(user):
    teacher = get_teacher_for_user(user)
    return teacher.assigned_classes if teacher else []


def teacher_subjects(user):
    teacher = get_teacher_for_user(user)
    return teacher.subjects if teacher else []


def enforce_teacher_class(user, class_level):
    if user.role == ROLE_TEACHER and str(class_level) not in teacher_classes(user):
        raise PermissionDenied("Teachers can only access assigned classes")


def enforce_teacher_subject(user, subject):
    subjects = [item.lower() for item in teacher_subjects(user)]
    if user.role == ROLE_TEACHER and subjects and str(subject).lower() not in subjects:
        raise PermissionDenied("Teachers can only access assigned subjects")


def enforce_teacher_question_scope(user, class_level, subject):
    enforce_teacher_class(user, class_level)
    enforce_teacher_subject(user, subject)


def enforce_teacher_student(user, student):
    if user.role == ROLE_TEACHER and (not student or student.class_level not in teacher_classes(user)):
        raise PermissionDenied("Teachers can only access assigned classes")


def enforce_owner(user, row, field):
    if user.role == ROLE_TEACHER and getattr(row, field) != user:
        raise PermissionDenied("Teachers can only manage their own content")


def attendance_lock_collection():
    return Attendance._get_db()["AttendanceLocks"]


def attendance_audit_collection():
    return Attendance._get_db()["AttendanceAuditLogs"]


def validate_password_strength(password):
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not any(char.isupper() for char in password):
        return "Password must include an uppercase letter"
    if not any(char.islower() for char in password):
        return "Password must include a lowercase letter"
    if not any(char.isdigit() for char in password):
        return "Password must include a number"
    if not any(not char.isalnum() for char in password):
        return "Password must include a special character"
    return ""


def is_locked(row):
    if not row:
        return False
    return bool(attendance_lock_collection().find_one({"attendance_id": oid(row), "locked": True}))


def set_locked(row, user, locked):
    now = datetime.utcnow()
    attendance_lock_collection().update_one(
        {"attendance_id": oid(row)},
        {
            "$set": {
                "attendance_id": oid(row),
                "student_id": oid(row.student),
                "student_name": row.student.name if row.student else "",
                "class_level": row.class_level,
                "date": row.date,
                "locked": locked,
                "updated_by": oid(user),
                "updated_by_name": user.name,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    log_attendance("lock" if locked else "unlock", user, row)


def log_attendance(action, user, row, before=None, after=None):
    attendance_audit_collection().insert_one(
        {
            "attendance_id": oid(row),
            "student_id": oid(row.student),
            "student_name": row.student.name if row.student else "",
            "class_level": row.class_level,
            "date": row.date,
            "action": action,
            "before": before or {},
            "after": after or {},
            "performed_by": oid(user),
            "performed_by_name": user.name,
            "performed_by_role": user.role,
            "created_at": datetime.utcnow(),
        }
    )


def attendance_json(row):
    return {
        "id": oid(row),
        "student": student_json(row.student) if row.student else None,
        "class_level": row.class_level,
        "date": dt(row.date),
        "status": row.status,
        "marked_by": user_json(row.marked_by),
        "created_at": dt(row.created_at),
        "updated_at": dt(getattr(row, "updated_at", None)),
        "locked": is_locked(row),
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
    return {"id": oid(row), "class_level": row.class_level, "periods": [period.to_mongo().to_dict() for period in row.periods]}


def scoped_students(user):
    if user.role == ROLE_TEACHER:
        return Student.objects(class_level__in=teacher_classes(user))
    if user.role == ROLE_STUDENT:
        return Student.objects(user=user)
    return Student.objects


@api_view(["GET"])
def users(request):
    require_roles(request, [ROLE_ADMIN])
    return ok({"results": [user_json(user) for user in User.objects.order_by("-created_at")]})


@api_view(["POST"])
def reset_password(request, user_id):
    require_roles(request, [ROLE_ADMIN])
    target = User.objects(id=user_id).first()
    if not target:
        return bad("User not found", status.HTTP_404_NOT_FOUND)
    new_password = request.data.get("new_password") or DEFAULT_PASSWORD
    confirm_password = request.data.get("confirm_password", new_password)
    if new_password != confirm_password:
        return bad("Confirm password does not match")
    if new_password != DEFAULT_PASSWORD:
        strength_error = validate_password_strength(new_password)
        if strength_error:
            return bad(strength_error)
    force_change = bool(request.data.get("force_password_change", new_password == DEFAULT_PASSWORD))
    target.update(password_hash=hash_password(new_password), first_login=force_change, force_password_change=force_change, updated_at=datetime.utcnow())
    if new_password == DEFAULT_PASSWORD:
        return ok({"message": "Password reset to default", "default_password": DEFAULT_PASSWORD})
    return ok({"message": "Password updated successfully"})


@api_view(["POST"])
def force_password_change(request, user_id):
    require_roles(request, [ROLE_ADMIN])
    target = User.objects(id=user_id).first()
    if not target:
        return bad("User not found", status.HTTP_404_NOT_FOUND)
    target.update(force_password_change=True, updated_at=datetime.utcnow())
    return ok({"message": "Password change required on next login"})


@api_view(["GET"])
def dashboard(request):
    user = current_user(request)
    if user.role == ROLE_TEACHER:
        assigned = teacher_classes(user)
        return ok(
            {
                "assigned_classes": assigned,
                "students": Student.objects(class_level__in=assigned).count(),
                "recent_notices": [notice_json(row) for row in Notice.objects(class_level__in=assigned + ["all"]).order_by("-created_at")[:5]],
            }
        )
    if user.role == ROLE_STUDENT:
        student = get_student_for_user(user)
        attendance_rows = list(Attendance.objects(student=student))
        present = len([row for row in attendance_rows if row.status == "present"])
        return ok(
            {
                "profile": student_json(student),
                "attendance_percentage": round((present / len(attendance_rows)) * 100, 2) if attendance_rows else 0,
                "marks": [marks_json(row) for row in Marks.objects(student=student).order_by("-created_at")[:5]],
                "latest_notices": [notice_json(row) for row in Notice.objects(class_level__in=[student.class_level, "all"]).order_by("-created_at")[:5]],
                "current_affairs": [simple_json(row, ["title", "summary", "category", "published_on"]) for row in CurrentAffair.objects.order_by("-published_on")[:4]],
                "recent_videos": [simple_json(row, ["title", "class_level", "subject", "chapter", "youtube_url"]) for row in Video.objects(class_level=student.class_level).order_by("-created_at")[:4]],
            }
        )
    return ok(
        {
            "total_students": Student.objects.count(),
            "total_teachers": Teacher.objects.count(),
            "total_notes": Note.objects.count(),
            "total_videos": Video.objects.count(),
            "attendance_records": Attendance.objects.count(),
            "marks_records": Marks.objects.count(),
            "total_assignments": Assignment.objects.count(),
            "total_blogs": Blog.objects.count(),
            "total_current_affairs": CurrentAffair.objects.count(),
            "recent_notices": [notice_json(row) for row in Notice.objects.order_by("-created_at")[:5]],
        }
    )


@api_view(["GET", "POST"])
def students(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    if request.method == "GET":
        return ok({"results": [student_json(row) for row in scoped_students(user).order_by("student_id")]})
    require_roles(request, [ROLE_ADMIN])
    data = request.data
    try:
        created_user = User(
            email=data["email"].lower().strip(),
            name=data["name"].strip(),
            role=ROLE_STUDENT,
            password_hash=hash_password(DEFAULT_PASSWORD),
            approved=True,
            first_login=True,
            force_password_change=True,
        ).save()
        row = Student(
            user=created_user,
            student_id=next_code("student", "R"),
            name=data["name"],
            email=data["email"].lower().strip(),
            class_level=str(data["class_level"]),
            division=data.get("division", ""),
            roll_number=str(data.get("roll_number", "")),
            profile_photo=data.get("profile_photo", ""),
        ).save()
    except (KeyError, NotUniqueError, ValidationError) as exc:
        return bad(str(exc))
    return ok({"student": student_json(row), "default_password": DEFAULT_PASSWORD}, status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
def student_detail(request, student_id):
    require_roles(request, [ROLE_ADMIN])
    row = Student.objects(id=student_id).first()
    if not row:
        return bad("Student not found", status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        row.user.delete()
        return ok({"message": "Student deleted"})
    data = request.data
    row.update(
        name=data.get("name", row.name),
        class_level=str(data.get("class_level", row.class_level)),
        division=data.get("division", row.division),
        roll_number=str(data.get("roll_number", row.roll_number)),
        profile_photo=data.get("profile_photo", row.profile_photo),
    )
    row.user.update(name=data.get("name", row.name), updated_at=datetime.utcnow())
    return ok({"student": student_json(Student.objects(id=student_id).first())})


@api_view(["GET", "POST"])
def teachers(request):
    require_roles(request, [ROLE_ADMIN])
    if request.method == "GET":
        return ok({"results": [teacher_json(row) for row in Teacher.objects.order_by("teacher_id")]})
    data = request.data
    try:
        created_user = User(
            email=data["email"].lower().strip(),
            name=data["name"].strip(),
            role=ROLE_TEACHER,
            password_hash=hash_password(DEFAULT_PASSWORD),
            approved=True,
            first_login=True,
            force_password_change=True,
        ).save()
        row = Teacher(
            user=created_user,
            teacher_id=next_code("teacher", "T"),
            name=data["name"],
            email=data["email"].lower().strip(),
            subjects=data.get("subjects", []),
            assigned_classes=[str(item) for item in data.get("assigned_classes", [])],
        ).save()
    except (KeyError, NotUniqueError, ValidationError) as exc:
        return bad(str(exc))
    return ok({"teacher": teacher_json(row), "default_password": DEFAULT_PASSWORD}, status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
def teacher_detail(request, teacher_id):
    require_roles(request, [ROLE_ADMIN])
    row = Teacher.objects(id=teacher_id).first()
    if not row:
        return bad("Teacher not found", status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        row.user.delete()
        return ok({"message": "Teacher deleted"})
    data = request.data
    row.update(
        name=data.get("name", row.name),
        subjects=data.get("subjects", row.subjects),
        assigned_classes=[str(item) for item in data.get("assigned_classes", row.assigned_classes)],
    )
    row.user.update(name=data.get("name", row.name), updated_at=datetime.utcnow())
    return ok({"teacher": teacher_json(Teacher.objects(id=teacher_id).first())})


@api_view(["GET", "POST", "PUT", "DELETE"])
def attendance(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    if request.method == "GET":
        if user.role == ROLE_STUDENT:
            rows = Attendance.objects(student=get_student_for_user(user)).order_by("-date")
        elif user.role == ROLE_TEACHER:
            rows = Attendance.objects(class_level__in=teacher_classes(user)).order_by("-date")
        else:
            rows = Attendance.objects.order_by("-date")
        return ok({"results": [attendance_json(row) for row in rows]})
    require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    data = request.data
    if request.method in ["PUT", "DELETE"]:
        row = Attendance.objects(id=data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Attendance not found", status.HTTP_404_NOT_FOUND)
        enforce_teacher_class(user, row.class_level)
        if is_locked(row) and user.role != ROLE_ADMIN:
            return bad("Attendance record is locked", status.HTTP_403_FORBIDDEN)
        if request.method == "DELETE":
            require_roles(request, [ROLE_ADMIN])
            before = attendance_json(row)
            row.delete()
            log_attendance("delete", user, row, before=before)
            return ok({"message": "Attendance deleted"})
        before = attendance_json(row)
        row.update(status=data.get("status", row.status), marked_by=user, updated_at=datetime.utcnow())
        updated = Attendance.objects(id=row.id).first()
        log_attendance("update", user, updated, before=before, after=attendance_json(updated))
        notify_student(
            updated.student,
            "attendance",
            "Attendance",
            f"Your attendance for {updated.date.strftime('%d %b %Y')} was updated.",
            "/operations",
            "green",
            "attendance",
            updated.id,
        )
        return ok({"attendance": attendance_json(updated)})
    student = Student.objects(id=data.get("student")).first()
    if not student:
        return bad("Student not found", status.HTTP_404_NOT_FOUND)
    enforce_teacher_student(user, student)
    date = parse_date(data.get("date"))
    row = Attendance.objects(student=student, date=date).first()
    if row and is_locked(row) and user.role != ROLE_ADMIN:
        return bad("Attendance record is locked", status.HTTP_403_FORBIDDEN)
    now = datetime.utcnow()
    row = Attendance.objects(student=student, date=date).modify(
        upsert=True,
        new=True,
        set__class_level=student.class_level,
        set__status=data.get("status", "present"),
        set__marked_by=user,
        set__updated_at=now,
        set_on_insert__created_at=now,
    )
    log_attendance("create", user, row, after=attendance_json(row))
    notify_student(
        row.student,
        "attendance",
        "Attendance",
        f"Your attendance for {row.date.strftime('%d %b %Y')} was marked.",
        "/operations",
        "green",
        "attendance",
        row.id,
    )
    return ok({"message": "Attendance saved", "attendance": attendance_json(row)}, status.HTTP_201_CREATED)


@api_view(["POST"])
def attendance_lock(request, attendance_id):
    user = require_roles(request, [ROLE_ADMIN])
    row = Attendance.objects(id=attendance_id).first()
    if not row:
        return bad("Attendance not found", status.HTTP_404_NOT_FOUND)
    set_locked(row, user, True)
    return ok({"message": "Attendance locked", "attendance": attendance_json(row)})


@api_view(["POST"])
def attendance_unlock(request, attendance_id):
    user = require_roles(request, [ROLE_ADMIN])
    row = Attendance.objects(id=attendance_id).first()
    if not row:
        return bad("Attendance not found", status.HTTP_404_NOT_FOUND)
    set_locked(row, user, False)
    return ok({"message": "Attendance unlocked", "attendance": attendance_json(row)})


@api_view(["GET"])
def attendance_audit(request):
    require_roles(request, [ROLE_ADMIN])
    query = {}
    for key in ["class_level", "action", "student_id", "attendance_id"]:
        value = request.GET.get(key)
        if value:
            query[key] = value
    rows = list(attendance_audit_collection().find(query).sort("created_at", -1).limit(200))
    for row in rows:
        row["id"] = str(row.pop("_id"))
        for field in ["date", "created_at"]:
            row[field] = dt(row.get(field))
    return ok({"results": rows})


@api_view(["GET", "POST", "PUT", "DELETE"])
def marks(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    if request.method == "GET":
        if user.role == ROLE_STUDENT:
            rows = Marks.objects(student=get_student_for_user(user))
        elif user.role == ROLE_TEACHER:
            rows = Marks.objects(class_level__in=teacher_classes(user))
        else:
            rows = Marks.objects
        return ok({"results": [marks_json(row) for row in rows.order_by("-created_at")]})
    require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    data = request.data
    if request.method in ["PUT", "DELETE"]:
        row = Marks.objects(id=data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Marks not found", status.HTTP_404_NOT_FOUND)
        enforce_teacher_class(user, row.class_level)
        if request.method == "DELETE":
            require_roles(request, [ROLE_ADMIN])
            row.delete()
            return ok({"message": "Marks deleted"})
        row.update(
            subject=data.get("subject", row.subject),
            exam_type=data.get("exam_type", row.exam_type),
            marks_obtained=float(data.get("marks_obtained", row.marks_obtained)),
            max_marks=float(data.get("max_marks", row.max_marks)),
            added_by=user,
        )
        updated = Marks.objects(id=row.id).first()
        notify_student(
            updated.student,
            "marks",
            "Marks",
            f"{updated.subject} {updated.exam_type} marks are available.",
            "/operations",
            "blue",
            "marks",
            updated.id,
        )
        return ok({"marks": marks_json(updated)})
    student = Student.objects(id=data.get("student")).first()
    if not student:
        return bad("Student not found", status.HTTP_404_NOT_FOUND)
    enforce_teacher_student(user, student)
    row = Marks(
        student=student,
        class_level=student.class_level,
        subject=data.get("subject"),
        exam_type=data.get("exam_type"),
        marks_obtained=float(data.get("marks_obtained")),
        max_marks=float(data.get("max_marks")),
        added_by=user,
    ).save()
    notify_student(
        row.student,
        "marks",
        "Marks",
        f"{row.subject} {row.exam_type} marks are available.",
        "/operations",
        "blue",
        "marks",
        row.id,
    )
    return ok({"marks": marks_json(row)}, status.HTTP_201_CREATED)


def class_query(request, model):
    user = current_user(request)
    class_level = request.GET.get("class_level")
    query = model.objects
    if user.role == ROLE_STUDENT:
        student = get_student_for_user(user)
        query = query(class_level__in=[student.class_level, "all"] if model == Notice else [student.class_level])
    elif user.role == ROLE_TEACHER:
        allowed = teacher_classes(user) + (["all"] if model == Notice else [])
        query = query(class_level__in=allowed)
        if class_level:
            query = query(class_level=class_level) if class_level in allowed else query(class_level="__none__")
    elif class_level:
        query = query(class_level=class_level)
    return user, query


def content_view(model, fields, owner_field):
    @api_view(["GET", "POST", "PUT", "DELETE"])
    def handler(request):
        user, query = class_query(request, model)
        if request.method == "GET":
            return ok({"results": [simple_json(row, fields) for row in query.order_by("-created_at")]})
        require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
        data = request.data
        if request.method in ["PUT", "DELETE"]:
            row = model.objects(id=data.get("id") or request.GET.get("id")).first()
            if not row:
                return bad("Item not found", status.HTTP_404_NOT_FOUND)
            if hasattr(row, "class_level"):
                enforce_teacher_class(user, row.class_level)
            enforce_owner(user, row, owner_field)
            if request.method == "DELETE":
                row.delete()
                return ok({"message": "Item deleted"})
            payload = {field: data.get(field, getattr(row, field)) for field in fields if field != "created_at"}
            if "class_level" in payload:
                payload["class_level"] = str(payload["class_level"])
                enforce_teacher_class(user, payload["class_level"])
            row.update(**{f"set__{key}": value for key, value in payload.items()})
            return ok({"item": simple_json(model.objects(id=row.id).first(), fields)})
        payload = {field: data.get(field) for field in fields if field != "created_at"}
        if "class_level" in payload:
            payload["class_level"] = str(payload["class_level"])
            enforce_teacher_class(user, payload["class_level"])
        payload[owner_field] = user
        row = model(**payload).save()
        if model == Video:
            notify_students_for_class(
                row.class_level,
                "video",
                "Learning Content",
                f"New video lecture added: {row.title}",
                "/learning",
                "blue",
                "learning",
                row.id,
            )
        elif model == Note:
            notify_students_for_class(
                row.class_level,
                "note",
                "Learning Content",
                f"New study note added: {row.title}",
                "/learning",
                "blue",
                "learning",
                row.id,
            )
        return ok({"item": simple_json(row, fields)}, status.HTTP_201_CREATED)
    return handler


videos = content_view(Video, ["title", "class_level", "subject", "chapter", "description", "youtube_url", "created_at"], "uploaded_by")
notes = content_view(Note, ["title", "class_level", "subject", "chapter", "pdf_url", "created_at"], "uploaded_by")


@api_view(["GET", "POST", "PUT", "DELETE"])
def notices(request):
    user, query = class_query(request, Notice)
    if request.method == "GET":
        return ok({"results": [notice_json(row) for row in query.order_by("-created_at")]})
    require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    data = request.data
    if request.method in ["PUT", "DELETE"]:
        row = Notice.objects(id=data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Notice not found", status.HTTP_404_NOT_FOUND)
        enforce_teacher_class(user, row.class_level)
        enforce_owner(user, row, "created_by")
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Notice deleted"})
        class_level = str(data.get("class_level", row.class_level))
        enforce_teacher_class(user, class_level)
        row.update(title=data.get("title", row.title), body=data.get("body", row.body), class_level=class_level, updated_at=datetime.utcnow())
        return ok({"notice": notice_json(Notice.objects(id=row.id).first())})
    class_level = str(data.get("class_level", "all"))
    enforce_teacher_class(user, class_level)
    row = Notice(title=data.get("title"), body=data.get("body"), class_level=class_level, created_by=user).save()
    notify_students_for_class(
        row.class_level,
        "notice",
        "Notice",
        row.title,
        "/learning",
        "red",
        "notice",
        row.id,
    )
    return ok({"notice": notice_json(row)}, status.HTTP_201_CREATED)


@api_view(["GET", "POST", "DELETE"])
def timetables(request):
    user = current_user(request)
    if request.method == "GET":
        class_level = request.GET.get("class_level")
        if user.role == ROLE_STUDENT:
            class_level = get_student_for_user(user).class_level
        if user.role == ROLE_TEACHER:
            assigned = teacher_classes(user)
            rows = Timetable.objects(class_level=class_level) if class_level in assigned else Timetable.objects(class_level__in=assigned)
        else:
            rows = Timetable.objects(class_level=class_level) if class_level else Timetable.objects
        return ok({"results": [timetable_json(row) for row in rows]})
    require_roles(request, [ROLE_ADMIN])
    if request.method == "DELETE":
        Timetable.objects(id=request.data.get("id") or request.GET.get("id")).delete()
        return ok({"message": "Timetable deleted"})
    data = request.data
    periods = [TimetablePeriod(**period) for period in data.get("periods", [])]
    row = Timetable.objects(class_level=str(data.get("class_level"))).modify(upsert=True, new=True, set__periods=periods, set__updated_at=datetime.utcnow())
    notify_students_for_class(
        row.class_level,
        "timetable",
        "Timetable",
        "Your class timetable has been updated.",
        "/operations",
        "amber",
        "timetable",
        row.id,
    )
    return ok({"timetable": timetable_json(row)})


@api_view(["GET", "POST", "DELETE"])
def fees(request):
    user = current_user(request)
    if request.method == "GET":
        class_level = request.GET.get("class_level")
        if user.role == ROLE_STUDENT:
            class_level = get_student_for_user(user).class_level
        if user.role == ROLE_TEACHER:
            assigned = teacher_classes(user)
            rows = Fee.objects(class_level=class_level) if class_level in assigned else Fee.objects(class_level__in=assigned)
        else:
            rows = Fee.objects(class_level=class_level) if class_level else Fee.objects
        return ok({"results": [simple_json(row, ["class_level", "annual_fee", "installments", "updated_at"]) for row in rows]})
    require_roles(request, [ROLE_ADMIN])
    if request.method == "DELETE":
        Fee.objects(id=request.data.get("id") or request.GET.get("id")).delete()
        return ok({"message": "Fee structure deleted"})
    data = request.data
    row = Fee.objects(class_level=str(data.get("class_level"))).modify(
        upsert=True,
        new=True,
        set__annual_fee=float(data.get("annual_fee")),
        set__installments=data.get("installments", {}),
        set__updated_at=datetime.utcnow(),
    )
    notify_students_for_class(
        row.class_level,
        "fee",
        "Fee",
        "Fee structure has been updated.",
        "/operations",
        "amber",
        "fee",
        row.id,
    )
    return ok({"fee": simple_json(row, ["class_level", "annual_fee", "installments", "updated_at"])})


@api_view(["GET", "POST", "PUT", "DELETE"])
def blogs(request):
    user = current_user(request)
    if request.method == "GET":
        return ok({"results": [simple_json(row, ["title", "category", "content", "published", "created_at"]) for row in Blog.objects(published=True).order_by("-created_at")]})
    require_roles(request, [ROLE_ADMIN])
    data = request.data
    if request.method in ["PUT", "DELETE"]:
        row = Blog.objects(id=data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Blog not found", status.HTTP_404_NOT_FOUND)
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Blog deleted"})
        row.update(title=data.get("title", row.title), category=data.get("category", row.category), content=data.get("content", row.content), published=data.get("published", row.published))
        return ok({"item": simple_json(Blog.objects(id=row.id).first(), ["title", "category", "content", "published", "created_at"])})
    row = Blog(title=data.get("title"), category=data.get("category"), content=data.get("content"), published=data.get("published", True), author=user).save()
    if row.published:
        notify_all_students(
            "blog",
            "Blog",
            f"New study article published: {row.title}",
            "/learning",
            "green",
            "blog",
            row.id,
        )
    return ok({"item": simple_json(row, ["title", "category", "content", "published", "created_at"])}, status.HTTP_201_CREATED)


@api_view(["GET", "POST", "PUT", "DELETE"])
def current_affairs(request):
    user = current_user(request)
    fields = ["title", "summary", "content", "category", "source_url", "source_name", "generated_by_ai", "digest_date", "published_on"]
    if request.method == "GET":
        return ok({"results": [simple_json(row, fields) for row in CurrentAffair.objects.order_by("-published_on")]})
    require_roles(request, [ROLE_ADMIN])
    data = request.data
    if request.method in ["PUT", "DELETE"]:
        row = CurrentAffair.objects(id=data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Current affair not found", status.HTTP_404_NOT_FOUND)
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Current affair deleted"})
        row.update(
            title=data.get("title", row.title),
            summary=data.get("summary", row.summary),
            content=data.get("content", row.content),
            category=data.get("category", row.category),
            source_url=data.get("source_url", row.source_url),
            source_name=data.get("source_name", row.source_name),
        )
        return ok({"item": simple_json(CurrentAffair.objects(id=row.id).first(), fields)})
    row = CurrentAffair(
        title=data.get("title"),
        summary=data.get("summary"),
        content=data.get("content", ""),
        category=data.get("category", "Educational News"),
        source_url=data.get("source_url", ""),
        source_name=data.get("source_name", ""),
        created_by=user,
    ).save()
    notify_all_students(
        "current_affair",
        "Current Affairs",
        row.title,
        "/learning",
        "violet",
        "current_affairs",
        row.id,
    )
    return ok({"item": simple_json(row, fields)}, status.HTTP_201_CREATED)


@api_view(["GET", "POST", "PUT", "DELETE"])
def assignments(request):
    user, query = class_query(request, Assignment)
    if request.method == "GET":
        return ok({"results": [simple_json(row, ["title", "description", "class_level", "subject", "deadline", "created_at"]) for row in query.order_by("deadline")]})
    require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    data = request.data
    if request.method in ["PUT", "DELETE"]:
        row = Assignment.objects(id=data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Assignment not found", status.HTTP_404_NOT_FOUND)
        enforce_teacher_class(user, row.class_level)
        enforce_owner(user, row, "created_by")
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Assignment deleted"})
        class_level = str(data.get("class_level", row.class_level))
        enforce_teacher_class(user, class_level)
        row.update(
            title=data.get("title", row.title),
            description=data.get("description", row.description),
            class_level=class_level,
            subject=data.get("subject", row.subject),
            deadline=parse_date(data.get("deadline", row.deadline)),
        )
        return ok({"assignment": simple_json(Assignment.objects(id=row.id).first(), ["title", "description", "class_level", "subject", "deadline", "created_at"])})
    class_level = str(data.get("class_level"))
    enforce_teacher_class(user, class_level)
    row = Assignment(title=data.get("title"), description=data.get("description"), class_level=class_level, subject=data.get("subject"), deadline=parse_date(data.get("deadline")), created_by=user).save()
    notify_students_for_class(
        row.class_level,
        "assignment",
        "Assignment",
        f"New {row.subject} assignment added: {row.title}",
        "/operations",
        "red",
        "assignment",
        row.id,
    )
    return ok({"assignment": simple_json(row, ["title", "description", "class_level", "subject", "deadline", "created_at"])}, status.HTTP_201_CREATED)


def normalize_answer(value):
    return " ".join(str(value or "").strip().lower().split())


def objective_correct_answer(question):
    if question.question_type == "mcq":
        answer = str(question.correct_answer or "").strip()
        option_index = {"a": 0, "b": 1, "c": 2, "d": 3}.get(answer.lower())
        if option_index is not None and option_index < len(question.options):
            return question.options[option_index]
    return question.correct_answer


def today_key():
    return date.today().isoformat()


def practice_count():
    try:
        return max(1, min(int(os.getenv("DAILY_PRACTICE_QUESTION_COUNT", "10")), 25))
    except (TypeError, ValueError):
        return 10


def question_bank_json(question, include_correct=False):
    data = {
        "id": oid(question),
        "class_level": question.class_level,
        "subject": question.subject,
        "chapter": question.chapter,
        "question_type": question.question_type,
        "difficulty": question.difficulty,
        "text": question.text,
        "options": question.options,
        "marks": question.marks,
        "explanation": question.explanation if include_correct else "",
        "created_by": user_json(question.created_by),
        "created_at": dt(question.created_at),
        "updated_at": dt(question.updated_at),
    }
    if include_correct:
        data["correct_answer"] = question.correct_answer
        data["expected_answer"] = question.expected_answer
    return data


def question_bank_from_data(data, user, row=None):
    class_level = str(data.get("class_level", row.class_level if row else ""))
    subject = str(data.get("subject", row.subject if row else "")).strip()
    enforce_teacher_question_scope(user, class_level, subject)
    qtype = data.get("question_type", row.question_type if row else "mcq")
    if qtype not in ["mcq", "true_false", "short", "long"]:
        raise ValueError("Invalid question type")
    difficulty = data.get("difficulty", row.difficulty if row else "Medium")
    if difficulty not in ["Easy", "Medium", "Hard"]:
        raise ValueError("Invalid difficulty")
    options = data.get("options", row.options if row else [])
    if qtype == "mcq":
        options = [str(item).strip() for item in options if str(item).strip()][:4]
        if len(options) < 2:
            raise ValueError("MCQ questions need at least two options")
    elif qtype == "true_false":
        options = ["True", "False"]
    else:
        options = []
    return {
        "class_level": class_level,
        "subject": subject,
        "chapter": str(data.get("chapter", row.chapter if row else "")).strip(),
        "question_type": qtype,
        "difficulty": difficulty,
        "text": str(data.get("text", row.text if row else "")).strip(),
        "options": options,
        "correct_answer": str(data.get("correct_answer", row.correct_answer if row else "")).strip(),
        "expected_answer": str(data.get("expected_answer", row.expected_answer if row else "")).strip(),
        "explanation": str(data.get("explanation", row.explanation if row else "")).strip(),
        "marks": float(data.get("marks", row.marks if row else 1) or 1),
    }


def exam_question_from_bank(question, order):
    return ExamQuestion(
        question_id=uuid4().hex,
        question_bank_id=oid(question),
        text=question.text,
        question_type=question.question_type,
        marks=question.marks,
        options=question.options,
        correct_answer=question.correct_answer,
        expected_answer=question.expected_answer,
        explanation=question.explanation,
        chapter=question.chapter,
        difficulty=question.difficulty,
        order=order,
    )


def mistake_json(row):
    return {
        "id": oid(row),
        "question": question_bank_json(row.question, include_correct=True) if row.question else None,
        "source": row.source,
        "subject": row.subject,
        "chapter": row.chapter,
        "wrong_attempts": row.wrong_attempts,
        "correct_streak": row.correct_streak,
        "resolved": row.resolved,
        "last_wrong_at": dt(row.last_wrong_at),
        "updated_at": dt(row.updated_at),
    }


def topic_status(attempts, correct):
    if attempts < 3:
        return "Needs Practice"
    accuracy = (correct / attempts) * 100 if attempts else 0
    if accuracy >= 75:
        return "Strong"
    if accuracy >= 50:
        return "Needs Practice"
    return "Weak"


def update_practice_tracking(student, question, correct, source="practice"):
    if not question:
        return
    now = datetime.utcnow()
    performance = TopicPerformance.objects(student=student, subject=question.subject, chapter=question.chapter).first()
    if performance:
        attempts = performance.attempts + 1
        correct_count = performance.correct + (1 if correct else 0)
        performance.update(
            attempts=attempts,
            correct=correct_count,
            accuracy=round((correct_count / attempts) * 100, 2),
            status=topic_status(attempts, correct_count),
            updated_at=now,
        )
    else:
        TopicPerformance(
            student=student,
            class_level=student.class_level,
            subject=question.subject,
            chapter=question.chapter,
            attempts=1,
            correct=1 if correct else 0,
            accuracy=100 if correct else 0,
            status=topic_status(1, 1 if correct else 0),
            updated_at=now,
        ).save()
    mistake = StudentMistake.objects(student=student, question=question).first()
    if correct:
        if mistake:
            streak = mistake.correct_streak + 1
            mistake.update(correct_streak=streak, resolved=streak >= 2, updated_at=now)
        return
    if mistake:
        mistake.update(
            source=source,
            wrong_attempts=mistake.wrong_attempts + 1,
            correct_streak=0,
            resolved=False,
            last_wrong_at=now,
            updated_at=now,
        )
    else:
        StudentMistake(
            student=student,
            question=question,
            source=source,
            subject=question.subject,
            chapter=question.chapter,
            wrong_attempts=1,
            correct_streak=0,
            resolved=False,
            last_wrong_at=now,
            updated_at=now,
        ).save()


def practice_session_json(session, include_correct=False):
    answers = {oid(answer.question): answer for answer in session.answers if answer.question}
    questions = []
    for question in session.questions:
        item = question_bank_json(question, include_correct=include_correct)
        answer = answers.get(oid(question))
        item["answer"] = answer.answer if answer else ""
        item["correct"] = answer.correct if answer and include_correct else False
        item["marks_awarded"] = answer.marks_awarded if answer and include_correct else 0
        questions.append(item)
    return {
        "id": oid(session),
        "session_type": session.session_type,
        "session_date": session.session_date,
        "class_level": session.class_level,
        "subject": session.subject,
        "status": session.status,
        "questions_per_day": practice_count(),
        "total_questions": session.total_questions,
        "correct_count": session.correct_count,
        "incorrect_count": session.incorrect_count,
        "score": session.score,
        "accuracy": session.accuracy,
        "topic_performance": session.topic_performance,
        "started_at": dt(session.started_at),
        "submitted_at": dt(session.submitted_at),
        "questions": questions,
    }


def select_daily_questions(student, limit):
    weak_topics = list(TopicPerformance.objects(student=student, status__in=["Weak", "Needs Practice"]).order_by("accuracy")[:8])
    selected = []
    selected_ids = set()
    for topic in weak_topics:
        for question in QuestionBankQuestion.objects(class_level=student.class_level, subject=topic.subject, chapter=topic.chapter).order_by("-created_at")[:limit]:
            if oid(question) not in selected_ids:
                selected.append(question)
                selected_ids.add(oid(question))
            if len(selected) >= limit:
                return selected
    for question in QuestionBankQuestion.objects(class_level=student.class_level).order_by("difficulty", "-created_at"):
        if oid(question) not in selected_ids:
            selected.append(question)
            selected_ids.add(oid(question))
        if len(selected) >= limit:
            break
    return selected


def get_or_create_daily_session(student):
    key = today_key()
    existing = PracticeSession.objects(student=student, session_type="daily", session_date=key).first()
    if existing:
        if existing.status == "in_progress" and not existing.questions:
            questions = select_daily_questions(student, practice_count())
            if questions:
                existing.update(questions=questions, total_questions=len(questions), updated_at=datetime.utcnow())
                return PracticeSession.objects(id=existing.id).first()
        return existing
    questions = select_daily_questions(student, practice_count())
    return PracticeSession(
        student=student,
        session_type="daily",
        session_date=key,
        class_level=student.class_level,
        questions=questions,
        total_questions=len(questions),
    ).save()


def submit_practice_session(session):
    if session.status == "submitted":
        return session
    by_id = {oid(answer.question): answer for answer in session.answers if answer.question}
    answers = []
    correct_count = 0
    score = 0
    topic_map = {}
    now = datetime.utcnow()
    for question in session.questions:
        answer = by_id.get(oid(question)) or PracticeAnswer(question=question)
        if question.question_type in ["mcq", "true_false"]:
            is_correct = normalize_answer(answer.answer) == normalize_answer(objective_correct_answer(question))
        else:
            is_correct = bool(question.expected_answer) and normalize_answer(answer.answer) == normalize_answer(question.expected_answer)
        answer.correct = is_correct
        answer.marks_awarded = question.marks if is_correct else 0
        answer.answered_at = answer.answered_at or now
        answers.append(answer)
        correct_count += 1 if is_correct else 0
        score += answer.marks_awarded
        key = (question.subject, question.chapter)
        current = topic_map.get(key) or {"subject": question.subject, "chapter": question.chapter, "attempts": 0, "correct": 0}
        current["attempts"] += 1
        current["correct"] += 1 if is_correct else 0
        topic_map[key] = current
        update_practice_tracking(session.student, question, is_correct, "practice")
    topic_rows = []
    for row in topic_map.values():
        accuracy = round((row["correct"] / row["attempts"]) * 100, 2) if row["attempts"] else 0
        topic_rows.append({**row, "accuracy": accuracy, "status": topic_status(row["attempts"], row["correct"])})
    total = len(session.questions)
    session.update(
        answers=answers,
        status="submitted",
        total_questions=total,
        correct_count=correct_count,
        incorrect_count=max(0, total - correct_count),
        score=score,
        accuracy=round((correct_count / total) * 100, 2) if total else 0,
        topic_performance=topic_rows,
        submitted_at=now,
        updated_at=now,
    )
    return PracticeSession.objects(id=session.id).first()


def topic_performance_json(row):
    return {
        "id": oid(row),
        "student": student_json(row.student) if row.student else None,
        "class_level": row.class_level,
        "subject": row.subject,
        "chapter": row.chapter,
        "attempts": row.attempts,
        "correct": row.correct,
        "accuracy": row.accuracy,
        "status": row.status,
        "updated_at": dt(row.updated_at),
    }


def learning_links_for(student, subject, chapter):
    notes = Note.objects(class_level=student.class_level, subject=subject, chapter=chapter).first()
    videos = Video.objects(class_level=student.class_level, subject=subject, chapter=chapter).first()
    if notes or videos:
        return "/learning"
    return ""


def get_or_create_study_plan(student):
    key = today_key()
    plan = StudyPlan.objects(student=student, plan_date=key).first()
    if plan:
        return plan
    tasks = []
    weak_rows = list(TopicPerformance.objects(student=student, status__in=["Weak", "Needs Practice"]).order_by("accuracy")[:3])
    for row in weak_rows:
        tasks.append(
            StudyPlanTask(
                task_id=uuid4().hex,
                title=f"Revise {row.chapter}",
                category="Weak Topic",
                subject=row.subject,
                chapter=row.chapter,
                minutes=30 if row.status == "Weak" else 20,
                link=learning_links_for(student, row.subject, row.chapter),
            )
        )
    mistakes = list(StudentMistake.objects(student=student, resolved=False).order_by("-last_wrong_at")[:2])
    for mistake in mistakes:
        tasks.append(
            StudyPlanTask(
                task_id=uuid4().hex,
                title=f"Practice mistakes in {mistake.chapter}",
                category="My Mistakes",
                subject=mistake.subject,
                chapter=mistake.chapter,
                minutes=20,
                link="/practice-progress",
            )
        )
    upcoming = list(Assignment.objects(class_level=student.class_level, deadline__gte=datetime.utcnow()).order_by("deadline")[:2])
    for assignment in upcoming:
        tasks.append(
            StudyPlanTask(
                task_id=uuid4().hex,
                title=f"Complete {assignment.subject} assignment: {assignment.title}",
                category="Assignment",
                subject=assignment.subject,
                minutes=25,
                link="/operations",
            )
        )
    exams = list(Exam.objects(class_level=student.class_level, is_published=True, start_time__gte=datetime.utcnow()).order_by("start_time")[:2])
    for exam in exams:
        tasks.append(
            StudyPlanTask(
                task_id=uuid4().hex,
                title=f"Prepare for {exam.subject}: {exam.name}",
                category="Exam",
                subject=exam.subject,
                minutes=30,
                link="/operations",
            )
        )
    return StudyPlan(student=student, plan_date=key, tasks=tasks[:6]).save()


def study_plan_json(plan):
    return {
        "id": oid(plan),
        "plan_date": plan.plan_date,
        "created_at": dt(plan.created_at),
        "updated_at": dt(plan.updated_at),
        "tasks": [
            {
                "task_id": task.task_id,
                "title": task.title,
                "category": task.category,
                "subject": task.subject,
                "chapter": task.chapter,
                "minutes": task.minutes,
                "link": task.link,
                "completed": task.completed,
                "completed_at": dt(task.completed_at),
            }
            for task in plan.tasks
        ],
    }


def process_published_exam_attempts(exam):
    bank_questions = {question.question_id: QuestionBankQuestion.objects(id=question.question_bank_id).first() for question in exam.questions if question.question_bank_id}
    for attempt in ExamAttempt.objects(exam=exam):
        answers = {answer.question_id: answer for answer in attempt.answers}
        for question in exam.questions:
            bank_question = bank_questions.get(question.question_id)
            if not bank_question or question.question_type not in ["mcq", "true_false"]:
                continue
            answer = answers.get(question.question_id)
            correct = bool(answer and normalize_answer(answer.answer) == normalize_answer(objective_correct_answer(question)))
            update_practice_tracking(attempt.student, bank_question, correct, "exam")


@api_view(["GET", "POST", "PUT", "DELETE"])
def question_bank(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    if request.method == "GET":
        query = QuestionBankQuestion.objects
        if user.role == ROLE_STUDENT:
            student = get_student_for_user(user)
            query = query(class_level=student.class_level) if student else query(class_level="__none__")
        elif user.role == ROLE_TEACHER:
            query = query(class_level__in=teacher_classes(user))
            subjects = teacher_subjects(user)
            if subjects:
                query = query(subject__in=subjects)
        for key in ["class_level", "subject", "chapter", "difficulty", "question_type"]:
            value = request.GET.get(key)
            if value:
                query = query(**{key: value})
        search = str(request.GET.get("search", "")).strip()
        if search:
            query = query(text__icontains=search)
        return ok({"results": [question_bank_json(row, include_correct=user.role != ROLE_STUDENT) for row in query.order_by("-created_at")[:250]]})
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    data = request.data
    if request.method in ["PUT", "DELETE"]:
        row = QuestionBankQuestion.objects(id=data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Question not found", status.HTTP_404_NOT_FOUND)
        enforce_teacher_question_scope(user, row.class_level, row.subject)
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Question deleted"})
        try:
            payload = question_bank_from_data(data, user, row)
        except (TypeError, ValueError):
            return bad("Unable to save this question.")
        row.update(**{f"set__{key}": value for key, value in payload.items()}, set__updated_at=datetime.utcnow())
        return ok({"question": question_bank_json(QuestionBankQuestion.objects(id=row.id).first(), include_correct=True)})
    try:
        payload = question_bank_from_data(data, user)
    except (TypeError, ValueError):
        return bad("Unable to create this question.")
    row = QuestionBankQuestion(**payload, created_by=user).save()
    return ok({"question": question_bank_json(row, include_correct=True)}, status.HTTP_201_CREATED)


@api_view(["GET"])
def daily_practice(request):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    session = get_or_create_daily_session(student)
    return ok({"session": practice_session_json(session, include_correct=session.status == "submitted")})


@api_view(["POST"])
def practice_answer(request, session_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    session = PracticeSession.objects(id=session_id, student=student).first()
    if not session:
        return bad("Unable to load this practice.", status.HTTP_404_NOT_FOUND)
    if session.status != "in_progress":
        return bad("This practice has already been submitted.", status.HTTP_403_FORBIDDEN)
    question = QuestionBankQuestion.objects(id=request.data.get("question_id")).first()
    if not question or oid(question) not in {oid(item) for item in session.questions}:
        return bad("Unable to save your answer.")
    answers = [answer for answer in session.answers if oid(answer.question) != oid(question)]
    answers.append(PracticeAnswer(question=question, answer=request.data.get("answer", ""), answered_at=datetime.utcnow()))
    session.update(answers=answers, updated_at=datetime.utcnow())
    return ok({"session": practice_session_json(PracticeSession.objects(id=session.id).first())})


@api_view(["POST"])
def practice_submit(request, session_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    session = PracticeSession.objects(id=session_id, student=student).first()
    if not session:
        return bad("Unable to load this practice.", status.HTTP_404_NOT_FOUND)
    session = submit_practice_session(session)
    return ok({"message": "Your practice has been submitted.", "session": practice_session_json(session, include_correct=True)})


@api_view(["GET"])
def practice_mistakes(request):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    rows = StudentMistake.objects(student=student, resolved=False).order_by("-last_wrong_at")
    return ok({"results": [mistake_json(row) for row in rows]})


@api_view(["POST"])
def practice_again(request, mistake_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    mistake = StudentMistake.objects(id=mistake_id, student=student).first()
    if not mistake or not mistake.question:
        return bad("Unable to load this mistake.", status.HTTP_404_NOT_FOUND)
    session = PracticeSession(
        student=student,
        session_type="mistakes",
        session_date=today_key(),
        class_level=student.class_level,
        subject=mistake.subject,
        questions=[mistake.question],
        total_questions=1,
    ).save()
    return ok({"session": practice_session_json(session)}, status.HTTP_201_CREATED)


@api_view(["GET"])
def weak_topics(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    query = TopicPerformance.objects
    if user.role == ROLE_STUDENT:
        query = query(student=get_student_for_user(user))
    elif user.role == ROLE_TEACHER:
        query = query(class_level__in=teacher_classes(user))
        subjects = teacher_subjects(user)
        if subjects:
            query = query(subject__in=subjects)
    for key in ["class_level", "subject", "chapter", "status"]:
        value = request.GET.get(key)
        if value:
            query = query(**{key: value})
    return ok({"results": [topic_performance_json(row) for row in query.order_by("accuracy", "-attempts")[:250]]})


@api_view(["GET"])
def study_plan(request):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    return ok({"plan": study_plan_json(get_or_create_study_plan(student))})


@api_view(["POST"])
def study_plan_task_complete(request, task_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    plan = StudyPlan.objects(student=student, plan_date=today_key()).first()
    if not plan:
        return bad("Study plan not found", status.HTTP_404_NOT_FOUND)
    completed = bool_value(request.data.get("completed", True))
    tasks = []
    now = datetime.utcnow()
    for task in plan.tasks:
        if task.task_id == task_id:
            task.completed = completed
            task.completed_at = now if completed else None
        tasks.append(task)
    plan.update(tasks=tasks, updated_at=now)
    return ok({"plan": study_plan_json(StudyPlan.objects(id=plan.id).first())})


@api_view(["GET"])
def practice_analytics(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    query = TopicPerformance.objects
    if user.role == ROLE_TEACHER:
        query = query(class_level__in=teacher_classes(user))
        subjects = teacher_subjects(user)
        if subjects:
            query = query(subject__in=subjects)
    rows = list(query)
    if request.GET.get("class_level"):
        rows = [row for row in rows if row.class_level == request.GET.get("class_level")]
    class_map = {}
    subject_map = {}
    topic_rows = []
    for row in rows:
        for bucket, key in [(class_map, row.class_level), (subject_map, row.subject)]:
            current = bucket.get(key) or {"attempts": 0, "correct": 0}
            current["attempts"] += row.attempts
            current["correct"] += row.correct
            bucket[key] = current
        topic_rows.append(topic_performance_json(row))
    def mapped(data):
        return [
            {"label": key, "attempts": value["attempts"], "accuracy": round((value["correct"] / value["attempts"]) * 100, 2) if value["attempts"] else 0}
            for key, value in data.items()
        ]
    sessions = PracticeSession.objects
    if user.role == ROLE_TEACHER:
        sessions = sessions(class_level__in=teacher_classes(user))
    return ok(
        {
            "analytics": {
                "class_performance": sorted(mapped(class_map), key=lambda item: item["label"]),
                "subject_performance": sorted(mapped(subject_map), key=lambda item: item["accuracy"]),
                "difficult_topics": sorted(topic_rows, key=lambda item: (item["accuracy"], -item["attempts"]))[:10],
                "practice_participation": sessions.count(),
            }
        }
    )


def bool_value(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "published"}
    return bool(value)


def exam_window_state(exam, attempt=None):
    now = datetime.utcnow()
    if attempt and attempt.status in ["submitted", "evaluated", "expired"]:
        return "completed"
    if not exam.is_published:
        return "draft"
    if now < exam.start_time:
        return "upcoming"
    if now > exam.end_time:
        return "ended"
    return "active"


def enforce_exam_manager(user, exam):
    require_roles_for_user(user, [ROLE_ADMIN, ROLE_TEACHER])
    enforce_teacher_class(user, exam.class_level)


def require_roles_for_user(user, roles):
    if user.role not in roles:
        raise PermissionDenied("You do not have permission to perform this action")


def exam_fields(data, row=None):
    start_time = parse_date(data.get("start_time", row.start_time if row else None))
    end_time = parse_date(data.get("end_time", row.end_time if row else None))
    if not start_time or not end_time or end_time <= start_time:
        raise ValueError("Invalid exam schedule")
    duration = int(data.get("duration_minutes", row.duration_minutes if row else 60))
    if duration < 1:
        raise ValueError("Invalid exam duration")
    total_marks = float(data.get("total_marks", row.total_marks if row else 0))
    passing_marks = float(data.get("passing_marks", row.passing_marks if row else 0) or 0)
    return {
        "name": data.get("name", row.name if row else ""),
        "class_level": str(data.get("class_level", row.class_level if row else "")),
        "subject": data.get("subject", row.subject if row else ""),
        "instructions": data.get("instructions", row.instructions if row else ""),
        "exam_date": parse_date(data.get("exam_date", row.exam_date if row else start_time)),
        "start_time": start_time,
        "end_time": end_time,
        "duration_minutes": duration,
        "total_marks": total_marks,
        "passing_marks": passing_marks,
        "is_published": bool_value(data.get("is_published", row.is_published if row else False)),
    }


def question_from_data(data, existing=None, order=0):
    qtype = data.get("question_type", existing.question_type if existing else "mcq")
    if qtype not in ["mcq", "true_false", "short", "long"]:
        raise ValueError("Invalid question type")
    options = data.get("options", existing.options if existing else [])
    if qtype == "mcq":
        options = [str(item).strip() for item in options if str(item).strip()][:4]
        if len(options) < 2:
            raise ValueError("MCQ questions need at least two options")
    elif qtype == "true_false":
        options = ["True", "False"]
    else:
        options = []
    return ExamQuestion(
        question_id=existing.question_id if existing else uuid4().hex,
        question_bank_id=data.get("question_bank_id", existing.question_bank_id if existing else "").strip(),
        text=data.get("text", existing.text if existing else "").strip(),
        question_type=qtype,
        marks=float(data.get("marks", existing.marks if existing else 1)),
        options=options,
        correct_answer=data.get("correct_answer", existing.correct_answer if existing else "").strip(),
        expected_answer=data.get("expected_answer", existing.expected_answer if existing else "").strip(),
        explanation=data.get("explanation", existing.explanation if existing else "").strip(),
        chapter=data.get("chapter", existing.chapter if existing else "").strip(),
        difficulty=data.get("difficulty", existing.difficulty if existing else "Medium"),
        order=int(data.get("order", existing.order if existing else order)),
    )


def question_json(question, include_correct=False):
    data = {
        "id": question.question_id,
        "question_id": question.question_id,
        "text": question.text,
        "question_type": question.question_type,
        "marks": question.marks,
        "options": question.options,
        "question_bank_id": question.question_bank_id,
        "chapter": question.chapter,
        "difficulty": question.difficulty,
        "explanation": question.explanation if include_correct else "",
        "expected_answer": question.expected_answer if include_correct else "",
        "order": question.order,
    }
    if include_correct:
        data["correct_answer"] = question.correct_answer
    return data


def answer_json(answer, include_marks=True):
    return {
        "question_id": answer.question_id,
        "answer": answer.answer,
        "marks_awarded": answer.marks_awarded if include_marks else 0,
        "feedback": answer.feedback if include_marks else "",
        "auto_graded": answer.auto_graded,
        "evaluated": answer.evaluated if include_marks else False,
    }


def attempt_json(attempt, include_answers=False, include_student=False, include_scores=True):
    data = {
        "id": oid(attempt),
        "exam_id": oid(attempt.exam),
        "started_at": dt(attempt.started_at),
        "deadline": dt(attempt.deadline),
        "submitted_at": dt(attempt.submitted_at),
        "status": attempt.status,
        "objective_score": attempt.objective_score if include_scores else 0,
        "descriptive_score": attempt.descriptive_score if include_scores else 0,
        "score": attempt.score if include_scores else 0,
        "feedback": attempt.feedback if include_scores else "",
    }
    if include_answers:
        data["answers"] = [answer_json(answer, include_marks=include_scores) for answer in attempt.answers]
    if include_student:
        data["student"] = student_json(attempt.student) if attempt.student else None
    return data


def exam_json(exam, user, include_questions=False, include_attempts=False):
    attempt = None
    if user.role == ROLE_STUDENT:
        student = get_student_for_user(user)
        attempt = ExamAttempt.objects(exam=exam, student=student).first() if student else None
    data = {
        "id": oid(exam),
        "name": exam.name,
        "class_level": exam.class_level,
        "subject": exam.subject,
        "instructions": exam.instructions,
        "exam_date": dt(exam.exam_date),
        "start_time": dt(exam.start_time),
        "end_time": dt(exam.end_time),
        "duration_minutes": exam.duration_minutes,
        "total_marks": exam.total_marks,
        "passing_marks": exam.passing_marks,
        "is_published": exam.is_published,
        "result_published": exam.result_published,
        "question_count": len(exam.questions),
        "status": exam_window_state(exam, attempt),
        "created_by": user_json(exam.created_by),
        "created_at": dt(exam.created_at),
        "updated_at": dt(exam.updated_at),
        "attempt": attempt_json(attempt, include_answers=True, include_scores=exam.result_published) if attempt else None,
    }
    if include_questions:
        data["questions"] = [question_json(question, include_correct=user.role != ROLE_STUDENT) for question in sorted(exam.questions, key=lambda item: item.order)]
    if include_attempts and user.role != ROLE_STUDENT:
        data["attempts"] = [attempt_json(row, include_answers=True, include_student=True) for row in ExamAttempt.objects(exam=exam).order_by("-updated_at")]
    return data


def visible_exams_for_user(user):
    if user.role == ROLE_STUDENT:
        student = get_student_for_user(user)
        return Exam.objects(class_level=student.class_level, is_published=True) if student else Exam.objects(class_level="__none__")
    if user.role == ROLE_TEACHER:
        return Exam.objects(class_level__in=teacher_classes(user))
    return Exam.objects


def auto_grade_attempt(attempt):
    exam = attempt.exam
    objective = 0
    by_id = {answer.question_id: answer for answer in attempt.answers}
    updated_answers = []
    for question in exam.questions:
        answer = by_id.get(question.question_id) or ExamAnswer(question_id=question.question_id)
        if question.question_type in ["mcq", "true_false"]:
            answer.auto_graded = True
            answer.evaluated = True
            answer.marks_awarded = question.marks if normalize_answer(answer.answer) == normalize_answer(objective_correct_answer(question)) else 0
            objective += answer.marks_awarded
        updated_answers.append(answer)
    attempt.update(
        answers=updated_answers,
        objective_score=objective,
        score=objective + attempt.descriptive_score,
        updated_at=datetime.utcnow(),
    )
    return ExamAttempt.objects(id=attempt.id).first()


def finalize_attempt(attempt, status_value="submitted"):
    if attempt.status in ["submitted", "evaluated", "expired"]:
        return attempt
    now = datetime.utcnow()
    attempt.update(status=status_value, submitted_at=now, updated_at=now)
    return auto_grade_attempt(ExamAttempt.objects(id=attempt.id).first())


@api_view(["GET", "POST", "PUT", "DELETE"])
def exams(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    if request.method == "GET":
        query = visible_exams_for_user(user)
        for key in ["class_level", "subject"]:
            value = request.GET.get(key)
            if value:
                query = query(**{key: value})
        return ok({"server_time": dt(datetime.utcnow()), "results": [exam_json(row, user, include_questions=user.role != ROLE_STUDENT, include_attempts=user.role != ROLE_STUDENT) for row in query.order_by("-start_time")]})
    require_roles_for_user(user, [ROLE_ADMIN, ROLE_TEACHER])
    data = request.data
    if request.method in ["PUT", "DELETE"]:
        row = Exam.objects(id=data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Exam not found", status.HTTP_404_NOT_FOUND)
        enforce_exam_manager(user, row)
        if request.method == "DELETE":
            require_roles_for_user(user, [ROLE_ADMIN])
            row.delete()
            return ok({"message": "Exam deleted"})
        try:
            payload = exam_fields(data, row)
            enforce_teacher_class(user, payload["class_level"])
        except (TypeError, ValueError):
            return bad("Unable to save this exam.")
        was_published = row.is_published
        row.update(**{f"set__{key}": value for key, value in payload.items()}, set__updated_at=datetime.utcnow())
        updated = Exam.objects(id=row.id).first()
        if not was_published and updated.is_published:
            notify_students_for_class(updated.class_level, "exam", "Exam Published", f"{updated.name} is now available.", "/operations", "red", "assignment", updated.id)
        return ok({"exam": exam_json(updated, user, include_questions=True, include_attempts=True)})
    try:
        payload = exam_fields(data)
        enforce_teacher_class(user, payload["class_level"])
    except (TypeError, ValueError):
        return bad("Unable to create this exam.")
    row = Exam(**payload, created_by=user).save()
    if row.is_published:
        notify_students_for_class(row.class_level, "exam", "Exam Published", f"{row.name} is now available.", "/operations", "red", "assignment", row.id)
    return ok({"exam": exam_json(row, user, include_questions=True, include_attempts=True)}, status.HTTP_201_CREATED)


@api_view(["POST", "PUT", "DELETE"])
def exam_questions(request, exam_id):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    exam = Exam.objects(id=exam_id).first()
    if not exam:
        return bad("Exam not found", status.HTTP_404_NOT_FOUND)
    enforce_exam_manager(user, exam)
    data = request.data
    questions = list(exam.questions)
    if request.method == "DELETE":
        qid = data.get("question_id") or request.GET.get("question_id")
        questions = [question for question in questions if question.question_id != qid]
    elif request.method == "PUT":
        qid = data.get("question_id")
        existing = next((question for question in questions if question.question_id == qid), None)
        if not existing:
            return bad("Question not found", status.HTTP_404_NOT_FOUND)
        try:
            updated = question_from_data(data, existing)
        except (TypeError, ValueError):
            return bad("Unable to save this question.")
        questions = [updated if question.question_id == qid else question for question in questions]
    else:
        bank_ids = data.get("question_bank_ids") or []
        if bank_ids:
            existing_bank_ids = {question.question_bank_id for question in questions if question.question_bank_id}
            for bank_question in QuestionBankQuestion.objects(id__in=bank_ids):
                if bank_question.class_level != exam.class_level or bank_question.subject != exam.subject or oid(bank_question) in existing_bank_ids:
                    continue
                enforce_teacher_question_scope(user, bank_question.class_level, bank_question.subject)
                questions.append(exam_question_from_bank(bank_question, len(questions) + 1))
                existing_bank_ids.add(oid(bank_question))
        else:
            try:
                questions.append(question_from_data(data, order=len(questions) + 1))
            except (TypeError, ValueError):
                return bad("Unable to add this question.")
    questions = sorted(questions, key=lambda question: question.order)
    exam.update(questions=questions, total_marks=sum(question.marks for question in questions), updated_at=datetime.utcnow())
    return ok({"exam": exam_json(Exam.objects(id=exam.id).first(), user, include_questions=True, include_attempts=True)})


@api_view(["POST"])
def exam_start(request, exam_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    exam = Exam.objects(id=exam_id, is_published=True).first()
    if not exam or not student or exam.class_level != student.class_level:
        return bad("Unable to load this exam.", status.HTTP_404_NOT_FOUND)
    now = datetime.utcnow()
    if now < exam.start_time:
        return bad("This exam has not started yet.", status.HTTP_403_FORBIDDEN)
    if now > exam.end_time:
        return bad("This exam has ended.", status.HTTP_403_FORBIDDEN)
    attempt = ExamAttempt.objects(exam=exam, student=student).first()
    if attempt:
        if attempt.status == "in_progress" and now > attempt.deadline:
            attempt = finalize_attempt(attempt, "expired")
        return ok({"exam": exam_json(exam, user, include_questions=True), "attempt": attempt_json(attempt, include_answers=True, include_scores=exam.result_published), "server_time": dt(now)})
    deadline = min(now + timedelta(minutes=exam.duration_minutes), exam.end_time)
    attempt = ExamAttempt(exam=exam, student=student, started_at=now, deadline=deadline).save()
    return ok({"exam": exam_json(exam, user, include_questions=True), "attempt": attempt_json(attempt, include_answers=True, include_scores=exam.result_published), "server_time": dt(now)}, status.HTTP_201_CREATED)


@api_view(["POST"])
def exam_attempt_answer(request, attempt_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    attempt = ExamAttempt.objects(id=attempt_id, student=student).first()
    if not attempt:
        return bad("Unable to load this exam.", status.HTTP_404_NOT_FOUND)
    now = datetime.utcnow()
    if attempt.status != "in_progress" or now > attempt.deadline or now > attempt.exam.end_time:
        finalize_attempt(attempt, "expired" if attempt.status == "in_progress" else attempt.status)
        return bad("This exam has ended.", status.HTTP_403_FORBIDDEN)
    qid = request.data.get("question_id")
    answer_text = request.data.get("answer", "")
    question_ids = {question.question_id for question in attempt.exam.questions}
    if qid not in question_ids:
        return bad("Unable to save your answer.")
    answers = [answer for answer in attempt.answers if answer.question_id != qid]
    answers.append(ExamAnswer(question_id=qid, answer=answer_text))
    attempt.update(answers=answers, updated_at=now)
    return ok({"attempt": attempt_json(ExamAttempt.objects(id=attempt.id).first(), include_answers=True, include_scores=attempt.exam.result_published)})


@api_view(["POST"])
def exam_attempt_submit(request, attempt_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    attempt = ExamAttempt.objects(id=attempt_id, student=student).first()
    if not attempt:
        return bad("Unable to load this exam.", status.HTTP_404_NOT_FOUND)
    status_value = "expired" if datetime.utcnow() > attempt.deadline or datetime.utcnow() > attempt.exam.end_time else "submitted"
    attempt = finalize_attempt(attempt, status_value)
    return ok({"message": "Your exam has been submitted successfully.", "attempt": attempt_json(attempt, include_answers=True, include_scores=attempt.exam.result_published)})


@api_view(["PUT"])
def exam_attempt_evaluate(request, attempt_id):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    attempt = ExamAttempt.objects(id=attempt_id).first()
    if not attempt:
        return bad("Submission not found", status.HTTP_404_NOT_FOUND)
    enforce_exam_manager(user, attempt.exam)
    evaluations = {item.get("question_id"): item for item in request.data.get("evaluations", [])}
    answers = []
    descriptive = 0
    objective = 0
    questions = {question.question_id: question for question in attempt.exam.questions}
    existing = {answer.question_id: answer for answer in attempt.answers}
    for qid, question in questions.items():
        answer = existing.get(qid) or ExamAnswer(question_id=qid)
        if question.question_type in ["mcq", "true_false"]:
            objective += answer.marks_awarded
        else:
            evaluation = evaluations.get(qid, {})
            marks_value = min(float(evaluation.get("marks_awarded", answer.marks_awarded) or 0), question.marks)
            answer.marks_awarded = max(0, marks_value)
            answer.feedback = evaluation.get("feedback", answer.feedback)
            answer.evaluated = True
            descriptive += answer.marks_awarded
        answers.append(answer)
    attempt.update(
        answers=answers,
        objective_score=objective,
        descriptive_score=descriptive,
        score=objective + descriptive,
        status="evaluated",
        feedback=request.data.get("feedback", attempt.feedback),
        evaluated_by=user,
        evaluated_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    return ok({"attempt": attempt_json(ExamAttempt.objects(id=attempt.id).first(), include_answers=True, include_student=True)})


@api_view(["POST"])
def exam_publish_results(request, exam_id):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    exam = Exam.objects(id=exam_id).first()
    if not exam:
        return bad("Exam not found", status.HTTP_404_NOT_FOUND)
    enforce_exam_manager(user, exam)
    exam.update(result_published=True, updated_at=datetime.utcnow())
    process_published_exam_attempts(exam)
    notify_students_for_class(exam.class_level, "exam_result", "Exam Result Published", f"{exam.name} result is now available.", "/operations", "green", "marks", exam.id)
    return ok({"exam": exam_json(Exam.objects(id=exam.id).first(), user, include_questions=True, include_attempts=True)})
