'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type ChangeEvent } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import ProjectLogo from '@/components/common/ProjectLogo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useStorageSettingsQuery } from '@/services/storage.service';
import { useUploadProjectLogo, useRemoveProjectLogo } from '@/services/projects.service';

// The raster image types the API accepts. The API enforces the real limits; this
// only narrows the file picker.
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/avif';

// The logo field of the General page. The upload saves immediately on pick, like
// the account avatar, rather than through the header Save button. Only an owner may
// change it; others see the current logo read-only.
export default function ProjectLogoUpload({
  projectKey,
  name,
  logoUrl,
  editable,
}: {
  projectKey: string;
  name: string;
  logoUrl: string | null;
  editable: boolean;
}) {
  const t = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const maxAvatarMb = useStorageSettingsQuery().data?.maxAvatarMb;

  const upload = useUploadProjectLogo();
  const remove = useRemoveProjectLogo();
  const busy = upload.isPending || remove.isPending;

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (maxAvatarMb && file.size > maxAvatarMb * 1024 * 1024) {
      setError(t('logoTooLarge', { mb: maxAvatarMb }));
      return;
    }
    upload.mutate({ projectKey, file });
  }

  return (
    <div className="space-y-1.5">
      <Label>{t('logo')}</Label>
      <div className="flex items-center gap-4">
        <ProjectLogo name={name} logoUrl={logoUrl} className="size-14 text-lg" />
        {editable && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={onPick}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                {upload.isPending
                  ? t('uploadingLogo')
                  : logoUrl
                    ? t('changeLogo')
                    : t('uploadLogo')}
              </Button>
              {logoUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    remove.mutate({ projectKey });
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {t('delete')}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('logoFormats')}
              {maxAvatarMb ? ` ${t('logoMaxSize', { mb: maxAvatarMb })}` : ''}
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
