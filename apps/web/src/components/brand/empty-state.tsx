import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-6 py-8' : 'gap-3 px-8 py-12',
        className,
      )}
    >
      {Icon ? (
        <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground">
          <Icon className="size-5" strokeWidth={1.75} />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-title">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
