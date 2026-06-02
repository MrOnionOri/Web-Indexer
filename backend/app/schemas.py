from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models import AppAccessRequestStatus, FeedbackStatus, OverrideEffect, ProjectStatus, UserStatus


class TokenResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    must_reset_password: bool = False
    reset_token: str | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=10, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOverrideRead(BaseModel):
    permission_id: str
    permission_code: str
    effect: OverrideEffect


class UserRead(BaseModel):
    id: str
    email: str
    full_name: str
    status: UserStatus
    is_platform_admin: bool
    created_at: datetime
    template_ids: list[str] = []
    template_names: list[str] = []
    permissions: list[str] = []
    overrides: list[UserOverrideRead] = []
    status_reason: str | None = None
    must_reset_password: bool = False

    model_config = {"from_attributes": True}


class MeResponse(UserRead):
    permissions: list[str]


class PermissionRead(BaseModel):
    id: str
    code: str
    description: str

    model_config = {"from_attributes": True}


class TemplateRead(BaseModel):
    id: str
    name: str
    description: str
    is_system: bool
    permissions: list[str] = []


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=10, max_length=128)
    status: UserStatus = UserStatus.approved
    template_ids: list[str] = []


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None


class UserApprovalRequest(BaseModel):
    status: UserStatus
    template_ids: list[str] = []
    status_reason: str | None = None


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


class PasswordResetLinkResponse(BaseModel):
    reset_token: str
    reset_url: str


class ForcePasswordResetRequest(BaseModel):
    force: bool = True


class PermissionOverrideRequest(BaseModel):
    permission_id: str
    effect: OverrideEffect


class AppCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: str = ""
    homepage_url: str | None = None
    logo_url: str | None = None
    required_permission_code: str = Field(min_length=3, max_length=120)


class AppRead(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    homepage_url: str | None
    logo_url: str | None
    required_permission_code: str | None
    has_access: bool = True
    access_request_status: AppAccessRequestStatus | None = None

    model_config = {"from_attributes": True}


class AppAccessRequestCreateRequest(BaseModel):
    reason: str = Field(default="", max_length=1000)


class AppAccessRequestReviewRequest(BaseModel):
    status: AppAccessRequestStatus
    admin_notes: str = Field(default="", max_length=1000)


class AppAccessRequestRead(BaseModel):
    id: str
    app_id: str
    app_name: str
    app_slug: str
    user_id: str
    user_full_name: str
    user_email: str
    status: AppAccessRequestStatus
    reason: str
    admin_notes: str
    created_at: datetime
    reviewed_at: datetime | None


class PortalHomeSettingsRead(BaseModel):
    id: str
    headline: str
    subheadline: str
    welcome_message: str
    hero_image_url: str | None
    announcement: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class PortalHomeSettingsUpdateRequest(BaseModel):
    headline: str = Field(min_length=2, max_length=180)
    subheadline: str = Field(min_length=2, max_length=255)
    welcome_message: str = Field(min_length=2, max_length=1200)
    hero_image_url: str | None = Field(default=None, max_length=500)
    announcement: str = Field(default="", max_length=255)


class FeedbackInternalNoteRead(BaseModel):
    id: str
    feedback_id: str
    author_user_id: str
    author_name: str
    note: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackRead(BaseModel):
    id: str
    source_app: str
    title: str
    message: str
    status: FeedbackStatus
    page_id: str | None
    page_title: str | None
    space_key: str | None
    created_by_user_id: str
    created_by_name: str
    created_by_email: str
    public_response: str
    responded_by_user_id: str | None
    responded_by_name: str | None
    responded_at: datetime | None
    created_at: datetime
    updated_at: datetime
    internal_notes: list[FeedbackInternalNoteRead] = []

    model_config = {"from_attributes": True}


class FeedbackRespondRequest(BaseModel):
    public_response: str = Field(min_length=1, max_length=4000)
    status: FeedbackStatus = FeedbackStatus.resolved


class FeedbackStatusUpdateRequest(BaseModel):
    status: FeedbackStatus


class FeedbackInternalNoteCreateRequest(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


class ProjectRead(BaseModel):
    id: str
    original_filename: str
    status: ProjectStatus
    detected_stack: str | None
    review_notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectReviewRequest(BaseModel):
    status: ProjectStatus
    review_notes: str | None = None
