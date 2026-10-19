'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import {
  MAX_BUTTON_TITLE_CHARS,
  MAX_ROW_TITLE_CHARS,
  NODE_DEFINITIONS_BY_KIND,
  fieldsFor,
  type NodeField,
} from '@opes/shared';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FlowNode } from '@/lib/flow/types';
import { useFlowStore } from '@/lib/flow/store';
import { useNodeAnalysis } from '@/lib/flow/analysis-context';
import {
  CardsField,
  KeyValueField,
  NumberField,
  OptionsField,
  SelectField,
  TagsField,
  TextField,
  TextareaField,
  ToggleField,
} from './field-editors';

/**
 * Renders a node's editable properties straight from the shared `NODE_FIELDS`
 * registry, so the panel can never drift from what the execution engine
 * accepts. Advanced fields stay collapsed until asked for.
 */
export function NodeForm({ node }: { node: FlowNode }) {
  const kind = node.data.kind;
  const config = node.data.config;
  const updateNodeConfig = useFlowStore((s) => s.updateNodeConfig);
  const analysis = useNodeAnalysis(node.id);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fields = useMemo(() => fieldsFor(kind), [kind]);
  const basic = fields.filter((field) => !field.advanced);
  const advanced = fields.filter((field) => field.advanced);
  const definition = NODE_DEFINITIONS_BY_KIND[kind];

  useEffect(() => setShowAdvanced(false), [kind]);

  const renderField = (field: NodeField) => {
    const value = config[field.key];
    const onChange = (next: unknown) => updateNodeConfig(node.id, { [field.key]: next });

    switch (field.type) {
      case 'text':
        return <TextField key={field.key} field={field} value={value} onChange={onChange} />;
      case 'textarea':
        return <TextareaField key={field.key} field={field} value={value} onChange={onChange} />;
      case 'number':
        return <NumberField key={field.key} field={field} value={value} onChange={onChange} />;
      case 'select':
        return <SelectField key={field.key} field={field} value={value} onChange={onChange} />;
      case 'toggle':
        return <ToggleField key={field.key} field={field} value={value} onChange={onChange} />;
      case 'tags':
        return <TagsField key={field.key} field={field} value={value} onChange={onChange} />;
      case 'keyvalue':
        return <KeyValueField key={field.key} field={field} value={value} onChange={onChange} />;
      case 'options': {
        if (kind === 'carousel') {
          return <CardsField key={field.key} field={field} value={value} onChange={onChange} />;
        }
        const listMode = config.mode === 'list';
        return (
          <OptionsField
            key={field.key}
            field={field}
            value={value}
            onChange={onChange}
            listMode={listMode}
            titleMaxLength={listMode ? MAX_ROW_TITLE_CHARS : MAX_BUTTON_TITLE_CHARS}
          />
        );
      }
      case 'media':
      case 'duration':
        return <NumberField key={field.key} field={field} value={value} onChange={onChange} />;
      default:
        return null;
    }
  };

  const warnings = analysis.warnings;

  return (
    <div className="space-y-4">
      {definition.constraint ? (
        <div className="flex gap-2 rounded-lg border border-wa/25 bg-wa-soft px-3 py-2">
          <Info className="mt-0.5 size-3.5 shrink-0 text-wa" />
          <p className="text-[12px] leading-snug text-secondary-foreground">{definition.constraint}</p>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-lg border border-alert/40 bg-alert-soft px-3 py-2">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-alert">
            <AlertTriangle className="size-3.5" />
            {warnings.length} WhatsApp issue{warnings.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((warning, i) => (
              <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-secondary-foreground">
                <span className="text-alert" aria-hidden>
                  •
                </span>
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-4">{basic.map(renderField)}</div>

      {advanced.length > 0 ? (
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced} className="space-y-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between px-2 text-[12px] font-medium text-muted-foreground hover:text-title"
            >
              {showAdvanced ? 'Hide advanced options' : `Show advanced options (${advanced.length})`}
              <ChevronDown
                className={cn('size-3.5 transition-transform', showAdvanced && 'rotate-180')}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4">{advanced.map(renderField)}</CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
