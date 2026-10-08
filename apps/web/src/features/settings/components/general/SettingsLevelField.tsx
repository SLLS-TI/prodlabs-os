import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { GeneralForm } from '../../hooks/useGeneralForm';

// The project level block of the General page: an emoji and a name shown beside the
// project to every viewer but a client. Only an owner may edit; others see the
// current emoji and name read-only.
export default function SettingsLevelField({ form }: { form: GeneralForm }) {
  const t = useTranslations('settings.general');
  const tCommon = useTranslations('common');
  const hasLevel = form.levelEmoji.trim() !== '';

  return (
    <div className="space-y-1.5">
      <Label>{t('level')}</Label>
      <p className="text-sm text-muted-foreground">{t('levelHint')}</p>
      {form.editable ? (
        <div className="space-y-2">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-level-emoji" className="text-xs text-muted-foreground">
                {t('levelEmoji')}
              </Label>
              <Input
                id="project-level-emoji"
                className="w-16 text-center text-lg"
                maxLength={16}
                value={form.levelEmoji}
                onChange={(e) => form.setLevelEmoji(e.target.value)}
                aria-invalid={!form.levelEmojiValid}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="project-level-name" className="text-xs text-muted-foreground">
                {t('levelName')}
              </Label>
              <Input
                id="project-level-name"
                maxLength={40}
                value={form.levelName}
                onChange={(e) => form.setLevelName(e.target.value)}
              />
            </div>
            {hasLevel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  form.setLevelEmoji('');
                  form.setLevelName('');
                }}
              >
                {tCommon('clear')}
              </Button>
            )}
          </div>
          {!form.levelEmojiValid && (
            <p className="text-sm text-destructive">{t('levelEmojiInvalid')}</p>
          )}
        </div>
      ) : hasLevel ? (
        <p className="text-sm">
          <span className="text-lg">{form.levelEmoji}</span>
          {form.levelName.trim() !== '' && ` ${form.levelName}`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('levelNone')}</p>
      )}
    </div>
  );
}
