import uuid

from app.core.models import CandidateEventData, FrameSample


class LightweightDetector:
    def detect(self, frames: list[FrameSample]) -> list[CandidateEventData]:
        events: list[CandidateEventData] = []
        if not frames:
            return events

        dark_frames = [frame for frame in frames if frame.brightness is not None and frame.brightness < 12]
        if len(dark_frames) >= max(2, int(len(frames) * 0.25)):
            events.append(
                CandidateEventData(
                    event_id=f"evt_{uuid.uuid4().hex[:10]}",
                    first_timestamp=dark_frames[0].timestamp,
                    last_timestamp=dark_frames[-1].timestamp,
                    center_timestamp=(dark_frames[0].timestamp + dark_frames[-1].timestamp) / 2,
                    issue_type_guess="BLACK_SCREEN",
                    max_confidence=0.92,
                    average_confidence=0.82,
                    frame_count=len(dark_frames),
                    description="Multiple sampled frames are almost completely black.",
                )
            )

        pixelated_frames = [
            frame
            for frame in frames
            if frame.pixelation_score is not None and frame.pixelation_score > 0.085 and (frame.brightness or 0) > 18
        ]
        if len(pixelated_frames) >= max(2, int(len(frames) * 0.12)):
            events.append(
                CandidateEventData(
                    event_id=f"evt_{uuid.uuid4().hex[:10]}",
                    first_timestamp=pixelated_frames[0].timestamp,
                    last_timestamp=pixelated_frames[-1].timestamp,
                    center_timestamp=(pixelated_frames[0].timestamp + pixelated_frames[-1].timestamp) / 2,
                    issue_type_guess="PIXELATION",
                    max_confidence=0.74,
                    average_confidence=0.66,
                    frame_count=len(pixelated_frames),
                    description="Sampled frames show blocky compression artifacts or heavy pixelation.",
                )
            )

        return events
