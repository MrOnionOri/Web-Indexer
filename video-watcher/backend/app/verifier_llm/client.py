from app.core.models import CandidateEventData


class VisionVerifierClient:
    def verify(self, frames: list[str], detector_event: CandidateEventData, project_context: str = "") -> dict:
        raise NotImplementedError


class MockVisionVerifierClient(VisionVerifierClient):
    def verify(self, frames: list[str], detector_event: CandidateEventData, project_context: str = "") -> dict:
        if detector_event.issue_type_guess == "BLACK_SCREEN":
            return {
                "verified": True,
                "issue_type": "BLACK_SCREEN",
                "severity": "critical",
                "timestamp_confirmed": detector_event.center_timestamp,
                "best_evidence_frame": frames[0] if frames else None,
                "is_temporal_issue": True,
                "reason": "Detector found sustained near-black frames. Mock verifier keeps this as a blocking visual issue.",
                "recommended_action": "create_issue",
                "feedback_for_detector": {"accept_detection": True, "new_confidence": 0.9, "notes": "Black screen rule was accepted."},
            }
        if detector_event.issue_type_guess == "PIXELATION":
            return {
                "verified": True,
                "issue_type": "PIXELATION",
                "severity": "medium",
                "timestamp_confirmed": detector_event.center_timestamp,
                "best_evidence_frame": frames[0] if frames else None,
                "is_temporal_issue": False,
                "reason": "Detector found blocky compression artifacts that look like pixelation. Mock verifier accepts it for review.",
                "recommended_action": "create_issue",
                "feedback_for_detector": {"accept_detection": True, "new_confidence": 0.74, "notes": "Pixelation rule was accepted by mock verifier."},
            }
        return {
            "verified": False,
            "issue_type": "NO_ISSUE",
            "severity": "none",
            "timestamp_confirmed": None,
            "best_evidence_frame": None,
            "is_temporal_issue": False,
            "reason": "Mock verifier requires a real vision provider for this visual-change candidate.",
            "recommended_action": "ignore",
            "feedback_for_detector": {"accept_detection": False, "new_confidence": 0.18, "notes": "Needs LLM vision verification."},
        }


def build_verifier() -> VisionVerifierClient:
    return MockVisionVerifierClient()
