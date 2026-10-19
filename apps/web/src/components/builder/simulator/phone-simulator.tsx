'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, RotateCcw, Send } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { simulateFlow, type SimulateAction } from '@/lib/api/simulate';
import { flushFlowSave, useFlowStore } from '@/lib/flow/store';
import type { SimMessage, SimPendingOption, SimState } from '@/lib/flow/simulate';

/**
 * Phase 6b — the phone preview, run by the real execution engine.
 *
 * Each turn posts to `POST /flows/{id}/simulate`, which walks the *saved* flow
 * with the same Python runner that processes webhooks. So this panel shows what
 * a customer would actually receive: typed answers become variables and appear
 * in later messages, invalid input is rejected with the configured retry,
 * conditions decide themselves, and hand-off/close genuinely end the chat.
 *
 * Edits are flushed to the API before restarting, so the walkthrough always
 * reflects the canvas rather than a stale copy of it.
 */

const EDIT_SETTLE_MS = 500;

interface PreviewState {
  messages: SimMessage[];
  pending: SimState['pending'] | null;
  ended: boolean;
  status: 'active' | 'handed_off' | 'closed';
}

const EMPTY_PREVIEW: PreviewState = {
  messages: [],
  pending: null,
  ended: false,
  status: 'active',
};

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'The preview could not run.';
}

export function PhoneSimulator() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const flowId = useFlowStore((s) => s.flowId);
  const loading = useFlowStore((s) => s.loading);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);

  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW);
  const [runnerState, setRunnerState] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  /** Bumped on every turn so a superseded response can't overwrite the view. */
  const turnRef = useRef(0);
  /** Always points at the current start function (kept out of effect deps). */
  const startRef = useRef<(seed?: string) => Promise<void>>(async () => {});
  /** The node "Start at selected" pinned, cleared by Restart. */
  const seed = useRef<string | undefined>(undefined);
  const skipFirstRun = useRef(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const pending = preview.pending;
  const isTyping = !busy && pending?.type === 'input';

  /* ── Turns ─────────────────────────────────────────────────────────── */

  const startPreview = useCallback(async (seedNode?: string): Promise<void> => {
    if (!flowId) return;
    const generation = ++turnRef.current;
    setBusy(true);
    setError(null);
    setDraft('');
    setPreview(EMPTY_PREVIEW);
    setRunnerState(null);
    try {
      const turn = await simulateFlow(flowId, { state: null, startNodeId: seedNode });
      if (turnRef.current !== generation) return;
      setPreview({
        messages: turn.messages,
        pending: turn.pending,
        ended: turn.ended,
        status: turn.status,
      });
      setRunnerState(turn.state);
    } catch (caught) {
      if (turnRef.current !== generation) return;
      setError(describeError(caught));
    } finally {
      if (turnRef.current === generation) setBusy(false);
    }
  }, [flowId]);

  startRef.current = startPreview;

  const advance = useCallback(
    async (action: SimulateAction): Promise<void> => {
      if (!flowId || !runnerState) return;
      const generation = ++turnRef.current;
      const echo: SimMessage = {
        id: `local_${generation}`,
        nodeId: pending?.nodeId ?? '',
        role: 'customer',
        type: 'text',
        text: action.type === 'input' ? action.text : action.label,
      };
      setPreview((current) => ({ ...current, messages: [...current.messages, echo] }));
      setBusy(true);
      setError(null);
      try {
        const turn = await simulateFlow(flowId, { state: runnerState, action });
        if (turnRef.current !== generation) return;
        setPreview((current) => ({
          messages: [...current.messages, ...turn.messages],
          pending: turn.pending,
          ended: turn.ended,
          status: turn.status,
        }));
        setRunnerState(turn.state);
      } catch (caught) {
        if (turnRef.current !== generation) return;
        setError(describeError(caught));
      } finally {
        if (turnRef.current === generation) setBusy(false);
      }
    },
    [flowId, pending, runnerState],
  );

  /* ── Start / restart rules ─────────────────────────────────────────── */

  // Load the saved flow once the bot is ready.
  useEffect(() => {
    if (!flowId || loading) return;
    if (skipFirstRun.current) {
      skipFirstRun.current = false;
      void startRef.current();
    }
  }, [flowId, loading]);

  // An edit settles → save it, then restart so the preview mirrors the canvas.
  useEffect(() => {
    if (!flowId || loading || skipFirstRun.current) return;
    if (!useFlowStore.getState().dirty) return; // hydration, selection, …
    const timer = setTimeout(() => {
      void (async () => {
        await flushFlowSave();
        const failure = useFlowStore.getState().saveError;
        if (failure) {
          setError(`Couldn't save your edits — the preview would be stale. ${failure}`);
          return;
        }
        await startRef.current(seed.current);
      })();
    }, EDIT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [flowId, loading, nodes, edges]);

  /* ── Scrolling ─────────────────────────────────────────────────────── */

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [preview.messages.length, pending, preview.ended, busy, error]);

  /* ── Actions ───────────────────────────────────────────────────────── */

  const restart = () => {
    seed.current = undefined;
    void startRef.current();
  };

  const retry = () => void startRef.current(seed.current);

  const startAtSelected = () => {
    if (!selectedNodeId) return;
    seed.current = selectedNodeId;
    void startRef.current(selectedNodeId);
  };

  const send = () => {
    if (!isTyping) return;
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void advance({ type: 'input', text });
  };

  const choose = (option: SimPendingOption) => {
    if (busy || !option.id) return;
    void advance({ type: 'choice', id: option.id, label: option.label });
  };

  /* ── Status line ───────────────────────────────────────────────────── */

  const status = error
    ? 'Preview unavailable'
    : busy
      ? 'Running…'
      : preview.ended
        ? preview.status === 'handed_off'
          ? 'Handed off to a human'
          : preview.status === 'closed'
            ? 'Conversation closed'
            : 'End of path'
        : pending?.type === 'input'
          ? 'Waiting for a reply'
          : pending?.type === 'options'
            ? 'Waiting for a tap'
            : 'Running…';

  const emptyMenu = pending?.type === 'options' && pending.options.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <Button variant="outline" size="xs" onClick={restart}>
          <RotateCcw className="size-3" /> Restart
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={startAtSelected}
          disabled={!selectedNodeId}
          className="text-muted-foreground"
        >
          <Crosshair className="size-3" /> Start at selected
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            title="Runs the saved flow through the real execution engine — nothing is sent"
            className="rounded-full border border-brand/40 bg-brand/10 px-1.5 py-px text-[9px] font-semibold tracking-wide text-brand uppercase"
          >
            Engine
          </span>
          {status}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto bg-surface p-4">
        <div className="w-full max-w-[300px] overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 shadow-float">
          <div className="relative flex h-[540px] flex-col bg-[#ECE5DD]">
            <header className="flex items-center gap-2.5 bg-[#075E54] px-3 py-2.5 text-white">
              <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold">
                AR
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-tight font-medium">
                  Acme Retail
                </span>
                <span className="block text-[10px] leading-tight text-white/70">
                  WhatsApp Business · online
                </span>
              </span>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
              {error ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[11px] leading-snug text-amber-900">
                  <p className="font-semibold">{error}</p>
                  <button
                    type="button"
                    onClick={retry}
                    className="mt-1.5 rounded border border-amber-400 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100"
                  >
                    Try again
                  </button>
                </div>
              ) : null}

              {preview.messages.map((message, index) => (
                <MessageBubble
                  key={`${message.id}_${index}`}
                  message={message}
                  pending={pending}
                  onChooseOption={choose}
                />
              ))}

              {busy && preview.messages.length > 0 ? <TypingBubble /> : null}

              {emptyMenu && !busy ? (
                <div className="rounded-md bg-white/70 px-2 py-1.5 text-center text-[10px] font-medium text-slate-500">
                  This menu has no options yet — the customer has nothing to tap.
                </div>
              ) : null}

              {preview.ended && !error ? (
                <div className="pt-1 text-center">
                  <span className="inline-flex rounded-md bg-white/70 px-2 py-1 text-[10px] font-medium text-slate-500">
                    End of flow
                  </span>
                  <button
                    type="button"
                    onClick={restart}
                    className="mt-2 block w-full rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:border-brand hover:text-brand"
                  >
                    Restart walkthrough
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 bg-[#F0F2F5] px-2 py-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={!isTyping}
                placeholder={
                  isTyping && pending?.type === 'input' ? pending.placeholder : 'Preview only'
                }
                className="h-9 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 text-[12px] text-slate-700 outline-none placeholder:text-slate-400 disabled:bg-white/60"
              />
              <button
                type="button"
                onClick={send}
                disabled={!isTyping}
                aria-label="Send reply"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#00A884] text-white transition-colors hover:bg-[#019a79] disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-end">
      <div className="flex gap-1 rounded-lg rounded-tr-none bg-[#D9FDD3] px-3 py-2.5 shadow-sm">
        <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

/**
 * The WhatsApp bubble (bot / customer) and the system marker, including the
 * option buttons at a menu.
 */
function MessageBubble({
  message,
  pending,
  onChooseOption,
}: {
  message: SimMessage;
  pending: SimState['pending'];
  /** A tapped menu button/row, carrying the engine's reply id. */
  onChooseOption?: (option: SimPendingOption) => void;
}) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="rounded-md bg-white/70 px-2 py-1 text-center text-[10px] font-medium text-slate-500">
          {message.text}
        </span>
      </div>
    );
  }

  const isBot = message.role === 'bot';
  const options = pending?.type === 'options' && pending.nodeId === message.nodeId ? pending : null;

  return (
    <div className={cn('flex', isBot ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[85%] space-y-1">
        {message.type === 'template' ? (
          <span className="block text-[9px] font-semibold tracking-wide text-[#008069]/70 uppercase">
            Template · {message.templateName} · {message.language}
          </span>
        ) : null}
        <div
          className={cn(
            'rounded-lg px-2.5 py-1.5 text-[12px] leading-snug text-slate-800 shadow-sm',
            isBot ? 'rounded-tr-none bg-[#D9FDD3]' : 'rounded-tl-none bg-white',
          )}
        >
          <MessageContent message={message} />
        </div>
        {options ? (
          <div className="space-y-1">
            {message.type === 'list' ? (
              <p className="text-right text-[9px] font-semibold tracking-wide text-slate-400 uppercase">
                List menu
              </p>
            ) : null}
            {options.options.map((option, index) => (
              <button
                key={`${option.label}_${index}`}
                type="button"
                onClick={() => onChooseOption?.(option)}
                disabled={!option.id}
                className="block w-full rounded-md border border-[#00A884]/40 bg-white px-2 py-1.5 text-[12px] font-medium text-[#008069] transition-colors hover:bg-[#00A884]/10 disabled:opacity-50"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageContent({ message }: { message: SimMessage }) {
  switch (message.type) {
    case 'media':
      return (
        <div className="space-y-1">
          <div className="flex h-20 items-center justify-center rounded-md bg-slate-200/70 text-[10px] font-medium tracking-wide text-slate-500 uppercase">
            {message.mediaType ?? 'media'}
          </div>
          {message.caption ? <p>{message.caption}</p> : null}
          {message.mediaUrl ? (
            <p className="truncate text-[10px] text-slate-400">{message.mediaUrl}</p>
          ) : null}
        </div>
      );
    case 'buttons':
    case 'list':
      return (
        <div className="space-y-0.5">
          {message.text ? <p>{message.text}</p> : null}
          {message.footer ? <p className="pt-0.5 text-[10px] text-slate-400">{message.footer}</p> : null}
        </div>
      );
    case 'template':
      return <p>{message.text ?? `Template: ${message.templateName}`}</p>;
    case 'carousel':
      return (
        <div className="space-y-1.5">
          {message.text ? <p>{message.text}</p> : null}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(message.cards ?? []).map((card) => (
              <div
                key={card.id}
                className="w-28 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white"
              >
                <div className="h-12 bg-slate-200/70" />
                <div className="p-1.5">
                  <p className="truncate text-[11px] font-medium text-slate-800">{card.title}</p>
                  {card.body ? <p className="line-clamp-2 text-[10px] text-slate-500">{card.body}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 'location':
      return (
        <div className="space-y-1">
          {message.text ? <p>{message.text}</p> : null}
          <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-[#008069]">
            <span aria-hidden>📍</span> Share location
          </div>
        </div>
      );
    case 'webview':
      return (
        <div className="space-y-1">
          {message.text ? <p>{message.text}</p> : null}
          <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-[#008069]">
            <span aria-hidden>🔗</span> Open page
          </div>
        </div>
      );
    case 'text':
    default:
      return <p>{message.text}</p>;
  }
}
