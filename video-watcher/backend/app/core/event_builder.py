from app.config import LIGHT_DETECTOR_GROUPING_WINDOW_SECONDS
from app.core.models import CandidateEventData


def group_events(events: list[CandidateEventData]) -> list[CandidateEventData]:
    if not events:
        return []
    ordered = sorted(events, key=lambda item: (item.issue_type_guess, item.center_timestamp))
    grouped: list[CandidateEventData] = []
    current = ordered[0]

    for event in ordered[1:]:
        same_type = event.issue_type_guess == current.issue_type_guess
        nearby = event.first_timestamp - current.last_timestamp <= LIGHT_DETECTOR_GROUPING_WINDOW_SECONDS
        if same_type and nearby:
            total_frames = current.frame_count + event.frame_count
            current.last_timestamp = max(current.last_timestamp, event.last_timestamp)
            current.center_timestamp = (current.first_timestamp + current.last_timestamp) / 2
            current.max_confidence = max(current.max_confidence, event.max_confidence)
            current.average_confidence = (
                (current.average_confidence * current.frame_count) + (event.average_confidence * event.frame_count)
            ) / total_frames
            current.frame_count = total_frames
            current.description = current.description or event.description
            current.regions.extend(event.regions)
        else:
            grouped.append(current)
            current = event

    grouped.append(current)
    return grouped
