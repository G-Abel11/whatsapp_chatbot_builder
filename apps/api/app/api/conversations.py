"""Read-only views over conversations and contacts (debugging / monitoring)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Contact, Conversation, Message
from ..schemas import ContactRead, ConversationDetail, ConversationRead, MessageRead

router = APIRouter(tags=["conversations"])


@router.get("/conversations", response_model=list[ConversationRead])
async def list_conversations(
    limit: int = Query(default=50, ge=1, le=200),
    status: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[Conversation]:
    statement = select(Conversation).order_by(Conversation.updated_at.desc()).limit(limit)
    if status:
        statement = statement.where(Conversation.status == status)
    result = await session.execute(statement)
    return list(result.scalars().all())


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: int,
    session: AsyncSession = Depends(get_session),
) -> ConversationDetail:
    conversation = await session.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    result = await session.execute(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id)
    )
    messages = [MessageRead.model_validate(message) for message in result.scalars().all()]
    return ConversationDetail(
        **ConversationRead.model_validate(conversation).model_dump(),
        messages=messages,
    )


@router.get("/contacts", response_model=list[ContactRead])
async def list_contacts(
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
) -> list[Contact]:
    result = await session.execute(select(Contact).order_by(Contact.id.desc()).limit(limit))
    return list(result.scalars().all())
