from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import User, UserStatus
from app.schemas import LoginRequest, MeResponse, PasswordResetConfirmRequest, RegisterRequest, TokenResponse
from app.services.permissions import get_effective_permissions

router = APIRouter(prefix="/auth", tags=["auth"])


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
    return MeResponse.model_validate({**user.__dict__, "permissions": []})


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.status != UserStatus.approved:
        err_msg = f"Tu acceso está restringido (Estado: {user.status.value})."
        if user.status_reason:
            err_msg += f" Razón: {user.status_reason}"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=err_msg)
    if user.must_reset_password:
        return TokenResponse(must_reset_password=True, reset_token=user.password_reset_token)

    permissions = get_effective_permissions(db, user)
    return TokenResponse(access_token=create_access_token(user.id, permissions))


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return MeResponse.model_validate({**user.__dict__, "permissions": get_effective_permissions(db, user)})


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def confirm_password_reset(payload: PasswordResetConfirmRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.password_reset_token == payload.token))
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")
    if user.password_reset_expires_at and user.password_reset_expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token expired")

    user.hashed_password = hash_password(payload.new_password)
    user.must_reset_password = False
    user.password_reset_token = None
    user.password_reset_expires_at = None
    db.commit()
