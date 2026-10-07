import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import Shell from '@/components/layout/Shell';

// The project layout owns the planner Shell (sidebar, header, overlays, project
// data) and renders the active child route inside it. The sidebar open/collapsed
// state is persisted in the `sidebar_state` cookie by SidebarProvider; read it
// here so the sidebar renders in its last state on first paint (no flicker).
//
// The `project_color` cookie ("<ref>|<hex>") holds the last-viewed project's tint,
// written by the Shell. Applying its color on first paint avoids a flash of the
// untinted background on a within-project reload. The active project ref is not
// available to this layout segment ([teamRef]; the project key is a deeper
// segment), so the stored color is applied unconditionally; on a cross-project
// switch the client overwrites it once the project loads.
export default async function ProjectLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const defaultSidebarOpen = cookieStore.get('sidebar_state')?.value !== 'false';
  const initialColor = cookieStore.get('project_color')?.value?.split('|')[1];
  return (
    <Shell defaultSidebarOpen={defaultSidebarOpen} initialColor={initialColor}>
      {children}
    </Shell>
  );
}
