import type { ReactNode } from 'react';
import RequireNotClient from '@/components/common/permissions/RequireNotClient';

// A client has no readable project-settings section, so a typed URL into /settings/*
// is sent to the project home rather than showing the shell with an access notice.
// Each settings page still gates its own content by permission; this closes the route.
export default function Layout({ children }: { children: ReactNode }) {
  return <RequireNotClient>{children}</RequireNotClient>;
}
