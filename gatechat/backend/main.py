import base64
import hashlib
import json
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote_plus

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from starlette.middleware.base import BaseHTTPMiddleware
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

for parent in Path(__file__).resolve().parents:
    env_path = parent / ".env"
    if env_path.is_file():
        load_dotenv(env_path)
        break

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER") or os.getenv("GATECHAT_DB_USER", "gatechat_app")
DB_PASSWORD = os.getenv("DB_PASSWORD") or os.getenv("GATECHAT_DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "gatestack")
OLLAMA_BASE_URL = os.getenv("GATECHAT_OLLAMA_BASE_URL", os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")).rstrip("/")
DEFAULT_MODEL = os.getenv("GATECHAT_DEFAULT_MODEL", "qwen2.5:7b-instruct")
SECURITY_KEY_PATH = Path(os.getenv("GATECHAT_SECURITY_KEY_PATH", Path(__file__).resolve().parent / ".gatechat-private-key.pem"))
REQUIRE_HTTPS = os.getenv("GATECHAT_REQUIRE_HTTPS", "false").lower() in {"1", "true", "yes"}
ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv("GATECHAT_ALLOWED_ORIGINS", "*").split(",") if origin.strip()]
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}



def load_or_create_private_key():
    if SECURITY_KEY_PATH.is_file():
        return serialization.load_pem_private_key(SECURITY_KEY_PATH.read_bytes(), password=None)
    SECURITY_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    SECURITY_KEY_PATH.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    try:
        SECURITY_KEY_PATH.chmod(0o600)
    except OSError:
        pass
    return private_key


PRIVATE_KEY = load_or_create_private_key()
PUBLIC_KEY_PEM = PRIVATE_KEY.public_key().public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
).decode("ascii")
PUBLIC_KEY_FINGERPRINT = hashlib.sha256(PUBLIC_KEY_PEM.encode("utf-8")).hexdigest()


def decode_base64(value: str, field: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Sobre cifrado invalido: {field} no es base64 valido.") from exc


def decrypt_envelope(envelope: dict[str, Any]) -> bytes:
    if envelope.get("encrypted") is not True:
        raise HTTPException(status_code=400, detail="La peticion cifrada debe incluir encrypted=true.")
    encrypted_key = decode_base64(str(envelope.get("key", "")), "key")
    nonce = decode_base64(str(envelope.get("nonce", "")), "nonce")
    ciphertext = decode_base64(str(envelope.get("payload", "")), "payload")
    if len(nonce) != 12:
        raise HTTPException(status_code=400, detail="El nonce AES-GCM debe tener 12 bytes.")
    try:
        aes_key = PRIVATE_KEY.decrypt(
            encrypted_key,
            padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
        )
        plaintext = AESGCM(aes_key).decrypt(nonce, ciphertext, None)
        json.loads(plaintext.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="No se pudo descifrar la peticion.") from exc
    return plaintext


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if REQUIRE_HTTPS and request.method in {"POST", "PATCH", "PUT", "DELETE"}:
            host = request.url.hostname or ""
            forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
            if forwarded_proto != "https" and host not in LOCAL_HOSTS:
                return JSONResponse(status_code=403, content={"detail": "HTTPS es obligatorio para peticiones sensibles de GateChat."})

        if request.headers.get("x-gatechat-encryption") == "aes256gcm+rsa-oaep-sha256":
            try:
                envelope = json.loads((await request.body()).decode("utf-8"))
                plaintext = decrypt_envelope(envelope)
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
            async def receive():
                return {"type": "http.request", "body": plaintext, "more_body": False}
            request = Request(request.scope, receive)

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if REQUIRE_HTTPS:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

DATABASE_URL = (
    f"mysql+pymysql://{quote_plus(DB_USER)}:{quote_plus(DB_PASSWORD)}"
    f"@{DB_HOST}:{DB_PORT}/{quote_plus(DB_NAME)}"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ChatSessionModel(Base):
    __tablename__ = "gatechat_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(120), nullable=False, default="Nuevo chat")
    model = Column(String(160), nullable=False, default=DEFAULT_MODEL)
    system_prompt = Column(Text, nullable=False)
    temperature = Column(Float, nullable=False, default=0.6)
    top_p = Column(Float, nullable=False, default=0.9)
    top_k = Column(Integer, nullable=False, default=40)
    repeat_penalty = Column(Float, nullable=False, default=1.1)
    num_ctx = Column(Integer, nullable=False, default=8192)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChatMessageModel(Base):
    __tablename__ = "gatechat_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("gatechat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    duration_ms = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utc_string(value: datetime) -> str:
    return value.isoformat(timespec="seconds") + "Z"


class ChatSettings(BaseModel):
    model: str = Field(default=DEFAULT_MODEL, min_length=1, max_length=160)
    system_prompt: str = Field(
        default="Eres GateChat, un asistente conversacional local. Responde en espanol de forma clara, util y natural.",
        min_length=0,
        max_length=4000,
    )
    temperature: float = Field(default=0.6, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.05, le=1.0)
    top_k: int = Field(default=40, ge=1, le=200)
    repeat_penalty: float = Field(default=1.1, ge=0.5, le=2.0)
    num_ctx: int = Field(default=8192, ge=1024, le=32768)


class SessionCreate(ChatSettings):
    title: str = Field(default="Nuevo chat", min_length=1, max_length=120)


class SessionUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    model: Optional[str] = Field(default=None, min_length=1, max_length=160)
    system_prompt: Optional[str] = Field(default=None, min_length=0, max_length=4000)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=None, ge=0.05, le=1.0)
    top_k: Optional[int] = Field(default=None, ge=1, le=200)
    repeat_penalty: Optional[float] = Field(default=None, ge=0.5, le=2.0)
    num_ctx: Optional[int] = Field(default=None, ge=1024, le=32768)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=12000)
    settings: Optional[SessionUpdate] = None


class ChatMessageRead(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    duration_ms: int
    created_at: str


class TokenUsageRead(BaseModel):
    stored_tokens_estimate: int
    prompt_tokens_estimate: int
    context_window: int
    context_usage_ratio: float
    messages_stored: int
    messages_sent: int
    estimator: str = "chars/4"


class ChatSessionRead(ChatSettings):
    id: str
    title: str
    created_at: str
    updated_at: str


class ChatResponse(BaseModel):
    session: ChatSessionRead
    user_message: ChatMessageRead
    assistant_message: ChatMessageRead
    token_usage: TokenUsageRead


class ModelRead(BaseModel):
    name: str
    modified_at: Optional[str] = None
    size: Optional[int] = None


def session_read(item: ChatSessionModel) -> ChatSessionRead:
    return ChatSessionRead(
        id=item.id,
        title=item.title,
        model=item.model,
        system_prompt=item.system_prompt,
        temperature=item.temperature,
        top_p=item.top_p,
        top_k=item.top_k,
        repeat_penalty=item.repeat_penalty,
        num_ctx=item.num_ctx,
        created_at=utc_string(item.created_at),
        updated_at=utc_string(item.updated_at),
    )


def message_read(item: ChatMessageModel) -> ChatMessageRead:
    return ChatMessageRead(
        id=item.id,
        session_id=item.session_id,
        role=item.role,
        content=item.content,
        duration_ms=item.duration_ms,
        created_at=utc_string(item.created_at),
    )


def estimate_tokens(value: str) -> int:
    if not value:
        return 0
    return max(1, round(len(value) / 4))


def token_usage_read(db: Session, session: ChatSessionModel, sent_history: Optional[list[dict[str, str]]] = None) -> TokenUsageRead:
    all_messages = db.query(ChatMessageModel).filter(ChatMessageModel.session_id == session.id).all()
    stored_tokens = estimate_tokens(session.system_prompt) + sum(estimate_tokens(item.content) for item in all_messages)
    if sent_history is None:
        sent_history = list_recent_messages(db, session.id)
    prompt_tokens = estimate_tokens(session.system_prompt) + sum(estimate_tokens(item["content"]) for item in sent_history)
    ratio = min(1.0, prompt_tokens / session.num_ctx) if session.num_ctx else 0
    return TokenUsageRead(
        stored_tokens_estimate=stored_tokens,
        prompt_tokens_estimate=prompt_tokens,
        context_window=session.num_ctx,
        context_usage_ratio=round(ratio, 4),
        messages_stored=len(all_messages),
        messages_sent=len(sent_history),
    )


def get_session_or_404(db: Session, session_id: str) -> ChatSessionModel:
    item = db.query(ChatSessionModel).filter(ChatSessionModel.id == session_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Chat no encontrado.")
    return item


def insert_message(db: Session, session_id: str, role: str, content: str, duration_ms: int = 0) -> ChatMessageModel:
    message = ChatMessageModel(session_id=session_id, role=role, content=content, duration_ms=duration_ms)
    db.add(message)
    session = get_session_or_404(db, session_id)
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(message)
    return message


def list_recent_messages(db: Session, session_id: str, limit: int = 24) -> list[dict[str, str]]:
    rows = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == session_id)
        .order_by(ChatMessageModel.created_at.desc())
        .limit(limit)
        .all()
    )
    return [{"role": row.role, "content": row.content} for row in reversed(rows)]


def update_session(db: Session, session_id: str, payload: SessionUpdate) -> ChatSessionModel:
    item = get_session_or_404(db, session_id)
    updates = payload.model_dump(exclude_none=True)
    for key, value in updates.items():
        setattr(item, key, value)
    if updates:
        item.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(item)
    return item


def ollama_chat(session: ChatSessionModel, history: list[dict[str, str]]) -> tuple[str, int]:
    started = time.perf_counter()
    payload: dict[str, Any] = {
        "model": session.model,
        "messages": [{"role": "system", "content": session.system_prompt}, *history],
        "stream": False,
        "options": {
            "temperature": session.temperature,
            "top_p": session.top_p,
            "top_k": session.top_k,
            "repeat_penalty": session.repeat_penalty,
            "num_ctx": session.num_ctx,
        },
    }
    try:
        response = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=180)
        response.raise_for_status()
        data = response.json()
        content = (data.get("message") or {}).get("content") or ""
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"Ollama no respondio: {exc}") from exc
    content = content.strip() or "No recibi una respuesta valida del modelo."
    return content, round((time.perf_counter() - started) * 1000)


app = FastAPI(title="GateChat API", version="0.1.0")
app.add_middleware(SecurityMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/api/security/public-key")
def security_public_key() -> dict[str, str]:
    return {"public_key": PUBLIC_KEY_PEM, "fingerprint": PUBLIC_KEY_FINGERPRINT, "algorithm": "RSA-OAEP-SHA256 + AES-256-GCM"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "gatechat", "ollama": OLLAMA_BASE_URL, "database": DB_HOST}


@app.get("/api/models", response_model=list[ModelRead])
def list_models() -> list[ModelRead]:
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=8)
        response.raise_for_status()
        models = response.json().get("models", [])
    except requests.RequestException:
        return [ModelRead(name=DEFAULT_MODEL)]
    return [
        ModelRead(name=item.get("name", ""), modified_at=item.get("modified_at"), size=item.get("size"))
        for item in models
        if item.get("name")
    ] or [ModelRead(name=DEFAULT_MODEL)]


@app.get("/api/sessions", response_model=list[ChatSessionRead])
def list_sessions(db: Session = Depends(get_db)) -> list[ChatSessionRead]:
    rows = db.query(ChatSessionModel).order_by(ChatSessionModel.updated_at.desc()).all()
    return [session_read(row) for row in rows]


@app.post("/api/sessions", response_model=ChatSessionRead)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> ChatSessionRead:
    item = ChatSessionModel(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return session_read(item)


@app.patch("/api/sessions/{session_id}", response_model=ChatSessionRead)
def patch_session(session_id: str, payload: SessionUpdate, db: Session = Depends(get_db)) -> ChatSessionRead:
    return session_read(update_session(db, session_id, payload))


@app.delete("/api/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, db: Session = Depends(get_db)) -> None:
    item = get_session_or_404(db, session_id)
    db.query(ChatMessageModel).filter(ChatMessageModel.session_id == session_id).delete()
    db.delete(item)
    db.commit()


@app.get("/api/sessions/{session_id}/messages", response_model=list[ChatMessageRead])
def get_messages(session_id: str, db: Session = Depends(get_db)) -> list[ChatMessageRead]:
    get_session_or_404(db, session_id)
    rows = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == session_id)
        .order_by(ChatMessageModel.created_at.asc())
        .all()
    )
    return [message_read(row) for row in rows]


@app.get("/api/sessions/{session_id}/token-usage", response_model=TokenUsageRead)
def get_token_usage(session_id: str, db: Session = Depends(get_db)) -> TokenUsageRead:
    session = get_session_or_404(db, session_id)
    return token_usage_read(db, session)


@app.post("/api/sessions/{session_id}/chat", response_model=ChatResponse)
def chat(session_id: str, payload: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
    session = update_session(db, session_id, payload.settings) if payload.settings else get_session_or_404(db, session_id)
    user_message = insert_message(db, session.id, "user", payload.message.strip())
    history = list_recent_messages(db, session.id)
    answer, duration_ms = ollama_chat(session, history)
    assistant_message = insert_message(db, session.id, "assistant", answer, duration_ms)
    db.refresh(session)
    return ChatResponse(
        session=session_read(session),
        user_message=message_read(user_message),
        assistant_message=message_read(assistant_message),
        token_usage=token_usage_read(db, session),
    )
