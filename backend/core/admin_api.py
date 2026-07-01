from datetime import datetime

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
    Fee,
    Marks,
    Note,
    Notice,
    ROLE_ADMIN,
    ROLE_STUDENT,
    ROLE_TEACHER,
    Student,
    Teacher,
    Timetable,
    TimetablePeriod,
    User,
    Video,
)
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


def enforce_teacher_class(user, class_level):
    if user.role == ROLE_TEACHER and str(class_level) not in teacher_classes(user):
        raise PermissionDenied("Teachers can only access assigned classes")


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
        return ok({"marks": marks_json(Marks.objects(id=row.id).first())})
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
    return ok({"item": simple_json(row, ["title", "category", "content", "published", "created_at"])}, status.HTTP_201_CREATED)


@api_view(["GET", "POST", "PUT", "DELETE"])
def current_affairs(request):
    user = current_user(request)
    if request.method == "GET":
        return ok({"results": [simple_json(row, ["title", "summary", "category", "published_on"]) for row in CurrentAffair.objects.order_by("-published_on")]})
    require_roles(request, [ROLE_ADMIN])
    data = request.data
    if request.method in ["PUT", "DELETE"]:
        row = CurrentAffair.objects(id=data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Current affair not found", status.HTTP_404_NOT_FOUND)
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Current affair deleted"})
        row.update(title=data.get("title", row.title), summary=data.get("summary", row.summary), category=data.get("category", row.category))
        return ok({"item": simple_json(CurrentAffair.objects(id=row.id).first(), ["title", "summary", "category", "published_on"])})
    row = CurrentAffair(title=data.get("title"), summary=data.get("summary"), category=data.get("category", "Educational News"), created_by=user).save()
    return ok({"item": simple_json(row, ["title", "summary", "category", "published_on"])}, status.HTTP_201_CREATED)


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
    return ok({"assignment": simple_json(row, ["title", "description", "class_level", "subject", "deadline", "created_at"])}, status.HTTP_201_CREATED)
