from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from core import admin_api, views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/users/", admin_api.users),
    path("api/auth/users/<str:user_id>/reset-password/", admin_api.reset_password),
    path("api/auth/users/<str:user_id>/force-password-change/", admin_api.force_password_change),
    path("api/dashboard/", views.dashboard),
    path("api/students/", views.students),
    path("api/students/<str:student_id>/", views.student_detail),
    path("api/teachers/", views.teachers),
    path("api/teachers/<str:teacher_id>/", views.teacher_detail),
    path("api/attendance/", admin_api.attendance),
    path("api/attendance/audit/", admin_api.attendance_audit),
    path("api/attendance/<str:attendance_id>/lock/", admin_api.attendance_lock),
    path("api/attendance/<str:attendance_id>/unlock/", admin_api.attendance_unlock),
    path("api/marks/", admin_api.marks),
    path("api/notices/", admin_api.notices),
    path("api/timetables/", admin_api.timetables),
    path("api/fees/", admin_api.fees),
    path("api/videos/", views.videos),
    path("api/notes/", views.notes),
    path("api/blogs/", admin_api.blogs),
    path("api/current-affairs/", admin_api.current_affairs),
    path("api/assignments/", admin_api.assignments),
    path("api/question-bank/", admin_api.question_bank),
    path("api/practice/daily/", admin_api.daily_practice),
    path("api/practice/sessions/<str:session_id>/answers/", admin_api.practice_answer),
    path("api/practice/sessions/<str:session_id>/submit/", admin_api.practice_submit),
    path("api/practice/mistakes/", admin_api.practice_mistakes),
    path("api/practice/mistakes/<str:mistake_id>/practice-again/", admin_api.practice_again),
    path("api/practice/weak-topics/", admin_api.weak_topics),
    path("api/practice/study-plan/", admin_api.study_plan),
    path("api/practice/study-plan/tasks/<str:task_id>/complete/", admin_api.study_plan_task_complete),
    path("api/practice/analytics/", admin_api.practice_analytics),
    path("api/exams/", admin_api.exams),
    path("api/exams/<str:exam_id>/questions/", admin_api.exam_questions),
    path("api/exams/<str:exam_id>/start/", admin_api.exam_start),
    path("api/exams/<str:exam_id>/publish-results/", admin_api.exam_publish_results),
    path("api/exam-attempts/<str:attempt_id>/answers/", admin_api.exam_attempt_answer),
    path("api/exam-attempts/<str:attempt_id>/submit/", admin_api.exam_attempt_submit),
    path("api/exam-attempts/<str:attempt_id>/violation/", admin_api.exam_attempt_violation),
    path("api/exam-attempts/<str:attempt_id>/evaluate/", admin_api.exam_attempt_evaluate),
    path("api/", include("core.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
