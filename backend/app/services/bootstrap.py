import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Permission, PermissionTemplate, RegisteredApp, TemplatePermission, User, UserStatus

BASE_PERMISSIONS = {
    "users:view": "View users",
    "users:approve": "Approve or reject pending users",
    "users:permissions": "Manage user permission templates and overrides",
    "users:badges": "Create and assign identity badges to users",
    "templates:view": "View permission templates",
    "templates:manage": "Create and update permission templates",
    "apps:view": "View registered applications",
    "apps:manage": "Create and update application registry entries",
    "portal:manage": "Customize the user home page",
    "projects:upload": "Upload project archives for review",
    "projects:review": "Review uploaded project metadata",
    "projects:deploy": "Approve projects for deployment",
    "feedback:view": "View platform feedback submissions",
    "feedback:respond": "Respond to platform feedback submissions",
    "feedback:internal": "Create and view internal feedback notes",
    "audit:view": "View security audit logs",
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
    "gatestorage:view": "View GateStorage workspace allocations",
    "gatestorage:request": "Request storage for owned workspaces",
    "gatestorage:admin": "Review and administer GateStorage allocations",
    "video_watcher:view": "View Video Watcher visual QA reports",
    "video_watcher:analyze": "Upload and analyze videos in Video Watcher",
    "video_watcher:review": "Review videos and create training annotations in Video Watcher",
    "video_watcher:ask_ai": "Ask AI for frame and segment analysis in Video Watcher",
    "video_watcher:train": "Approve Video Watcher annotations for training datasets",
    "video_watcher:admin": "Administer the Video Watcher application",
}

TEMPLATES = {
    "Platform Admin Template": list(BASE_PERMISSIONS.keys()),
    "App Manager Template": ["apps:view", "apps:manage", "portal:manage", "projects:upload", "projects:review", "feedback:view", "feedback:respond"],
    "Feedback Manager Template": ["feedback:view", "feedback:respond", "feedback:internal"],
    "GateStorage Admin Template": ["gatestorage:view", "gatestorage:request", "gatestorage:admin"],
    "GateStorage User Template": ["gatestorage:view", "gatestorage:request"],
    "Video Watcher Admin Template": ["video_watcher:view", "video_watcher:analyze", "video_watcher:review", "video_watcher:ask_ai", "video_watcher:train", "video_watcher:admin"],
    "Video Watcher Reviewer Template": ["video_watcher:view", "video_watcher:review", "video_watcher:ask_ai"],
    "Video Watcher Uploader Template": ["video_watcher:view", "video_watcher:analyze"],
    "Video Watcher User Template": ["video_watcher:view", "video_watcher:analyze", "video_watcher:review", "video_watcher:ask_ai"],
    "Viewer Template": ["apps:view", "gatewiki:view"],
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

REGISTERED_APPS = {
    "video-watcher": {
        "name": "Video Watcher",
        "description": "Visual QA service for reviewing TV recordings and detected screen issues.",
        "homepage_url": os.getenv("VIDEO_WATCHER_FRONTEND_URL", "http://192.168.1.150:5176/"),
        "required_permission_code": "video_watcher:view",
    }
}


def bootstrap(db: Session) -> None:
    settings = get_settings()

    # Clean up legacy permissions/templates for apps that were renamed or removed.
    try:
        from app.models import PermissionTemplate, Permission, TemplatePermission, UserPermissionTemplate, UserPermissionOverride
        
        # 1. Obsolete permissions
        obsolete_perms = db.scalars(
            select(Permission).where(
                Permission.code.like("confluence:%") | Permission.code.like("knowledge:%")
            )
        ).all()
        if obsolete_perms:
            obsolete_perm_ids = [p.id for p in obsolete_perms]
            db.query(TemplatePermission).filter(TemplatePermission.permission_id.in_(obsolete_perm_ids)).delete(synchronize_session=False)
            db.query(UserPermissionOverride).filter(UserPermissionOverride.permission_id.in_(obsolete_perm_ids)).delete(synchronize_session=False)
            db.query(Permission).filter(Permission.id.in_(obsolete_perm_ids)).delete(synchronize_session=False)
            
        # 2. Obsolete templates
        obsolete_templates = db.scalars(
            select(PermissionTemplate).where(
                PermissionTemplate.name.like("Confluence %") | (PermissionTemplate.name == "Knowledge Editor Template")
            )
        ).all()
        if obsolete_templates:
            obsolete_template_ids = [t.id for t in obsolete_templates]
            db.query(TemplatePermission).filter(TemplatePermission.template_id.in_(obsolete_template_ids)).delete(synchronize_session=False)
            db.query(UserPermissionTemplate).filter(UserPermissionTemplate.template_id.in_(obsolete_template_ids)).delete(synchronize_session=False)
            db.query(PermissionTemplate).filter(PermissionTemplate.id.in_(obsolete_template_ids)).delete(synchronize_session=False)
            
        db.flush()
        print("Obsolete legacy permissions and templates successfully cleaned up.")
    except Exception as e:
        print("Obsolete legacy cleanup skipped or failed:", e)

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

    for slug, app_data in REGISTERED_APPS.items():
        registered_app = db.scalar(select(RegisteredApp).where(RegisteredApp.slug == slug))
        if not registered_app:
            registered_app = RegisteredApp(slug=slug, **app_data)
            db.add(registered_app)
        else:
            registered_app.name = app_data["name"]
            registered_app.description = app_data["description"]
            registered_app.homepage_url = app_data["homepage_url"]
            registered_app.required_permission_code = app_data["required_permission_code"]

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
