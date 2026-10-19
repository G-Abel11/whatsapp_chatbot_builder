'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFlowStore } from './store';
import { analyzeFlow, type FlowAnalysis, type NodeAnalysis } from './analyze';

const EMPTY_ANALYSIS: FlowAnalysis = {
  byNode: new Map(),
  issueCount: 0,
  orphanedIds: [],
  windowRiskIds: [],
  windowRemainingMs: 0,
  windowOpen: true,
};

const EMPTY_NODE: NodeAnalysis = { orphaned: false, warnings: [] };

/**
 * Demo conversation timing: the customer last messaged 15h 48m ago, so 8h 12m
 * remain in their 24-hour service window. Rendered as a constant on the server
 * and first client paint, then ticked down live to avoid hydration drift.
 */
const DEMO_REMAINING_MS = (8 * 60 + 12) * 60 * 1000;

const FlowAnalysisContext = createContext<FlowAnalysis>(EMPTY_ANALYSIS);

export function FlowAnalysisProvider({ children }: { children: ReactNode }) {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);

  const [clock, setClock] = useState<{ startedAt: number; now: number } | null>(null);
  useEffect(() => {
    const startedAt = Date.now();
    setClock({ startedAt, now: startedAt });
    const id = window.setInterval(
      () => setClock((c) => (c ? { ...c, now: Date.now() } : c)),
      30_000,
    );
    return () => window.clearInterval(id);
  }, []);

  const windowRemainingMs = clock
    ? Math.max(0, DEMO_REMAINING_MS - (clock.now - clock.startedAt))
    : DEMO_REMAINING_MS;

  const analysis = useMemo(
    () => analyzeFlow(nodes, edges, { windowRemainingMs }),
    [nodes, edges, windowRemainingMs],
  );

  return <FlowAnalysisContext.Provider value={analysis}>{children}</FlowAnalysisContext.Provider>;
}

export function useFlowAnalysis(): FlowAnalysis {
  return useContext(FlowAnalysisContext);
}

export function useNodeAnalysis(id: string): NodeAnalysis {
  const analysis = useContext(FlowAnalysisContext);
  return analysis.byNode.get(id) ?? EMPTY_NODE;
}
