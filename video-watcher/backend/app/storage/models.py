import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.mysql import LONGTEXT

from app.storage.database import Base


class VideoWatcherJob(Base):
    __tablename__ = "video_watcher_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    input_type = Column(String(40), nullable=False, default="video")
    input_path = Column(String(700), nullable=False)
    original_filename = Column(String(255), nullable=False)
    status = Column(String(40), nullable=False, default="queued", index=True)
    project_context = Column(Text, nullable=False, default="")
    created_by_user_id = Column(String(36), nullable=False, index=True)
    created_by_name = Column(String(160), nullable=False)
    created_by_email = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=False, default="")


class CandidateEvent(Base):
    __tablename__ = "video_watcher_candidate_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(36), ForeignKey("video_watcher_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    first_timestamp = Column(Float, nullable=False, default=0)
    last_timestamp = Column(Float, nullable=False, default=0)
    center_timestamp = Column(Float, nullable=False, default=0)
    issue_type_guess = Column(String(80), nullable=False, default="UNKNOWN", index=True)
    max_confidence = Column(Float, nullable=False, default=0)
    average_confidence = Column(Float, nullable=False, default=0)
    frame_count = Column(Integer, nullable=False, default=1)
    description = Column(Text, nullable=False, default="")
    region_json = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class LLMVerification(Base):
    __tablename__ = "video_watcher_llm_verifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_event_id = Column(String(36), ForeignKey("video_watcher_candidate_events.id", ondelete="CASCADE"), nullable=False, index=True)
    verified = Column(Boolean, nullable=False, default=False)
    issue_type = Column(String(80), nullable=False, default="NO_ISSUE")
    severity = Column(String(40), nullable=False, default="none")
    timestamp_confirmed = Column(Float, nullable=True)
    best_evidence_frame = Column(String(700), nullable=True)
    is_temporal_issue = Column(Boolean, nullable=False, default=False)
    reason = Column(Text, nullable=False, default="")
    recommended_action = Column(String(60), nullable=False, default="ignore")
    raw_response_json = Column(LONGTEXT, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FinalIssue(Base):
    __tablename__ = "video_watcher_final_issues"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(36), ForeignKey("video_watcher_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    candidate_event_id = Column(String(36), ForeignKey("video_watcher_candidate_events.id", ondelete="CASCADE"), nullable=False, index=True)
    issue_type = Column(String(80), nullable=False, index=True)
    severity = Column(String(40), nullable=False, index=True)
    timestamp = Column(Float, nullable=True)
    evidence_frame_path = Column(String(700), nullable=True)
    description = Column(Text, nullable=False, default="")
    status = Column(String(40), nullable=False, default="open", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class HumanFeedback(Base):
    __tablename__ = "video_watcher_human_feedback"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(36), ForeignKey("video_watcher_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    candidate_event_id = Column(String(36), ForeignKey("video_watcher_candidate_events.id", ondelete="CASCADE"), nullable=False, index=True)
    verdict = Column(String(60), nullable=False, index=True)
    correct_issue_type = Column(String(80), nullable=True, index=True)
    valid_issue = Column(Boolean, nullable=True)
    notes = Column(Text, nullable=False, default="")
    created_by_user_id = Column(String(36), nullable=False, index=True)
    created_by_name = Column(String(160), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ManualSegmentLabel(Base):
    __tablename__ = "video_watcher_manual_segment_labels"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(36), ForeignKey("video_watcher_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    start_timestamp = Column(Float, nullable=False, default=0)
    end_timestamp = Column(Float, nullable=False, default=0)
    label = Column(String(80), nullable=False, index=True)
    training_target = Column(String(40), nullable=False, default="both", index=True)
    notes = Column(Text, nullable=False, default="")
    created_by_user_id = Column(String(36), nullable=False, index=True)
    created_by_name = Column(String(160), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ReviewSession(Base):
    __tablename__ = "video_watcher_review_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(36), ForeignKey("video_watcher_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(40), nullable=False, default="active", index=True)
    reviewer_user_id = Column(String(36), nullable=False, index=True)
    reviewer_name = Column(String(160), nullable=False)
    reviewer_email = Column(String(255), nullable=False, index=True)
    notes = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, index=True)


class SegmentAnnotation(Base):
    __tablename__ = "video_watcher_segment_annotations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(36), ForeignKey("video_watcher_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    review_session_id = Column(String(36), ForeignKey("video_watcher_review_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    start_timestamp = Column(Float, nullable=False, default=0)
    end_timestamp = Column(Float, nullable=False, default=0)
    label = Column(String(80), nullable=False, index=True)
    temporal_scope = Column(String(40), nullable=False, default="segment", index=True)
    training_target = Column(String(40), nullable=False, default="both", index=True)
    region_json = Column(Text, nullable=False, default="")
    llm_output_json = Column(LONGTEXT, nullable=False, default="")
    human_reason = Column(Text, nullable=False, default="")
    created_by_user_id = Column(String(36), nullable=False, index=True)
    created_by_name = Column(String(160), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class FrameAIQuestion(Base):
    __tablename__ = "video_watcher_frame_ai_questions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String(36), ForeignKey("video_watcher_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    review_session_id = Column(String(36), ForeignKey("video_watcher_review_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(Float, nullable=False, default=0, index=True)
    start_timestamp = Column(Float, nullable=True)
    end_timestamp = Column(Float, nullable=True)
    question = Column(Text, nullable=False, default="")
    region_json = Column(Text, nullable=False, default="")
    ai_output_json = Column(LONGTEXT, nullable=False, default="")
    human_label = Column(String(80), nullable=True, index=True)
    human_reason = Column(Text, nullable=False, default="")
    training_target = Column(String(40), nullable=False, default="both", index=True)
    created_by_user_id = Column(String(36), nullable=False, index=True)
    created_by_name = Column(String(160), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class TrainingDataset(Base):
    __tablename__ = "video_watcher_training_datasets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(160), nullable=False, index=True)
    description = Column(Text, nullable=False, default="")
    visibility = Column(String(40), nullable=False, default="private", index=True)
    owner_user_id = Column(String(36), nullable=False, index=True)
    owner_name = Column(String(160), nullable=False)
    owner_email = Column(String(255), nullable=False, index=True)
    status = Column(String(40), nullable=False, default="active", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, index=True)


class TrainingDatasetVersion(Base):
    __tablename__ = "video_watcher_training_dataset_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String(36), ForeignKey("video_watcher_training_datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    version_name = Column(String(80), nullable=False, index=True)
    description = Column(Text, nullable=False, default="")
    focus_label = Column(String(80), nullable=True, index=True)
    work_start_timestamp = Column(Float, nullable=True)
    work_end_timestamp = Column(Float, nullable=True)
    status = Column(String(40), nullable=False, default="active", index=True)
    created_by_user_id = Column(String(36), nullable=False, index=True)
    created_by_name = Column(String(160), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class TrainingDatasetEntry(Base):
    __tablename__ = "video_watcher_training_dataset_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String(36), ForeignKey("video_watcher_training_datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    dataset_version_id = Column(String(36), ForeignKey("video_watcher_training_dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(String(36), ForeignKey("video_watcher_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    review_session_id = Column(String(36), ForeignKey("video_watcher_review_sessions.id", ondelete="CASCADE"), nullable=True, index=True)
    source_type = Column(String(60), nullable=False, index=True)
    source_id = Column(String(36), nullable=False, index=True)
    label = Column(String(80), nullable=False, index=True)
    start_timestamp = Column(Float, nullable=True)
    end_timestamp = Column(Float, nullable=True)
    training_target = Column(String(40), nullable=False, default="both", index=True)
    payload_json = Column(LONGTEXT, nullable=False, default="")
    created_by_user_id = Column(String(36), nullable=False, index=True)
    created_by_name = Column(String(160), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class TrainingDatasetChatMessage(Base):
    __tablename__ = "video_watcher_training_dataset_chat_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String(36), ForeignKey("video_watcher_training_datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    dataset_version_id = Column(String(36), ForeignKey("video_watcher_training_dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(String(36), ForeignKey("video_watcher_jobs.id", ondelete="CASCADE"), nullable=True, index=True)
    review_session_id = Column(String(36), ForeignKey("video_watcher_review_sessions.id", ondelete="CASCADE"), nullable=True, index=True)
    role = Column(String(40), nullable=False, index=True)
    content = Column(Text, nullable=False, default="")
    sanitized_json = Column(LONGTEXT, nullable=False, default="")
    saved_entry_id = Column(String(36), nullable=True, index=True)
    created_by_user_id = Column(String(36), nullable=False, index=True)
    created_by_name = Column(String(160), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
