from datetime import datetime
from typing import Any

from pydantic import BaseModel


class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    permissions: list[str] = []
    is_platform_admin: bool = False


class Summary(BaseModel):
    total_candidate_events: int = 0
    verified_issues: int = 0
    false_positives: int = 0
    needs_human_review: int = 0


class IssueRead(BaseModel):
    issue_id: str
    candidate_event_id: str
    issue_type: str
    severity: str
    timestamp: float | None
    best_evidence_frame: str | None
    reason: str
    recommended_action: str


class HumanFeedbackRead(BaseModel):
    id: str
    verdict: str
    correct_issue_type: str | None = None
    valid_issue: bool | None = None
    notes: str = ""
    created_by_name: str
    created_at: datetime


class CandidateEventRead(BaseModel):
    event_id: str
    first_timestamp: float
    last_timestamp: float
    center_timestamp: float
    issue_type_guess: str
    max_confidence: float
    average_confidence: float
    frame_count: int
    description: str
    ai_output: dict[str, Any] | None = None
    human_feedback: list[HumanFeedbackRead] = []


class DatasetFeedbackRead(BaseModel):
    id: str
    job_id: str
    input_file: str
    event_id: str
    event_type_guess: str
    event_timestamp: float
    detector_confidence: float
    ai_output: dict[str, Any] | None = None
    verdict: str
    correct_issue_type: str | None = None
    valid_issue: bool | None = None
    notes: str = ""
    created_by_name: str
    created_at: datetime


class ManualSegmentLabelRead(BaseModel):
    id: str
    job_id: str
    input_file: str | None = None
    start_timestamp: float
    end_timestamp: float
    label: str
    training_target: str
    notes: str = ""
    created_by_name: str
    created_at: datetime


class ReviewSessionRead(BaseModel):
    id: str
    job_id: str
    status: str
    reviewer_user_id: str
    reviewer_name: str
    reviewer_email: str
    notes: str = ""
    created_at: datetime
    updated_at: datetime


class SegmentAnnotationRead(BaseModel):
    id: str
    job_id: str
    review_session_id: str
    start_timestamp: float
    end_timestamp: float
    label: str
    temporal_scope: str
    training_target: str
    region: dict[str, Any] | None = None
    llm_output: dict[str, Any] | None = None
    human_reason: str = ""
    created_by_name: str
    created_at: datetime


class FrameAIQuestionRead(BaseModel):
    id: str
    job_id: str
    review_session_id: str
    timestamp: float
    start_timestamp: float | None = None
    end_timestamp: float | None = None
    question: str
    region: dict[str, Any] | None = None
    ai_output: dict[str, Any] | None = None
    human_label: str | None = None
    human_reason: str = ""
    training_target: str
    created_by_name: str
    created_at: datetime


class AnnotationConsensusRead(BaseModel):
    label: str
    reviewer_count: int
    annotation_count: int
    first_timestamp: float
    last_timestamp: float


class TrainingDatasetVersionRead(BaseModel):
    id: str
    dataset_id: str
    version_name: str
    description: str = ""
    focus_label: str | None = None
    work_start_timestamp: float | None = None
    work_end_timestamp: float | None = None
    status: str
    entry_count: int = 0
    created_by_name: str
    created_at: datetime


class TrainingDatasetRead(BaseModel):
    id: str
    name: str
    description: str = ""
    visibility: str
    owner_user_id: str
    owner_name: str
    status: str
    version_count: int = 0
    entry_count: int = 0
    created_at: datetime
    updated_at: datetime
    versions: list[TrainingDatasetVersionRead] = []


class TrainingDatasetEntryRead(BaseModel):
    id: str
    dataset_id: str
    dataset_version_id: str
    job_id: str
    review_session_id: str | None = None
    source_type: str
    source_id: str
    label: str
    start_timestamp: float | None = None
    end_timestamp: float | None = None
    training_target: str
    payload: dict[str, Any] | None = None
    created_by_name: str
    created_at: datetime


class TrainingDatasetChatMessageRead(BaseModel):
    id: str
    dataset_id: str
    dataset_version_id: str
    job_id: str | None = None
    review_session_id: str | None = None
    role: str
    content: str
    sanitized: dict[str, Any] | None = None
    saved_entry_id: str | None = None
    created_by_name: str
    created_at: datetime


class ReportRead(BaseModel):
    job_id: str
    input_file: str
    status: str
    created_at: datetime
    completed_at: datetime | None
    summary: Summary
    candidate_events: list[CandidateEventRead] = []
    issues: list[IssueRead] = []
    manual_segments: list[ManualSegmentLabelRead] = []
    review_sessions: list[ReviewSessionRead] = []
    segment_annotations: list[SegmentAnnotationRead] = []
    frame_ai_questions: list[FrameAIQuestionRead] = []
    annotation_consensus: list[AnnotationConsensusRead] = []
    raw: dict[str, Any] = {}


class JobListItem(BaseModel):
    id: str
    original_filename: str
    status: str
    created_by_name: str
    created_at: datetime
    completed_at: datetime | None
    summary: Summary | None = None


class AnalyzeResponse(BaseModel):
    job_id: str
    status: str
    report: ReportRead | None = None
