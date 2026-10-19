"""`{{variable}}` substitution for outbound text.

Mirrors the TypeScript `interpolate()` in `apps/web/src/lib/flow/simulate.ts`,
except there is no fallback sample table — real captured variables are used.
Unknown variables are left untouched (`{{name}}`) so a missing value is obvious
in the logs rather than silently blank.
"""

from __future__ import annotations

import re
from typing import Any

_VAR_RE = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def lookup(variables: dict[str, Any] | None, key: str) -> Any:
    """Resolve `a.b.c` against a (possibly nested) mapping. Missing → None."""
    if not variables:
        return None
    current: Any = variables
    for part in key.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def interpolate(text: str | None, variables: dict[str, Any] | None = None) -> str:
    if not text:
        return ""

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = lookup(variables, key)
        if value is None or value == "":
            return f"{{{{{key}}}}}"
        return to_text(value)

    return _VAR_RE.sub(replace, text)
