'use client';

import {
  Handle,
  Position,
  type NodeProps,
  NodeResizer,
} from '@xyflow/react';
import { cn } from 'cn';
import { AlertTriangle, MoreHorizontal, Plus, StickyNote } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { NODE_DEFINITIONS_BY_KIND, handlesFor } from '@opes/shared';
import type { FlowNode } from '@/lib/flow/types';
import { NODE_ICONS } from '@/lib/node-icons';
import { nodePreview } from '@/lib/flow/preview';
import { useFlowStore } from '@/lib/flow/store';
import { useNodeAnalysis } from '@/lib/flow/analysis-context';

const TONE_CLASS: Record<string, string> = {
  message: 'text-wa bg-wa-soft',
  input: 'text-brand bg-brand-soft',
  logic: 'text-logic bg-logic-soft',
  integration: 'text-logic bg-logic-soft',
  inbox: 'text-secondary-foreground bg-secondary',
};

export function OpesNode({ id, data, selected, isConnectable }: NodeProps<FlowNode>) {
  const def = NODE_DEFINITIONS_BY_KIND[data.kind];
  const Icon = NODE_ICONS[data.kind];
  const h = handlesFor(data.kind, data.config);
  const duplicate = useFlowStore((s) => s.duplicateNode);
  const removeNode = useFlowStore((s) => s.removeNode);
  const analysis = useNodeAnalysis(id);
  const { warnings, orphaned } = analysis;

  if (data.kind === 'sticky_note') {
    return <StickyNoteNode id={id} data={data} selected={selected} />;
  }

  return (
    <div
      className={cn(
        'group/node relative flex w-64 flex-col rounded-xl border bg-background shadow-node transition-colors',
        selected
          ? 'border-brand ring-[3px] ring-brand/12 shadow-lift'
          : warnings.length > 0
            ? 'border-alert/50 hover:border-alert'
            : 'border-border hover:border-slate-300 hover:shadow-lift',
        orphaned && !selected && 'border-dashed',
      )}
      /* Keeps ≥24px between source handles so per-option dots (up to 10 list
         rows + Default) never overlap on the right edge. Below ~4 handles the
         natural card height already wins. */
      style={{ minHeight: (h.sources.length + 1) * 24 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-md',
            TONE_CLASS[def.tone] ?? 'text-muted-foreground bg-secondary',
          )}
        >
          <Icon className="size-3.5" strokeWidth={2} />
        </span>
        <span className="truncate text-[13px] font-medium text-title">{data.label}</span>
        {warnings.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={`${warnings.length} WhatsApp issue${warnings.length === 1 ? '' : 's'}`}
                className="flex size-5 shrink-0 items-center justify-center rounded-md bg-alert-soft text-alert"
              >
                <AlertTriangle className="size-3" strokeWidth={2.25} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              <ul className="space-y-1">
                {warnings.map((warning, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden>•</span>
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto opacity-0 transition-opacity group-hover/node:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => duplicate(id)}>Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => removeNode(id)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Preview */}
      <div className="border-t border-border/70 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground line-clamp-2">
        {nodePreview(data.kind, data.config)}
      </div>

      {/* Targets (left) — circle with a "+" you can drop a connection onto */}
      {h.targets.map((t, i) => (
        <Handle
          key={t.id}
          id={t.id}
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className="opes-handle"
          style={
            h.targets.length > 1
              ? { top: `${((i + 1) / (h.targets.length + 1)) * 100}%` }
              : undefined
          }
        >
          <Plus className="size-3.5" strokeWidth={3} />
        </Handle>
      ))}

      {/* Sources (right) */}
      {h.sources.map((s, i) => (
        <Handle
          key={s.id}
          id={s.id}
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className="group/handle opes-handle"
          style={
            h.sources.length > 1
              ? { top: `${((i + 1) / (h.sources.length + 1)) * 100}%` }
              : undefined
          }
        >
          <Plus className="size-3.5" strokeWidth={3} />
          {s.label && (
            <span
              className={cn(
                'pointer-events-none absolute right-4 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] whitespace-nowrap text-muted-foreground transition-opacity',
                /* While the node is selected, option labels stay visible so it
                   is obvious which handle wires which button. */
                selected ? 'opacity-100' : 'opacity-0 group-hover/handle:opacity-100',
              )}
            >
              {s.label}
            </span>
          )}
        </Handle>
      ))}
    </div>
  );
}

function StickyNoteNode({
  id,
  data,
  selected,
}: Pick<NodeProps<FlowNode>, 'id' | 'data' | 'selected'>) {
  const removeNode = useFlowStore((s) => s.removeNode);
  const update = useFlowStore((s) => s.updateNodeConfig);
  const color = (data.config as Record<string, unknown>).color ?? 'amber';
  const text = (data.config as Record<string, unknown>).text ?? '';
  const palette: Record<string, string> = {
    amber: 'bg-[#FFFBEB] border-[#FDE68A] text-slate-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    green: 'bg-emerald-50 border-emerald-200 text-slate-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-slate-700',
  };
  return (
    <div
      className={cn(
        'group/note relative flex h-[140px] w-[220px] flex-col rounded-lg border shadow-sm transition-shadow',
        palette[color as string] ?? palette.amber,
        selected ? 'ring-[3px] ring-brand/12' : 'hover:shadow-md',
      )}
    >
      <NodeResizer isVisible={selected} minWidth={180} minHeight={110} />
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <StickyNote className="size-3" />
        <span className="flex-1 text-[11px] font-medium tracking-wide uppercase opacity-70">
          Note
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="opacity-0 transition-opacity group-hover/note:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            removeNode(id);
          }}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </div>
      <textarea
        value={text as string}
        onChange={(e) => update(id, { text: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        spellCheck={false}
        className="h-full w-full resize-none bg-transparent px-2.5 pb-2.5 text-[12px] leading-relaxed outline-none placeholder:text-slate-400"
        placeholder="Write a note…"
      />
    </div>
  );
}
