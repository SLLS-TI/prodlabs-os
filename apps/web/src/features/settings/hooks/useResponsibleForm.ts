import { useEffect, useState } from 'react';
import type { Project } from '@/lib/api/endpoints/projects';
import { usePermissions } from '@/hooks/usePermissions';
import { useUpdateResponsible } from '../services/settings.service';

// The project's responsible member: the owner or member shown with name and avatar in
// every project listing, or null for none. Owner-only, so a non-owner's form never
// writes. Saved by the Configuration page header with the rest of the page; the current
// value comes with the project payload the Shell already loaded.
export interface ResponsibleForm {
  editable: boolean;
  saving: boolean;
  save: () => Promise<void>;
  responsibleUserId: string | null;
  setResponsibleUserId: (v: string | null) => void;
}

export function useResponsibleForm(project: Project): ResponsibleForm {
  const { isOwner } = usePermissions();
  const update = useUpdateResponsible(project.ref);

  const [responsibleUserId, setResponsibleUserId] = useState(project.responsibleUserId);

  useEffect(() => {
    setResponsibleUserId(project.responsibleUserId);
  }, [project.responsibleUserId]);

  async function save() {
    if (!isOwner || responsibleUserId === project.responsibleUserId) return;
    await update.mutateAsync({ responsibleUserId });
  }

  return {
    editable: isOwner,
    saving: update.isPending,
    save,
    responsibleUserId,
    setResponsibleUserId,
  };
}
