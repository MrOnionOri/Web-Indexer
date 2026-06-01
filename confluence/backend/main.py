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
from sqlalchemy import create_engine, Column, String, Text, Boolean, DateTime, text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ----------------- CONFIGURACIÓN & DB (MySQL) -----------------
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "gatestack")

# URL-escape para caracteres especiales en la contraseña (ej: @, /)
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
    content = Column(Text, default="")
    subtopics = Column(Text, default="", nullable=True)
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
                
            c_result = conn.execute(text("SHOW COLUMNS FROM confluence_comments"))
            existing_c_cols = {row[0] for row in c_result.fetchall()}
            if "parent_id" not in existing_c_cols:
                conn.execute(text("ALTER TABLE confluence_comments ADD COLUMN parent_id VARCHAR(36) NULL"))
                
            conn.commit()
    except Exception as e:
        print("Nota: Error durante la migración de columnas:", e)


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

# ----------------- SEGURIDAD & INTEGRACIÓN SSO -----------------
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
        detail="Token inválido o el servicio central de GateStack IAM no está disponible."
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
    last_error = "GateStack IAM no está disponible."
    for base_url in get_gatestack_urls(request):
        try:
            response = requests.request(method, f"{base_url}{path}", timeout=4.0, **kwargs)
            try:
                payload = response.json()
            except ValueError:
                payload = {"detail": response.text or "Respuesta inválida de GateStack IAM."}

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

def ensure_page_access(page: PageModel, db: Session, user: dict, action: str = "visualizar") -> SpaceModel | None:
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    is_admin = is_admin_user(user)
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")

    if space and space.is_restricted:
        if not (is_admin or space.created_by_id == user_id or user_email in allowed_email_list(space.allowed_emails)):
            raise HTTPException(status_code=403, detail=f"No tienes acceso para {action} contenido de este espacio de trabajo.")

    if page.is_restricted:
        if not (is_admin or page.created_by_id == user_id or user_email in allowed_email_list(page.allowed_emails)):
            raise HTTPException(status_code=403, detail=f"No tienes acceso para {action} esta pÃ¡gina privada.")

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
def create_space(space: SpaceCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
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
    return db_space

@app.put("/api/spaces/{space_id}", response_model=SpaceRead)
def update_space(space_id: str, payload: SpaceCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
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


# --- Páginas ---
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
        
    # 2. Filtrar las páginas de la base de datos
    query = db.query(PageModel)
    if space_key:
        if space_key.upper() not in visible_space_keys:
            return []
        query = query.filter(PageModel.space_key == space_key.upper())
    else:
        query = query.filter(PageModel.space_key.in_(list(visible_space_keys)))
        
    pages = query.order_by(PageModel.created_at.desc()).all()
    
    # 3. Filtrar a nivel de página (páginas restringidas individualmente)
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
        raise HTTPException(status_code=404, detail="Página no encontrada")
        
    # Verificar acceso al Espacio de la página
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    if space and space.is_restricted:
        allowed_list = [email.strip().lower() for email in (space.allowed_emails or "").split(",") if email.strip()]
        if not (is_admin or space.created_by_id == user_id or user_email in allowed_list):
            raise HTTPException(status_code=403, detail="No tienes acceso al espacio de trabajo de esta página.")
            
    # Verificar acceso a la página privada en sí
    if page.is_restricted:
        allowed_list = [email.strip().lower() for email in (page.allowed_emails or "").split(",") if email.strip()]
        if not (is_admin or page.created_by_id == user_id or user_email in allowed_list):
            raise HTTPException(status_code=403, detail="No tienes acceso para visualizar esta página privada.")
            
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
    
    if space.is_restricted:
        allowed_list = [email.strip().lower() for email in (space.allowed_emails or "").split(",") if email.strip()]
        if not (is_admin or space.created_by_id == user_id or user_email in allowed_list):
            raise HTTPException(status_code=403, detail="No puedes crear páginas en un espacio de trabajo restringido en el que no estás autorizado.")
            
    db_page = PageModel(
        space_key=page.space_key.upper(),
        title=page.title,
        content=page.content,
        subtopics=page.subtopics,
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
        raise HTTPException(status_code=404, detail="Página no encontrada")
        
    # Verificar si el usuario tiene acceso al espacio actual de la página
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    if space and space.is_restricted:
        allowed_list = [email.strip().lower() for email in (space.allowed_emails or "").split(",") if email.strip()]
        if not (is_admin or space.created_by_id == user_id or user_email in allowed_list):
            raise HTTPException(status_code=403, detail="No tienes acceso para modificar páginas en este espacio de trabajo.")
            
    # Verificar si el usuario tiene acceso al espacio destino (en caso de moverla)
    if payload.space_key.upper() != page.space_key.upper():
        dest_space = db.query(SpaceModel).filter(SpaceModel.key == payload.space_key.upper()).first()
        if not dest_space:
            raise HTTPException(status_code=404, detail="El espacio destino no existe.")
        if dest_space.is_restricted:
            allowed_list = [email.strip().lower() for email in (dest_space.allowed_emails or "").split(",") if email.strip()]
            if not (is_admin or dest_space.created_by_id == user_id or user_email in allowed_list):
                raise HTTPException(status_code=403, detail="No tienes acceso para mover páginas al espacio de trabajo de destino.")
                
    # Verificar si es el dueño, admin o tiene permisos de edición
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

@app.delete("/api/pages/{page_id}", status_code=204)
def delete_page(page_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:delete_page")
    
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Página no encontrada")
        
    # Verificar si tiene acceso al espacio
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    if space and space.is_restricted:
        allowed_list = [email.strip().lower() for email in (space.allowed_emails or "").split(",") if email.strip()]
        if not (is_admin or space.created_by_id == user_id or user_email in allowed_list):
            raise HTTPException(status_code=403, detail="No tienes acceso para eliminar páginas en este espacio de trabajo.")
            
    # Solo el dueño o admins pueden borrar, o cualquier gatewiki:delete
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
        raise HTTPException(status_code=404, detail="Página no encontrada.")

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
        raise HTTPException(status_code=404, detail="Página no encontrada.")
        
    if not page.comments_allowed:
        raise HTTPException(status_code=400, detail="Los comentarios están desactivados para esta página.")

    ensure_page_access(page, db, user, "comentar")
            
    # Validar parent_id
    if payload.parent_id:
        parent = db.query(CommentModel).filter(CommentModel.id == payload.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Comentario principal no encontrado.")
        if parent.page_id != page_id:
            raise HTTPException(status_code=400, detail="El comentario principal no pertenece a esta página.")
        if parent.parent_id:
            raise HTTPException(status_code=400, detail="No se permiten hilos de discusión de más de 1 nivel.")
            
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
        raise HTTPException(status_code=404, detail="Página no encontrada.")
    ensure_page_access(page, db, user, "reaccionar a")
        
    user_id = user.get("id")
    user_name = user.get("full_name")
    emoji = payload.emoji.strip()
    if not emoji or len(emoji) > 10:
        raise HTTPException(status_code=400, detail="Reacción inválida.")
    
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
        raise HTTPException(status_code=404, detail="Página no encontrada.")

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
        {"name": "Ingeniería de Software", "key": "ENG", "description": "Estándares de desarrollo, arquitecturas y guías de codificación."},
        {"name": "Diseño UX/UI", "key": "DSN", "description": "Guías de diseño, componentes visuales e identidad de marca."},
        {"name": "IAM Integraciones", "key": "IAM", "description": "Información técnica sobre el portal de permisos de GateStack."}
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
            "content": "# Arquitectura de Servicios\n\nTodos los servicios satélites del ecosistema deben integrarse a través de **GateStack IAM**.\n\n## Requisitos Básicos\n1. Validar el token JWT en cada petición.\n2. Cumplir con la matriz de permisos.\n3. Implementar un fallback elegante de base de datos.",
            "is_restricted": False,
            "allowed_emails": ""
        },
        {
            "space_key": "IAM",
            "title": "Manual de Integración Single Sign-On (SSO)",
            "content": "# Integración con GateStack SSO\n\nPara validar tokens, debes llamar al endpoint `/auth/me` con la cabecera `Authorization: Bearer <JWT>`.\n\n```python\n# Ejemplo Python\nresponse = requests.get('http://host.docker.internal:8000/auth/me', headers=headers)\n```",
            "is_restricted": False,
            "allowed_emails": ""
        },
        {
            "space_key": "ENG",
            "title": "[PRIVADO] Ejemplo de Procedimiento de Despliegue",
            "content": "# Procedimiento Privado de Despliegue\n\n> [!CAUTION]\n> Esta página es solo un ejemplo de contenido restringido para pruebas.\n\n* **Entorno:** `staging`\n* **Responsable:** Equipo de plataforma\n* **Notas:** No guardes credenciales reales dentro de GateWiki.",
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
    return {"message": f"Datos cargados: {created_spaces} espacios y {created_pages} páginas creadas."}

# Servir archivos estáticos específicos y fallback para la SPA (React Routing)
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

