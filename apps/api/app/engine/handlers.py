"""Node handler registry — one async handler per node kind.

Handlers are pure with respect to the database: they receive a :class:`FlowNode`
and a mutable :class:`RunContext` and return an :class:`Outcome`. Anything with
a side effect on the outside world (HTTP calls, no-op integrations) is expressed
as an :class:`Outbound` or a note; the executor decides how to deliver it.
"""

from __future__ import annotations

import random
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from .graph import FlowNode
from .interpolate import interpolate, lookup, to_text
from .outcome import Outbound, Outcome, RunContext

# ── Small coercion helpers ──────────────────────────────────────────────────


def _s(config: dict[str, Any], key: str, default: str = "") -> str:
    value = config.get(key)
    return value if isinstance(value, str) else default


def _n(config: dict[str, Any], key: str, default: float = 0) -> float:
    value = config.get(key)
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _list(config: dict[str, Any], key: str) -> list[Any]:
    value = config.get(key)
    return value if isinstance(value, list) else []


def _table(config: dict[str, Any], key: str) -> dict[str, Any]:
    value = config.get(key)
    return value if isinstance(value, dict) else {}


def _pairs(value: Any) -> dict[str, str]:
    """Coerce a `keyvalue` field into a plain dict.

    The builder stores these as a list of `{ key, value }` rows; older documents
    (and hand-written ones) may use a plain object.
    """
    if isinstance(value, dict):
        return {to_text(k): to_text(v) for k, v in value.items()}
    if isinstance(value, list):
        pairs: dict[str, str] = {}
        for item in value:
            if isinstance(item, dict):
                key = to_text(item.get("key"))
                if key:
                    pairs[key] = to_text(item.get("value"))
        return pairs
    return {}


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit]


# ── Input validation ────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^\+?[\d\s\-()]{6,20}$")
_NUMBER_RE = re.compile(r"^-?\d+(\.\d+)?$")
_URL_RE = re.compile(r"^https?://\S+$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_valid_input(input_type: str, value: str) -> bool:
    value = (value or "").strip()
    if not value:
        return False
    match input_type:
        case "email":
            return bool(_EMAIL_RE.match(value))
        case "phone":
            return bool(_PHONE_RE.match(value))
        case "number":
            return bool(_NUMBER_RE.match(value))
        case "url":
            return bool(_URL_RE.match(value))
        case "date":
            return bool(_DATE_RE.match(value))
        case _:  # text, file, or unset
            return True


# ── Condition / business-hours evaluation ───────────────────────────────────

_DAY_TOKENS = {
    "mon": 0,
    "tue": 1,
    "wed": 2,
    "thu": 3,
    "fri": 4,
    "sat": 5,
    "sun": 6,
}


def evaluate_condition(config: dict[str, Any], variables: dict[str, Any]) -> bool:
    variable = _s(config, "variable")
    operator = _s(config, "operator") or "equals"
    expected = interpolate(_s(config, "value"), variables)
    case_sensitive = bool(config.get("caseSensitive", False))

    current = lookup(variables, variable)
    exists = current is not None and current != ""

    if operator == "exists":
        return exists
    if operator == "not_exists":
        return not exists

    actual_text = to_text(current)
    expected_text = expected
    if not case_sensitive:
        actual_text = actual_text.lower()
        expected_text = expected_text.lower()

    match operator:
        case "equals":
            return actual_text == expected_text
        case "not_equals":
            return actual_text != expected_text
        case "contains":
            return expected_text in actual_text
        case "greater_than" | "less_than":
            try:
                left, right = float(actual_text), float(expected_text)
            except ValueError:
                return False
            return left > right if operator == "greater_than" else left < right
        case _:
            return False


def _parse_days(text: str) -> set[int]:
    lowered = text.lower()
    if "daily" in lowered or "every day" in lowered or "always" in lowered:
        return set(range(7))
    days: set[int] = set()
    for match in re.finditer(r"([a-z]{3})\s*-\s*([a-z]{3})", lowered):
        start, end = _DAY_TOKENS.get(match.group(1)), _DAY_TOKENS.get(match.group(2))
        if start is None or end is None:
            continue
        if start <= end:
            days.update(range(start, end + 1))
        else:  # wraps, e.g. Fri-Mon
            days.update(range(start, 7))
            days.update(range(0, end + 1))
    for token, index in _DAY_TOKENS.items():
        if re.search(rf"\b{token}\b", lowered):
            days.add(index)
    return days


def _minutes(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def is_open_now(timezone_name: str, schedule: str, now: datetime | None = None) -> bool:
    """Best-effort evaluation of a `Mon-Fri, 09:00-17:00` schedule."""
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo(timezone_name) if timezone_name else UTC
    except Exception:  # unknown tz → fall back to UTC
        tz = UTC

    current = now.astimezone(tz) if now else datetime.now(tz)
    text = (schedule or "").replace("–", "-").replace("—", "-").strip()
    if not text:
        return True

    day_part, time_part = text, ""
    if "," in text:
        head, tail = text.split(",", 1)
        if re.search(r"\d{1,2}:\d{2}", tail):
            day_part, time_part = head.strip(), tail.strip()
    elif re.search(r"\d{1,2}:\d{2}", text):
        time_part = text

    days = _parse_days(day_part)
    if days and current.weekday() not in days:
        return False

    times = re.findall(r"(\d{1,2}:\d{2})", time_part)
    if len(times) >= 2:
        start, end = _minutes(times[0]), _minutes(times[1])
        now_minutes = current.hour * 60 + current.minute
        return start <= now_minutes <= end
    return True


# ── Payload builders ────────────────────────────────────────────────────────

MAX_BUTTONS = 3
MAX_BUTTON_TITLE = 20
MAX_LIST_ROWS = 10
MAX_ROW_TITLE = 24


def _text_outbound(node: FlowNode, body: str) -> Outbound:
    return Outbound(
        kind="text",
        body=body,
        node_id=node.id,
        payload={"type": "text", "text": {"body": body}},
    )


def _interactive_payload(config: dict[str, Any], variables: dict[str, Any]) -> dict[str, Any]:
    mode = _s(config, "mode") or "buttons"
    body = interpolate(_s(config, "body"), variables)
    footer = interpolate(_s(config, "footer"), variables)
    rows = [item for item in _list(config, "items") if isinstance(item, dict)]

    interactive: dict[str, Any] = {"type": "button" if mode != "list" else "list"}
    interactive["body"] = {"text": body}
    if footer:
        interactive["footer"] = {"text": footer}

    if mode != "list":
        buttons = []
        for index, item in enumerate(rows[:MAX_BUTTONS]):
            label = _clip(to_text(item.get("label")) or f"Option {index + 1}", MAX_BUTTON_TITLE)
            buttons.append(
                {
                    "type": "reply",
                    "reply": {"id": to_text(item.get("id")) or f"opt_{index + 1}", "title": label},
                }
            )
        interactive["action"] = {"buttons": buttons}
    else:
        list_rows = []
        for index, item in enumerate(rows[:MAX_LIST_ROWS]):
            title = _clip(to_text(item.get("label")) or f"Option {index + 1}", MAX_ROW_TITLE)
            list_rows.append({"id": to_text(item.get("id")) or f"opt_{index + 1}", "title": title})
        interactive["action"] = {
            "button": _clip(_s(config, "button") or "Choose", MAX_BUTTON_TITLE),
            "sections": [{"rows": list_rows}],
        }
    return {"type": "interactive", "interactive": interactive}


# ── Handlers ────────────────────────────────────────────────────────────────


async def handle_send_text(node: FlowNode, ctx: RunContext) -> Outcome:
    body = interpolate(_s(node.config, "text") or "…", ctx.variables)
    return Outcome(outputs=[_text_outbound(node, body)])


async def handle_send_media(node: FlowNode, ctx: RunContext) -> Outcome:
    media_type = _s(node.config, "mediaType") or "image"
    url = _s(node.config, "url")
    caption = interpolate(_s(node.config, "caption"), ctx.variables)
    if not url:
        return Outcome(note=f"send_media: no URL configured for {media_type}")
    media: dict[str, Any] = {"link": url}
    if caption:
        media["caption"] = caption
    if media_type == "document" and _s(node.config, "filename"):
        media["filename"] = _s(node.config, "filename")
    return Outcome(
        outputs=[
            Outbound(
                kind="media",
                body=caption or url,
                node_id=node.id,
                payload={"type": media_type, media_type: media},
            )
        ]
    )


async def handle_interactive_options(node: FlowNode, ctx: RunContext) -> Outcome:
    payload = _interactive_payload(node.config, ctx.variables)
    body = payload["interactive"].get("body", {}).get("text", "")
    return Outcome(
        outputs=[Outbound(kind="interactive", body=body, node_id=node.id, payload=payload)],
        pause="options",
    )


async def handle_send_template(node: FlowNode, ctx: RunContext) -> Outcome:
    name = _s(node.config, "name")
    if not name:
        return Outcome(note="send_template: no template name configured")
    language = _s(node.config, "language") or "en_US"
    variables = [
        interpolate(to_text(v), ctx.variables) for v in _list(node.config, "variables")
    ]
    template: dict[str, Any] = {"name": name, "language": {"code": language}}
    if variables:
        template["components"] = [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": value} for value in variables],
            }
        ]
    return Outcome(
        outputs=[
            Outbound(
                kind="template",
                body=f"template:{name}",
                node_id=node.id,
                payload={"type": "template", "template": template},
            )
        ]
    )


async def handle_carousel(node: FlowNode, ctx: RunContext) -> Outcome:
    # WhatsApp carousels must be sent as an approved template message.
    count = len(_list(node.config, "cards"))
    return Outcome(note=f"carousel: {count} card(s) skipped — send as an approved template")


async def handle_ask_question(node: FlowNode, ctx: RunContext) -> Outcome:
    question = interpolate(_s(node.config, "question") or "Please type your answer.", ctx.variables)
    variable = _s(node.config, "variable") or None
    return Outcome(
        outputs=[_text_outbound(node, question)],
        pause="input",
        pause_variable=variable,
    )


async def handle_request_location(node: FlowNode, ctx: RunContext) -> Outcome:
    prompt = interpolate(_s(node.config, "prompt") or "Share your location 📍", ctx.variables)
    return Outcome(
        outputs=[_text_outbound(node, prompt)],
        pause="input",
        pause_variable=_s(node.config, "variable") or None,
    )


async def handle_webview(node: FlowNode, ctx: RunContext) -> Outcome:
    url = _s(node.config, "url")
    title = _s(node.config, "title") or "Open page"
    if not url:
        return Outcome(note="webview: no URL configured")
    payload = {
        "type": "interactive",
        "interactive": {
            "type": "cta_url",
            "body": {"text": title},
            "action": {
                "name": "cta_url",
                "parameters": {"display_text": _clip(title, MAX_BUTTON_TITLE), "url": url},
            },
        },
    }
    return Outcome(
        outputs=[Outbound(kind="interactive", body=title, node_id=node.id, payload=payload)]
    )


async def handle_condition(node: FlowNode, ctx: RunContext) -> Outcome:
    passed = evaluate_condition(node.config, ctx.variables)
    return Outcome(go="true" if passed else "false")


async def handle_jump(node: FlowNode, _ctx: RunContext) -> Outcome:
    return Outcome()


async def handle_delay(node: FlowNode, _ctx: RunContext) -> Outcome:
    amount = _n(node.config, "amount", 5) or 5
    unit = _s(node.config, "unit") or "minutes"
    factor = {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}.get(unit, 60)
    return Outcome(delay_seconds=amount * factor)


async def handle_set_variable(node: FlowNode, ctx: RunContext) -> Outcome:
    name = _s(node.config, "variable").strip()
    if not name:
        return Outcome(note="set_variable: no variable name configured")
    raw = interpolate(_s(node.config, "value"), ctx.variables)
    operation = _s(node.config, "operation") or "set"

    if operation == "increment":
        try:
            total = float(to_text(lookup(ctx.variables, name)) or 0) + float(raw or 0)
        except ValueError:
            total = float("nan")
        value: Any = int(total) if total == total and float(total).is_integer() else total
    elif operation == "append":
        value = to_text(lookup(ctx.variables, name)) + raw
    else:
        value = raw
    return Outcome(set_vars={name: value})


async def handle_global_keyword(_node: FlowNode, _ctx: RunContext) -> Outcome:
    return Outcome()


async def handle_ab_test(node: FlowNode, _ctx: RunContext) -> Outcome:
    split = _n(node.config, "split", 50)
    return Outcome(go="a" if random.random() * 100 < split else "b")


async def handle_webhook(node: FlowNode, ctx: RunContext) -> Outcome:
    import httpx

    method = (_s(node.config, "method") or "POST").upper()
    url = interpolate(_s(node.config, "url"), ctx.variables)
    if not url:
        return Outcome(note="webhook: no URL configured")

    # A preview never calls out to a customer's endpoint (and never writes the
    # response back into their variables).
    if ctx.dry_run:
        return Outcome(note=f"webhook {method} {url} → skipped in preview")

    headers = {
        key: interpolate(value, ctx.variables)
        for key, value in _pairs(node.config.get("headers")).items()
    }
    body_text = interpolate(_s(node.config, "body"), ctx.variables)
    timeout = _n(node.config, "timeout", 10) or 10

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method, url, headers=headers, content=body_text or None
            )
            response.raise_for_status()
            try:
                data: Any = response.json()
            except ValueError:
                data = {"text": response.text}
    except Exception as exc:  # network / HTTP error
        return Outcome(
            set_vars={"last_error": str(exc)},
            note=f"webhook {method} {url} failed: {exc}",
        )

    set_vars: dict[str, Any] = {}
    target = _s(node.config, "saveResponseTo")
    if target:
        set_vars[target] = data
    return Outcome(set_vars=set_vars, note=f"webhook {method} {url} → {response.status_code}")


async def handle_app_integration(node: FlowNode, _ctx: RunContext) -> Outcome:
    app = _s(node.config, "app") or "integration"
    action = _s(node.config, "action") or "run"
    return Outcome(note=f"app_integration: {app} · {action} (not wired)")


async def handle_send_email(node: FlowNode, ctx: RunContext) -> Outcome:
    to = interpolate(_s(node.config, "to"), ctx.variables)
    return Outcome(note=f"send_email → {to or 'unset'} (SMTP not configured)")


async def handle_dynamic_data(node: FlowNode, ctx: RunContext) -> Outcome:
    expression = interpolate(_s(node.config, "expression"), ctx.variables)
    return Outcome(note=f"dynamic_data: {expression}")


async def handle_human_takeover(node: FlowNode, ctx: RunContext) -> Outcome:
    team = _s(node.config, "team") or "Support"
    message = interpolate(_s(node.config, "message"), ctx.variables)
    outputs = [_text_outbound(node, message)] if message else []
    return Outcome(outputs=outputs, status="handed_off", terminal=True, note=f"handoff → {team}")


async def handle_business_hours(node: FlowNode, _ctx: RunContext) -> Outcome:
    open_now = is_open_now(_s(node.config, "timezone"), _s(node.config, "schedule"))
    return Outcome(go="open" if open_now else "closed")


async def handle_close_chat(node: FlowNode, ctx: RunContext) -> Outcome:
    message = interpolate(_s(node.config, "message"), ctx.variables)
    outputs = [_text_outbound(node, message)] if message else []
    return Outcome(
        outputs=outputs,
        status="closed",
        terminal=True,
        clear_vars=bool(node.config.get("clearSession", False)),
    )


async def handle_inactivity_trigger(_node: FlowNode, _ctx: RunContext) -> Outcome:
    return Outcome()


async def handle_error_catch(_node: FlowNode, _ctx: RunContext) -> Outcome:
    return Outcome()


Handler = Callable[[FlowNode, RunContext], Awaitable[Outcome]]

HANDLERS: dict[str, Handler] = {
    "send_text": handle_send_text,
    "send_media": handle_send_media,
    "interactive_options": handle_interactive_options,
    "send_template": handle_send_template,
    "carousel": handle_carousel,
    "ask_question": handle_ask_question,
    "request_location": handle_request_location,
    "webview": handle_webview,
    "condition": handle_condition,
    "jump": handle_jump,
    "delay": handle_delay,
    "set_variable": handle_set_variable,
    "global_keyword": handle_global_keyword,
    "ab_test": handle_ab_test,
    "webhook": handle_webhook,
    "app_integration": handle_app_integration,
    "send_email": handle_send_email,
    "dynamic_data": handle_dynamic_data,
    "human_takeover": handle_human_takeover,
    "business_hours": handle_business_hours,
    "close_chat": handle_close_chat,
    "inactivity_trigger": handle_inactivity_trigger,
    "error_catch": handle_error_catch,
}


def get_handler(kind: str) -> Handler | None:
    return HANDLERS.get(kind)
