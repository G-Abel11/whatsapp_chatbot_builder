'use client';

import { useState } from 'react';
import { ChevronDown, Pencil, Play, Rocket, Smartphone } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/brand/status-pill';

/**
 * View A · top bar — workspace switcher, inline-editable flow title,
 * Draft/Live pill, Test, Phone Preview toggle and Publish.
 * (Interactive behaviour such as publishing lands in Phase 2.)
 */
export function FlowTopBar() {
  const [title, setTitle] = useState('Sales Qualification Bot');
  const [status, setStatus] = useState<'draft' | 'live'>('draft');
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      {/* Workspace switcher */}
      <button
        type="button"
        className="hidden items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent md:flex"
      >
        Acme Retail
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {/* Inline editable title */}
      <div className="group flex min-w-0 items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          spellCheck={false}
          aria-label="Flow title"
          className="min-w-0 max-w-[22rem] truncate rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[15px] font-semibold tracking-tight text-title transition-colors outline-none hover:border-border focus:border-ring/40 focus:bg-background"
        />
        <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        {status === 'live' ? (
          <StatusPill variant="live" label="Live" />
        ) : (
          <StatusPill variant="draft" label="Draft" />
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm">
          <Play className="size-3.5" />
          Test
        </Button>

        <Button
          variant={previewOpen ? 'secondary' : 'outline'}
          size="sm"
          aria-pressed={previewOpen}
          onClick={() => setPreviewOpen((v) => !v)}
        >
          <Smartphone className="size-3.5" />
          Phone Preview
        </Button>

        <Button
          size="sm"
          className="shadow-xs"
          onClick={() => setStatus((s) => (s === 'live' ? 'draft' : 'live'))}
        >
          <Rocket className="size-3.5" />
          Publish
        </Button>
      </div>
    </header>
  );
}

export function FlowTopBarSkeleton({ className }: { className?: string }) {
  return <div className={cn('h-16 border-b border-border bg-background', className)} />;
}
