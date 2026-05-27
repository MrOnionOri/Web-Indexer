from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import User, UserStatus
from app.schemas import LoginRequest, MeResponse, RegisterRequest, TokenResponse
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"User status is {user.status.value}")

    permissions = get_effective_permissions(db, user)
    return TokenResponse(access_token=create_access_token(user.id, permissions))


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return MeResponse.model_validate({**user.__dict__, "permissions": get_effective_permissions(db, user)})
