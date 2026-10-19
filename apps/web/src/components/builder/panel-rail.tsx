'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The slim strip shown in place of a side panel once it's collapsed. Keeps an
 * obvious, one-click affordance to bring the panel back.
 */
export function PanelRail({
  icon: Icon,
  label,
  title,
  side,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  side: 'left' | 'right';
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        'flex w-10 shrink-0 flex-col items-center gap-2 bg-surface py-2',
        side === 'left' ? 'border-r border-border' : 'border-l border-border',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={title}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-title"
          >
            <Icon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side === 'left' ? 'right' : 'left'}>{title}</TooltipContent>
      </Tooltip>
      <span className="mt-1 rotate-180 text-[11px] font-medium tracking-wide text-muted-foreground select-none [writing-mode:vertical-rl]">
        {label}
      </span>
    </div>
  );
}
