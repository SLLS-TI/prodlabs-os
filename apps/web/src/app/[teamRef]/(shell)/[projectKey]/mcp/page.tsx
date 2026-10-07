import McpServerPage from '@/features/mcp/McpServerPage';
import RequireNotClient from '@/components/common/permissions/RequireNotClient';

export default function Page() {
  return (
    <RequireNotClient>
      <McpServerPage />
    </RequireNotClient>
  );
}
