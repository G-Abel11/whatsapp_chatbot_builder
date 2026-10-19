"""Integration test against a real Postgres.

Skipped automatically when the database is not reachable, so `pytest` still
passes on a machine without docker-compose running.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select, text

from app.db import SessionLocal, engine, init_db
from app.engine import Delivery, SendResult, handle_inbound
from app.models import Contact, Conversation, Flow
from app.schemas import InboundMessage
from app.seed import DEMO_FLOW_ID, DEMO_PHONE_NUMBER_ID, demo_flow


async def _db_ready() -> bool:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        return False
    return True


async def _reset_demo_flow() -> None:
    """Restore the demo row to its seeded shape.

    The demo flow lives in the shared dev database, where hands-on QA in the
    builder edits its graph, status and phone number. This test asserts the
    *seeded* behaviour, so it resets the row first — deliberately not via
    `ensure_seed`, which must never overwrite what a human has edited.
    """
    seeded = demo_flow()
    async with SessionLocal() as session:
        flow = await session.get(Flow, DEMO_FLOW_ID)
        if flow is None:
            session.add(seeded)
        else:
            flow.graph = seeded.graph
            flow.status = seeded.status
            flow.phone_number_id = seeded.phone_number_id
            flow.version = seeded.version
        await session.commit()


class Capture:
    def __init__(self) -> None:
        self.sent: list[str] = []
        self.tokens: list[str | None] = []

    async def __call__(
        self, phone_number_id: str, to: str, outbound, access_token: str | None = None
    ) -> SendResult:
        self.sent.append(outbound.body or "")
        self.tokens.append(access_token)
        return SendResult(ok=True, wa_message_id=f"wamid_{uuid.uuid4().hex}")


def _msg(sender: str, body: str) -> InboundMessage:
    return InboundMessage.model_validate(
        {
            "id": f"wamid_{uuid.uuid4().hex}",
            "from": sender,
            "type": "text",
            "timestamp": "1700000000",
            "text": {"body": body},
        }
    )


async def test_full_name_roundtrip() -> None:
    if not await _db_ready():
        pytest.skip("Postgres not reachable — start it with `docker compose up -d`")

    await init_db()
    await _reset_demo_flow()

    sender = f"2547{uuid.uuid4().int % 100_000_000:08d}"
    capture = Capture()
    delivery = Delivery(sender=capture)

    # 1. Customer says hi → the bot greets and asks for a name.
    async with SessionLocal() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_msg(sender, "hi"),
            delivery=delivery,
        )
    assert any("name" in body.lower() for body in capture.sent), capture.sent

    # 2. Customer replies with their name → the bot uses it in the greeting.
    async with SessionLocal() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_msg(sender, "Ada"),
            delivery=delivery,
        )
    assert any("Ada" in body for body in capture.sent), capture.sent

    # 3. The captured variable is persisted on the conversation.
    async with SessionLocal() as session:
        contact = (
            await session.execute(select(Contact).where(Contact.wa_id == sender))
        ).scalar_one()
        conversation = (
            await session.execute(
                select(Conversation)
                .where(Conversation.contact_id == contact.id)
                .order_by(Conversation.id.desc())
                .limit(1)
            )
        ).scalar_one()
    assert conversation.variables.get("name") == "Ada"
    assert conversation.awaiting_kind == "options"  # now waiting on the menu
