'use client';

import { useMemo, useState } from 'react';
import { GripVertical, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react';
import { NODE_CATEGORIES, nodesByCategory, type NodeDefinition, type NodeKind } from '@opes/shared';
import { useReactFlow } from '@xyflow/react';
import { cn } from 'cn';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { NODE_ICONS } from '@/lib/node-icons';
import { useFlowStore } from '@/lib/flow/store';
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/flow/types';
import { PanelRail } from '@/components/builder/panel-rail';

const TONE_CLASS: Record<NodeDefinition['tone'], string> = {
  message: 'text-wa bg-wa-soft',
  input: 'text-brand bg-brand-soft',
  logic: 'text-logic bg-logic-soft',
  integration: 'text-logic bg-logic-soft',
  inbox: 'text-secondary-foreground bg-secondary',
};

export function Toolbox({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return flatCatalog().filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
  }, [query]);

  if (collapsed) {
    return (
      <PanelRail
        side="left"
        icon={PanelLeftOpen}
        label="Nodes"
        title="Show node library"
        onClick={() => onToggle?.()}
      />
    );
  }

  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-[13px] font-medium text-title">Nodes</span>
        <button
          type="button"
          onClick={() => onToggle?.()}
          aria-label="Hide node library"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-title"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="border-b border-border px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            aria-label="Search nodes"
            className="h-8 bg-background pl-8 text-[13px]"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-3">
        {results ? (
          results.length > 0 ? (
            <ul className="space-y-0.5">
              {results.map((node) => (
                <NodeRow key={node.kind} node={node} />
              ))}
            </ul>
          ) : (
            <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">
              No nodes match “{query}”.
            </p>
          )
        ) : (
          <Accordion type="single" collapsible defaultValue="messages" className="space-y-0.5">
            {NODE_CATEGORIES.map((category) => {
              const nodes = nodesByCategory(category.id);
              return (
                <AccordionItem key={category.id} value={category.id} className="border-border/70">
                  <AccordionTrigger className="px-1.5 py-2.5 text-[13px] font-medium hover:no-underline">
                    <span className="flex flex-1 items-center gap-2">
                      {category.label}
                      <span className="text-[11px] font-normal text-muted-foreground/80">
                        {nodes.length}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    <ul className="space-y-0.5">
                      {nodes.map((node) => (
                        <NodeRow key={node.kind} node={node} />
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </ScrollArea>

      <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        Drag onto the canvas, or click <span className="font-medium">+</span> to add at the centre
      </div>
    </div>
  );
}

function NodeRow({ node }: { node: NodeDefinition }) {
  const Icon = NODE_ICONS[node.kind];
  const rf = useReactFlow();
  const addNode = useFlowStore((s) => s.addNode);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/opes-node', node.kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleClick = () => {
    const canvas = document.querySelector('.react-flow');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const center = rf.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    addNode(node.kind as NodeKind, {
      x: center.x - NODE_WIDTH / 2,
      y: center.y - NODE_HEIGHT / 2,
    });
  };

  return (
    <li>
      <div
        draggable
        onDragStart={handleDragStart}
        data-node-kind={node.kind}
        title={node.description}
        className="group flex cursor-grab items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent active:cursor-grabbing"
      >
        <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md',
            TONE_CLASS[node.tone],
          )}
        >
          <Icon className="size-3.5" strokeWidth={2} />
        </span>
        <span className="flex-1 truncate text-[13px] font-medium text-foreground">{node.label}</span>
        <button
          type="button"
          onClick={handleClick}
          aria-label={`Add ${node.label} to canvas`}
          className="flex size-5 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:border-border hover:bg-background hover:text-brand"
        >
          <Plus className="size-3" />
        </button>
      </div>
    </li>
  );
}

function flatCatalog(): NodeDefinition[] {
  return NODE_CATEGORIES.flatMap((c) => nodesByCategory(c.id));
}
