import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import { EmptyState } from './empty-state';

/**
 * Full-pane "there's nothing on the canvas" state — used by the builder and the
 * debugger while a bot loads, when it's missing, or when the API is unreachable.
 */
export function Notice({
  icon,
  title,
  description,
  action,
  spin = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Spin the icon (for loading states). */
  spin?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 items-center justify-center', className)}>
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={action}
        className={spin ? '[&_svg]:animate-spin' : undefined}
      />
    </div>
  );
}
