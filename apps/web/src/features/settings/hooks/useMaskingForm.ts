import { useEffect, useState } from 'react';
import type { Project } from '@/lib/api/endpoints/projects';
import { usePermissions } from '@/hooks/usePermissions';
import { useUpdateMasking } from '../services/settings.service';

// The client-facing face user: the member a client-role viewer sees every team-member
// action attributed to, or null to fall back to the oldest owner. Owner-only, so a
// non-owner's form never writes. Saved by the Configuration page header with the rest of
// the page; the current value comes with the project payload the Shell already loaded.
export interface MaskingForm {
  editable: boolean;
  saving: boolean;
  save: () => Promise<void>;
  faceUserId: string | null;
  setFaceUserId: (v: string | null) => void;
}

export function useMaskingForm(project: Project): MaskingForm {
  const { isOwner } = usePermissions();
  const update = useUpdateMasking(project.ref);

  const [faceUserId, setFaceUserId] = useState(project.faceUserId);

  useEffect(() => {
    setFaceUserId(project.faceUserId);
  }, [project.faceUserId]);

  async function save() {
    if (!isOwner || faceUserId === project.faceUserId) return;
    await update.mutateAsync({ faceUserId });
  }

  return {
    editable: isOwner,
    saving: update.isPending,
    save,
    faceUserId,
    setFaceUserId,
  };
}
