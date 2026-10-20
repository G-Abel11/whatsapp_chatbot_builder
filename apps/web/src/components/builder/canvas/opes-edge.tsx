'use client';

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { cn } from 'cn';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFlowStore } from '@/lib/flow/store';

export function OpesEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    selected,
    style,
  } = props;
  const removeEdges = useFlowStore((s) => s.removeEdges);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        className="transition-colors"
      />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          className="group nodrag nopan absolute pointer-events-auto"
        >
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              className={cn(
                'size-6 rounded-full border bg-background shadow-sm transition-all hover:border-brand hover:text-brand',
                selected ? 'opacity-100' : 'opacity-80 hover:opacity-100',
              )}
              title="Insert node between"
              onClick={(e) => {
                e.stopPropagation();
                // open command palette at flow position
                const ev = new CustomEvent('opes:insert-on-edge', {
                  detail: { edgeId: id, x: labelX, y: labelY },
                });
                window.dispatchEvent(ev);
              }}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className={cn(
                'size-6 rounded-full border bg-background text-muted-foreground shadow-sm transition-all hover:border-destructive hover:text-destructive',
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
              title="Delete connection"
              onClick={(e) => {
                e.stopPropagation();
                removeEdges([id]);
              }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
