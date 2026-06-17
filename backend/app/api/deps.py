from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import ACCESS_COOKIE_NAME, decode_token
from app.db.session import get_db
from app.models import User, UserStatus
from app.services.permissions import has_permission

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials if credentials else request.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.scalar(select(User).where(User.id == payload.get("sub")))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.status != UserStatus.approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not approved")
    return user


def require_permission(permission_code: str):
    def dependency(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if not has_permission(db, user, permission_code):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission")
        return user

    return dependency
