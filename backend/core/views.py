import csv
import io
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

import jwt
from bson.dbref import DBRef
from django.conf import settings
from django.core.files.storage import default_storage
from django.http import HttpResponse
from django.utils.text import get_valid_filename
from mongoengine.errors import NotUniqueError, ValidationError
from mongoengine.queryset.visitor import Q
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
    CLASSES,
    ContactMessage,
    CurrentAffair,
    Fee,
    Marks,
    Note,
    NoteBookmark,
    Notice,
    Notification,
    PracticeSession,
    QuestionBankQuestion,
    Student,
    Teacher,
    Timetable,
    TimetablePeriod,
    User,
    Video,
)
from .notifications import notify_admins, notify_all_students, notify_student, notify_students_for_class
from .current_affairs import maybe_auto_update_current_affairs
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
DASHBOARD_ATTENDANCE_FIELDS = frozenset(
    {"_id", "student", "class_level", "date", "status", "marked_by", "created_at", "updated_at"}
)
DASHBOARD_MARKS_FIELDS = frozenset(
    {"_id", "student", "class_level", "subject", "exam_type", "marks_obtained", "max_marks", "added_by", "created_at"}
)
DASHBOARD_PRACTICE_SESSION_FIELDS = frozenset(
    {
        "_id",
        "student",
        "session_type",
        "session_date",
        "class_level",
        "subject",
        "status",
        "questions",
        "answers",
        "total_questions",
        "correct_count",
        "incorrect_count",
        "score",
        "accuracy",
        "topic_performance",
        "started_at",
        "submitted_at",
        "updated_at",
    }
)

LEARNING_DOCUMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
    ".txt", ".csv", ".rtf", ".odt", ".ods", ".odp", ".jpg",
    ".jpeg", ".png", ".webp",
}
LEARNING_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"}
LEARNING_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024
LEARNING_VIDEO_MAX_BYTES = 500 * 1024 * 1024
LEARNING_UPLOAD_FIELDS = {"file_name", "file_type", "file_size", "storage_name"}


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


def visible_class_levels(user):
    if user.role == ROLE_ADMIN:
        return list(CLASSES)
    if user.role == ROLE_TEACHER:
        return teacher_assigned_classes(user)
    student = get_student_for_user(user)
    return [student.class_level] if student else []


def raw_reference_id(value):
    if isinstance(value, DBRef):
        return value.id
    if isinstance(value, dict):
        return value.get("$id") or value.get("id")
    return value


def raw_reference_key(value):
    ref_id = raw_reference_id(value)
    return str(ref_id) if ref_id else ""


def dashboard_student_query(student):
    collection_name = Student._get_collection().name
    return {"student": {"$in": [student.id, DBRef(collection_name, student.id)]}}


def dashboard_raw_rows(model, query, expected_fields, context):
    rows = list(model._get_collection().find(query))
    for row in rows:
        extra_fields = sorted(set(row.keys()) - expected_fields)
        if extra_fields:
            logger.warning(
                "Ignoring legacy fields on %s dashboard row %s for %s: %s",
                model.__name__,
                row.get("_id"),
                context,
                ", ".join(extra_fields),
            )
    return rows


def dashboard_float(value, default=0.0):
    try:
        return float(value or default)
    except (TypeError, ValueError):
        return default


def dashboard_int(value, default=0):
    try:
        return int(value or default)
    except (TypeError, ValueError):
        return default


def dashboard_marks_json(row, student):
    marks_obtained = dashboard_float(row.get("marks_obtained"))
    max_marks = dashboard_float(row.get("max_marks"))
    percent = round((marks_obtained / max_marks) * 100, 2) if max_marks else 0
    return {
        "id": str(row.get("_id")) if row.get("_id") else None,
        "student": student_json(student) if student else None,
        "class_level": row.get("class_level", ""),
        "subject": row.get("subject", ""),
        "exam_type": row.get("exam_type", ""),
        "marks_obtained": marks_obtained,
        "max_marks": max_marks,
        "percentage": percent,
    }


def practice_streak_json(student):
    rows = dashboard_raw_rows(
        PracticeSession,
        {**dashboard_student_query(student), "status": "submitted"},
        DASHBOARD_PRACTICE_SESSION_FIELDS,
        f"student {student.id} practice streak",
    )
    practice_dates = set()
    for row in rows:
        value = row.get("session_date")
        try:
            practice_dates.add(datetime.strptime(value, "%Y-%m-%d").date())
        except (TypeError, ValueError):
            continue

    today = datetime.utcnow().date()
    yesterday = today - timedelta(days=1)
    cursor = today if today in practice_dates else yesterday if yesterday in practice_dates else None
    current_streak = 0
    while cursor and cursor in practice_dates:
        current_streak += 1
        cursor -= timedelta(days=1)

    longest_streak = 0
    running = 0
    previous = None
    for practice_date in sorted(practice_dates):
        running = running + 1 if previous and practice_date == previous + timedelta(days=1) else 1
        longest_streak = max(longest_streak, running)
        previous = practice_date

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "practiced_today": today in practice_dates,
        "total_practice_days": len(practice_dates),
        "last_practice": max(practice_dates).isoformat() if practice_dates else None,
    }


def class_leaderboard(class_level, current_student=None, limit=10):
    students = list(Student.objects(class_level=class_level).order_by("name"))
    student_ids = {str(student.id) for student in students}
    practice_totals = {}
    mark_totals = {}

    practice_rows = dashboard_raw_rows(
        PracticeSession,
        {"class_level": class_level, "status": "submitted"},
        DASHBOARD_PRACTICE_SESSION_FIELDS,
        f"class {class_level} leaderboard",
    )
    for session in practice_rows:
        student_id = raw_reference_key(session.get("student"))
        if student_id not in student_ids:
            logger.warning(
                "Skipping PracticeSession %s in dashboard leaderboard because student reference %s is missing or outside class %s",
                session.get("_id"),
                student_id or "<empty>",
                class_level,
            )
            continue
        bucket = practice_totals.setdefault(student_id, {"correct": 0, "total": 0, "sessions": 0})
        bucket["correct"] += dashboard_int(session.get("correct_count"))
        bucket["total"] += dashboard_int(session.get("total_questions"))
        bucket["sessions"] += 1

    mark_rows = dashboard_raw_rows(
        Marks,
        {"class_level": class_level},
        DASHBOARD_MARKS_FIELDS,
        f"class {class_level} leaderboard",
    )
    for mark in mark_rows:
        student_id = raw_reference_key(mark.get("student"))
        if student_id not in student_ids:
            logger.warning(
                "Skipping Marks %s in dashboard leaderboard because student reference %s is missing or outside class %s",
                mark.get("_id"),
                student_id or "<empty>",
                class_level,
            )
            continue
        bucket = mark_totals.setdefault(student_id, {"obtained": 0.0, "maximum": 0.0})
        bucket["obtained"] += dashboard_float(mark.get("marks_obtained"))
        bucket["maximum"] += dashboard_float(mark.get("max_marks"))

    rows = []
    for student in students:
        student_id = str(student.id)
        practice = practice_totals.get(student_id, {"correct": 0, "total": 0, "sessions": 0})
        marks = mark_totals.get(student_id, {"obtained": 0, "maximum": 0})
        practice_score = round((practice["correct"] / practice["total"]) * 100, 2) if practice["total"] else None
        marks_score = round((marks["obtained"] / marks["maximum"]) * 100, 2) if marks["maximum"] else None
        available_scores = [score for score in [practice_score, marks_score] if score is not None]
        combined_score = round(sum(available_scores) / len(available_scores), 2) if available_scores else 0
        rows.append(
            {
                "student_id": student_id,
                "name": student.name,
                "roll_number": student.roll_number,
                "division": student.division,
                "score": combined_score,
                "practice_score": practice_score,
                "marks_score": marks_score,
                "practice_sessions": practice["sessions"],
                "is_current": bool(current_student and student.id == current_student.id),
            }
        )

    rows.sort(key=lambda row: (-row["score"], row["name"].lower()))
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    current_rank = next((row["rank"] for row in rows if row["is_current"]), None)
    return rows[:limit], current_rank


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
def forgot_password_message_admin(request):
    data = request.data
    email = data.get("email", "").lower().strip()
    message_text = data.get("message", "").strip()
    suffix = f"message-admin:{email}"
    if too_many_forgot_attempts(request, suffix):
        return bad("Too many requests. Please try again later.", status.HTTP_429_TOO_MANY_REQUESTS)
    record_forgot_attempt(request, suffix)
    if not email or not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        return bad("Please enter a valid email address.")
    if not message_text:
        return bad("Please describe your issue in a short message.")
    target = User.objects(email=email, is_active=True).first()
    if target and target.role != ROLE_ADMIN:
        notify_admins(
            "password_reset_request",
            "Password reset requested",
            f"{target.name} ({target.email}) can't sign in and asked for a password reset. Message: \"{message_text[:300]}\"",
            target_url="/directory",
            tone="red",
            icon="key",
            related_object_id=str(target.id),
        )
    return ok({"message": "Your request has been sent to the admin. You'll be able to sign in once your password is reset."})


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
            assigned_classes = [
                str(item).strip()
                for item in (teacher.assigned_classes if teacher else [])
                if str(item).strip()
            ]
            query = query(class_level__in=assigned_classes)
        return ok({"results": [student_json(row) for row in query.order_by("student_id")]})
    require_roles(request, [ROLE_ADMIN])
    data = request.data
    created_user = None
    created_fresh_user = False
    try:
        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).lower().strip()
        class_level = str(data.get("class_level", "")).strip()
        division = str(data.get("division", "")).strip()
        roll_number = str(data.get("roll_number", "")).strip()
        if not name:
            raise ValueError("Student name is required")
        if not email:
            raise ValueError("Student email is required")
        if class_level not in CLASSES:
            raise ValueError("Select a valid class")
        if not division:
            raise ValueError("Division is required")
        if not roll_number:
            raise ValueError("Roll number is required")
        if Student.objects(email=email).first():
            raise ValueError("A student with this email already exists")

        existing_user = User.objects(email=email).first()
        if existing_user:
            if existing_user.role != ROLE_STUDENT or Student.objects(user=existing_user).first():
                raise ValueError("This email is already used by another account")
            created_user = existing_user
            created_user.update(
                name=name,
                approved=True,
                is_active=True,
                first_login=True,
                force_password_change=True,
                password_hash=hash_password(DEFAULT_PASSWORD),
                updated_at=datetime.utcnow(),
            )
        else:
            created_user = create_user(email, name, ROLE_STUDENT)
            created_fresh_user = True
        student = Student(
            user=created_user,
            student_id=next_code("student", "R"),
            name=name,
            email=email,
            class_level=class_level,
            division=division,
            roll_number=roll_number,
            profile_photo=data.get("profile_photo", ""),
        ).save()
    except (KeyError, NotUniqueError, ValidationError, ValueError) as exc:
        if created_fresh_user and created_user:
            created_user.delete()
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
    created_user = None
    created_fresh_user = False
    try:
        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).lower().strip()
        subjects = [str(item).strip() for item in data.get("subjects", []) if str(item).strip()]
        assigned_classes = [str(item).strip() for item in data.get("assigned_classes", []) if str(item).strip()]
        invalid_classes = [item for item in assigned_classes if item not in CLASSES]
        if not name:
            raise ValueError("Teacher name is required")
        if not email:
            raise ValueError("Teacher email is required")
        if not subjects:
            raise ValueError("Add at least one subject")
        if not assigned_classes:
            raise ValueError("Assign at least one class")
        if invalid_classes:
            raise ValueError(f"Invalid classes: {', '.join(invalid_classes)}")
        if Teacher.objects(email=email).first():
            raise ValueError("A teacher with this email already exists")

        existing_user = User.objects(email=email).first()
        if existing_user:
            if existing_user.role != ROLE_TEACHER or Teacher.objects(user=existing_user).first():
                raise ValueError("This email is already used by another account")
            created_user = existing_user
            created_user.update(
                name=name,
                approved=True,
                is_active=True,
                first_login=True,
                force_password_change=True,
                password_hash=hash_password(DEFAULT_PASSWORD),
                updated_at=datetime.utcnow(),
            )
        else:
            created_user = create_user(email, name, ROLE_TEACHER)
            created_fresh_user = True
        teacher = Teacher(
            user=created_user,
            teacher_id=next_code("teacher", "T"),
            name=name,
            email=email,
            subjects=subjects,
            assigned_classes=assigned_classes,
        ).save()
    except (KeyError, NotUniqueError, ValidationError, ValueError) as exc:
        if created_fresh_user and created_user:
            created_user.delete()
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
    if not student:
        return bad("Student profile not found", status.HTTP_404_NOT_FOUND)
    maybe_auto_update_current_affairs(target_count=8)
    attendance = dashboard_raw_rows(
        Attendance,
        dashboard_student_query(student),
        DASHBOARD_ATTENDANCE_FIELDS,
        f"student {student.id}",
    )
    present = len([row for row in attendance if row.get("status") == "present"])
    marks = dashboard_raw_rows(
        Marks,
        dashboard_student_query(student),
        DASHBOARD_MARKS_FIELDS,
        f"student {student.id}",
    )
    notices = Notice.objects(class_level__in=[student.class_level, "all"]).order_by("-created_at")[:5]
    leaderboard, leaderboard_rank = class_leaderboard(student.class_level, current_student=student)
    return ok(
        {
            "profile": student_json(student),
            "attendance_percentage": round((present / len(attendance)) * 100, 2) if attendance else 0,
            "marks": [dashboard_marks_json(row, student) for row in marks[-5:]],
            "latest_notices": [notice_json(row) for row in notices],
            "current_affairs": [simple_json(row, ["title", "summary", "category", "image_url", "published_on"]) for row in CurrentAffair.objects.order_by("-published_on")[:4]],
            "recent_videos": [simple_json(row, ["title", "class_level", "subject", "chapter", "youtube_url", "file_name", "file_type", "file_size"]) for row in Video.objects(class_level=student.class_level).order_by("-created_at")[:4]],
            "study_streak": practice_streak_json(student),
            "leaderboard": leaderboard,
            "leaderboard_class": student.class_level,
            "leaderboard_rank": leaderboard_rank,
        }
    )


@api_view(["GET"])
def global_search(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    search_text = request.GET.get("q", "").strip()
    if len(search_text) < 2:
        return ok({"query": search_text, "results": []})

    class_levels = visible_class_levels(user)
    if not class_levels:
        return ok({"query": search_text, "results": []})

    student_query = Student.objects(class_level__in=class_levels).filter(
        Q(name__icontains=search_text)
        | Q(student_id__icontains=search_text)
        | Q(roll_number__icontains=search_text)
    )
    note_query = Note.objects(class_level__in=class_levels).filter(
        Q(title__icontains=search_text)
        | Q(subject__icontains=search_text)
        | Q(chapter__icontains=search_text)
    )
    notice_query = Notice.objects(class_level__in=class_levels + ["all"]).filter(
        Q(title__icontains=search_text) | Q(body__icontains=search_text)
    )
    question_query = QuestionBankQuestion.objects(class_level__in=class_levels).filter(
        Q(text__icontains=search_text)
        | Q(subject__icontains=search_text)
        | Q(chapter__icontains=search_text)
    )

    if user.role == ROLE_TEACHER:
        teacher = get_teacher_for_user(user)
        if teacher and teacher.subjects:
            question_query = question_query(subject__in=teacher.subjects)

    results = []
    for student in student_query.order_by("name")[:5]:
        results.append(
            {
                "id": str(student.id),
                "type": "student",
                "title": student.name,
                "subtitle": f"Class {student.class_level} {student.division} · Roll {student.roll_number}",
                "path": "/directory" if user.role != ROLE_STUDENT else "",
            }
        )
    for note in note_query.order_by("-created_at")[:5]:
        results.append(
            {
                "id": str(note.id),
                "type": "note",
                "title": note.title,
                "subtitle": f"Class {note.class_level} · {note.subject} · {note.chapter}",
                "path": f"/learning/notes/{note.id}",
            }
        )
    for notice in notice_query.order_by("-created_at")[:5]:
        results.append(
            {
                "id": str(notice.id),
                "type": "notice",
                "title": notice.title,
                "subtitle": notice.body[:120],
                "path": f"/learning/notice-board/{notice.id}",
            }
        )
    for question in question_query.order_by("-created_at")[:5]:
        results.append(
            {
                "id": str(question.id),
                "type": "question",
                "title": question.text,
                "subtitle": f"Class {question.class_level} · {question.subject} · {question.chapter}",
                "path": "/practice-progress",
            }
        )
    return ok({"query": search_text, "results": results})


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


@api_view(["POST"])
def attendance_bulk(request):
    user = require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
    class_level = str(request.data.get("class_level", "")).strip()
    if not class_level:
        return bad("Class is required")
    enforce_teacher_class(user, class_level)

    students = list(Student.objects(class_level=class_level).order_by("roll_number"))
    if not students:
        return bad("No students found for this class", status.HTTP_404_NOT_FOUND)

    absent_ids = {str(value) for value in request.data.get("absent_student_ids", [])}
    allowed_ids = {str(student.id) for student in students}
    if not absent_ids.issubset(allowed_ids):
        return bad("One or more selected students are outside this class")

    attendance_date = parse_date(request.data.get("date"))
    if not attendance_date:
        return bad("Attendance date is required")

    now = datetime.utcnow()
    results = []
    present_count = 0
    absent_count = 0
    for student in students:
        attendance_status = "absent" if str(student.id) in absent_ids else "present"
        previous = Attendance.objects(student=student, date=attendance_date).first()
        previous_status = previous.status if previous else None
        row = Attendance.objects(student=student, date=attendance_date).modify(
            upsert=True,
            new=True,
            set__class_level=student.class_level,
            set__status=attendance_status,
            set__marked_by=user,
            set__updated_at=now,
            set_on_insert__created_at=now,
        )
        results.append(attendance_json(row))
        if attendance_status == "present":
            present_count += 1
        else:
            absent_count += 1
        if previous_status != attendance_status:
            notify_student(
                student,
                "attendance",
                "Attendance",
                f"Your attendance for {attendance_date.strftime('%d %b %Y')} was marked {attendance_status}.",
                "/operations",
                "green" if attendance_status == "present" else "red",
                "attendance",
                row.id,
            )

    return ok(
        {
            "message": f"Attendance saved for {len(students)} students",
            "present_count": present_count,
            "absent_count": absent_count,
            "results": results,
        },
        status.HTTP_201_CREATED,
    )


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


def teacher_subjects(user):
    teacher = get_teacher_for_user(user)
    return teacher.subjects if teacher else []


def enforce_teacher_subject(user, subject):
    subjects = [item.lower() for item in teacher_subjects(user)]
    if user.role == ROLE_TEACHER and subjects and str(subject).lower() not in subjects:
        raise ValueError("Teachers can only manage assigned subjects")


def assignment_submission_json(submission, include_student=False):
    if not submission:
        return None
    data = {
        **simple_json(submission, ["answer_text", "file_url", "status", "submitted_at", "updated_at"]),
    }
    if include_student:
        data["student"] = student_json(submission.student) if submission.student else None
    return data


def assignment_status_for(assignment, student=None):
    own_submission = AssignmentSubmission.objects(assignment=assignment, student=student).first() if student else None
    if own_submission:
        return "Completed" if own_submission.status == "reviewed" else "Submitted"
    return "Overdue" if datetime.utcnow() > assignment.deadline else "Pending"


def assignment_manager_status(assignment, submission_count):
    if submission_count > 0:
        return "Submitted"
    return "Overdue" if datetime.utcnow() > assignment.deadline else "Pending"


def assignment_json(row, user):
    student = get_student_for_user(user) if user.role == ROLE_STUDENT else None
    data = simple_json(row, ["title", "description", "class_level", "subject", "deadline", "file_url", "created_at", "updated_at"])
    data["status"] = assignment_status_for(row, student if user.role == ROLE_STUDENT else None)
    return data


def assignment_payload(data, user, row=None):
    class_level = str(data.get("class_level", row.class_level if row else ""))
    if class_level not in CLASSES:
        raise ValueError("Select a valid class.")
    enforce_teacher_class(user, class_level)
    subject = str(data.get("subject", row.subject if row else "")).strip()
    if not subject:
        raise ValueError("Subject is required.")
    enforce_teacher_subject(user, subject)
    title = str(data.get("title", row.title if row else "")).strip()
    description = str(data.get("description", row.description if row else "")).strip()
    if not title:
        raise ValueError("Assignment title is required.")
    if not description:
        raise ValueError("Description is required.")
    if not row and not data.get("deadline"):
        raise ValueError("Due date and due time are required.")
    try:
        deadline = parse_date(data.get("deadline", row.deadline if row else None))
    except (TypeError, ValueError) as exc:
        raise ValueError("Due date/time must be valid.") from exc
    return {
        "title": title,
        "description": description,
        "class_level": class_level,
        "subject": subject,
        "deadline": deadline,
        "file_url": str(data.get("file_url", row.file_url if row else "")).strip(),
    }


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
    notify_admins(
        "contact_message",
        "Contact Message",
        f"{row.student_id} submitted {row.issue_type}: {row.message[:180]}",
        target_url="/contact-us",
        tone="red",
        icon="bell",
        related_object_id=row.id,
    )
    return ok({"message": "Your message has been sent successfully.", "contact": contact_message_json(row)}, status.HTTP_201_CREATED)


def learning_upload_config(model):
    if model == Note:
        return {
            "url_field": "pdf_url",
            "folder": "notes",
            "extensions": LEARNING_DOCUMENT_EXTENSIONS,
            "max_bytes": LEARNING_DOCUMENT_MAX_BYTES,
            "label": "document",
        }
    if model == Video:
        return {
            "url_field": "youtube_url",
            "folder": "videos",
            "extensions": LEARNING_VIDEO_EXTENSIONS,
            "max_bytes": LEARNING_VIDEO_MAX_BYTES,
            "label": "video",
        }
    return None


def validate_learning_url(value, label):
    value = str(value or "").strip()
    if not value:
        raise ValueError(f"Add a {label} URL or choose a file to upload")
    parsed = urlparse(value)
    if parsed.scheme not in ["http", "https"] and not value.startswith(settings.MEDIA_URL):
        raise ValueError("Only secure http/https links are allowed")
    return value


def store_learning_upload(model, uploaded_file):
    config = learning_upload_config(model)
    if not config:
        raise ValueError("File upload is not supported for this content type")

    original_name = get_valid_filename(os.path.basename(str(uploaded_file.name).replace("\\", "/")))
    extension = Path(original_name).suffix.lower()
    if extension not in config["extensions"]:
        allowed = ", ".join(sorted(config["extensions"]))
        raise ValueError(f"Unsupported {config['label']} file. Allowed: {allowed}")

    size = int(getattr(uploaded_file, "size", 0) or 0)
    if size <= 0:
        raise ValueError("The selected file is empty")
    if size > config["max_bytes"]:
        limit_mb = config["max_bytes"] // (1024 * 1024)
        raise ValueError(f"{config['label'].title()} must be smaller than {limit_mb} MB")

    safe_stem = get_valid_filename(Path(original_name).stem)[:80] or config["label"]
    dated_folder = datetime.utcnow().strftime("%Y/%m")
    storage_name = default_storage.save(
        f"learning/{config['folder']}/{dated_folder}/{uuid4().hex}-{safe_stem}{extension}",
        uploaded_file,
    )
    return {
        config["url_field"]: default_storage.url(storage_name),
        "file_name": original_name,
        "file_type": str(getattr(uploaded_file, "content_type", "") or ""),
        "file_size": size,
        "storage_name": storage_name,
    }


def delete_learning_upload(row):
    storage_name = str(getattr(row, "storage_name", "") or "").strip()
    if not storage_name:
        # Backward-compatible cleanup for uploads created before storage_name existed.
        value = str(getattr(row, "pdf_url", "") or getattr(row, "youtube_url", "") or "")
        media_path = unquote(urlparse(value).path)
        if media_path.startswith(settings.MEDIA_URL):
            candidate = media_path[len(settings.MEDIA_URL):].lstrip("/")
            if candidate.startswith("learning/"):
                storage_name = candidate
    if storage_name and default_storage.exists(storage_name):
        default_storage.delete(storage_name)


def content_view(model, fields):
    owner_field = "uploaded_by" if model in [Video, Note] else "author" if model == Blog else "created_by"
    upload_config = learning_upload_config(model)
    read_only_fields = {"created_at", "uploaded_by"} | LEARNING_UPLOAD_FIELDS

    @api_view(["GET", "POST", "PUT", "DELETE"])
    def handler(request):
        user, query = class_scoped_query(request, model)
        if request.method == "GET":
            rows = list(query.order_by("-created_at"))
            results = [simple_json(row, fields) for row in rows]
            if model == Note and user.role == ROLE_STUDENT:
                student = get_student_for_user(user)
                bookmarked_ids = {str(row.note.id) for row in NoteBookmark.objects(student=student, note__in=rows)} if student else set()
                for item in results:
                    item["bookmarked"] = item["id"] in bookmarked_ids
            return ok({"results": results})
        require_roles(request, [ROLE_ADMIN, ROLE_TEACHER])
        if request.method in ["PUT", "DELETE"]:
            row = model.objects(id=request.data.get("id") or request.GET.get("id")).first()
            if not row:
                return bad("Item not found", status.HTTP_404_NOT_FOUND)
            if hasattr(row, "class_level"):
                enforce_teacher_class(user, row.class_level)
            enforce_owner(user, row, owner_field)
            if request.method == "DELETE":
                if upload_config:
                    delete_learning_upload(row)
                row.delete()
                return ok({"message": "Item deleted"})
            payload = {field: request.data.get(field, getattr(row, field)) for field in fields if field not in read_only_fields}
            if "class_level" in payload:
                payload["class_level"] = str(payload["class_level"])
                enforce_teacher_class(user, payload["class_level"])
            old_storage_name = str(getattr(row, "storage_name", "") or "")
            uploaded_file = request.FILES.get("file") if upload_config else None
            new_upload = None
            try:
                if uploaded_file:
                    new_upload = store_learning_upload(model, uploaded_file)
                    payload.update(new_upload)
                elif upload_config and upload_config["url_field"] in request.data:
                    url_field = upload_config["url_field"]
                    payload[url_field] = validate_learning_url(payload.get(url_field), upload_config["label"])
                    if payload[url_field] != getattr(row, url_field):
                        payload.update({"file_name": "", "file_type": "", "file_size": 0, "storage_name": ""})
                row.update(**{f"set__{key}": value for key, value in payload.items()})
            except (OSError, ValueError, ValidationError) as exc:
                if new_upload and new_upload.get("storage_name"):
                    default_storage.delete(new_upload["storage_name"])
                return bad(str(exc))
            if old_storage_name and (uploaded_file or payload.get("storage_name") == ""):
                if default_storage.exists(old_storage_name):
                    default_storage.delete(old_storage_name)
            return ok({"item": simple_json(model.objects(id=row.id).first(), fields)})
        payload = {field: request.data.get(field) for field in fields if field not in read_only_fields}
        if "class_level" in payload:
            payload["class_level"] = str(payload["class_level"])
            enforce_teacher_class(user, payload["class_level"])
        if model in [Video, Note]:
            payload["uploaded_by"] = user
        else:
            payload["author" if model == Blog else "created_by"] = user
        new_upload = None
        try:
            if upload_config:
                uploaded_file = request.FILES.get("file")
                if uploaded_file:
                    new_upload = store_learning_upload(model, uploaded_file)
                    payload.update(new_upload)
                else:
                    url_field = upload_config["url_field"]
                    payload[url_field] = validate_learning_url(payload.get(url_field), upload_config["label"])
            row = model(**payload).save()
        except (OSError, ValueError, ValidationError) as exc:
            if new_upload and new_upload.get("storage_name"):
                default_storage.delete(new_upload["storage_name"])
            return bad(str(exc))
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


videos = content_view(Video, ["title", "class_level", "subject", "chapter", "description", "youtube_url", "file_name", "file_type", "file_size", "created_at"])
notes = content_view(Note, ["title", "class_level", "subject", "chapter", "pdf_url", "file_name", "file_type", "file_size", "created_at"])


@api_view(["GET", "POST", "DELETE"])
def note_bookmark(request, note_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    if not student:
        return bad("Student profile not found", status.HTTP_404_NOT_FOUND)
    note = Note.objects(id=note_id, class_level=student.class_level).first()
    if not note:
        return bad("Note not found", status.HTTP_404_NOT_FOUND)

    existing = NoteBookmark.objects(student=student, note=note).first()
    if request.method == "GET":
        return ok({"bookmarked": bool(existing)})
    if request.method == "DELETE":
        if existing:
            existing.delete()
        return ok({"bookmarked": False, "message": "Bookmark removed"})
    if not existing:
        try:
            NoteBookmark(student=student, note=note).save()
        except NotUniqueError:
            pass
    return ok({"bookmarked": True, "message": "Bookmarked"})


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
    fields = ["title", "summary", "content", "category", "source_url", "source_name", "image_url", "generated_by_ai", "digest_date", "published_on"]
    if request.method == "GET":
        maybe_auto_update_current_affairs(target_count=8)
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
            image_url=request.data.get("image_url", row.image_url),
        )
        return ok({"item": simple_json(CurrentAffair.objects(id=row.id).first(), fields)})
    row = CurrentAffair(
        title=request.data.get("title"),
        summary=request.data.get("summary"),
        content=request.data.get("content", ""),
        category=request.data.get("category", "Educational News"),
        source_url=request.data.get("source_url", ""),
        source_name=request.data.get("source_name", ""),
        image_url=request.data.get("image_url", ""),
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
            item = simple_json(row, ["title", "description", "class_level", "subject", "deadline", "file_url", "created_at", "updated_at"])
            item["status"] = assignment_status_for(row, student if user.role == ROLE_STUDENT else None)
            submissions = AssignmentSubmission.objects(assignment=row).order_by("-submitted_at")
            if user.role == ROLE_STUDENT:
                own_submission = AssignmentSubmission.objects(assignment=row, student=student).first() if student else None
                item["own_submission"] = assignment_submission_json(own_submission) if own_submission else None
            else:
                item["submission_count"] = submissions.count()
                item["submissions"] = [
                    assignment_submission_json(submission, include_student=True)
                    for submission in submissions
                ]
                item["status"] = assignment_manager_status(row, item["submission_count"])
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
        try:
            payload = assignment_payload(data, user, row)
        except ValueError as exc:
            return bad(str(exc))
        payload["updated_at"] = datetime.utcnow()
        row.update(**payload)
        return ok({"assignment": assignment_json(Assignment.objects(id=row.id).first(), user)})
    data = request.data
    try:
        payload = assignment_payload(data, user)
    except ValueError as exc:
        return bad(str(exc))
    row = Assignment(**payload, created_by=user).save()
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
    return ok({"assignment": assignment_json(row, user)}, status.HTTP_201_CREATED)


@api_view(["POST"])
def assignment_submit(request, assignment_id):
    user = require_roles(request, [ROLE_STUDENT])
    student = get_student_for_user(user)
    assignment = Assignment.objects(id=assignment_id).first()
    if not assignment or not student or assignment.class_level != student.class_level:
        return bad("Assignment not found", status.HTTP_404_NOT_FOUND)
    status_value = "late" if datetime.utcnow() > assignment.deadline else "submitted"
    row = AssignmentSubmission.objects(assignment=assignment, student=student).modify(
        upsert=True,
        new=True,
        set__answer_text=request.data.get("answer_text", ""),
        set__file_url=request.data.get("file_url", ""),
        set__status=status_value,
        set__submitted_at=datetime.utcnow(),
        set__updated_at=datetime.utcnow(),
    )
    return ok({"submission": assignment_submission_json(row)}, status.HTTP_201_CREATED)


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
    if not student:
        return bad("Student profile is not configured", status.HTTP_404_NOT_FOUND)
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
                client = genai.Client(
                    api_key=settings.GEMINI_API_KEY,
                    http_options=types.HttpOptions(
                        timeout=18000,
                        retry_options=types.HttpRetryOptions(attempts=1),
                    ),
                )
                response = None
                last_model_error = None
                for model_name in ("gemini-3.6-flash",):
                    try:
                        response = client.models.generate_content(
                            model=model_name,
                            contents=f"Subject: {subject}\nQuestion: {prompt}",
                            config=types.GenerateContentConfig(
                                max_output_tokens=1200,
                                thinking_config=types.ThinkingConfig(
                                    thinking_level=types.ThinkingLevel.MINIMAL,
                                ),
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
                                ),
                            ),
                        )
                        if (response.text or "").strip():
                            break
                    except Exception as model_exc:
                        last_model_error = model_exc
                        logger.warning("AI Tutor model %s failed: %s", model_name, model_exc.__class__.__name__)
                        response = None
                if response is None:
                    raise last_model_error or RuntimeError("No Gemini model returned a response")
            finally:
                if google_api_key is not None:
                    os.environ["GOOGLE_API_KEY"] = google_api_key
            answer = (response.text or "").strip() or "Gemini returned an empty response. Please try again."
        except Exception as exc:
            logger.exception("AI Tutor request failed")
            answer = safe_ai_error_message(exc)
    row = ChatHistory(student=student, subject=subject, messages=[ChatMessage(role="student", content=prompt), ChatMessage(role="assistant", content=answer)]).save()
    return ok({"chat": {"id": str(row.id), "subject": subject, "answer": answer}})
