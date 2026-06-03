import logging
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger("gatestack")

engine = create_engine(settings.sqlalchemy_database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

db_connected = True


class Base(DeclarativeBase):
    pass


def check_db_connection() -> bool:
    global db_connected
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_connected = True
        return True
    except (OperationalError, Exception) as e:
        logger.error(f"Database connection check failed: {e}")
        db_connected = False
        return False


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

