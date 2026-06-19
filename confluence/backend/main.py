import os
import uuid
import base64
import hashlib
import json
import re
import time
import unicodedata
from difflib import SequenceMatcher
from datetime import datetime
from pathlib import Path
from typing import List, Optional
import requests
from dotenv import load_dotenv
from urllib.parse import quote_plus
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from fastapi import FastAPI, Depends, HTTPException, Request, Response, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, String, Text, Boolean, DateTime, Integer, text, ForeignKey, bindparam
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import declarative_base, sessionmaker, Session

for parent in Path(__file__).resolve().parents:
    env_path = parent / ".env"
    if env_path.is_file():
        load_dotenv(env_path)
        break

# ----------------- CONFIGURACIÃ“N & DB (MySQL) -----------------
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER") or os.getenv("GATEWIKI_DB_USER", "gatewiki_app")
DB_PASSWORD = os.getenv("DB_PASSWORD") or os.getenv("GATEWIKI_DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "gatestack")
ENVIRONMENT = os.getenv("ENVIRONMENT", "local").lower()
SECRET_KEY = os.getenv("SECRET_KEY")
DATA_ENCRYPTION_KEY = os.getenv("DATA_ENCRYPTION_KEY")
ENCRYPTION_PREFIX = "enc:v1:"

if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError("SECRET_KEY must be set to a strong value")
if not DATA_ENCRYPTION_KEY or len(DATA_ENCRYPTION_KEY) < 32:
    raise RuntimeError("DATA_ENCRYPTION_KEY must be set to a strong value")


def encryption_key() -> bytes:
    return hashlib.sha256(DATA_ENCRYPTION_KEY.encode("utf-8")).digest()


def encrypt_text(value: Optional[str]) -> str:
    if not value:
        return ""
    if value.startswith(ENCRYPTION_PREFIX):
        return value
    nonce = os.urandom(12)
    ciphertext = AESGCM(encryption_key()).encrypt(nonce, value.encode("utf-8"), None)
    return ENCRYPTION_PREFIX + base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_text(value: Optional[str]) -> str:
    if not value:
        return ""
    if not value.startswith(ENCRYPTION_PREFIX):
        return value
    payload = base64.urlsafe_b64decode(value[len(ENCRYPTION_PREFIX) :].encode("ascii"))
    nonce, ciphertext = payload[:12], payload[12:]
    return AESGCM(encryption_key()).decrypt(nonce, ciphertext, None).decode("utf-8")

# URL-escape para caracteres especiales en la contraseÃ±a (ej: @, /)
user_escaped = quote_plus(DB_USER)
password_escaped = quote_plus(DB_PASSWORD)
DATABASE_URL = f"mysql+pymysql://{user_escaped}:{password_escaped}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# URL de GateStack. En pruebas con varios dispositivos fija:
# GATESTACK_API_URL=http://TU_IPV4:8000
GATESTACK_API_URL = os.getenv("GATESTACK_API_URL", "http://192.168.1.150:8000").rstrip("/")
GATESTACK_FALLBACK_URLS = [
    url.strip().rstrip("/")
    for url in os.getenv("GATESTACK_FALLBACK_URLS", "").split(",")
    if url.strip()
]
GATESTORAGE_API_URL = os.getenv("GATESTORAGE_API_URL", "http://192.168.1.150:8002").rstrip("/")
GATESTORAGE_FALLBACK_URLS = [
    url.strip().rstrip("/")
    for url in os.getenv("GATESTORAGE_FALLBACK_URLS", "").split(",")
    if url.strip()
]
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "").rstrip("/")
OLLAMA_FALLBACK_URLS = [
    url.strip().rstrip("/")
    for url in os.getenv("OLLAMA_FALLBACK_URLS", "").split(",")
    if url.strip()
]
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "gatewiki-assistant")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "45"))
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
CORS_ALLOWED_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?",
)

# ----------------- MODELOS DE BASE DE DATOS -----------------
class SpaceModel(Base):
    __tablename__ = "confluence_spaces"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(140), unique=True, nullable=False)
    key = Column(String(20), unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    created_by_email = Column(String(255), nullable=True)
    created_by_name = Column(String(160), nullable=True)
    created_by_id = Column(String(36), nullable=True)
    is_restricted = Column(Boolean, default=False, nullable=True)
    allowed_emails = Column(Text, default="", nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PageModel(Base):
    __tablename__ = "confluence_pages"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    space_key = Column(String(20), nullable=False, index=True)
    title = Column(String(180), nullable=False)
    content = Column(LONGTEXT, default="")
    subtopics = Column(LONGTEXT, default="", nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_by_email = Column(String(255), nullable=False)
    created_by_name = Column(String(160), nullable=False)
    created_by_id = Column(String(36), nullable=False)
    is_restricted = Column(Boolean, default=False)
    allowed_emails = Column(Text, default="")  # Almacenado como correos separados por comas
    comments_allowed = Column(Boolean, default=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CommentModel(Base):
    __tablename__ = "confluence_comments"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    page_id = Column(String(36), ForeignKey("confluence_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(String(36), ForeignKey("confluence_comments.id", ondelete="CASCADE"), nullable=True)
    author_email = Column(String(255), nullable=False)
    author_name = Column(String(160), nullable=False)
    author_id = Column(String(36), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CommentReactionModel(Base):
    __tablename__ = "confluence_comment_reactions"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    comment_id = Column(String(36), ForeignKey("confluence_comments.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), nullable=False)
    user_name = Column(String(160), nullable=False)
    emoji = Column(String(10), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FeedbackItemModel(Base):
    __tablename__ = "feedback_items"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_app = Column(String(80), default="gatewiki", index=True)
    title = Column(String(180), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(40), default="open", index=True)
    page_id = Column(String(36), nullable=True)
    page_title = Column(String(180), nullable=True)
    space_key = Column(String(20), nullable=True)
    created_by_user_id = Column(String(36), index=True, nullable=False)
    created_by_name = Column(String(160), nullable=False)
    created_by_email = Column(String(255), index=True, nullable=False)
    public_response = Column(Text, default="")
    responded_by_user_id = Column(String(36), nullable=True)
    responded_by_name = Column(String(160), nullable=True)
    responded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AiInteractionModel(Base):
    __tablename__ = "gatewiki_ai_interactions"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), nullable=False, index=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False, index=True)
    user_name = Column(String(160), nullable=False)
    user_email = Column(String(255), nullable=False, index=True)
    question = Column(LONGTEXT, nullable=False)
    answer = Column(LONGTEXT, nullable=False)
    scope_type = Column(String(20), nullable=False, default="all", index=True)
    space_key = Column(String(20), nullable=True, index=True)
    page_id = Column(String(36), nullable=True, index=True)
    page_title = Column(String(180), nullable=True)
    engine = Column(String(40), nullable=False, index=True)
    model_name = Column(String(120), nullable=True)
    searched_pages = Column(Integer, nullable=False, default=0)
    source_count = Column(Integer, nullable=False, default=0)
    sources_json = Column(LONGTEXT, nullable=False)
    duration_ms = Column(Integer, nullable=False, default=0)
    review_status = Column(String(24), nullable=False, default="unreviewed", index=True)
    review_note = Column(LONGTEXT, nullable=False)
    reviewed_by_user_id = Column(String(36), nullable=True)
    reviewed_by_name = Column(String(160), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

def init_db_for_local_dev() -> None:
    Base.metadata.create_all(bind=engine)

    # Compatibilidad temporal para bases creadas antes de Alembic.
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SHOW COLUMNS FROM confluence_spaces"))
            existing_cols = {row[0] for row in result.fetchall()}
            
            if "created_by_email" not in existing_cols:
                conn.execute(text("ALTER TABLE confluence_spaces ADD COLUMN created_by_email VARCHAR(255) NULL"))
            if "created_by_name" not in existing_cols:
                conn.execute(text("ALTER TABLE confluence_spaces ADD COLUMN created_by_name VARCHAR(160) NULL"))
            if "created_by_id" not in existing_cols:
                conn.execute(text("ALTER TABLE confluence_spaces ADD COLUMN created_by_id VARCHAR(36) NULL"))
            if "is_restricted" not in existing_cols:
                conn.execute(text("ALTER TABLE confluence_spaces ADD COLUMN is_restricted BOOLEAN DEFAULT FALSE NULL"))
            if "allowed_emails" not in existing_cols:
                conn.execute(text("ALTER TABLE confluence_spaces ADD COLUMN allowed_emails TEXT NULL"))
                
            p_result = conn.execute(text("SHOW COLUMNS FROM confluence_pages"))
            existing_p_cols = {row[0] for row in p_result.fetchall()}
            if "comments_allowed" not in existing_p_cols:
                conn.execute(text("ALTER TABLE confluence_pages ADD COLUMN comments_allowed BOOLEAN DEFAULT TRUE NULL"))
            if "subtopics" not in existing_p_cols:
                conn.execute(text("ALTER TABLE confluence_pages ADD COLUMN subtopics TEXT NULL"))
            if "sort_order" not in existing_p_cols:
                conn.execute(text("ALTER TABLE confluence_pages ADD COLUMN sort_order INT NOT NULL DEFAULT 0"))
            conn.execute(text("ALTER TABLE confluence_pages MODIFY COLUMN content LONGTEXT NULL"))
            conn.execute(text("ALTER TABLE confluence_pages MODIFY COLUMN subtopics LONGTEXT NULL"))
                
            c_result = conn.execute(text("SHOW COLUMNS FROM confluence_comments"))
            existing_c_cols = {row[0] for row in c_result.fetchall()}
            if "parent_id" not in existing_c_cols:
                conn.execute(text("ALTER TABLE confluence_comments ADD COLUMN parent_id VARCHAR(36) NULL"))

            f_result = conn.execute(text("SHOW COLUMNS FROM feedback_items"))
            existing_f_cols = {row[0] for row in f_result.fetchall()}
            if "public_response" not in existing_f_cols:
                conn.execute(text("ALTER TABLE feedback_items ADD COLUMN public_response TEXT NULL"))

            ai_result = conn.execute(text("SHOW COLUMNS FROM gatewiki_ai_interactions"))
            existing_ai_cols = {row[0] for row in ai_result.fetchall()}
            if "session_id" not in existing_ai_cols:
                conn.execute(text("ALTER TABLE gatewiki_ai_interactions ADD COLUMN session_id VARCHAR(36) NULL AFTER id"))
                conn.execute(text("UPDATE gatewiki_ai_interactions SET session_id = id WHERE session_id IS NULL"))
                conn.execute(text("ALTER TABLE gatewiki_ai_interactions MODIFY COLUMN session_id VARCHAR(36) NOT NULL"))
                conn.execute(text("CREATE INDEX ix_gatewiki_ai_interactions_session_id ON gatewiki_ai_interactions (session_id)"))
                
            conn.commit()
    except Exception as e:
        print("Nota: Error durante la migraciÃ³n de columnas:", e)


def encrypt_existing_sensitive_data() -> None:
    db = SessionLocal()
    changed = False
    try:
        for page in db.query(PageModel).all():
            if page.content and not page.content.startswith(ENCRYPTION_PREFIX):
                page.content = encrypt_text(page.content)
                changed = True
            if page.subtopics and not page.subtopics.startswith(ENCRYPTION_PREFIX):
                page.subtopics = encrypt_text(page.subtopics)
                changed = True
        for comment in db.query(CommentModel).all():
            if comment.content and not comment.content.startswith(ENCRYPTION_PREFIX):
                comment.content = encrypt_text(comment.content)
                changed = True
        for item in db.query(FeedbackItemModel).all():
            if item.message and not item.message.startswith(ENCRYPTION_PREFIX):
                item.message = encrypt_text(item.message)
                changed = True
            if item.public_response and not item.public_response.startswith(ENCRYPTION_PREFIX):
                item.public_response = encrypt_text(item.public_response)
                changed = True
        try:
            rows = db.execute(text("SELECT id, note FROM feedback_internal_notes WHERE note IS NOT NULL AND note != ''")).mappings().all()
            for row in rows:
                if not row["note"].startswith(ENCRYPTION_PREFIX):
                    db.execute(
                        text("UPDATE feedback_internal_notes SET note = :note WHERE id = :id"),
                        {"id": row["id"], "note": encrypt_text(row["note"])},
                    )
                    changed = True
        except Exception:
            pass
        if changed:
            db.commit()
    finally:
        db.close()


if os.getenv("GATEWIKI_SKIP_DB_INIT") != "1":
    init_db_for_local_dev()
    encrypt_existing_sensitive_data()


# ----------------- SCHEMAS PYDANTIC -----------------
class SpaceCreate(BaseModel):
    name: str
    key: str
    description: str
    is_restricted: bool = False
    allowed_emails: str = ""

class SpaceRead(BaseModel):
    id: str
    name: str
    key: str
    description: str
    created_by_email: Optional[str] = None
    created_by_name: Optional[str] = None
    created_by_id: Optional[str] = None
    is_restricted: Optional[bool] = False
    allowed_emails: Optional[str] = ""
    created_at: datetime
    class Config:
        from_attributes = True


class PageCreate(BaseModel):
    space_key: str
    title: str
    content: str
    subtopics: str = ""
    is_restricted: bool = False
    allowed_emails: str = ""
    comments_allowed: bool = True


class BadgeRead(BaseModel):
    id: str
    code: str
    label: str
    description: str = ""
    color: str = "#2563eb"
    icon: str = "award"
    logo_url: Optional[str] = None

class PageRead(BaseModel):
    id: str
    space_key: str
    title: str
    content: str
    subtopics: Optional[str] = ""
    sort_order: int = 0
    created_by_email: str
    created_by_name: str
    created_by_id: str
    created_by_badges: List[BadgeRead] = Field(default_factory=list)
    is_restricted: bool
    allowed_emails: str
    comments_allowed: bool
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


class PageReorderRequest(BaseModel):
    space_key: str
    page_ids: List[str]


class CommentReactionRead(BaseModel):
    id: str
    comment_id: str
    user_id: str
    user_name: str
    emoji: str
    class Config:
        from_attributes = True


class CommentCreate(BaseModel):
    content: str
    parent_id: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class CommentRead(BaseModel):
    id: str
    page_id: str
    parent_id: Optional[str] = None
    author_email: str
    author_name: str
    author_id: str
    author_badges: List[BadgeRead] = Field(default_factory=list)
    content: str
    created_at: datetime
    reactions: List[CommentReactionRead] = []
    class Config:
        from_attributes = True


class FeedbackCreate(BaseModel):
    title: str
    message: str
    page_id: Optional[str] = None
    page_title: Optional[str] = None
    space_key: Optional[str] = None


class FeedbackResponseUpdate(BaseModel):
    public_response: str
    status: str = "resolved"


class FeedbackStatusUpdate(BaseModel):
    status: str


class FeedbackRead(BaseModel):
    id: str
    source_app: str
    title: str
    message: str
    status: str
    page_id: Optional[str] = None
    page_title: Optional[str] = None
    space_key: Optional[str] = None
    created_by_name: str
    created_by_email: str
    public_response: Optional[str] = ""
    responded_by_name: Optional[str] = None
    responded_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


class StorageRequestCreate(BaseModel):
    requested_gb: int
    reason: str = ""


class AiChatHistoryTurn(BaseModel):
    question: str = Field(..., min_length=1, max_length=1200)
    answer: str = Field(default="", max_length=5000)


class AiChatRequest(BaseModel):
    message: str = Field(..., min_length=2, max_length=1200)
    session_id: Optional[str] = Field(default=None, min_length=8, max_length=36)
    history: List[AiChatHistoryTurn] = Field(default_factory=list, max_length=6)
    space_key: Optional[str] = None
    page_id: Optional[str] = None
    max_sources: int = Field(default=5, ge=1, le=8)


class AiChatSource(BaseModel):
    page_id: Optional[str] = None
    page_title: str
    space_key: str
    source_type: str = "page"
    subtopic_title: Optional[str] = None
    excerpt: str
    score: float


class AiChatResponse(BaseModel):
    answer: str
    sources: List[AiChatSource]
    searched_pages: int


class AiInteractionReviewUpdate(BaseModel):
    review_status: str
    review_note: str = Field(default="", max_length=2000)


class AiInteractionRead(BaseModel):
    id: str
    session_id: str
    user_id: str
    user_name: str
    user_email: str
    question: str
    answer: str
    scope_type: str
    space_key: Optional[str] = None
    page_id: Optional[str] = None
    page_title: Optional[str] = None
    engine: str
    model_name: Optional[str] = None
    searched_pages: int
    source_count: int
    sources: List[AiChatSource]
    duration_ms: int
    review_status: str
    review_note: str
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime


def serialize_ai_interaction(item: AiInteractionModel) -> AiInteractionRead:
    try:
        source_payload = json.loads(decrypt_text(item.sources_json) or "[]")
    except (TypeError, ValueError):
        source_payload = []
    return AiInteractionRead(
        id=item.id,
        session_id=item.session_id,
        user_id=item.user_id,
        user_name=item.user_name,
        user_email=item.user_email,
        question=decrypt_text(item.question),
        answer=decrypt_text(item.answer),
        scope_type=item.scope_type,
        space_key=item.space_key,
        page_id=item.page_id,
        page_title=item.page_title,
        engine=item.engine,
        model_name=item.model_name,
        searched_pages=item.searched_pages,
        source_count=item.source_count,
        sources=[AiChatSource(**source) for source in source_payload],
        duration_ms=item.duration_ms,
        review_status=item.review_status,
        review_note=decrypt_text(item.review_note),
        reviewed_by_name=item.reviewed_by_name,
        reviewed_at=item.reviewed_at,
        created_at=item.created_at,
    )


def save_ai_interaction(
    db: Session,
    user: dict,
    payload: AiChatRequest,
    response: AiChatResponse,
    engine_name: str,
    duration_ms: int,
) -> None:
    try:
        page_title = None
        if payload.page_id:
            page = db.query(PageModel).filter(PageModel.id == payload.page_id).first()
            page_title = page.title if page else None
        scope_type = "page" if payload.page_id else "space" if payload.space_key else "all"
        source_payload = [source.model_dump() for source in response.sources]
        item = AiInteractionModel(
            session_id=payload.session_id or str(uuid.uuid4()),
            user_id=user.get("id", "unknown"),
            user_name=user.get("full_name") or user.get("name") or user.get("email", "Usuario"),
            user_email=user.get("email", "unknown"),
            question=encrypt_text(payload.message.strip()),
            answer=encrypt_text(response.answer),
            scope_type=scope_type,
            space_key=(payload.space_key or "").upper() or None,
            page_id=payload.page_id,
            page_title=page_title,
            engine=engine_name,
            model_name=OLLAMA_CHAT_MODEL if engine_name == "ollama" else None,
            searched_pages=response.searched_pages,
            source_count=len(response.sources),
            sources_json=encrypt_text(json.dumps(source_payload, ensure_ascii=False)),
            duration_ms=max(duration_ms, 0),
            review_status="unreviewed",
            review_note=encrypt_text(""),
        )
        db.add(item)
        db.commit()
    except Exception as exc:
        db.rollback()
        print("Nota: no se pudo guardar la interaccion de IA:", exc)


def serialize_feedback_item(item: FeedbackItemModel) -> FeedbackRead:
    return FeedbackRead(
        id=item.id,
        source_app=item.source_app,
        title=item.title,
        message=decrypt_text(item.message),
        status=item.status,
        page_id=item.page_id,
        page_title=item.page_title,
        space_key=item.space_key,
        created_by_name=item.created_by_name,
        created_by_email=item.created_by_email,
        public_response=decrypt_text(item.public_response),
        responded_by_name=item.responded_by_name,
        responded_at=item.responded_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )

# ----------------- SEGURIDAD & INTEGRACIÃ“N SSO -----------------
security = HTTPBearer(auto_error=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def gatestack_session_headers(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = None) -> dict:
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


def get_current_user(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> dict:
    headers = gatestack_session_headers(request, credentials)
    if not headers:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado.")
    
    urls = get_gatestack_urls(request)
    
    for base_url in urls:
        try:
            response = requests.get(f"{base_url}/auth/me", headers=headers, timeout=2.0)
            if response.status_code == 200:
                return response.json()
        except Exception:
            continue
            
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invÃ¡lido o el servicio central de GateStack IAM no estÃ¡ disponible."
    )

def get_gatestack_urls(request: Optional[Request] = None) -> List[str]:
    inferred_urls: List[str] = []
    if request:
        host = request.url.hostname
        if host and host not in {"localhost", "127.0.0.1"}:
            inferred_urls.append(f"{request.url.scheme}://{host}:8000")

    fallback_urls = [
        "http://host.docker.internal:8000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    return list(dict.fromkeys([
        GATESTACK_API_URL,
        *inferred_urls,
        *GATESTACK_FALLBACK_URLS,
        *fallback_urls,
    ]))

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


def forward_gatestack_request(method: str, path: str, request: Optional[Request] = None, response_out: Optional[Response] = None, **kwargs):
    last_error = "GateStack IAM no estÃ¡ disponible."
    for base_url in get_gatestack_urls(request):
        try:
            headers = dict(kwargs.pop("headers", {}) or {})
            if request:
                headers.update(gatestack_session_headers(request))
            response = requests.request(method, f"{base_url}{path}", timeout=4.0, headers=headers, **kwargs)
            try:
                payload = response.json()
            except ValueError:
                payload = {"detail": response.text or "Respuesta invÃ¡lida de GateStack IAM."}

            if response.status_code >= 400:
                detail = payload.get("detail", payload) if isinstance(payload, dict) else payload
                raise HTTPException(status_code=response.status_code, detail=detail)
            if response_out is not None and request is not None:
                copy_session_cookies(response, response_out, request)
            return payload
        except HTTPException:
            raise
        except Exception as exc:
            last_error = str(exc)
            continue

    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=last_error)


def get_gatestorage_urls(request: Optional[Request] = None) -> List[str]:
    inferred_urls: List[str] = []
    if request:
        host = request.url.hostname
        if host and host not in {"localhost", "127.0.0.1"}:
            inferred_urls.append(f"{request.url.scheme}://{host}:8002")
    return list(dict.fromkeys([
        GATESTORAGE_API_URL,
        *inferred_urls,
        *GATESTORAGE_FALLBACK_URLS,
        "http://host.docker.internal:8002",
        "http://localhost:8002",
        "http://127.0.0.1:8002",
    ]))


def forward_gatestorage_request(method: str, path: str, request: Request, **kwargs):
    last_error = "GateStorage no esta disponible."
    headers = dict(kwargs.pop("headers", {}) or {})
    auth_header = request.headers.get("authorization")
    if auth_header:
        headers["Authorization"] = auth_header
    elif request.cookies.get("gatestack_access"):
        headers["Cookie"] = f"gatestack_access={request.cookies['gatestack_access']}"
        csrf = request.cookies.get("gatestack_csrf")
        if csrf:
            headers["Cookie"] += f"; gatestack_csrf={csrf}"
            headers["X-CSRF-Token"] = csrf

    for base_url in get_gatestorage_urls(request):
        try:
            response = requests.request(method, f"{base_url}{path}", timeout=4.0, headers=headers, **kwargs)
            try:
                payload = response.json()
            except ValueError:
                payload = {"detail": response.text or "Respuesta invalida de GateStorage."}
            if response.status_code >= 400:
                detail = payload.get("detail", payload) if isinstance(payload, dict) else payload
                raise HTTPException(status_code=response.status_code, detail=detail)
            return payload
        except HTTPException:
            raise
        except Exception as exc:
            last_error = str(exc)
            continue
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=last_error)


def sync_gatestorage_workspace_members(space: SpaceModel, request: Request) -> None:
    try:
        forward_gatestorage_request(
            "PUT",
            f"/api/workspaces/gatewiki/{space.key.upper()}/members",
            request=request,
            json={"member_emails": allowed_email_list(space.allowed_emails)},
        )
    except HTTPException as exc:
        if exc.status_code not in {404, 503}:
            print("Nota: no se pudieron sincronizar miembros con GateStorage:", exc.detail)
    except Exception as exc:
        print("Nota: no se pudieron sincronizar miembros con GateStorage:", exc)

def check_permission(user: dict, required_permission: str):
    permissions = user.get("permissions", [])
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in permissions
    
    if is_admin:
        return
        
    allowed = False
    if required_permission in permissions:
        allowed = True
    elif required_permission == "gatewiki:create_workspace" and "gatewiki:create" in permissions:
        allowed = True
    elif required_permission == "gatewiki:create_page" and "gatewiki:create" in permissions:
        allowed = True
    elif required_permission == "gatewiki:edit_workspace" and "gatewiki:edit" in permissions:
        allowed = True
    elif required_permission == "gatewiki:edit_page" and "gatewiki:edit" in permissions:
        allowed = True
    elif required_permission == "gatewiki:delete_workspace" and "gatewiki:delete" in permissions:
        allowed = True
    elif required_permission == "gatewiki:delete_page" and "gatewiki:delete" in permissions:
        allowed = True

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No tienes el permiso requerido: {required_permission}"
        )

def is_admin_user(user: dict) -> bool:
    return user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])

def allowed_email_list(value: Optional[str]) -> List[str]:
    return [email.strip().lower() for email in (value or "").split(",") if email.strip()]

def is_workspace_member(space: SpaceModel | None, user: dict) -> bool:
    if not space:
        return False
    if is_admin_user(user):
        return True
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    return space.created_by_id == user_id or user_email in allowed_email_list(space.allowed_emails)

def ensure_workspace_member(space: SpaceModel | None, user: dict, action: str) -> None:
    if not is_workspace_member(space, user):
        raise HTTPException(
            status_code=403,
            detail=f"Solo los miembros del workspace pueden {action}."
        )

def ensure_page_access(page: PageModel, db: Session, user: dict, action: str = "visualizar") -> SpaceModel | None:
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    is_admin = is_admin_user(user)
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")

    if space and space.is_restricted:
        if not is_workspace_member(space, user):
            raise HTTPException(status_code=403, detail=f"No tienes acceso para {action} contenido de este espacio de trabajo.")

    if page.is_restricted:
        if not (is_admin or page.created_by_id == user_id or user_email in allowed_email_list(page.allowed_emails)):
            raise HTTPException(status_code=403, detail=f"No tienes acceso para {action} esta pÃƒÂ¡gina privada.")

    return space


def get_public_badges_for_users(db: Session, user_ids: List[str]) -> dict[str, List[BadgeRead]]:
    unique_user_ids = sorted({user_id for user_id in user_ids if user_id})
    if not unique_user_ids:
        return {}
    try:
        rows = db.execute(
            text(
                """
                SELECT
                    uba.user_id,
                    ub.id,
                    ub.code,
                    ub.label,
                    COALESCE(ub.description, '') AS description,
                    COALESCE(ub.color, '#2563eb') AS color,
                    COALESCE(ub.icon, 'award') AS icon,
                    ub.logo_url
                FROM user_badge_assignments uba
                JOIN user_badges ub ON ub.id = uba.badge_id
                WHERE uba.user_id IN :user_ids
                ORDER BY ub.label ASC
                """
            ).bindparams(bindparam("user_ids", expanding=True)),
            {"user_ids": unique_user_ids},
        ).mappings().all()
    except Exception as exc:
        print("Nota: no se pudieron cargar badges publicos:", exc)
        return {}

    badges_by_user: dict[str, List[BadgeRead]] = {}
    for row in rows:
        badges_by_user.setdefault(row["user_id"], []).append(
            BadgeRead(
                id=row["id"],
                code=row["code"],
                label=row["label"],
                description=row["description"],
                color=row["color"],
                icon=row["icon"],
                logo_url=row["logo_url"],
            )
        )
    return badges_by_user


def serialize_page(page: PageModel, badges_by_user: Optional[dict[str, List[BadgeRead]]] = None) -> PageRead:
    badges_by_user = badges_by_user or {}
    return PageRead(
        id=page.id,
        space_key=page.space_key,
        title=page.title,
        content=decrypt_text(page.content),
        subtopics=decrypt_text(page.subtopics),
        sort_order=page.sort_order,
        created_by_email=page.created_by_email,
        created_by_name=page.created_by_name,
        created_by_id=page.created_by_id,
        created_by_badges=badges_by_user.get(page.created_by_id, []),
        is_restricted=bool(page.is_restricted),
        allowed_emails=page.allowed_emails or "",
        comments_allowed=bool(page.comments_allowed),
        created_at=page.created_at,
        updated_at=page.updated_at,
    )


def serialize_comment(comment: CommentModel, badges_by_user: Optional[dict[str, List[BadgeRead]]] = None) -> CommentRead:
    badges_by_user = badges_by_user or {}
    return CommentRead(
        id=comment.id,
        page_id=comment.page_id,
        parent_id=comment.parent_id,
        author_email=comment.author_email,
        author_name=comment.author_name,
        author_id=comment.author_id,
        author_badges=badges_by_user.get(comment.author_id, []),
        content=decrypt_text(comment.content),
        created_at=comment.created_at,
        reactions=list(getattr(comment, "reactions", []) or []),
    )


AI_STOPWORDS = {
    "aqui", "como", "con", "cual", "cuales", "cuando", "dame", "del", "desde", "donde",
    "esta", "este", "esto", "estos", "para", "pero", "por", "que", "sobre", "son", "una",
    "unas", "uno", "unos", "the", "and", "for", "how", "what", "when", "where", "with",
}


def ai_tokenize(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ]{3,}", (value or "").lower())
        if token not in AI_STOPWORDS
    }


def normalized_ai_tokens(value: str) -> set[str]:
    normalized = unicodedata.normalize("NFKD", (value or "").lower())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    return {
        token for token in re.findall(r"[a-z0-9_]{3,}", normalized)
        if token not in AI_STOPWORDS
    }


def fuzzy_token_hits(query_tokens: set[str], candidate_tokens: set[str]) -> int:
    hits = 0
    for candidate in candidate_tokens:
        if any(
            candidate == query
            or SequenceMatcher(None, candidate, query).ratio() >= 0.78
            for query in query_tokens
        ):
            hits += 1
    return hits


def is_ai_greeting(value: str) -> bool:
    normalized = re.sub(r"[^\wáéíóúÁÉÍÓÚñÑ]+", " ", (value or "").lower()).strip()
    return normalized in {
        "hola",
        "buenas",
        "buenos dias",
        "buenas tardes",
        "buenas noches",
        "hello",
        "hi",
    }


def is_ai_creator_question(value: str) -> bool:
    normalized = re.sub(r"[^\w]+", " ", (value or "").lower()).strip()
    asks_who = any(term in normalized.split() for term in ("quien", "quién", "quienes"))
    creator_verbs = ("hizo", "hicieron", "creo", "creó", "crearon", "desarrollo", "desarrolló", "desarrollaron")
    project_terms = ("plataforma", "proyecto", "gatewiki", "gatestack")
    return asks_who and any(term in normalized.split() for term in creator_verbs) and any(term in normalized for term in project_terms)


def clean_markdown_text(value: str) -> str:
    text_value = re.sub(r"`([^`]+)`", r"\1", value or "")
    text_value = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text_value)
    text_value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text_value)
    text_value = re.sub(r"[#>*_\-]+", " ", text_value)
    return re.sub(r"\s+", " ", text_value).strip()


def split_ai_chunks(value: str, max_chars: int = 900) -> List[str]:
    parts = re.split(r"(```[a-zA-Z0-9_+-]*\s*\n.*?```)", value or "", flags=re.S)
    blocks: List[str] = []
    for part in parts:
        if not part.strip():
            continue
        if part.lstrip().startswith("```"):
            blocks.append(part.strip())
            continue
        blocks.extend(clean_markdown_text(block) for block in re.split(r"\n{2,}", part))

    chunks: List[str] = []
    current = ""
    for block in [block for block in blocks if block]:
        if block.startswith("```"):
            if current:
                chunks.append(current)
                current = ""
            chunks.append(block[:max_chars] if len(block) <= max_chars else block[:max_chars - 4].rstrip() + "\n```")
            continue
        if len(current) + len(block) + 1 <= max_chars:
            current = f"{current} {block}".strip()
        else:
            if current:
                chunks.append(current)
            current = block[:max_chars]
    if current:
        chunks.append(current)
    return chunks


def parse_ai_subtopics(value: str) -> List[tuple[str, str]]:
    raw_value = (value or "").strip()
    if not raw_value:
        return []
    try:
        parsed = json.loads(raw_value)
    except (TypeError, ValueError):
        parsed = None

    if isinstance(parsed, list):
        subtopics: List[tuple[str, str]] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            content = str(item.get("content") or "").strip()
            if title or content:
                subtopics.append((title, content))
        return subtopics

    return [(line.strip(), "") for line in raw_value.splitlines() if line.strip()]


def build_ai_page_chunks(content: str, subtopics: str) -> List[tuple[str, bool, Optional[str]]]:
    chunks = [(chunk, chunk.lstrip().startswith("```"), None) for chunk in split_ai_chunks(content)]
    for title, subtopic_content in parse_ai_subtopics(subtopics):
        subtopic_chunks = split_ai_chunks(subtopic_content) if subtopic_content else [title]
        for chunk in subtopic_chunks:
            label = f"Subtema: {title}" if title else "Subtema"
            chunks.append((f"{label}\n{chunk}".strip(), chunk.lstrip().startswith("```"), title or None))
    return chunks


def visible_pages_for_ai(db: Session, user: dict, space_key: Optional[str] = None, page_id: Optional[str] = None) -> List[PageModel]:
    query = db.query(PageModel)
    if page_id:
        query = query.filter(PageModel.id == page_id)
    if space_key:
        query = query.filter(PageModel.space_key == space_key.upper())

    visible_pages: List[PageModel] = []
    for page in query.order_by(PageModel.updated_at.desc()).all():
        try:
            ensure_page_access(page, db, user)
            visible_pages.append(page)
        except HTTPException:
            continue
    return visible_pages


def visible_spaces_for_ai(db: Session, user: dict, space_key: Optional[str] = None) -> List[SpaceModel]:
    query = db.query(SpaceModel)
    if space_key:
        query = query.filter(SpaceModel.key == space_key.upper())
    return [
        space for space in query.order_by(SpaceModel.name.asc()).all()
        if not space.is_restricted or is_workspace_member(space, user)
    ]


def build_ai_answer(question: str, matches: List[AiChatSource]) -> str:
    if not matches:
        return (
            "No encontre informacion suficiente en los wikis a los que tienes acceso. "
            "Prueba con otra pregunta, un termino mas especifico o revisa si el contenido esta en un workspace restringido."
        )

    asks_for_code = bool(re.search(r"\b(codigo|código|code|ejemplo)\b", question.lower()))
    if asks_for_code:
        for source in matches:
            code_match = re.search(r"```([a-zA-Z0-9_+-]*)\s*\n(.*?)```", source.excerpt, flags=re.S)
            if code_match:
                language = code_match.group(1) or "text"
                code = code_match.group(2).strip()
                return (
                    f"Encontré este ejemplo en **{source.page_title}**:\n\n"
                    f"```{language}\n{code}\n```\n\n"
                    "Revisa la fuente para confirmar el contexto y los valores que debes adaptar."
                )

    lines = ["Segun los wikis disponibles:"]
    for source in matches[:3]:
        excerpt = source.excerpt
        sentences = re.split(r"(?<=[.!?])\s+", excerpt)
        sentence = next((part.strip() for part in sentences if len(part.strip()) > 45), excerpt[:220].strip())
        if len(sentence) > 260:
            sentence = sentence[:257].rstrip() + "..."
        lines.append(f"- {sentence} ({source.page_title}, {source.space_key})")
    lines.append("Revisa las fuentes para confirmar detalles antes de tomar una decision importante.")
    return "\n".join(lines)


def get_ollama_urls(request: Optional[Request] = None) -> List[str]:
    inferred_urls: List[str] = []
    if request:
        host = request.url.hostname
        if host and host not in {"localhost", "127.0.0.1"}:
            inferred_urls.append(f"{request.url.scheme}://{host}:11434")

    return list(dict.fromkeys([
        OLLAMA_BASE_URL,
        *inferred_urls,
        *OLLAMA_FALLBACK_URLS,
        "http://localhost:11434",
        "http://127.0.0.1:11434",
        "http://host.docker.internal:11434",
    ]))


def build_ollama_context(matches: List[AiChatSource]) -> str:
    context_blocks = []
    for index, source in enumerate(matches, start=1):
        context_blocks.append(
            "\n".join([
                f"[Fuente {index}]",
                f"Pagina: {source.page_title}",
                f"Workspace: {source.space_key}",
                f"Tipo de fuente: {source.source_type}",
                f"Subtema: {source.subtopic_title or 'Tema principal'}",
                f"Fragmento: {source.excerpt}",
            ])
        )
    return "\n\n".join(context_blocks)


def ask_ollama(
    question: str,
    matches: List[AiChatSource],
    request: Optional[Request] = None,
    history: Optional[List[AiChatHistoryTurn]] = None,
) -> Optional[str]:
    if not matches:
        return None

    system_prompt = (
        "Eres el asistente de GateWiki. Tu tono es amable, breve y util. "
        "Puedes saludar y orientar al usuario sobre que puede preguntarte. "
        "Para preguntas sobre conocimiento, responde usando solo el contexto proporcionado. "
        "Puedes hacer inferencias directas y obvias desde el contexto, por ejemplo identificar el lenguaje de un bloque de codigo si el contexto lo muestra. "
        "Si el contexto no contiene la respuesta, di que no encontraste ese dato en los wikis disponibles y sugiere preguntar con otro termino o revisar otra pagina. "
        "No inventes datos externos ni agregues informacion que no este respaldada por las fuentes. "
        "Cuando el usuario solicite codigo y el contexto incluya un ejemplo, conserva el codigo y presentalo en un bloque Markdown con el lenguaje indicado, por ejemplo ```python. "
        "Responde en maximo 5 bullets o 1 parrafo corto. Cita las paginas usadas al final cuando uses fuentes."
    )
    recent_history = "\n".join(
        f"Usuario: {turn.question}\nAsistente: {turn.answer[:1200]}"
        for turn in (history or [])[-4:]
    ) or "Sin turnos anteriores"
    user_prompt = (
        "Conversacion reciente:\n"
        f"{recent_history}\n\n"
        "Pregunta del usuario:\n"
        f"{question}\n\n"
        "Contexto disponible de GateWiki:\n"
        f"{build_ollama_context(matches)}"
    )
    payload = {
        "model": OLLAMA_CHAT_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "options": {
            "temperature": 0.1,
            "top_p": 0.75,
            "num_ctx": 4096,
            "num_predict": 350,
        },
    }

    for base_url in get_ollama_urls(request):
        if not base_url:
            continue
        try:
            response = requests.post(
                f"{base_url}/api/chat",
                json=payload,
                timeout=OLLAMA_TIMEOUT_SECONDS,
            )
            if response.status_code != 200:
                continue
            answer = response.json().get("message", {}).get("content", "").strip()
            if answer:
                return answer
        except Exception:
            continue
    return None

# ----------------- APP FASTAPI -----------------
docs_kwargs = {}
if ENVIRONMENT not in {"local", "development", "dev", "test"}:
    docs_kwargs = {"docs_url": None, "redoc_url": None, "openapi_url": None}

app = FastAPI(title="GateWiki Service (MySQL)", **docs_kwargs)

# Habilitar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_origin_regex=CORS_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- RUTAS API -----------------

# --- Auth proxy hacia GateStack IAM ---
@app.post("/auth/login")
def login(payload: LoginRequest, request: Request, response: Response):
    return forward_gatestack_request("POST", "/auth/login", request=request, response_out=response, json=payload.model_dump())

@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response):
    try:
        forward_gatestack_request("POST", "/auth/logout", request=request, response_out=response)
    finally:
        clear_session_cookies(response, request)

@app.get("/auth/me")
def auth_me(user: dict = Depends(get_current_user)):
    return user

# --- Usuarios ---
@app.get("/api/users")
def get_users(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    try:
        result = db.execute(text("SELECT email, full_name FROM users WHERE status = 'approved'"))
        return [{"email": row[0], "full_name": row[1]} for row in result.fetchall()]
    except Exception as e:
        print("Error fetching users from GateStack db:", e)
        return [{"email": user.get("email"), "full_name": user.get("full_name")}]


# --- Feedback hacia GateStack ---
@app.post("/api/feedback", response_model=FeedbackRead)
def create_feedback(payload: FeedbackCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")

    if payload.page_id:
        page = db.query(PageModel).filter(PageModel.id == payload.page_id).first()
        if not page:
            raise HTTPException(status_code=404, detail="Pagina no encontrada para feedback.")
        ensure_page_access(page, db, user, "enviar feedback sobre")

    item = FeedbackItemModel(
        source_app="gatewiki",
        title=payload.title.strip(),
        message=encrypt_text(payload.message.strip()),
        page_id=payload.page_id,
        page_title=payload.page_title,
        space_key=(payload.space_key or "").upper() or None,
        created_by_user_id=user.get("id"),
        created_by_name=user.get("full_name"),
        created_by_email=user.get("email"),
        public_response="",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_feedback_item(item)


@app.get("/api/feedback/my", response_model=List[FeedbackRead])
def get_my_feedback(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    items = (
        db.query(FeedbackItemModel)
        .filter(FeedbackItemModel.created_by_user_id == user.get("id"))
        .order_by(FeedbackItemModel.created_at.desc())
        .all()
    )
    return [serialize_feedback_item(item) for item in items]


@app.get("/api/feedback/admin", response_model=List[FeedbackRead])
def get_admin_feedback(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:admin")
    items = (
        db.query(FeedbackItemModel)
        .filter(FeedbackItemModel.source_app == "gatewiki")
        .order_by(FeedbackItemModel.created_at.desc())
        .all()
    )
    return [serialize_feedback_item(item) for item in items]


@app.patch("/api/feedback/{feedback_id}/response", response_model=FeedbackRead)
def respond_feedback(feedback_id: str, payload: FeedbackResponseUpdate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:admin")
    item = db.query(FeedbackItemModel).filter(FeedbackItemModel.id == feedback_id, FeedbackItemModel.source_app == "gatewiki").first()
    if not item:
        raise HTTPException(status_code=404, detail="Feedback no encontrado.")
    item.public_response = encrypt_text(payload.public_response.strip())
    item.status = payload.status.strip() or "resolved"
    item.responded_by_user_id = user.get("id")
    item.responded_by_name = user.get("full_name") or user.get("email") or "Admin"
    item.responded_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return serialize_feedback_item(item)


@app.patch("/api/feedback/{feedback_id}/status", response_model=FeedbackRead)
def update_feedback_status(feedback_id: str, payload: FeedbackStatusUpdate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:admin")
    next_status = payload.status.strip().lower()
    if next_status not in {"open", "in_progress", "resolved", "closed"}:
        raise HTTPException(status_code=400, detail="Estado de feedback invalido.")
    item = db.query(FeedbackItemModel).filter(FeedbackItemModel.id == feedback_id, FeedbackItemModel.source_app == "gatewiki").first()
    if not item:
        raise HTTPException(status_code=404, detail="Feedback no encontrado.")
    item.status = next_status
    db.commit()
    db.refresh(item)
    return serialize_feedback_item(item)

# --- Espacios ---
@app.get("/api/spaces", response_model=List[SpaceRead])
def get_spaces(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    all_spaces = db.query(SpaceModel).order_by(SpaceModel.name).all()
    
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    visible_spaces = []
    for space in all_spaces:
        if not space.is_restricted:
            visible_spaces.append(space)
        else:
            allowed_list = [email.strip().lower() for email in (space.allowed_emails or "").split(",") if email.strip()]
            if is_admin or space.created_by_id == user_id or user_email in allowed_list:
                visible_spaces.append(space)
                
    return visible_spaces

@app.post("/api/spaces", response_model=SpaceRead)
def create_space(space: SpaceCreate, request: Request, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:create_workspace")
    
    existing = db.query(SpaceModel).filter((SpaceModel.key == space.key.upper()) | (SpaceModel.name == space.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un espacio con ese nombre o identificador.")
        
    db_space = SpaceModel(
        name=space.name,
        key=space.key.upper(),
        description=space.description,
        created_by_email=user.get("email"),
        created_by_name=user.get("full_name"),
        created_by_id=user.get("id"),
        is_restricted=space.is_restricted,
        allowed_emails=space.allowed_emails
    )
    db.add(db_space)
    db.commit()
    db.refresh(db_space)
    sync_gatestorage_workspace_members(db_space, request)
    return db_space

@app.put("/api/spaces/{space_id}", response_model=SpaceRead)
def update_space(space_id: str, payload: SpaceCreate, request: Request, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:edit_workspace")
    
    space = db.query(SpaceModel).filter(SpaceModel.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado.")
        
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    if not (is_admin or space.created_by_id == user.get("id")):
        raise HTTPException(status_code=403, detail="No tienes permisos para editar este espacio de trabajo.")
        
    existing = db.query(SpaceModel).filter(
        (SpaceModel.id != space_id) & 
        ((SpaceModel.key == payload.key.upper()) | (SpaceModel.name == payload.name))
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe otro espacio con ese nombre o identificador.")
        
    if space.key != payload.key.upper():
        db.query(PageModel).filter(PageModel.space_key == space.key).update({PageModel.space_key: payload.key.upper()})
        
    space.name = payload.name
    space.key = payload.key.upper()
    space.description = payload.description
    space.is_restricted = payload.is_restricted
    space.allowed_emails = payload.allowed_emails
    
    db.commit()
    db.refresh(space)
    sync_gatestorage_workspace_members(space, request)
    return space

@app.delete("/api/spaces/{space_id}", status_code=204)
def delete_space(space_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:delete_workspace")
    
    space = db.query(SpaceModel).filter(SpaceModel.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado.")
        
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    if not (is_admin or space.created_by_id == user.get("id")):
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar este espacio de trabajo.")
        
    db.query(PageModel).filter(PageModel.space_key == space.key).delete()
    
    db.delete(space)
    db.commit()
    return


# --- Storage por workspace ---
@app.get("/api/spaces/{space_id}/storage")
def get_space_storage(space_id: str, request: Request, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    space = db.query(SpaceModel).filter(SpaceModel.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado.")

    if not is_workspace_member(space, user):
        raise HTTPException(status_code=403, detail="Solo los miembros del workspace pueden ver el storage de este workspace.")

    return forward_gatestorage_request("GET", f"/api/workspaces/gatewiki/{space.key.upper()}", request=request)


@app.get("/api/spaces/{space_id}/storage/request")
def get_space_storage_request(space_id: str, request: Request, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    space = db.query(SpaceModel).filter(SpaceModel.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Workspace no encontrado.")
    if not is_workspace_member(space, user):
        raise HTTPException(status_code=403, detail="Solo los miembros del workspace pueden ver solicitudes de storage.")

    return forward_gatestorage_request("GET", f"/api/storage-requests/gatewiki/{space.key.upper()}/latest", request=request)


@app.post("/api/spaces/{space_id}/storage/request")
def request_space_storage(
    space_id: str,
    payload: StorageRequestCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_permission(user, "gatestorage:request")
    space = db.query(SpaceModel).filter(SpaceModel.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Espacio no encontrado.")

    if not is_workspace_member(space, user):
        raise HTTPException(status_code=403, detail="Solo los miembros del workspace pueden solicitar storage.")

    requested_bytes = payload.requested_gb * 1024 * 1024 * 1024
    return forward_gatestorage_request(
        "POST",
        "/api/storage-requests",
        request=request,
        json={
            "source_app": "gatewiki",
            "external_workspace_id": space.id,
            "workspace_key": space.key.upper(),
            "workspace_name": space.name,
            "requested_bytes": requested_bytes,
            "reason": payload.reason,
            "member_emails": allowed_email_list(space.allowed_emails),
        },
    )


# --- PÃ¡ginas ---
@app.post("/api/ai-chat", response_model=AiChatResponse)
def ai_chat(payload: AiChatRequest, request: Request, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    started_at = time.perf_counter()

    question = payload.message.strip()
    if is_ai_greeting(question):
        response = AiChatResponse(
            answer="Hola, soy el asistente de GateWiki. En que te puedo ayudar? Puedes preguntarme sobre temas, procesos, codigo o configuraciones documentadas en los wikis.",
            sources=[],
            searched_pages=0,
        )
        save_ai_interaction(db, user, payload, response, "system", round((time.perf_counter() - started_at) * 1000))
        return response

    if is_ai_creator_question(question):
        response = AiChatResponse(
            answer=(
                "La plataforma fue realizada por el **equipo de Redeployment**, liderado por **Martin P.**, "
                "junto a sus programadores **Cesar C.** y **Jonathan C.**"
            ),
            sources=[],
            searched_pages=0,
        )
        save_ai_interaction(db, user, payload, response, "system", round((time.perf_counter() - started_at) * 1000))
        return response

    question_tokens = ai_tokenize(question)
    if not question_tokens:
        raise HTTPException(status_code=400, detail="Escribe una pregunta mas especifica.")
    asks_for_code = bool(re.search(r"\b(codigo|código|code|ejemplo)\b", question.lower()))
    retrieval_tokens = set(question_tokens)
    normalized_retrieval_tokens = normalized_ai_tokens(question)
    is_follow_up = bool(re.search(r"\b(ese|esa|eso|anterior|mismo|misma|subtema|tema|pero|info|informacion|información|dices|seguro|entonces|mmm)\b", question.lower()))
    if is_follow_up and payload.history:
        retrieval_tokens |= ai_tokenize(payload.history[-1].question)
        normalized_retrieval_tokens |= normalized_ai_tokens(payload.history[-1].question)

    spaces = visible_spaces_for_ai(db, user, payload.space_key)
    normalized_question_tokens = normalized_retrieval_tokens
    asks_about_workspaces = bool(re.search(r"\b(workspace|workspaces|espacio|espacios)\b", question.lower()))
    space_candidates: List[tuple[float, SpaceModel]] = []
    for space in spaces:
        name_tokens = normalized_ai_tokens(f"{space.name} {space.key}")
        hits = fuzzy_token_hits(normalized_question_tokens, name_tokens)
        if not hits:
            continue
        coverage = hits / max(len(name_tokens), 1)
        normalized_name = " ".join(normalized_ai_tokens(space.name))
        normalized_question = " ".join(normalized_question_tokens)
        phrase_match = bool(normalized_name) and normalized_name in normalized_question
        space_candidates.append(((coverage * 12.0) + (hits * 2.0) + (5.0 if phrase_match else 0.0), space))

    best_space_score = max((score for score, _ in space_candidates), default=0.0)
    targeted_space_keys = {
        space.key for score, space in space_candidates
        if best_space_score >= 7.0 and score >= best_space_score * 0.8
    }

    pages = visible_pages_for_ai(db, user, payload.space_key, payload.page_id)
    if targeted_space_keys and not payload.page_id:
        pages = [page for page in pages if page.space_key in targeted_space_keys]
    ranked_sources: List[AiChatSource] = []
    subtopic_candidates: List[tuple[float, str, str]] = []

    workspace_sources = [space for space in spaces if space.key in targeted_space_keys]
    if asks_about_workspaces and not workspace_sources and not space_candidates:
        workspace_sources = spaces
    for space in workspace_sources:
        ranked_sources.append(AiChatSource(
            page_id=None,
            page_title=space.name,
            space_key=space.key,
            source_type="workspace",
            excerpt=f"Workspace: {space.name}\nDescripcion: {space.description or 'Sin descripcion disponible.'}",
            score=50.0 if space.key in targeted_space_keys else 8.0,
        ))

    for page in pages:
        for title, _ in parse_ai_subtopics(decrypt_text(page.subtopics)):
            title_tokens = ai_tokenize(title)
            if not title_tokens:
                continue
            overlap_count = len(retrieval_tokens & title_tokens)
            coverage = overlap_count / len(title_tokens)
            phrase_match = clean_markdown_text(title).lower() in clean_markdown_text(question).lower()
            confidence = (coverage * 10.0) + (overlap_count * 2.0) + (5.0 if phrase_match else 0.0)
            if overlap_count:
                subtopic_candidates.append((confidence, page.id, title))

    best_subtopic_score = max((candidate[0] for candidate in subtopic_candidates), default=0.0)
    targeted_subtopics = {
        (page_id, title) for score, page_id, title in subtopic_candidates
        if best_subtopic_score >= 7.0 and score >= best_subtopic_score * 0.8
    }

    for page in pages:
        content = decrypt_text(page.content)
        subtopics = decrypt_text(page.subtopics)
        page_space = next((space for space in spaces if space.key == page.space_key), None)
        page_context = f"{page.title} {page.space_key} {page_space.name if page_space else ''} {page_space.description if page_space else ''}"
        page_tokens = ai_tokenize(page_context)
        for chunk, is_code_chunk, subtopic_title in build_ai_page_chunks(content, subtopics):
            chunk_tokens = ai_tokenize(chunk)
            if not chunk_tokens:
                continue
            overlap = retrieval_tokens & (chunk_tokens | page_tokens)
            if not overlap:
                continue
            title_hits = len(retrieval_tokens & page_tokens)
            density = len(overlap) / max(len(retrieval_tokens), 1)
            subtopic_tokens = ai_tokenize(subtopic_title or "")
            targeted_subtopic = bool(subtopic_title) and (page.id, subtopic_title) in targeted_subtopics
            subtopic_hits = len(retrieval_tokens & subtopic_tokens)
            subtopic_boost = 14.0 if targeted_subtopic else subtopic_hits * 3.0
            code_boost = 6.0 if asks_for_code and is_code_chunk else 0.0
            score = round((len(overlap) * 2.0) + (title_hits * 1.2) + density + subtopic_boost + code_boost, 3)
            excerpt_limit = 1200 if is_code_chunk else 520
            excerpt = chunk[:excerpt_limit].strip()
            if len(chunk) > excerpt_limit:
                excerpt += "..."
            ranked_sources.append(
                AiChatSource(
                    page_id=page.id,
                    page_title=page.title,
                    space_key=page.space_key,
                    source_type="page",
                    subtopic_title=subtopic_title,
                    excerpt=excerpt,
                    score=score,
                )
            )

    if targeted_subtopics:
        ranked_sources = [
            source for source in ranked_sources
            if source.subtopic_title and (source.page_id, source.subtopic_title) in targeted_subtopics
        ]
    ranked_sources.sort(key=lambda source: source.score, reverse=True)
    selected_sources: List[AiChatSource] = []
    seen_pages: set[str] = set()
    top_score = ranked_sources[0].score if ranked_sources else 0
    min_relevance = max(2.8, top_score * 0.55) if top_score else 0
    for source in ranked_sources:
        source_key = f"{source.source_type}:{source.page_id or source.space_key}:{source.subtopic_title or source.page_title}"
        if source_key in seen_pages:
            continue
        if source.score < min_relevance:
            if selected_sources or top_score < 2.0:
                continue
        selected_sources.append(source)
        seen_pages.add(source_key)
        if len(selected_sources) >= payload.max_sources:
            break

    ollama_answer = ask_ollama(question, selected_sources, request, payload.history)

    response = AiChatResponse(
        answer=ollama_answer or build_ai_answer(question, selected_sources),
        sources=selected_sources,
        searched_pages=len(pages),
    )
    save_ai_interaction(
        db,
        user,
        payload,
        response,
        "ollama" if ollama_answer else "retrieval",
        round((time.perf_counter() - started_at) * 1000),
    )
    return response


@app.get("/api/ai-interactions/admin", response_model=List[AiInteractionRead])
def get_admin_ai_interactions(
    review_status: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_permission(user, "gatewiki:admin")
    safe_limit = max(1, min(limit, 500))
    query = db.query(AiInteractionModel)
    if review_status in {"unreviewed", "expected", "unexpected"}:
        query = query.filter(AiInteractionModel.review_status == review_status)
    items = query.order_by(AiInteractionModel.created_at.desc()).limit(safe_limit).all()
    return [serialize_ai_interaction(item) for item in items]


@app.patch("/api/ai-interactions/{interaction_id}/review", response_model=AiInteractionRead)
def review_ai_interaction(
    interaction_id: str,
    payload: AiInteractionReviewUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    check_permission(user, "gatewiki:admin")
    if payload.review_status not in {"unreviewed", "expected", "unexpected"}:
        raise HTTPException(status_code=400, detail="Estado de revision invalido.")
    item = db.query(AiInteractionModel).filter(AiInteractionModel.id == interaction_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Registro de IA no encontrado.")
    item.review_status = payload.review_status
    item.review_note = encrypt_text(payload.review_note.strip())
    item.reviewed_by_user_id = user.get("id") if payload.review_status != "unreviewed" else None
    item.reviewed_by_name = (user.get("full_name") or user.get("name")) if payload.review_status != "unreviewed" else None
    item.reviewed_at = datetime.utcnow() if payload.review_status != "unreviewed" else None
    db.commit()
    db.refresh(item)
    return serialize_ai_interaction(item)


@app.get("/api/pages", response_model=List[PageRead])
def get_pages(space_key: Optional[str] = None, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    
    # 1. Obtener los espacios visibles/permitidos para el usuario
    all_spaces = db.query(SpaceModel).all()
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    visible_space_keys = set()
    for space in all_spaces:
        if not space.is_restricted:
            visible_space_keys.add(space.key.upper())
        else:
            allowed_list = [email.strip().lower() for email in (space.allowed_emails or "").split(",") if email.strip()]
            if is_admin or space.created_by_id == user_id or user_email in allowed_list:
                visible_space_keys.add(space.key.upper())
                
    if not visible_space_keys:
        return []
        
    # 2. Filtrar las pÃ¡ginas de la base de datos
    query = db.query(PageModel)
    if space_key:
        if space_key.upper() not in visible_space_keys:
            return []
        query = query.filter(PageModel.space_key == space_key.upper())
    else:
        query = query.filter(PageModel.space_key.in_(list(visible_space_keys)))
        
    pages = query.order_by(PageModel.sort_order.asc(), PageModel.created_at.desc()).all()
    
    # 3. Filtrar a nivel de pÃ¡gina (pÃ¡ginas restringidas individualmente)
    visible_pages = []
    for page in pages:
        if not page.is_restricted:
            visible_pages.append(page)
        else:
            allowed_list = [email.strip().lower() for email in (page.allowed_emails or "").split(",") if email.strip()]
            if is_admin or page.created_by_id == user_id or user_email in allowed_list:
                visible_pages.append(page)

    badges_by_user = get_public_badges_for_users(db, [page.created_by_id for page in visible_pages])
    return [serialize_page(page, badges_by_user) for page in visible_pages]

@app.get("/api/pages/{page_id}", response_model=PageRead)
def get_page(page_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="PÃ¡gina no encontrada")
        
    # Verificar acceso al Espacio de la pÃ¡gina
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    if space and space.is_restricted:
        allowed_list = [email.strip().lower() for email in (space.allowed_emails or "").split(",") if email.strip()]
        if not (is_admin or space.created_by_id == user_id or user_email in allowed_list):
            raise HTTPException(status_code=403, detail="No tienes acceso al espacio de trabajo de esta pÃ¡gina.")
            
    # Verificar acceso a la pÃ¡gina privada en sÃ­
    if page.is_restricted:
        allowed_list = [email.strip().lower() for email in (page.allowed_emails or "").split(",") if email.strip()]
        if not (is_admin or page.created_by_id == user_id or user_email in allowed_list):
            raise HTTPException(status_code=403, detail="No tienes acceso para visualizar esta pÃ¡gina privada.")
            
    badges_by_user = get_public_badges_for_users(db, [page.created_by_id])
    return serialize_page(page, badges_by_user)

@app.post("/api/pages", response_model=PageRead)
def create_page(page: PageCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:create_page")
    
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    if not space:
        raise HTTPException(status_code=404, detail="El espacio especificado no existe.")
        
    # Verificar si el usuario tiene acceso al espacio destino
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    ensure_workspace_member(space, user, "crear paginas en este workspace")
            
    next_sort_order = (db.query(PageModel).filter(PageModel.space_key == page.space_key.upper()).count() + 1) * 10
    db_page = PageModel(
        space_key=page.space_key.upper(),
        title=page.title,
        content=encrypt_text(page.content),
        subtopics=encrypt_text(page.subtopics),
        sort_order=next_sort_order,
        created_by_email=user.get("email"),
        created_by_name=user.get("full_name"),
        created_by_id=user.get("id"),
        is_restricted=page.is_restricted,
        allowed_emails=page.allowed_emails,
        comments_allowed=page.comments_allowed
    )
    db.add(db_page)
    db.commit()
    db.refresh(db_page)
    badges_by_user = get_public_badges_for_users(db, [db_page.created_by_id])
    return serialize_page(db_page, badges_by_user)

@app.put("/api/pages/{page_id}", response_model=PageRead)
def update_page(page_id: str, payload: PageCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:edit_page")
    
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="PÃ¡gina no encontrada")
        
    # Verificar si el usuario tiene acceso al espacio actual de la pÃ¡gina
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    ensure_workspace_member(space, user, "modificar paginas en este workspace")
            
    # Verificar si el usuario tiene acceso al espacio destino (en caso de moverla)
    if payload.space_key.upper() != page.space_key.upper():
        dest_space = db.query(SpaceModel).filter(SpaceModel.key == payload.space_key.upper()).first()
        if not dest_space:
            raise HTTPException(status_code=404, detail="El espacio destino no existe.")
        ensure_workspace_member(dest_space, user, "mover paginas a este workspace")
    # Verificar si es el dueÃ±o, admin o tiene permisos de ediciÃ³n
    if not (is_admin or page.created_by_id == user.get("id")):
        check_permission(user, "gatewiki:edit_page")
        
    page.title = payload.title
    page.content = encrypt_text(payload.content)
    page.subtopics = encrypt_text(payload.subtopics)
    page.is_restricted = payload.is_restricted
    page.allowed_emails = payload.allowed_emails
    page.space_key = payload.space_key.upper()
    page.comments_allowed = payload.comments_allowed
    
    db.commit()
    db.refresh(page)
    badges_by_user = get_public_badges_for_users(db, [page.created_by_id])
    return serialize_page(page, badges_by_user)

@app.put("/api/page-order", response_model=List[PageRead])
def reorder_pages(payload: PageReorderRequest, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    permissions = user.get("permissions", [])
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in permissions
    if not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administradores pueden reordenar temas.")

    space_key = payload.space_key.upper()
    pages = db.query(PageModel).filter(PageModel.space_key == space_key).all()
    pages_by_id = {page.id: page for page in pages}

    for index, page_id in enumerate(payload.page_ids):
        page = pages_by_id.get(page_id)
        if page:
            page.sort_order = (index + 1) * 10

    db.commit()
    ordered_pages = db.query(PageModel).filter(PageModel.space_key == space_key).order_by(PageModel.sort_order.asc(), PageModel.created_at.desc()).all()
    badges_by_user = get_public_badges_for_users(db, [page.created_by_id for page in ordered_pages])
    return [serialize_page(page, badges_by_user) for page in ordered_pages]

@app.delete("/api/pages/{page_id}", status_code=204)
def delete_page(page_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:delete_page")
    
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="PÃ¡gina no encontrada")
        
    # Verificar si tiene acceso al espacio
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    if space and space.is_restricted:
        allowed_list = [email.strip().lower() for email in (space.allowed_emails or "").split(",") if email.strip()]
        if not (is_admin or space.created_by_id == user_id or user_email in allowed_list):
            raise HTTPException(status_code=403, detail="No tienes acceso para eliminar pÃ¡ginas en este espacio de trabajo.")
            
    # Solo el dueÃ±o o admins pueden borrar, o cualquier gatewiki:delete
    if not (is_admin or page.created_by_id == user.get("id")):
        check_permission(user, "gatewiki:delete_page")
        
    db.query(CommentModel).filter(CommentModel.page_id == page_id).delete()
    db.delete(page)
    db.commit()
    return


# --- Comentarios ---
@app.get("/api/pages/{page_id}/comments", response_model=List[CommentRead])
def get_comments(page_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="PÃ¡gina no encontrada.")

    ensure_page_access(page, db, user)
            
    comments = db.query(CommentModel).filter(CommentModel.page_id == page_id).order_by(CommentModel.created_at.asc()).all()
    for c in comments:
        c.reactions = db.query(CommentReactionModel).filter(CommentReactionModel.comment_id == c.id).all()
    badges_by_user = get_public_badges_for_users(db, [comment.author_id for comment in comments])
    return [serialize_comment(comment, badges_by_user) for comment in comments]


@app.post("/api/pages/{page_id}/comments", response_model=CommentRead)
def create_comment(page_id: str, payload: CommentCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="PÃ¡gina no encontrada.")
        
    if not page.comments_allowed:
        raise HTTPException(status_code=400, detail="Los comentarios estÃ¡n desactivados para esta pÃ¡gina.")

    space = ensure_page_access(page, db, user, "comentar")
    ensure_workspace_member(space, user, "comentar en este workspace")
            
    # Validar parent_id
    if payload.parent_id:
        parent = db.query(CommentModel).filter(CommentModel.id == payload.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Comentario principal no encontrado.")
        if parent.page_id != page_id:
            raise HTTPException(status_code=400, detail="El comentario principal no pertenece a esta pÃ¡gina.")
        if parent.parent_id:
            raise HTTPException(status_code=400, detail="No se permiten hilos de discusiÃ³n de mÃ¡s de 1 nivel.")
            
    db_comment = CommentModel(
        page_id=page_id,
        parent_id=payload.parent_id,
        author_email=user.get("email"),
        author_name=user.get("full_name"),
        author_id=user.get("id"),
        content=encrypt_text(payload.content)
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    db_comment.reactions = []
    badges_by_user = get_public_badges_for_users(db, [db_comment.author_id])
    return serialize_comment(db_comment, badges_by_user)


class ReactionPayload(BaseModel):
    emoji: str

@app.post("/api/comments/{comment_id}/react")
def toggle_reaction(comment_id: str, payload: ReactionPayload, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    
    comment = db.query(CommentModel).filter(CommentModel.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comentario no encontrado.")

    page = db.query(PageModel).filter(PageModel.id == comment.page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="PÃ¡gina no encontrada.")
    ensure_page_access(page, db, user, "reaccionar a")
        
    user_id = user.get("id")
    user_name = user.get("full_name")
    emoji = payload.emoji.strip()
    if not emoji or len(emoji) > 10:
        raise HTTPException(status_code=400, detail="ReacciÃ³n invÃ¡lida.")
    
    # Comprobar si ya existe
    existing = db.query(CommentReactionModel).filter(
        CommentReactionModel.comment_id == comment_id,
        CommentReactionModel.user_id == user_id,
        CommentReactionModel.emoji == emoji
    ).first()
    
    if existing:
        db.delete(existing)
        db.commit()
    else:
        new_reaction = CommentReactionModel(
            comment_id=comment_id,
            user_id=user_id,
            user_name=user_name,
            emoji=emoji
        )
        db.add(new_reaction)
        db.commit()
        
    updated = db.query(CommentReactionModel).filter(CommentReactionModel.comment_id == comment_id).all()
    return updated


@app.delete("/api/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")

    comment = db.query(CommentModel).filter(CommentModel.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comentario no encontrado.")
        
    page = db.query(PageModel).filter(PageModel.id == comment.page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="PÃ¡gina no encontrada.")

    ensure_page_access(page, db, user, "eliminar comentarios de")
    is_admin = is_admin_user(user)
    
    if not (is_admin or comment.author_id == user.get("id") or page.created_by_id == user.get("id")):
        raise HTTPException(status_code=403, detail="No tienes permisos para eliminar este comentario.")
        
    # Borrar respuestas anidadas si es un comentario padre
    if not comment.parent_id:
        db.query(CommentModel).filter(CommentModel.parent_id == comment_id).delete()
        
    db.delete(comment)
    db.commit()
    return


# --- Cargar Datos Semilla ---
@app.post("/api/seed")
def seed_data(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:admin")
    
    spaces_data = [
        {"name": "IngenierÃ­a de Software", "key": "ENG", "description": "EstÃ¡ndares de desarrollo, arquitecturas y guÃ­as de codificaciÃ³n."},
        {"name": "DiseÃ±o UX/UI", "key": "DSN", "description": "GuÃ­as de diseÃ±o, componentes visuales e identidad de marca."},
        {"name": "IAM Integraciones", "key": "IAM", "description": "InformaciÃ³n tÃ©cnica sobre el portal de permisos de GateStack."}
    ]
    
    created_spaces = 0
    for sd in spaces_data:
        existing = db.query(SpaceModel).filter(SpaceModel.key == sd["key"]).first()
        if not existing:
            db.add(SpaceModel(name=sd["name"], key=sd["key"], description=sd["description"]))
            created_spaces += 1
            
    db.commit()
    
    pages_data = [
        {
            "space_key": "ENG",
            "title": "Arquitectura Microservicios del Ecosistema",
            "content": "# Arquitectura de Servicios\n\nTodos los servicios satÃ©lites del ecosistema deben integrarse a travÃ©s de **GateStack IAM**.\n\n## Requisitos BÃ¡sicos\n1. Validar el token JWT en cada peticiÃ³n.\n2. Cumplir con la matriz de permisos.\n3. Implementar un fallback elegante de base de datos.",
            "is_restricted": False,
            "allowed_emails": ""
        },
        {
            "space_key": "IAM",
            "title": "Manual de IntegraciÃ³n Single Sign-On (SSO)",
            "content": "# IntegraciÃ³n con GateStack SSO\n\nPara validar tokens, debes llamar al endpoint `/auth/me` con la cabecera `Authorization: Bearer <JWT>`.\n\n```python\n# Ejemplo Python\nresponse = requests.get('http://host.docker.internal:8000/auth/me', headers=headers)\n```",
            "is_restricted": False,
            "allowed_emails": ""
        },
        {
            "space_key": "ENG",
            "title": "[PRIVADO] Ejemplo de Procedimiento de Despliegue",
            "content": "# Procedimiento Privado de Despliegue\n\n> [!CAUTION]\n> Esta pÃ¡gina es solo un ejemplo de contenido restringido para pruebas.\n\n* **Entorno:** `staging`\n* **Responsable:** Equipo de plataforma\n* **Notas:** No guardes credenciales reales dentro de GateWiki.",
            "is_restricted": True,
            "allowed_emails": "admin@gatestack.dev"
        }
    ]
    
    created_pages = 0
    for pd in pages_data:
        existing = db.query(PageModel).filter(PageModel.title == pd["title"]).first()
        if not existing:
            db.add(PageModel(
                space_key=pd["space_key"],
                title=pd["title"],
                content=encrypt_text(pd["content"]),
                subtopics=encrypt_text(pd.get("subtopics", "")),
                created_by_email=user.get("email"),
                created_by_name=user.get("full_name"),
                created_by_id=user.get("id"),
                is_restricted=pd["is_restricted"],
                allowed_emails=pd["allowed_emails"]
            ))
            created_pages += 1
            
    db.commit()
    return {"message": f"Datos cargados: {created_spaces} espacios y {created_pages} pÃ¡ginas creadas."}

@app.get("/")
def api_root():
    return {"service": "GateWiki API", "docs": "/docs"}

