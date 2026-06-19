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


class AppAccessRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class FeedbackStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


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
    must_reset_password: Mapped[bool] = mapped_column(Boolean, default=False)
    password_reset_token: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    template_assignments: Mapped[list["UserPermissionTemplate"]] = relationship(back_populates="user")
    permission_overrides: Mapped[list["UserPermissionOverride"]] = relationship(back_populates="user")
    badge_assignments: Mapped[list["UserBadgeAssignment"]] = relationship(back_populates="user")


class UserBadge(Base, TimestampMixin):
    __tablename__ = table_name("user_badges")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(255), default="")
    color: Mapped[str] = mapped_column(String(24), default="#2563eb")
    icon: Mapped[str] = mapped_column(String(60), default="award")
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    assignments: Mapped[list["UserBadgeAssignment"]] = relationship(back_populates="badge")


class UserBadgeAssignment(Base, TimestampMixin):
    __tablename__ = table_name("user_badge_assignments")
    __table_args__ = (UniqueConstraint("user_id", "badge_id", name="uq_user_badge_assignment"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('users')}.id"))
    badge_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('user_badges')}.id"))
    assigned_by_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    user: Mapped[User] = relationship(back_populates="badge_assignments")
    badge: Mapped[UserBadge] = relationship(back_populates="assignments")


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
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    required_permission_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey(f"{table_name('users')}.id"), nullable=True)


class AppAccessRequest(Base, TimestampMixin):
    __tablename__ = table_name("app_access_requests")
    __table_args__ = (UniqueConstraint("app_id", "user_id", "status", name="uq_app_access_request_status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    app_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('registered_apps')}.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('users')}.id"))
    status: Mapped[AppAccessRequestStatus] = mapped_column(Enum(AppAccessRequestStatus), default=AppAccessRequestStatus.pending, index=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    admin_notes: Mapped[str] = mapped_column(Text, default="")
    reviewed_by_user_id: Mapped[str | None] = mapped_column(ForeignKey(f"{table_name('users')}.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    app: Mapped[RegisteredApp] = relationship()
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class PortalHomeSettings(Base, TimestampMixin):
    __tablename__ = table_name("portal_home_settings")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    headline: Mapped[str] = mapped_column(String(180), default="GateStack")
    subheadline: Mapped[str] = mapped_column(String(255), default="Portal principal de aplicaciones internas")
    welcome_message: Mapped[str] = mapped_column(Text, default="Accede a tus aplicaciones aprobadas desde un solo lugar.")
    hero_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    announcement: Mapped[str] = mapped_column(String(255), default="")


class FeedbackItem(Base, TimestampMixin):
    __tablename__ = table_name("feedback_items")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    source_app: Mapped[str] = mapped_column(String(80), default="gatewiki", index=True)
    title: Mapped[str] = mapped_column(String(180))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[FeedbackStatus] = mapped_column(Enum(FeedbackStatus), default=FeedbackStatus.open, index=True)
    page_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    page_title: Mapped[str | None] = mapped_column(String(180), nullable=True)
    space_key: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_by_user_id: Mapped[str] = mapped_column(String(36), index=True)
    created_by_name: Mapped[str] = mapped_column(String(160))
    created_by_email: Mapped[str] = mapped_column(String(255), index=True)
    public_response: Mapped[str] = mapped_column(Text, default="")
    responded_by_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    responded_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class FeedbackInternalNote(Base, TimestampMixin):
    __tablename__ = table_name("feedback_internal_notes")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    feedback_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('feedback_items')}.id"), index=True)
    author_user_id: Mapped[str] = mapped_column(String(36))
    author_name: Mapped[str] = mapped_column(String(160))
    note: Mapped[str] = mapped_column(Text)


class ChatConversation(Base, TimestampMixin):
    __tablename__ = table_name("chat_conversations")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    direct_key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    requester_user_id: Mapped[str | None] = mapped_column(ForeignKey(f"{table_name('users')}.id"), nullable=True, index=True)
    source_app: Mapped[str] = mapped_column(String(80), default="gatestack", index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    claimed_by_user_id: Mapped[str | None] = mapped_column(ForeignKey(f"{table_name('users')}.id"), nullable=True, index=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ChatParticipant(Base, TimestampMixin):
    __tablename__ = table_name("chat_participants")
    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_chat_participant"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    conversation_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('chat_conversations')}.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('users')}.id"), index=True)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ChatMessage(Base):
    __tablename__ = table_name("chat_messages")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    conversation_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('chat_conversations')}.id"), index=True)
    sender_user_id: Mapped[str] = mapped_column(ForeignKey(f"{table_name('users')}.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


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
