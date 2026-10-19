"""Node-kind registry — the Python mirror of `packages/shared` (TypeScript).

`NODE_KINDS` must stay in sync with the web package. `tests/test_contract.py`
fails if the two drift, so the editor and the engine can never disagree about
which nodes exist.
"""

from __future__ import annotations

# Keep this tuple in the same order as packages/shared/src/types.ts.
NODE_KINDS: tuple[str, ...] = (
    # Category 1 — Messages
    "send_text",
    "send_media",
    "interactive_options",
    "send_template",
    "carousel",
    # Category 2 — Inputs
    "ask_question",
    "request_location",
    "webview",
    # Category 3 — Logic & Flow
    "condition",
    "jump",
    "delay",
    "set_variable",
    "global_keyword",
    "ab_test",
    # Category 4 — Integrations & Actions
    "webhook",
    "app_integration",
    "send_email",
    "dynamic_data",
    # Category 5 — Inbox & Handoff
    "human_takeover",
    "business_hours",
    "close_chat",
    "inactivity_trigger",
    "sticky_note",
    "error_catch",
)

NODE_KIND_SET: frozenset[str] = frozenset(NODE_KINDS)

# ── Handle layouts (mirror of packages/shared/src/nodes/handles.ts) ─────────
#
# Default node: one inbound handle on the left, one outbound handle on the right.
#
# interactive_options additionally exposes one dynamic handle per configured
# option (id = the option's id, or `opt_<n>` when blank — the same ids
# handlers.py sends to WhatsApp). Only the static default stays mirrored here;
# the engine matches dynamic handles straight against edge source_handle values.

SOURCE_HANDLES: dict[str, tuple[str, ...]] = {kind: ("out",) for kind in NODE_KINDS}
TARGET_HANDLES: dict[str, tuple[str, ...]] = {kind: ("in",) for kind in NODE_KINDS}

SOURCE_HANDLES["condition"] = ("true", "false")
SOURCE_HANDLES["ab_test"] = ("a", "b")
SOURCE_HANDLES["business_hours"] = ("open", "closed")
SOURCE_HANDLES["close_chat"] = ()
SOURCE_HANDLES["sticky_note"] = ()

# Trigger nodes have no inbound connection.
TARGET_HANDLES["global_keyword"] = ()
TARGET_HANDLES["inactivity_trigger"] = ()
TARGET_HANDLES["error_catch"] = ()
TARGET_HANDLES["sticky_note"] = ()

# ── Behavioural groupings ───────────────────────────────────────────────────

# Nodes that start a conversation rather than being reached from a previous node.
TRIGGER_KINDS: frozenset[str] = frozenset({"global_keyword", "inactivity_trigger", "error_catch"})

# Nodes that never execute (pure canvas annotation).
NON_EXECUTING_KINDS: frozenset[str] = frozenset({"sticky_note"})

# Nodes whose outgoing edge carries the conversation to one of several branches.
BRANCH_KINDS: frozenset[str] = frozenset({"condition", "ab_test", "business_hours"})

# Nodes that pause the conversation waiting for the customer.
INPUT_KINDS: frozenset[str] = frozenset({"ask_question", "request_location"})

# Nodes that send something to the customer.
MESSAGE_KINDS: frozenset[str] = frozenset(
    {
        "send_text",
        "send_media",
        "interactive_options",
        "send_template",
        "carousel",
        "ask_question",
        "request_location",
        "webview",
    }
)


def primary_source_handle(kind: str) -> str | None:
    handles = SOURCE_HANDLES.get(kind, ())
    return handles[0] if handles else None
