from fastapi import Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api.schemas.responses import AnalyzeResponse
from app.core.pipeline import analyze_job, create_video_job
from app.dependencies import get_db, require_permission


def register(app):
    @app.post("/api/v1/analyze/video", response_model=AnalyzeResponse)
    def analyze_video(
        file: UploadFile = File(...),
        mode: str = Form(default="offline"),
        sample_fps: float = Form(default=1),
        verify_with_llm: bool = Form(default=True),
        detector_mode: str = Form(default="lightweight"),
        project_context: str = Form(default=""),
        user: dict = Depends(require_permission("video_watcher:analyze")),
        db: Session = Depends(get_db),
    ):
        job = create_video_job(db, file, user, project_context)
        report = analyze_job(db, job, sample_fps=sample_fps, verify_with_llm=verify_with_llm, detector_mode=detector_mode)
        return AnalyzeResponse(job_id=job.id, status=report.status, report=report)
