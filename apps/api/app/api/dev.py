"""Developer helpers — simulate an inbound WhatsApp message without Meta.

Enabled outside production so the whole pipeline (webhook → engine → send →
persistence) can be exercised locally in one synchronous call.
"""

from __future__ import annotations

import time
from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..db import SessionLocal
from ..models import Contact, Conversation, Message
from ..schemas import ConversationRead, MessageRead
from ..services import process_event

router = APIRouter(prefix="/dev", tags=["dev"])


class DevInbound(BaseModel):
    text: str
    sender: str = Field(default="254700000000", alias="from")
    phone_number_id: str | None = None
    name: str | None = "Dev Tester"
    type: str = "text"

    model_config = {"populate_by_name": True}


class DevInboundResult(BaseModel):
    ok: bool
    conversation: ConversationRead | None = None
    messages: list[MessageRead] = Field(default_factory=list)


@router.post("/messages", response_model=DevInboundResult)
async def send_dev_message(body: DevInbound, request: Request) -> DevInboundResult:
    message_id = f"dev_{uuid4().hex}"
    payload: dict[str, object] = {
        "id": message_id,
        "from": body.sender,
        "timestamp": str(int(time.time())),
        "type": body.type,
    }
    if body.type == "text":
        payload["text"] = {"body": body.text}
    elif body.type == "interactive":
        payload["interactive"] = {
            "type": "button_reply",
            "button_reply": {"id": body.text, "title": body.text},
        }

    event = {
        "kind": "message",
        "event_key": f"dev:{message_id}",
        "phone_number_id": body.phone_number_id,
        "contact_name": body.name,
        "message": payload,
    }

    pool = getattr(request.app.state, "arq", None)
    # Process inline so the caller gets the resulting conversation synchronously.
    await process_event(event, pool=pool)

    async with SessionLocal() as session:
        contact = (
            await session.execute(select(Contact).where(Contact.wa_id == body.sender).limit(1))
        ).scalar_one_or_none()
        if contact is None:
            return DevInboundResult(ok=False)
        conversation = (
            await session.execute(
                select(Conversation)
                .where(Conversation.contact_id == contact.id)
                .order_by(Conversation.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if conversation is None:
            return DevInboundResult(ok=False)

        rows = (
            await session.execute(
                select(Message)
                .where(Message.conversation_id == conversation.id)
                .order_by(Message.id)
            )
        ).scalars().all()

    return DevInboundResult(
        ok=True,
        conversation=ConversationRead.model_validate(conversation),
        messages=[MessageRead.model_validate(row) for row in rows],
    )
