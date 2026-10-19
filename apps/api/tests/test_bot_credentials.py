"""Per-bot Meta credentials: every flow can send with its own access token.

Resolution order is per-bot token → server-wide WHATSAPP_ACCESS_TOKEN →
logged dry run. The raw token is write-only: the management API masks it to
`has_access_token` and never echoes it back.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

import httpx
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from app.core.config import Settings
from app.db import get_session
from app.engine import Delivery, SendResult, handle_inbound, resend_message
from app.engine.outcome import Outbound
from app.engine.whatsapp import WhatsAppClient
from app.main import app
from app.models import Flow, Message
from app.schemas import InboundMessage
from app.seed import DEMO_PHONE_NUMBER_ID, demo_flow

FLOW_TOKEN = "EAA-flow-bot-token"
GLOBAL_TOKEN = "EAA-server-wide-token"


# ── Fixtures ────────────────────────────────────────────────────────────────


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


@pytest_asyncio.fixture
async def client(session_factory) -> AsyncIterator[httpx.AsyncClient]:
    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client
    app.dependency_overrides.pop(get_session, None)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _text(sender: str, body: str) -> InboundMessage:
    return InboundMessage.model_validate(
        {
            "id": f"wamid_{uuid4().hex}",
            "from": sender,
            "type": "text",
            "timestamp": "1700000000",
            "text": {"body": body},
        }
    )


class Capture:
    def __init__(self, ok: bool = True) -> None:
        self.ok = ok
        self.tokens: list[str | None] = []

    async def __call__(
        self, phone_number_id: str, to: str, outbound, access_token: str | None = None
    ) -> SendResult:
        self.tokens.append(access_token)
        if not self.ok:
            return SendResult(ok=False, error="simulated Meta outage")
        return SendResult(ok=True, wa_message_id=f"wamid_{uuid4().hex}")


def _settings(token: str | None) -> Settings:
    return Settings(whatsapp_access_token=token or "")


def _mock_client(seen: list[str | None], status: int = 200) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("Authorization"))
        return httpx.Response(status, json={"messages": [{"id": "wamid.ack"}]})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def _flow_token_of(
    factory: async_sessionmaker[AsyncSession], token: str | None
) -> None:
    async with factory() as session:
        flow = (await session.execute(select(Flow))).scalars().first()
        flow.access_token = token
        await session.commit()


# ── API: the token is write-only ────────────────────────────────────────────


async def test_create_flow_masks_the_token(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/flows",
        json={"id": f"flow_{uuid4().hex[:8]}", "title": "Token bot", "access_token": FLOW_TOKEN},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["has_access_token"] is True
    assert "access_token" not in body
    assert FLOW_TOKEN not in response.text

    detail = await client.get(f"/flows/{body['id']}")
    assert detail.status_code == 200
    assert detail.json()["has_access_token"] is True
    assert FLOW_TOKEN not in detail.text

    listing = await client.get("/flows")
    masked = next(f for f in listing.json() if f["id"] == body["id"])
    assert masked["has_access_token"] is True
    assert FLOW_TOKEN not in listing.text


async def test_update_sets_clears_and_preserves_the_token(
    session_factory: async_sessionmaker[AsyncSession], client: httpx.AsyncClient
) -> None:
    async with session_factory() as session:
        flow_id = (await session.execute(select(Flow))).scalars().first().id

    # Set.
    set_response = await client.put(f"/flows/{flow_id}", json={"access_token": FLOW_TOKEN})
    assert set_response.json()["has_access_token"] is True
    assert FLOW_TOKEN not in set_response.text

    # Unchanged (field omitted / null) — still set.
    unchanged = await client.put(f"/flows/{flow_id}", json={"title": "Renamed"})
    assert unchanged.json()["has_access_token"] is True

    # Blank clears it (revert to the server-wide default).
    cleared = await client.put(f"/flows/{flow_id}", json={"access_token": "   "})
    assert cleared.json()["has_access_token"] is False

    async with session_factory() as session:
        flow = await session.get(Flow, flow_id)
        assert flow.access_token is None
        assert flow.title == "Renamed"


# ── Client: per-bot token → global token → dry run ──────────────────────────


async def test_per_bot_token_wins_over_the_global_token() -> None:
    seen: list[str | None] = []
    client = WhatsAppClient(
        settings=_settings(GLOBAL_TOKEN), client=_mock_client(seen)
    )
    result = await client.send(
        "123", "254700000001", Outbound(kind="text", body="hi"), access_token=FLOW_TOKEN
    )
    assert result.ok
    assert seen == [f"Bearer {FLOW_TOKEN}"]


async def test_global_token_is_the_fallback() -> None:
    seen: list[str | None] = []
    client = WhatsAppClient(settings=_settings(GLOBAL_TOKEN), client=_mock_client(seen))
    result = await client.send(
        "123", "254700000001", Outbound(kind="text", body="hi"), access_token=None
    )
    assert result.ok
    assert seen == [f"Bearer {GLOBAL_TOKEN}"]


async def test_no_token_anywhere_degrades_to_dry_run() -> None:
    seen: list[str | None] = []
    client = WhatsAppClient(settings=_settings(None), client=_mock_client(seen))
    result = await client.send(
        "123", "254700000001", Outbound(kind="text", body="hi"), access_token=None
    )
    assert result.ok
    assert result.wa_message_id is not None
    assert result.wa_message_id.startswith("dryrun_")
    assert result.response == {"dry_run": True}
    assert seen == []  # nothing left the machine


async def test_placeholder_global_token_still_allows_per_bot_sends() -> None:
    seen: list[str | None] = []
    client = WhatsAppClient(settings=_settings("change-me-access-token"), client=_mock_client(seen))
    result = await client.send(
        "123", "254700000001", Outbound(kind="text", body="hi"), access_token=FLOW_TOKEN
    )
    assert result.ok
    assert seen == [f"Bearer {FLOW_TOKEN}"]


# ── Executor: the flow's token reaches the sender ───────────────────────────


async def test_inbound_sends_carry_the_flow_token(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _flow_token_of(session_factory, FLOW_TOKEN)
    capture = Capture()
    delivery = Delivery(sender=capture)

    async with session_factory() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_text("254711000222", "hi"),
            delivery=delivery,
        )

    assert capture.tokens, "expected at least one outbound send"
    assert all(token == FLOW_TOKEN for token in capture.tokens), capture.tokens


async def test_resend_retries_with_the_flow_token(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _flow_token_of(session_factory, FLOW_TOKEN)

    # First attempt fails (simulated Meta outage) → the message row is failed.
    failing = Delivery(sender=Capture(ok=False))
    async with session_factory() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_text("254733000444", "hi"),
            delivery=failing,
        )
        row = (
            await session.execute(
                select(Message)
                .where(Message.direction == "outbound", Message.status == "failed")
                .order_by(Message.id.desc())
                .limit(1)
            )
        ).scalars().first()
        assert row is not None

    # Retry succeeds and still authenticates with the flow's token.
    retry_capture = Capture()
    async with session_factory() as session:
        resent = await resend_message(
            session, message_id=row.id, delivery=Delivery(sender=retry_capture)
        )
    assert resent is not None and resent.status == "sent"
    assert retry_capture.tokens == [FLOW_TOKEN]
