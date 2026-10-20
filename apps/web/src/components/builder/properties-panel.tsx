'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, PanelRightClose, PanelRightOpen, SlidersHorizontal, Smartphone } from 'lucide-react';
import { cn } from 'cn';
import { NODE_DEFINITIONS_BY_KIND } from '@opes/shared';
import { EmptyState } from '@/components/brand/empty-state';
import { StatusPill } from '@/components/brand/status-pill';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NODE_ICONS } from '@/lib/node-icons';
import { useFlowStore } from '@/lib/flow/store';
import type { FlowNode } from '@/lib/flow/types';
import { NodeForm } from '@/components/builder/properties/node-form';
import { PhoneSimulator } from '@/components/builder/simulator/phone-simulator';
import { PanelRail } from '@/components/builder/panel-rail';

type PanelView = 'properties' | 'preview';

const TONE_CLASS: Record<string, string> = {
  message: 'text-wa bg-wa-soft',
  input: 'text-brand bg-brand-soft',
  logic: 'text-logic bg-logic-soft',
  integration: 'text-logic bg-logic-soft',
  inbox: 'text-secondary-foreground bg-secondary',
};

/**
 * The right panel shows properties by default. Phone Preview is opened by the
 * top bar's single "Phone Preview" button (it takes over this panel with a
 * back button) — there is deliberately no second preview tab here.
 */
export function PropertiesPanel({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const node = useFlowStore((s) =>
    s.selectedNodeId ? (s.nodes.find((n) => n.id === s.selectedNodeId) ?? null) : null,
  );
  const selectedId = useFlowStore((s) => s.selectedNodeId);
  const [view, setView] = useState<PanelView>('properties');

  /* The top bar's "Phone Preview" button switches us to the simulator.
     When the panel is collapsed the parent re-expands it (see builder-view). */
  useEffect(() => {
    const handler = () => setView('preview');
    window.addEventListener('opes:open-preview', handler);
    return () => window.removeEventListener('opes:open-preview', handler);
  }, []);

  /* Picking a node on the canvas snaps the panel back to its properties, so
     a selection is never swallowed while the simulator is open. */
  useEffect(() => {
    if (selectedId) setView('properties');
  }, [selectedId]);

  if (collapsed) {
    return (
      <PanelRail
        side="right"
        icon={PanelRightOpen}
        label="Properties"
        title="Show properties & preview"
        onClick={() => onToggle?.()}
      />
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-2">
        {view === 'preview' ? (
          <>
            <button
              type="button"
              onClick={() => setView('properties')}
              aria-label="Back to properties"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-title"
            >
              <ArrowLeft className="size-4" />
            </button>
            <Smartphone className="size-3.5 text-muted-foreground" />
            <span className="text-[12px] font-medium text-title">Phone Preview</span>
          </>
        ) : (
          <span className="pl-1.5 text-[12px] font-medium text-muted-foreground">Properties</span>
        )}
        <button
          type="button"
          onClick={() => onToggle?.()}
          aria-label="Hide properties panel"
          className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-title"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>

      {view === 'preview' ? (
        <PhoneSimulator />
      ) : node ? (
        <PropertiesTab node={node} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            compact
            icon={SlidersHorizontal}
            title="Nothing selected"
            description="Select a node on the canvas to edit its content, or press Phone Preview in the top bar to walk the flow."
          />
        </div>
      )}
    </aside>
  );
}

function PropertiesTab({ node }: { node: FlowNode }) {
  const definition = NODE_DEFINITIONS_BY_KIND[node.data.kind];
  const Icon = NODE_ICONS[node.data.kind];

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-md',
            TONE_CLASS[definition.tone] ?? 'bg-secondary text-secondary-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="truncate text-[13px] font-medium text-title">{node.data.label}</span>
        <StatusPill variant="neutral" label={definition.category} className="ml-auto" />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4">
          <NodeForm node={node} />

          <div className="mt-4 rounded-xl border border-border bg-background p-3 text-[11px] text-muted-foreground">
            <p>ID: {node.id}</p>
            <p className="mt-0.5">Kind: {node.data.kind}</p>
            <p className="mt-0.5">
              X: {Math.round(node.position.x)} · Y: {Math.round(node.position.y)}
            </p>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
