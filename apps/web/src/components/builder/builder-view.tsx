'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ReactFlowProvider } from '@xyflow/react';
import { LoaderCircle, Server, WifiOff, Workflow } from 'lucide-react';
import { FlowTopBar } from '@/components/builder/flow-top-bar';
import { Toolbox } from '@/components/builder/toolbox';
import { CanvasArea } from '@/components/builder/canvas/flow-canvas';
import { PropertiesPanel } from '@/components/builder/properties-panel';
import { Notice } from '@/components/brand/notice';
import { Button } from '@/components/ui/button';
import { FlowAnalysisProvider } from '@/lib/flow/analysis-context';
import { useFlowStore } from '@/lib/flow/store';
import { refreshFlows, useFlows } from '@/lib/flow/registry';

export function BuilderView({ flowId }: { flowId?: string }) {
  return (
    <ReactFlowProvider>
      <FlowAnalysisProvider>
        <BuilderLayout flowId={flowId} />
      </FlowAnalysisProvider>
    </ReactFlowProvider>
  );
}

function BuilderLayout({ flowId }: { flowId?: string }) {
  const hydrate = useFlowStore((s) => s.hydrate);
  const storeFlowId = useFlowStore((s) => s.flowId);
  const loading = useFlowStore((s) => s.loading);
  const loadError = useFlowStore((s) => s.error);
  const notFound = useFlowStore((s) => s.notFound);
  const { flows, status, error: flowsError } = useFlows();

  const [toolboxOpen, setToolboxOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);

  /* The bot list decides what "no ?flow=" means: open the most recent bot. */
  useEffect(() => {
    void refreshFlows();
  }, []);

  const requested = flowId?.trim();
  const targetId = requested || flows[0]?.id || null;

  /* Load the requested bot into the store. Done here (rather than in the
     canvas) so the flow id from the URL wins over the default. */
  useEffect(() => {
    if (targetId) void hydrate(targetId);
  }, [targetId, hydrate]);

  /* "Phone Preview" should reveal the panel if it's collapsed. */
  useEffect(() => {
    const handler = () => setPanelOpen(true);
    window.addEventListener('opes:open-preview', handler);
    return () => window.removeEventListener('opes:open-preview', handler);
  }, []);

  if (!targetId) {
    if (status === 'error') {
      return (
        <Notice
          icon={WifiOff}
          title="Can't reach the API"
          description={`${flowsError ?? 'The OpesChatbot API is not responding.'} Start it, then try again.`}
          action={<RetryButton />}
        />
      );
    }
    if (status === 'ready') {
      return (
        <Notice
          icon={Workflow}
          title="No bots yet"
          description="Create your first bot from the workspace, then open it here."
          action={
            <Button asChild size="sm">
              <Link href="/">Go to workspace</Link>
            </Button>
          }
        />
      );
    }
    return <Notice icon={LoaderCircle} title="Loading your bots…" spin />;
  }

  if (notFound) {
    return (
      <Notice
        icon={Server}
        title="Bot not found"
        description={`No bot with the id “${targetId}” exists in the API.`}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/">Back to workspace</Link>
          </Button>
        }
      />
    );
  }

  if (loadError) {
    return (
      <Notice
        icon={WifiOff}
        title="Couldn't load this bot"
        description={loadError}
        action={<RetryButton />}
      />
    );
  }

  if (loading || storeFlowId !== targetId) {
    return <Notice icon={LoaderCircle} title="Loading bot…" spin />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FlowTopBar />

      <div className="flex min-h-0 flex-1">
        <Toolbox collapsed={!toolboxOpen} onToggle={() => setToolboxOpen((open) => !open)} />

        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0">
            <CanvasArea />
          </div>
        </div>

        <PropertiesPanel collapsed={!panelOpen} onToggle={() => setPanelOpen((open) => !open)} />
      </div>
    </div>
  );
}

function RetryButton() {
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void refreshFlows();
          const id = useFlowStore.getState().flowId;
          if (id) void useFlowStore.getState().hydrate(id);
        }}
      >
        Try again
      </Button>
      <Button asChild size="sm" variant="ghost">
        <Link href="/">Workspace</Link>
      </Button>
    </div>
  );
}
