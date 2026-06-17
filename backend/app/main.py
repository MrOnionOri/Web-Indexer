from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import admin, apps, auth, feedback, portal, projects
from app.core.config import get_settings
from app.core.crypto import ENCRYPTION_PREFIX, encrypt_text
from app.core.security import ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME
from app.db.session import Base, SessionLocal, engine, check_db_connection
from app.models import FeedbackInternalNote, FeedbackItem
from app.services.bootstrap import bootstrap

settings = get_settings()

docs_kwargs = {}
if settings.environment.lower() not in {"local", "development", "dev", "test"}:
    docs_kwargs = {"docs_url": None, "redoc_url": None, "openapi_url": None}

app = FastAPI(title=settings.app_name, **docs_kwargs)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.backend_cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    safe_methods = {"GET", "HEAD", "OPTIONS", "TRACE"}
    public_auth_paths = {"/auth/login", "/auth/register", "/auth/password-reset/confirm"}
    uses_cookie_session = ACCESS_COOKIE_NAME in request.cookies and not request.headers.get("authorization")
    if request.method.upper() not in safe_methods and uses_cookie_session and request.url.path not in public_auth_paths:
        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
        csrf_header = request.headers.get(CSRF_HEADER_NAME)
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(status_code=403, content={"detail": "Invalid CSRF token"})
    return await call_next(request)


@app.middleware("http")
async def db_maintenance_middleware(request: Request, call_next):
    from app.db.session import db_connected
    if not db_connected and request.url.path not in ["/health"]:
        check_db_connection()
    from app.db.session import db_connected
    if not db_connected and request.url.path not in ["/health"]:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Database connection offline. System under maintenance.",
                "code": "0XDEADFA11",
            },
        )
    response = await call_next(request)
    return response


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(apps.router)
app.include_router(feedback.router)
app.include_router(portal.router)
app.include_router(projects.router)


def run_auto_migrations(engine) -> None:
    from sqlalchemy import inspect, text
    from app.models import User, UserBadge
    users_table = User.__tablename__
    badges_table = UserBadge.__tablename__
    safe_table_names = {table.name for table in Base.metadata.sorted_tables}
    if users_table not in safe_table_names:
        raise RuntimeError(f"Refusing to migrate unexpected table: {users_table}")
    if badges_table not in safe_table_names:
        raise RuntimeError(f"Refusing to migrate unexpected table: {badges_table}")
    try:
        inspector = inspect(engine)
        if users_table in inspector.get_table_names():
            columns = [col["name"] for col in inspector.get_columns(users_table)]
            if "status_reason" not in columns:
                print(f"Auto-migration: Adding missing column 'status_reason' to table '{users_table}'...")
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {users_table} ADD COLUMN status_reason TEXT NULL"))
                print("Auto-migration completed.")
            migrations = {
                "must_reset_password": "BOOLEAN NOT NULL DEFAULT 0",
                "password_reset_token": "VARCHAR(128) NULL",
                "password_reset_expires_at": "DATETIME NULL",
            }
            for column_name, column_type in migrations.items():
                if column_name not in columns:
                    print(f"Auto-migration: Adding missing column '{column_name}' to table '{users_table}'...")
                    with engine.begin() as conn:
                        conn.execute(text(f"ALTER TABLE {users_table} ADD COLUMN {column_name} {column_type}"))
            if "password_reset_token" not in columns:
                with engine.begin() as conn:
                    conn.execute(text(f"CREATE UNIQUE INDEX ix_{users_table}_password_reset_token ON {users_table} (password_reset_token)"))
        if badges_table in inspector.get_table_names():
            badge_columns = [col["name"] for col in inspector.get_columns(badges_table)]
            if "logo_url" not in badge_columns:
                print(f"Auto-migration: Adding missing column 'logo_url' to table '{badges_table}'...")
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {badges_table} ADD COLUMN logo_url VARCHAR(500) NULL"))
    except Exception as e:
        print(f"Auto-migration error: {e}")


def encrypt_existing_sensitive_data(db) -> None:
    changed = False
    for item in db.query(FeedbackItem).all():
        if item.message and not item.message.startswith(ENCRYPTION_PREFIX):
            item.message = encrypt_text(item.message)
            changed = True
        if item.public_response and not item.public_response.startswith(ENCRYPTION_PREFIX):
            item.public_response = encrypt_text(item.public_response)
            changed = True
    for note in db.query(FeedbackInternalNote).all():
        if note.note and not note.note.startswith(ENCRYPTION_PREFIX):
            note.note = encrypt_text(note.note)
            changed = True
    if changed:
        db.commit()


@app.on_event("startup")
def on_startup() -> None:
    if check_db_connection():
        Base.metadata.create_all(bind=engine)
        run_auto_migrations(engine)
        db = SessionLocal()
        try:
            bootstrap(db)
            encrypt_existing_sensitive_data(db)
        finally:
            db.close()
    else:
        print("Database connection failed. GateStack is operating under maintenance mode.")



@app.get("/health")
def health():
    from app.db.session import db_connected
    if not db_connected:
        return JSONResponse(
            status_code=503,
            content={"status": "maintenance", "code": "0XDEADFA11"},
        )
    return {"status": "ok", "service": settings.app_name}
