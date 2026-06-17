from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.crypto import decrypt_text, encrypt_text
from app.db.session import get_db
from app.models import AuditLog, FeedbackInternalNote, FeedbackItem, User
from app.schemas import (
    FeedbackInternalNoteCreateRequest,
    FeedbackRead,
    FeedbackRespondRequest,
    FeedbackStatusUpdateRequest,
)

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.get("", response_model=list[FeedbackRead])
def list_feedback(actor: User = Depends(require_permission("feedback:view")), db: Session = Depends(get_db)):
    items = db.scalars(select(FeedbackItem).order_by(FeedbackItem.created_at.desc())).all()
    can_view_internal = has_feedback_internal_permission(db, actor)
    return [serialize_feedback(db, item, can_view_internal) for item in items]


@router.post("/{feedback_id}/respond", response_model=FeedbackRead)
def respond_feedback(
    feedback_id: str,
    payload: FeedbackRespondRequest,
    actor: User = Depends(require_permission("feedback:respond")),
    db: Session = Depends(get_db),
):
    item = db.get(FeedbackItem, feedback_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    item.public_response = encrypt_text(payload.public_response)
    item.status = payload.status
    item.responded_by_user_id = actor.id
    item.responded_by_name = actor.full_name
    item.responded_at = datetime.utcnow()

    db.add(AuditLog(actor_user_id=actor.id, action="feedback.responded", target_type="feedback", target_id=item.id))
    db.commit()
    db.refresh(item)
    return serialize_feedback(db, item, has_feedback_internal_permission(db, actor))


@router.patch("/{feedback_id}/status", response_model=FeedbackRead)
def update_feedback_status(
    feedback_id: str,
    payload: FeedbackStatusUpdateRequest,
    actor: User = Depends(require_permission("feedback:respond")),
    db: Session = Depends(get_db),
):
    item = db.get(FeedbackItem, feedback_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    item.status = payload.status
    db.add(AuditLog(actor_user_id=actor.id, action="feedback.status_updated", target_type="feedback", target_id=item.id))
    db.commit()
    db.refresh(item)
    return serialize_feedback(db, item, has_feedback_internal_permission(db, actor))


@router.post("/{feedback_id}/internal-notes", response_model=FeedbackRead)
def create_internal_note(
    feedback_id: str,
    payload: FeedbackInternalNoteCreateRequest,
    actor: User = Depends(require_permission("feedback:internal")),
    db: Session = Depends(get_db),
):
    item = db.get(FeedbackItem, feedback_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    db.add(
        FeedbackInternalNote(
            feedback_id=item.id,
            author_user_id=actor.id,
            author_name=actor.full_name,
            note=encrypt_text(payload.note),
        )
    )
    db.add(AuditLog(actor_user_id=actor.id, action="feedback.internal_note_created", target_type="feedback", target_id=item.id))
    db.commit()
    db.refresh(item)
    return serialize_feedback(db, item, True)


def serialize_feedback(db: Session, item: FeedbackItem, include_internal_notes: bool) -> FeedbackRead:
    notes = []
    if include_internal_notes:
        raw_notes = db.scalars(
            select(FeedbackInternalNote)
            .where(FeedbackInternalNote.feedback_id == item.id)
            .order_by(FeedbackInternalNote.created_at.asc())
        ).all()
        notes = [
            {
                "id": note.id,
                "feedback_id": note.feedback_id,
                "author_user_id": note.author_user_id,
                "author_name": note.author_name,
                "note": decrypt_text(note.note),
                "created_at": note.created_at,
            }
            for note in raw_notes
        ]

    return FeedbackRead(
        id=item.id,
        source_app=item.source_app,
        title=item.title,
        message=decrypt_text(item.message),
        status=item.status,
        page_id=item.page_id,
        page_title=item.page_title,
        space_key=item.space_key,
        created_by_user_id=item.created_by_user_id,
        created_by_name=item.created_by_name,
        created_by_email=item.created_by_email,
        public_response=decrypt_text(item.public_response),
        responded_by_user_id=item.responded_by_user_id,
        responded_by_name=item.responded_by_name,
        responded_at=item.responded_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        internal_notes=notes,
    )


def has_feedback_internal_permission(db: Session, user: User) -> bool:
    from app.services.permissions import has_permission

    return has_permission(db, user, "feedback:internal")
