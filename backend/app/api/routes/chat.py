import json
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.crypto import decrypt_text, encrypt_text
from app.core.security import ACCESS_COOKIE_NAME, decode_token
from app.db.session import SessionLocal, get_db
from app.models import ChatConversation, ChatMessage, ChatParticipant, User, UserStatus
from app.schemas import (
    ChatConversationCreateRequest,
    ChatConversationRead,
    ChatMessageCreateRequest,
    ChatMessageRead,
    ChatUserRead,
)

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatConnectionManager:
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
        stale: list[tuple[str, WebSocket]] = []
        for user_id in set(user_ids):
            for websocket in list(self.connections.get(user_id, set())):
                try:
                    await websocket.send_text(message)
                except Exception:
                    stale.append((user_id, websocket))
        for user_id, websocket in stale:
            self.disconnect(user_id, websocket)


manager = ChatConnectionManager()


def participant_or_404(db: Session, conversation_id: str, user_id: str) -> ChatParticipant:
    participant = db.scalar(
        select(ChatParticipant).where(
            ChatParticipant.conversation_id == conversation_id,
            ChatParticipant.user_id == user_id,
        )
    )
    if not participant:
        raise HTTPException(status_code=404, detail="Conversacion no encontrada")
    return participant


def conversation_user_ids(db: Session, conversation_id: str) -> list[str]:
    return list(db.scalars(select(ChatParticipant.user_id).where(ChatParticipant.conversation_id == conversation_id)))


def serialize_message(db: Session, message: ChatMessage) -> ChatMessageRead:
    sender = db.get(User, message.sender_user_id)
    return ChatMessageRead(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_user_id=message.sender_user_id,
        sender_name=sender.full_name if sender else "Usuario",
        body=decrypt_text(message.body),
        created_at=message.created_at,
    )


def serialize_conversation(db: Session, conversation: ChatConversation, user: User) -> ChatConversationRead:
    other_participant = db.scalar(
        select(ChatParticipant).where(
            ChatParticipant.conversation_id == conversation.id,
            ChatParticipant.user_id != user.id,
        )
    )
    other_user = db.get(User, other_participant.user_id) if other_participant else user
    own_participant = participant_or_404(db, conversation.id, user.id)
    last_message = db.scalar(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    unread_query = select(func.count(ChatMessage.id)).where(
        ChatMessage.conversation_id == conversation.id,
        ChatMessage.sender_user_id != user.id,
    )
    if own_participant.last_read_at:
        unread_query = unread_query.where(ChatMessage.created_at > own_participant.last_read_at)
    unread_count = int(db.scalar(unread_query) or 0)
    return ChatConversationRead(
        id=conversation.id,
        other_user=ChatUserRead(id=other_user.id, full_name=other_user.full_name, email=other_user.email),
        last_message=decrypt_text(last_message.body) if last_message else "",
        last_message_at=last_message.created_at if last_message else conversation.created_at,
        unread_count=unread_count,
    )


@router.get("/users", response_model=list[ChatUserRead])
def list_chat_users(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    users = db.scalars(
        select(User)
        .where(User.status == UserStatus.approved, User.id != user.id)
        .order_by(User.full_name.asc())
    ).all()
    return [ChatUserRead(id=item.id, full_name=item.full_name, email=item.email) for item in users]


@router.get("/conversations", response_model=list[ChatConversationRead])
def list_conversations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conversation_ids = select(ChatParticipant.conversation_id).where(ChatParticipant.user_id == user.id)
    conversations = db.scalars(
        select(ChatConversation)
        .where(ChatConversation.id.in_(conversation_ids))
        .order_by(ChatConversation.updated_at.desc())
    ).all()
    return [serialize_conversation(db, conversation, user) for conversation in conversations]


@router.post("/conversations", response_model=ChatConversationRead)
async def create_conversation(
    payload: ChatConversationCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.user_id == user.id:
        raise HTTPException(status_code=400, detail="No puedes iniciar una conversacion contigo mismo")
    other_user = db.scalar(select(User).where(User.id == payload.user_id, User.status == UserStatus.approved))
    if not other_user:
        raise HTTPException(status_code=404, detail="Usuario no disponible")
    direct_key = ":".join(sorted([user.id, other_user.id]))
    conversation = db.scalar(select(ChatConversation).where(ChatConversation.direct_key == direct_key))
    if not conversation:
        conversation = ChatConversation(direct_key=direct_key)
        db.add(conversation)
        try:
            db.flush()
            db.add_all([
                ChatParticipant(conversation_id=conversation.id, user_id=user.id),
                ChatParticipant(conversation_id=conversation.id, user_id=other_user.id),
            ])
            db.commit()
        except IntegrityError:
            db.rollback()
            conversation = db.scalar(select(ChatConversation).where(ChatConversation.direct_key == direct_key))
    await manager.notify([user.id, other_user.id], {"type": "conversation", "conversation_id": conversation.id})
    return serialize_conversation(db, conversation, user)


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageRead])
def list_messages(
    conversation_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    participant_or_404(db, conversation_id, user.id)
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    ).all()
    return [serialize_message(db, message) for message in reversed(messages)]


@router.post("/conversations/{conversation_id}/messages", response_model=ChatMessageRead)
async def send_message(
    conversation_id: str,
    payload: ChatMessageCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    participant_or_404(db, conversation_id, user.id)
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Escribe un mensaje")
    message = ChatMessage(conversation_id=conversation_id, sender_user_id=user.id, body=encrypt_text(body))
    conversation = db.get(ChatConversation, conversation_id)
    db.add(message)
    conversation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(message)
    recipients = conversation_user_ids(db, conversation_id)
    await manager.notify(recipients, {"type": "message", "conversation_id": conversation_id, "message_id": message.id})
    return serialize_message(db, message)


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_conversation_read(
    conversation_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    participant = participant_or_404(db, conversation_id, user.id)
    participant.last_read_at = datetime.utcnow()
    db.commit()
    await manager.notify(conversation_user_ids(db, conversation_id), {"type": "read", "conversation_id": conversation_id, "user_id": user.id})


@router.websocket("/ws")
async def chat_websocket(websocket: WebSocket):
    token = websocket.cookies.get(ACCESS_COOKIE_NAME) or websocket.query_params.get("token")
    payload = decode_token(token) if token else None
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4401)
        return
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.id == payload.get("sub"), User.status == UserStatus.approved))
        if not user:
            await websocket.close(code=4403)
            return
        await manager.connect(user.id, websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect(user.id, websocket)
    finally:
        db.close()
