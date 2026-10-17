'use client';

import { Maximize2, Redo2, Undo2, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * View A · bottom toolbar — zoom controls, auto-layout and undo/redo.
 * Enabled against the canvas store in Phase 2.
 */
export function BottomToolbar() {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border bg-background/95 p-1 shadow-md backdrop-blur">
      <ToolButton label="Zoom out">
        <ZoomOut className="size-4" />
      </ToolButton>
      <span className="w-11 text-center text-xs font-medium text-muted-foreground tabular-nums">
        100%
      </span>
      <ToolButton label="Zoom in">
        <ZoomIn className="size-4" />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton label="Fit to view">
        <Maximize2 className="size-4" />
      </ToolButton>
      <ToolButton label="Auto-arrange nodes">
        <Wand2 className="size-4" />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton label="Undo" disabled>
        <Undo2 className="size-4" />
      </ToolButton>
      <ToolButton label="Redo" disabled>
        <Redo2 className="size-4" />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
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
