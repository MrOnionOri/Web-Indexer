from app.core.models import CandidateEventData


class Decision:
    def __init__(self, action: str, should_create_issue: bool = False, needs_human_review: bool = False):
        self.action = action
        self.should_create_issue = should_create_issue
        self.needs_human_review = needs_human_review


def decide(detector_event: CandidateEventData, llm_result: dict) -> Decision:
    if detector_event.max_confidence < 0.35:
        return Decision("ignore")
    if llm_result.get("issue_type") == "UNKNOWN":
        return Decision("needs_human_review", needs_human_review=True)
    if llm_result.get("verified") is True and llm_result.get("severity") in {"medium", "high", "critical"}:
        return Decision("create_issue", should_create_issue=True)
    if llm_result.get("verified") is True and llm_result.get("severity") == "low":
        return Decision("save_for_review")
    if llm_result.get("verified") is False:
        return Decision("ignore")
    return Decision("needs_human_review", needs_human_review=True)
