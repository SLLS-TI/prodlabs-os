'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useShellRoute } from '@/hooks/useShellRoute';
import { projectPath } from '@/utils/paths';
import { usePermissions } from '@/hooks/usePermissions';

// Full-page guard for a project-scoped page a client must not reach (the API docs and
// the MCP server page). A client is sent to the project home; everyone else sees the
// page. Fails closed: nothing renders until the viewer role is known, so the page does
// not flash before a client is redirected. The API enforces the same — this removes
// the typed-URL path, it is not the only boundary.
export default function RequireNotClient({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { role } = usePermissions();
  const { projectKey } = useShellRoute();

  useEffect(() => {
    if (role === 'client' && projectKey) router.replace(projectPath(projectKey));
  }, [role, projectKey, router]);

  if (role == null || role === 'client') return null;
  return <>{children}</>;
}
