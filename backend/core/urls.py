from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("auth/login/", views.login),
    path("auth/me/", views.me),
    path("auth/change-password/", views.change_password),
    path("auth/users/", views.users),
    path("auth/users/<str:user_id>/reset-password/", views.reset_password),
    path("auth/users/<str:user_id>/force-password-change/", views.force_password_change),
    path("dashboard/", views.dashboard),
    path("students/", views.students),
    path("students/bulk-import/", views.bulk_students),
    path("students/<str:student_id>/", views.student_detail),
    path("teachers/", views.teachers),
    path("teachers/<str:teacher_id>/", views.teacher_detail),
    path("attendance/", views.attendance),
    path("attendance/audit/", views.attendance_audit),
    path("attendance/<str:attendance_id>/lock/", lambda request, attendance_id: views.attendance_lock(request, attendance_id, True)),
    path("attendance/<str:attendance_id>/unlock/", lambda request, attendance_id: views.attendance_lock(request, attendance_id, False)),
    path("marks/", views.marks),
    path("notices/", views.notices),
    path("timetables/", views.timetables),
    path("fees/", views.fees),
    path("videos/", views.videos),
    path("notes/", views.notes),
    path("blogs/", views.blogs),
    path("current-affairs/", views.current_affairs),
    path("assignments/", views.assignments),
    path("assignments/<str:assignment_id>/submit/", views.assignment_submit),
    path("ai/chat/", views.ai_chat),
]
