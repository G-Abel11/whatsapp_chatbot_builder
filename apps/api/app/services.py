"""Service layer: turn raw webhook events into engine runs.

Both the arq worker and the inline dev path call into here, so the behaviour is
identical whether a queue is running or not.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import SessionLocal
from .engine import Delivery, build_client, handle_inbound
from .models import Message, WebhookEvent, utcnow
from .schemas import InboundMessage, StatusEntry

logger = logging.getLogger(__name__)

# arq job names (must match app/workers/tasks.py)
JOB_RESUME = "resume_conversation_job"
JOB_RETRY_SEND = "retry_send_job"


def build_delivery(client: Any, pool: Any) -> Delivery:
    """Wire the engine's outbound sender and schedulers to arq (when available)."""

    async def resume(conversation_id: int, delay: float) -> None:
        if pool is not None:
            await pool.enqueue_job(JOB_RESUME, conversation_id, _defer_by=delay)

    async def retry_send(message_id: int, delay: float) -> None:
        if pool is not None:
            await pool.enqueue_job(JOB_RETRY_SEND, message_id, _defer_by=delay)

    return Delivery(sender=client.send, resume=resume, retry_send=retry_send)


async def apply_status(session: AsyncSession, status: StatusEntry) -> None:
    """Update an outbound message from a delivery/read/failed status callback."""
    result = await session.execute(
        select(Message).where(Message.wa_message_id == status.id).limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return
    if status.status in {"sent", "delivered", "read", "failed"}:
        row.status = status.status
    if status.errors:
        first = status.errors[0]
        row.error = first.message or first.title or "send failed"
    row.updated_at = utcnow()
    await session.commit()


async def process_event(event: dict[str, Any], *, pool: Any = None) -> None:
    """Handle one flattened webhook event (message or status), idempotently."""
    event_key: str | None = event.get("event_key")
    kind = str(event.get("kind") or "unknown")
    record: WebhookEvent | None = None

    async with SessionLocal() as session:
        if event_key:
            duplicate = await session.execute(
                select(WebhookEvent.id).where(WebhookEvent.event_key == event_key).limit(1)
            )
            if duplicate.first() is not None:
                logger.info("webhook event %s already processed", event_key)
                return
            record = WebhookEvent(event_key=event_key, kind=kind, payload=event)
            session.add(record)
            await session.flush()

        try:
            async with build_client() as client:
                delivery = build_delivery(client, pool)
                if kind == "message":
                    message = InboundMessage.model_validate(event["message"])
                    await handle_inbound(
                        session,
                        phone_number_id=event.get("phone_number_id"),
                        message=message,
                        contact_name=event.get("contact_name"),
                        delivery=delivery,
                    )
                elif kind == "status":
                    await apply_status(session, StatusEntry.model_validate(event["status"]))
        except Exception:
            await session.rollback()
            logger.exception("failed to process webhook event %s", event_key)
            raise

        if record is not None:
            record.processed = True
        await session.commit()
