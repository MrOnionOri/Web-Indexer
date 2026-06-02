import os
import uuid
from datetime import datetime
from urllib.parse import quote_plus
from typing import List, Optional

import requests
from fastapi import Depends, FastAPI, HTTPException, Request, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import BigInteger, Column, DateTime, String, Text, UniqueConstraint, create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "gatestack")
GATESTACK_API_URL = os.getenv("GATESTACK_API_URL", "http://192.168.1.150:8000").rstrip("/")
GATESTACK_FALLBACK_URLS = [url.strip().rstrip("/") for url in os.getenv("GATESTACK_FALLBACK_URLS", "").split(",") if url.strip()]
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


def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    headers = {"Authorization": f"Bearer {credentials.credentials}"}
    for base_url in get_gatestack_urls(request):
        try:
            response = requests.get(f"{base_url}/auth/me", headers=headers, timeout=2.5)
            if response.status_code == 200:
                return response.json()
        except Exception:
            continue
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="GateStack IAM unavailable or invalid token")


def check_permission(user: dict, permission: str):
    if user.get("is_platform_admin") or permission in user.get("permissions", []):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {permission}")


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


@app.get("/api/workspaces/{source_app}/{workspace_key}", response_model=StorageWorkspaceRead | None)
def get_workspace_storage(source_app: str, workspace_key: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:view")
    workspace = (
        db.query(StorageWorkspaceModel)
        .filter(StorageWorkspaceModel.source_app == source_app, StorageWorkspaceModel.workspace_key == workspace_key.upper())
        .first()
    )
    return workspace


@app.post("/api/storage-requests", response_model=StorageRequestRead)
def create_storage_request(payload: StorageRequestCreate, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    check_permission(user, "gatestorage:request")
    workspace_key = payload.workspace_key.upper()

    existing_workspace = (
        db.query(StorageWorkspaceModel)
        .filter(StorageWorkspaceModel.source_app == payload.source_app, StorageWorkspaceModel.workspace_key == workspace_key)
        .first()
    )
    if existing_workspace:
        raise HTTPException(status_code=409, detail="This workspace already has storage assigned")

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
