'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from 'cn';
import { StatusPill } from './status-pill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { checkApiConnection } from '@/lib/api/connection';
import { useApiConnection } from '@/lib/api/use-connection';

/**
 * Whether the browser can reach the FastAPI service.
 *
 * The editor is API-backed, so this is the difference between "your bots" and a
 * blank screen — it belongs in the shell rather than buried in a settings page.
 * Click to re-check.
 */

let pinged = false;

export function ApiStatus({
  className,
  hideWhenOnline = false,
}: {
  className?: string;
  /** Render nothing while everything is fine (keeps crowded bars clean). */
  hideWhenOnline?: boolean;
}) {
  const { status, error, baseUrl } = useApiConnection();

  /* Ping once per page load, wherever this first renders. */
  useEffect(() => {
    if (pinged) return;
    pinged = true;
    void checkApiConnection();
  }, []);

  // Only shout about it when it's actually broken.
  if (hideWhenOnline && status !== 'offline') return null;

  if (status === 'online') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex', className)}>
            <StatusPill variant="live" label="API connected" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{baseUrl}</TooltipContent>
      </Tooltip>
    );
  }

  const checking = status === 'unknown' || status === 'checking';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void checkApiConnection()}
          aria-label={checking ? 'Checking the API connection' : 'API offline — retry'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors',
            checking
              ? 'bg-secondary text-secondary-foreground'
              : 'bg-alert-soft text-alert hover:bg-alert-soft/70',
            className,
          )}
        >
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              checking ? 'bg-slate-400 motion-safe:animate-pulse' : 'bg-alert',
            )}
          />
          {checking ? 'Checking API…' : 'API offline'}
          {!checking && <RefreshCw className="size-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72">
        {checking ? (
          <span>Contacting {baseUrl}</span>
        ) : (
          <span>
            Can&apos;t reach {baseUrl}
            {error ? ` — ${error}` : ''}. Start the API and click to retry.
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
