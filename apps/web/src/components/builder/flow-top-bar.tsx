'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, KeyRound, LoaderCircle, Pencil, Rocket, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
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

  /** Ask the properties panel to switch to the phone simulator tab. */
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
        <div className="flex items-center gap-1.5">
          <PhoneNumberField />
          <BotCredentialsButton />
        </div>

        <div className="h-6 w-px bg-border" />

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

/**
 * The WhatsApp business number id that routes inbound messages to this bot —
 * the same value the webhook lookup uses (`Flow.phone_number_id`).
 */
function PhoneNumberField() {
  const phoneNumberId = useFlowStore((s) => s.phoneNumberId);
  const setPhoneNumberId = useFlowStore((s) => s.setPhoneNumberId);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors focus-within:border-ring/40">
          <Smartphone className="size-3.5 shrink-0" />
          <input
            value={phoneNumberId ?? ''}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Phone number ID"
            aria-label="WhatsApp phone number ID"
            spellCheck={false}
            className="w-32 bg-transparent text-[11px] text-title outline-none placeholder:text-muted-foreground/70"
          />
        </label>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        Routes incoming WhatsApp messages to this bot. Leave blank to fall back to the newest
        published bot.
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Per-bot Meta access token (write-only). The API only ever returns whether a
 * token is set, so the input shows a masked state, never the raw value.
 */
function BotCredentialsButton() {
  const hasAccessToken = useFlowStore((s) => s.hasAccessToken);
  const saveAccessToken = useFlowStore((s) => s.saveAccessToken);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback((next: boolean) => {
    setOpen(next);
    setDraft('');
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    const token = draft.trim();
    if (!token) return;
    setBusy(true);
    setError(null);
    const ok = await saveAccessToken(token);
    setBusy(false);
    if (ok) {
      setDraft('');
      setOpen(false);
    } else {
      setError('Could not save the token — is the API reachable?');
    }
  }, [draft, saveAccessToken]);

  const handleClear = useCallback(async () => {
    setBusy(true);
    setError(null);
    const ok = await saveAccessToken(null);
    setBusy(false);
    if (ok) {
      setDraft('');
      setOpen(false);
    } else {
      setError('Could not clear the token — is the API reachable?');
    }
  }, [saveAccessToken]);

  return (
    <Popover open={open} onOpenChange={reset}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="WhatsApp credentials"
              className="relative flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-ring/40 hover:text-title"
            >
              <KeyRound className="size-3.5" />
              {hasAccessToken && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 size-1.5 rounded-full bg-emerald-500 ring-2 ring-background"
                />
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-64">
          WhatsApp credentials
          {hasAccessToken ? ' — per-bot token set' : ' — using the server default'}
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>WhatsApp credentials</PopoverTitle>
          <PopoverDescription>
            This bot&apos;s own Meta access token, used to send on its behalf.
          </PopoverDescription>
        </PopoverHeader>

        <div className="mt-3 flex items-center gap-1.5 text-[12px]">
          {hasAccessToken ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
              <Check className="size-3.5" />
              Per-bot token set
            </span>
          ) : (
            <span className="text-muted-foreground">No token — using the server default</span>
          )}
        </div>

        <div className="mt-3 space-y-2">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave();
            }}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            aria-label="Meta access token"
            placeholder={hasAccessToken ? 'Replace token…' : 'EAAB…'}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-title outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring/40"
          />
          {error && <p className="text-[11px] font-medium text-alert">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleClear()}
              disabled={busy || !hasAccessToken}
              className="text-muted-foreground"
            >
              Clear
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={busy || !draft.trim()}>
              {busy && <LoaderCircle className="size-3.5 animate-spin" />}
              Save token
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
