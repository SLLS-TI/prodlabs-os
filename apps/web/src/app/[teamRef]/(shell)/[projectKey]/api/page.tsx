import ApiDocsPage from '@/features/api-docs/ApiDocsPage';
import RequireNotClient from '@/components/common/permissions/RequireNotClient';

export default function Page() {
  return (
    <RequireNotClient>
      <ApiDocsPage />
    </RequireNotClient>
  );
}
