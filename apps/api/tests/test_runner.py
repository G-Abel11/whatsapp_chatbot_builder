"""End-to-end tests of the graph walker (no database, no network)."""

from __future__ import annotations

from typing import Any

from app.engine.graph import Graph
from app.engine.runner import Runner, RunnerState


def _node(node_id: str, kind: str, config: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": "opes",
        "position": {"x": 0, "y": 0},
        "data": {"kind": kind, "config": config or {}},
    }


def _edge(edge_id: str, source: str, target: str, handle: str | None = None) -> dict[str, Any]:
    edge: dict[str, Any] = {"id": edge_id, "source": source, "target": target, "type": "opes"}
    if handle:
        edge["sourceHandle"] = handle
    return edge


def _graph(nodes: list[dict], edges: list[dict]) -> Graph:
    return Graph.from_document({"nodes": nodes, "edges": edges})


def _bodies(outputs) -> list[str]:
    return [outbound.body or "" for outbound in outputs]


async def test_ask_name_then_greet_with_it() -> None:
    graph = _graph(
        [
            _node("greet", "send_text", {"text": "Hi there 👋"}),
            _node(
                "ask",
                "ask_question",
                {"question": "What's your name?", "inputType": "text", "variable": "name"},
            ),
            _node("hello", "send_text", {"text": "Nice to meet you, {{name}}!"}),
        ],
        [_edge("e1", "greet", "ask"), _edge("e2", "ask", "hello")],
    )

    runner = Runner(graph)
    start = await runner.start()
    assert _bodies(start.outputs) == ["Hi there 👋", "What's your name?"]
    assert runner.state.awaiting_node_id == "ask"
    assert runner.state.awaiting_kind == "input"
    assert runner.state.awaiting_variable == "name"

    answer = await runner.resume_with_input("Ada")
    assert _bodies(answer.outputs) == ["Nice to meet you, Ada!"]
    assert runner.state.variables["name"] == "Ada"
    assert runner.state.awaiting_node_id is None


async def test_whatsapp_formatting_markers_pass_through_verbatim() -> None:
    """Meta renders *bold* _italic_ ~strike~ and ```code``` client-side, so the
    engine must forward them untouched — never strip or escape them."""
    text = "Hi *there* _friend_ ~gone~ ```mono``` > quote • bullet"
    graph = _graph([_node("say", "send_text", {"text": text})], [])

    runner = Runner(graph)
    start = await runner.start()
    assert _bodies(start.outputs) == [text]


async def test_invalid_answer_re_asks_with_retry_message() -> None:
    graph = _graph(
        [
            _node(
                "ask",
                "ask_question",
                {
                    "question": "Your email?",
                    "inputType": "email",
                    "variable": "customer_email",
                    "retryMessage": "That doesn't look right — try again?",
                },
            ),
            _node("done", "send_text", {"text": "Thanks!"}),
        ],
        [_edge("e1", "ask", "done")],
    )

    runner = Runner(graph)
    await runner.start()

    retry = await runner.resume_with_input("not-an-email")
    assert _bodies(retry.outputs) == ["That doesn't look right — try again?"]
    assert runner.state.awaiting_node_id == "ask"
    assert "customer_email" not in runner.state.variables

    ok = await runner.resume_with_input("ada@example.com")
    assert _bodies(ok.outputs) == ["Thanks!"]
    assert runner.state.variables["customer_email"] == "ada@example.com"


async def test_condition_picks_the_matching_branch() -> None:
    graph = _graph(
        [
            _node(
                "cond",
                "condition",
                {"variable": "score", "operator": "greater_than", "value": "50"},
            ),
            _node("high", "send_text", {"text": "High value"}),
            _node("low", "send_text", {"text": "Standard"}),
        ],
        [_edge("t", "cond", "high", "true"), _edge("f", "cond", "low", "false")],
    )

    low_runner = Runner(graph)
    low = await low_runner.start()
    assert _bodies(low.outputs) == ["Standard"]

    high_runner = Runner(graph, RunnerState(variables={"score": 80}))
    high = await high_runner.start()
    assert _bodies(high.outputs) == ["High value"]


async def test_interactive_options_pauses_and_records_choice() -> None:
    graph = _graph(
        [
            _node(
                "menu",
                "interactive_options",
                {
                    "mode": "buttons",
                    "body": "Pick one",
                    "items": [{"id": "opt_1", "label": "Pricing"}],
                },
            ),
            _node("after", "send_text", {"text": "Great choice"}),
        ],
        [_edge("e1", "menu", "after")],
    )

    runner = Runner(graph)
    start = await runner.start()
    assert runner.state.awaiting_kind == "options"
    assert start.outputs[0].kind == "interactive"

    resumed = await runner.resume_with_choice("opt_1", "Pricing")
    assert _bodies(resumed.outputs) == ["Great choice"]
    assert runner.state.variables["last_choice"] == "Pricing"


async def test_menu_routes_each_button_along_its_own_edge() -> None:
    """An option's id doubles as the handle its edge was wired from."""
    graph = _graph(
        [
            _node(
                "menu",
                "interactive_options",
                {
                    "mode": "buttons",
                    "body": "Pick one",
                    "items": [
                        {"id": "opt_yes", "label": "Yes"},
                        {"id": "opt_no", "label": "No"},
                    ],
                },
            ),
            _node("yes_path", "send_text", {"text": "You said yes"}),
            _node("no_path", "send_text", {"text": "You said no"}),
            _node("default_path", "send_text", {"text": "Default path"}),
        ],
        [
            _edge("e_yes", "menu", "yes_path", "opt_yes"),
            _edge("e_no", "menu", "no_path", "opt_no"),
            _edge("e_def", "menu", "default_path", "out"),
        ],
    )

    yes_runner = Runner(graph)
    await yes_runner.start()
    yes = await yes_runner.resume_with_choice("opt_yes", "Yes")
    assert _bodies(yes.outputs) == ["You said yes"]

    no_runner = Runner(graph)
    await no_runner.start()
    no = await no_runner.resume_with_choice("opt_no", "No")
    assert _bodies(no.outputs) == ["You said no"]

    # An option nobody wired follows the Default ("out") edge instead.
    unwired_runner = Runner(graph)
    await unwired_runner.start()
    unwired = await unwired_runner.resume_with_choice("opt_support", "Support")
    assert _bodies(unwired.outputs) == ["Default path"]


async def test_delay_pauses_with_seconds_and_resume_target() -> None:
    graph = _graph(
        [
            _node("delay", "delay", {"amount": 2, "unit": "hours"}),
            _node("next", "send_text", {"text": "Still there?"}),
        ],
        [_edge("e1", "delay", "next")],
    )

    runner = Runner(graph)
    result = await runner.start()
    assert runner.state.delay_seconds == 7200
    assert runner.state.resume_node_id == "next"
    assert result.outputs == []


async def test_set_variable_increment_and_append() -> None:
    graph = _graph(
        [
            _node(
                "inc",
                "set_variable",
                {"variable": "score", "value": "25", "operation": "increment"},
            ),
            _node(
                "tag",
                "set_variable",
                {"variable": "tags", "value": "vip", "operation": "append"},
            ),
        ],
        [_edge("e1", "inc", "tag")],
    )

    runner = Runner(graph, RunnerState(variables={"score": 50, "tags": "new,"}))
    await runner.start()
    assert runner.state.variables["score"] == 75
    assert runner.state.variables["tags"] == "new,vip"


async def test_close_chat_is_terminal_and_can_clear_session() -> None:
    graph = _graph(
        [_node("close", "close_chat", {"message": "Bye!", "clearSession": True})],
        [],
    )

    runner = Runner(graph, RunnerState(variables={"name": "Ada"}))
    result = await runner.start()
    assert _bodies(result.outputs) == ["Bye!"]
    assert runner.state.finished is True
    assert runner.state.status == "closed"
    assert runner.state.variables == {}


async def test_sticky_notes_are_skipped() -> None:
    graph = _graph(
        [
            _node("greet", "send_text", {"text": "Hi"}),
            _node("note", "sticky_note", {"text": "TODO"}),
            _node("say", "send_text", {"text": "Hello"}),
        ],
        [_edge("e1", "greet", "note"), _edge("e2", "note", "say")],
    )
    runner = Runner(graph)
    result = await runner.start()
    assert _bodies(result.outputs) == ["Hi", "Hello"]
