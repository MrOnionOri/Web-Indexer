import json
from datetime import datetime
from pathlib import Path

from fastapi import Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.schemas.responses import (
    DatasetFeedbackRead,
    FrameAIQuestionRead,
    JobListItem,
    ManualSegmentLabelRead,
    ReportRead,
    ReviewSessionRead,
    SegmentAnnotationRead,
    Summary,
    TrainingDatasetEntryRead,
    TrainingDatasetChatMessageRead,
    TrainingDatasetRead,
    TrainingDatasetVersionRead,
)
from app.dependencies import get_db, require_any_permission, require_permission
from app.reports.report_generator import load_report
from app.reports.report_generator import parse_raw_json
from app.storage.models import (
    CandidateEvent,
    FinalIssue,
    FrameAIQuestion,
    HumanFeedback,
    LLMVerification,
    ManualSegmentLabel,
    ReviewSession,
    SegmentAnnotation,
    TrainingDataset,
    TrainingDatasetChatMessage,
    TrainingDatasetEntry,
    TrainingDatasetVersion,
    VideoWatcherJob,
)


class HumanFeedbackCreate(BaseModel):
    verdict: str = Field(max_length=60)
    correct_issue_type: str | None = Field(default=None, max_length=80)
    valid_issue: bool | None = None
    notes: str = Field(default="", max_length=2000)


class ManualSegmentLabelCreate(BaseModel):
    start_timestamp: float = Field(ge=0)
    end_timestamp: float = Field(ge=0)
    label: str = Field(max_length=80)
    training_target: str = Field(default="both", max_length=40)
    notes: str = Field(default="", max_length=2000)


class ReviewSessionCreate(BaseModel):
    notes: str = Field(default="", max_length=2000)


class SegmentAnnotationCreate(BaseModel):
    start_timestamp: float = Field(ge=0)
    end_timestamp: float = Field(ge=0)
    label: str = Field(max_length=80)
    temporal_scope: str = Field(default="segment", max_length=40)
    training_target: str = Field(default="both", max_length=40)
    region: dict | None = None
    llm_output: dict | None = None
    human_reason: str = Field(default="", max_length=3000)
    dataset_id: str | None = None
    dataset_version_id: str | None = None


class FrameAIQuestionCreate(BaseModel):
    timestamp: float = Field(ge=0)
    start_timestamp: float | None = Field(default=None, ge=0)
    end_timestamp: float | None = Field(default=None, ge=0)
    question: str = Field(default="Que error visual detectas aqui?", max_length=1000)
    region: dict | None = None
    human_label: str | None = Field(default=None, max_length=80)
    human_reason: str = Field(default="", max_length=3000)
    training_target: str = Field(default="both", max_length=40)
    dataset_id: str | None = None
    dataset_version_id: str | None = None


class TrainingDatasetCreate(BaseModel):
    name: str = Field(max_length=160)
    description: str = Field(default="", max_length=3000)
    visibility: str = Field(default="private", max_length=40)


class TrainingDatasetVersionCreate(BaseModel):
    version_name: str = Field(max_length=80)
    description: str = Field(default="", max_length=3000)
    focus_label: str | None = Field(default=None, max_length=80)
    work_start_timestamp: float | None = Field(default=None, ge=0)
    work_end_timestamp: float | None = Field(default=None, ge=0)


class TrainingDatasetChatCreate(BaseModel):
    message: str = Field(max_length=4000)
    job_id: str | None = None
    review_session_id: str | None = None
    start_timestamp: float | None = Field(default=None, ge=0)
    end_timestamp: float | None = Field(default=None, ge=0)
    label_hint: str | None = Field(default=None, max_length=80)
    save_important: bool = True


def manual_segment_to_read(segment: ManualSegmentLabel, input_file: str | None = None) -> ManualSegmentLabelRead:
    return ManualSegmentLabelRead(
        id=segment.id,
        job_id=segment.job_id,
        input_file=input_file,
        start_timestamp=segment.start_timestamp,
        end_timestamp=segment.end_timestamp,
        label=segment.label,
        training_target=segment.training_target,
        notes=segment.notes,
        created_by_name=segment.created_by_name,
        created_at=segment.created_at,
    )


def parse_json_object(value: str | None) -> dict | None:
    parsed = parse_raw_json(value)
    return parsed if isinstance(parsed, dict) else None


def review_session_to_read(session: ReviewSession) -> ReviewSessionRead:
    return ReviewSessionRead(
        id=session.id,
        job_id=session.job_id,
        status=session.status,
        reviewer_user_id=session.reviewer_user_id,
        reviewer_name=session.reviewer_name,
        reviewer_email=session.reviewer_email,
        notes=session.notes,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def segment_annotation_to_read(annotation: SegmentAnnotation) -> SegmentAnnotationRead:
    return SegmentAnnotationRead(
        id=annotation.id,
        job_id=annotation.job_id,
        review_session_id=annotation.review_session_id,
        start_timestamp=annotation.start_timestamp,
        end_timestamp=annotation.end_timestamp,
        label=annotation.label,
        temporal_scope=annotation.temporal_scope,
        training_target=annotation.training_target,
        region=parse_json_object(annotation.region_json),
        llm_output=parse_json_object(annotation.llm_output_json),
        human_reason=annotation.human_reason,
        created_by_name=annotation.created_by_name,
        created_at=annotation.created_at,
    )


def frame_ai_question_to_read(question: FrameAIQuestion) -> FrameAIQuestionRead:
    return FrameAIQuestionRead(
        id=question.id,
        job_id=question.job_id,
        review_session_id=question.review_session_id,
        timestamp=question.timestamp,
        start_timestamp=question.start_timestamp,
        end_timestamp=question.end_timestamp,
        question=question.question,
        region=parse_json_object(question.region_json),
        ai_output=parse_json_object(question.ai_output_json),
        human_label=question.human_label,
        human_reason=question.human_reason,
        training_target=question.training_target,
        created_by_name=question.created_by_name,
        created_at=question.created_at,
    )


def dataset_version_to_read(version: TrainingDatasetVersion, entry_count: int = 0) -> TrainingDatasetVersionRead:
    return TrainingDatasetVersionRead(
        id=version.id,
        dataset_id=version.dataset_id,
        version_name=version.version_name,
        description=version.description,
        focus_label=version.focus_label,
        work_start_timestamp=version.work_start_timestamp,
        work_end_timestamp=version.work_end_timestamp,
        status=version.status,
        entry_count=entry_count,
        created_by_name=version.created_by_name,
        created_at=version.created_at,
    )


def dataset_to_read(dataset: TrainingDataset, versions: list[TrainingDatasetVersion] | None = None, entry_counts: dict[str, int] | None = None) -> TrainingDatasetRead:
    versions = versions or []
    entry_counts = entry_counts or {}
    return TrainingDatasetRead(
        id=dataset.id,
        name=dataset.name,
        description=dataset.description,
        visibility=dataset.visibility,
        owner_user_id=dataset.owner_user_id,
        owner_name=dataset.owner_name,
        status=dataset.status,
        version_count=len(versions),
        entry_count=sum(entry_counts.values()),
        created_at=dataset.created_at,
        updated_at=dataset.updated_at,
        versions=[dataset_version_to_read(version, entry_counts.get(version.id, 0)) for version in versions],
    )


def dataset_entry_to_read(entry: TrainingDatasetEntry) -> TrainingDatasetEntryRead:
    return TrainingDatasetEntryRead(
        id=entry.id,
        dataset_id=entry.dataset_id,
        dataset_version_id=entry.dataset_version_id,
        job_id=entry.job_id,
        review_session_id=entry.review_session_id,
        source_type=entry.source_type,
        source_id=entry.source_id,
        label=entry.label,
        start_timestamp=entry.start_timestamp,
        end_timestamp=entry.end_timestamp,
        training_target=entry.training_target,
        payload=parse_json_object(entry.payload_json),
        created_by_name=entry.created_by_name,
        created_at=entry.created_at,
    )


def dataset_chat_message_to_read(message: TrainingDatasetChatMessage) -> TrainingDatasetChatMessageRead:
    return TrainingDatasetChatMessageRead(
        id=message.id,
        dataset_id=message.dataset_id,
        dataset_version_id=message.dataset_version_id,
        job_id=message.job_id,
        review_session_id=message.review_session_id,
        role=message.role,
        content=message.content,
        sanitized=parse_json_object(message.sanitized_json),
        saved_entry_id=message.saved_entry_id,
        created_by_name=message.created_by_name,
        created_at=message.created_at,
    )


def sanitize_chat_to_dataset_signal(message: str, label_hint: str | None, start_timestamp: float | None, end_timestamp: float | None) -> dict:
    text = message.strip()
    lower = text.lower()
    label = (label_hint or "").strip().upper()
    if not label:
        if "pixel" in lower or "artifact" in lower or "block" in lower:
            label = "PIXELATION"
        elif "black" in lower or "negra" in lower or "oscura" in lower:
            label = "BLACK_SCREEN"
        elif "no issue" in lower or "normal" in lower or "bien" in lower:
            label = "NO_ISSUE"
        else:
            label = "UNKNOWN"
    useful = label != "UNKNOWN" or len(text) >= 40
    needs_question = label == "UNKNOWN" or not (start_timestamp is not None and end_timestamp is not None)
    questions = []
    if label == "UNKNOWN":
        questions.append("Que etiqueta exacta quieres usar para este caso?")
    if start_timestamp is None or end_timestamp is None:
        questions.append("Este problema ocurre en un frame puntual o durante un rango de tiempo?")
    return {
        "label": label,
        "useful_for_dataset": useful,
        "confidence": 0.55 if label != "UNKNOWN" else 0.25,
        "clean_summary": text[:700],
        "start_timestamp": start_timestamp,
        "end_timestamp": end_timestamp,
        "questions_for_reviewer": questions,
        "recommended_action": "save_dataset_entry" if useful and not needs_question else "ask_clarifying_question",
    }


def get_owned_dataset_version(db: Session, user: dict, dataset_id: str | None, version_id: str | None) -> tuple[TrainingDataset, TrainingDatasetVersion] | None:
    if not dataset_id or not version_id:
        return None
    dataset = db.query(TrainingDataset).filter(TrainingDataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Training dataset not found")
    if dataset.owner_user_id != user.get("id", "") and not user.get("is_platform_admin"):
        raise HTTPException(status_code=403, detail="Dataset does not belong to this reviewer")
    version = (
        db.query(TrainingDatasetVersion)
        .filter(TrainingDatasetVersion.id == version_id, TrainingDatasetVersion.dataset_id == dataset.id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Training dataset version not found")
    return dataset, version


def add_dataset_entry(
    db: Session,
    user: dict,
    dataset: TrainingDataset,
    version: TrainingDatasetVersion,
    job_id: str,
    review_session_id: str | None,
    source_type: str,
    source_id: str,
    label: str,
    start_timestamp: float | None,
    end_timestamp: float | None,
    training_target: str,
    payload: dict,
) -> TrainingDatasetEntry:
    entry = TrainingDatasetEntry(
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        job_id=job_id,
        review_session_id=review_session_id,
        source_type=source_type,
        source_id=source_id,
        label=label,
        start_timestamp=start_timestamp,
        end_timestamp=end_timestamp,
        training_target=training_target,
        payload_json=json.dumps(payload),
        created_by_user_id=user.get("id", ""),
        created_by_name=user.get("full_name") or user.get("name") or user.get("email", ""),
    )
    dataset.updated_at = datetime.utcnow()
    db.add(entry)
    return entry


def consensus_for_annotations(annotations: list[SegmentAnnotation]) -> list[dict]:
    buckets: dict[str, dict] = {}
    for annotation in annotations:
        bucket = buckets.setdefault(
            annotation.label,
            {
                "label": annotation.label,
                "reviewer_ids": set(),
                "annotation_count": 0,
                "first_timestamp": annotation.start_timestamp,
                "last_timestamp": annotation.end_timestamp,
            },
        )
        bucket["reviewer_ids"].add(annotation.created_by_user_id)
        bucket["annotation_count"] += 1
        bucket["first_timestamp"] = min(bucket["first_timestamp"], annotation.start_timestamp)
        bucket["last_timestamp"] = max(bucket["last_timestamp"], annotation.end_timestamp)
    return [
        {
            "label": bucket["label"],
            "reviewer_count": len(bucket["reviewer_ids"]),
            "annotation_count": bucket["annotation_count"],
            "first_timestamp": bucket["first_timestamp"],
            "last_timestamp": bucket["last_timestamp"],
        }
        for bucket in sorted(buckets.values(), key=lambda item: (-len(item["reviewer_ids"]), item["label"]))
    ]


def hydrate_review_data(report: dict, db: Session) -> dict:
    job_id = report.get("job_id")
    if not job_id:
        return report
    job = db.query(VideoWatcherJob).filter(VideoWatcherJob.id == job_id).first()
    issue_ids = [issue.get("issue_id") for issue in report.get("issues", []) if issue.get("issue_id")]
    issues_by_id = {}
    if issue_ids:
        issues_by_id = {
            issue.id: issue
            for issue in db.query(FinalIssue).filter(FinalIssue.id.in_(issue_ids)).all()
        }
    fallback_candidate_id = ""
    for event in report.get("candidate_events", []):
        if event.get("event_id"):
            fallback_candidate_id = event["event_id"]
            break
    for issue in report.get("issues", []):
        if not issue.get("candidate_event_id"):
            db_issue = issues_by_id.get(issue.get("issue_id"))
            issue["candidate_event_id"] = db_issue.candidate_event_id if db_issue else fallback_candidate_id
    manual_segments = (
        db.query(ManualSegmentLabel)
        .filter(ManualSegmentLabel.job_id == job_id)
        .order_by(ManualSegmentLabel.start_timestamp.asc(), ManualSegmentLabel.created_at.asc())
        .all()
    )
    sessions = (
        db.query(ReviewSession)
        .filter(ReviewSession.job_id == job_id)
        .order_by(ReviewSession.created_at.desc())
        .all()
    )
    annotations = (
        db.query(SegmentAnnotation)
        .filter(SegmentAnnotation.job_id == job_id)
        .order_by(SegmentAnnotation.start_timestamp.asc(), SegmentAnnotation.created_at.asc())
        .all()
    )
    questions = (
        db.query(FrameAIQuestion)
        .filter(FrameAIQuestion.job_id == job_id)
        .order_by(FrameAIQuestion.timestamp.asc(), FrameAIQuestion.created_at.asc())
        .all()
    )
    report["manual_segments"] = [
        manual_segment_to_read(segment, job.original_filename if job else None).model_dump(mode="json")
        for segment in manual_segments
    ]
    report["review_sessions"] = [review_session_to_read(session).model_dump(mode="json") for session in sessions]
    report["segment_annotations"] = [segment_annotation_to_read(annotation).model_dump(mode="json") for annotation in annotations]
    report["frame_ai_questions"] = [frame_ai_question_to_read(question).model_dump(mode="json") for question in questions]
    report["annotation_consensus"] = consensus_for_annotations(annotations)
    return report


def hydrate_ai_outputs(report: dict, db: Session) -> dict:
    events = report.get("candidate_events") or []
    event_ids = [event.get("event_id") for event in events if event.get("event_id")]
    output_by_event = {}
    feedback_items = []
    if event_ids:
        verifications = (
            db.query(LLMVerification)
            .filter(LLMVerification.candidate_event_id.in_(event_ids))
            .all()
        )
        output_by_event = {
            verification.candidate_event_id: parse_raw_json(verification.raw_response_json)
            for verification in verifications
        }
        feedback_items = (
            db.query(HumanFeedback)
            .filter(HumanFeedback.candidate_event_id.in_(event_ids))
            .order_by(HumanFeedback.created_at.desc())
            .all()
        )
    feedback_by_event: dict[str, list[dict]] = {}
    for feedback in feedback_items:
        feedback_by_event.setdefault(feedback.candidate_event_id, []).append(
            {
                "id": feedback.id,
                "verdict": feedback.verdict,
                "correct_issue_type": feedback.correct_issue_type,
                "valid_issue": feedback.valid_issue,
                "notes": feedback.notes,
                "created_by_name": feedback.created_by_name,
                "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
            }
        )
    for event in events:
        event["ai_output"] = event.get("ai_output") or output_by_event.get(event.get("event_id"))
        event["human_feedback"] = event.get("human_feedback") or feedback_by_event.get(event.get("event_id"), [])
    return hydrate_review_data(report, db)


def register(app):
    @app.get("/api/v1/training-datasets", response_model=list[TrainingDatasetRead])
    def list_training_datasets(
        user: dict = Depends(require_any_permission(["video_watcher:review", "video_watcher:analyze", "video_watcher:view"])),
        db: Session = Depends(get_db),
    ):
        query = db.query(TrainingDataset).filter(TrainingDataset.status == "active")
        if not user.get("is_platform_admin"):
            query = query.filter(TrainingDataset.owner_user_id == user.get("id", ""))
        datasets = query.order_by(TrainingDataset.updated_at.desc()).all()
        result: list[TrainingDatasetRead] = []
        for dataset in datasets:
            versions = (
                db.query(TrainingDatasetVersion)
                .filter(TrainingDatasetVersion.dataset_id == dataset.id)
                .order_by(TrainingDatasetVersion.created_at.desc())
                .all()
            )
            entry_counts = {version.id: db.query(TrainingDatasetEntry).filter(TrainingDatasetEntry.dataset_version_id == version.id).count() for version in versions}
            result.append(dataset_to_read(dataset, versions, entry_counts))
        return result

    @app.post("/api/v1/training-datasets", response_model=TrainingDatasetRead)
    def create_training_dataset(
        payload: TrainingDatasetCreate,
        user: dict = Depends(require_any_permission(["video_watcher:review", "video_watcher:analyze"])),
        db: Session = Depends(get_db),
    ):
        visibility = payload.visibility.strip().lower()
        if visibility not in {"private", "team"}:
            raise HTTPException(status_code=400, detail="Invalid dataset visibility")
        dataset = TrainingDataset(
            name=payload.name.strip(),
            description=payload.description.strip(),
            visibility=visibility,
            owner_user_id=user.get("id", ""),
            owner_name=user.get("full_name") or user.get("name") or user.get("email", ""),
            owner_email=user.get("email", ""),
        )
        db.add(dataset)
        db.flush()
        version = TrainingDatasetVersion(
            dataset_id=dataset.id,
            version_name="v1",
            description="Initial dataset version.",
            created_by_user_id=user.get("id", ""),
            created_by_name=user.get("full_name") or user.get("name") or user.get("email", ""),
        )
        db.add(version)
        db.commit()
        db.refresh(dataset)
        db.refresh(version)
        return dataset_to_read(dataset, [version], {version.id: 0})

    @app.post("/api/v1/training-datasets/{dataset_id}/versions", response_model=TrainingDatasetVersionRead)
    def create_training_dataset_version(
        dataset_id: str,
        payload: TrainingDatasetVersionCreate,
        user: dict = Depends(require_any_permission(["video_watcher:review", "video_watcher:analyze"])),
        db: Session = Depends(get_db),
    ):
        dataset = db.query(TrainingDataset).filter(TrainingDataset.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Training dataset not found")
        if dataset.owner_user_id != user.get("id", "") and not user.get("is_platform_admin"):
            raise HTTPException(status_code=403, detail="Dataset does not belong to this reviewer")
        if payload.work_start_timestamp is not None and payload.work_end_timestamp is not None and payload.work_end_timestamp <= payload.work_start_timestamp:
            raise HTTPException(status_code=400, detail="Work end must be greater than work start")
        version = TrainingDatasetVersion(
            dataset_id=dataset.id,
            version_name=payload.version_name.strip(),
            description=payload.description.strip(),
            focus_label=payload.focus_label.strip().upper() if payload.focus_label else None,
            work_start_timestamp=payload.work_start_timestamp,
            work_end_timestamp=payload.work_end_timestamp,
            created_by_user_id=user.get("id", ""),
            created_by_name=user.get("full_name") or user.get("name") or user.get("email", ""),
        )
        dataset.updated_at = datetime.utcnow()
        db.add(version)
        db.commit()
        db.refresh(version)
        return dataset_version_to_read(version, 0)

    @app.get("/api/v1/training-datasets/{dataset_id}/entries", response_model=list[TrainingDatasetEntryRead])
    def list_training_dataset_entries(
        dataset_id: str,
        version_id: str | None = None,
        user: dict = Depends(require_any_permission(["video_watcher:review", "video_watcher:analyze", "video_watcher:view"])),
        db: Session = Depends(get_db),
    ):
        dataset = db.query(TrainingDataset).filter(TrainingDataset.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Training dataset not found")
        if dataset.owner_user_id != user.get("id", "") and not user.get("is_platform_admin"):
            raise HTTPException(status_code=403, detail="Dataset does not belong to this reviewer")
        query = db.query(TrainingDatasetEntry).filter(TrainingDatasetEntry.dataset_id == dataset.id)
        if version_id:
            query = query.filter(TrainingDatasetEntry.dataset_version_id == version_id)
        entries = query.order_by(TrainingDatasetEntry.created_at.desc()).limit(500).all()
        return [dataset_entry_to_read(entry) for entry in entries]

    @app.get("/api/v1/training-datasets/{dataset_id}/versions/{version_id}/chat", response_model=list[TrainingDatasetChatMessageRead])
    def list_training_dataset_chat(
        dataset_id: str,
        version_id: str,
        user: dict = Depends(require_any_permission(["video_watcher:review", "video_watcher:analyze", "video_watcher:view"])),
        db: Session = Depends(get_db),
    ):
        get_owned_dataset_version(db, user, dataset_id, version_id)
        messages = (
            db.query(TrainingDatasetChatMessage)
            .filter(TrainingDatasetChatMessage.dataset_id == dataset_id, TrainingDatasetChatMessage.dataset_version_id == version_id)
            .order_by(TrainingDatasetChatMessage.created_at.asc())
            .limit(300)
            .all()
        )
        return [dataset_chat_message_to_read(message) for message in messages]

    @app.post("/api/v1/training-datasets/{dataset_id}/versions/{version_id}/chat", response_model=list[TrainingDatasetChatMessageRead])
    def chat_with_dataset_ai(
        dataset_id: str,
        version_id: str,
        payload: TrainingDatasetChatCreate,
        user: dict = Depends(require_any_permission(["video_watcher:review", "video_watcher:analyze"])),
        db: Session = Depends(get_db),
    ):
        dataset_version = get_owned_dataset_version(db, user, dataset_id, version_id)
        if not dataset_version:
            raise HTTPException(status_code=404, detail="Training dataset version not found")
        dataset, version = dataset_version
        user_name = user.get("full_name") or user.get("name") or user.get("email", "")
        sanitized = sanitize_chat_to_dataset_signal(payload.message, payload.label_hint, payload.start_timestamp, payload.end_timestamp)
        user_message = TrainingDatasetChatMessage(
            dataset_id=dataset.id,
            dataset_version_id=version.id,
            job_id=payload.job_id,
            review_session_id=payload.review_session_id,
            role="user",
            content=payload.message.strip(),
            sanitized_json=json.dumps(sanitized),
            created_by_user_id=user.get("id", ""),
            created_by_name=user_name,
        )
        db.add(user_message)
        db.flush()

        saved_entry = None
        if payload.save_important and payload.job_id and sanitized["useful_for_dataset"] and sanitized["recommended_action"] == "save_dataset_entry":
            saved_entry = add_dataset_entry(
                db=db,
                user=user,
                dataset=dataset,
                version=version,
                job_id=payload.job_id,
                review_session_id=payload.review_session_id,
                source_type="dataset_chat_insight",
                source_id=user_message.id,
                label=sanitized["label"],
                start_timestamp=payload.start_timestamp,
                end_timestamp=payload.end_timestamp,
                training_target="both",
                payload={
                    "source_message": payload.message.strip(),
                    "sanitized": sanitized,
                    "kind": "reviewer_explanation_chat",
                },
            )
            db.flush()
            user_message.saved_entry_id = saved_entry.id

        if sanitized["questions_for_reviewer"]:
            ai_text = "Necesito afinarlo antes de guardarlo bien: " + " ".join(sanitized["questions_for_reviewer"])
        elif saved_entry:
            ai_text = f"Guarde un dato sanitizado en {dataset.name}/{version.version_name}: {sanitized['label']}. Resumen: {sanitized['clean_summary']}"
        else:
            ai_text = f"Sanitice tu explicacion como {sanitized['label']}. Parece util, pero no lo guarde porque falta activar guardado o contexto suficiente."

        ai_message = TrainingDatasetChatMessage(
            dataset_id=dataset.id,
            dataset_version_id=version.id,
            job_id=payload.job_id,
            review_session_id=payload.review_session_id,
            role="assistant",
            content=ai_text,
            sanitized_json=json.dumps(sanitized),
            saved_entry_id=saved_entry.id if saved_entry else None,
            created_by_user_id="ai",
            created_by_name="Dataset AI",
        )
        db.add(ai_message)
        dataset.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user_message)
        db.refresh(ai_message)
        return [dataset_chat_message_to_read(user_message), dataset_chat_message_to_read(ai_message)]

    @app.get("/api/v1/reports", response_model=list[JobListItem])
    def list_reports(
        user: dict = Depends(require_permission("video_watcher:view")),
        db: Session = Depends(get_db),
    ):
        jobs = db.query(VideoWatcherJob).order_by(VideoWatcherJob.created_at.desc()).limit(50).all()
        rows: list[JobListItem] = []
        for job in jobs:
            report = load_report(job.id)
            summary = Summary(**report["summary"]) if report and report.get("summary") else None
            rows.append(
                JobListItem(
                    id=job.id,
                    original_filename=job.original_filename,
                    status=job.status,
                    created_by_name=job.created_by_name,
                    created_at=job.created_at,
                    completed_at=job.completed_at,
                    summary=summary,
                )
            )
        return rows

    @app.get("/api/v1/reports/{job_id}", response_model=ReportRead)
    def get_report(
        job_id: str,
        user: dict = Depends(require_permission("video_watcher:view")),
        db: Session = Depends(get_db),
    ):
        report = load_report(job_id)
        if report:
            return hydrate_ai_outputs(report, db)
        job = db.query(VideoWatcherJob).filter(VideoWatcherJob.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Report not found")
        issues = db.query(FinalIssue).filter(FinalIssue.job_id == job.id).all()
        return {
            "job_id": job.id,
            "input_file": job.original_filename,
            "status": job.status,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
            "summary": {"total_candidate_events": 0, "verified_issues": len(issues), "false_positives": 0, "needs_human_review": 0},
            "candidate_events": [],
            "issues": [],
            "manual_segments": [
                manual_segment_to_read(segment, job.original_filename).model_dump(mode="json")
                for segment in db.query(ManualSegmentLabel)
                .filter(ManualSegmentLabel.job_id == job.id)
                .order_by(ManualSegmentLabel.start_timestamp.asc(), ManualSegmentLabel.created_at.asc())
                .all()
            ],
            "review_sessions": [
                review_session_to_read(session).model_dump(mode="json")
                for session in db.query(ReviewSession)
                .filter(ReviewSession.job_id == job.id)
                .order_by(ReviewSession.created_at.desc())
                .all()
            ],
            "segment_annotations": [
                segment_annotation_to_read(annotation).model_dump(mode="json")
                for annotation in db.query(SegmentAnnotation)
                .filter(SegmentAnnotation.job_id == job.id)
                .order_by(SegmentAnnotation.start_timestamp.asc(), SegmentAnnotation.created_at.asc())
                .all()
            ],
            "frame_ai_questions": [
                frame_ai_question_to_read(question).model_dump(mode="json")
                for question in db.query(FrameAIQuestion)
                .filter(FrameAIQuestion.job_id == job.id)
                .order_by(FrameAIQuestion.timestamp.asc(), FrameAIQuestion.created_at.asc())
                .all()
            ],
            "annotation_consensus": consensus_for_annotations(
                db.query(SegmentAnnotation).filter(SegmentAnnotation.job_id == job.id).all()
            ),
            "raw": {},
        }

    @app.get("/api/v1/jobs/{job_id}/video")
    def get_job_video(
        job_id: str,
        user: dict = Depends(require_permission("video_watcher:view")),
        db: Session = Depends(get_db),
    ):
        job = db.query(VideoWatcherJob).filter(VideoWatcherJob.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        path = Path(job.input_path)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Video file not found")
        return FileResponse(path, media_type="video/mp4", filename=job.original_filename)

    @app.get("/api/v1/dataset/feedback", response_model=list[DatasetFeedbackRead])
    def list_dataset_feedback(
        user: dict = Depends(require_permission("video_watcher:view")),
        db: Session = Depends(get_db),
    ):
        rows = (
            db.query(HumanFeedback, CandidateEvent, VideoWatcherJob, LLMVerification)
            .join(CandidateEvent, CandidateEvent.id == HumanFeedback.candidate_event_id)
            .join(VideoWatcherJob, VideoWatcherJob.id == HumanFeedback.job_id)
            .outerjoin(LLMVerification, LLMVerification.candidate_event_id == CandidateEvent.id)
            .order_by(HumanFeedback.created_at.desc())
            .limit(200)
            .all()
        )
        return [
            DatasetFeedbackRead(
                id=feedback.id,
                job_id=job.id,
                input_file=job.original_filename,
                event_id=event.id,
                event_type_guess=event.issue_type_guess,
                event_timestamp=event.center_timestamp,
                detector_confidence=event.max_confidence,
                ai_output=parse_raw_json(verification.raw_response_json) if verification else None,
                verdict=feedback.verdict,
                correct_issue_type=feedback.correct_issue_type,
                valid_issue=feedback.valid_issue,
                notes=feedback.notes,
                created_by_name=feedback.created_by_name,
                created_at=feedback.created_at,
            )
            for feedback, event, job, verification in rows
        ]

    @app.get("/api/v1/dataset/manual-segments", response_model=list[ManualSegmentLabelRead])
    def list_dataset_manual_segments(
        user: dict = Depends(require_permission("video_watcher:view")),
        db: Session = Depends(get_db),
    ):
        rows = (
            db.query(ManualSegmentLabel, VideoWatcherJob)
            .join(VideoWatcherJob, VideoWatcherJob.id == ManualSegmentLabel.job_id)
            .order_by(ManualSegmentLabel.created_at.desc())
            .limit(200)
            .all()
        )
        return [manual_segment_to_read(segment, job.original_filename) for segment, job in rows]

    @app.post("/api/v1/jobs/{job_id}/manual-segments", response_model=ManualSegmentLabelRead)
    def create_manual_segment(
        job_id: str,
        payload: ManualSegmentLabelCreate,
        user: dict = Depends(require_permission("video_watcher:analyze")),
        db: Session = Depends(get_db),
    ):
        allowed_labels = {"BLACK_SCREEN", "PIXELATION"}
        allowed_targets = {"mini_ai", "llm", "both"}
        label = payload.label.strip().upper()
        target = payload.training_target.strip().lower()
        if label not in allowed_labels:
            raise HTTPException(status_code=400, detail="Invalid manual label")
        if target not in allowed_targets:
            raise HTTPException(status_code=400, detail="Invalid training target")
        if payload.end_timestamp <= payload.start_timestamp:
            raise HTTPException(status_code=400, detail="End timestamp must be greater than start timestamp")
        job = db.query(VideoWatcherJob).filter(VideoWatcherJob.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        segment = ManualSegmentLabel(
            job_id=job.id,
            start_timestamp=payload.start_timestamp,
            end_timestamp=payload.end_timestamp,
            label=label,
            training_target=target,
            notes=payload.notes.strip(),
            created_by_user_id=user.get("id", ""),
            created_by_name=user.get("full_name") or user.get("name") or user.get("email", ""),
        )
        db.add(segment)
        db.commit()
        db.refresh(segment)
        return manual_segment_to_read(segment, job.original_filename)

    @app.post("/api/v1/jobs/{job_id}/review-sessions", response_model=ReviewSessionRead)
    def create_or_resume_review_session(
        job_id: str,
        payload: ReviewSessionCreate,
        user: dict = Depends(require_any_permission(["video_watcher:review", "video_watcher:analyze"])),
        db: Session = Depends(get_db),
    ):
        job = db.query(VideoWatcherJob).filter(VideoWatcherJob.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        user_id = user.get("id", "")
        session = (
            db.query(ReviewSession)
            .filter(
                ReviewSession.job_id == job.id,
                ReviewSession.reviewer_user_id == user_id,
                ReviewSession.status == "active",
            )
            .order_by(ReviewSession.created_at.desc())
            .first()
        )
        if session:
            session.notes = payload.notes.strip() or session.notes
            session.updated_at = datetime.utcnow()
        else:
            session = ReviewSession(
                job_id=job.id,
                reviewer_user_id=user_id,
                reviewer_name=user.get("full_name") or user.get("name") or user.get("email", ""),
                reviewer_email=user.get("email", ""),
                notes=payload.notes.strip(),
            )
            db.add(session)
        db.commit()
        db.refresh(session)
        return review_session_to_read(session)

    @app.get("/api/v1/jobs/{job_id}/review-sessions", response_model=list[ReviewSessionRead])
    def list_review_sessions(
        job_id: str,
        user: dict = Depends(require_permission("video_watcher:view")),
        db: Session = Depends(get_db),
    ):
        return [
            review_session_to_read(session)
            for session in db.query(ReviewSession)
            .filter(ReviewSession.job_id == job_id)
            .order_by(ReviewSession.created_at.desc())
            .all()
        ]

    @app.post("/api/v1/review-sessions/{session_id}/annotations", response_model=SegmentAnnotationRead)
    def create_segment_annotation(
        session_id: str,
        payload: SegmentAnnotationCreate,
        user: dict = Depends(require_any_permission(["video_watcher:review", "video_watcher:analyze"])),
        db: Session = Depends(get_db),
    ):
        allowed_labels = {"BLACK_SCREEN", "PIXELATION", "NO_ISSUE", "UNKNOWN"}
        allowed_targets = {"mini_ai", "llm", "both"}
        allowed_scopes = {"frame", "segment", "video"}
        label = payload.label.strip().upper()
        target = payload.training_target.strip().lower()
        scope = payload.temporal_scope.strip().lower()
        if label not in allowed_labels:
            raise HTTPException(status_code=400, detail="Invalid annotation label")
        if target not in allowed_targets:
            raise HTTPException(status_code=400, detail="Invalid training target")
        if scope not in allowed_scopes:
            raise HTTPException(status_code=400, detail="Invalid temporal scope")
        if payload.end_timestamp <= payload.start_timestamp:
            raise HTTPException(status_code=400, detail="End timestamp must be greater than start timestamp")
        session = db.query(ReviewSession).filter(ReviewSession.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Review session not found")
        dataset_version = get_owned_dataset_version(db, user, payload.dataset_id, payload.dataset_version_id)
        annotation = SegmentAnnotation(
            job_id=session.job_id,
            review_session_id=session.id,
            start_timestamp=payload.start_timestamp,
            end_timestamp=payload.end_timestamp,
            label=label,
            temporal_scope=scope,
            training_target=target,
            region_json=json.dumps(payload.region or {}),
            llm_output_json=json.dumps(payload.llm_output or {}),
            human_reason=payload.human_reason.strip(),
            created_by_user_id=user.get("id", ""),
            created_by_name=user.get("full_name") or user.get("name") or user.get("email", ""),
        )
        session.updated_at = datetime.utcnow()
        db.add(annotation)
        db.flush()
        if dataset_version:
            dataset, version = dataset_version
            add_dataset_entry(
                db=db,
                user=user,
                dataset=dataset,
                version=version,
                job_id=session.job_id,
                review_session_id=session.id,
                source_type="segment_annotation",
                source_id=annotation.id,
                label=label,
                start_timestamp=payload.start_timestamp,
                end_timestamp=payload.end_timestamp,
                training_target=target,
                payload={
                    "region": payload.region or {},
                    "llm_output": payload.llm_output or {},
                    "human_reason": payload.human_reason.strip(),
                    "temporal_scope": scope,
                },
            )
        db.commit()
        db.refresh(annotation)
        return segment_annotation_to_read(annotation)

    @app.post("/api/v1/review-sessions/{session_id}/ai-questions", response_model=FrameAIQuestionRead)
    def ask_ai_about_frame(
        session_id: str,
        payload: FrameAIQuestionCreate,
        user: dict = Depends(require_any_permission(["video_watcher:ask_ai", "video_watcher:analyze"])),
        db: Session = Depends(get_db),
    ):
        allowed_targets = {"mini_ai", "llm", "both"}
        target = payload.training_target.strip().lower()
        if target not in allowed_targets:
            raise HTTPException(status_code=400, detail="Invalid training target")
        if payload.start_timestamp is not None and payload.end_timestamp is not None and payload.end_timestamp <= payload.start_timestamp:
            raise HTTPException(status_code=400, detail="End timestamp must be greater than start timestamp")
        session = db.query(ReviewSession).filter(ReviewSession.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Review session not found")
        dataset_version = get_owned_dataset_version(db, user, payload.dataset_id, payload.dataset_version_id)
        candidates = (
            db.query(CandidateEvent)
            .filter(CandidateEvent.job_id == session.job_id)
            .order_by(CandidateEvent.center_timestamp.asc())
            .all()
        )
        nearest = None
        for candidate in candidates:
            in_range = candidate.first_timestamp <= payload.timestamp <= candidate.last_timestamp
            near = abs(candidate.center_timestamp - payload.timestamp) <= 2
            if in_range or near:
                nearest = candidate
                break
        ai_output = {
            "mode": "mock_vision_review",
            "question": payload.question,
            "timestamp": payload.timestamp,
            "region": payload.region or {},
            "detected_issue": nearest.issue_type_guess if nearest else "UNKNOWN",
            "confidence": nearest.max_confidence if nearest else 0.28,
            "reason": (
                nearest.description
                if nearest
                else "No stored detector candidate overlaps this frame. A real vision LLM should inspect this frame/region."
            ),
            "suggested_training_target": target,
        }
        question = FrameAIQuestion(
            job_id=session.job_id,
            review_session_id=session.id,
            timestamp=payload.timestamp,
            start_timestamp=payload.start_timestamp,
            end_timestamp=payload.end_timestamp,
            question=payload.question.strip(),
            region_json=json.dumps(payload.region or {}),
            ai_output_json=json.dumps(ai_output),
            human_label=payload.human_label.strip().upper() if payload.human_label else None,
            human_reason=payload.human_reason.strip(),
            training_target=target,
            created_by_user_id=user.get("id", ""),
            created_by_name=user.get("full_name") or user.get("name") or user.get("email", ""),
        )
        session.updated_at = datetime.utcnow()
        db.add(question)
        db.flush()
        if dataset_version:
            dataset, version = dataset_version
            add_dataset_entry(
                db=db,
                user=user,
                dataset=dataset,
                version=version,
                job_id=session.job_id,
                review_session_id=session.id,
                source_type="frame_ai_question",
                source_id=question.id,
                label=question.human_label or ai_output["detected_issue"],
                start_timestamp=payload.start_timestamp or payload.timestamp,
                end_timestamp=payload.end_timestamp or payload.timestamp,
                training_target=target,
                payload={
                    "question": payload.question.strip(),
                    "region": payload.region or {},
                    "ai_output": ai_output,
                    "human_label": question.human_label,
                    "human_reason": payload.human_reason.strip(),
                },
            )
        db.commit()
        db.refresh(question)
        return frame_ai_question_to_read(question)

    @app.post("/api/v1/events/{event_id}/feedback")
    def create_event_feedback(
        event_id: str,
        payload: HumanFeedbackCreate,
        user: dict = Depends(require_permission("video_watcher:analyze")),
        db: Session = Depends(get_db),
    ):
        allowed_verdicts = {
            "ai_correct",
            "false_positive",
            "wrong_classification",
            "missed_issue",
            "needs_review",
        }
        if payload.verdict not in allowed_verdicts:
            raise HTTPException(status_code=400, detail="Invalid feedback verdict")
        event = db.query(CandidateEvent).filter(CandidateEvent.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Candidate event not found")
        feedback = HumanFeedback(
            job_id=event.job_id,
            candidate_event_id=event.id,
            verdict=payload.verdict,
            correct_issue_type=payload.correct_issue_type,
            valid_issue=payload.valid_issue,
            notes=payload.notes.strip(),
            created_by_user_id=user.get("id", ""),
            created_by_name=user.get("full_name") or user.get("name") or user.get("email", ""),
        )
        db.add(feedback)
        db.commit()
        db.refresh(feedback)
        return {
            "id": feedback.id,
            "verdict": feedback.verdict,
            "correct_issue_type": feedback.correct_issue_type,
            "valid_issue": feedback.valid_issue,
            "notes": feedback.notes,
            "created_by_name": feedback.created_by_name,
            "created_at": feedback.created_at,
        }
