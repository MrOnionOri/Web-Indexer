import shutil
import subprocess
from pathlib import Path

from app.config import FFMPEG_PATH


def extract_window(
    video_path: Path,
    output_dir: Path,
    timestamp: float,
    before: float,
    after: float,
    fps: float,
) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    if not shutil.which(FFMPEG_PATH):
        return []

    start = max(0, timestamp - before)
    duration = before + after
    pattern = output_dir / "frame_%03d.jpg"
    command = [
        FFMPEG_PATH,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(video_path),
        "-vf",
        f"fps={fps}",
        "-t",
        f"{duration:.3f}",
        str(pattern),
    ]
    subprocess.run(command, check=False)
    return [str(path) for path in sorted(output_dir.glob("frame_*.jpg"))]
