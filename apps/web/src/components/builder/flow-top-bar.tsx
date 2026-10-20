'use client';

import Link from 'next/link';
import { useCallback, useRef } from 'react';
import { AlertTriangle, ChevronLeft, LoaderCircle, Pencil, Rocket, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LogoMark } from '@/components/brand/logo';
import { StatusPill } from '@/components/brand/status-pill';
import { ApiStatus } from '@/components/brand/api-status';
import { flushFlowSave, useFlowStore } from '@/lib/flow/store';

export function FlowTopBar() {
  const title = useFlowStore((s) => s.title);
  const status = useFlowStore((s) => s.status);
  const dirty = useFlowStore((s) => s.dirty);
  const saving = useFlowStore((s) => s.saving);
  const savedAt = useFlowStore((s) => s.savedAt);
  const saveError = useFlowStore((s) => s.saveError);
  const setTitle = useFlowStore((s) => s.setTitle);
  const toggleStatus = useFlowStore((s) => s.toggleStatus);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value);
    },
    [setTitle],
  );

  /** Ask the properties panel to switch to the phone simulator view. */
  const openPreview = useCallback(() => {
    window.dispatchEvent(new CustomEvent('opes:open-preview'));
  }, []);

  /* Publishing flips the status and writes graph + status in one request. */
  const handlePublish = useCallback(() => {
    toggleStatus();
    void flushFlowSave();
  }, [toggleStatus]);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/"
            aria-label="Back to all bots"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-title"
          >
            <ChevronLeft className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">All bots</TooltipContent>
      </Tooltip>

      <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="OpesChatbot workspace">
        <LogoMark size={24} />
      </Link>

      <div className="h-6 w-px bg-border" />

      <div className="group flex min-w-0 items-center gap-2">
        <input
          ref={inputRef}
          value={title}
          onChange={handleTitleChange}
          spellCheck={false}
          aria-label="Flow title"
          className="min-w-0 max-w-[26rem] truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[15px] font-semibold tracking-tight text-title transition-colors outline-none hover:border-border focus:border-ring/40 focus:bg-background"
        />
        <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        {status === 'live' ? (
          <StatusPill variant="live" label="Live" />
        ) : (
          <StatusPill variant="draft" label="Draft" />
        )}
        <SaveIndicator dirty={dirty} saving={saving} savedAt={savedAt} saveError={saveError} />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ApiStatus hideWhenOnline />

        <Button variant="outline" size="sm" onClick={openPreview}>
          <Smartphone className="size-3.5" />
          Phone Preview
        </Button>

        <Button size="sm" className="shadow-xs" onClick={handlePublish}>
          <Rocket className="size-3.5" />
          {status === 'live' ? 'Unpublish' : 'Publish'}
        </Button>
      </div>
    </header>
  );
}

function SaveIndicator({
  dirty,
  saving,
  savedAt,
  saveError,
}: {
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  saveError: string | null;
}) {
  if (saveError) {
    return (
      <button
        type="button"
        onClick={() => void flushFlowSave()}
        title={saveError}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-alert"
      >
        <AlertTriangle className="size-3" />
        Save failed — retry
      </button>
    );
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <LoaderCircle className="size-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <button
        type="button"
        onClick={() => void flushFlowSave()}
        className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
      >
        Unsaved — save now
      </button>
    );
  }
  if (savedAt) {
    return (
      <span className="text-[11px] text-muted-foreground/80">
        Saved {new Date(savedAt).toLocaleTimeString()}
      </span>
    );
  }
  return null;
}
