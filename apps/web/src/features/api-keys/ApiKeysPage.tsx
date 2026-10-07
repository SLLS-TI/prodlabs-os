'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGlobalExternalClient } from '@/services/teams.service';
import ApiKeysContent from './components/ApiKeysContent';

// A key resolves to the owner's full account, so an external client — a user whose only
// standing anywhere is client-role project memberships — may not hold one. The page is
// outside the project shell, so the external-client signal comes from the team list.
// Sent to the app root while external; nothing renders, so the key list query never
// runs for them (the API refuses it too). Fails closed: renders nothing until the
// signal resolves.
export default function ApiKeysPage() {
  const router = useRouter();
  const isExternalClient = useGlobalExternalClient();

  useEffect(() => {
    if (isExternalClient === true) router.replace('/');
  }, [isExternalClient, router]);

  if (isExternalClient !== false) return null;
  return <ApiKeysContent />;
}
