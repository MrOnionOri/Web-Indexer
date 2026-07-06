import json
from datetime import datetime
from pathlib import Path

from app.api.schemas.responses import CandidateEventRead, HumanFeedbackRead, IssueRead, ManualSegmentLabelRead, ReportRead, Summary
from app.config import REPORT_DIR
from app.storage.models import CandidateEvent, FinalIssue, HumanFeedback, LLMVerification, ManualSegmentLabel, VideoWatcherJob


def parse_raw_json(value: str | None) -> dict | None:
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return {"raw": value}


def build_report(
    job: VideoWatcherJob,
    candidates: list[CandidateEvent],
    issues: list[FinalIssue],
    false_positives: int = 0,
    needs_human_review: int = 0,
    verifications: list[LLMVerification] | None = None,
    feedback_items: list[HumanFeedback] | None = None,
    manual_segments: list[ManualSegmentLabel] | None = None,
) -> ReportRead:
    verification_by_event = {
        verification.candidate_event_id: verification
        for verification in (verifications or [])
    }
    feedback_by_event: dict[str, list[HumanFeedback]] = {}
    for feedback in feedback_items or []:
        feedback_by_event.setdefault(feedback.candidate_event_id, []).append(feedback)
    summary = Summary(
        total_candidate_events=len(candidates),
        verified_issues=len(issues),
        false_positives=false_positives,
        needs_human_review=needs_human_review,
    )
    return ReportRead(
        job_id=job.id,
        input_file=job.original_filename,
        status=job.status,
        created_at=job.created_at,
        completed_at=job.completed_at,
        summary=summary,
        candidate_events=[
            CandidateEventRead(
                event_id=event.id,
                first_timestamp=event.first_timestamp,
                last_timestamp=event.last_timestamp,
                center_timestamp=event.center_timestamp,
                issue_type_guess=event.issue_type_guess,
                max_confidence=event.max_confidence,
                average_confidence=event.average_confidence,
                frame_count=event.frame_count,
                description=event.description,
                ai_output=parse_raw_json(verification_by_event.get(event.id).raw_response_json) if verification_by_event.get(event.id) else None,
                human_feedback=[
                    HumanFeedbackRead(
                        id=feedback.id,
                        verdict=feedback.verdict,
                        correct_issue_type=feedback.correct_issue_type,
                        valid_issue=feedback.valid_issue,
                        notes=feedback.notes,
                        created_by_name=feedback.created_by_name,
                        created_at=feedback.created_at,
                    )
                    for feedback in feedback_by_event.get(event.id, [])
                ],
            )
            for event in candidates
        ],
        issues=[
            IssueRead(
                issue_id=issue.id,
                candidate_event_id=issue.candidate_event_id,
                issue_type=issue.issue_type,
                severity=issue.severity,
                timestamp=issue.timestamp,
                best_evidence_frame=issue.evidence_frame_path,
                reason=issue.description,
                recommended_action="create_issue",
            )
            for issue in issues
        ],
        manual_segments=[
            ManualSegmentLabelRead(
                id=segment.id,
                job_id=segment.job_id,
                input_file=job.original_filename,
                start_timestamp=segment.start_timestamp,
                end_timestamp=segment.end_timestamp,
                label=segment.label,
                training_target=segment.training_target,
                notes=segment.notes,
                created_by_name=segment.created_by_name,
                created_at=segment.created_at,
            )
            for segment in (manual_segments or [])
        ],
    )


def save_report(report: ReportRead) -> Path:
    report_dir = REPORT_DIR / report.job_id
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "report.json"
    report_path.write_text(json.dumps(report.model_dump(mode="json"), indent=2), encoding="utf-8")
    return report_path


def load_report(job_id: str) -> dict | None:
    report_path = REPORT_DIR / job_id / "report.json"
    if not report_path.is_file():
        return None
    return json.loads(report_path.read_text(encoding="utf-8"))
