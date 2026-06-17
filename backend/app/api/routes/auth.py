from collections import defaultdict, deque
from datetime import datetime
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.crypto import reset_token_digest, verify_reset_token
from app.core.config import get_settings
from app.core.security import (
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    create_access_token,
    create_csrf_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models import User, UserBadge, UserBadgeAssignment, UserStatus
from app.schemas import BadgeRead, LoginRequest, MeResponse, PasswordResetConfirmRequest, RegisterRequest, TokenResponse
from app.services.permissions import get_effective_permissions

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
AUTH_RATE_LIMIT_WINDOW_SECONDS = 60
AUTH_RATE_LIMIT_MAX_ATTEMPTS = 8
_auth_attempts: dict[str, deque[float]] = defaultdict(deque)


def rate_limit_auth(request: Request, email: str) -> None:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    client_host = forwarded_for.split(",", 1)[0].strip() or (request.client.host if request.client else "unknown")
    key = f"{client_host}:{email.lower()}"
    now = monotonic()
    attempts = _auth_attempts[key]
    while attempts and now - attempts[0] > AUTH_RATE_LIMIT_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= AUTH_RATE_LIMIT_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts. Try again shortly.",
        )
    attempts.append(now)


def cookie_secure(request: Request) -> bool:
    if settings.environment.lower() in {"local", "development", "dev", "test"}:
        return request.url.scheme == "https"
    return True


def set_session_cookies(response: Response, request: Request, access_token: str) -> None:
    secure = cookie_secure(request)
    max_age = settings.access_token_expire_minutes * 60
    response.delete_cookie("gatestack_token", path="/", secure=secure, samesite="lax")
    response.set_cookie(
        ACCESS_COOKIE_NAME,
        access_token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        create_csrf_token(),
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookies(response: Response, request: Request) -> None:
    secure = cookie_secure(request)
    for cookie_name in (ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME, "gatestack_token"):
        response.delete_cookie(cookie_name, path="/", secure=secure, samesite="lax")


@router.post("/register", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        status=UserStatus.pending,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return MeResponse.model_validate({**user.__dict__, "permissions": [], "badges": []})


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_limit_auth(request, payload.email)
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.status != UserStatus.approved:
        err_msg = f"Tu acceso está restringido (Estado: {user.status.value})."
        if user.status_reason:
            err_msg += f" Razón: {user.status_reason}"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=err_msg)
    if user.must_reset_password:
        return TokenResponse(must_reset_password=True)

    permissions = get_effective_permissions(db, user)
    access_token = create_access_token(user.id, permissions)
    set_session_cookies(response, request, access_token)
    return TokenResponse()


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response):
    clear_session_cookies(response, request)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    badges = db.scalars(
        select(UserBadge)
        .join(UserBadgeAssignment, UserBadgeAssignment.badge_id == UserBadge.id)
        .where(UserBadgeAssignment.user_id == user.id)
        .order_by(UserBadge.label)
    ).all()
    return MeResponse.model_validate(
        {
            **user.__dict__,
            "permissions": get_effective_permissions(db, user),
            "badges": [BadgeRead.model_validate(badge) for badge in badges],
        }
    )


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def confirm_password_reset(payload: PasswordResetConfirmRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit_auth(request, payload.token[:12])
    token_digest = reset_token_digest(payload.token)
    user = db.scalar(select(User).where(User.password_reset_token == token_digest))
    if not user:
        legacy_user = db.scalar(select(User).where(User.password_reset_token == payload.token))
        if legacy_user and verify_reset_token(payload.token, legacy_user.password_reset_token):
            user = legacy_user
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")
    if user.password_reset_expires_at and user.password_reset_expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token expired")

    user.hashed_password = hash_password(payload.new_password)
    user.must_reset_password = False
    user.password_reset_token = None
    user.password_reset_expires_at = None
    db.commit()
