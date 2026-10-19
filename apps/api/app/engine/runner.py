"""The graph walker.

`Runner` is pure: it advances through the graph, applies node handlers and
returns the messages that *should* be sent. It never touches the database or the
network, so it can be unit-tested with a plain flow document.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import nodes as node_kinds
from .graph import FlowNode, Graph
from .handlers import get_handler, is_valid_input
from .outcome import Outbound, Outcome, RunContext

MAX_STEPS = 200


# ── Event text ──────────────────────────────────────────────────────────────
# Human-readable lines for the preview's system rows. Production logs these as
# structured notes; the preview needs something a designer can read at a glance.


def _format_duration(seconds: float) -> str:
    total = int(seconds)
    for span, unit in ((86400, "day"), (3600, "hour"), (60, "minute"), (1, "second")):
        value, total = divmod(total, span)
        if value:
            return f"{value} {unit}{'' if value == 1 else 's'}"
    return "0 seconds"


def _short(value: Any, limit: int = 70) -> str:
    text = str(value)
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


def _branch_text(node: FlowNode, handle: str) -> str:
    config = node.config
    if node.kind == "condition":
        parts = [
            str(config.get("variable") or "value"),
            str(config.get("operator") or "").replace("_", " ").strip(),
            str(config.get("value") or ""),
        ]
        decision = "True" if handle == "true" else "False"
        return f"Condition · {' '.join(p for p in parts if p)} → {decision}"
    if node.kind == "ab_test":
        split = int(float(config.get("split") or 50))
        return f"A/B split · {split}% / {100 - split}% → {handle.upper()}"
    if node.kind == "business_hours":
        schedule = str(config.get("schedule") or config.get("timezone") or "").strip()
        decision = "Open" if handle == "open" else "Closed"
        return f"Business hours{f' · {schedule}' if schedule else ''} → {decision}"
    return f"{node.kind.replace('_', ' ')} → {handle}"


def _event_for(node: FlowNode, outcome: Outcome, output_index: int) -> RunEvent | None:
    """Describe a non-message decision, or None when the node only sent."""
    # Status changes read better than the handler's internal note (a handoff
    # note says "handoff → Sales"; the designer wants to know the bot stopped).
    if outcome.status == "handed_off":
        return RunEvent(node.id, "status", "Handed off — the bot stops replying", output_index)
    if outcome.status == "closed":
        return RunEvent(node.id, "status", "Conversation closed", output_index)
    if outcome.status:
        return RunEvent(node.id, "status", f"Status → {outcome.status}", output_index)
    if outcome.note:
        return RunEvent(node.id, "note", outcome.note, output_index)
    if outcome.go is not None and node.kind in node_kinds.BRANCH_KINDS:
        return RunEvent(node.id, "branch", _branch_text(node, outcome.go), output_index)
    if outcome.delay_seconds is not None:
        return RunEvent(
            node.id,
            "delay",
            f"Wait {_format_duration(outcome.delay_seconds)} — skipped in preview",
            output_index,
        )
    if outcome.set_vars:
        assignment = ", ".join(
            f"{key} = {_short(value)}" for key, value in outcome.set_vars.items()
        )
        return RunEvent(node.id, "variables", f"Set variables · {assignment}", output_index)
    return None


@dataclass(slots=True)
class RunnerState:
    variables: dict[str, Any] = field(default_factory=dict)
    current_node_id: str | None = None
    awaiting_node_id: str | None = None
    awaiting_kind: str | None = None  # input | options
    awaiting_variable: str | None = None
    status: str = "active"  # active | handed_off | closed
    finished: bool = False
    # Set when the walk stopped on a Delay node.
    delay_seconds: float | None = None
    resume_node_id: str | None = None


@dataclass(slots=True)
class RunEvent:
    """A decision the engine made that produced no WhatsApp message of its own.

    Conditions, delays, variable writes and side effects are invisible in a
    real conversation (nothing is sent). The simulate endpoint turns these
    into the preview's grey system rows so the designer can still see them.
    """

    node_id: str | None
    kind: str  # branch | delay | variables | status | note | validation
    text: str
    # How many outbound messages precede this event, so merging the two lists
    # keeps the order the walk actually produced them in.
    output_index: int = 0


@dataclass(slots=True)
class RunResult:
    outputs: list[Outbound]
    state: RunnerState
    notes: list[str] = field(default_factory=list)
    events: list[RunEvent] = field(default_factory=list)


class Runner:
    def __init__(
        self, graph: Graph, state: RunnerState | None = None, *, dry_run: bool = False
    ) -> None:
        self.graph = graph
        self.state = state or RunnerState()
        # Preview runs never touch the network (see RunContext.dry_run).
        self.dry_run = dry_run

    # ── Entry points ───────────────────────────────────────────────────────

    async def start(self, from_node_id: str | None = None) -> RunResult:
        """Begin a walk from `from_node_id`, or the graph's entry node."""
        start = from_node_id or self.graph.entry()
        return await self._walk(start)

    async def resume_with_input(self, text: str) -> RunResult:
        """Feed a free-text reply to the node we paused on."""
        state = self.state
        node = self.graph.node(state.awaiting_node_id)
        awaiting_variable = state.awaiting_variable
        state.awaiting_node_id = None
        state.awaiting_kind = None
        state.awaiting_variable = None

        if node is None:
            return await self._walk(None)

        reply = (text or "").strip()

        # Reject malformed answers (email/phone/number/…) and re-ask.
        if node.kind == "ask_question" and reply:
            input_type = str(node.config.get("inputType") or "text")
            if not is_valid_input(input_type, reply):
                retry = str(node.config.get("retryMessage") or "")
                outputs = (
                    [
                        Outbound(
                            kind="text",
                            body=retry,
                            node_id=node.id,
                            payload={"type": "text", "text": {"body": retry}},
                        )
                    ]
                    if retry
                    else []
                )
                state.awaiting_node_id = node.id
                state.awaiting_kind = "input"
                state.awaiting_variable = awaiting_variable
                state.current_node_id = node.id
                return RunResult(
                    outputs=outputs,
                    state=state,
                    events=[
                        RunEvent(
                            node_id=node.id,
                            kind="validation",
                            text=(
                                f"Rejected · expected {input_type.replace('_', ' ')} "
                                "— asking again"
                            ),
                            output_index=0,
                        )
                    ],
                )

        if reply and awaiting_variable:
            state.variables = {**state.variables, awaiting_variable: reply}

        return await self._walk(self._next(node, None))

    async def resume_with_choice(self, choice_id: str, label: str | None = None) -> RunResult:
        """Feed an interactive button/list reply to the node we paused on."""
        state = self.state
        node = self.graph.node(state.awaiting_node_id)
        state.awaiting_node_id = None
        state.awaiting_kind = None
        state.awaiting_variable = None
        if choice_id:
            state.variables = {**state.variables, "last_choice": label or choice_id}
        if node is None:
            return await self._walk(None)
        # An option's id doubles as the edge handle it was wired from on the
        # canvas, so a tapped button follows its own branch. Unwired replies
        # fall through `_next`'s fallbacks (single edge → default "out" handle
        # → handle-less edge → first edge), i.e. the default path.
        return await self._walk(self._next(node, choice_id or None))

    # ── Internals ──────────────────────────────────────────────────────────

    def _next(self, node: FlowNode | None, handle: str | None) -> str | None:
        if node is None:
            return None
        edges = self.graph.edges_from(node.id)
        if not edges:
            return None
        if handle is not None:
            for edge in edges:
                if edge.source_handle == handle:
                    return edge.target
        if len(edges) == 1:
            return edges[0].target
        primary = node_kinds.primary_source_handle(node.kind)
        if primary is not None:
            for edge in edges:
                if edge.source_handle == primary:
                    return edge.target
        for edge in edges:
            if edge.source_handle in (None, ""):
                return edge.target
        return edges[0].target

    async def _walk(self, start: str | None) -> RunResult:
        state = self.state
        outputs: list[Outbound] = []
        notes: list[str] = []
        events: list[RunEvent] = []
        state.finished = False
        state.delay_seconds = None
        state.resume_node_id = None
        current = start
        steps = 0

        if current is None:
            # Nothing to walk: empty graph, or a resume with no node to go to.
            state.finished = True
            return RunResult(outputs=[], state=state)

        while current and steps < MAX_STEPS:
            steps += 1
            node = self.graph.node(current)
            if node is None:
                state.finished = True
                break

            # Sticky notes never execute — skip straight through.
            if node.kind in node_kinds.NON_EXECUTING_KINDS:
                current = self._next(node, None)
                if current is None:
                    state.finished = True
                continue

            handler = get_handler(node.kind)
            if handler is None:
                state.finished = True
                break

            context = RunContext(variables=state.variables, dry_run=self.dry_run)
            outcome = await handler(node, context)
            outputs.extend(outcome.outputs)
            if outcome.note:
                notes.append(outcome.note)

            event = _event_for(node, outcome, len(outputs))
            if event is not None:
                events.append(event)

            if outcome.set_vars:
                state.variables = {**state.variables, **outcome.set_vars}
            if outcome.clear_vars:
                state.variables = {}
            if outcome.status:
                state.status = outcome.status
            state.current_node_id = node.id

            next_id = self._next(node, outcome.go)

            if outcome.terminal:
                state.finished = True
                break

            if outcome.delay_seconds is not None:
                state.delay_seconds = outcome.delay_seconds
                state.resume_node_id = next_id
                state.finished = next_id is None
                break

            if outcome.pause:
                state.awaiting_node_id = node.id
                state.awaiting_kind = outcome.pause
                state.awaiting_variable = outcome.pause_variable
                state.finished = False
                break

            if next_id is None:
                state.finished = True
                break

            current = next_id

        if steps >= MAX_STEPS:
            state.finished = True

        return RunResult(outputs=outputs, state=state, notes=notes, events=events)

    async def continue_after_delay(self) -> RunResult:
        """Preview helper: skip a scheduled wait and walk on immediately.

        Production stops on a Delay node and lets the worker resume it later
        (see `state.delay_seconds`). A preview cannot sleep for hours, so the
        simulate endpoint annotates the wait and continues from the resume node.
        """
        state = self.state
        target = state.resume_node_id
        state.delay_seconds = None
        state.resume_node_id = None
        if target is None:
            state.finished = True
            return RunResult(
                outputs=[],
                state=state,
                events=[
                    RunEvent(
                        node_id=None,
                        kind="delay",
                        text="Wait — nothing follows the delay, so the preview ends here",
                    )
                ],
            )
        return await self._walk(target)
