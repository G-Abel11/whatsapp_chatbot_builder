import { Bug } from 'lucide-react';
import { EmptyState } from '@/components/brand/empty-state';
import { StatusPill } from '@/components/brand/status-pill';

export const metadata = { title: 'Debug' };

export default function DebugPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-6">
        <h1 className="text-[15px] font-semibold tracking-tight text-title">Execution Debugging</h1>
        <StatusPill variant="neutral" label="Phase 5" />
      </header>

      <div className="dot-grid flex flex-1 items-center justify-center">
        <div className="max-w-md rounded-xl border border-dashed border-border bg-background/80 p-2 backdrop-blur-sm">
          <EmptyState
            icon={Bug}
            title="Step through a live conversation"
            description="Run a test conversation, watch the active path light up in green and inspect the webhook payload, Cloud API responses and step-by-step trace in the console. Built in Phase 5."
          />
        </div>
      </div>
    </div>
  );
}
