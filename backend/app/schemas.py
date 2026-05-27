from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models import OverrideEffect, ProjectStatus, UserStatus


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


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
