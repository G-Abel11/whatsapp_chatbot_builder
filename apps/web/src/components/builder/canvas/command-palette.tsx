'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NODE_CATEGORIES, searchNodes, type NodeKind } from '@opes/shared';
import { NODE_ICONS } from '@/lib/node-icons';
import { cn } from 'cn';

export interface InsertContext {
  edgeId?: string;
  position?: { x: number; y: number };
}

/**
 * Spotlight-style quick add. Opens from the "+" button on an edge (inserts
 * between two nodes) or from anywhere else (adds at the canvas centre).
 */
export function CommandPalette({
  open,
  onOpenChange,
  context,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: InsertContext | null;
  onPick: (kind: NodeKind) => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchNodes(query), [query]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery('');
      }}
    >
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-4 pt-4 pb-1 text-left">
          <DialogTitle className="text-[15px]">
            {context?.edgeId ? 'Insert a node here' : 'Add a node'}
          </DialogTitle>
          <DialogDescription className="sr-only">Search and pick a node to insert</DialogDescription>
        </DialogHeader>

        <Command loop className="rounded-none">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search: send, condition, webhook, human takeover…"
            className="h-11 border-b border-border"
          />
          <CommandList className="max-h-[360px] px-1.5 py-1.5">
            <CommandEmpty className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              No nodes found.
            </CommandEmpty>
            {NODE_CATEGORIES.map((category) => {
              const items = results.filter((r) => r.category === category.id);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={category.id} heading={category.label}>
                  {items.map((node) => {
                    const Icon = NODE_ICONS[node.kind];
                    return (
                      <CommandItem
                        key={node.kind}
                        value={`${node.label} ${node.kind} ${category.label}`}
                        onSelect={() => onPick(node.kind)}
                        className="gap-2.5 rounded-lg py-2"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface">
                          <Icon className="size-3.5 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-title">
                            {node.label}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {node.description}
                          </span>
                        </span>
                        <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground/70')}>
                          {category.label}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
