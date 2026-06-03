import os
import uuid
import base64
import hashlib
import hmac
import json
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
from sqlalchemy import BigInteger, Column, DateTime, String, Text, UniqueConstraint, create_engine, text
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


class StorageRequestCreate(BaseModel):
    source_app: str = Field(default="gatewiki", max_length=80)
    external_workspace_id: str | None = None
    workspace_key: str = Field(min_length=1, max_length=80)
    workspace_name: str = Field(min_length=1, max_length=180)
    requested_bytes: int = Field(gt=0)
    reason: str = Field(default="", max_length=2000)


class LoginRequest(BaseModel):
    email: str
    password: str


class StorageRequestReview(BaseModel):
    status: str
    quota_bytes: int = Field(ge=0)
    admin_notes: str = Field(default="", max_length=2000)


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
    content_type: str | None
    size_bytes: int
    uploaded_by_user_id: str
    uploaded_by_name: str
    created_at: datetime

    class Config:
        from_attributes = True


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


def can_manage_workspace(user: dict, workspace: StorageWorkspaceModel) -> bool:
    return bool(
        user.get("is_platform_admin")
        or "gatestorage:admin" in user.get("permissions", [])
        or workspace.owner_user_id == user.get("id")
    )


def get_allowed_workspace(workspace_id: str, user: dict, db: Session) -> StorageWorkspaceModel:
    check_permission(user, "gatestorage:view")
    workspace = db.query(StorageWorkspaceModel).filter(StorageWorkspaceModel.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Storage workspace not found")
    if not can_manage_workspace(user, workspace):
        raise HTTPException(status_code=403, detail="You cannot access this storage workspace")
    return workspace


def safe_filename(filename: str) -> str:
    name = Path(filename).name.strip().replace("\\", "_").replace("/", "_")
    return name or "archivo"


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
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@app.get("/api/storage-requests/{source_app}/{workspace_key}/latest", response_model=StorageRequestRead | None)
def get_latest_storage_request(source_app: str, workspace_key: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:request")
    request = (
        db.query(StorageRequestModel)
        .filter(StorageRequestModel.source_app == source_app, StorageRequestModel.workspace_key == workspace_key.upper())
        .order_by(StorageRequestModel.created_at.desc())
        .first()
    )
    if not request:
        return None
    if not user.get("is_platform_admin") and "gatestorage:admin" not in user.get("permissions", []) and request.owner_user_id != user.get("id"):
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
    check_permission(user, "gatestorage:view")
    return (
        db.query(StorageWorkspaceModel)
        .filter(StorageWorkspaceModel.owner_user_id == user.get("id"))
        .order_by(StorageWorkspaceModel.created_at.desc())
        .all()
    )


@app.get("/api/workspaces/{workspace_id}/files", response_model=list[StorageFileRead])
def list_workspace_files(workspace_id: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    get_allowed_workspace(workspace_id, user, db)
    return (
        db.query(StorageFileModel)
        .filter(StorageFileModel.workspace_id == workspace_id)
        .order_by(StorageFileModel.created_at.desc())
        .all()
    )


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
    folder_parts = [safe_filename(part) for part in folder.split("/") if part.strip()]
    stored_filename = f"{uuid.uuid4()}_{original_filename}"
    relative_path = Path(*folder_parts, stored_filename) if folder_parts else Path(stored_filename)
    destination = workspace_dir(workspace.id) / relative_path
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
    check_permission(user, "gatestorage:view")
    workspace = (
        db.query(StorageWorkspaceModel)
        .filter(StorageWorkspaceModel.source_app == source_app, StorageWorkspaceModel.workspace_key == workspace_key.upper())
        .first()
    )
    return workspace


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

    db.commit()
    db.refresh(request)
    return request


@app.get("/api/workspaces", response_model=list[StorageWorkspaceRead])
def list_workspaces(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:admin")
    return db.query(StorageWorkspaceModel).order_by(StorageWorkspaceModel.created_at.desc()).all()
