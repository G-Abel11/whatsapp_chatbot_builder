'use client';

import { useId, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import {
  Bold,
  Code,
  Italic,
  List,
  Plus,
  Quote,
  Smile,
  Strikethrough,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MAX_INTERACTIVE_BUTTONS, MAX_LIST_ROWS, type NodeField } from '@opes/shared';

/**
 * Progressive-disclosure form controls driven by the shared `NODE_FIELDS`
 * registry. Each editor takes the field descriptor + current value and reports
 * a fully-formed value; the parent routes it to `updateNodeConfig`.
 */

export interface FieldEditorProps {
  field: NodeField;
  value: unknown;
  onChange: (value: unknown) => void;
}

const INPUT_CLASS = 'h-8 px-2.5 text-[13px]';

function FieldShell({
  id,
  label,
  help,
  hint,
  children,
}: {
  id?: string;
  label: string;
  help?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-[12px] font-medium text-title">
          {label}
        </Label>
        {hint ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
      {help ? <p className="text-[11px] leading-snug text-muted-foreground">{help}</p> : null}
    </div>
  );
}

/* ── WhatsApp formatting tools ──────────────────────────────────────────────
   Meta renders *bold* _italic_ ~strikethrough~ ```monospace``` > quotes and
   • bullet lines inside free-form message text. These helpers wrap/unwrap the
   current selection with those markers; the raw markers are what gets saved
   (and what the engine sends to Meta verbatim). */

const EMOJIS = [
  '👋', '🙂', '😊', '😍', '🎉', '✅', '❌', '📦',
  '🔥', '⭐', '📍', '⏰', '💬', '🙏', '👍', '❤️',
  '😂', '😅', '🤝', '🚀', '📣', '💡', '🛒', '🎧',
];

type EditResult = { value: string; sel: [number, number] };

/** Wraps the selection in `marker`, or unwraps it when already wrapped. */
function wrapSelection(text: string, start: number, end: number, marker: string): EditResult {
  if (start === end) {
    const insert = marker + marker;
    return {
      value: text.slice(0, start) + insert + text.slice(end),
      sel: [start + marker.length, start + marker.length],
    };
  }
  const selected = text.slice(start, end);
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= 2 * marker.length) {
    const inner = selected.slice(marker.length, -marker.length);
    return { value: text.slice(0, start) + inner + text.slice(end), sel: [start, start + inner.length] };
  }
  const wrapped = marker + selected + marker;
  return {
    value: text.slice(0, start) + wrapped + text.slice(end),
    sel: [start + marker.length, start + marker.length + selected.length],
  };
}

/** Adds (or removes, when every line has one) `prefix` on each spanned line. */
function toggleLinePrefix(text: string, start: number, end: number, prefix: string): EditResult {
  const segStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  const segEnd = nl === -1 ? text.length : nl;
  const lines = text.slice(segStart, segEnd).split('\n');
  const allPrefixed = lines.every((l) => l.startsWith(prefix));
  const next = (allPrefixed ? lines.map((l) => l.slice(prefix.length)) : lines.map((l) => (l.startsWith(prefix) ? l : prefix + l))).join('\n');
  return { value: text.slice(0, segStart) + next + text.slice(segEnd), sel: [segStart, segStart + next.length] };
}

/** Drops `insert` at the caret, replacing any selection. */
function insertAt(text: string, start: number, end: number, insert: string): EditResult {
  return {
    value: text.slice(0, start) + insert + text.slice(end),
    sel: [start + insert.length, start + insert.length],
  };
}

function FormatToolbar({
  text,
  inputRef,
  onApply,
}: {
  text: string;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onApply: (next: string) => void;
}) {
  const apply = (fn: (t: string, s: number, e: number) => EditResult) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    const next = fn(text, start, end);
    onApply(next.value);
    // The controlled input keeps its DOM node; restore caret after re-render.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.sel[0], next.sel[1]);
    });
  };

  const toolClass =
    'flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground';

  return (
    <div className="mt-1 flex w-fit items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
      <button
        type="button"
        title="Bold — wraps selection in *asterisks*"
        className={cn(toolClass, 'font-bold')}
        onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '*'))}
      >
        <Bold className="size-3.5" />
      </button>
      <button
        type="button"
        title="Italic — wraps selection in _underscores_"
        className={cn(toolClass, 'font-serif italic')}
        onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '_'))}
      >
        <Italic className="size-3.5" />
      </button>
      <button
        type="button"
        title="Strikethrough — wraps selection in ~tildes~"
        className={cn(toolClass, 'line-through')}
        onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '~'))}
      >
        <Strikethrough className="size-3.5" />
      </button>
      <button
        type="button"
        title="Monospace — wraps selection in ```backticks```"
        className={cn(toolClass, 'font-mono text-[11px]')}
        onClick={() => apply((t, s, e) => wrapSelection(t, s, e, '```'))}
      >
        <Code className="size-3.5" />
      </button>
      <button
        type="button"
        title="Quote — prefixes the line with >"
        className={cn(toolClass)}
        onClick={() => apply((t, s, e) => toggleLinePrefix(t, s, e, '> '))}
      >
        <Quote className="size-3.5" />
      </button>
      <button
        type="button"
        title="Bullet — prefixes the line with •"
        className={cn(toolClass)}
        onClick={() => apply((t, s, e) => toggleLinePrefix(t, s, e, '• '))}
      >
        <List className="size-3.5" />
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" title="Insert emoji" className={toolClass}>
            <Smile className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-fit p-2">
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJIS.map((ch) => (
              <button
                key={ch}
                type="button"
                className="rounded p-1 text-base leading-none transition-colors hover:bg-accent"
                onClick={() => apply((t, s, e) => insertAt(t, s, e, ch))}
              >
                {ch}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Mini renderer showing the text the way WhatsApp will display it. */
function WhatsAppPreview({ text }: { text: string }) {
  if (!text.trim()) return null;
  const tokens = text.split(/(```[^`]+```)|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g);
  return (
    <div className="mt-1.5 space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Preview
      </span>
      <div
        title="How the customer will see it in WhatsApp"
        className="whitespace-pre-wrap rounded-md rounded-bl-sm bg-wa-soft px-2.5 py-1.5 text-[12.5px] leading-snug"
      >
        {tokens.map((part, i) => {
          if (!part) return null;
          if (i % 5 === 1) return <code key={i} className="rounded bg-background/70 px-1 font-mono text-[11.5px]">{part.slice(3, -3)}</code>;
          if (i % 5 === 2) return <strong key={i}>{part.slice(1, -1)}</strong>;
          if (i % 5 === 3) return <em key={i}>{part.slice(1, -1)}</em>;
          if (i % 5 === 4) return <s key={i} className="opacity-70">{part.slice(1, -1)}</s>;
          return <span key={i}>{part}</span>;
        })}
      </div>
    </div>
  );
}

export function TextField({ field, value, onChange }: FieldEditorProps) {
  const id = useId();
  const ref = useRef<HTMLInputElement | null>(null);
  const text = typeof value === 'string' ? value : '';
  return (
    <FieldShell
      id={id}
      label={field.label}
      help={field.help}
      hint={field.max ? `${text.length}/${field.max}` : undefined}
    >
      <Input
        id={id}
        ref={ref}
        value={text}
        placeholder={field.placeholder}
        maxLength={field.max}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
      {field.formatting ? (
        <FormatToolbar text={text} inputRef={ref} onApply={onChange} />
      ) : null}
      {field.formatting ? <WhatsAppPreview text={text} /> : null}
    </FieldShell>
  );
}

export function TextareaField({ field, value, onChange }: FieldEditorProps) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const text = typeof value === 'string' ? value : '';
  return (
    <FieldShell
      id={id}
      label={field.label}
      help={field.help}
      hint={field.max ? `${text.length}/${field.max}` : undefined}
    >
      <Textarea
        id={id}
        ref={ref}
        value={text}
        rows={field.rows ?? 3}
        placeholder={field.placeholder}
        maxLength={field.max}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-0 resize-y px-2.5 py-2 text-[13px] leading-relaxed"
      />
      {field.formatting ? (
        <FormatToolbar text={text} inputRef={ref} onApply={onChange} />
      ) : null}
      {field.formatting ? <WhatsAppPreview text={text} /> : null}
    </FieldShell>
  );
}

export function NumberField({ field, value, onChange }: FieldEditorProps) {
  const id = useId();
  const raw = typeof value === 'number' ? String(value) : '';
  return (
    <FieldShell id={id} label={field.label} help={field.help}>
      <div className="relative">
        <Input
          id={id}
          type="number"
          value={raw}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={cn(INPUT_CLASS, field.suffix && 'pr-9')}
        />
        {field.suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-muted-foreground">
            {field.suffix}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
}

export function SelectField({ field, value, onChange }: FieldEditorProps) {
  const id = useId();
  const current = typeof value === 'string' ? value : '';
  return (
    <FieldShell id={id} label={field.label} help={field.help}>
      <Select value={current || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className={cn('w-full', INPUT_CLASS)}>
          <SelectValue placeholder={field.placeholder ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-[13px]">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

export function ToggleField({ field, value, onChange }: FieldEditorProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="text-[12px] font-medium text-title">
          {field.label}
        </Label>
        {field.help ? (
          <p className="text-[11px] leading-snug text-muted-foreground">{field.help}</p>
        ) : null}
      </div>
      <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

export function TagsField({ field, value, onChange }: FieldEditorProps) {
  const [draft, setDraft] = useState('');
  const tags = Array.isArray(value) ? (value as unknown[]).filter((v): v is string => typeof v === 'string') : [];

  const commit = (raw: string) => {
    const next = raw.trim().replace(/,$/, '');
    if (next && !tags.includes(next)) onChange([...tags, next]);
    setDraft('');
  };

  return (
    <FieldShell label={field.label} help={field.help} hint={tags.length ? String(tags.length) : undefined}>
      <div className="rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <div className="flex flex-wrap items-center gap-1.5 p-2">
          {tags.map((tag, i) => (
            <span
              key={`${tag}_${i}`}
              className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-[12px] font-medium text-brand"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
                className="rounded-full p-0.5 hover:bg-brand/10"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commit(draft);
              }
              if (e.key === 'Backspace' && !draft && tags.length > 0) {
                onChange(tags.slice(0, -1));
              }
            }}
            onBlur={() => commit(draft)}
            placeholder={tags.length === 0 ? (field.placeholder ?? 'Type and press Enter') : ''}
            className="min-w-20 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </FieldShell>
  );
}

interface Pair {
  id: string;
  key: string;
  value: string;
}

function normalizePairs(value: unknown): Pair[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, i) => {
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      id: typeof record.id === 'string' ? record.id : `row_${i}`,
      key: typeof record.key === 'string' ? record.key : '',
      value: typeof record.value === 'string' ? record.value : '',
    };
  });
}

export function KeyValueField({ field, value, onChange }: FieldEditorProps) {
  const pairs = normalizePairs(value);
  const patch = (i: number, next: Partial<Pair>) =>
    onChange(pairs.map((pair, idx) => (idx === i ? { ...pair, ...next } : pair)));
  const remove = (i: number) => onChange(pairs.filter((_, idx) => idx !== i));
  const add = () => onChange([...pairs, { id: `row_${nanoid(5)}`, key: '', value: '' }]);

  return (
    <FieldShell label={field.label} help={field.help} hint={pairs.length ? String(pairs.length) : undefined}>
      <div className="space-y-1.5">
        {pairs.map((pair, i) => (
          <div key={pair.id} className="flex items-center gap-1.5">
            <Input
              value={pair.key}
              placeholder="Key"
              onChange={(e) => patch(i, { key: e.target.value })}
              className={INPUT_CLASS}
            />
            <Input
              value={pair.value}
              placeholder="Value"
              onChange={(e) => patch(i, { value: e.target.value })}
              className={INPUT_CLASS}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(i)}
              aria-label="Remove row"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="xs"
          onClick={add}
          className="w-full border-dashed text-muted-foreground"
        >
          <Plus className="size-3" /> Add row
        </Button>
      </div>
    </FieldShell>
  );
}

interface OptionRow {
  id: string;
  label: string;
}

function normalizeOptions(value: unknown): OptionRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, i) => {
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      id: typeof record.id === 'string' ? record.id : `opt_${i}`,
      label:
        typeof record.label === 'string'
          ? record.label
          : typeof record.title === 'string'
            ? record.title
            : '',
    };
  });
}

export interface OptionsFieldProps extends FieldEditorProps {
  listMode?: boolean;
  titleMaxLength?: number;
}

export function OptionsField({ field, value, onChange, listMode, titleMaxLength }: OptionsFieldProps) {
  const options = normalizeOptions(value);
  const cap = listMode ? MAX_LIST_ROWS : (field.max ?? MAX_INTERACTIVE_BUTTONS);
  const titleCap = titleMaxLength ?? 20;
  const full = options.length >= cap;

  const patch = (i: number, label: string) =>
    onChange(options.map((option, idx) => (idx === i ? { ...option, label } : option)));
  const remove = (i: number) => onChange(options.filter((_, idx) => idx !== i));
  const add = () => onChange([...options, { id: `opt_${nanoid(5)}`, label: '' }]);

  return (
    <FieldShell label={field.label} help={field.help} hint={`${options.length}/${cap}`}>
      <div className="space-y-1.5">
        {options.map((option, i) => (
          <div key={option.id} className="flex items-center gap-1.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[11px] font-medium text-muted-foreground">
              {i + 1}
            </span>
            <Input
              value={option.label}
              maxLength={titleCap}
              placeholder={listMode ? 'Row title' : 'Button title'}
              onChange={(e) => patch(i, e.target.value)}
              className={INPUT_CLASS}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(i)}
              aria-label={`Remove ${option.label || 'option'}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="xs"
          disabled={full}
          onClick={add}
          className="w-full border-dashed text-muted-foreground"
        >
          <Plus className="size-3" />
          {listMode ? 'Add row' : 'Add button'} {full ? `· ${cap} max` : ''}
        </Button>
      </div>
    </FieldShell>
  );
}

interface CardRow {
  id: string;
  title: string;
  body: string;
  url: string;
}

function normalizeCards(value: unknown): CardRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, i) => {
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      id: typeof record.id === 'string' ? record.id : `card_${i}`,
      title: typeof record.title === 'string' ? record.title : '',
      body: typeof record.body === 'string' ? record.body : '',
      url: typeof record.url === 'string' ? record.url : '',
    };
  });
}

export function CardsField({ field, value, onChange }: FieldEditorProps) {
  const cards = normalizeCards(value);
  const cap = field.max ?? 10;
  const full = cards.length >= cap;

  const patch = (i: number, next: Partial<CardRow>) =>
    onChange(cards.map((card, idx) => (idx === i ? { ...card, ...next } : card)));
  const remove = (i: number) => onChange(cards.filter((_, idx) => idx !== i));
  const add = () => onChange([...cards, { id: `card_${nanoid(5)}`, title: '', body: '', url: '' }]);

  return (
    <FieldShell label={field.label} help={field.help} hint={`${cards.length}/${cap}`}>
      <div className="space-y-2">
        {cards.map((card, i) => (
          <div key={card.id} className="space-y-1.5 rounded-lg border border-border bg-background p-2">
            <div className="flex items-center gap-1.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[11px] font-medium text-muted-foreground">
                {i + 1}
              </span>
              <Input
                value={card.title}
                placeholder="Card title"
                onChange={(e) => patch(i, { title: e.target.value })}
                className={INPUT_CLASS}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(i)}
                aria-label={`Remove card ${card.title || i + 1}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <Textarea
              value={card.body}
              rows={2}
              placeholder="Short description"
              onChange={(e) => patch(i, { body: e.target.value })}
              className="min-h-0 resize-none px-2.5 py-1.5 text-[13px]"
            />
            <Input
              value={card.url}
              placeholder="https://…"
              onChange={(e) => patch(i, { url: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
        ))}
        <Button
          variant="outline"
          size="xs"
          disabled={full}
          onClick={add}
          className="w-full border-dashed text-muted-foreground"
        >
          <Plus className="size-3" />
          Add card {full ? `· ${cap} max` : ''}
        </Button>
      </div>
    </FieldShell>
  );
}
