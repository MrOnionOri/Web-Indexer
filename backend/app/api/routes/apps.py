from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.db.session import get_db
from app.models import AppAccessRequest, AppAccessRequestStatus, AuditLog, OverrideEffect, Permission, RegisteredApp, User, UserPermissionOverride
from app.schemas import AppAccessRequestCreateRequest, AppAccessRequestRead, AppAccessRequestReviewRequest, AppCreateRequest, AppRead, PermissionRead
from app.services.permissions import has_permission

router = APIRouter(prefix="/apps", tags=["apps"])


@router.get("", response_model=list[AppRead])
def list_apps(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    apps = db.scalars(select(RegisteredApp).order_by(RegisteredApp.name)).all()
    return [serialize_app_for_user(db, app, user) for app in apps]


@router.get("/permission-options", response_model=list[PermissionRead])
def list_app_permission_options(_: User = Depends(require_permission("apps:manage")), db: Session = Depends(get_db)):
    return db.scalars(select(Permission).order_by(Permission.code)).all()


@router.post("", response_model=AppRead, status_code=status.HTTP_201_CREATED)
def create_app(
    payload: AppCreateRequest,
    actor: User = Depends(require_permission("apps:manage")),
    db: Session = Depends(get_db),
):
    if db.scalar(select(RegisteredApp).where(RegisteredApp.slug == payload.slug)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="App slug already exists")
    if not db.scalar(select(Permission).where(Permission.code == payload.required_permission_code)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Required permission does not exist")

    app = RegisteredApp(**payload.model_dump(), owner_user_id=actor.id)
    db.add(app)
    db.flush()
    db.add(AuditLog(actor_user_id=actor.id, action="apps.created", target_type="app", target_id=app.id))
    db.commit()
    db.refresh(app)
    return serialize_app_for_user(db, app, actor)


@router.post("/{app_id}/access-requests", response_model=AppAccessRequestRead, status_code=status.HTTP_201_CREATED)
def request_app_access(
    app_id: str,
    payload: AppAccessRequestCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    app = db.get(RegisteredApp, app_id)
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="App not found")
    required_permission_code = get_required_permission_code(db, app)
    if not required_permission_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This app has no required permission configured")
    if has_permission(db, user, required_permission_code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already have access to this app")

    existing_pending = db.scalar(
        select(AppAccessRequest).where(
            AppAccessRequest.app_id == app.id,
            AppAccessRequest.user_id == user.id,
            AppAccessRequest.status == AppAccessRequestStatus.pending,
        )
    )
    if existing_pending:
        return serialize_access_request(existing_pending)

    request = AppAccessRequest(app_id=app.id, user_id=user.id, reason=payload.reason)
    db.add(request)
    db.flush()
    db.add(AuditLog(actor_user_id=user.id, action="apps.access_requested", target_type="app", target_id=app.id))
    db.commit()
    db.refresh(request)
    return serialize_access_request(request)


@router.get("/access-requests", response_model=list[AppAccessRequestRead])
def list_app_access_requests(_: User = Depends(require_permission("apps:manage")), db: Session = Depends(get_db)):
    requests = db.scalars(select(AppAccessRequest).order_by(AppAccessRequest.created_at.desc())).all()
    return [serialize_access_request(request) for request in requests]


@router.patch("/access-requests/{request_id}", response_model=AppAccessRequestRead)
def review_app_access_request(
    request_id: str,
    payload: AppAccessRequestReviewRequest,
    actor: User = Depends(require_permission("apps:manage")),
    db: Session = Depends(get_db),
):
    if payload.status == AppAccessRequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Review status must be approved or rejected")

    request = db.get(AppAccessRequest, request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found")

    request.status = payload.status
    request.admin_notes = payload.admin_notes
    request.reviewed_by_user_id = actor.id
    request.reviewed_at = datetime.utcnow()

    required_permission_code = get_required_permission_code(db, request.app)
    if payload.status == AppAccessRequestStatus.approved:
        if not required_permission_code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This app has no required permission configured")
        permission = db.scalar(select(Permission).where(Permission.code == required_permission_code))
        if not permission:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Required permission no longer exists")
        statement = mysql_insert(UserPermissionOverride).values(
            id=str(uuid.uuid4()),
            user_id=request.user_id,
            permission_id=permission.id,
            effect=OverrideEffect.allow,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.execute(statement.on_duplicate_key_update(effect=OverrideEffect.allow, updated_at=datetime.utcnow()))

    db.add(AuditLog(actor_user_id=actor.id, action="apps.access_reviewed", target_type="app_access_request", target_id=request.id))
    db.commit()
    db.refresh(request)
    return serialize_access_request(request)


def serialize_app_for_user(db: Session, app: RegisteredApp, user: User) -> AppRead:
    required_permission_code = get_required_permission_code(db, app)
    has_access = bool(required_permission_code and has_permission(db, user, required_permission_code))
    latest_request = db.scalar(
        select(AppAccessRequest)
        .where(AppAccessRequest.app_id == app.id, AppAccessRequest.user_id == user.id)
        .order_by(AppAccessRequest.created_at.desc())
    )
    return AppRead(
        id=app.id,
        name=app.name,
        slug=app.slug,
        description=app.description,
        homepage_url=app.homepage_url,
        logo_url=app.logo_url,
        required_permission_code=required_permission_code,
        has_access=has_access,
        access_request_status=latest_request.status if latest_request else None,
    )


def get_required_permission_code(db: Session, app: RegisteredApp) -> str | None:
    if app.required_permission_code:
        return app.required_permission_code

    inferred_code = f"{app.slug}:view"
    if db.scalar(select(Permission.id).where(Permission.code == inferred_code)):
        return inferred_code

    return None


def serialize_access_request(request: AppAccessRequest) -> AppAccessRequestRead:
    return AppAccessRequestRead(
        id=request.id,
        app_id=request.app_id,
        app_name=request.app.name,
        app_slug=request.app.slug,
        user_id=request.user_id,
        user_full_name=request.user.full_name,
        user_email=request.user.email,
        status=request.status,
        reason=request.reason,
        admin_notes=request.admin_notes,
        created_at=request.created_at,
        reviewed_at=request.reviewed_at,
    )
