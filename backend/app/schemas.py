from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models import OverrideEffect, ProjectStatus, UserStatus, WikiPageStatus


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


class AppRead(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    homepage_url: str | None

    model_config = {"from_attributes": True}


class KnowledgeSpaceCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: str = ""


class KnowledgeSpaceRead(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KnowledgePageCreateRequest(BaseModel):
    space_id: str
    title: str = Field(min_length=2, max_length=180)
    slug: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9-]+$")
    summary: str = Field(default="", max_length=255)
    content: str = ""
    status: WikiPageStatus = WikiPageStatus.draft


class KnowledgePageUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=180)
    slug: str | None = Field(default=None, min_length=2, max_length=120, pattern=r"^[a-z0-9-]+$")
    summary: str | None = Field(default=None, max_length=255)
    content: str | None = None
    status: WikiPageStatus | None = None


class KnowledgePageRead(BaseModel):
    id: str
    space_id: str
    title: str
    slug: str
    summary: str
    content: str
    status: WikiPageStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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
