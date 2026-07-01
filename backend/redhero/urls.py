from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from core import admin_api

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/users/", admin_api.users),
    path("api/auth/users/<str:user_id>/reset-password/", admin_api.reset_password),
    path("api/auth/users/<str:user_id>/force-password-change/", admin_api.force_password_change),
    path("api/dashboard/", admin_api.dashboard),
    path("api/students/", admin_api.students),
    path("api/students/<str:student_id>/", admin_api.student_detail),
    path("api/teachers/", admin_api.teachers),
    path("api/teachers/<str:teacher_id>/", admin_api.teacher_detail),
    path("api/attendance/", admin_api.attendance),
    path("api/attendance/audit/", admin_api.attendance_audit),
    path("api/attendance/<str:attendance_id>/lock/", admin_api.attendance_lock),
    path("api/attendance/<str:attendance_id>/unlock/", admin_api.attendance_unlock),
    path("api/marks/", admin_api.marks),
    path("api/notices/", admin_api.notices),
    path("api/timetables/", admin_api.timetables),
    path("api/fees/", admin_api.fees),
    path("api/videos/", admin_api.videos),
    path("api/notes/", admin_api.notes),
    path("api/blogs/", admin_api.blogs),
    path("api/current-affairs/", admin_api.current_affairs),
    path("api/assignments/", admin_api.assignments),
    path("api/", include("core.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
