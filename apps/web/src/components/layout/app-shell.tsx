'use client';

import { usePathname } from 'next/navigation';
import { SidebarNav } from './sidebar-nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The builder owns the full viewport width — its top bar carries the way
  // back — so the global sidebar steps aside there.
  const hideSidebar = pathname.startsWith('/builder');

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {!hideSidebar && <SidebarNav />}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
