"""A demo flow, seeded on first run so the service is usable immediately.

The graph is stored in exactly the shape the builder persists (React Flow):
`{"nodes": [...], "edges": [...], "viewport": {...}}`. It deliberately mirrors
the scenario "ask for a name, then greet the customer with it".
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from .models import Flow

DEMO_FLOW_ID = "flow_demo"
DEMO_PHONE_NUMBER_ID = "100000000000001"


def _node(
    node_id: str,
    kind: str,
    x: int,
    y: int,
    config: dict[str, Any] | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": "opes",
        "position": {"x": x, "y": y},
        "data": {"kind": kind, "label": label or kind, "config": config or {}},
    }


def _edge(
    edge_id: str,
    source: str,
    target: str,
    source_handle: str | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    edge: dict[str, Any] = {"id": edge_id, "source": source, "target": target, "type": "opes"}
    if source_handle:
        edge["sourceHandle"] = source_handle
    if label:
        edge["data"] = {"label": label}
    return edge


def demo_graph() -> dict[str, Any]:
    return {
        "nodes": [
            _node(
                "seed_greet",
                "send_text",
                0,
                0,
                {"text": "Hi there 👋 Welcome to OpesChatbot."},
                "Greeting",
            ),
            _node(
                "seed_ask_name",
                "ask_question",
                340,
                0,
                {
                    "question": "Before we start — what's your name?",
                    "inputType": "text",
                    "variable": "name",
                    "retryMessage": "Sorry, I didn't catch that. What's your name?",
                },
                "Ask name",
            ),
            _node(
                "seed_hello",
                "send_text",
                680,
                0,
                {"text": "Nice to meet you, {{name}}! 🙌 How can I help today?"},
                "Personal greeting",
            ),
            _node(
                "seed_menu",
                "interactive_options",
                1020,
                0,
                {
                    "mode": "buttons",
                    "body": "Pick an option to get started",
                    "items": [
                        {"id": "opt_pricing", "label": "Pricing"},
                        {"id": "opt_order", "label": "Track an order"},
                        {"id": "opt_agent", "label": "Talk to an agent"},
                    ],
                    "footer": "",
                },
                "Main menu",
            ),
            _node(
                "seed_ack",
                "send_text",
                1360,
                0,
                {"text": "Thanks {{name}} — our team will get back to you shortly."},
                "Acknowledgement",
            ),
            _node(
                "seed_close",
                "close_chat",
                1700,
                0,
                {"message": "Glad I could help. Bye for now! 👋", "clearSession": True},
                "Close chat",
            ),
            _node(
                "seed_keyword",
                "global_keyword",
                1020,
                320,
                {
                    "keywords": ["agent", "human", "help"],
                    "matchType": "contains",
                    "caseSensitive": False,
                },
                "Keyword trigger",
            ),
            _node(
                "seed_handoff",
                "human_takeover",
                1360,
                320,
                {
                    "team": "Sales",
                    "message": "Connecting you to a specialist now…",
                    "priority": "high",
                },
                "Human takeover",
            ),
        ],
        "edges": [
            _edge("seed_e1", "seed_greet", "seed_ask_name"),
            _edge("seed_e2", "seed_ask_name", "seed_hello"),
            _edge("seed_e3", "seed_hello", "seed_menu"),
            _edge("seed_e4", "seed_menu", "seed_ack"),
            _edge("seed_e5", "seed_ack", "seed_close"),
            _edge("seed_e6", "seed_keyword", "seed_handoff"),
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 0.85},
    }


def demo_flow() -> Flow:
    return Flow(
        id=DEMO_FLOW_ID,
        tenant_id="tenant_default",
        title="OpesChatbot Demo",
        status="live",
        phone_number_id=DEMO_PHONE_NUMBER_ID,
        graph=demo_graph(),
        version=1,
    )


async def ensure_seed(session: AsyncSession) -> Flow | None:
    """Insert the demo flow once. Returns the flow, or None if it already existed."""
    existing = await session.get(Flow, DEMO_FLOW_ID)
    if existing is not None:
        return None
    flow = demo_flow()
    session.add(flow)
    await session.commit()
    return flow
