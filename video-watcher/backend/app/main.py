from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analyze, auth, health, reports
from app.config import CORS_ALLOWED_ORIGIN_REGEX, ensure_data_dirs
from app.storage.database import init_db

ensure_data_dirs()
init_db()

app = FastAPI(title="Video Watcher API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

health.register(app)
auth.register(app)
analyze.register(app)
reports.register(app)


@app.get("/")
def root():
    return {"service": "Video Watcher API", "docs": "/docs"}
