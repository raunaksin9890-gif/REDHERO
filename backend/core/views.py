import csv
import io
import logging
import os
from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from django.http import HttpResponse
from mongoengine.errors import NotUniqueError, ValidationError
from rest_framework.decorators import api_view
from rest_framework.exceptions import ParseError, PermissionDenied
from rest_framework.response import Response
from rest_framework import status

from .models import (
    DEFAULT_PASSWORD,
    ROLE_ADMIN,
    ROLE_STUDENT,
    ROLE_TEACHER,
    Assignment,
    AssignmentSubmission,
    Attendance,
    Blog,
    ChatHistory,
    ChatMessage,
    ContactMessage,
    CurrentAffair,
    Fee,
    Marks,
    Note,
    Notice,
    Notification,
    Student,
    Teacher,
    Timetable,
    TimetablePeriod,
    User,
    Video,
)
from .notifications import notify_all_students, notify_student, notify_students_for_class
from .security import create_token, current_user, hash_password, require_roles, verify_password
from .serializers import (
    attendance_json,
    contact_message_json,
    marks_json,
    notification_json,
    notice_json,
    simple_json,
    student_json,
    teacher_json,
    timetable_json,
    user_json,
)
from .services import next_code, parse_date


logger = logging.getLogger(__name__)
FORGOT_PASSWORD_VERIFY_ERROR = "Unable to verify the provided account details."
FORGOT_PASSWORD_TOKEN_MINUTES = 15
FORGOT_PASSWORD_ATTEMPTS = {}


def ok(data=None, http_status=status.HTTP_200_OK):
    return Response(data or {}, status=http_status)


def bad(message, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=http_status)


def client_key(request, suffix=""):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = forwarded.split(",", 1)[0].strip() if forwarded else request.META.get("REMOTE_ADDR", "unknown")
    return f"{ip}:{suffix}".lower()


def too_many_forgot_attempts(request, suffix):
    key = client_key(request, suffix)
    now = datetime.utcnow()
    attempts = [stamp for stamp in FORGOT_PASSWORD_ATTEMPTS.get(key, []) if now - stamp < timedelta(minutes=15)]
    FORGOT_PASSWORD_ATTEMPTS[key] = attempts
    return len(attempts) >= 5


def record_forgot_attempt(request, suffix):
    key = client_key(request, suffix)
    FORGOT_PASSWORD_ATTEMPTS.setdefault(key, []).append(datetime.utcnow())


def create_forgot_password_token(user):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "type": "forgot_password",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=FORGOT_PASSWORD_TOKEN_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_forgot_password_token(token):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
    if payload.get("type") != "forgot_password":
        return None
    return payload


def get_student_for_user(user):
    return Student.objects(user=user).first()


def get_teacher_for_user(user):
    return Teacher.objects(user=user).first()


def teacher_assigned_classes(user):
    teacher = get_teacher_for_user(user)
    return teacher.assigned_classes if teacher else []


def enforce_teacher_class(user, class_level):
    if user.role == ROLE_TEACHER and str(class_level) not in teacher_assigned_classes(user):
        raise PermissionDenied("Teachers can only access assigned classes")


def enforce_teacher_student(user, student):
    if user.role == ROLE_TEACHER:
        if not student or student.class_level not in teacher_assigned_classes(user):
            raise PermissionDenied("Teachers can only access assigned classes")


def enforce_owner(user, row, *owner_fields):
    if user.role != ROLE_TEACHER:
        return
    for field in owner_fields:
        if getattr(row, field, None) == user:
            return
    raise PermissionDenied("Teachers can only modify their own records")


def require_admin_for_delete(request):
    if request.method == "DELETE":
        require_roles(request, [ROLE_ADMIN])


def enforce_student_class(user, class_level):
    if user.role == ROLE_STUDENT:
        student = get_student_for_user(user)
        if not student or student.class_level != class_level:
            raise PermissionDenied("Students can only access their own class content")


def create_user(email, name, role, password=DEFAULT_PASSWORD, first_login=True):
    return User(
        email=email.lower().strip(),
        name=name.strip(),
        role=role,
        password_hash=hash_password(password),
        approved=True,
        first_login=first_login,
        force_password_change=first_login,
    ).save()


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


@api_view(["GET"])
def health(_request):
    return ok({"status": "ok", "service": "RedHero API"})


@api_view(["POST"])
def login(request):
    try:
        data = request.data
    except ParseError as exc:
        logger.warning(
            "Login JSON parse failed: error=%s returned_response=%s",
            str(exc),
            {"status": status.HTTP_400_BAD_REQUEST, "detail": str(exc)},
        )
        raise

    logger.warning(
        "Login request JSON: %s",
        {
            "keys": list(data.keys()) if hasattr(data, "keys") else [],
            "email": data.get("email") if hasattr(data, "get") else None,
            "password_present": bool(data.get("password")) if hasattr(data, "get") else False,
        },
    )
    email = data.get("email", "").lower().strip()
    password = data.get("password", "")
    logger.warning(
        "Login validated data: %s",
        {"email": email, "password_present": bool(password)},
    )
    user = User.objects(email=email).first()
    logger.warning(
        "Login authentication lookup: %s",
        {
            "email": email,
            "user_found": bool(user),
            "approved": user.approved if user else None,
            "is_active": user.is_active if user else None,
            "role": user.role if user else None,
        },
    )
    if not user or not user.approved or not user.is_active:
        logger.warning(
            "Login returned response: %s",
            {"status": status.HTTP_403_FORBIDDEN, "detail": "Access Denied - Contact Administrator"},
        )
        return bad("Access Denied - Contact Administrator", status.HTTP_403_FORBIDDEN)
    if not verify_password(password, user.password_hash):
        logger.warning(
            "Login authentication result: %s",
            {"email": email, "password_valid": False},
        )
        logger.warning(
            "Login returned response: %s",
            {"status": status.HTTP_401_UNAUTHORIZED, "detail": "Invalid email or password"},
        )
        return bad("Invalid email or password", status.HTTP_401_UNAUTHORIZED)
    logger.warning(
        "Login authentication result: %s",
        {"email": email, "password_valid": True, "role": user.role},
    )
    response = {
        "access": create_token(user, "access"),
        "refresh": create_token(user, "refresh"),
        "user": user_json(user),
    }
    logger.warning(
        "Login returned response: %s",
        {"status": status.HTTP_200_OK, "user": response["user"], "access_present": True, "refresh_present": True},
    )
    return ok(response)


@api_view(["GET"])
def me(request):
    user = current_user(request)
    profile = None
    if user.role == ROLE_STUDENT:
        profile = student_json(get_student_for_user(user))
    if user.role == ROLE_TEACHER:
        profile = teacher_json(get_teacher_for_user(user))
    return ok({"user": user_json(user), "profile": profile})


@api_view(["POST"])
def change_password(request):
    user = current_user(request)
    old_password = request.data.get("old_password", "")
    new_password = request.data.get("new_password", "")
    confirm_password = request.data.get("confirm_password", new_password)
    if not verify_password(old_password, user.password_hash):
        return bad("Current password is incorrect", status.HTTP_400_BAD_REQUEST)
    if new_password != confirm_password:
        return bad("Confirm password does not match")
    strength_error = validate_password_strength(new_password)
    if strength_error:
        return bad(strength_error)
    user.update(
        password_hash=hash_password(new_password),
        first_login=False,
        force_password_change=False,
        updated_at=datetime.utcnow(),
    )
    return ok({"message": "Password changed successfully"})


@api_view(["POST"])
def forgot_password_verify(request):
    data = request.data
    username = data.get("username", "").strip()
    roll_number = str(data.get("roll_number", "")).strip()
    class_level = str(data.get("class_level", "")).strip()
    student_id = data.get("student_id", "").strip().upper()
    suffix = f"{username}:{student_id}"
    if too_many_forgot_attempts(request, suffix):
        return bad(FORGOT_PASSWORD_VERIFY_ERROR, status.HTTP_429_TOO_MANY_REQUESTS)
    student = Student.objects(student_id=student_id, roll_number=roll_number, class_level=class_level).first()
    user = student.user if student else None
    username_key = username.lower()
    matches_username = bool(user and username_key in {user.email.lower(), user.name.lower()})
    if not student or not user or user.role != ROLE_STUDENT or not matches_username:
        record_forgot_attempt(request, suffix)
        return bad(FORGOT_PASSWORD_VERIFY_ERROR)
    return ok({"reset_token": create_forgot_password_token(user), "message": "Account verified."})


@api_view(["POST"])
def forgot_password_reset(request):
    data = request.data
    token = data.get("reset_token", "")
    new_password = data.get("new_password", "")
    confirm_password = data.get("confirm_password", "")
    if new_password != confirm_password:
        return bad("Passwords do not match.")
    strength_error = validate_password_strength(new_password)
    if strength_error:
        return bad(strength_error)
    payload = decode_forgot_password_token(token)
    if not payload:
        return bad(FORGOT_PASSWORD_VERIFY_ERROR)
    target = User.objects(id=payload["sub"], role=ROLE_STUDENT, is_active=True).first()
    if not target:
        return bad(FORGOT_PASSWORD_VERIFY_ERROR)
    target.update(
        password_hash=hash_password(new_password),
        first_login=False,
        force_password_change=False,
        updated_at=datetime.utcnow(),
    )
    return ok({"message": "Password changed successfully. You can now sign in with your new password."})


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
    target.update(
        password_hash=hash_password(new_password),
        first_login=force_change,
        force_password_change=force_change,
        updated_at=datetime.utcnow(),
    )
    response = {"message": "Password updated successfully"}
    if new_password == DEFAULT_PASSWORD:
        response = {"message": "Password reset to default", "default_password": DEFAULT_PASSWORD}
    return ok(response)


@api_view(["POST"])
def force_password_change(request, user_id):
    require_roles(request, [ROLE_ADMIN])
    target = User.objects(id=user_id).first()
    if not target:
        return bad("User not found", status.HTTP_404_NOT_FOUND)
    target.update(force_password_change=True, updated_at=datetime.utcnow())
    return ok({"message": "Password change will be required on next login"})


@api_view(["GET"])
def users(request):
    require_roles(request, [ROLE_ADMIN])
    return ok({"results": [user_json(user) for user in User.objects.order_by("-created_at")]})


@api_view(["GET", "POST"])
def students(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    if request.method == "GET":
        query = Student.objects
        if user.role == ROLE_TEACHER:
            teacher = get_teacher_for_user(user)
            query = query(class_level__in=teacher.assigned_classes if teacher else [])
        return ok({"results": [student_json(row) for row in query.order_by("student_id")]})
    require_roles(request, [ROLE_ADMIN])
    data = request.data
    try:
        created_user = create_user(data["email"], data["name"], ROLE_STUDENT)
        student = Student(
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
    return ok({"student": student_json(student), "default_password": DEFAULT_PASSWORD}, status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
def student_detail(request, student_id):
    require_roles(request, [ROLE_ADMIN])
    student = Student.objects(id=student_id).first()
    if not student:
        return bad("Student not found", status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        student.user.delete()
        return ok({"message": "Student deleted"})
    data = request.data
    student.update(
        name=data.get("name", student.name),
        class_level=str(data.get("class_level", student.class_level)),
        division=data.get("division", student.division),
        roll_number=str(data.get("roll_number", student.roll_number)),
        profile_photo=data.get("profile_photo", student.profile_photo),
    )
    student.user.update(name=data.get("name", student.name), updated_at=datetime.utcnow())
    return ok({"student": student_json(Student.objects(id=student_id).first())})


@api_view(["POST"])
def bulk_students(request):
    require_roles(request, [ROLE_ADMIN])
    upload = request.FILES.get("file")
    if not upload:
        return bad("Upload a CSV file with Name, Email, Class, Division, Roll Number")
    text = upload.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    created, errors = [], []
    for index, row in enumerate(reader, start=2):
        try:
            body = {
                "name": row.get("Name") or row.get("name"),
                "email": row.get("Email") or row.get("email"),
                "class_level": row.get("Class") or row.get("class"),
                "division": row.get("Division") or row.get("division"),
                "roll_number": row.get("Roll Number") or row.get("roll_number"),
            }
            new_user = create_user(body["email"], body["name"], ROLE_STUDENT)
            student = Student(
                user=new_user,
                student_id=next_code("student", "R"),
                name=body["name"],
                email=body["email"].lower().strip(),
                class_level=str(body["class_level"]),
                division=body["division"],
                roll_number=str(body["roll_number"]),
            ).save()
            created.append(student_json(student))
        except Exception as exc:
            errors.append({"row": index, "error": str(exc)})
    return ok({"created": created, "errors": errors})


@api_view(["GET", "POST"])
def teachers(request):
    require_roles(request, [ROLE_ADMIN])
    if request.method == "GET":
        return ok({"results": [teacher_json(row) for row in Teacher.objects.order_by("teacher_id")]})
    data = request.data
    try:
        created_user = create_user(data["email"], data["name"], ROLE_TEACHER)
        teacher = Teacher(
            user=created_user,
            teacher_id=next_code("teacher", "T"),
            name=data["name"],
            email=data["email"].lower().strip(),
            subjects=data.get("subjects", []),
            assigned_classes=[str(item) for item in data.get("assigned_classes", [])],
        ).save()
    except (KeyError, NotUniqueError, ValidationError) as exc:
        return bad(str(exc))
    return ok({"teacher": teacher_json(teacher), "default_password": DEFAULT_PASSWORD}, status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
def teacher_detail(request, teacher_id):
    require_roles(request, [ROLE_ADMIN])
    teacher = Teacher.objects(id=teacher_id).first()
    if not teacher:
        return bad("Teacher not found", status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        teacher.user.delete()
        return ok({"message": "Teacher deleted"})
    data = request.data
    teacher.update(
        name=data.get("name", teacher.name),
        subjects=data.get("subjects", teacher.subjects),
        assigned_classes=[str(item) for item in data.get("assigned_classes", teacher.assigned_classes)],
    )
    teacher.user.update(name=data.get("name", teacher.name), updated_at=datetime.utcnow())
    return ok({"teacher": teacher_json(Teacher.objects(id=teacher_id).first())})


@api_view(["GET"])
def dashboard(request):
    user = current_user(request)
    if user.role == ROLE_ADMIN:
        return ok(
            {
                "total_students": Student.objects.count(),
                "total_teachers": Teacher.objects.count(),
                "total_notes": Note.objects.count(),
                "total_videos": Video.objects.count(),
                "total_assignments": Assignment.objects.count(),
                "total_blogs": Blog.objects.count(),
                "attendance_records": Attendance.objects.count(),
                "marks_records": Marks.objects.count(),
                "recent_notices": [notice_json(row) for row in Notice.objects.order_by("-created_at")[:5]],
            }
        )
    if user.role == ROLE_TEACHER:
        teacher = get_teacher_for_user(user)
        assigned = teacher.assigned_classes if teacher else []
        return ok(
            {
                "profile": teacher_json(teacher),
                "assigned_classes": assigned,
                "students": Student.objects(class_level__in=assigned).count(),
                "recent_notices": [notice_json(row) for row in Notice.objects(class_level__in=assigned + ["all"]).order_by("-created_at")[:5]],
            }
        )
    student = get_student_for_user(user)
    attendance = list(Attendance.objects(student=student))
    present = len([row for row in attendance if row.status == "present"])
    marks = list(Marks.objects(student=student))
    notices = Notice.objects(class_level__in=[student.class_level, "all"]).order_by("-created_at")[:5]
    return ok(
        {
            "profile": student_json(student),
            "attendance_percentage": round((present / len(attendance)) * 100, 2) if attendance else 0,
            "marks": [marks_json(row) for row in marks[-5:]],
            "latest_notices": [notice_json(row) for row in notices],
            "current_affairs": [simple_json(row, ["title", "summary", "category", "published_on"]) for row in CurrentAffair.objects.order_by("-published_on")[:4]],
            "recent_videos": [simple_json(row, ["title", "class_level", "subject", "chapter", "youtube_url"]) for row in Video.objects(class_level=student.class_level).order_by("-created_at")[:4]],
        }
    )


@api_view(["GET", "POST", "PUT", "DELETE"])
def attendance(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    if request.method == "GET":
        if user.role == ROLE_STUDENT:
            student = get_student_for_user(user)
            rows = Attendance.objects(student=student).order_by("-date")
        elif user.role == ROLE_TEACHER:
            rows = Attendance.objects(class_level__in=teacher_assigned_classes(user)).order_by("-date")
        else:
            rows = Attendance.objects.order_by("-date")
        return ok({"results": [attendance_json(row) for row in rows]})
    require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    if request.method in ["PUT", "DELETE"]:
        row = Attendance.objects(id=request.data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Attendance not found", status.HTTP_404_NOT_FOUND)
        enforce_teacher_class(user, row.class_level)
        require_admin_for_delete(request)
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Attendance deleted"})
        status_value = request.data.get("status", row.status)
        row.update(status=status_value, marked_by=user, updated_at=datetime.utcnow())
        updated = Attendance.objects(id=row.id).first()
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
    data = request.data
    student = Student.objects(id=data.get("student")).first()
    if not student:
        return bad("Student not found", status.HTTP_404_NOT_FOUND)
    enforce_teacher_student(user, student)
    now = datetime.utcnow()
    row = Attendance.objects(student=student, date=parse_date(data.get("date"))).modify(
        upsert=True,
        new=True,
        set__class_level=student.class_level,
        set__status=data.get("status"),
        set__marked_by=user,
        set__updated_at=now,
        set_on_insert__created_at=now,
    )
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
    return ok({"message": "Attendance marked", "attendance": attendance_json(row)}, status.HTTP_201_CREATED)


@api_view(["GET"])
def attendance_audit(request):
    require_roles(request, [ROLE_ADMIN])
    return ok({"results": []})


@api_view(["POST"])
def attendance_lock(request, attendance_id, locked):
    require_roles(request, [ROLE_ADMIN])
    row = Attendance.objects(id=attendance_id).first()
    if not row:
        return bad("Attendance not found", status.HTTP_404_NOT_FOUND)
    return ok({"message": "Attendance locked" if locked else "Attendance unlocked", "attendance": attendance_json(row)})


@api_view(["GET", "POST", "PUT", "DELETE"])
def marks(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    if request.method == "GET":
        if user.role == ROLE_STUDENT:
            rows = Marks.objects(student=get_student_for_user(user))
        elif user.role == ROLE_TEACHER:
            rows = Marks.objects(class_level__in=teacher_assigned_classes(user))
        else:
            rows = Marks.objects
        return ok({"results": [marks_json(row) for row in rows.order_by("-created_at")]})
    require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    if request.method in ["PUT", "DELETE"]:
        row = Marks.objects(id=request.data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Marks not found", status.HTTP_404_NOT_FOUND)
        enforce_teacher_class(user, row.class_level)
        require_admin_for_delete(request)
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Marks deleted"})
        data = request.data
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
    data = request.data
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


def class_scoped_query(request, model):
    user = current_user(request)
    query = model.objects
    class_level = request.GET.get("class_level")
    if user.role == ROLE_STUDENT:
        student = get_student_for_user(user)
        query = query(class_level__in=[student.class_level, "all"] if model == Notice else [student.class_level])
    elif user.role == ROLE_TEACHER:
        assigned = teacher_assigned_classes(user)
        allowed = assigned + ["all"] if model == Notice else assigned
        query = query(class_level__in=allowed)
        if class_level:
            query = query(class_level=class_level) if class_level in allowed else query(class_level="__none__")
    elif class_level:
        query = query(class_level=class_level)
    return user, query


@api_view(["GET", "POST", "PUT", "DELETE"])
def notices(request):
    user, query = class_scoped_query(request, Notice)
    if request.method == "GET":
        return ok({"results": [notice_json(row) for row in query.order_by("-created_at")]})
    require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    if request.method in ["PUT", "DELETE"]:
        row = Notice.objects(id=request.data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Notice not found", status.HTTP_404_NOT_FOUND)
        enforce_teacher_class(user, row.class_level)
        enforce_owner(user, row, "created_by")
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Notice deleted"})
        data = request.data
        class_level = str(data.get("class_level", row.class_level))
        enforce_teacher_class(user, class_level)
        row.update(title=data.get("title", row.title), body=data.get("body", row.body), class_level=class_level, updated_at=datetime.utcnow())
        return ok({"notice": notice_json(Notice.objects(id=row.id).first())})
    data = request.data
    enforce_teacher_class(user, str(data.get("class_level", "all")))
    row = Notice(title=data.get("title"), body=data.get("body"), class_level=str(data.get("class_level", "all")), created_by=user).save()
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
            assigned = teacher_assigned_classes(user)
            rows = Timetable.objects(class_level=class_level) if class_level in assigned else Timetable.objects(class_level__in=assigned)
            return ok({"results": [timetable_json(row) for row in rows]})
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
            assigned = teacher_assigned_classes(user)
            rows = Fee.objects(class_level=class_level) if class_level in assigned else Fee.objects(class_level__in=assigned)
            return ok({"results": [simple_json(row, ["class_level", "annual_fee", "installments", "updated_at"]) for row in rows]})
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


CONTACT_ISSUE_TYPES = ["Login Issue", "Learning Issue", "Operations Issue", "AI Tutor Issue", "Technical Issue", "Feedback", "Other"]
CONTACT_STATUSES = ["New", "In Review", "Resolved"]
CONTACT_ERROR = "Unable to send your message right now. Please try again later."


@api_view(["GET", "POST", "PUT"])
def contact_messages(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_STUDENT])
    if request.method == "GET":
        if user.role == ROLE_ADMIN:
            rows = ContactMessage.objects.order_by("-created_at")
        else:
            student = get_student_for_user(user)
            rows = ContactMessage.objects(student=student).order_by("-created_at")
        return ok({"results": [contact_message_json(row) for row in rows]})

    if request.method == "PUT":
        require_roles(request, [ROLE_ADMIN])
        row = ContactMessage.objects(id=request.data.get("id")).first()
        if not row:
            return bad("Contact message not found", status.HTTP_404_NOT_FOUND)
        status_value = request.data.get("status", row.status)
        if status_value not in CONTACT_STATUSES:
            return bad("Invalid status")
        row.update(status=status_value, updated_at=datetime.utcnow())
        return ok({"message": contact_message_json(ContactMessage.objects(id=row.id).first())})

    student = get_student_for_user(user)
    if not student:
        return bad(CONTACT_ERROR, status.HTTP_400_BAD_REQUEST)
    recent_cutoff = datetime.utcnow() - timedelta(minutes=10)
    if ContactMessage.objects(student=student, created_at__gte=recent_cutoff).count() >= 3:
        return bad(CONTACT_ERROR, status.HTTP_429_TOO_MANY_REQUESTS)
    issue_type = request.data.get("issue_type", "")
    message = request.data.get("message", "").strip()
    email = (request.data.get("email") or student.email or user.email).lower().strip()
    if issue_type not in CONTACT_ISSUE_TYPES or not message or len(message) > 2000:
        return bad(CONTACT_ERROR)
    try:
        rating = request.data.get("rating") or None
        row = ContactMessage(
            user=user,
            student=student,
            student_id=student.student_id,
            name=(request.data.get("name") or student.name).strip(),
            email=email,
            issue_type=issue_type,
            message=message,
            rating=int(rating) if rating else None,
            feedback=request.data.get("feedback", "").strip()[:1000],
        ).save()
    except (TypeError, ValueError, ValidationError) as exc:
        logger.warning("Contact message validation failed: %s", exc)
        return bad(CONTACT_ERROR)
    return ok({"message": "Your message has been sent successfully.", "contact": contact_message_json(row)}, status.HTTP_201_CREATED)


def content_view(model, fields):
    owner_field = "uploaded_by" if model in [Video, Note] else "author" if model == Blog else "created_by"

    @api_view(["GET", "POST", "PUT", "DELETE"])
    def handler(request):
        user, query = class_scoped_query(request, model)
        if request.method == "GET":
            return ok({"results": [simple_json(row, fields) for row in query.order_by("-created_at")]})
        require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
        if request.method in ["PUT", "DELETE"]:
            row = model.objects(id=request.data.get("id") or request.GET.get("id")).first()
            if not row:
                return bad("Item not found", status.HTTP_404_NOT_FOUND)
            if hasattr(row, "class_level"):
                enforce_teacher_class(user, row.class_level)
            enforce_owner(user, row, owner_field)
            if request.method == "DELETE":
                row.delete()
                return ok({"message": "Item deleted"})
            payload = {field: request.data.get(field, getattr(row, field)) for field in fields if field not in ["created_at", "uploaded_by"]}
            if "class_level" in payload:
                payload["class_level"] = str(payload["class_level"])
                enforce_teacher_class(user, payload["class_level"])
            row.update(**{f"set__{key}": value for key, value in payload.items()})
            return ok({"item": simple_json(model.objects(id=row.id).first(), fields)})
        payload = {field: request.data.get(field) for field in fields if field not in ["created_at", "uploaded_by"]}
        if "class_level" in payload:
            payload["class_level"] = str(payload["class_level"])
            enforce_teacher_class(user, payload["class_level"])
        if model in [Video, Note]:
            payload["uploaded_by"] = user
        else:
            payload["author" if model == Blog else "created_by"] = user
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


videos = content_view(Video, ["title", "class_level", "subject", "chapter", "description", "youtube_url", "created_at"])
notes = content_view(Note, ["title", "class_level", "subject", "chapter", "pdf_url", "created_at"])


@api_view(["GET", "POST", "PUT", "DELETE"])
def blogs(request):
    user = current_user(request)
    if request.method == "GET":
        return ok({"results": [simple_json(row, ["title", "category", "content", "published", "created_at"]) for row in Blog.objects(published=True).order_by("-created_at")]})
    require_roles(request, [ROLE_ADMIN])
    if request.method in ["PUT", "DELETE"]:
        row = Blog.objects(id=request.data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Blog not found", status.HTTP_404_NOT_FOUND)
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Blog deleted"})
        row.update(
            title=request.data.get("title", row.title),
            category=request.data.get("category", row.category),
            content=request.data.get("content", row.content),
            published=request.data.get("published", row.published),
        )
        return ok({"item": simple_json(Blog.objects(id=row.id).first(), ["title", "category", "content", "published", "created_at"])})
    row = Blog(title=request.data.get("title"), category=request.data.get("category"), content=request.data.get("content"), published=request.data.get("published", True), author=user).save()
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
    if request.method in ["PUT", "DELETE"]:
        row = CurrentAffair.objects(id=request.data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Current affair not found", status.HTTP_404_NOT_FOUND)
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Current affair deleted"})
        row.update(
            title=request.data.get("title", row.title),
            summary=request.data.get("summary", row.summary),
            content=request.data.get("content", row.content),
            category=request.data.get("category", row.category),
            source_url=request.data.get("source_url", row.source_url),
            source_name=request.data.get("source_name", row.source_name),
        )
        return ok({"item": simple_json(CurrentAffair.objects(id=row.id).first(), fields)})
    row = CurrentAffair(
        title=request.data.get("title"),
        summary=request.data.get("summary"),
        content=request.data.get("content", ""),
        category=request.data.get("category", "Educational News"),
        source_url=request.data.get("source_url", ""),
        source_name=request.data.get("source_name", ""),
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
    user, query = class_scoped_query(request, Assignment)
    if request.method == "GET":
        student = get_student_for_user(user) if user.role == ROLE_STUDENT else None
        results = []
        for row in query.order_by("deadline"):
            item = simple_json(row, ["title", "description", "class_level", "subject", "deadline", "created_at"])
            submissions = AssignmentSubmission.objects(assignment=row).order_by("-submitted_at")
            if user.role == ROLE_STUDENT:
                own_submission = AssignmentSubmission.objects(assignment=row, student=student).first() if student else None
                item["own_submission"] = simple_json(own_submission, ["answer_text", "file_url", "submitted_at"]) if own_submission else None
            else:
                item["submission_count"] = submissions.count()
                item["submissions"] = [
                    {
                        **simple_json(submission, ["answer_text", "file_url", "submitted_at"]),
                        "student": student_json(submission.student) if submission.student else None,
                    }
                    for submission in submissions
                ]
            results.append(item)
        return ok({"results": results})
    require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    if request.method in ["PUT", "DELETE"]:
        row = Assignment.objects(id=request.data.get("id") or request.GET.get("id")).first()
        if not row:
            return bad("Assignment not found", status.HTTP_404_NOT_FOUND)
        enforce_teacher_class(user, row.class_level)
        enforce_owner(user, row, "created_by")
        if request.method == "DELETE":
            row.delete()
            return ok({"message": "Assignment deleted"})
        data = request.data
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
    data = request.data
    enforce_teacher_class(user, str(data.get("class_level")))
    row = Assignment(
        title=data.get("title"),
        description=data.get("description"),
        class_level=str(data.get("class_level")),
        subject=data.get("subject"),
        deadline=parse_date(data.get("deadline")),
        created_by=user,
    ).save()
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


@api_view(["POST"])
def assignment_submit(request, assignment_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    assignment = Assignment.objects(id=assignment_id).first()
    if not assignment or assignment.class_level != student.class_level:
        return bad("Assignment not found", status.HTTP_404_NOT_FOUND)
    row = AssignmentSubmission(
        assignment=assignment,
        student=student,
        answer_text=request.data.get("answer_text", ""),
        file_url=request.data.get("file_url", ""),
    ).save()
    return ok({"submission": simple_json(row, ["answer_text", "file_url", "submitted_at"])}, status.HTTP_201_CREATED)


@api_view(["GET"])
def notifications(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    rows = Notification.objects(recipient=user, dismissed=False).order_by("-created_at")[:75]
    unread = Notification.objects(recipient=user, dismissed=False, is_read=False).count()
    return ok({"results": [notification_json(row) for row in rows], "unread": unread})


@api_view(["POST"])
def notifications_mark_all_read(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    Notification.objects(recipient=user, dismissed=False, is_read=False).update(
        set__is_read=True,
        set__updated_at=datetime.utcnow(),
    )
    return ok({"message": "Notifications marked read"})


@api_view(["POST"])
def notification_mark_read(request, notification_id):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    row = Notification.objects(id=notification_id, recipient=user, dismissed=False).first()
    if not row:
        return bad("Notification not found", status.HTTP_404_NOT_FOUND)
    row.update(is_read=True, updated_at=datetime.utcnow())
    return ok({"notification": notification_json(Notification.objects(id=row.id).first())})


@api_view(["DELETE"])
def notification_dismiss(request, notification_id):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    row = Notification.objects(id=notification_id, recipient=user, dismissed=False).first()
    if not row:
        return bad("Notification not found", status.HTTP_404_NOT_FOUND)
    row.update(dismissed=True, updated_at=datetime.utcnow())
    return ok({"message": "Notification dismissed"})


AI_USAGE_LIMIT_MESSAGE = "Your AI usage limit has been reached. Please try again later."
AI_TEMPORARY_FAILURE_MESSAGE = "AI service is temporarily unavailable. Please try again later."


def safe_ai_error_message(exc):
    text = str(exc).lower()
    usage_limit_markers = [
        "429",
        "503",
        "resource_exhausted",
        "unavailable",
        "quota",
        "rate limit",
        "model overloaded",
        "overloaded",
        "high demand",
    ]
    if any(marker in text for marker in usage_limit_markers):
        return AI_USAGE_LIMIT_MESSAGE
    return AI_TEMPORARY_FAILURE_MESSAGE


@api_view(["GET", "POST"])
def ai_chat(request):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    if request.method == "GET":
        rows = ChatHistory.objects(student=student).order_by("-updated_at")
        return ok({"results": [{"id": str(row.id), "subject": row.subject, "messages": [msg.to_mongo().to_dict() for msg in row.messages]} for row in rows]})
    subject = request.data.get("subject", "General")
    prompt = request.data.get("message", "").strip()
    if not prompt:
        return bad("Message is required")
    answer = "Gemini API key is not configured. Ask your administrator to set GEMINI_API_KEY."
    if settings.GEMINI_API_KEY:
        try:
            from google import genai
            from google.genai import types

            google_api_key = os.environ.pop("GOOGLE_API_KEY", None)
            try:
                client = genai.Client(api_key=settings.GEMINI_API_KEY)
            finally:
                if google_api_key is not None:
                    os.environ["GOOGLE_API_KEY"] = google_api_key
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=f"Subject: {subject}\nQuestion: {prompt}",
                config=types.GenerateContentConfig(
                    system_instruction=(
                        "You are RedHero AI, an expert tutor for Maharashtra Board students.\n\n"
                        "Rules:\n"
                        "- Explain concepts step by step.\n"
                        "- Use simple English or Hindi when needed.\n"
                        "- Use proper Markdown formatting.\n"
                        "- Use headings, numbered steps, bullet points and tables where useful.\n"
                        "- Bold important formulas and final answers.\n"
                        "- For maths, show complete working.\n"
                        "- Never output raw Markdown symbols as plain text.\n"
                        "- Keep responses clean, readable and professional.\n"
                        "- End every answer with a short summary."
                    )
                ),
            )
            answer = response.text
        except Exception as exc:
            logger.exception("AI Tutor request failed")
            answer = safe_ai_error_message(exc)
    row = ChatHistory(student=student, subject=subject, messages=[ChatMessage(role="student", content=prompt), ChatMessage(role="assistant", content=answer)]).save()
    return ok({"chat": {"id": str(row.id), "subject": subject, "answer": answer}})
