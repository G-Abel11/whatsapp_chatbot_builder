"""The Python node registry must never drift from the web package."""

from __future__ import annotations

import re
from pathlib import Path

from app.nodes import NODE_KINDS

REPO_ROOT = Path(__file__).resolve().parents[3]
TS_TYPES = REPO_ROOT / "packages" / "shared" / "src" / "types.ts"


def _ts_node_kinds() -> list[str]:
    source = TS_TYPES.read_text(encoding="utf-8")
    match = re.search(r"NODE_KINDS\s*=\s*\[(.*?)\]\s*as const", source, re.S)
    assert match is not None, "could not find NODE_KINDS in types.ts"
    return re.findall(r"'([a-z_]+)'", match.group(1))


def test_types_file_exists() -> None:
    assert TS_TYPES.exists(), f"missing shared types at {TS_TYPES}"


def test_node_kinds_match_typescript() -> None:
    expected = _ts_node_kinds()
    assert list(NODE_KINDS) == expected, (
        "Python NODE_KINDS drifted from packages/shared/src/types.ts\n"
        f"  python: {list(NODE_KINDS)}\n"
        f"  ts:     {expected}"
    )


def test_every_kind_has_a_handler() -> None:
    from app.engine.handlers import HANDLERS

    missing = [kind for kind in NODE_KINDS if kind not in HANDLERS and kind != "sticky_note"]
    assert missing == [], f"node kinds without an execution handler: {missing}"


# ── Preview message shapes ──────────────────────────────────────────────────

WEB_SIMULATE = REPO_ROOT / "apps" / "web" / "src" / "lib" / "flow" / "simulate.ts"


def _ts_union(name: str, source: str) -> list[str]:
    match = re.search(rf"export type {name}\s*=\s*([^;]+);", source, re.S)
    assert match is not None, f"could not find {name} in simulate.ts"
    return re.findall(r"'([a-z_]+)'", match.group(1))


def _python_union(field: str) -> list[str]:
    from typing import get_args

    from app.schemas import SimMessage

    return list(get_args(SimMessage.model_fields[field].annotation))


def test_simulated_message_kinds_match_typescript() -> None:
    source = WEB_SIMULATE.read_text(encoding="utf-8")
    ts_kinds = _ts_union("SimMessageType", source)
    python_kinds = _python_union("type")
    assert sorted(python_kinds) == sorted(ts_kinds), (
        "the preview endpoint's message kinds drifted from lib/flow/simulate.ts\n"
        f"  python: {sorted(python_kinds)}\n"
        f"  ts:     {sorted(ts_kinds)}"
    )


def test_simulated_roles_match_typescript() -> None:
    source = WEB_SIMULATE.read_text(encoding="utf-8")
    ts_roles = _ts_union("SimRole", source)
    python_roles = _python_union("role")
    assert sorted(python_roles) == sorted(ts_roles), (
        "the preview endpoint's roles drifted from lib/flow/simulate.ts\n"
        f"  python: {sorted(python_roles)}\n"
        f"  ts:     {sorted(ts_roles)}"
    )
