from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models import (
    AuditLog,
    Permission,
    PermissionTemplate,
    TemplatePermission,
    User,
    UserPermissionOverride,
    UserPermissionTemplate,
)
from app.schemas import (
    PermissionOverrideRequest,
    PermissionRead,
    TemplateRead,
    UserApprovalRequest,
    UserRead,
)
from app.services.permissions import get_effective_permissions

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserRead])
def list_users(_: User = Depends(require_permission("users:view")), db: Session = Depends(get_db)):
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return [serialize_admin_user(db, user) for user in users]


@router.patch("/users/{user_id}/approval", response_model=UserRead)
def update_user_approval(
    user_id: str,
    payload: UserApprovalRequest,
    actor: User = Depends(require_permission("users:approve")),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.status = payload.status
    db.execute(delete(UserPermissionTemplate).where(UserPermissionTemplate.user_id == user.id))
    for template_id in payload.template_ids:
        if not db.get(PermissionTemplate, template_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Template not found: {template_id}")
        db.add(UserPermissionTemplate(user_id=user.id, template_id=template_id))

    db.add(AuditLog(actor_user_id=actor.id, action="users.approval_updated", target_type="user", target_id=user.id))
    db.commit()
    db.refresh(user)
    return serialize_admin_user(db, user)


@router.post("/users/{user_id}/permission-overrides", status_code=status.HTTP_204_NO_CONTENT)
def set_permission_override(
    user_id: str,
    payload: PermissionOverrideRequest,
    actor: User = Depends(require_permission("users:permissions")),
    db: Session = Depends(get_db),
):
    if not db.get(User, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not db.get(Permission, payload.permission_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Permission not found")

    override = db.scalar(
        select(UserPermissionOverride).where(
            UserPermissionOverride.user_id == user_id,
            UserPermissionOverride.permission_id == payload.permission_id,
        )
    )
    if override:
        override.effect = payload.effect
    else:
        db.add(UserPermissionOverride(user_id=user_id, permission_id=payload.permission_id, effect=payload.effect))

    db.add(AuditLog(actor_user_id=actor.id, action="users.permission_override_set", target_type="user", target_id=user_id))
    db.commit()


@router.get("/permissions", response_model=list[PermissionRead])
def list_permissions(_: User = Depends(require_permission("templates:view")), db: Session = Depends(get_db)):
    return db.scalars(select(Permission).order_by(Permission.code)).all()


@router.get("/templates", response_model=list[TemplateRead])
def list_templates(_: User = Depends(require_permission("templates:view")), db: Session = Depends(get_db)):
    templates = db.scalars(select(PermissionTemplate).order_by(PermissionTemplate.name)).all()
    output: list[TemplateRead] = []
    for template in templates:
        permissions = db.scalars(
            select(Permission.code)
            .join(TemplatePermission, TemplatePermission.permission_id == Permission.id)
            .where(TemplatePermission.template_id == template.id)
            .order_by(Permission.code)
        ).all()
        output.append(
            TemplateRead(
                id=template.id,
                name=template.name,
                description=template.description,
                is_system=template.is_system,
                permissions=list(permissions),
            )
        )
    return output


def serialize_admin_user(db: Session, user: User) -> UserRead:
    assigned_templates = db.scalars(
        select(PermissionTemplate)
        .join(UserPermissionTemplate, UserPermissionTemplate.template_id == PermissionTemplate.id)
        .where(UserPermissionTemplate.user_id == user.id)
        .order_by(PermissionTemplate.name)
    ).all()
    return UserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        status=user.status,
        is_platform_admin=user.is_platform_admin,
        created_at=user.created_at,
        template_ids=[template.id for template in assigned_templates],
        template_names=[template.name for template in assigned_templates],
        permissions=get_effective_permissions(db, user),
    )
