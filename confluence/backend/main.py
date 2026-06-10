import os
import uuid
from datetime import datetime
from typing import List, Optional
import requests
from urllib.parse import quote_plus

from fastapi import FastAPI, Depends, HTTPException, Request, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Text, Boolean, DateTime, Integer, text, ForeignKey
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ----------------- CONFIGURACIÃ“N & DB (MySQL) -----------------
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "gatestack")

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
                
            conn.commit()
    except Exception as e:
        print("Nota: Error durante la migraciÃ³n de columnas:", e)


if os.getenv("GATEWIKI_SKIP_DB_INIT") != "1":
    init_db_for_local_dev()


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


class FeedbackRead(BaseModel):
    id: str
    source_app: str
    title: str
    message: str
    status: str
    page_id: Optional[str] = None
    page_title: Optional[str] = None
    space_key: Optional[str] = None
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

# ----------------- SEGURIDAD & INTEGRACIÃ“N SSO -----------------
security = HTTPBearer()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    token = credentials.credentials
    headers = {"Authorization": f"Bearer {token}"}
    
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

def forward_gatestack_request(method: str, path: str, request: Optional[Request] = None, **kwargs):
    last_error = "GateStack IAM no estÃ¡ disponible."
    for base_url in get_gatestack_urls(request):
        try:
            response = requests.request(method, f"{base_url}{path}", timeout=4.0, **kwargs)
            try:
                payload = response.json()
            except ValueError:
                payload = {"detail": response.text or "Respuesta invÃ¡lida de GateStack IAM."}

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
    elif request.cookies.get("gatestack_token"):
        headers["Authorization"] = f"Bearer {request.cookies['gatestack_token']}"

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

# ----------------- APP FASTAPI -----------------
app = FastAPI(title="GateWiki Service (MySQL)")

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
def login(payload: LoginRequest, request: Request):
    return forward_gatestack_request("POST", "/auth/login", request=request, json=payload.model_dump())

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
        message=payload.message.strip(),
        page_id=payload.page_id,
        page_title=payload.page_title,
        space_key=(payload.space_key or "").upper() or None,
        created_by_user_id=user.get("id"),
        created_by_name=user.get("full_name"),
        created_by_email=user.get("email"),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.get("/api/feedback/my", response_model=List[FeedbackRead])
def get_my_feedback(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    return (
        db.query(FeedbackItemModel)
        .filter(FeedbackItemModel.created_by_user_id == user.get("id"))
        .order_by(FeedbackItemModel.created_at.desc())
        .all()
    )

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
                
    return visible_pages

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
            
    return page

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
        content=page.content,
        subtopics=page.subtopics,
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
    return db_page

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
    page.content = payload.content
    page.subtopics = payload.subtopics
    page.is_restricted = payload.is_restricted
    page.allowed_emails = payload.allowed_emails
    page.space_key = payload.space_key.upper()
    page.comments_allowed = payload.comments_allowed
    
    db.commit()
    db.refresh(page)
    return page

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
    return db.query(PageModel).filter(PageModel.space_key == space_key).order_by(PageModel.sort_order.asc(), PageModel.created_at.desc()).all()

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
    return comments


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
        content=payload.content
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    db_comment.reactions = []
    return db_comment


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
                content=pd["content"],
                subtopics=pd.get("subtopics", ""),
                created_by_email=user.get("email"),
                created_by_name=user.get("full_name"),
                created_by_id=user.get("id"),
                is_restricted=pd["is_restricted"],
                allowed_emails=pd["allowed_emails"]
            ))
            created_pages += 1
            
    db.commit()
    return {"message": f"Datos cargados: {created_spaces} espacios y {created_pages} pÃ¡ginas creadas."}

# Servir archivos estÃ¡ticos especÃ­ficos y fallback para la SPA (React Routing)
@app.get("/{path_name:path}")
async def serve_static_or_spa(path_name: str):
    # Evitar interceptar peticiones de la API que no existen
    if path_name.startswith("api"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
        
    file_path = os.path.join("static", path_name)
    if not path_name or os.path.isdir(file_path) or not os.path.exists(file_path):
        index_path = os.path.join("static", "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend index.html not found.")
        
    return FileResponse(file_path)

