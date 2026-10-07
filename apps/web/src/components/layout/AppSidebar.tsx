'use client';

import { usePathname } from 'next/navigation';
import type { Project } from '@/lib/api/endpoints/projects';
import { useSettingsNavGroups } from '@/hooks/useSettingsNavGroups';
import { useSidebarSide } from '@/hooks/useSidebarSide';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';
import ProjectSwitcher from '@/components/layout/ProjectSwitcher';
import SidebarMainNav from '@/components/layout/SidebarMainNav';
import SidebarSettingsNav from '@/components/layout/SidebarSettingsNav';
import SidebarRunningTimers from '@/features/issue/components/SidebarRunningTimers';

// The app sidebar. It has two modes driven by the route: the main work
// navigation, and the project settings navigation reached through the "Project
// settings" entry. The project switcher header is shared by both modes; the footer
// holds the running timers in the work mode. Creating and deleting a project live
// in the team panel on Manage teams, not here.
export default function AppSidebar({
  projects,
  currentProjectKey,
  onSelectProject,
}: {
  projects: Project[];
  currentProjectKey: string | null;
  onSelectProject: (key: string) => void;
}) {
  const pathname = usePathname();
  const projectId = projects.find((p) => p.ref === currentProjectKey)?.id ?? null;

  // Settings mode is on whenever the route matches one of the settings nav items,
  // or the API docs / MCP pages, whose links sit in the settings Developer group.
  // Members and the AI Team pages are not in those groups, so they keep the main
  // sidebar.
  const settingsNav = useSettingsNavGroups(currentProjectKey);
  const onApiDocs = pathname.endsWith('/api');
  const onMcp = pathname.endsWith('/mcp');
  const settingsMode =
    settingsNav.groups.some((g) => g.items.some((i) => i.active)) || onApiDocs || onMcp;
  const side = useSidebarSide();

  return (
    <Sidebar collapsible="icon" side={side}>
      <SidebarHeader>
        <ProjectSwitcher
          projects={projects}
          currentProjectKey={currentProjectKey}
          onSelectProject={onSelectProject}
        />
      </SidebarHeader>

      <SidebarContent>
        {settingsMode ? (
          <SidebarSettingsNav projectKey={currentProjectKey} />
        ) : (
          <SidebarMainNav projectKey={currentProjectKey} projectId={projectId} />
        )}
      </SidebarContent>

      <SidebarFooter>{!settingsMode && <SidebarRunningTimers />}</SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
