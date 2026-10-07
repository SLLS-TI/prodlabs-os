'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Upload, Trash2 } from 'lucide-react';
import ProjectLogo from '@/components/common/ProjectLogo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useStorageSettingsQuery } from '@/services/storage.service';

// The raster image types the API accepts. The API enforces the real limits; this
// only narrows the file picker.
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/avif';

// Captures a logo file for a project that does not exist yet. NewProjectModal
// uploads it to the project-scoped endpoint once the project is created. Shows a
// local preview of the pick; with none, the name's initials fallback.
export default function NewProjectLogoField({
  name,
  file,
  onFileChange,
}: {
  name: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
}) {
  const t = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const maxAvatarMb = useStorageSettingsQuery().data?.maxAvatarMb;

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setError(null);
    if (maxAvatarMb && picked.size > maxAvatarMb * 1024 * 1024) {
      setError(t('logoTooLarge', { mb: maxAvatarMb }));
      return;
    }
    onFileChange(picked);
  }

  return (
    <div className="space-y-1.5">
      <Label>{t('logo')}</Label>
      <div className="flex items-center gap-3">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="size-10 rounded-md object-cover"
          />
        ) : (
          <ProjectLogo name={name} className="size-10 text-base" />
        )}
        <div className="flex gap-2">
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            {file ? t('changeLogo') : t('uploadLogo')}
          </Button>
          {file && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              onClick={() => {
                setError(null);
                onFileChange(null);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
