# RedHero

RedHero is a production-ready educational learning portal for Maharashtra Board SSC and HSC students in Classes 6 to 12.

## Stack

- React, React Router, Vite
- Django, Django REST Framework
- MongoDB through MongoEngine
- JWT authentication with email and password only
- OpenAI API integration through environment variables

## Quick Start

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python manage.py migrate
python manage.py seed_redhero
python manage.py runserver 127.0.0.1:8000
```

MongoDB must be running locally, or set `MONGODB_URI` in `backend/.env`.

Demo accounts:

- Admin: `admin@redhero.in` / `Admin@12345`
- Teacher: `teacher@redhero.in` / `RedHero@123`
- Student: `student@redhero.in` / `RedHero@123`

Teacher and student demo accounts are forced to change password on first login.

### 2. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`.

## Core Security Rules

- Public registration and public signup are disabled.
- Only admins can create student and teacher accounts.
- Unknown or unapproved users receive `Access Denied - Contact Administrator`.
- New users receive the temporary password `RedHero@123`.
- Passwords are hashed before storage.
- `first_login=true` forces a password change before dashboard access.
- Students can only access notes, videos, notices, assignments, and timetables for their own class.

## Project Layout

```text
backend/
  core/
    models.py          MongoDB collections
    views.py           REST API endpoints
    security.py        JWT and password helpers
    management/        Seed command
  redhero/
    settings.py        Django and MongoDB configuration
frontend/
  src/
    api/               API client
    components/        Auth provider and app shell
    pages/             Role dashboards and modules
    styles/            RedHero UI
docs/
  API.md
```
