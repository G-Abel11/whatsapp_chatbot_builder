import { SlidersHorizontal } from 'lucide-react';
import { BottomToolbar } from '@/components/builder/bottom-toolbar';
import { FlowTopBar } from '@/components/builder/flow-top-bar';
import { Toolbox } from '@/components/builder/toolbox';
import { EmptyState } from '@/components/brand/empty-state';
import { StatusPill } from '@/components/brand/status-pill';

export const metadata = { title: 'Flow Builder' };

export default function BuilderPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FlowTopBar />

      <div className="flex min-h-0 flex-1">
        <Toolbox />

        {/* Canvas */}
        <div className="relative min-w-0 flex-1">
          {/* 24-hour window timeline strip (enforced visually in Phase 2b) */}
          <div className="absolute inset-x-0 top-0 z-10 flex h-9 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
            <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              24-hour window
            </span>
            <div className="relative h-1.5 max-w-md flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-1/3 rounded-full bg-wa" />
            </div>
            <span className="text-[11px] text-muted-foreground">8h 12m remaining</span>
          </div>

          <div className="dot-grid h-full w-full">
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md rounded-xl border border-dashed border-border bg-background/80 p-2 backdrop-blur-sm">
                <EmptyState
                  title="Your canvas is ready"
                  description="Drag a node from the toolbox on the left, or click the + between two connected nodes to insert one with the command palette. The interactive canvas ships in Phase 2."
                />
              </div>
            </div>
          </div>

          <BottomToolbar />
        </div>

        {/* Properties panel + phone simulator */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <span className="text-[13px] font-medium text-title">Properties</span>
            <StatusPill variant="neutral" label="No node selected" className="ml-auto" />
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState
              compact
              icon={SlidersHorizontal}
              title="Nothing selected"
              description="Select a node on the canvas to edit its content, save responses to variables and preview it live in the phone simulator."
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
