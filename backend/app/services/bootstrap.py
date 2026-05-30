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
    "gatewiki:view": "View GateWiki spaces and pages",
    "gatewiki:create": "Create GateWiki spaces and pages (legacy)",
    "gatewiki:edit": "Edit GateWiki pages (legacy)",
    "gatewiki:delete": "Delete GateWiki pages (legacy)",
    "gatewiki:admin": "Administer the GateWiki application",
    "gatewiki:create_workspace": "Create GateWiki spaces/workspaces",
    "gatewiki:create_page": "Create pages inside GateWiki spaces",
    "gatewiki:edit_workspace": "Edit GateWiki workspace configurations",
    "gatewiki:edit_page": "Edit pages inside GateWiki spaces",
    "gatewiki:delete_workspace": "Delete GateWiki spaces/workspaces",
    "gatewiki:delete_page": "Delete pages inside GateWiki spaces",
}

TEMPLATES = {
    "Platform Admin Template": list(BASE_PERMISSIONS.keys()),
    "App Manager Template": ["apps:view", "apps:manage", "projects:upload", "projects:review"],
    "Knowledge Editor Template": ["knowledge:view", "knowledge:create", "knowledge:edit", "knowledge:publish"],
    "Viewer Template": ["apps:view", "knowledge:view"],
    "GateWiki Admin Template": [
        "gatewiki:view",
        "gatewiki:create_workspace",
        "gatewiki:create_page",
        "gatewiki:edit_workspace",
        "gatewiki:edit_page",
        "gatewiki:delete_workspace",
        "gatewiki:delete_page",
        "gatewiki:admin"
    ],
    "GateWiki User Template": [
        "gatewiki:view",
        "gatewiki:create_page",
        "gatewiki:edit_page"
    ],
}


def bootstrap(db: Session) -> None:
    settings = get_settings()

    # Clean up legacy confluence permissions and templates
    try:
        from app.models import PermissionTemplate, Permission, TemplatePermission, UserPermissionTemplate, UserPermissionOverride
        
        # 1. Obsolete permissions
        obsolete_perms = db.scalars(select(Permission).where(Permission.code.like("confluence:%"))).all()
        if obsolete_perms:
            obsolete_perm_ids = [p.id for p in obsolete_perms]
            db.query(TemplatePermission).filter(TemplatePermission.permission_id.in_(obsolete_perm_ids)).delete(synchronize_session=False)
            db.query(UserPermissionOverride).filter(UserPermissionOverride.permission_id.in_(obsolete_perm_ids)).delete(synchronize_session=False)
            db.query(Permission).filter(Permission.id.in_(obsolete_perm_ids)).delete(synchronize_session=False)
            
        # 2. Obsolete templates
        obsolete_templates = db.scalars(select(PermissionTemplate).where(PermissionTemplate.name.like("Confluence %"))).all()
        if obsolete_templates:
            obsolete_template_ids = [t.id for t in obsolete_templates]
            db.query(TemplatePermission).filter(TemplatePermission.template_id.in_(obsolete_template_ids)).delete(synchronize_session=False)
            db.query(UserPermissionTemplate).filter(UserPermissionTemplate.template_id.in_(obsolete_template_ids)).delete(synchronize_session=False)
            db.query(PermissionTemplate).filter(PermissionTemplate.id.in_(obsolete_template_ids)).delete(synchronize_session=False)
            
        db.flush()
        print("Obsolete confluence permissions and templates successfully cleaned up.")
    except Exception as e:
        print("Obsolete confluence cleanup skipped or failed:", e)

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
