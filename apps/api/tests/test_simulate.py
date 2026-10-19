"""The preview endpoint must behave exactly like the production send path.

Every test here runs the *real* runner through HTTP (`POST /flows/{id}/simulate`)
against an in-memory database, so a regression in interpolation, validation,
branching or terminal nodes shows up as a preview that no longer matches what a
customer would receive.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

import httpx
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from app.db import get_session
from app.engine import Delivery, SendResult, handle_inbound
from app.main import app
from app.models import Flow
from app.schemas import InboundMessage
from app.seed import DEMO_FLOW_ID, DEMO_PHONE_NUMBER_ID, demo_flow

SIMULATE = f"/flows/{DEMO_FLOW_ID}/simulate"


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


def _bot_texts(payload: dict[str, Any]) -> list[str]:
    return [str(m.get("text") or "") for m in payload["messages"] if m["role"] == "bot"]


def _system_rows(payload: dict[str, Any]) -> list[str]:
    return [str(m.get("text") or "") for m in payload["messages"] if m["role"] == "system"]


def _node(node_id: str, kind: str, config: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": "opes",
        "position": {"x": 0, "y": 0},
        "data": {"kind": kind, "label": kind, "config": config},
    }


def _edge(edge_id: str, source: str, target: str, handle: str | None = None) -> dict[str, Any]:
    edge: dict[str, Any] = {"id": edge_id, "source": source, "target": target, "type": "opes"}
    if handle:
        edge["sourceHandle"] = handle
    return edge


async def _create_flow(client: httpx.AsyncClient, nodes: list[dict], edges: list[dict]) -> str:
    response = await client.post(
        "/flows",
        json={
            "title": "Simulate test",
            "status": "draft",
            "graph": {"nodes": nodes, "edges": edges},
        },
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _simulate(
    client: httpx.AsyncClient, flow_id: str = DEMO_FLOW_ID, **body: Any
) -> dict[str, Any]:
    response = await client.post(f"/flows/{flow_id}/simulate", json=body)
    assert response.status_code == 200, response.text
    return dict(response.json())


async def _walk_demo(client: httpx.AsyncClient, actions: list[dict[str, Any]]) -> list[dict]:
    """Run the demo flow from the top through `actions`, returning each turn."""
    turns: list[dict] = []
    turn = await _simulate(client)
    turns.append(turn)
    state = turn["state"]
    for action in actions:
        turn = await _simulate(client, state=state, action=action)
        turns.append(turn)
        state = turn["state"]
    return turns


# ── Conversation behaviour ──────────────────────────────────────────────────


async def test_start_sends_the_greeting_and_waits_for_a_reply(client) -> None:
    payload = await _simulate(client)

    assert "Welcome to OpesChatbot" in _bot_texts(payload)[0]
    assert payload["ended"] is False
    assert payload["pending"]["type"] == "input"
    assert payload["pending"]["node_id"] == "seed_ask_name"
    assert "name" in payload["pending"]["placeholder"].lower()
    assert payload["state"]["awaiting_kind"] == "input"
    # The wire uses snake_case, exactly like the rest of the API.
    assert payload["messages"][0]["node_id"] == "seed_greet"
    assert payload["messages"][0]["type"] == "text"


async def test_typed_answer_is_interpolated_downstream(client) -> None:
    """The headline claim: what you type reaches the next message for real."""
    first = await _simulate(client)
    second = await _simulate(
        client,
        state=first["state"],
        action={"type": "input", "text": "Ada"},
    )

    assert any("Nice to meet you, Ada" in text for text in _bot_texts(second))
    assert second["state"]["variables"]["name"] == "Ada"
    assert second["pending"]["type"] == "options"
    assert [option["id"] for option in second["pending"]["options"]] == [
        "opt_pricing",
        "opt_order",
        "opt_agent",
    ]
    assert [option["label"] for option in second["pending"]["options"]] == [
        "Pricing",
        "Track an order",
        "Talk to an agent",
    ]


async def test_menu_choice_continues_and_close_ends_the_walk(client) -> None:
    first, second = await _walk_demo(client, [{"type": "input", "text": "Ada"}])
    third = await _simulate(
        client,
        state=second["state"],
        action={"type": "choice", "id": "opt_pricing", "label": "Pricing"},
    )

    texts = _bot_texts(third)
    assert any("Thanks Ada" in text for text in texts)
    assert any("Bye for now" in text for text in texts)
    assert any("Conversation closed" in row for row in _system_rows(third))
    assert third["ended"] is True
    assert third["status"] == "closed"
    assert third["pending"] is None
    # Close Chat clears the session, exactly as production does.
    assert third["state"]["variables"] == {}
    assert first["state"] != second["state"]


async def test_keyword_trigger_enters_at_the_trigger_and_hands_off(client) -> None:
    payload = await _simulate(client, text="agent")

    assert any("specialist" in text for text in _bot_texts(payload))
    assert any("Handed off" in row for row in _system_rows(payload))
    assert payload["status"] == "handed_off"
    assert payload["ended"] is True
    assert payload["pending"] is None


async def test_empty_reply_leaves_the_question_pending(client) -> None:
    """WhatsApp never delivers an empty body, so nothing should advance."""
    first = await _simulate(client)
    nudge = await _simulate(client, state=first["state"], action={"type": "input", "text": "  "})

    assert nudge["messages"] == []
    assert nudge["pending"]["node_id"] == "seed_ask_name"
    assert nudge["ended"] is False


# ── Validation, branching, delays ───────────────────────────────────────────


async def test_invalid_answer_is_rejected_and_reasked(client) -> None:
    flow_id = await _create_flow(
        client,
        nodes=[
            _node(
                "ask",
                "ask_question",
                {
                    "question": "Your email?",
                    "inputType": "email",
                    "variable": "customer_email",
                    "retryMessage": "Try again with a real email address.",
                },
            ),
            _node("done", "send_text", {"text": "Thanks {{customer_email}}!"}),
        ],
        edges=[_edge("e1", "ask", "done")],
    )

    start = await _simulate(client, flow_id)
    retry = await _simulate(
        client, flow_id, state=start["state"], action={"type": "input", "text": "not-an-email"}
    )
    assert any("expected email" in row for row in _system_rows(retry))
    assert any("Try again" in text for text in _bot_texts(retry))
    assert retry["pending"]["type"] == "input"
    assert "customer_email" not in retry["state"]["variables"]

    ok = await _simulate(
        client, flow_id, state=retry["state"], action={"type": "input", "text": "ada@example.com"}
    )
    assert any("Thanks ada@example.com!" in text for text in _bot_texts(ok))
    assert ok["state"]["variables"]["customer_email"] == "ada@example.com"


async def test_condition_decides_without_asking_the_customer(client) -> None:
    flow_id = await _create_flow(
        client,
        nodes=[
            _node("ask", "ask_question", {"question": "Score?", "variable": "score"}),
            _node(
                "cond",
                "condition",
                {"variable": "score", "operator": "greater_than", "value": "50"},
            ),
            _node("high", "send_text", {"text": "High value"}),
            _node("low", "send_text", {"text": "Standard"}),
        ],
        edges=[
            _edge("e1", "ask", "cond"),
            _edge("e2", "cond", "high", "true"),
            _edge("e3", "cond", "low", "false"),
        ],
    )

    start = await _simulate(client, flow_id)
    result = await _simulate(
        client, flow_id, state=start["state"], action={"type": "input", "text": "80"}
    )

    rows = _system_rows(result)
    texts = _bot_texts(result)
    assert any("Condition · score greater than 50 → True" in row for row in rows), rows
    assert any("High value" in text for text in texts), texts
    # No branch chips: the engine decided on its own.
    assert result["pending"] is None
    assert result["ended"] is True


async def test_menu_routes_each_button_by_its_own_edge(client) -> None:
    """End to end: each option id is the handle its edge was wired from."""
    flow_id = await _create_flow(
        client,
        nodes=[
            _node(
                "menu",
                "interactive_options",
                {
                    "mode": "buttons",
                    "body": "How can we help?",
                    "items": [
                        {"id": "opt_pricing", "label": "Pricing"},
                        {"id": "opt_support", "label": "Support"},
                    ],
                },
            ),
            _node("pricing_path", "send_text", {"text": "Our pricing page"}),
            _node("support_path", "send_text", {"text": "Opening a ticket"}),
            _node("default_path", "send_text", {"text": "Default path"}),
        ],
        edges=[
            _edge("e_pricing", "menu", "pricing_path", "opt_pricing"),
            _edge("e_support", "menu", "support_path", "opt_support"),
            _edge("e_default", "menu", "default_path", "out"),
        ],
    )

    first = await _simulate(client, flow_id)
    assert first["pending"]["type"] == "options"
    assert [option["id"] for option in first["pending"]["options"]] == [
        "opt_pricing",
        "opt_support",
    ]

    pricing = await _simulate(
        client,
        flow_id,
        state=first["state"],
        action={"type": "choice", "id": "opt_pricing", "label": "Pricing"},
    )
    assert _bot_texts(pricing) == ["Our pricing page"]

    support = await _simulate(
        client,
        flow_id,
        state=first["state"],
        action={"type": "choice", "id": "opt_support", "label": "Support"},
    )
    assert _bot_texts(support) == ["Opening a ticket"]

    # An option with no edge of its own follows the Default ("out") edge.
    unwired = await _simulate(
        client,
        flow_id,
        state=first["state"],
        action={"type": "choice", "id": "opt_other", "label": "Something else"},
    )
    assert _bot_texts(unwired) == ["Default path"]


async def test_delay_is_annotated_and_skipped_in_a_single_turn(client) -> None:
    flow_id = await _create_flow(
        client,
        nodes=[
            _node("first", "send_text", {"text": "First"}),
            _node("wait", "delay", {"amount": 10, "unit": "minutes"}),
            _node("second", "send_text", {"text": "Second"}),
        ],
        edges=[_edge("e1", "first", "wait"), _edge("e2", "wait", "second")],
    )

    payload = await _simulate(client, flow_id)

    assert _bot_texts(payload) == ["First", "Second"]
    assert any("Wait 10 minutes" in row for row in _system_rows(payload))
    assert any("skipped in preview" in row for row in _system_rows(payload))
    assert payload["ended"] is True


# ── Safety: a preview must have no side effects ─────────────────────────────


async def test_webhook_node_never_calls_out(client, monkeypatch) -> None:
    """The handler builds a client per call — constructing one must not happen."""
    calls: list[Any] = []

    def guard(self, *args, **kwargs):  # noqa: ARG001
        calls.append(kwargs)
        raise AssertionError("a preview must not make HTTP calls")

    monkeypatch.setattr(httpx.AsyncClient, "__init__", guard)

    flow_id = await _create_flow(
        client,
        nodes=[
            _node("greet", "send_text", {"text": "Hi"}),
            _node("hook", "webhook", {"method": "POST", "url": "https://example.com/hook"}),
            _node("after", "send_text", {"text": "Done"}),
        ],
        edges=[_edge("e1", "greet", "hook"), _edge("e2", "hook", "after")],
    )

    payload = await _simulate(client, flow_id)

    assert calls == [], "the preview issued an HTTP request"
    assert any("skipped in preview" in row for row in _system_rows(payload))
    assert _bot_texts(payload) == ["Hi", "Done"]


async def test_simulation_writes_nothing_to_the_database(client, session_factory) -> None:
    async with session_factory() as session:
        before = await session.get(Flow, DEMO_FLOW_ID)
        snapshot = (before.version, before.updated_at, before.status)

    for _ in range(3):
        await _simulate(client)

    async with session_factory() as session:
        after = await session.get(Flow, DEMO_FLOW_ID)
        assert (after.version, after.updated_at, after.status) == snapshot


async def test_unknown_flow_is_not_found(client) -> None:
    response = await client.post("/flows/flow_does_not_exist/simulate", json={})
    assert response.status_code == 404
    assert response.json()["detail"] == "Flow not found"


# ── Parity with the production send path ────────────────────────────────────


class _Capture:
    def __init__(self) -> None:
        self.bodies: list[str] = []

    async def __call__(
        self, phone_number_id: str, to: str, outbound, access_token: str | None = None
    ) -> SendResult:
        self.bodies.append(outbound.body or "")
        return SendResult(ok=True, wa_message_id=f"wamid_{uuid4().hex}")


def _inbound(sender: str, body: str) -> InboundMessage:
    return InboundMessage.model_validate(
        {
            "id": f"wamid_{uuid4().hex}",
            "from": sender,
            "type": "text",
            "timestamp": "1700000000",
            "text": {"body": body},
        }
    )


def _inbound_choice(sender: str, choice_id: str, title: str) -> InboundMessage:
    return InboundMessage.model_validate(
        {
            "id": f"wamid_{uuid4().hex}",
            "from": sender,
            "type": "interactive",
            "timestamp": "1700000001",
            "interactive": {
                "type": "button_reply",
                "button_reply": {"id": choice_id, "title": title},
            },
        }
    )


async def test_preview_matches_the_production_send_path(client, session_factory) -> None:
    """The same conversation through the webhook and through the preview."""
    capture = _Capture()
    delivery = Delivery(sender=capture)

    # 1. What production sends.
    for message in (_inbound("254700000909", "hi"), _inbound("254700000909", "Ada")):
        async with session_factory() as session:
            await handle_inbound(
                session,
                phone_number_id=DEMO_PHONE_NUMBER_ID,
                message=message,
                delivery=delivery,
            )
    async with session_factory() as session:
        await handle_inbound(
            session,
            phone_number_id=DEMO_PHONE_NUMBER_ID,
            message=_inbound_choice("254700000909", "opt_pricing", "Pricing"),
            delivery=delivery,
        )

    # 2. What the preview sends, for the same three gestures.
    preview: list[str] = []
    state: dict[str, Any] | None = None
    for action in (
        None,
        {"type": "input", "text": "Ada"},
        {"type": "choice", "id": "opt_pricing", "label": "Pricing"},
    ):
        body: dict[str, Any] = {"state": state}
        if action is not None:
            body["action"] = action
        turn = await _simulate(client, **body)
        preview.extend(_bot_texts(turn))
        state = turn["state"]

    assert preview == capture.bodies, (
        "the preview and the send path disagree\n"
        f"  preview:    {preview}\n"
        f"  production: {capture.bodies}"
    )
