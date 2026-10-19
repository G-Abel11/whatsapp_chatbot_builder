"""Full-pipeline test on in-memory SQLite (runs anywhere, no Postgres needed).

`tests/test_integration.py` additionally covers the Postgres/JSONB path when a
database is reachable.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from app.engine import Delivery, SendResult, handle_inbound
from app.models import Contact, Conversation
from app.schemas import InboundMessage
from app.seed import DEMO_PHONE_NUMBER_ID, demo_flow


@pytest_asyncio.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add(demo_flow())
        await session.commit()

    yield factory
    await engine.dispose()


class Capture:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []
        self.tokens: list[str | None] = []

    async def __call__(
        self, phone_number_id: str, to: str, outbound, access_token: str | None = None
    ) -> SendResult:
        self.sent.append((outbound.kind, outbound.body or ""))
        self.tokens.append(access_token)
        return SendResult(ok=True, wa_message_id=f"wamid_{uuid.uuid4().hex}")

    def bodies(self) -> list[str]:
        return [body for _kind, body in self.sent]


def _text(sender: str, body: str) -> InboundMessage:
    return InboundMessage.model_validate(
        {
            "id": f"wamid_{uuid.uuid4().hex}",
            "from": sender,
            "type": "text",
            "timestamp": "1700000000",
            "text": {"body": body},
        }
    )


def _interactive(sender: str, choice_id: str, title: str) -> InboundMessage:
    return InboundMessage.model_validate(
        {
            "id": f"wamid_{uuid.uuid4().hex}",
            "from": sender,
            "type": "interactive",
            "timestamp": "1700000001",
            "interactive": {
                "type": "button_reply",
                "button_reply": {"id": choice_id, "title": title},
            },
        }
    )


async def _latest_conversation(
    factory: async_sessionmaker[AsyncSession], wa_id: str
) -> Conversation:
    async with factory() as session:
        contact = (
            await session.execute(select(Contact).where(Contact.wa_id == wa_id))
        ).scalar_one()
        return (
            await session.execute(
                select(Conversation)
                .where(Conversation.contact_id == contact.id)
                .order_by(Conversation.id.desc())
                .limit(1)
            )
        ).scalar_one()


async def test_name_capture_menu_choice_and_close(session_factory) -> None:
    capture = Capture()
    delivery = Delivery(sender=capture)
    sender = "254700000101"

    # 1. Greeting → asks for a name.
    async with session_factory() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_text(sender, "hi"),
            delivery=delivery,
        )
    assert any("name" in body.lower() for body in capture.bodies())

    # 2. The reply is captured and echoed back in the greeting.
    async with session_factory() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_text(sender, "Ada"),
            delivery=delivery,
        )
    assert any("Ada" in body for body in capture.bodies())

    conversation = await _latest_conversation(session_factory, sender)
    assert conversation.variables.get("name") == "Ada"
    assert conversation.awaiting_kind == "options"

    # 3. Choosing an option continues the flow and reuses the captured name.
    async with session_factory() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_interactive(sender, "opt_pricing", "Pricing"),
            delivery=delivery,
        )
    assert any("Thanks Ada" in body for body in capture.bodies())

    conversation = await _latest_conversation(session_factory, sender)
    # The flow ends on Close Chat with "clear conversation state", which wipes
    # every captured variable — including the choice made moments earlier.
    assert conversation.status == "closed"
    assert conversation.variables == {}


async def test_keyword_trigger_hands_off_and_pauses_the_bot(session_factory) -> None:
    capture = Capture()
    delivery = Delivery(sender=capture)
    sender = "254700000202"

    async with session_factory() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_text(sender, "I need to speak to an agent"),
            delivery=delivery,
        )
    assert any("specialist" in body for body in capture.bodies())

    conversation = await _latest_conversation(session_factory, sender)
    assert conversation.status == "handed_off"

    # A handed-off conversation ignores ordinary messages.
    before = len(capture.bodies())
    async with session_factory() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_text(sender, "hello?"),
            delivery=delivery,
        )
    assert len(capture.bodies()) == before


async def test_duplicate_inbound_message_is_ignored(session_factory) -> None:
    capture = Capture()
    delivery = Delivery(sender=capture)
    sender = "254700000303"
    message = _text(sender, "hi")

    async with session_factory() as session:
        await handle_inbound(
            session, phone_number_id=DEMO_PHONE_NUMBER_ID, message=message, delivery=delivery
        )
    first_count = len(capture.bodies())

    async with session_factory() as session:
        await handle_inbound(
            session, phone_number_id=DEMO_PHONE_NUMBER_ID, message=message, delivery=delivery
        )
    assert len(capture.bodies()) == first_count
