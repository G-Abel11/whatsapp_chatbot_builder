import { Files } from 'lucide-react';
import { EmptyState } from '@/components/brand/empty-state';
import { StatusPill } from '@/components/brand/status-pill';

export const metadata = { title: 'Templates & Health' };

export default function TemplatesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-6">
        <h1 className="text-[15px] font-semibold tracking-tight text-title">
          Templates &amp; Tenant Health
        </h1>
        <StatusPill variant="neutral" label="Phase 4" />
      </header>

      <div className="dot-grid flex flex-1 items-center justify-center">
        <div className="max-w-md rounded-xl border border-dashed border-border bg-background/80 p-2 backdrop-blur-sm">
          <EmptyState
            icon={Files}
            title="Template manager & tenant health"
            description="Approved Meta templates with preview, plus connected phone numbers showing messaging limits, quality rating and display-name status. Built in Phase 4."
          />
        </div>
      </div>
    </div>
  );
}
