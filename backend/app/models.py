import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import get_settings
from app.db.session import Base

TABLE_PREFIX = get_settings().db_table_prefix


def table_name(name: str) -> str:
    return f"{TABLE_PREFIX}{name}" if TABLE_PREFIX else name


def uuid_str() -> str:
    return str(uuid.uuid4())


class UserStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    suspended = "suspended"


class OverrideEffect(str, enum.Enum):
    allow = "allow"
    deny = "deny"


class ProjectStatus(str, enum.Enum):
    uploaded = "uploaded"
    pending_review = "pending_review"
    review_failed = "review_failed"
    approved = "approved"
    building = "building"
    build_failed = "build_failed"
    running = "running"
    stopped = "stopped"
    suspended = "suspended"
    archived = "archived"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base, TimestampMixin):
    __tablename__ = table_name("users")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    hashed_password: Mapped[str] = mapped_column(String(255))
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.pending, index=True)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    template_assignments: Mapped[list["UserPermissionTemplate"]] = relationship(back_populates="user")
    permission_overrides: Mapped[list["UserPermissionOverride"]] = relationship(back_populates="user")


class Permission(Base, TimestampMixin):
    __tablename__ = table_name("permissions")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    code: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(255))


class PermissionTemplate(Base, TimestampMixin):
    __tablename__ = table_name("permission_templates")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str] = mapped_column(String(255))
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)

    permissions: Mapped[list["TemplatePermission"]] = relationship(back_populates="template")


class TemplatePermission(Base, TimestampMixin):
    __tablename__ = table_name("template_permissions")
    __table_args__ = (UniqueConstraint("template_id", "permission_id", name="uq_template_permission"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    template_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('permission_templates')}.id"))
    permission_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('permissions')}.id"))

    template: Mapped[PermissionTemplate] = relationship(back_populates="permissions")
    permission: Mapped[Permission] = relationship()


class UserPermissionTemplate(Base, TimestampMixin):
    __tablename__ = table_name("user_permission_templates")
    __table_args__ = (UniqueConstraint("user_id", "template_id", name="uq_user_template"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('users')}.id"))
    template_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('permission_templates')}.id"))

    user: Mapped[User] = relationship(back_populates="template_assignments")
    template: Mapped[PermissionTemplate] = relationship()


class UserPermissionOverride(Base, TimestampMixin):
    __tablename__ = table_name("user_permission_overrides")
    __table_args__ = (UniqueConstraint("user_id", "permission_id", name="uq_user_permission_override"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('users')}.id"))
    permission_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('permissions')}.id"))
    effect: Mapped[OverrideEffect] = mapped_column(Enum(OverrideEffect))

    user: Mapped[User] = relationship(back_populates="permission_overrides")
    permission: Mapped[Permission] = relationship()


class RegisteredApp(Base, TimestampMixin):
    __tablename__ = table_name("registered_apps")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(140), unique=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    homepage_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey(f"{table_name('users')}.id"), nullable=True)


class ProjectUpload(Base, TimestampMixin):
    __tablename__ = table_name("project_uploads")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    app_id: Mapped[str | None] = mapped_column(ForeignKey(f"{table_name('registered_apps')}.id"), nullable=True)
    uploaded_by_user_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('users')}.id"))
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(500))
    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus), default=ProjectStatus.pending_review)
    detected_stack: Mapped[str | None] = mapped_column(String(120), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuditLog(Base, TimestampMixin):
    __tablename__ = table_name("audit_logs")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey(f"{table_name('users')}.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(140), index=True)
    target_type: Mapped[str] = mapped_column(String(80))
    target_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    details: Mapped[str] = mapped_column(Text, default="")
