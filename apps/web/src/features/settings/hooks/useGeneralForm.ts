'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { ProjectDetail } from '@/lib/api/endpoints/projects';
import { useUpdateProject } from '@/services/projects.service';
import { usePermissions } from '@/hooks/usePermissions';
import { isSingleEmoji } from '@/utils/emoji';
import { emojiDominantColor } from '@/utils/emojiColor';

export interface GeneralForm {
  key: string;
  name: string;
  description: string;
  // The per-project background tint, a hex string, or null for no tint.
  color: string | null;
  logoUrl: string | null;
  // The project level: the emoji and its name. The color is derived on save, not held
  // in form state. Empty emoji clears the level.
  levelEmoji: string;
  levelName: string;
  levelColor: string | null;
  setLevelEmoji: (v: string) => void;
  setLevelName: (v: string) => void;
  // Whether the current emoji is a valid single emoji (empty is valid: it clears).
  levelEmojiValid: boolean;
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
    levelEmoji: savedLevelEmoji,
    levelName: savedLevelName,
    levelColor: savedLevelColor,
  } = project.project;
  const updateProject = useUpdateProject();

  const [name, setName] = useState(savedName);
  const [description, setDescription] = useState(savedDescription);
  const [color, setColor] = useState<string | null>(savedColor);
  const [levelEmoji, setLevelEmoji] = useState(savedLevelEmoji ?? '');
  const [levelName, setLevelName] = useState(savedLevelName ?? '');

  const trimmedName = name.trim();
  const trimmedEmoji = levelEmoji.trim();
  const trimmedLevelName = levelName.trim();
  const levelEmojiValid = trimmedEmoji === '' || isSingleEmoji(trimmedEmoji);
  const dirty =
    trimmedName !== savedName ||
    description !== savedDescription ||
    color !== savedColor ||
    trimmedEmoji !== (savedLevelEmoji ?? '') ||
    trimmedLevelName !== (savedLevelName ?? '');
  const canSave =
    isOwner && trimmedName.length > 0 && dirty && levelEmojiValid && !updateProject.isPending;

  async function save() {
    const level =
      trimmedEmoji === ''
        ? { levelEmoji: null, levelName: null, levelColor: null }
        : {
            levelEmoji: trimmedEmoji,
            levelName: trimmedLevelName || null,
            levelColor: emojiDominantColor(trimmedEmoji),
          };
    await updateProject.mutateAsync({
      projectKey: key,
      patch: { name: trimmedName, description, color, ...level },
    });
    toast.success(t('saved'));
  }

  return {
    key,
    name,
    description,
    color,
    logoUrl,
    levelEmoji,
    levelName,
    levelColor: savedLevelColor,
    setLevelEmoji,
    setLevelName,
    levelEmojiValid,
    setName,
    setDescription,
    setColor,
    editable: isOwner,
    saving: updateProject.isPending,
    canSave,
    save,
  };
}
