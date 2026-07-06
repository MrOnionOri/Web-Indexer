from collections.abc import Generator

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.storage.database import SessionLocal
from app.storage.iam import get_current_user_from_gatestack

security = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    db: Session = Depends(get_db),
) -> dict:
    user = get_current_user_from_gatestack(request, db, credentials)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def check_permission(user: dict, required_permission: str) -> None:
    permissions = set(user.get("permissions") or [])
    is_admin = bool(user.get("is_platform_admin")) or "video_watcher:admin" in permissions
    if is_admin or required_permission in permissions:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {required_permission}")


def require_permission(permission_code: str):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        check_permission(user, permission_code)
        return user

    return dependency


def require_any_permission(permission_codes: list[str]):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        last_error = None
        for permission_code in permission_codes:
            try:
                check_permission(user, permission_code)
                return user
            except HTTPException as exc:
                last_error = exc
        raise last_error or HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission")

    return dependency
