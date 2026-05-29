import os
import uuid
from datetime import datetime
from typing import List, Optional
import requests

from fastapi import FastAPI, Depends, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Text, Boolean, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ----------------- CONFIGURACIÓN & DB -----------------
DATABASE_URL = "sqlite:///./confluence.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Variables de entorno
GATESTACK_API_URL = os.getenv("GATESTACK_API_URL", "http://localhost:8000")

# ----------------- MODELOS DE BASE DE DATOS -----------------
class SpaceModel(Base):
    __tablename__ = "spaces"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(140), unique=True, nullable=False)
    key = Column(String(20), unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

class PageModel(Base):
    __tablename__ = "pages"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    space_key = Column(String(20), nullable=False, index=True)
    title = Column(String(180), nullable=False)
    content = Column(Text, default="")
    created_by_email = Column(String(255), nullable=False)
    created_by_name = Column(String(160), nullable=False)
    created_by_id = Column(String(36), nullable=False)
    is_restricted = Column(Boolean, default=False)
    allowed_emails = Column(Text, default="")  # Almacenado como correos separados por comas
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Crear tablas
Base.metadata.create_all(bind=engine)

# ----------------- SCHEMAS PYDANTIC -----------------
class SpaceCreate(BaseModel):
    name: str
    key: str
    description: str

class SpaceRead(BaseModel):
    id: str
    name: str
    key: str
    description: str
    created_at: datetime
    class Config:
        from_attributes = True

class PageCreate(BaseModel):
    space_key: str
    title: str
    content: str
    is_restricted: bool = False
    allowed_emails: str = ""

class PageRead(BaseModel):
    id: str
    space_key: str
    title: str
    content: str
    created_by_email: str
    created_by_name: str
    created_by_id: str
    is_restricted: bool
    allowed_emails: str
    created_at: datetime
    updated_at: datetime
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

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    token = credentials.credentials
    headers = {"Authorization": f"Bearer {token}"}
    
    # Lista de URLs candidatas para contactar a GateStack
    urls = [
        GATESTACK_API_URL,
        "http://host.docker.internal:8000",
        "http://gatestack-backend:8000",
        "http://localhost:8000"
    ]
    
    for base_url in urls:
        try:
            response = requests.get(f"{base_url}/auth/me", headers=headers, timeout=2.0)
            if response.status_code == 200:
                user_data = response.json()
                return user_data
        except Exception:
            continue
            
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o el servicio central de GateStack IAM no está disponible."
    )

def check_permission(user: dict, required_permission: str):
    permissions = user.get("permissions", [])
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in permissions
    
    if is_admin:
        return
        
    if required_permission not in permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No tienes el permiso requerido: {required_permission}"
        )

# ----------------- APP FASTAPI -----------------
app = FastAPI(title="GateWiki Service")

# Habilitar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- RUTAS API -----------------

# --- Espacios ---
@app.get("/api/spaces", response_model=List[SpaceRead])
def get_spaces(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    return db.query(SpaceModel).order_by(SpaceModel.name).all()

@app.post("/api/spaces", response_model=SpaceRead)
def create_space(space: SpaceCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:create")
    
    # Comprobar si ya existe
    existing = db.query(SpaceModel).filter((SpaceModel.key == space.key.upper()) | (SpaceModel.name == space.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un espacio con ese nombre o identificador.")
        
    db_space = SpaceModel(
        name=space.name,
        key=space.key.upper(),
        description=space.description
    )
    db.add(db_space)
    db.commit()
    db.refresh(db_space)
    return db_space

# --- Páginas ---
@app.get("/api/pages", response_model=List[PageRead])
def get_pages(space_key: Optional[str] = None, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    
    query = db.query(PageModel)
    if space_key:
        query = query.filter(PageModel.space_key == space_key)
        
    pages = query.order_by(PageModel.created_at.desc()).all()
    
    # Filtrar páginas por visibilidad (Requisito Especial)
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    visible_pages = []
    for page in pages:
        if not page.is_restricted:
            visible_pages.append(page)
        else:
            # Si está restringida, solo creador, admins o correos en allowed_emails pueden verla
            allowed_list = [email.strip().lower() for email in page.allowed_emails.split(",") if email.strip()]
            if is_admin or page.created_by_id == user_id or user_email in allowed_list:
                visible_pages.append(page)
                
    return visible_pages

@app.get("/api/pages/{page_id}", response_model=PageRead)
def get_page(page_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:view")
    
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Página no encontrada")
        
    # Verificar acceso a página privada
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    user_email = user.get("email", "").lower()
    user_id = user.get("id", "")
    
    if page.is_restricted:
        allowed_list = [email.strip().lower() for email in page.allowed_emails.split(",") if email.strip()]
        if not (is_admin or page.created_by_id == user_id or user_email in allowed_list):
            raise HTTPException(status_code=403, detail="No tienes acceso para visualizar esta página privada.")
            
    return page

@app.post("/api/pages", response_model=PageRead)
def create_page(page: PageCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:create")
    
    # Comprobar si el espacio existe
    space = db.query(SpaceModel).filter(SpaceModel.key == page.space_key.upper()).first()
    if not space:
        raise HTTPException(status_code=404, detail="El espacio especificado no existe.")
        
    db_page = PageModel(
        space_key=page.space_key.upper(),
        title=page.title,
        content=page.content,
        created_by_email=user.get("email"),
        created_by_name=user.get("full_name"),
        created_by_id=user.get("id"),
        is_restricted=page.is_restricted,
        allowed_emails=page.allowed_emails
    )
    db.add(db_page)
    db.commit()
    db.refresh(db_page)
    return db_page

@app.put("/api/pages/{page_id}", response_model=PageRead)
def update_page(page_id: str, payload: PageCreate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:edit")
    
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Página no encontrada")
        
    # Verificar si es el dueño, admin o tiene permisos
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    if not (is_admin or page.created_by_id == user.get("id")):
        # Si no es dueño ni admin, requiere permisos
        check_permission(user, "gatewiki:edit")
        
    page.title = payload.title
    page.content = payload.content
    page.is_restricted = payload.is_restricted
    page.allowed_emails = payload.allowed_emails
    page.space_key = payload.space_key.upper()
    
    db.commit()
    db.refresh(page)
    return page

@app.delete("/api/pages/{page_id}", status_code=204)
def delete_page(page_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:delete")
    
    page = db.query(PageModel).filter(PageModel.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Página no encontrada")
        
    # Solo el dueño o admins pueden borrar, o cualquier gatewiki:delete
    is_admin = user.get("is_platform_admin", False) or "gatewiki:admin" in user.get("permissions", [])
    if not (is_admin or page.created_by_id == user.get("id")):
        check_permission(user, "gatewiki:delete")
        
    db.delete(page)
    db.commit()
    return

# --- Cargar Datos Semilla ---
@app.post("/api/seed")
def seed_data(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    check_permission(user, "gatewiki:admin")
    
    # Crear espacios
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
    
    # Crear páginas semilla
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
            "content": "# Integración con GateStack SSO\n\nPara validar tokens, debes llamar al endpoint `/auth/me` con la cabecera `Authorization: Bearer <JWT>`.\n\n```python\n# Ejemplo Python\nresponse = requests.get('http://gatestack-backend:8000/auth/me', headers=headers)\n```",
            "is_restricted": False,
            "allowed_emails": ""
        },
        {
            "space_key": "ENG",
            "title": "[PRIVADO] Credenciales de Despliegue de Producción",
            "content": "# CREDENCIALES CRÍTICAS\n\n> [!CAUTION]\n> Esta información es altamente restringida.\n\n* **Host base de datos:** `prod-mysql.internal`\n* **Clave de cifrado simétrico:** `df789asudf9a8sdhfg234`\n* **SSH Keys:** Guardadas en el llavero seguro.",
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
                created_by_email=user.get("email"),
                created_by_name=user.get("full_name"),
                created_by_id=user.get("id"),
                is_restricted=pd["is_restricted"],
                allowed_emails=pd["allowed_emails"]
            ))
            created_pages += 1
            
    db.commit()
    return {"message": f"Datos cargados: {created_spaces} espacios y {created_pages} páginas creadas."}

# Servir Frontend Estático desde la raíz
app.mount("/", StaticFiles(directory="static", html=True), name="static")
