"""Engine-backed simulation for the builder's phone preview.

`POST /flows/{flow_id}/simulate` runs the real Python runner against the
*saved* flow document and returns the messages a customer would receive, one
turn at a time. It is deliberately side-effect free:

  * nothing is sent — the runner returns payloads instead of calling Meta,
  * webhooks are dry-run (`Runner(dry_run=True)`),
  * delays are annotated and skipped rather than slept through,
  * no rows are written.

The client passes the `RunnerState` back each turn, so this endpoint holds no
session state of its own: several preview tabs can run at once, and there is
nothing to clean up.
"""

from __future__ import annotations

from dataclasses import asdict, fields
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..engine.graph import FlowNode, Graph
from ..engine.outcome import Outbound
from ..engine.runner import RunEvent, Runner, RunnerState, RunResult
from ..models import Flow
from ..schemas import (
    SimMessage,
    SimOption,
    SimPending,
    SimulateRequest,
    SimulateResponse,
)

router = APIRouter(prefix="/flows", tags=["simulation"])

# A graph whose delays point at each other would skip forever; cut it off and
# say so instead of hanging the request.
MAX_DELAY_SKIPS = 10

_STATE_FIELDS = {field.name for field in fields(RunnerState)}

_MENUS = ("buttons", "list")


def _new_id() -> str:
    return f"sim_{uuid4().hex[:10]}"


def _state_from(payload: dict[str, Any] | None) -> RunnerState:
    """Rebuild the walker's state, tolerating keys from a different version."""
    if not payload:
        return RunnerState()
    known = {key: value for key, value in payload.items() if key in _STATE_FIELDS}
    if not isinstance(known.get("variables"), dict):
        known.pop("variables", None)
    return RunnerState(**known)


# ── Outbound payloads → preview bubbles ─────────────────────────────────────


def _options_from_interactive(interactive: dict[str, Any]) -> list[SimOption]:
    """Read the option ids/titles straight off the payload sent to WhatsApp."""
    action = interactive.get("action") or {}
    buttons = [button for button in (action.get("buttons") or []) if isinstance(button, dict)]
    if buttons:
        return [
            SimOption(
                id=str((button.get("reply") or {}).get("id") or f"opt_{index + 1}"),
                label=str((button.get("reply") or {}).get("title") or f"Option {index + 1}"),
            )
            for index, button in enumerate(buttons)
        ]
    rows = [
        row
        for section in (action.get("sections") or [])
        if isinstance(section, dict)
        for row in (section.get("rows") or [])
        if isinstance(row, dict)
    ]
    return [
        SimOption(
            id=str(row.get("id") or f"opt_{index + 1}"),
            label=str(row.get("title") or f"Option {index + 1}"),
        )
        for index, row in enumerate(rows)
    ]


def _outbound_message(outbound: Outbound) -> SimMessage:
    """Turn one outbound into the row the phone simulator renders.

    Everything is derived from the Cloud API payload (what Meta would receive)
    rather than re-read from the node config, so the preview cannot drift from
    the send path.
    """
    payload = outbound.payload or {}
    base = {"id": _new_id(), "role": "bot", "node_id": outbound.node_id}
    kind = outbound.kind

    if kind == "media":
        media_type = str(payload.get("type") or "image")
        media = payload.get(media_type) or {}
        return SimMessage(
            **base,
            type="media",
            media_type=media_type,
            media_url=media.get("link"),
            caption=media.get("caption") or outbound.body,
        )

    if kind == "template":
        template = payload.get("template") or {}
        language = (template.get("language") or {}).get("code") or "en_US"
        return SimMessage(
            **base,
            type="template",
            template_name=str(template.get("name") or ""),
            language=str(language),
        )

    if kind == "interactive":
        interactive = payload.get("interactive") or {}
        mode = str(interactive.get("type") or "button")
        action = interactive.get("action") or {}
        if mode == "cta_url":
            parameters = action.get("parameters") or {}
            return SimMessage(
                **base,
                type="webview",
                text=str((interactive.get("body") or {}).get("text") or outbound.body or ""),
                media_url=parameters.get("url"),
            )
        options = _options_from_interactive(interactive)
        return SimMessage(
            **base,
            type="list" if mode == "list" else "buttons",
            text=str((interactive.get("body") or {}).get("text") or outbound.body or ""),
            footer=(interactive.get("footer") or {}).get("text"),
            options=options,
        )

    return SimMessage(**base, type="text", text=outbound.body or "")


def _event_message(event: RunEvent) -> SimMessage:
    return SimMessage(
        id=_new_id(),
        role="system",
        type="system",
        node_id=event.node_id,
        text=event.text,
    )


def _merge(outputs: list[Outbound], events: list[RunEvent]) -> list[SimMessage]:
    """Interleave sent messages with the decisions between them, in walk order."""
    merged: list[SimMessage] = []
    cursor = 0
    for event in events:
        stop = min(max(event.output_index, cursor), len(outputs))
        merged.extend(_outbound_message(outbound) for outbound in outputs[cursor:stop])
        cursor = stop
        merged.append(_event_message(event))
    merged.extend(_outbound_message(outbound) for outbound in outputs[cursor:])
    return merged


# ── Pending state ───────────────────────────────────────────────────────────


def _placeholder(node: FlowNode | None) -> str:
    if node is None:
        return "Type a reply…"
    if node.kind == "ask_question":
        return str(node.config.get("question") or "Type a reply…")
    if node.kind == "request_location":
        return "Share your location"
    return "Type a reply…"


def _pending_options(messages: list[SimMessage], node: FlowNode | None) -> list[SimOption]:
    """Options from the menu we just sent (falling back to the node config)."""
    if node is not None:
        for message in reversed(messages):
            if message.node_id == node.id and message.options and message.type in _MENUS:
                return message.options
        items = [item for item in (node.config.get("items") or []) if isinstance(item, dict)]
        return [
            SimOption(
                id=str(item.get("id") or f"opt_{index + 1}"),
                label=str(item.get("label") or f"Option {index + 1}"),
            )
            for index, item in enumerate(items)
        ]
    return []


# ── Endpoint ────────────────────────────────────────────────────────────────


@router.post("/{flow_id}/simulate", response_model=SimulateResponse)
async def simulate_flow(
    flow_id: str,
    body: SimulateRequest,
    session: AsyncSession = Depends(get_session),
) -> SimulateResponse:
    flow = await session.get(Flow, flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")

    graph = Graph.from_document(flow.graph)
    state = _state_from(body.state)
    runner = Runner(graph, state, dry_run=True)

    action = body.action
    # Free text may arrive as the action, or as the request's `text` (first turn).
    typed = (
        (action.text if action is not None and action.type == "input" else None) or body.text or ""
    ).strip()

    results: list[RunResult] = []

    if body.state is None:
        # First turn. Mirrors the executor's inbound decision: an explicit
        # start node wins, then a matching keyword trigger, then the entry node.
        start = body.start_node_id
        seed = (body.text or "").strip()
        if start is None and seed:
            start = graph.match_keyword(seed)
        if start is not None and graph.node(start) is None:
            raise HTTPException(status_code=422, detail="Start node is not part of this flow")
        results.append(await runner.start(start))
    elif state.delay_seconds is not None:
        results.append(await runner.continue_after_delay())
    elif state.awaiting_node_id and state.awaiting_kind == "options":
        if action is not None and action.type == "choice":
            results.append(await runner.resume_with_choice(action.id or "", action.label))
        elif typed:
            results.append(await runner.resume_with_input(typed))
        # else: nothing to tap or type — leave the menu pending.
    elif state.awaiting_node_id:
        if typed:
            results.append(await runner.resume_with_input(typed))
        # else: WhatsApp never delivers an empty body, so the question stays put.
    # else: the walk already ended — nothing to do until the client restarts.

    # Production waits out every delay; a preview cannot, so skip ahead.
    guard = 0
    while runner.state.delay_seconds is not None and guard < MAX_DELAY_SKIPS:
        guard += 1
        results.append(await runner.continue_after_delay())
    if runner.state.delay_seconds is not None:
        runner.state.delay_seconds = None
        runner.state.resume_node_id = None
        runner.state.finished = True
        results.append(
            RunResult(
                outputs=[],
                state=runner.state,
                events=[
                    RunEvent(
                        node_id=None,
                        kind="delay",
                        text="Delay loop cut off — preview stopped here",
                    )
                ],
            )
        )

    messages: list[SimMessage] = []
    for result in results:
        messages.extend(_merge(result.outputs, result.events))

    state = runner.state
    pending: SimPending | None = None
    if state.awaiting_node_id:
        node = graph.node(state.awaiting_node_id)
        if state.awaiting_kind == "options":
            pending = SimPending(
                type="options",
                node_id=state.awaiting_node_id,
                options=_pending_options(messages, node),
            )
        else:
            pending = SimPending(
                type="input",
                node_id=state.awaiting_node_id,
                placeholder=_placeholder(node),
            )

    return SimulateResponse(
        state=asdict(state),
        messages=messages,
        pending=pending,
        ended=bool(state.finished)
        and state.awaiting_node_id is None
        and state.delay_seconds is None,
        status=state.status,
    )
