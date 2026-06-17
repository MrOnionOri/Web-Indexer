import os
import uuid
import base64
import hashlib
import hmac
import json
import shutil
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus
from typing import List, Optional

import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, Security, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import BigInteger, Boolean, Column, DateTime, String, Text, UniqueConstraint, create_engine, or_, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "gatestorage_app")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "gatestack")
ENVIRONMENT = os.getenv("ENVIRONMENT", "local").lower()
GATESTACK_API_URL = os.getenv("GATESTACK_API_URL", "http://192.168.1.150:8000").rstrip("/")
GATESTACK_FALLBACK_URLS = [url.strip().rstrip("/") for url in os.getenv("GATESTACK_FALLBACK_URLS", "").split(",") if url.strip()]
GATESTACK_SECRET_KEY = os.getenv("SECRET_KEY")
DATA_ENCRYPTION_KEY = os.getenv("DATA_ENCRYPTION_KEY")
STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", "./data/storage")).resolve()
CORS_ALLOWED_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?",
)

if not GATESTACK_SECRET_KEY or len(GATESTACK_SECRET_KEY) < 32:
    raise RuntimeError("SECRET_KEY must be set to a strong value")
if not DATA_ENCRYPTION_KEY or len(DATA_ENCRYPTION_KEY) < 32:
    raise RuntimeError("DATA_ENCRYPTION_KEY must be set to a strong value")

ENCRYPTION_PREFIX = "enc:v1:"

user_escaped = quote_plus(DB_USER)
password_escaped = quote_plus(DB_PASSWORD)
DATABASE_URL = f"mysql+pymysql://{user_escaped}:{password_escaped}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
security = HTTPBearer(auto_error=False)


class StorageWorkspaceModel(Base):
    __tablename__ = "storage_workspaces"
    __table_args__ = (UniqueConstraint("source_app", "workspace_key", name="uq_storage_workspace_source_key"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_app = Column(String(80), nullable=False, default="gatewiki", index=True)
    external_workspace_id = Column(String(36), nullable=True)
    workspace_key = Column(String(80), nullable=False, index=True)
    workspace_name = Column(String(180), nullable=False)
    owner_user_id = Column(String(36), nullable=False, index=True)
    owner_name = Column(String(160), nullable=False)
    owner_email = Column(String(255), nullable=False, index=True)
    quota_bytes = Column(BigInteger, nullable=False, default=0)
    used_bytes = Column(BigInteger, nullable=False, default=0)
    status = Column(String(40), nullable=False, default="active", index=True)
    status_message = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StorageWorkspaceMemberModel(Base):
    __tablename__ = "storage_workspace_members"
    __table_args__ = (UniqueConstraint("source_app", "workspace_key", "user_email", name="uq_storage_member_source_key_email"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), nullable=True, index=True)
    source_app = Column(String(80), nullable=False, default="gatewiki", index=True)
    workspace_key = Column(String(80), nullable=False, index=True)
    user_email = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class StorageRequestModel(Base):
    __tablename__ = "storage_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_app = Column(String(80), nullable=False, default="gatewiki", index=True)
    external_workspace_id = Column(String(36), nullable=True)
    workspace_key = Column(String(80), nullable=False, index=True)
    workspace_name = Column(String(180), nullable=False)
    owner_user_id = Column(String(36), nullable=False, index=True)
    owner_name = Column(String(160), nullable=False)
    owner_email = Column(String(255), nullable=False, index=True)
    requested_bytes = Column(BigInteger, nullable=False)
    status = Column(String(40), nullable=False, default="pending", index=True)
    reason = Column(Text, default="")
    member_emails = Column(Text, default="")
    admin_notes = Column(Text, default="")
    reviewed_by_user_id = Column(String(36), nullable=True)
    reviewed_by_name = Column(String(160), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StorageFileModel(Base):
    __tablename__ = "storage_files"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    relative_path = Column(String(600), nullable=False)
    content_type = Column(String(180), nullable=True)
    size_bytes = Column(BigInteger, nullable=False)
    uploaded_by_user_id = Column(String(36), nullable=False, index=True)
    uploaded_by_name = Column(String(160), nullable=False)
    is_public = Column(Boolean, nullable=False, default=False)
    public_token = Column(String(80), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FeedbackItemModel(Base):
    __tablename__ = "feedback_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_app = Column(String(80), nullable=False, default="gatestorage", index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(40), nullable=False, default="open", index=True)
    page_id = Column(String(36), nullable=True, index=True)
    page_title = Column(String(200), nullable=True)
    space_key = Column(String(80), nullable=True, index=True)
    created_by_user_id = Column(String(36), nullable=True, index=True)
    created_by_name = Column(String(160), nullable=False)
    created_by_email = Column(String(255), nullable=False, index=True)
    public_response = Column(Text, nullable=False, default="")
    responded_by_user_id = Column(String(36), nullable=True)
    responded_by_name = Column(String(160), nullable=True)
    responded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def init_db_compatibility() -> None:
    try:
        with engine.connect() as conn:
            request_columns = {row[0] for row in conn.execute(text("SHOW COLUMNS FROM storage_requests")).fetchall()}
            if "member_emails" not in request_columns:
                conn.execute(text("ALTER TABLE storage_requests ADD COLUMN member_emails TEXT NULL"))
            conn.execute(text("UPDATE storage_requests SET member_emails = '' WHERE member_emails IS NULL"))
            file_columns = {row[0] for row in conn.execute(text("SHOW COLUMNS FROM storage_files")).fetchall()}
            if "is_public" not in file_columns:
                conn.execute(text("ALTER TABLE storage_files ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 0"))
            if "public_token" not in file_columns:
                conn.execute(text("ALTER TABLE storage_files ADD COLUMN public_token VARCHAR(80) NULL"))
                conn.execute(text("CREATE UNIQUE INDEX ix_storage_files_public_token ON storage_files (public_token)"))
            workspace_columns = {row[0] for row in conn.execute(text("SHOW COLUMNS FROM storage_workspaces")).fetchall()}
            if "status_message" not in workspace_columns:
                conn.execute(text("ALTER TABLE storage_workspaces ADD COLUMN status_message TEXT NULL"))
            conn.execute(text("UPDATE storage_workspaces SET status_message = '' WHERE status_message IS NULL"))
            feedback_columns = {row[0] for row in conn.execute(text("SHOW COLUMNS FROM feedback_items")).fetchall()}
            if "source_app" not in feedback_columns:
                conn.execute(text("ALTER TABLE feedback_items ADD COLUMN source_app VARCHAR(80) NOT NULL DEFAULT 'gatewiki'"))
            if "public_response" not in feedback_columns:
                conn.execute(text("ALTER TABLE feedback_items ADD COLUMN public_response TEXT NULL"))
            else:
                conn.execute(text("UPDATE feedback_items SET public_response = '' WHERE public_response IS NULL"))
            if "responded_by_user_id" not in feedback_columns:
                conn.execute(text("ALTER TABLE feedback_items ADD COLUMN responded_by_user_id VARCHAR(36) NULL"))
            if "responded_by_name" not in feedback_columns:
                conn.execute(text("ALTER TABLE feedback_items ADD COLUMN responded_by_name VARCHAR(160) NULL"))
            if "responded_at" not in feedback_columns:
                conn.execute(text("ALTER TABLE feedback_items ADD COLUMN responded_at DATETIME NULL"))
            conn.commit()
    except Exception as exc:
        print("Note: storage compatibility migration skipped:", exc)


init_db_compatibility()


class StorageRequestCreate(BaseModel):
    source_app: str = Field(default="gatewiki", max_length=80)
    external_workspace_id: str | None = None
    workspace_key: str = Field(min_length=1, max_length=80)
    workspace_name: str = Field(min_length=1, max_length=180)
    requested_bytes: int = Field(gt=0)
    reason: str = Field(default="", max_length=2000)
    member_emails: list[str] = Field(default_factory=list)


class StorageWorkspaceMembersUpdate(BaseModel):
    member_emails: list[str] = Field(default_factory=list)


class StorageWorkspaceAdminUpdate(BaseModel):
    quota_bytes: int = Field(ge=0)
    status: str = Field(max_length=40)
    status_message: str = Field(default="", max_length=2000)


class StorageFolderCreate(BaseModel):
    folder: str = Field(default="", max_length=600)


class StorageFileMove(BaseModel):
    folder: str = Field(default="", max_length=600)
    filename: str | None = Field(default=None, max_length=255)


class StorageFilePublicUpdate(BaseModel):
    is_public: bool


class StorageFolderMove(BaseModel):
    source: str = Field(max_length=600)
    target: str = Field(max_length=600)


class LoginRequest(BaseModel):
    email: str
    password: str


class StorageRequestReview(BaseModel):
    status: str
    quota_bytes: int = Field(ge=0)
    admin_notes: str = Field(default="", max_length=2000)


class FeedbackCreate(BaseModel):
    category: str = Field(default="support", max_length=80)
    title: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=5, max_length=4000)
    workspace_id: str | None = None
    workspace_name: str | None = Field(default=None, max_length=180)


class FeedbackResponseUpdate(BaseModel):
    public_response: str = Field(min_length=1, max_length=4000)
    status: str = Field(default="resolved", max_length=40)


class FeedbackStatusUpdate(BaseModel):
    status: str = Field(max_length=40)


class FeedbackRead(BaseModel):
    id: str
    source_app: str
    category: str
    title: str
    message: str
    status: str
    workspace_id: str | None
    workspace_name: str | None
    created_by_name: str
    created_by_email: str
    public_response: str | None
    responded_by_name: str | None
    responded_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserListItem(BaseModel):
    email: str
    full_name: str


class StorageWorkspaceRead(BaseModel):
    id: str
    source_app: str
    external_workspace_id: str | None
    workspace_key: str
    workspace_name: str
    owner_user_id: str
    owner_name: str
    owner_email: str
    quota_bytes: int
    used_bytes: int
    status: str
    status_message: str = ""
    member_emails: list[str] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StorageRequestRead(BaseModel):
    id: str
    source_app: str
    external_workspace_id: str | None
    workspace_key: str
    workspace_name: str
    owner_user_id: str
    owner_name: str
    owner_email: str
    requested_bytes: int
    status: str
    reason: str
    member_emails: str | None = ""
    admin_notes: str
    reviewed_by_user_id: str | None
    reviewed_by_name: str | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StorageFileRead(BaseModel):
    id: str
    workspace_id: str
    original_filename: str
    relative_path: str
    content_type: str | None
    size_bytes: int
    uploaded_by_user_id: str
    uploaded_by_name: str
    is_public: bool = False
    public_url: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class StorageEntryRead(BaseModel):
    type: str
    name: str
    path: str
    id: str | None = None
    workspace_id: str | None = None
    original_filename: str | None = None
    relative_path: str | None = None
    content_type: str | None = None
    size_bytes: int = 0
    uploaded_by_user_id: str | None = None
    uploaded_by_name: str | None = None
    is_public: bool = False
    public_url: str | None = None
    created_at: datetime | None = None


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_gatestack_urls(request: Optional[Request] = None) -> List[str]:
    inferred_urls: List[str] = []
    if request:
        host = request.url.hostname
        if host and host not in {"localhost", "127.0.0.1"}:
            inferred_urls.append(f"{request.url.scheme}://{host}:8000")
    return list(dict.fromkeys([
        GATESTACK_API_URL,
        *inferred_urls,
        *GATESTACK_FALLBACK_URLS,
        "http://host.docker.internal:8000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]))


def b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def encryption_key() -> bytes:
    return hashlib.sha256(DATA_ENCRYPTION_KEY.encode("utf-8")).digest()


def encrypt_text(value: str | None) -> str:
    if value is None:
        return ""
    if value.startswith(ENCRYPTION_PREFIX):
        return value
    nonce = os.urandom(12)
    ciphertext = AESGCM(encryption_key()).encrypt(nonce, value.encode("utf-8"), None)
    return ENCRYPTION_PREFIX + base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_text(value: str | None) -> str:
    if not value:
        return ""
    if not value.startswith(ENCRYPTION_PREFIX):
        return value
    try:
        payload = base64.urlsafe_b64decode(value[len(ENCRYPTION_PREFIX):].encode("ascii"))
        nonce, ciphertext = payload[:12], payload[12:]
        return AESGCM(encryption_key()).decrypt(nonce, ciphertext, None).decode("utf-8")
    except Exception:
        return ""


def decode_gatestack_token(token: str) -> dict | None:
    try:
        header_part, payload_part, signature_part = token.split(".")
        signed = f"{header_part}.{payload_part}".encode("utf-8")
        expected_signature = hmac.new(GATESTACK_SECRET_KEY.encode("utf-8"), signed, hashlib.sha256).digest()
        received_signature = b64url_decode(signature_part)
        if not hmac.compare_digest(expected_signature, received_signature):
            return None

        payload = json.loads(b64url_decode(payload_part).decode("utf-8"))
        if payload.get("type") != "access":
            return None
        if payload.get("exp") and int(payload["exp"]) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def get_local_effective_permissions(db: Session, user_id: str) -> list[str]:
    template_permissions = db.execute(
        text(
            """
            SELECT p.code
            FROM permissions p
            JOIN template_permissions tp ON tp.permission_id = p.id
            JOIN user_permission_templates upt ON upt.template_id = tp.template_id
            WHERE upt.user_id = :user_id
            """
        ),
        {"user_id": user_id},
    ).scalars()
    effective = set(template_permissions)

    overrides = db.execute(
        text(
            """
            SELECT p.code, upo.effect
            FROM permissions p
            JOIN user_permission_overrides upo ON upo.permission_id = p.id
            WHERE upo.user_id = :user_id
            """
        ),
        {"user_id": user_id},
    ).all()
    for code, effect in overrides:
        if effect == "allow":
            effective.add(code)
        elif effect == "deny":
            effective.discard(code)
    return sorted(effective)


def get_local_user_from_token(token: str, db: Session) -> dict | None:
    payload = decode_gatestack_token(token)
    if not payload:
        return None

    row = db.execute(
        text("SELECT id, email, full_name, status, is_platform_admin FROM users WHERE id = :user_id"),
        {"user_id": payload.get("sub")},
    ).mappings().first()
    if not row or row["status"] != "approved":
        return None

    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "status": row["status"],
        "is_platform_admin": bool(row["is_platform_admin"]),
        "permissions": get_local_effective_permissions(db, row["id"]),
    }


def gatestack_session_headers(request: Request, credentials: HTTPAuthorizationCredentials | None = None) -> dict:
    headers = {}
    if credentials:
        headers["Authorization"] = f"Bearer {credentials.credentials}"
    elif request.cookies.get("gatestack_access"):
        headers["Cookie"] = f"gatestack_access={request.cookies['gatestack_access']}"
        csrf = request.cookies.get("gatestack_csrf")
        if csrf:
            headers["Cookie"] += f"; gatestack_csrf={csrf}"
            headers["X-CSRF-Token"] = csrf
    return headers


def copy_session_cookies(source: requests.Response, target: Response, request: Request) -> None:
    secure = request.url.scheme == "https" and ENVIRONMENT in {"local", "development", "dev", "test"}
    if ENVIRONMENT not in {"local", "development", "dev", "test"}:
        secure = True
    max_age = 60 * 60 * 8
    for cookie_name in ("gatestack_access", "gatestack_csrf"):
        if cookie_name in source.cookies:
            target.set_cookie(
                cookie_name,
                source.cookies[cookie_name],
                max_age=max_age,
                httponly=cookie_name == "gatestack_access",
                secure=secure,
                samesite="lax",
                path="/",
            )


def clear_session_cookies(target: Response, request: Request) -> None:
    secure = request.url.scheme == "https" and ENVIRONMENT in {"local", "development", "dev", "test"}
    if ENVIRONMENT not in {"local", "development", "dev", "test"}:
        secure = True
    for cookie_name in ("gatestack_access", "gatestack_csrf", "gatestack_token"):
        target.delete_cookie(cookie_name, path="/", secure=secure, samesite="lax")


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Security(security),
    db: Session = Depends(get_db),
) -> dict:
    headers = gatestack_session_headers(request, credentials)
    if not headers:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    for base_url in get_gatestack_urls(request):
        try:
            response = requests.get(f"{base_url}/auth/me", headers=headers, timeout=2.5)
            if response.status_code == 200:
                return response.json()
        except Exception:
            continue

    if credentials:
        local_user = get_local_user_from_token(credentials.credentials, db)
        if local_user:
            return local_user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="GateStack IAM unavailable or invalid token")


def check_permission(user: dict, permission: str):
    if user.get("is_platform_admin") or permission in user.get("permissions", []):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {permission}")


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def normalize_member_emails(values: list[str] | None) -> list[str]:
    return list(dict.fromkeys([normalize_email(email) for email in values or [] if normalize_email(email)]))


def workspace_member_emails(db: Session, workspace: StorageWorkspaceModel) -> list[str]:
    rows = (
        db.query(StorageWorkspaceMemberModel.user_email)
        .filter(
            StorageWorkspaceMemberModel.source_app == workspace.source_app,
            StorageWorkspaceMemberModel.workspace_key == workspace.workspace_key,
        )
        .order_by(StorageWorkspaceMemberModel.user_email.asc())
        .all()
    )
    return [row[0] for row in rows]


def is_workspace_member(user: dict, workspace: StorageWorkspaceModel, db: Session) -> bool:
    user_email = normalize_email(user.get("email"))
    if not user_email:
        return False
    return (
        db.query(StorageWorkspaceMemberModel)
        .filter(
            StorageWorkspaceMemberModel.source_app == workspace.source_app,
            StorageWorkspaceMemberModel.workspace_key == workspace.workspace_key,
            StorageWorkspaceMemberModel.user_email == user_email,
        )
        .first()
        is not None
    )


def is_storage_request_member(user: dict, request: StorageRequestModel) -> bool:
    return normalize_email(user.get("email")) in normalize_member_emails((request.member_emails or "").split(","))


def can_manage_workspace(user: dict, workspace: StorageWorkspaceModel) -> bool:
    return bool(
        user.get("is_platform_admin")
        or "gatestorage:admin" in user.get("permissions", [])
        or workspace.owner_user_id == user.get("id")
    )


def can_access_workspace(user: dict, workspace: StorageWorkspaceModel, db: Session) -> bool:
    return can_manage_workspace(user, workspace) or is_workspace_member(user, workspace, db)


def apply_workspace_members(db: Session, workspace: StorageWorkspaceModel, member_emails: list[str] | None) -> None:
    owner_email = normalize_email(workspace.owner_email)
    next_emails = [email for email in normalize_member_emails(member_emails) if email != owner_email]
    existing_members = (
        db.query(StorageWorkspaceMemberModel)
        .filter(
            StorageWorkspaceMemberModel.source_app == workspace.source_app,
            StorageWorkspaceMemberModel.workspace_key == workspace.workspace_key,
        )
        .all()
    )
    existing_by_email = {member.user_email: member for member in existing_members}
    next_email_set = set(next_emails)

    for member in existing_members:
        if member.user_email not in next_email_set:
            db.delete(member)

    for email in next_emails:
        member = existing_by_email.get(email)
        if member:
            member.workspace_id = workspace.id
        else:
            db.add(
                StorageWorkspaceMemberModel(
                    workspace_id=workspace.id,
                    source_app=workspace.source_app,
                    workspace_key=workspace.workspace_key,
                    user_email=email,
                )
            )


def update_gatewiki_allowed_emails(db: Session, workspace: StorageWorkspaceModel, member_emails: list[str]) -> None:
    if workspace.source_app.lower() != "gatewiki":
        return
    db.execute(
        text("UPDATE confluence_spaces SET allowed_emails = :emails WHERE UPPER(`key`) = :workspace_key"),
        {"emails": ", ".join(member_emails), "workspace_key": workspace.workspace_key.upper()},
    )


def serialize_workspace(workspace: StorageWorkspaceModel, db: Session) -> dict:
    return {
        "id": workspace.id,
        "source_app": workspace.source_app,
        "external_workspace_id": workspace.external_workspace_id,
        "workspace_key": workspace.workspace_key,
        "workspace_name": workspace.workspace_name,
        "owner_user_id": workspace.owner_user_id,
        "owner_name": workspace.owner_name,
        "owner_email": workspace.owner_email,
        "quota_bytes": workspace.quota_bytes,
        "used_bytes": workspace.used_bytes,
        "status": workspace.status,
        "status_message": workspace.status_message or "",
        "member_emails": workspace_member_emails(db, workspace),
        "created_at": workspace.created_at,
        "updated_at": workspace.updated_at,
    }


FEEDBACK_CATEGORIES = {
    "support": "Soporte de storage",
    "bug": "Reportar problema",
    "quota": "Solicitar o cambiar cuota",
    "admin_contact": "Comunicarse con un admin",
}


def normalize_feedback_category(value: str | None) -> str:
    category = (value or "support").strip().lower()
    return category if category in FEEDBACK_CATEGORIES else "support"


def serialize_feedback_item(item: FeedbackItemModel) -> dict:
    raw_category = normalize_feedback_category(item.space_key)
    prefix = f"{FEEDBACK_CATEGORIES[raw_category]}: "
    display_title = item.title[len(prefix):] if item.title.startswith(prefix) else item.title
    return {
        "id": item.id,
        "source_app": item.source_app,
        "category": raw_category,
        "title": display_title,
        "message": decrypt_text(item.message),
        "status": item.status,
        "workspace_id": item.page_id,
        "workspace_name": item.page_title,
        "created_by_name": item.created_by_name,
        "created_by_email": item.created_by_email,
        "public_response": decrypt_text(item.public_response) if item.public_response else None,
        "responded_by_name": item.responded_by_name,
        "responded_at": item.responded_at,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def refresh_gatewiki_workspace_members(db: Session, workspace: StorageWorkspaceModel) -> None:
    if workspace.source_app.lower() != "gatewiki":
        return
    row = db.execute(
        text("SELECT allowed_emails FROM confluence_spaces WHERE UPPER(`key`) = :workspace_key"),
        {"workspace_key": workspace.workspace_key.upper()},
    ).first()
    if row is None:
        return
    apply_workspace_members(db, workspace, (row[0] or "").split(","))


def refresh_gatewiki_memberships(db: Session) -> None:
    workspaces = db.query(StorageWorkspaceModel).filter(StorageWorkspaceModel.source_app == "gatewiki").all()
    for workspace in workspaces:
        refresh_gatewiki_workspace_members(db, workspace)
    if workspaces:
        db.commit()


def get_allowed_workspace(workspace_id: str, user: dict, db: Session) -> StorageWorkspaceModel:
    workspace = db.query(StorageWorkspaceModel).filter(StorageWorkspaceModel.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Storage workspace not found")
    refresh_gatewiki_workspace_members(db, workspace)
    db.commit()
    db.refresh(workspace)
    if not can_access_workspace(user, workspace, db):
        raise HTTPException(status_code=403, detail="You cannot access this storage workspace")
    return workspace


def ensure_workspace_writable(workspace: StorageWorkspaceModel) -> None:
    if workspace.status != "active":
        detail = workspace.status_message or "Storage for this workspace is not active."
        raise HTTPException(status_code=423, detail=detail)


def safe_filename(filename: str) -> str:
    name = Path(filename).name.strip().replace("\\", "_").replace("/", "_")
    return name or "archivo"


def safe_folder_parts(folder: str | None) -> list[str]:
    parts: list[str] = []
    for raw_part in (folder or "").replace("\\", "/").split("/"):
        part = safe_filename(raw_part)
        if part and part not in {".", "..", "archivo"}:
            parts.append(part)
    return parts


def safe_folder_path(folder: str | None) -> str:
    return "/".join(safe_folder_parts(folder))


def ensure_workspace_path(workspace: StorageWorkspaceModel, relative_path: Path | str = "") -> Path:
    root = workspace_dir(workspace.id).resolve()
    path = (root / relative_path).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid storage path")
    return path


def public_file_url(request: Request | None, file: StorageFileModel) -> str | None:
    if not file.is_public or not file.public_token:
        return None
    if request:
        base_url = str(request.base_url).rstrip("/")
    else:
        base_url = ""
    return f"{base_url}/public/files/{file.public_token}/download"


def storage_file_to_entry(file: StorageFileModel, request: Request | None = None) -> dict:
    return {
        "type": "file",
        "name": file.original_filename,
        "path": file.relative_path,
        "id": file.id,
        "workspace_id": file.workspace_id,
        "original_filename": file.original_filename,
        "relative_path": file.relative_path,
        "content_type": file.content_type,
        "size_bytes": file.size_bytes,
        "uploaded_by_user_id": file.uploaded_by_user_id,
        "uploaded_by_name": file.uploaded_by_name,
        "is_public": bool(file.is_public),
        "public_url": public_file_url(request, file),
        "created_at": file.created_at,
    }


def workspace_dir(workspace_id: str) -> Path:
    return STORAGE_ROOT / workspace_id


def forward_gatestack_request(method: str, path: str, request: Optional[Request] = None, response_out: Response | None = None, **kwargs):
    last_error = "GateStack IAM unavailable"
    for base_url in get_gatestack_urls(request):
        try:
            headers = dict(kwargs.pop("headers", {}) or {})
            if request:
                headers.update(gatestack_session_headers(request))
            response = requests.request(method, f"{base_url}{path}", timeout=4.0, headers=headers, **kwargs)
            try:
                payload = response.json()
            except ValueError:
                payload = {"detail": response.text or "Invalid GateStack IAM response"}
            if response.status_code >= 400:
                raise HTTPException(status_code=response.status_code, detail=payload.get("detail", payload))
            if response_out is not None and request is not None:
                copy_session_cookies(response, response_out, request)
            return payload
        except HTTPException:
            raise
        except Exception as exc:
            last_error = str(exc)
            continue
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=last_error)


docs_kwargs = {}
if ENVIRONMENT not in {"local", "development", "dev", "test"}:
    docs_kwargs = {"docs_url": None, "redoc_url": None, "openapi_url": None}

app = FastAPI(title="GateStorage Service", **docs_kwargs)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/auth/me")
def auth_me(user: dict = Depends(get_current_user)):
    return user


@app.post("/auth/login")
def login(payload: LoginRequest, request: Request, response: Response):
    return forward_gatestack_request("POST", "/auth/login", request=request, response_out=response, json=payload.model_dump())


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response):
    try:
        forward_gatestack_request("POST", "/auth/logout", request=request, response_out=response)
    finally:
        clear_session_cookies(response, request)


@app.get("/api/users", response_model=list[UserListItem])
def list_users(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT email, full_name FROM users WHERE status = 'approved' ORDER BY full_name, email")
    ).mappings()
    return [{"email": row["email"], "full_name": row["full_name"]} for row in rows]


@app.post("/api/feedback", response_model=FeedbackRead)
def create_feedback(payload: FeedbackCreate, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    category = normalize_feedback_category(payload.category)
    workspace_id = (payload.workspace_id or "").strip() or None
    workspace_name = (payload.workspace_name or "").strip() or None
    if workspace_id:
        workspace = get_allowed_workspace(workspace_id, user, db)
        workspace_name = workspace.workspace_name

    item = FeedbackItemModel(
        source_app="gatestorage",
        title=f"{FEEDBACK_CATEGORIES[category]}: {payload.title.strip()}",
        message=encrypt_text(payload.message.strip()),
        status="open",
        page_id=workspace_id,
        page_title=workspace_name,
        space_key=category,
        created_by_user_id=user.get("id"),
        created_by_name=user.get("full_name") or user.get("email") or "Usuario",
        created_by_email=user.get("email") or "",
        public_response="",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_feedback_item(item)


@app.get("/api/feedback/my", response_model=list[FeedbackRead])
def list_my_feedback(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    items = (
        db.query(FeedbackItemModel)
        .filter(
            FeedbackItemModel.source_app == "gatestorage",
            FeedbackItemModel.created_by_user_id == user.get("id"),
        )
        .order_by(FeedbackItemModel.created_at.desc())
        .all()
    )
    return [serialize_feedback_item(item) for item in items]


@app.get("/api/feedback/admin", response_model=list[FeedbackRead])
def list_admin_feedback(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:admin")
    items = (
        db.query(FeedbackItemModel)
        .filter(FeedbackItemModel.source_app == "gatestorage")
        .order_by(FeedbackItemModel.created_at.desc())
        .all()
    )
    return [serialize_feedback_item(item) for item in items]


@app.patch("/api/feedback/{feedback_id}/response", response_model=FeedbackRead)
def respond_feedback(feedback_id: str, payload: FeedbackResponseUpdate, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:admin")
    item = (
        db.query(FeedbackItemModel)
        .filter(FeedbackItemModel.id == feedback_id, FeedbackItemModel.source_app == "gatestorage")
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Feedback not found")
    item.public_response = encrypt_text(payload.public_response.strip())
    item.status = payload.status.strip() or "resolved"
    item.responded_by_user_id = user.get("id")
    item.responded_by_name = user.get("full_name") or user.get("email") or "Admin"
    item.responded_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return serialize_feedback_item(item)


@app.patch("/api/feedback/{feedback_id}/status", response_model=FeedbackRead)
def update_feedback_status(feedback_id: str, payload: FeedbackStatusUpdate, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:admin")
    next_status = payload.status.strip().lower()
    if next_status not in {"open", "in_progress", "resolved", "closed"}:
        raise HTTPException(status_code=400, detail="Invalid feedback status")
    item = (
        db.query(FeedbackItemModel)
        .filter(FeedbackItemModel.id == feedback_id, FeedbackItemModel.source_app == "gatestorage")
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Feedback not found")
    item.status = next_status
    db.commit()
    db.refresh(item)
    return serialize_feedback_item(item)


@app.post("/api/storage-requests", response_model=StorageRequestRead)
def create_storage_request(payload: StorageRequestCreate, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:request")
    workspace_key = payload.workspace_key.upper()

    existing_pending = (
        db.query(StorageRequestModel)
        .filter(
            StorageRequestModel.source_app == payload.source_app,
            StorageRequestModel.workspace_key == workspace_key,
            StorageRequestModel.status == "pending",
        )
        .first()
    )
    if existing_pending:
        existing_pending.external_workspace_id = payload.external_workspace_id
        existing_pending.workspace_name = payload.workspace_name
        existing_pending.owner_user_id = user.get("id")
        existing_pending.owner_name = user.get("full_name")
        existing_pending.owner_email = user.get("email")
        existing_pending.requested_bytes = payload.requested_bytes
        existing_pending.reason = payload.reason
        existing_pending.member_emails = ",".join(normalize_member_emails(payload.member_emails))
        db.commit()
        db.refresh(existing_pending)
        return existing_pending

    request = StorageRequestModel(
        source_app=payload.source_app,
        external_workspace_id=payload.external_workspace_id,
        workspace_key=workspace_key,
        workspace_name=payload.workspace_name,
        owner_user_id=user.get("id"),
        owner_name=user.get("full_name"),
        owner_email=user.get("email"),
        requested_bytes=payload.requested_bytes,
        reason=payload.reason,
        member_emails=",".join(normalize_member_emails(payload.member_emails)),
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@app.get("/api/storage-requests/{source_app}/{workspace_key}/latest", response_model=StorageRequestRead | None)
def get_latest_storage_request(source_app: str, workspace_key: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request = (
        db.query(StorageRequestModel)
        .filter(StorageRequestModel.source_app == source_app, StorageRequestModel.workspace_key == workspace_key.upper())
        .order_by(StorageRequestModel.created_at.desc())
        .first()
    )
    if not request:
        return None
    if (
        not user.get("is_platform_admin")
        and "gatestorage:admin" not in user.get("permissions", [])
        and request.owner_user_id != user.get("id")
        and not is_storage_request_member(user, request)
    ):
        raise HTTPException(status_code=403, detail="You cannot view this storage request")
    return request


@app.get("/api/storage-requests", response_model=list[StorageRequestRead])
def list_storage_requests(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:admin")
    return db.query(StorageRequestModel).order_by(StorageRequestModel.created_at.desc()).all()


@app.get("/api/my/storage-requests", response_model=list[StorageRequestRead])
def list_my_storage_requests(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:request")
    return (
        db.query(StorageRequestModel)
        .filter(StorageRequestModel.owner_user_id == user.get("id"))
        .order_by(StorageRequestModel.created_at.desc())
        .all()
    )


@app.get("/api/my/workspaces", response_model=list[StorageWorkspaceRead])
def list_my_workspaces(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    refresh_gatewiki_memberships(db)
    member_workspace_ids = (
        db.query(StorageWorkspaceMemberModel.workspace_id)
        .filter(StorageWorkspaceMemberModel.user_email == normalize_email(user.get("email")))
    )
    workspaces = (
        db.query(StorageWorkspaceModel)
        .filter(or_(StorageWorkspaceModel.owner_user_id == user.get("id"), StorageWorkspaceModel.id.in_(member_workspace_ids)))
        .order_by(StorageWorkspaceModel.created_at.desc())
        .all()
    )
    return [serialize_workspace(workspace, db) for workspace in workspaces]


@app.get("/api/workspaces/{workspace_id}/files", response_model=list[StorageFileRead])
def list_workspace_files(workspace_id: str, request: Request, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    get_allowed_workspace(workspace_id, user, db)
    files = (
        db.query(StorageFileModel)
        .filter(StorageFileModel.workspace_id == workspace_id)
        .order_by(StorageFileModel.created_at.desc())
        .all()
    )
    return [{**file.__dict__, "public_url": public_file_url(request, file)} for file in files]


@app.get("/api/workspaces/{workspace_id}/entries", response_model=list[StorageEntryRead])
def list_workspace_entries(
    workspace_id: str,
    request: Request,
    folder: str = "",
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = get_allowed_workspace(workspace_id, user, db)
    folder_path = safe_folder_path(folder)
    folder_prefix = f"{folder_path}/" if folder_path else ""
    current_dir = ensure_workspace_path(workspace, folder_path)
    current_dir.mkdir(parents=True, exist_ok=True)

    folder_names: set[str] = set()
    for child in current_dir.iterdir():
        if child.is_dir():
            folder_names.add(child.name)

    files = db.query(StorageFileModel).filter(StorageFileModel.workspace_id == workspace_id).all()
    visible_files: list[StorageFileModel] = []
    for file in files:
        relative = file.relative_path.replace("\\", "/")
        if folder_prefix and not relative.startswith(folder_prefix):
            continue
        remainder = relative[len(folder_prefix):] if folder_prefix else relative
        if "/" in remainder:
            folder_names.add(remainder.split("/", 1)[0])
        elif remainder:
            visible_files.append(file)

    folder_entries = [
        {
            "type": "folder",
            "name": name,
            "path": f"{folder_prefix}{name}".strip("/"),
            "size_bytes": 0,
        }
        for name in sorted(folder_names, key=str.lower)
    ]
    file_entries = sorted((storage_file_to_entry(file, request) for file in visible_files), key=lambda item: item["name"].lower())
    return [*folder_entries, *file_entries]


@app.post("/api/workspaces/{workspace_id}/folders", response_model=StorageEntryRead)
def create_workspace_folder(
    workspace_id: str,
    payload: StorageFolderCreate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = get_allowed_workspace(workspace_id, user, db)
    ensure_workspace_writable(workspace)
    folder_path = safe_folder_path(payload.folder)
    if not folder_path:
        raise HTTPException(status_code=400, detail="Folder name is required")
    ensure_workspace_path(workspace, folder_path).mkdir(parents=True, exist_ok=True)
    return {
        "type": "folder",
        "name": Path(folder_path).name,
        "path": folder_path,
        "size_bytes": 0,
    }


@app.post("/api/workspaces/{workspace_id}/files", response_model=StorageFileRead)
def upload_workspace_file(
    workspace_id: str,
    request: Request,
    file: UploadFile = File(...),
    folder: str = Form(default=""),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = get_allowed_workspace(workspace_id, user, db)
    ensure_workspace_writable(workspace)
    original_filename = safe_filename(file.filename or "archivo")
    folder_parts = safe_folder_parts(folder)
    stored_filename = f"{uuid.uuid4()}_{original_filename}"
    relative_path = Path(*folder_parts, stored_filename) if folder_parts else Path(stored_filename)
    destination = ensure_workspace_path(workspace, relative_path)
    destination.parent.mkdir(parents=True, exist_ok=True)

    size_bytes = 0
    try:
        with destination.open("wb") as output:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if workspace.used_bytes + size_bytes > workspace.quota_bytes:
                    raise HTTPException(status_code=400, detail="Storage quota exceeded")
                output.write(chunk)
    except HTTPException:
        if destination.exists():
            destination.unlink()
        raise
    finally:
        file.file.close()

    storage_file = StorageFileModel(
        workspace_id=workspace.id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        relative_path=str(relative_path).replace("\\", "/"),
        content_type=file.content_type,
        size_bytes=size_bytes,
        uploaded_by_user_id=user.get("id"),
        uploaded_by_name=user.get("full_name"),
    )
    workspace.used_bytes += size_bytes
    db.add(storage_file)
    db.commit()
    db.refresh(storage_file)
    return {**storage_file.__dict__, "public_url": public_file_url(request, storage_file)}


@app.patch("/api/files/{file_id}/move", response_model=StorageFileRead)
def move_storage_file(
    file_id: str,
    payload: StorageFileMove,
    request: Request,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    storage_file = db.query(StorageFileModel).filter(StorageFileModel.id == file_id).first()
    if not storage_file:
        raise HTTPException(status_code=404, detail="File not found")
    workspace = get_allowed_workspace(storage_file.workspace_id, user, db)
    ensure_workspace_writable(workspace)
    current_path = ensure_workspace_path(workspace, storage_file.relative_path)
    if not current_path.exists():
        raise HTTPException(status_code=404, detail="File content not found")

    target_name = safe_filename(payload.filename or storage_file.original_filename)
    target_folder = safe_folder_path(payload.folder)
    target_relative = Path(target_folder, storage_file.stored_filename) if target_folder else Path(storage_file.stored_filename)
    target_path = ensure_workspace_path(workspace, target_relative)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path != current_path:
        if target_path.exists():
            raise HTTPException(status_code=400, detail="A file already exists at the destination")
        current_path.replace(target_path)

    storage_file.original_filename = target_name
    storage_file.relative_path = str(target_relative).replace("\\", "/")
    db.commit()
    db.refresh(storage_file)
    return {**storage_file.__dict__, "public_url": public_file_url(request, storage_file)}


@app.patch("/api/files/{file_id}/public", response_model=StorageFileRead)
def update_file_public_access(
    file_id: str,
    payload: StorageFilePublicUpdate,
    request: Request,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    storage_file = db.query(StorageFileModel).filter(StorageFileModel.id == file_id).first()
    if not storage_file:
        raise HTTPException(status_code=404, detail="File not found")
    workspace = get_allowed_workspace(storage_file.workspace_id, user, db)
    ensure_workspace_writable(workspace)
    if not can_manage_workspace(user, workspace) and storage_file.uploaded_by_user_id != user.get("id"):
        raise HTTPException(status_code=403, detail="You cannot change public access for this file")
    storage_file.is_public = payload.is_public
    if payload.is_public and not storage_file.public_token:
        storage_file.public_token = uuid.uuid4().hex + uuid.uuid4().hex[:12]
    if not payload.is_public:
        storage_file.public_token = None
    db.commit()
    db.refresh(storage_file)
    return {**storage_file.__dict__, "public_url": public_file_url(request, storage_file)}


@app.patch("/api/workspaces/{workspace_id}/folders/move", response_model=StorageEntryRead)
def move_workspace_folder(
    workspace_id: str,
    payload: StorageFolderMove,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = get_allowed_workspace(workspace_id, user, db)
    ensure_workspace_writable(workspace)
    source_path = safe_folder_path(payload.source)
    target_path = safe_folder_path(payload.target)
    if not source_path or not target_path:
        raise HTTPException(status_code=400, detail="Source and target folders are required")
    if target_path == source_path or target_path.startswith(f"{source_path}/"):
        raise HTTPException(status_code=400, detail="Folder cannot be moved into itself")

    source_abs = ensure_workspace_path(workspace, source_path)
    target_abs = ensure_workspace_path(workspace, target_path)
    if not source_abs.exists() or not source_abs.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")
    if target_abs.exists():
        raise HTTPException(status_code=400, detail="A folder already exists at the destination")

    target_abs.parent.mkdir(parents=True, exist_ok=True)
    source_abs.replace(target_abs)

    source_prefix = f"{source_path}/"
    target_prefix = f"{target_path}/"
    files = (
        db.query(StorageFileModel)
        .filter(StorageFileModel.workspace_id == workspace_id, StorageFileModel.relative_path.like(f"{source_prefix}%"))
        .all()
    )
    for file in files:
        file.relative_path = f"{target_prefix}{file.relative_path[len(source_prefix):]}"
    db.commit()
    return {
        "type": "folder",
        "name": Path(target_path).name,
        "path": target_path,
        "size_bytes": 0,
    }


@app.delete("/api/workspaces/{workspace_id}/folders", status_code=204)
def delete_workspace_folder(
    workspace_id: str,
    folder: str,
    recursive: bool = False,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = get_allowed_workspace(workspace_id, user, db)
    ensure_workspace_writable(workspace)
    folder_path = safe_folder_path(folder)
    if not folder_path:
        raise HTTPException(status_code=400, detail="Folder name is required")
    prefix = f"{folder_path}/"
    files = (
        db.query(StorageFileModel)
        .filter(StorageFileModel.workspace_id == workspace_id, StorageFileModel.relative_path.like(f"{prefix}%"))
        .all()
    )
    if files and not recursive:
        raise HTTPException(status_code=400, detail="Folder is not empty")
    path = ensure_workspace_path(workspace, folder_path)
    if path.exists():
        if recursive:
            shutil.rmtree(path)
        else:
            try:
                path.rmdir()
            except OSError:
                raise HTTPException(status_code=400, detail="Folder is not empty")
    if recursive and files:
        removed_bytes = sum(file.size_bytes for file in files)
        for file in files:
            db.delete(file)
        workspace.used_bytes = max(0, workspace.used_bytes - removed_bytes)
        db.commit()
    return None


@app.get("/api/files/{file_id}/download")
def download_storage_file(file_id: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    storage_file = db.query(StorageFileModel).filter(StorageFileModel.id == file_id).first()
    if not storage_file:
        raise HTTPException(status_code=404, detail="File not found")
    workspace = get_allowed_workspace(storage_file.workspace_id, user, db)
    ensure_workspace_writable(workspace)
    path = ensure_workspace_path(workspace, storage_file.relative_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File content not found")
    return FileResponse(path, media_type=storage_file.content_type or "application/octet-stream", filename=storage_file.original_filename)


@app.get("/public/files/{public_token}/download")
def download_public_file(public_token: str, db: Session = Depends(get_db)):
    storage_file = (
        db.query(StorageFileModel)
        .filter(StorageFileModel.public_token == public_token, StorageFileModel.is_public == True)
        .first()
    )
    if not storage_file:
        raise HTTPException(status_code=404, detail="Public file not found")
    workspace = db.query(StorageWorkspaceModel).filter(StorageWorkspaceModel.id == storage_file.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Storage workspace not found")
    path = ensure_workspace_path(workspace, storage_file.relative_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File content not found")
    return FileResponse(path, media_type=storage_file.content_type or "application/octet-stream", filename=storage_file.original_filename)


@app.delete("/api/files/{file_id}", status_code=204)
def delete_storage_file(file_id: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    storage_file = db.query(StorageFileModel).filter(StorageFileModel.id == file_id).first()
    if not storage_file:
        raise HTTPException(status_code=404, detail="File not found")
    workspace = get_allowed_workspace(storage_file.workspace_id, user, db)
    path = ensure_workspace_path(workspace, storage_file.relative_path)
    if path.exists():
        path.unlink()
    workspace.used_bytes = max(0, workspace.used_bytes - storage_file.size_bytes)
    db.delete(storage_file)
    db.commit()
    return None


@app.get("/api/workspaces/{source_app}/{workspace_key}", response_model=StorageWorkspaceRead | None)
def get_workspace_storage(source_app: str, workspace_key: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    workspace = (
        db.query(StorageWorkspaceModel)
        .filter(StorageWorkspaceModel.source_app == source_app, StorageWorkspaceModel.workspace_key == workspace_key.upper())
        .first()
    )
    if not workspace:
        return None
    refresh_gatewiki_workspace_members(db, workspace)
    db.commit()
    db.refresh(workspace)
    if not can_access_workspace(user, workspace, db):
        raise HTTPException(status_code=403, detail="You cannot access this storage workspace")
    return serialize_workspace(workspace, db)


@app.put("/api/workspaces/{source_app}/{workspace_key}/members", response_model=StorageWorkspaceRead | None)
def sync_workspace_members(
    source_app: str,
    workspace_key: str,
    payload: StorageWorkspaceMembersUpdate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_permission(user, "gatestorage:view")
    workspace = (
        db.query(StorageWorkspaceModel)
        .filter(StorageWorkspaceModel.source_app == source_app, StorageWorkspaceModel.workspace_key == workspace_key.upper())
        .first()
    )
    if not workspace:
        return None
    if not can_manage_workspace(user, workspace):
        raise HTTPException(status_code=403, detail="You cannot manage this storage workspace")
    member_emails = normalize_member_emails(payload.member_emails)
    apply_workspace_members(db, workspace, member_emails)
    update_gatewiki_allowed_emails(db, workspace, member_emails)
    db.commit()
    db.refresh(workspace)
    return serialize_workspace(workspace, db)


@app.patch("/api/workspaces/{workspace_id}/admin", response_model=StorageWorkspaceRead)
def update_workspace_admin_controls(
    workspace_id: str,
    payload: StorageWorkspaceAdminUpdate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_permission(user, "gatestorage:admin")
    if payload.status not in {"active", "suspended", "archived"}:
        raise HTTPException(status_code=400, detail="Status must be active, suspended, or archived")
    workspace = db.query(StorageWorkspaceModel).filter(StorageWorkspaceModel.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Storage workspace not found")
    if payload.quota_bytes < workspace.used_bytes:
        raise HTTPException(status_code=400, detail="Quota cannot be lower than currently used storage")
    workspace.quota_bytes = payload.quota_bytes
    workspace.status = payload.status
    workspace.status_message = payload.status_message.strip()
    db.commit()
    db.refresh(workspace)
    return serialize_workspace(workspace, db)


@app.patch("/api/storage-requests/{request_id}/review", response_model=StorageRequestRead)
def review_storage_request(request_id: str, payload: StorageRequestReview, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:admin")
    if payload.status not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Status must be approved or rejected")

    request = db.query(StorageRequestModel).filter(StorageRequestModel.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Storage request not found")
    if request.status != "pending":
        raise HTTPException(status_code=400, detail="Storage request already reviewed")

    request.status = payload.status
    request.admin_notes = payload.admin_notes
    request.reviewed_by_user_id = user.get("id")
    request.reviewed_by_name = user.get("full_name")
    request.reviewed_at = datetime.utcnow()

    if payload.status == "approved":
        workspace = (
            db.query(StorageWorkspaceModel)
            .filter(StorageWorkspaceModel.source_app == request.source_app, StorageWorkspaceModel.workspace_key == request.workspace_key)
            .first()
        )
        if workspace:
            workspace.quota_bytes += payload.quota_bytes
            workspace.status = "active"
        else:
            workspace = StorageWorkspaceModel(
                source_app=request.source_app,
                external_workspace_id=request.external_workspace_id,
                workspace_key=request.workspace_key,
                workspace_name=request.workspace_name,
                owner_user_id=request.owner_user_id,
                owner_name=request.owner_name,
                owner_email=request.owner_email,
                quota_bytes=payload.quota_bytes,
                used_bytes=0,
                status="active",
            )
            db.add(workspace)
            db.flush()
        apply_workspace_members(db, workspace, (request.member_emails or "").split(","))

    db.commit()
    db.refresh(request)
    return request


@app.get("/api/workspaces", response_model=list[StorageWorkspaceRead])
def list_workspaces(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:admin")
    refresh_gatewiki_memberships(db)
    workspaces = db.query(StorageWorkspaceModel).order_by(StorageWorkspaceModel.created_at.desc()).all()
    return [serialize_workspace(workspace, db) for workspace in workspaces]
