'use client';

import { Maximize2, Plus, Redo2, Undo2, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore, useFlowHistory } from '@/lib/flow/store';
import { useCallback } from 'react';

export function BottomToolbar() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const autoLayout = useFlowStore((s) => s.autoLayout);
  const { canUndo, canRedo, undo, redo } = useFlowHistory();

  const handleFit = useCallback(() => fitView({ padding: 0.25, duration: 300 }), [fitView]);
  const handleZoomIn = useCallback(() => zoomIn({ duration: 200 }), [zoomIn]);
  const handleZoomOut = useCallback(() => zoomOut({ duration: 200 }), [zoomOut]);
  const handleLayout = useCallback(() => autoLayout('LR'), [autoLayout]);
  const handleUndo = useCallback(() => undo?.(), [undo]);
  const handleRedo = useCallback(() => redo?.(), [redo]);

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border bg-background/95 p-1 shadow-md backdrop-blur">
      <ToolButton label="Zoom out" onClick={handleZoomOut}>
        <ZoomOut className="size-4" />
      </ToolButton>
      <ToolButton label="Zoom in" onClick={handleZoomIn}>
        <ZoomIn className="size-4" />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton label="Fit to view" onClick={handleFit}>
        <Maximize2 className="size-4" />
      </ToolButton>
      <ToolButton label="Auto-arrange nodes" onClick={handleLayout}>
        <Wand2 className="size-4" />
      </ToolButton>
      <ToolButton
        label="Add node (Ctrl+K)"
        onClick={() => window.dispatchEvent(new CustomEvent('opes:open-palette'))}
      >
        <Plus className="size-4" />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={handleUndo}>
        <Undo2 className="size-4" />
      </ToolButton>
      <ToolButton label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={handleRedo}>
        <Redo2 className="size-4" />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          className="text-muted-foreground hover:text-title"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
