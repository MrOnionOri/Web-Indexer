from pathlib import Path

from app.core.models import FrameSample


def sample_video_frames(video_path: Path, output_dir: Path, sample_fps: float) -> list[FrameSample]:
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        return []

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return []

    source_fps = capture.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(source_fps / max(sample_fps, 0.1)))
    samples: list[FrameSample] = []
    previous_gray = None
    frame_index = 0
    sample_index = 0

    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if frame_index % step == 0:
            timestamp = frame_index / source_fps
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness = float(gray.mean())
            diff_score = None
            if previous_gray is not None:
                diff_score = float(np.mean(cv2.absdiff(gray, previous_gray)) / 255)
            height, width = gray.shape[:2]
            block_width = max(1, width // 24)
            block_height = max(1, height // 24)
            tiny = cv2.resize(gray, (block_width, block_height), interpolation=cv2.INTER_LINEAR)
            blocky = cv2.resize(tiny, (width, height), interpolation=cv2.INTER_NEAREST)
            pixelation_score = float(np.mean(cv2.absdiff(gray, blocky)) / 255)
            previous_gray = gray
            sample_index += 1
            frame_path = output_dir / f"sample_{sample_index:04d}.jpg"
            cv2.imwrite(str(frame_path), frame)
            samples.append(
                FrameSample(
                    path=str(frame_path),
                    timestamp=timestamp,
                    brightness=brightness,
                    diff_score=diff_score,
                    pixelation_score=pixelation_score,
                )
            )
        frame_index += 1

    capture.release()
    return samples
