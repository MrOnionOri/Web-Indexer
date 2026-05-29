from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Permission, PermissionTemplate, TemplatePermission, User, UserStatus

BASE_PERMISSIONS = {
    "users:view": "View users",
    "users:approve": "Approve or reject pending users",
    "users:permissions": "Manage user permission templates and overrides",
    "templates:view": "View permission templates",
    "templates:manage": "Create and update permission templates",
    "apps:view": "View registered applications",
    "apps:manage": "Create and update application registry entries",
    "projects:upload": "Upload project archives for review",
    "projects:review": "Review uploaded project metadata",
    "projects:deploy": "Approve projects for deployment",
    "audit:view": "View security audit logs",
    "knowledge:view": "View knowledge spaces and pages",
    "knowledge:create": "Create knowledge spaces and wiki pages",
    "knowledge:edit": "Edit existing wiki pages",
    "knowledge:publish": "Publish or archive wiki pages",
    "knowledge:admin": "Administer the knowledge base",
    "confluence:view": "View Confluence spaces and pages",
    "confluence:create": "Create Confluence spaces and pages",
    "confluence:edit": "Edit Confluence pages",
    "confluence:delete": "Delete Confluence pages",
    "confluence:admin": "Administer the Confluence application",
}

TEMPLATES = {
    "Platform Admin Template": list(BASE_PERMISSIONS.keys()),
    "App Manager Template": ["apps:view", "apps:manage", "projects:upload", "projects:review"],
    "Knowledge Editor Template": ["knowledge:view", "knowledge:create", "knowledge:edit", "knowledge:publish"],
    "Viewer Template": ["apps:view", "knowledge:view"],
    "Confluence Admin Template": ["confluence:view", "confluence:create", "confluence:edit", "confluence:delete", "confluence:admin"],
    "Confluence User Template": ["confluence:view", "confluence:create", "confluence:edit"],
}


def bootstrap(db: Session) -> None:
    settings = get_settings()
    permission_by_code: dict[str, Permission] = {}

    for code, description in BASE_PERMISSIONS.items():
        permission = db.scalar(select(Permission).where(Permission.code == code))
        if not permission:
            permission = Permission(code=code, description=description)
            db.add(permission)
        permission_by_code[code] = permission

    db.flush()

    for name, permission_codes in TEMPLATES.items():
        template = db.scalar(select(PermissionTemplate).where(PermissionTemplate.name == name))
        if not template:
            template = PermissionTemplate(
                name=name,
                description=f"Default permissions for {name.lower()}",
                is_system=True,
            )
            db.add(template)
            db.flush()

        existing = {
            row.permission_id
            for row in db.scalars(select(TemplatePermission).where(TemplatePermission.template_id == template.id)).all()
        }
        for code in permission_codes:
            permission = permission_by_code[code]
            if permission.id not in existing:
                db.add(TemplatePermission(template_id=template.id, permission_id=permission.id))

    if settings.bootstrap_admin_email and settings.bootstrap_admin_password:
        admin = db.scalar(select(User).where(User.email == settings.bootstrap_admin_email))
        if not admin:
            db.add(
                User(
                    email=settings.bootstrap_admin_email,
                    full_name="GateStack Admin",
                    hashed_password=hash_password(settings.bootstrap_admin_password),
                    status=UserStatus.approved,
                    is_platform_admin=True,
                )
            )

    db.commit()
