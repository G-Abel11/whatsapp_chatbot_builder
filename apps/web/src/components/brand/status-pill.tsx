import { cn } from 'cn';

export type StatusPillVariant =
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'live'
  | 'draft'
  | 'connected'
  | 'degraded'
  | 'neutral';

const VARIANTS: Record<StatusPillVariant, { box: string; dot: string }> = {
  approved: { box: 'bg-success-soft text-success', dot: 'bg-success' },
  pending: { box: 'bg-alert-soft text-alert', dot: 'bg-alert' },
  rejected: { box: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  live: { box: 'bg-wa-soft text-wa', dot: 'bg-wa' },
  draft: { box: 'bg-secondary text-secondary-foreground', dot: 'bg-slate-400' },
  connected: { box: 'bg-wa-soft text-wa', dot: 'bg-wa' },
  degraded: { box: 'bg-alert-soft text-alert', dot: 'bg-alert' },
  neutral: { box: 'bg-secondary text-secondary-foreground', dot: 'bg-slate-400' },
};

export function StatusPill({
  variant = 'neutral',
  label,
  className,
}: {
  variant?: StatusPillVariant;
  label: string;
  className?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        v.box,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', v.dot)} />
      {label}
    </span>
  );
}
