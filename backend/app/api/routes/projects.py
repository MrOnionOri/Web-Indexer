import os
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db, SessionLocal
from app.models import AuditLog, ProjectStatus, ProjectUpload, User
from app.schemas import ProjectRead, ProjectReviewRequest

router = APIRouter(prefix="/projects", tags=["projects"])
UPLOAD_DIR = Path("storage/uploads")
ALLOWED_ARCHIVES = {".zip"}
logger = logging.getLogger("gatestack.projects")


def detect_stack(filename: str) -> str:
    name = filename.lower()
    if "react" in name:
        return "React"
    if "svelte" in name:
        return "Svelte"
    if "fastapi" in name:
        return "FastAPI"
    return "Unknown"


@router.get("", response_model=list[ProjectRead])
def list_projects(_: User = Depends(require_permission("projects:review")), db: Session = Depends(get_db)):
    return db.scalars(select(ProjectUpload).order_by(ProjectUpload.created_at.desc())).all()


@router.post("/upload", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def upload_project(
    file: UploadFile = File(...),
    actor: User = Depends(require_permission("projects:upload")),
    db: Session = Depends(get_db),
):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_ARCHIVES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .zip archives are accepted")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = os.path.basename(file.filename or "project.zip")
    storage_path = UPLOAD_DIR / f"{actor.id}-{safe_name}"

    contents = await file.read()
    storage_path.write_bytes(contents)

    project = ProjectUpload(
        uploaded_by_user_id=actor.id,
        original_filename=safe_name,
        storage_path=str(storage_path),
        status=ProjectStatus.pending_review,
        detected_stack=detect_stack(safe_name),
    )
    db.add(project)
    db.flush()
    db.add(AuditLog(actor_user_id=actor.id, action="projects.uploaded", target_type="project", target_id=project.id))
    db.commit()
    db.refresh(project)
    return project


def simulate_deployment(project_id: str, db_session_factory):
    import time
    db = db_session_factory()
    try:
        project = db.get(ProjectUpload, project_id)
        if not project:
            return

        project.status = ProjectStatus.building
        db.commit()

        time.sleep(4)

        db.refresh(project)
        if project.status != ProjectStatus.building:
            return

        if "fail" in project.original_filename.lower():
            project.status = ProjectStatus.build_failed
            project.review_notes = (project.review_notes or "") + "\n\n[System Log] Build Error: SyntaxError inside index.js. Exit code 1."
        else:
            project.status = ProjectStatus.running
            project.review_notes = (project.review_notes or "") + f"\n\n[System Log] Build Success. Service exposed internally at http://localhost:8000/sandbox/{project.id}"

        db.commit()
    except Exception:
        logger.exception("Project deployment simulation failed for project %s", project_id)
    finally:
        db.close()


@router.patch("/{project_id}/review", response_model=ProjectRead)
def review_project(
    project_id: str,
    payload: ProjectReviewRequest,
    background_tasks: BackgroundTasks,
    actor: User = Depends(require_permission("projects:review")),
    db: Session = Depends(get_db),
):
    project = db.get(ProjectUpload, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if payload.status not in {ProjectStatus.review_failed, ProjectStatus.approved, ProjectStatus.suspended}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid review status")

    project.status = payload.status
    project.review_notes = payload.review_notes
    db.add(AuditLog(actor_user_id=actor.id, action="projects.reviewed", target_type="project", target_id=project.id))
    db.commit()
    db.refresh(project)

    if payload.status == ProjectStatus.approved:
        background_tasks.add_task(simulate_deployment, project.id, SessionLocal)

    return project
