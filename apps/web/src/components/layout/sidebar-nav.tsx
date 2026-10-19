'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Files, LayoutGrid, Settings2, Workflow } from 'lucide-react';
import { cn } from 'cn';
import { LogoMark, Wordmark } from '@/components/brand/logo';
import { ApiStatus } from '@/components/brand/api-status';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const NAV_ITEMS = [
  { href: '/', label: 'Workspace', icon: LayoutGrid, exact: true },
  { href: '/builder', label: 'Flow Builder', icon: Workflow, exact: false },
  { href: '/templates', label: 'Templates', icon: Files, exact: false },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <LogoMark size={28} />
        <Wordmark />
        <Badge
          variant="secondary"
          className="ml-auto rounded-full bg-brand-soft px-2 py-0 text-[10px] font-semibold tracking-wide text-brand uppercase"
        >
          Beta
        </Badge>
      </div>

      <Separator />

      {/* Workspace switcher placeholder */}
      <button
        type="button"
        className="mx-3 mt-3 flex items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 py-2 text-left transition-colors hover:bg-accent"
      >
        <Avatar className="size-7 rounded-md">
          <AvatarFallback className="rounded-md bg-brand text-[11px] font-semibold text-white">
            AR
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-tight font-medium text-title">
            Acme Retail
          </span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            +254 712 000 111
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {/* Navigation */}
      <nav className="mt-4 flex flex-1 flex-col gap-0.5 px-3">
        <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase">
          Workspace
        </p>
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30',
                active
                  ? 'bg-background text-title shadow-xs'
                  : 'text-muted-foreground hover:bg-accent hover:text-title',
              )}
            >
              <item.icon
                className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-muted-foreground')}
                strokeWidth={active ? 2.25 : 1.75}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
          <Avatar className="size-7">
            <AvatarFallback className="bg-brand-soft text-[11px] font-semibold text-brand">
              GA
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-tight font-medium text-title">
              Gift Abel
            </span>
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              Owner
            </span>
          </span>
          <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Settings">
            <Settings2 className="size-4" />
          </Button>
        </div>
        <ApiStatus className="justify-center" />
      </div>
    </aside>
  );
}
