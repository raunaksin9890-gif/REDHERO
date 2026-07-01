from datetime import datetime, timezone

import jwt
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from .models import User


def hash_password(raw_password):
    return make_password(raw_password)


def verify_password(raw_password, password_hash):
    return check_password(raw_password, password_hash)


def create_token(user, token_type="access"):
    delta = settings.JWT_ACCESS_DELTA if token_type == "access" else settings.JWT_REFRESH_DELTA
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + delta).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token, expected_type="access"):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationFailed("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationFailed("Invalid token") from exc
    if payload.get("type") != expected_type:
        raise AuthenticationFailed("Invalid token type")
    return payload


def current_user(request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise AuthenticationFailed("Missing bearer token")
    payload = decode_token(auth_header.split(" ", 1)[1])
    user = User.objects(id=payload["sub"], is_active=True).first()
    if not user:
        raise AuthenticationFailed("User not found")
    return user


def require_roles(request, roles):
    user = current_user(request)
    if user.role not in roles:
        raise PermissionDenied("You do not have permission to perform this action")
    return user
