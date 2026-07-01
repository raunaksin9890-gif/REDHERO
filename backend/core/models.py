from datetime import datetime

from mongoengine import (
    BooleanField,
    DateTimeField,
    DictField,
    Document,
    EmailField,
    EmbeddedDocument,
    EmbeddedDocumentField,
    EmbeddedDocumentListField,
    FloatField,
    IntField,
    ListField,
    ReferenceField,
    StringField,
)

ROLE_ADMIN = "super_admin"
ROLE_TEACHER = "teacher"
ROLE_STUDENT = "student"
DEFAULT_PASSWORD = "RedHero@123"
CLASSES = ["6", "7", "8", "9", "10", "11", "12"]


class Counter(Document):
    name = StringField(required=True, unique=True)
    value = IntField(default=0)

    meta = {"collection": "Counters"}


class User(Document):
    email = EmailField(required=True, unique=True)
    password_hash = StringField(required=True)
    role = StringField(required=True, choices=[ROLE_ADMIN, ROLE_TEACHER, ROLE_STUDENT])
    name = StringField(required=True)
    approved = BooleanField(default=True)
    first_login = BooleanField(default=True)
    is_active = BooleanField(default=True)
    force_password_change = BooleanField(default=False)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Users", "indexes": ["email", "role"]}


class Student(Document):
    user = ReferenceField(User, required=True, unique=True, reverse_delete_rule=2)
    student_id = StringField(required=True, unique=True)
    name = StringField(required=True)
    email = EmailField(required=True, unique=True)
    class_level = StringField(required=True, choices=CLASSES)
    division = StringField(required=True)
    roll_number = StringField(required=True)
    profile_photo = StringField(default="")
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Students", "indexes": ["student_id", "class_level", "email"]}


class Teacher(Document):
    user = ReferenceField(User, required=True, unique=True, reverse_delete_rule=2)
    teacher_id = StringField(required=True, unique=True)
    name = StringField(required=True)
    email = EmailField(required=True, unique=True)
    subjects = ListField(StringField(), default=list)
    assigned_classes = ListField(StringField(choices=CLASSES), default=list)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Teachers", "indexes": ["teacher_id", "email"]}


class Attendance(Document):
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    class_level = StringField(required=True, choices=CLASSES)
    date = DateTimeField(required=True)
    status = StringField(required=True, choices=["present", "absent"])
    marked_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Attendance", "indexes": ["student", "class_level", "date"]}


class Marks(Document):
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    exam_type = StringField(required=True, choices=["Unit Test", "Semester Exam", "Final Exam"])
    marks_obtained = FloatField(required=True)
    max_marks = FloatField(required=True)
    added_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Marks", "indexes": ["student", "class_level", "exam_type"]}


class Notice(Document):
    title = StringField(required=True)
    body = StringField(required=True)
    class_level = StringField(choices=CLASSES + ["all"], default="all")
    created_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Notices", "indexes": ["class_level", "-created_at"]}


class TimetablePeriod(EmbeddedDocument):
    day = StringField(required=True)
    time = StringField(required=True)
    subject = StringField(required=True)
    teacher = StringField(default="")


class Timetable(Document):
    class_level = StringField(required=True, unique=True, choices=CLASSES)
    periods = EmbeddedDocumentListField(TimetablePeriod, default=list)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Timetables"}


class Fee(Document):
    class_level = StringField(required=True, unique=True, choices=CLASSES)
    annual_fee = FloatField(required=True)
    installments = DictField(default=dict)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Fees"}


class Blog(Document):
    title = StringField(required=True)
    category = StringField(required=True, choices=["Study Tips", "Career Guidance", "Learning Techniques", "Exam Preparation"])
    content = StringField(required=True)
    author = ReferenceField(User, required=True)
    published = BooleanField(default=True)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Blogs", "indexes": ["category", "-created_at"]}


class CurrentAffair(Document):
    title = StringField(required=True)
    summary = StringField(required=True)
    category = StringField(default="Educational News")
    published_on = DateTimeField(default=datetime.utcnow)
    created_by = ReferenceField(User, required=True)

    meta = {"collection": "CurrentAffairs", "indexes": ["-published_on"]}


class Video(Document):
    title = StringField(required=True)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    chapter = StringField(required=True)
    description = StringField(default="")
    youtube_url = StringField(required=True)
    uploaded_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Videos", "indexes": ["class_level", "subject", "chapter"]}


class Note(Document):
    title = StringField(required=True)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    chapter = StringField(required=True)
    pdf_url = StringField(required=True)
    uploaded_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Notes", "indexes": ["class_level", "subject", "chapter"]}


class Assignment(Document):
    title = StringField(required=True)
    description = StringField(required=True)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    deadline = DateTimeField(required=True)
    created_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Assignments", "indexes": ["class_level", "deadline"]}


class AssignmentSubmission(Document):
    assignment = ReferenceField(Assignment, required=True, reverse_delete_rule=2)
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    answer_text = StringField(default="")
    file_url = StringField(default="")
    submitted_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "AssignmentSubmissions", "indexes": ["assignment", "student"]}


class ChatMessage(EmbeddedDocument):
    role = StringField(required=True, choices=["student", "assistant"])
    content = StringField(required=True)
    created_at = DateTimeField(default=datetime.utcnow)


class ChatHistory(Document):
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    subject = StringField(required=True)
    messages = EmbeddedDocumentListField(ChatMessage, default=list)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "ChatHistory", "indexes": ["student", "-updated_at"]}
