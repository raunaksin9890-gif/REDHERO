# RedHero API

Base URL: `http://127.0.0.1:8000/api`

Use `Authorization: Bearer <access_token>` for protected endpoints.

## Authentication

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login/` | Public | Email and password login |
| GET | `/auth/me/` | Authenticated | Current user and profile |
| POST | `/auth/change-password/` | Authenticated | Change own password |
| GET | `/auth/users/` | Super Admin | List users |
| POST | `/auth/users/<user_id>/reset-password/` | Super Admin | Reset password to `RedHero@123` |

Login body:

```json
{
  "email": "student@redhero.in",
  "password": "RedHero@123"
}
```

## People

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/students/` | Super Admin, Teacher | List students |
| POST | `/students/` | Super Admin | Create student |
| PUT | `/students/<id>/` | Super Admin | Edit student |
| DELETE | `/students/<id>/` | Super Admin | Delete student |
| POST | `/students/bulk-import/` | Super Admin | Import students from CSV |
| GET | `/teachers/` | Super Admin | List teachers |
| POST | `/teachers/` | Super Admin | Create teacher |
| PUT | `/teachers/<id>/` | Super Admin | Edit teacher |
| DELETE | `/teachers/<id>/` | Super Admin | Delete teacher |

Student creation body:

```json
{
  "name": "Rahul Sharma",
  "email": "rahul@example.com",
  "class_level": "10",
  "division": "A",
  "roll_number": "12"
}
```

## Dashboard

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/dashboard/` | All roles | Role-specific dashboard data |

## Academic Operations

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET, POST | `/attendance/` | All read, Admin/Teacher write | Attendance records |
| GET, POST | `/marks/` | All read, Admin/Teacher write | Marks records |
| GET, POST | `/assignments/` | All read, Admin/Teacher write | Assignments |
| POST | `/assignments/<id>/submit/` | Student | Submit assignment |
| GET, POST | `/timetables/` | All read, Admin write | Class timetable |
| GET, POST | `/fees/` | All read, Admin write | Fee structure |

## Learning Content

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET, POST | `/notes/` | All read, Admin/Teacher write | PDF notes |
| GET, POST | `/videos/` | All read, Admin/Teacher write | YouTube lecture videos |
| GET, POST | `/notices/` | All read, Admin/Teacher write | Notice board |
| GET, POST | `/blogs/` | All read, Admin write | Educational blog posts |
| GET, POST | `/current-affairs/` | All read, Admin write | Daily current affairs |

## AI Doubt Solver

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/ai/chat/` | Student | Chat history |
| POST | `/ai/chat/` | Student | Ask AI tutor |

AI chat body:

```json
{
  "subject": "Mathematics",
  "message": "Explain quadratic equations with one example."
}
```

Set `OPENAI_API_KEY` in `backend/.env` to enable live responses.
