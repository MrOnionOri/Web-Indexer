from dataclasses import dataclass, field


@dataclass
class FrameSample:
    path: str
    timestamp: float
    brightness: float | None = None
    diff_score: float | None = None
    pixelation_score: float | None = None


@dataclass
class CandidateEventData:
    event_id: str
    first_timestamp: float
    last_timestamp: float
    center_timestamp: float
    issue_type_guess: str
    max_confidence: float
    average_confidence: float
    frame_count: int
    description: str
    regions: list[dict] = field(default_factory=list)
