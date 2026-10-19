'use client';

import { useMemo, useState } from 'react';
import { FileText, Files, Search } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/brand/empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusPill, type StatusPillVariant } from '@/components/brand/status-pill';
import { MOCK_TEMPLATES, type TemplateCategory, type TemplateStatus, type WhatsAppTemplate } from '@/lib/mock/templates';
import { MOCK_TENANTS } from '@/lib/mock/tenancy';
import {
  TEMPLATE_CATEGORY_LABEL,
  TEMPLATE_STATUS_LABEL,
  formatDate,
  languageLabel,
} from '@/lib/whatsapp-display';

const STATUS_VARIANT: Record<TemplateStatus, StatusPillVariant> = {
  approved: 'approved',
  pending: 'pending',
  rejected: 'rejected',
  paused: 'neutral',
};

const CATEGORY_CLASS: Record<TemplateCategory, string> = {
  MARKETING: 'bg-brand-soft text-brand',
  UTILITY: 'bg-wa-soft text-wa',
  AUTHENTICATION: 'bg-logic-soft text-logic',
};

/**
 * Phase 4 · View C — the approved Meta templates with a live WhatsApp preview.
 */
export function TemplatesView() {
  const tenant = MOCK_TENANTS[0];
  const approvedCount = MOCK_TEMPLATES.filter((tpl) => tpl.status === 'approved').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-6">
        <h1 className="text-[15px] font-semibold tracking-tight text-title">Templates</h1>
        <Badge
          variant="secondary"
          className="rounded-full bg-brand-soft px-2 py-0 text-[10px] font-semibold tracking-wide text-brand uppercase"
        >
          {tenant?.name ?? 'Workspace'}
        </Badge>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Files className="size-3.5 text-wa" />
          {approvedCount} approved
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <TemplatesTab />
      </div>
    </div>
  );
}

function TemplatesTab() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | TemplateStatus>('all');
  const [category, setCategory] = useState<'all' | TemplateCategory>('all');
  const [selectedId, setSelectedId] = useState<string | null>(MOCK_TEMPLATES[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_TEMPLATES.filter((tpl) => {
      if (status !== 'all' && tpl.status !== status) return false;
      if (category !== 'all' && tpl.category !== category) return false;
      if (q) {
        const haystack = `${tpl.name} ${tpl.body} ${tpl.header ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [query, status, category]);

  const selected = filtered.find((tpl) => tpl.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(value) => setStatus(value as 'all' | TemplateStatus)}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(value) => setCategory(value as 'all' | TemplateCategory)}
        >
          <SelectTrigger className="w-[178px]" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="MARKETING">Marketing</SelectItem>
            <SelectItem value="UTILITY">Utility</SelectItem>
            <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-3">
          {filtered.length > 0 ? (
            filtered.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                active={template.id === selected?.id}
                onSelect={() => setSelectedId(template.id)}
              />
            ))
          ) : (
            <Card className="gap-0 py-10">
              <EmptyState
                compact
                icon={Files}
                title="No templates match"
                description="Try a different search term or clear the filters."
              />
            </Card>
          )}
        </div>

        <div className="min-w-0 self-start lg:sticky lg:top-6">
          {selected ? <TemplatePreview template={selected} /> : null}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  active,
  onSelect,
}: {
  template: WhatsAppTemplate;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border bg-background p-4 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
        active
          ? 'border-brand shadow-sm ring-1 ring-brand/15'
          : 'border-border hover:border-slate-300 hover:shadow-sm',
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground">
        <FileText className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-[13px] font-medium text-title">{template.name}</span>
          <Badge
            variant="secondary"
            className={cn(
              'rounded-full px-2 py-0 text-[10px] font-semibold',
              CATEGORY_CLASS[template.category],
            )}
          >
            {TEMPLATE_CATEGORY_LABEL[template.category]}
          </Badge>
          <span className="text-[11px] text-muted-foreground">{languageLabel(template.language)}</span>
        </span>
        <span className="mt-1 block truncate text-[12px] text-muted-foreground">{template.body}</span>
        <span className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            {template.buttons.length} {template.buttons.length === 1 ? 'button' : 'buttons'}
          </span>
          <span aria-hidden>·</span>
          <span>updated {formatDate(template.updatedAt)}</span>
        </span>
      </span>

      <StatusPill
        variant={STATUS_VARIANT[template.status]}
        label={TEMPLATE_STATUS_LABEL[template.status]}
      />
    </button>
  );
}

function TemplatePreview({ template }: { template: WhatsAppTemplate }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Preview
        </p>
        <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[1.25rem] border border-slate-900/10 bg-[#ECE5DD] shadow-sm">
          <div className="flex items-center gap-2 bg-[#075E54] px-3 py-2 text-white">
            <span className="flex size-7 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold">
              AR
            </span>
            <span className="text-[12px] font-medium">Acme Retail</span>
            <span className="ml-auto text-[9px] text-white/70">Business</span>
          </div>
          <div className="space-y-2 p-3">
            <div className="ml-auto max-w-[92%] space-y-1 rounded-lg rounded-tr-none bg-[#D9FDD3] px-2.5 py-2 text-[12px] leading-snug text-slate-800 shadow-sm">
              {template.header ? <p className="font-semibold">{template.header}</p> : null}
              <p className="whitespace-pre-wrap">{template.body}</p>
              {template.footer ? <p className="text-[10px] text-slate-400">{template.footer}</p> : null}
              <p className="pt-0.5 text-right text-[9px] text-slate-400">12:04</p>
            </div>
            {template.buttons.length > 0 ? (
              <div className="space-y-1 pt-0.5">
                {template.buttons.map((label) => (
                  <div
                    key={label}
                    className="rounded-md border border-[#00A884]/40 bg-white px-2 py-1.5 text-center text-[12px] font-medium text-[#008069]"
                  >
                    {label}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <dl className="overflow-hidden rounded-xl border border-border bg-background text-[12px]">
        <MetaRow
          label="Status"
          value={
            <StatusPill
              variant={STATUS_VARIANT[template.status]}
              label={TEMPLATE_STATUS_LABEL[template.status]}
            />
          }
        />
        <MetaRow label="Category" value={TEMPLATE_CATEGORY_LABEL[template.category]} />
        <MetaRow label="Language" value={languageLabel(template.language)} />
        <MetaRow label="Buttons" value={String(template.buttons.length)} />
        <MetaRow label="Updated" value={formatDate(template.updatedAt)} />
        <MetaRow
          label="Template ID"
          value={<code className="font-mono text-[11px] text-muted-foreground">{template.id}</code>}
        />
      </dl>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-title">{value}</dd>
    </div>
  );
}
