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


class Notification(Document):
    recipient = ReferenceField(User, required=True, reverse_delete_rule=2)
    notification_type = StringField(required=True)
    title = StringField(required=True)
    message = StringField(required=True)
    target_url = StringField(default="")
    tone = StringField(default="red")
    icon = StringField(default="bell")
    related_object_id = StringField(default="")
    is_read = BooleanField(default=False)
    dismissed = BooleanField(default=False)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "Notifications",
        "indexes": ["recipient", "notification_type", "related_object_id", "is_read", "dismissed", "-created_at"],
    }


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
    # Legacy attendance documents may not contain a subject, so keep this optional
    # at the schema level and enforce it on new API writes.
    subject = StringField(default="")
    # Keep legacy attendance metadata readable without making it required for new records.
    leave_reason = StringField(default="")
    leave_time = DateTimeField()
    left_early = BooleanField(default=False)
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
    due_date = DateTimeField()
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Fees"}


class FeePayment(Document):
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    class_level = StringField(required=True, choices=CLASSES)
    amount = FloatField(required=True, min_value=0)
    payment_date = DateTimeField(required=True, default=datetime.utcnow)
    payment_mode = StringField(default="Cash", choices=["Cash", "UPI", "Bank Transfer", "Cheque", "Other"])
    reference = StringField(default="")
    installment = StringField(default="")
    note = StringField(default="")
    recorded_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "FeePayments", "indexes": ["student", "class_level", "-payment_date", "recorded_by"]}


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
    content = StringField(default="")
    category = StringField(default="Educational News")
    source_url = StringField(default="")
    source_name = StringField(default="")
    image_url = StringField(default="")
    generated_by_ai = BooleanField(default=False)
    digest_date = StringField(default="")
    fetched_at = DateTimeField()
    published_on = DateTimeField(default=datetime.utcnow)
    created_by = ReferenceField(User, required=True)

    meta = {"collection": "CurrentAffairs", "indexes": ["source_url", "digest_date", "-published_on"]}


class Video(Document):
    title = StringField(required=True)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    chapter = StringField(required=True)
    description = StringField(default="")
    youtube_url = StringField(required=True)
    file_name = StringField(default="")
    file_type = StringField(default="")
    file_size = IntField(default=0)
    storage_name = StringField(default="")
    uploaded_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Videos", "indexes": ["class_level", "subject", "chapter"]}


class Note(Document):
    title = StringField(required=True)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    chapter = StringField(required=True)
    pdf_url = StringField(required=True)
    file_name = StringField(default="")
    file_type = StringField(default="")
    file_size = IntField(default=0)
    storage_name = StringField(default="")
    uploaded_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Notes", "indexes": ["class_level", "subject", "chapter"]}


class NoteBookmark(Document):
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    note = ReferenceField(Note, required=True, reverse_delete_rule=2)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "NoteBookmarks",
        "indexes": [{"fields": ["student", "note"], "unique": True}, "student", "note", "-created_at"],
    }


class Assignment(Document):
    title = StringField(required=True)
    description = StringField(required=True)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    deadline = DateTimeField(required=True)
    file_url = StringField(default="")
    created_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Assignments", "indexes": ["class_level", "deadline"]}


class AssignmentSubmission(Document):
    assignment = ReferenceField(Assignment, required=True, reverse_delete_rule=2)
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    answer_text = StringField(default="")
    file_url = StringField(default="")
    status = StringField(default="submitted", choices=["submitted", "late", "reviewed"])
    submitted_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "AssignmentSubmissions", "indexes": ["assignment", "student"]}


class ExamQuestion(EmbeddedDocument):
    question_id = StringField(required=True)
    question_bank_id = StringField(default="")
    text = StringField(required=True)
    question_type = StringField(required=True, choices=["mcq", "true_false", "short", "long"])
    marks = FloatField(required=True, min_value=0)
    options = ListField(StringField(), default=list)
    correct_answer = StringField(default="")
    expected_answer = StringField(default="")
    explanation = StringField(default="")
    chapter = StringField(default="")
    difficulty = StringField(default="Medium", choices=["Easy", "Medium", "Hard"])
    order = IntField(default=0)


class Exam(Document):
    name = StringField(required=True)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    instructions = StringField(default="")
    exam_date = DateTimeField(required=True)
    start_time = DateTimeField(required=True)
    end_time = DateTimeField(required=True)
    duration_minutes = IntField(required=True, min_value=1)
    total_marks = FloatField(required=True, min_value=0)
    passing_marks = FloatField(default=0)
    negative_marking_enabled = BooleanField(default=False)
    negative_marking_penalty = FloatField(default=0, min_value=0)
    is_published = BooleanField(default=False)
    result_published = BooleanField(default=False)
    questions = EmbeddedDocumentListField(ExamQuestion, default=list)
    created_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "Exams", "indexes": ["class_level", "subject", "is_published", "result_published", "start_time", "end_time"]}


class ExamAnswer(EmbeddedDocument):
    question_id = StringField(required=True)
    answer = StringField(default="")
    marks_awarded = FloatField(default=0)
    feedback = StringField(default="")
    auto_graded = BooleanField(default=False)
    evaluated = BooleanField(default=False)


class ExamAttempt(Document):
    exam = ReferenceField(Exam, required=True, reverse_delete_rule=2)
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    started_at = DateTimeField(required=True)
    deadline = DateTimeField(required=True)
    submitted_at = DateTimeField()
    status = StringField(default="in_progress", choices=["in_progress", "submitted", "expired", "evaluated"])
    answers = EmbeddedDocumentListField(ExamAnswer, default=list)
    objective_score = FloatField(default=0)
    descriptive_score = FloatField(default=0)
    score = FloatField(default=0)
    positive_marks = FloatField(default=0)
    negative_deduction = FloatField(default=0, min_value=0)
    correct_count = IntField(default=0, min_value=0)
    wrong_count = IntField(default=0, min_value=0)
    unanswered_count = IntField(default=0, min_value=0)
    feedback = StringField(default="")
    evaluated_by = ReferenceField(User)
    evaluated_at = DateTimeField()
    violation_count = IntField(default=0)
    last_violation_at = DateTimeField()
    auto_submitted = BooleanField(default=False)
    auto_submit_reason = StringField(default="")
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "ExamAttempts", "indexes": ["exam", "student", "status", "deadline"]}


class QuestionBankQuestion(Document):
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    chapter = StringField(required=True)
    question_type = StringField(required=True, choices=["mcq", "true_false", "short", "long"])
    difficulty = StringField(default="Medium", choices=["Easy", "Medium", "Hard"])
    text = StringField(required=True)
    options = ListField(StringField(), default=list)
    correct_answer = StringField(default="")
    expected_answer = StringField(default="")
    explanation = StringField(default="")
    marks = FloatField(default=1, min_value=0)
    created_by = ReferenceField(User, required=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "QuestionBankQuestions",
        "indexes": ["class_level", "subject", "chapter", "difficulty", "question_type", "created_by", "-created_at"],
    }


class PracticeAnswer(EmbeddedDocument):
    question = ReferenceField(QuestionBankQuestion)
    answer = StringField(default="")
    correct = BooleanField(default=False)
    marks_awarded = FloatField(default=0)
    answered_at = DateTimeField()


class PracticeSession(Document):
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    session_type = StringField(default="daily", choices=["daily", "mistakes"])
    session_date = StringField(required=True)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(default="")
    status = StringField(default="in_progress", choices=["in_progress", "submitted"])
    questions = ListField(ReferenceField(QuestionBankQuestion), default=list)
    answers = EmbeddedDocumentListField(PracticeAnswer, default=list)
    total_questions = IntField(default=0)
    correct_count = IntField(default=0)
    incorrect_count = IntField(default=0)
    score = FloatField(default=0)
    accuracy = FloatField(default=0)
    topic_performance = ListField(DictField(), default=list)
    started_at = DateTimeField(default=datetime.utcnow)
    submitted_at = DateTimeField()
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "PracticeSessions", "indexes": ["student", "session_date", "session_type", "status", "-started_at"]}


class StudentMistake(Document):
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    question = ReferenceField(QuestionBankQuestion, required=True, reverse_delete_rule=2)
    source = StringField(default="practice", choices=["practice", "exam"])
    subject = StringField(required=True)
    chapter = StringField(required=True)
    last_answer = StringField(default="")
    correct_answer = StringField(default="")
    explanation = StringField(default="")
    wrong_attempts = IntField(default=0)
    retry_attempts = IntField(default=0)
    correct_streak = IntField(default=0)
    resolved = BooleanField(default=False)
    last_wrong_at = DateTimeField()
    last_retry_at = DateTimeField()
    last_retry_answer = StringField(default="")
    last_retry_correct = BooleanField(default=False)
    corrected_at = DateTimeField()
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "StudentMistakes", "indexes": ["student", "question", "subject", "chapter", "resolved", "-last_wrong_at"]}


class TopicPerformance(Document):
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    class_level = StringField(required=True, choices=CLASSES)
    subject = StringField(required=True)
    chapter = StringField(required=True)
    attempts = IntField(default=0)
    correct = IntField(default=0)
    accuracy = FloatField(default=0)
    status = StringField(default="Needs Practice", choices=["Strong", "Needs Practice", "Weak"])
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "TopicPerformance", "indexes": ["student", "class_level", "subject", "chapter", "status", "-updated_at"]}


class StudyPlanTask(EmbeddedDocument):
    task_id = StringField(required=True)
    title = StringField(required=True)
    category = StringField(default="Practice")
    subject = StringField(default="")
    chapter = StringField(default="")
    reason = StringField(default="")
    minutes = IntField(default=20)
    link = StringField(default="")
    source_key = StringField(default="")
    scope = StringField(default="today", choices=["today", "week"])
    status = StringField(default="Pending", choices=["Pending", "Completed", "Skipped"])
    completed = BooleanField(default=False)
    completed_at = DateTimeField()


class StudyPlan(Document):
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    plan_date = StringField(required=True)
    tasks = EmbeddedDocumentListField(StudyPlanTask, default=list)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "StudyPlans", "indexes": ["student", "plan_date", "-updated_at"]}


class ContactMessage(Document):
    user = ReferenceField(User, required=True, reverse_delete_rule=2)
    student = ReferenceField(Student, required=True, reverse_delete_rule=2)
    student_id = StringField(required=True)
    name = StringField(required=True)
    email = EmailField(required=True)
    issue_type = StringField(required=True, choices=["Login Issue", "Learning Issue", "Operations Issue", "AI Tutor Issue", "Technical Issue", "Feedback", "Other"])
    message = StringField(required=True, max_length=2000)
    rating = IntField(min_value=1, max_value=5)
    feedback = StringField(default="", max_length=1000)
    status = StringField(default="New", choices=["New", "In Review", "Resolved"])
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "ContactMessages", "indexes": ["student", "student_id", "status", "-created_at"]}


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
