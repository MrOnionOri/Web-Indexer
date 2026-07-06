import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

CONFIG_FILE = Path(__file__).resolve()
for parent in [CONFIG_FILE.parents[1], CONFIG_FILE.parents[2]]:
    for env_name in (".env.local", ".env"):
        env_path = parent / env_name
        if env_path.is_file():
            load_dotenv(env_path, override=False)


APP_NAME = os.getenv("APP_NAME", "video-watcher")
ENVIRONMENT = os.getenv("ENVIRONMENT", "local").lower()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER") or os.getenv("VIDEOWATCHER_DB_USER", "videowatcher_app")
DB_PASSWORD = os.getenv("DB_PASSWORD") or os.getenv("VIDEOWATCHER_DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "gatestack")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"mysql+pymysql://{quote_plus(DB_USER)}:{quote_plus(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/{DB_NAME}",
)

GATESTACK_API_URL = os.getenv("GATESTACK_API_URL", "http://192.168.1.150:8000").rstrip("/")
GATESTACK_FALLBACK_URLS = [
    url.strip().rstrip("/")
    for url in os.getenv("GATESTACK_FALLBACK_URLS", "").split(",")
    if url.strip()
]

DEFAULT_DATA_ROOT = Path(__file__).resolve().parents[1] / "data"
DATA_ROOT = Path(os.getenv("VIDEO_WATCHER_DATA_ROOT", str(DEFAULT_DATA_ROOT))).resolve()
UPLOAD_DIR = DATA_ROOT / "uploads"
FRAME_DIR = DATA_ROOT / "frames"
REPORT_DIR = DATA_ROOT / "reports"
DATASET_DIR = DATA_ROOT / "datasets"

FFMPEG_PATH = os.getenv("FFMPEG_PATH", "ffmpeg")
DEFAULT_SAMPLE_FPS = float(os.getenv("DEFAULT_SAMPLE_FPS", "1"))
DEFAULT_EVENT_WINDOW_BEFORE = float(os.getenv("DEFAULT_EVENT_WINDOW_BEFORE", "0.75"))
DEFAULT_EVENT_WINDOW_AFTER = float(os.getenv("DEFAULT_EVENT_WINDOW_AFTER", "0.75"))
DEFAULT_EVENT_EXTRACTION_FPS = float(os.getenv("DEFAULT_EVENT_EXTRACTION_FPS", "4"))
LIGHT_DETECTOR_MIN_CONFIDENCE = float(os.getenv("LIGHT_DETECTOR_MIN_CONFIDENCE", "0.35"))
LIGHT_DETECTOR_GROUPING_WINDOW_SECONDS = float(os.getenv("LIGHT_DETECTOR_GROUPING_WINDOW_SECONDS", "1.5"))

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "mock").lower()
LLM_MODEL = os.getenv("LLM_MODEL", "mock-vision-verifier")

CORS_ALLOWED_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?",
)


def ensure_data_dirs() -> None:
    for path in [UPLOAD_DIR, FRAME_DIR, REPORT_DIR, DATASET_DIR]:
        path.mkdir(parents=True, exist_ok=True)
