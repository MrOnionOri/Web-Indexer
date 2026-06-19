import json
import uuid
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.core.crypto import decrypt_text, encrypt_text
from app.core.security import ACCESS_COOKIE_NAME, decode_token
from app.db.session import SessionLocal, get_db
from app.models import ChatConversation, ChatMessage, ChatParticipant, User, UserStatus
from app.schemas import ChatMessageCreateRequest, ChatMessageRead, ChatUserRead, SupportConversationCreateRequest, SupportConversationRead
from app.services.permissions import has_permission

router = APIRouter(prefix="/chat", tags=["support-chat"])


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections[user_id].add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        self.connections[user_id].discard(websocket)
        if not self.connections[user_id]:
            self.connections.pop(user_id, None)

    async def notify(self, user_ids: list[str], payload: dict) -> None:
        message = json.dumps(payload)
        stale = []
        for user_id in set(user_ids):
            for websocket in list(self.connections.get(user_id, set())):
                try:
                    await websocket.send_text(message)
                except Exception:
                    stale.append((user_id, websocket))
        for user_id, websocket in stale:
            self.disconnect(user_id, websocket)

    async def broadcast(self, payload: dict) -> None:
        await self.notify(list(self.connections), payload)


manager = ConnectionManager()


def as_user(user: User | None) -> ChatUserRead | None:
    return ChatUserRead(id=user.id, full_name=user.full_name, email=user.email) if user else None


def support_or_404(db: Session, conversation_id: str) -> ChatConversation:
    conversation = db.get(ChatConversation, conversation_id)
    if not conversation or not conversation.requester_user_id:
        raise HTTPException(status_code=404, detail="Chat de soporte no encontrado")
    return conversation


def get_participant(db: Session, conversation_id: str, user_id: str) -> ChatParticipant | None:
    return db.scalar(select(ChatParticipant).where(ChatParticipant.conversation_id == conversation_id, ChatParticipant.user_id == user_id))


def message_read(db: Session, message: ChatMessage) -> ChatMessageRead:
    sender = db.get(User, message.sender_user_id)
    return ChatMessageRead(id=message.id, conversation_id=message.conversation_id, sender_user_id=message.sender_user_id,
                           sender_name=sender.full_name if sender else "Usuario", body=decrypt_text(message.body), created_at=message.created_at)


def conversation_read(db: Session, conversation: ChatConversation, viewer: User) -> SupportConversationRead:
    last = db.scalar(select(ChatMessage).where(ChatMessage.conversation_id == conversation.id).order_by(ChatMessage.created_at.desc()).limit(1))
    own = get_participant(db, conversation.id, viewer.id)
    unread = 0
    if own:
        query = select(func.count(ChatMessage.id)).where(ChatMessage.conversation_id == conversation.id, ChatMessage.sender_user_id != viewer.id)
        if own.last_read_at:
            query = query.where(ChatMessage.created_at > own.last_read_at)
        unread = int(db.scalar(query) or 0)
    return SupportConversationRead(
        id=conversation.id, source_app=conversation.source_app, status=conversation.status,
        requester=as_user(db.get(User, conversation.requester_user_id)),
        claimed_by=as_user(db.get(User, conversation.claimed_by_user_id)) if conversation.claimed_by_user_id else None,
        last_message=decrypt_text(last.body) if last else "", last_message_at=last.created_at if last else conversation.created_at,
        unread_count=unread, created_at=conversation.created_at, claimed_at=conversation.claimed_at, closed_at=conversation.closed_at,
    )


def ensure_view(conversation: ChatConversation, user: User, db: Session) -> None:
    if conversation.requester_user_id != user.id and not has_permission(db, user, "feedback:respond"):
        raise HTTPException(status_code=404, detail="Chat de soporte no encontrado")


@router.post("/support", response_model=SupportConversationRead)
async def create_support(payload: SupportConversationCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.scalar(select(ChatConversation).where(ChatConversation.requester_user_id == user.id,
        ChatConversation.source_app == payload.source_app, ChatConversation.status.in_(["open", "claimed"])).order_by(ChatConversation.created_at.desc()))
    if existing:
        return conversation_read(db, existing, user)
    now = datetime.utcnow()
    conversation = ChatConversation(direct_key=f"support:{uuid.uuid4()}", requester_user_id=user.id, source_app=payload.source_app, status="open")
    db.add(conversation)
    db.flush()
    db.add(ChatParticipant(conversation_id=conversation.id, user_id=user.id, last_read_at=now))
    db.add(ChatMessage(conversation_id=conversation.id, sender_user_id=user.id, body=encrypt_text(payload.message.strip()), created_at=now))
    db.commit()
    db.refresh(conversation)
    await manager.broadcast({"type": "queue_changed", "conversation_id": conversation.id})
    return conversation_read(db, conversation, user)


@router.get("/support/current", response_model=SupportConversationRead | None)
def current_support(source_app: str = Query(min_length=2, max_length=80), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = db.scalar(select(ChatConversation).where(ChatConversation.requester_user_id == user.id,
        ChatConversation.source_app == source_app, ChatConversation.status.in_(["open", "claimed"])).order_by(ChatConversation.created_at.desc()))
    return conversation_read(db, conversation, user) if conversation else None


@router.get("/support/admin/queue", response_model=list[SupportConversationRead])
def support_queue(scope: str = Query(default="open", pattern="^(open|mine|closed|all)$"), db: Session = Depends(get_db),
                  agent: User = Depends(require_permission("feedback:respond"))):
    query = select(ChatConversation).where(ChatConversation.requester_user_id.is_not(None))
    if scope == "open": query = query.where(ChatConversation.status == "open")
    elif scope == "mine": query = query.where(ChatConversation.status == "claimed", ChatConversation.claimed_by_user_id == agent.id)
    elif scope == "closed": query = query.where(ChatConversation.status == "closed", ChatConversation.claimed_by_user_id == agent.id)
    items = db.scalars(query.order_by(ChatConversation.updated_at.desc())).all()
    return [conversation_read(db, item, agent) for item in items]


@router.post("/support/{conversation_id}/claim", response_model=SupportConversationRead)
async def claim_support(conversation_id: str, db: Session = Depends(get_db), agent: User = Depends(require_permission("feedback:respond"))):
    now = datetime.utcnow()
    result = db.execute(update(ChatConversation).where(ChatConversation.id == conversation_id, ChatConversation.requester_user_id.is_not(None),
        ChatConversation.status == "open", ChatConversation.claimed_by_user_id.is_(None)).values(status="claimed", claimed_by_user_id=agent.id, claimed_at=now, updated_at=now))
    if result.rowcount != 1:
        db.rollback()
        current = support_or_404(db, conversation_id)
        if current.claimed_by_user_id != agent.id:
            raise HTTPException(status_code=409, detail="Otro administrador ya tomo este chat")
    else:
        if not get_participant(db, conversation_id, agent.id):
            db.add(ChatParticipant(conversation_id=conversation_id, user_id=agent.id, last_read_at=now))
        db.commit()
    conversation = support_or_404(db, conversation_id)
    await manager.broadcast({"type": "claimed", "conversation_id": conversation_id})
    return conversation_read(db, conversation, agent)


@router.get("/support/{conversation_id}/messages", response_model=list[ChatMessageRead])
def list_messages(conversation_id: str, limit: int = Query(default=150, ge=1, le=300), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = support_or_404(db, conversation_id)
    ensure_view(conversation, user, db)
    messages = db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == conversation_id).order_by(ChatMessage.created_at.desc()).limit(limit)).all()
    return [message_read(db, item) for item in reversed(messages)]


@router.post("/support/{conversation_id}/messages", response_model=ChatMessageRead)
async def send_message(conversation_id: str, payload: ChatMessageCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = support_or_404(db, conversation_id)
    if conversation.status == "closed": raise HTTPException(status_code=409, detail="Este chat ya fue finalizado")
    if user.id not in {conversation.requester_user_id, conversation.claimed_by_user_id}:
        raise HTTPException(status_code=403, detail="Toma el chat antes de responder")
    message = ChatMessage(conversation_id=conversation_id, sender_user_id=user.id, body=encrypt_text(payload.body.strip()))
    conversation.updated_at = datetime.utcnow()
    db.add(message)
    db.commit()
    db.refresh(message)
    recipients = [conversation.requester_user_id] + ([conversation.claimed_by_user_id] if conversation.claimed_by_user_id else [])
    await manager.notify(recipients, {"type": "message", "conversation_id": conversation_id})
    if not conversation.claimed_by_user_id: await manager.broadcast({"type": "queue_changed", "conversation_id": conversation_id})
    return message_read(db, message)


@router.post("/support/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(conversation_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = support_or_404(db, conversation_id)
    ensure_view(conversation, user, db)
    own = get_participant(db, conversation_id, user.id)
    if own:
        own.last_read_at = datetime.utcnow()
        db.commit()


@router.post("/support/{conversation_id}/close", response_model=SupportConversationRead)
async def close_support(conversation_id: str, db: Session = Depends(get_db), agent: User = Depends(require_permission("feedback:respond"))):
    conversation = support_or_404(db, conversation_id)
    if conversation.claimed_by_user_id != agent.id:
        raise HTTPException(status_code=403, detail="Solo quien tomo el chat puede finalizarlo")
    if conversation.status != "closed":
        conversation.status, conversation.closed_at = "closed", datetime.utcnow()
        conversation.updated_at = conversation.closed_at
        db.commit()
    await manager.broadcast({"type": "closed", "conversation_id": conversation_id})
    return conversation_read(db, conversation, agent)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.cookies.get(ACCESS_COOKIE_NAME) or websocket.query_params.get("token")
    payload = decode_token(token) if token else None
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4401); return
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.id == payload.get("sub"), User.status == UserStatus.approved))
        if not user: await websocket.close(code=4403); return
        await manager.connect(user.id, websocket)
        try:
            while True: await websocket.receive_text()
        except WebSocketDisconnect: manager.disconnect(user.id, websocket)
    finally: db.close()
