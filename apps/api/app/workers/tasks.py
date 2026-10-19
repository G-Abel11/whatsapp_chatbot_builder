"""arq worker tasks."""

from __future__ import annotations

import logging
from typing import Any

from ..db import SessionLocal
from ..engine import build_client, resend_message, resume_conversation
from ..services import build_delivery, process_event

logger = logging.getLogger(__name__)


def _pool(ctx: dict[str, Any]) -> Any:
    return ctx.get("redis")


async def process_webhook_event(ctx: dict[str, Any], event: dict[str, Any]) -> None:
    """Process a flattened inbound webhook event."""
    await process_event(event, pool=_pool(ctx))


async def resume_conversation_job(ctx: dict[str, Any], conversation_id: int) -> None:
    """Continue a conversation after a Delay node."""
    async with SessionLocal() as session:
        async with build_client() as client:
            await resume_conversation(
                session,
                conversation_id=conversation_id,
                delivery=build_delivery(client, _pool(ctx)),
            )


async def retry_send_job(ctx: dict[str, Any], message_id: int) -> None:
    """Retry a failed outbound send."""
    async with SessionLocal() as session:
        async with build_client() as client:
            await resend_message(
                session,
                message_id=message_id,
                delivery=build_delivery(client, _pool(ctx)),
            )
