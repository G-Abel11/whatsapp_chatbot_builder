"""Types shared between the node handlers and the runner.

Nothing here touches the database or the network, which keeps the runner pure
and unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class Outbound:
    """A message the engine wants to send to the customer."""

    kind: str  # text | media | template | interactive
    body: str | None = None
    # The WhatsApp Cloud API message object, minus `messaging_product`/`to`.
    payload: dict[str, Any] = field(default_factory=dict)
    node_id: str | None = None


@dataclass(slots=True)
class Outcome:
    """What a single node handler decided to do."""

    outputs: list[Outbound] = field(default_factory=list)
    set_vars: dict[str, Any] = field(default_factory=dict)
    # Explicit source handle to follow (e.g. condition -> "true"/"false").
    go: str | None = None
    # Pause the conversation: "input" (free text / validated) or "options".
    pause: str | None = None
    pause_variable: str | None = None
    # Wait before continuing (the executor schedules a resumption job).
    delay_seconds: float | None = None
    # Do not continue past this node.
    terminal: bool = False
    # Override the conversation status: active | handed_off | closed.
    status: str | None = None
    # Wipe all captured variables (Close Chat → "clear conversation state").
    clear_vars: bool = False
    # Human-readable note recorded in the message log (no customer-facing send).
    note: str | None = None


@dataclass(slots=True)
class RunContext:
    """Mutable per-run context handed to each handler."""

    variables: dict[str, Any] = field(default_factory=dict)
    # Preview mode: handlers must not touch the network. The simulate endpoint
    # sets this so a walkthrough can never call a customer's webhook.
    dry_run: bool = False
