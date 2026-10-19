from __future__ import annotations

from app.engine.graph import Graph


def _node(node_id: str, kind: str, config: dict | None = None) -> dict:
    return {
        "id": node_id,
        "type": "opes",
        "position": {"x": 0, "y": 0},
        "data": {"kind": kind, "config": config or {}},
    }


def _edge(edge_id: str, source: str, target: str, handle: str | None = None) -> dict:
    edge = {"id": edge_id, "source": source, "target": target, "type": "opes"}
    if handle:
        edge["sourceHandle"] = handle
    return edge


def test_entry_skips_trigger_nodes_and_sticky_notes() -> None:
    graph = Graph.from_document(
        {
            "nodes": [
                _node("note", "sticky_note"),
                _node("trigger", "global_keyword", {"keywords": ["hi"]}),
                _node("start", "send_text", {"text": "hey"}),
            ],
            "edges": [],
        }
    )
    assert graph.entry() == "start"


def test_unknown_kinds_are_ignored() -> None:
    graph = Graph.from_document(
        {"nodes": [_node("a", "not_a_real_kind"), _node("b", "send_text")], "edges": []}
    )
    assert [node.id for node in graph.nodes] == ["b"]


def test_match_keyword_contains() -> None:
    graph = Graph.from_document(
        {
            "nodes": [_node("k", "global_keyword", {"keywords": ["agent", "human"]}),
                      _node("s", "send_text")],
            "edges": [],
        }
    )
    assert graph.match_keyword("I need an AGENT please") == "k"
    assert graph.match_keyword("hello there") is None


def test_match_keyword_exact() -> None:
    graph = Graph.from_document(
        {
            "nodes": [_node("k", "global_keyword", {"keywords": ["help"], "matchType": "exact"}),
                      _node("s", "send_text")],
            "edges": [],
        }
    )
    assert graph.match_keyword("help") == "k"
    assert graph.match_keyword("help me") is None
