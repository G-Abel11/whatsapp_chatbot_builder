'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, LoaderCircle, Plus, RefreshCw, Trash, WifiOff, Workflow } from 'lucide-react';
import { StatusPill } from '@/components/brand/status-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MOCK_TENANTS } from '@/lib/mock/tenancy';
import { createFlow, deleteFlow, refreshFlows, useFlows, type FlowSummary } from '@/lib/flow/registry';

const TENANT_NAMES = new Map(MOCK_TENANTS.map((tenant) => [tenant.id, tenant.name]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Deterministic (locale-independent) formatting so SSR and the client agree. */
function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function WorkspaceHome() {
  const { flows, status, error } = useFlows();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void refreshFlows();
  }, []);

  const openDialog = () => {
    setName('');
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const flow = await createFlow(name);
      setDialogOpen(false);
      router.push(`/builder?flow=${flow.id}`);
    } catch (cause) {
      toast.error(errorMessage(cause, 'Could not create the bot.'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (flow: FlowSummary) => {
    try {
      await deleteFlow(flow.id);
      toast.success(`Deleted “${flow.title}”.`);
    } catch (cause) {
      toast.error(errorMessage(cause, 'Could not delete the bot.'));
    }
  };

  const loading = (status === 'idle' || status === 'loading') && flows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-6">
        <h1 className="text-[15px] font-semibold tracking-tight text-title">Workspace</h1>
        <Badge
          variant="secondary"
          className="rounded-full bg-brand-soft px-2 py-0 text-[10px] font-semibold tracking-wide text-brand uppercase"
        >
          Beta
        </Badge>
        <Button size="sm" className="ml-auto shadow-xs" onClick={openDialog}>
          <Plus className="size-3.5" />
          New bot
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight text-title">Your bots</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Open a bot to keep building, start a new one, or dig into a live conversation.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Bots list */}
            <Card className="gap-0 overflow-hidden py-0 lg:col-span-2">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
                <Workflow className="size-4 text-brand" />
                <h3 className="text-[13px] font-semibold text-title">Bots</h3>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {flows.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto text-muted-foreground"
                  aria-label="Refresh bots"
                  disabled={status === 'loading'}
                  onClick={() => void refreshFlows()}
                >
                  <RefreshCw className={status === 'loading' ? 'size-3.5 animate-spin' : 'size-3.5'} />
                </Button>
              </div>

              {loading ? (
                <LoadingRows />
              ) : status === 'error' && flows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-surface text-alert">
                    <WifiOff className="size-5" />
                  </span>
                  <div>
                    <p className="text-[13px] font-medium text-title">Can&apos;t reach the API</p>
                    <p className="mx-auto mt-1 max-w-sm text-[12px] text-muted-foreground">
                      {error ?? 'The OpesChatbot API is not responding.'} Bots live in the backend, so
                      there is nothing to show until it is running.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void refreshFlows()}>
                    Try again
                  </Button>
                </div>
              ) : flows.length > 0 ? (
                <ul className="divide-y divide-border">
                  {flows.map((flow) => (
                    <BotRow key={flow.id} flow={flow} onDelete={handleDelete} />
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  No bots yet — create your first one.
                </p>
              )}
            </Card>

            {/* Actions */}
            <div className="flex flex-col gap-5">
              <Card className="gap-0 border-dashed py-7">
                <button
                  type="button"
                  onClick={openDialog}
                  className="group flex flex-col items-center gap-3 px-6 text-center outline-none"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl border border-dashed border-border bg-surface text-muted-foreground transition-colors group-hover:border-brand/50 group-hover:text-brand">
                    <Plus className="size-5" />
                  </span>
                  <span>
                    <span className="block text-[13px] font-medium text-title">Add new bot</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Start from a blank canvas
                    </span>
                  </span>
                </button>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New bot</DialogTitle>
            <DialogDescription>
              Give your bot a name — you can rename it any time from the builder.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !creating) void handleCreate();
            }}
            placeholder="e.g. Product Recommendations"
            aria-label="Bot name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating && <LoaderCircle className="size-3.5 animate-spin" />}
              Create &amp; open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LoadingRows() {
  return (
    <ul className="divide-y divide-border" aria-busy aria-label="Loading bots">
      {[0, 1, 2].map((index) => (
        <li key={index} className="flex items-center gap-3 px-5 py-3.5">
          <span className="size-9 shrink-0 animate-pulse rounded-lg bg-secondary" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-40 animate-pulse rounded bg-secondary" />
            <span className="block h-2.5 w-56 animate-pulse rounded bg-secondary" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function BotRow({
  flow,
  onDelete,
}: {
  flow: FlowSummary;
  onDelete: (flow: FlowSummary) => void;
}) {
  const tenant = TENANT_NAMES.get(flow.tenantId);
  const meta = [`v${flow.version}`, tenant, `updated ${formatUpdatedAt(flow.updatedAt)}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="group/row flex items-center">
      <Link
        href={`/builder?flow=${flow.id}`}
        className="group flex min-w-0 flex-1 items-center gap-3 px-5 py-3.5 transition-colors hover:bg-accent/60"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors group-hover:border-brand/40 group-hover:text-brand">
          <Workflow className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-title">{flow.title}</span>
            {flow.status === 'live' ? (
              <StatusPill variant="live" label="Live" />
            ) : (
              <StatusPill variant="draft" label="Draft" />
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{meta}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${flow.title}`}
            className="mr-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-destructive"
          >
            <Trash className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{flow.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the bot and its flow from the API. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => onDelete(flow)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
