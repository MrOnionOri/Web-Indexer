import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import (
    DEFAULT_EVENT_EXTRACTION_FPS,
    DEFAULT_EVENT_WINDOW_AFTER,
    DEFAULT_EVENT_WINDOW_BEFORE,
    DEFAULT_SAMPLE_FPS,
    FRAME_DIR,
    LIGHT_DETECTOR_MIN_CONFIDENCE,
    UPLOAD_DIR,
)
from app.core.models import CandidateEventData
from app.core.decision_engine import decide
from app.core.event_builder import group_events
from app.detector_light.detector import LightweightDetector
from app.reports.report_generator import build_report, save_report
from app.storage.models import CandidateEvent, FinalIssue, LLMVerification, VideoWatcherJob
from app.verifier_llm.client import build_verifier
from app.video.frame_extractor import extract_window
from app.video.frame_sampler import sample_video_frames


def safe_filename(filename: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in {".", "-", "_"} else "_" for ch in filename).strip("._")
    return cleaned or "input.mp4"


def create_video_job(db: Session, file: UploadFile, user: dict, project_context: str = "") -> VideoWatcherJob:
    job_id = str(uuid.uuid4())
    original = safe_filename(file.filename or "input.mp4")
    upload_dir = UPLOAD_DIR / job_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination = upload_dir / original

    with destination.open("wb") as output:
        shutil.copyfileobj(file.file, output)

    job = VideoWatcherJob(
        id=job_id,
        input_type="video",
        input_path=str(destination),
        original_filename=original,
        status="queued",
        project_context=project_context.strip(),
        created_by_user_id=user.get("id", ""),
        created_by_name=user.get("full_name") or user.get("name") or user.get("email", ""),
        created_by_email=user.get("email", ""),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def build_llm_sweep_events(frames) -> list[CandidateEventData]:
    events: list[CandidateEventData] = []
    if not frames:
        return events
    last_timestamp = -999.0
    for frame in frames:
        if frame.timestamp - last_timestamp < 5:
            continue
        last_timestamp = frame.timestamp
        events.append(
            CandidateEventData(
                event_id=f"evt_{uuid.uuid4().hex[:10]}",
                first_timestamp=max(0, frame.timestamp - 0.75),
                last_timestamp=frame.timestamp + 0.75,
                center_timestamp=frame.timestamp,
                issue_type_guess="UNKNOWN",
                max_confidence=0.9,
                average_confidence=0.9,
                frame_count=1,
                description="LLM sweep segment created without lightweight detector filtering.",
            )
        )
    return events


def analyze_job(
    db: Session,
    job: VideoWatcherJob,
    sample_fps: float | None = None,
    verify_with_llm: bool = True,
    detector_mode: str = "lightweight",
):
    job.status = "running"
    job.started_at = datetime.utcnow()
    db.commit()

    candidates_db: list[CandidateEvent] = []
    verifications_db: list[LLMVerification] = []
    issues_db: list[FinalIssue] = []
    false_positives = 0
    needs_human_review = 0

    try:
        video_path = Path(job.input_path)
        sample_dir = FRAME_DIR / job.id / "samples"
        frames = sample_video_frames(video_path, sample_dir, sample_fps or DEFAULT_SAMPLE_FPS)
        if detector_mode == "llm_sweep":
            grouped_events = build_llm_sweep_events(frames)
        else:
            detector_events = LightweightDetector().detect(frames)
            grouped_events = [
                event for event in group_events(detector_events) if event.max_confidence >= LIGHT_DETECTOR_MIN_CONFIDENCE
            ]
        verifier = build_verifier()

        for event in grouped_events:
            db_event = CandidateEvent(
                job_id=job.id,
                first_timestamp=event.first_timestamp,
                last_timestamp=event.last_timestamp,
                center_timestamp=event.center_timestamp,
                issue_type_guess=event.issue_type_guess,
                max_confidence=event.max_confidence,
                average_confidence=event.average_confidence,
                frame_count=event.frame_count,
                description=event.description,
                region_json=json.dumps(event.regions),
            )
            db.add(db_event)
            db.flush()
            candidates_db.append(db_event)

            evidence_frames = extract_window(
                video_path=video_path,
                output_dir=FRAME_DIR / job.id / db_event.id,
                timestamp=event.center_timestamp,
                before=DEFAULT_EVENT_WINDOW_BEFORE,
                after=DEFAULT_EVENT_WINDOW_AFTER,
                fps=DEFAULT_EVENT_EXTRACTION_FPS,
            )
            llm_result = verifier.verify(evidence_frames, event, job.project_context) if verify_with_llm else {
                "verified": False,
                "issue_type": "UNKNOWN",
                "severity": "none",
                "timestamp_confirmed": None,
                "best_evidence_frame": None,
                "is_temporal_issue": False,
                "reason": "LLM verification was disabled for this run.",
                "recommended_action": "needs_human_review",
            }
            db_verification = LLMVerification(
                candidate_event_id=db_event.id,
                verified=bool(llm_result.get("verified")),
                issue_type=llm_result.get("issue_type", "UNKNOWN"),
                severity=llm_result.get("severity", "none"),
                timestamp_confirmed=llm_result.get("timestamp_confirmed"),
                best_evidence_frame=llm_result.get("best_evidence_frame"),
                is_temporal_issue=bool(llm_result.get("is_temporal_issue")),
                reason=llm_result.get("reason", ""),
                recommended_action=llm_result.get("recommended_action", "ignore"),
                raw_response_json=json.dumps(llm_result),
            )
            db.add(db_verification)
            db.flush()
            verifications_db.append(db_verification)

            decision = decide(event, llm_result)
            if decision.should_create_issue:
                issue = FinalIssue(
                    job_id=job.id,
                    candidate_event_id=db_event.id,
                    issue_type=llm_result.get("issue_type", event.issue_type_guess),
                    severity=llm_result.get("severity", "medium"),
                    timestamp=llm_result.get("timestamp_confirmed") or event.center_timestamp,
                    evidence_frame_path=llm_result.get("best_evidence_frame"),
                    description=llm_result.get("reason", event.description),
                )
                db.add(issue)
                db.flush()
                issues_db.append(issue)
            elif decision.needs_human_review:
                needs_human_review += 1
            elif not llm_result.get("verified"):
                false_positives += 1

        job.status = "completed"
        job.completed_at = datetime.utcnow()
        db.commit()
        report = build_report(job, candidates_db, issues_db, false_positives, needs_human_review, verifications_db)
        save_report(report)
        return report
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        job.completed_at = datetime.utcnow()
        db.commit()
        raise
