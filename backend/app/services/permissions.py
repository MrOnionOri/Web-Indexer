from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    OverrideEffect,
    Permission,
    TemplatePermission,
    User,
    UserPermissionOverride,
    UserPermissionTemplate,
)


def get_effective_permissions(db: Session, user: User) -> list[str]:
    template_permissions = db.scalars(
        select(Permission.code)
        .join(TemplatePermission, TemplatePermission.permission_id == Permission.id)
        .join(UserPermissionTemplate, UserPermissionTemplate.template_id == TemplatePermission.template_id)
        .where(UserPermissionTemplate.user_id == user.id)
    ).all()

    effective = set(template_permissions)
    overrides = db.execute(
        select(Permission.code, UserPermissionOverride.effect)
        .join(UserPermissionOverride, UserPermissionOverride.permission_id == Permission.id)
        .where(UserPermissionOverride.user_id == user.id)
    ).all()

    for code, effect in overrides:
        if effect == OverrideEffect.allow:
            effective.add(code)
        if effect == OverrideEffect.deny:
            effective.discard(code)

    if user.is_platform_admin:
        effective.update(db.scalars(select(Permission.code)).all())

    return sorted(effective)


def has_permission(db: Session, user: User, permission_code: str) -> bool:
    return permission_code in get_effective_permissions(db, user)
