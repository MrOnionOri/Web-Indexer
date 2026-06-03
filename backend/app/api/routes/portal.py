from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.db.session import get_db
from app.models import AuditLog, PortalHomeSettings, User
from app.schemas import PortalHomeSettingsRead, PortalHomeSettingsUpdateRequest

router = APIRouter(prefix="/portal", tags=["portal"])


def get_or_create_home_settings(db: Session) -> PortalHomeSettings:
    settings = db.scalar(select(PortalHomeSettings).order_by(PortalHomeSettings.created_at.asc()))
    if settings:
        return settings

    settings = PortalHomeSettings()
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/home", response_model=PortalHomeSettingsRead)
def read_home_settings(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_or_create_home_settings(db)


@router.patch("/home", response_model=PortalHomeSettingsRead)
def update_home_settings(
    payload: PortalHomeSettingsUpdateRequest,
    actor: User = Depends(require_permission("portal:manage")),
    db: Session = Depends(get_db),
):
    settings = get_or_create_home_settings(db)
    for field, value in payload.model_dump().items():
        setattr(settings, field, value)

    db.add(AuditLog(actor_user_id=actor.id, action="portal.home.updated", target_type="portal_home", target_id=settings.id))
    db.commit()
    db.refresh(settings)
    return settings
