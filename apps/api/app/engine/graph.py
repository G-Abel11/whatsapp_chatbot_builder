"""A read model over an exported React Flow document.

The document shape is exactly what the builder persists:
    { "nodes": [ { "id", "type", "position", "data": { "kind", "label", "config" } } ],
      "edges": [ { "id", "source", "target", "sourceHandle", "data": { "label" } } ],
      "viewport": {...} }
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import nodes as node_kinds


@dataclass(slots=True)
class FlowNode:
    id: str
    kind: str
    config: dict[str, Any] = field(default_factory=dict)
    label: str = ""


@dataclass(slots=True)
class FlowEdge:
    id: str
    source: str
    target: str
    source_handle: str | None = None
    label: str | None = None


class Graph:
    def __init__(self, nodes: list[FlowNode], edges: list[FlowEdge]) -> None:
        self.nodes = nodes
        self.edges = edges
        self._by_id = {node.id: node for node in nodes}
        self._out: dict[str, list[FlowEdge]] = {node.id: [] for node in nodes}
        for edge in edges:
            self._out.setdefault(edge.source, []).append(edge)

    # ── Construction ───────────────────────────────────────────────────────

    @classmethod
    def from_document(cls, document: dict[str, Any] | None) -> Graph:
        document = document or {}
        nodes: list[FlowNode] = []
        for raw in document.get("nodes", []) or []:
            data = raw.get("data") or {}
            kind = data.get("kind")
            if not kind or kind not in node_kinds.NODE_KIND_SET:
                continue
            nodes.append(
                FlowNode(
                    id=str(raw.get("id")),
                    kind=str(kind),
                    config=dict(data.get("config") or {}),
                    label=str(data.get("label") or ""),
                )
            )

        edges: list[FlowEdge] = []
        for raw in document.get("edges", []) or []:
            if not raw.get("source") or not raw.get("target"):
                continue
            data = raw.get("data") or {}
            edges.append(
                FlowEdge(
                    id=str(raw.get("id")),
                    source=str(raw["source"]),
                    target=str(raw["target"]),
                    source_handle=raw.get("sourceHandle"),
                    label=data.get("label"),
                )
            )
        return cls(nodes, edges)

    # ── Queries ────────────────────────────────────────────────────────────

    def node(self, node_id: str | None) -> FlowNode | None:
        if node_id is None:
            return None
        return self._by_id.get(node_id)

    def edges_from(self, node_id: str) -> list[FlowEdge]:
        return self._out.get(node_id, [])

    def targets(self) -> set[str]:
        return {edge.target for edge in self.edges}

    def entry(self) -> str | None:
        """First executable node with no inbound edge."""
        targeted = self.targets()
        for node in self.nodes:
            if node.kind in node_kinds.NON_EXECUTING_KINDS:
                continue
            if node.kind in node_kinds.TRIGGER_KINDS:
                continue
            if node.id not in targeted:
                return node.id
        for node in self.nodes:
            if node.kind in node_kinds.NON_EXECUTING_KINDS:
                continue
            if node.kind in node_kinds.TRIGGER_KINDS:
                continue
            return node.id
        return None

    def match_keyword(self, text: str) -> str | None:
        """Return the source node of a `global_keyword` trigger matching `text`."""
        haystack = text or ""
        for node in self.nodes:
            if node.kind != "global_keyword":
                continue
            keywords = [str(k) for k in (node.config.get("keywords") or []) if str(k).strip()]
            if not keywords:
                continue
            case_sensitive = bool(node.config.get("caseSensitive", False))
            match_type = str(node.config.get("matchType") or "contains")
            probe = haystack if case_sensitive else haystack.lower()
            for keyword in keywords:
                needle = keyword if case_sensitive else keyword.lower()
                if match_type == "exact" and probe.strip() == needle:
                    return node.id
                if match_type == "starts_with" and probe.startswith(needle):
                    return node.id
                if match_type not in {"exact", "starts_with"} and needle in probe:
                    return node.id
        return None
