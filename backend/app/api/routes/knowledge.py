from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.db.session import get_db
from app.models import AuditLog, KnowledgePage, KnowledgeSpace, User, WikiPageStatus
from app.schemas import (
    KnowledgePageCreateRequest,
    KnowledgePageRead,
    KnowledgePageUpdateRequest,
    KnowledgeSpaceCreateRequest,
    KnowledgeSpaceRead,
)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("/spaces", response_model=list[KnowledgeSpaceRead])
def list_spaces(_: User = Depends(require_permission("knowledge:view")), db: Session = Depends(get_db)):
    return db.scalars(select(KnowledgeSpace).order_by(KnowledgeSpace.name)).all()


@router.post("/spaces", response_model=KnowledgeSpaceRead, status_code=status.HTTP_201_CREATED)
def create_space(
    payload: KnowledgeSpaceCreateRequest,
    actor: User = Depends(require_permission("knowledge:create")),
    db: Session = Depends(get_db),
):
    if db.scalar(select(KnowledgeSpace).where(KnowledgeSpace.slug == payload.slug)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Knowledge space slug already exists")

    space = KnowledgeSpace(**payload.model_dump(), owner_user_id=actor.id)
    db.add(space)
    db.flush()
    db.add(AuditLog(actor_user_id=actor.id, action="knowledge.space_created", target_type="knowledge_space", target_id=space.id))
    db.commit()
    db.refresh(space)
    return space


@router.get("/pages", response_model=list[KnowledgePageRead])
def list_pages(
    space_id: str | None = None,
    q: str | None = None,
    _: User = Depends(require_permission("knowledge:view")),
    db: Session = Depends(get_db),
):
    query = select(KnowledgePage).order_by(KnowledgePage.updated_at.desc())
    if space_id:
        query = query.where(KnowledgePage.space_id == space_id)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(
            or_(
                KnowledgePage.title.ilike(term),
                KnowledgePage.summary.ilike(term),
                KnowledgePage.content.ilike(term),
            )
        )
    return db.scalars(query).all()


@router.post("/pages", response_model=KnowledgePageRead, status_code=status.HTTP_201_CREATED)
def create_page(
    payload: KnowledgePageCreateRequest,
    actor: User = Depends(require_permission("knowledge:create")),
    db: Session = Depends(get_db),
):
    if not db.get(KnowledgeSpace, payload.space_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge space not found")
    if payload.status == WikiPageStatus.published:
        require_publish_permission(actor, db)
    ensure_unique_page_slug(db, payload.space_id, payload.slug)

    page = KnowledgePage(**payload.model_dump(), created_by_user_id=actor.id, updated_by_user_id=actor.id)
    db.add(page)
    db.flush()
    db.add(AuditLog(actor_user_id=actor.id, action="knowledge.page_created", target_type="knowledge_page", target_id=page.id))
    db.commit()
    db.refresh(page)
    return page


@router.patch("/pages/{page_id}", response_model=KnowledgePageRead)
def update_page(
    page_id: str,
    payload: KnowledgePageUpdateRequest,
    actor: User = Depends(require_permission("knowledge:edit")),
    db: Session = Depends(get_db),
):
    page = db.get(KnowledgePage, page_id)
    if not page:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge page not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] in {WikiPageStatus.published, WikiPageStatus.archived}:
        require_publish_permission(actor, db)
    if "slug" in update_data and update_data["slug"] != page.slug:
        ensure_unique_page_slug(db, page.space_id, update_data["slug"], page.id)

    for key, value in update_data.items():
        setattr(page, key, value)
    page.updated_by_user_id = actor.id

    db.add(AuditLog(actor_user_id=actor.id, action="knowledge.page_updated", target_type="knowledge_page", target_id=page.id))
    db.commit()
    db.refresh(page)
    return page


def ensure_unique_page_slug(db: Session, space_id: str, slug: str, current_page_id: str | None = None) -> None:
    query = select(KnowledgePage).where(KnowledgePage.space_id == space_id, KnowledgePage.slug == slug)
    if current_page_id:
        query = query.where(KnowledgePage.id != current_page_id)
    if db.scalar(query):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Page slug already exists in this space")


def require_publish_permission(actor: User, db: Session) -> None:
    from app.services.permissions import has_permission

    if not has_permission(db, actor, "knowledge:publish"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing publish permission")
