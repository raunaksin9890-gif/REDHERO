from datetime import datetime, timedelta

from django.core.management.base import BaseCommand

from core.models import (
    DEFAULT_PASSWORD,
    ROLE_ADMIN,
    ROLE_STUDENT,
    ROLE_TEACHER,
    Assignment,
    Attendance,
    Blog,
    CurrentAffair,
    Fee,
    Marks,
    Note,
    Notice,
    Student,
    Teacher,
    Timetable,
    TimetablePeriod,
    User,
    Video,
)
from core.security import hash_password
from core.services import next_code


class Command(BaseCommand):
    help = "Seed RedHero with demo admin, teacher, student, and learning content."

    def handle(self, *args, **options):
        admin = self.ensure_user("admin@redhero.in", "RedHero Admin", ROLE_ADMIN, "Admin@12345", first_login=False)
        teacher_user = self.ensure_user("teacher@redhero.in", "Asha Patil", ROLE_TEACHER)
        student_user = self.ensure_user("student@redhero.in", "Rahul Sharma", ROLE_STUDENT)

        teacher = Teacher.objects(user=teacher_user).first() or Teacher(
            user=teacher_user,
            teacher_id=next_code("teacher", "T"),
            name=teacher_user.name,
            email=teacher_user.email,
            subjects=["Mathematics", "Science"],
            assigned_classes=["10", "12"],
        ).save()
        student = Student.objects(user=student_user).first() or Student(
            user=student_user,
            student_id=next_code("student", "R"),
            name=student_user.name,
            email=student_user.email,
            class_level="10",
            division="A",
            roll_number="12",
        ).save()

        Notice.objects(title="SSC Revision Camp", body="Class 10 revision batches begin this Monday.", class_level="10", created_by=admin).update_one(upsert=True)
        Video.objects(
            title="Quadratic Equations Basics",
            class_level="10",
            subject="Mathematics",
            chapter="Quadratic Equations",
            description="Concept lecture with solved examples.",
            youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            uploaded_by=teacher_user,
        ).update_one(upsert=True)
        Note.objects(
            title="Science Chapter 1 Notes",
            class_level="10",
            subject="Science",
            chapter="Gravitation",
            pdf_url="https://example.com/redhero/science-ch1.pdf",
            uploaded_by=teacher_user,
        ).update_one(upsert=True)
        Assignment.objects(
            title="Algebra Practice Set",
            description="Solve examples 1 to 12 from the quadratic equations worksheet.",
            class_level="10",
            subject="Mathematics",
            deadline=datetime.utcnow() + timedelta(days=7),
            created_by=teacher_user,
        ).update_one(upsert=True)
        Blog.objects(title="How to Plan SSC Revision", category="Exam Preparation", content="Use short revision cycles, mock tests, and error logs.", author=admin).update_one(upsert=True)
        CurrentAffair.objects(title="National Science Day", summary="Students should know key Indian science milestones.", category="Educational News", created_by=admin).update_one(upsert=True)
        Fee.objects(class_level="10", annual_fee=18000, installments={"term_1": 9000, "term_2": 9000}).update_one(upsert=True)
        Timetable.objects(class_level="10").modify(
            upsert=True,
            set__periods=[
                TimetablePeriod(day="Monday", time="09:00 - 10:00", subject="Mathematics", teacher=teacher.name),
                TimetablePeriod(day="Tuesday", time="10:00 - 11:00", subject="Science", teacher=teacher.name),
                TimetablePeriod(day="Wednesday", time="11:00 - 12:00", subject="English", teacher="Meera Joshi"),
            ],
        )
        Attendance(student=student, class_level="10", date=datetime.utcnow(), status="present", marked_by=teacher_user).save()
        Marks(student=student, class_level="10", subject="Mathematics", exam_type="Unit Test", marks_obtained=42, max_marks=50, added_by=teacher_user).save()

        self.stdout.write(self.style.SUCCESS("RedHero seed data ready."))
        self.stdout.write("Admin: admin@redhero.in / Admin@12345")
        self.stdout.write(f"Teacher: teacher@redhero.in / {DEFAULT_PASSWORD}")
        self.stdout.write(f"Student: student@redhero.in / {DEFAULT_PASSWORD}")

    def ensure_user(self, email, name, role, password=DEFAULT_PASSWORD, first_login=True):
        user = User.objects(email=email).first()
        if user:
            return user
        return User(
            email=email,
            name=name,
            role=role,
            password_hash=hash_password(password),
            approved=True,
            first_login=first_login,
            force_password_change=first_login,
        ).save()
