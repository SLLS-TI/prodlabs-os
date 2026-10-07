'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { ProjectDetail } from '@/lib/api/endpoints/projects';
import { useUpdateProject } from '@/services/projects.service';
import { usePermissions } from '@/hooks/usePermissions';

export interface GeneralForm {
  key: string;
  name: string;
  description: string;
  // The per-project background tint, a hex string, or null for no tint.
  color: string | null;
  logoUrl: string | null;
  setName: (v: string) => void;
  setDescription: (v: string) => void;
  setColor: (v: string | null) => void;
  // Only an owner may edit; others see the current values read-only.
  editable: boolean;
  saving: boolean;
  canSave: boolean;
  save: () => Promise<void>;
}

// Form state for the General settings page: the project name and description. The
// key is read-only. Shared between the header Save button and the body fields, so
// it lives in a hook and is threaded into both.
export function useGeneralForm(project: ProjectDetail): GeneralForm {
  const t = useTranslations('settings.general');
  const { isOwner } = usePermissions();
  const {
    key,
    name: savedName,
    description: savedDescription,
    color: savedColor,
    logoUrl,
  } = project.project;
  const updateProject = useUpdateProject();

  const [name, setName] = useState(savedName);
  const [description, setDescription] = useState(savedDescription);
  const [color, setColor] = useState<string | null>(savedColor);

  const trimmedName = name.trim();
  const dirty =
    trimmedName !== savedName || description !== savedDescription || color !== savedColor;
  const canSave = isOwner && trimmedName.length > 0 && dirty && !updateProject.isPending;

  async function save() {
    await updateProject.mutateAsync({
      projectKey: key,
      patch: { name: trimmedName, description, color },
    });
    toast.success(t('saved'));
  }

  return {
    key,
    name,
    description,
    color,
    logoUrl,
    setName,
    setDescription,
    setColor,
    editable: isOwner,
    saving: updateProject.isPending,
    canSave,
    save,
  };
}
