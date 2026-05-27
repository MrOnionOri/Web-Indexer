from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models import AuditLog, RegisteredApp, User
from app.schemas import AppCreateRequest, AppRead

router = APIRouter(prefix="/apps", tags=["apps"])


@router.get("", response_model=list[AppRead])
def list_apps(_: User = Depends(require_permission("apps:view")), db: Session = Depends(get_db)):
    return db.scalars(select(RegisteredApp).order_by(RegisteredApp.name)).all()


@router.post("", response_model=AppRead, status_code=status.HTTP_201_CREATED)
def create_app(
    payload: AppCreateRequest,
    actor: User = Depends(require_permission("apps:manage")),
    db: Session = Depends(get_db),
):
    if db.scalar(select(RegisteredApp).where(RegisteredApp.slug == payload.slug)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="App slug already exists")

    app = RegisteredApp(**payload.model_dump(), owner_user_id=actor.id)
    db.add(app)
    db.flush()
    db.add(AuditLog(actor_user_id=actor.id, action="apps.created", target_type="app", target_id=app.id))
    db.commit()
    db.refresh(app)
    return app
