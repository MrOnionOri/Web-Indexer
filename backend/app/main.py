from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import admin, apps, auth, knowledge, projects
from app.core.config import get_settings
from app.db.session import Base, SessionLocal, engine, check_db_connection
from app.services.bootstrap import bootstrap

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.backend_cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
app.include_router(knowledge.router)
app.include_router(projects.router)


def run_auto_migrations(engine) -> None:
    from sqlalchemy import inspect, text
    from app.models import User
    users_table = User.__tablename__
    safe_table_names = {table.name for table in Base.metadata.sorted_tables}
    if users_table not in safe_table_names:
        raise RuntimeError(f"Refusing to migrate unexpected table: {users_table}")
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
    except Exception as e:
        print(f"Auto-migration error: {e}")


@app.on_event("startup")
def on_startup() -> None:
    if check_db_connection():
        Base.metadata.create_all(bind=engine)
        run_auto_migrations(engine)
        db = SessionLocal()
        try:
            bootstrap(db)
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
