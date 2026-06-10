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
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Security, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import BigInteger, Column, DateTime, String, Text, UniqueConstraint, create_engine, or_, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "gatestack")
GATESTACK_API_URL = os.getenv("GATESTACK_API_URL", "http://192.168.1.150:8000").rstrip("/")
GATESTACK_FALLBACK_URLS = [url.strip().rstrip("/") for url in os.getenv("GATESTACK_FALLBACK_URLS", "").split(",") if url.strip()]
GATESTACK_SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-key")
STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", "./data/storage")).resolve()
CORS_ALLOWED_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?",
)

user_escaped = quote_plus(DB_USER)
password_escaped = quote_plus(DB_PASSWORD)
DATABASE_URL = f"mysql+pymysql://{user_escaped}:{password_escaped}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
security = HTTPBearer()


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
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def init_db_compatibility() -> None:
    try:
        with engine.connect() as conn:
            request_columns = {row[0] for row in conn.execute(text("SHOW COLUMNS FROM storage_requests")).fetchall()}
            if "member_emails" not in request_columns:
                conn.execute(text("ALTER TABLE storage_requests ADD COLUMN member_emails TEXT NULL"))
            conn.execute(text("UPDATE storage_requests SET member_emails = '' WHERE member_emails IS NULL"))
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


class StorageFolderCreate(BaseModel):
    folder: str = Field(default="", max_length=600)


class StorageFileMove(BaseModel):
    folder: str = Field(default="", max_length=600)
    filename: str | None = Field(default=None, max_length=255)


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


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> dict:
    headers = {"Authorization": f"Bearer {credentials.credentials}"}
    for base_url in get_gatestack_urls(request):
        try:
            response = requests.get(f"{base_url}/auth/me", headers=headers, timeout=2.5)
            if response.status_code == 200:
                return response.json()
        except Exception:
            continue

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
        "member_emails": workspace_member_emails(db, workspace),
        "created_at": workspace.created_at,
        "updated_at": workspace.updated_at,
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
    if not str(path).startswith(str(root)):
        raise HTTPException(status_code=400, detail="Invalid storage path")
    return path


def storage_file_to_entry(file: StorageFileModel) -> dict:
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
        "created_at": file.created_at,
    }


def workspace_dir(workspace_id: str) -> Path:
    return STORAGE_ROOT / workspace_id


def forward_gatestack_request(method: str, path: str, request: Optional[Request] = None, **kwargs):
    last_error = "GateStack IAM unavailable"
    for base_url in get_gatestack_urls(request):
        try:
            response = requests.request(method, f"{base_url}{path}", timeout=4.0, **kwargs)
            try:
                payload = response.json()
            except ValueError:
                payload = {"detail": response.text or "Invalid GateStack IAM response"}
            if response.status_code >= 400:
                raise HTTPException(status_code=response.status_code, detail=payload.get("detail", payload))
            return payload
        except HTTPException:
            raise
        except Exception as exc:
            last_error = str(exc)
            continue
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=last_error)


app = FastAPI(title="GateStorage Service")
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
def login(payload: LoginRequest, request: Request):
    return forward_gatestack_request("POST", "/auth/login", request=request, json=payload.model_dump())


@app.get("/api/users", response_model=list[UserListItem])
def list_users(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT email, full_name FROM users WHERE status = 'approved' ORDER BY full_name, email")
    ).mappings()
    return [{"email": row["email"], "full_name": row["full_name"]} for row in rows]


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
def list_workspace_files(workspace_id: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    get_allowed_workspace(workspace_id, user, db)
    return (
        db.query(StorageFileModel)
        .filter(StorageFileModel.workspace_id == workspace_id)
        .order_by(StorageFileModel.created_at.desc())
        .all()
    )


@app.get("/api/workspaces/{workspace_id}/entries", response_model=list[StorageEntryRead])
def list_workspace_entries(
    workspace_id: str,
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
    file_entries = sorted((storage_file_to_entry(file) for file in visible_files), key=lambda item: item["name"].lower())
    return [*folder_entries, *file_entries]


@app.post("/api/workspaces/{workspace_id}/folders", response_model=StorageEntryRead)
def create_workspace_folder(
    workspace_id: str,
    payload: StorageFolderCreate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = get_allowed_workspace(workspace_id, user, db)
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
    file: UploadFile = File(...),
    folder: str = Form(default=""),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = get_allowed_workspace(workspace_id, user, db)
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
    return storage_file


@app.patch("/api/files/{file_id}/move", response_model=StorageFileRead)
def move_storage_file(
    file_id: str,
    payload: StorageFileMove,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    storage_file = db.query(StorageFileModel).filter(StorageFileModel.id == file_id).first()
    if not storage_file:
        raise HTTPException(status_code=404, detail="File not found")
    workspace = get_allowed_workspace(storage_file.workspace_id, user, db)
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
    return storage_file


@app.patch("/api/workspaces/{workspace_id}/folders/move", response_model=StorageEntryRead)
def move_workspace_folder(
    workspace_id: str,
    payload: StorageFolderMove,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = get_allowed_workspace(workspace_id, user, db)
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
    path = (workspace_dir(workspace.id) / storage_file.relative_path).resolve()
    if not str(path).startswith(str(workspace_dir(workspace.id).resolve())) or not path.exists():
        raise HTTPException(status_code=404, detail="File content not found")
    return FileResponse(path, media_type=storage_file.content_type or "application/octet-stream", filename=storage_file.original_filename)


@app.delete("/api/files/{file_id}", status_code=204)
def delete_storage_file(file_id: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    storage_file = db.query(StorageFileModel).filter(StorageFileModel.id == file_id).first()
    if not storage_file:
        raise HTTPException(status_code=404, detail="File not found")
    workspace = get_allowed_workspace(storage_file.workspace_id, user, db)
    path = (workspace_dir(workspace.id) / storage_file.relative_path).resolve()
    if str(path).startswith(str(workspace_dir(workspace.id).resolve())) and path.exists():
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
