'use client';

import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { ProjectDetail } from '@/lib/api/endpoints/projects';
import { useShell } from '@/context/shellContext';
import { settingsSection } from '@/utils/settingsSections';
import { useSettingsSectionText } from '@/hooks/useSectionLabels';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjectFeatures } from '@/hooks/useProjectFeatures';
import { Button } from '@/components/ui/button';
import SectionPageView from '@/components/common/page/SectionPageView';
import RequirePermission from '@/components/common/permissions/RequirePermission';
import { SettingsResourceProvider } from './context/settingsPermission';
import SettingsSubtaskAutomation from './components/configuration/SettingsSubtaskAutomation';
import SettingsEstimates from './components/configuration/SettingsEstimates';
import SettingsClientMasking from './components/configuration/SettingsClientMasking';
import SettingsProjectResponsible from './components/configuration/SettingsProjectResponsible';
import SettingsAutoArchive from './components/configuration/SettingsAutoArchive';
import SettingsSlackChannel from './components/configuration/SettingsSlackChannel';
import SettingsHealthWeights from './components/configuration/SettingsHealthWeights';
import { useAutoArchiveForm } from './hooks/useAutoArchiveForm';
import { useEstimatesForm } from './hooks/useEstimatesForm';
import { useMaskingForm } from './hooks/useMaskingForm';
import { useResponsibleForm } from './hooks/useResponsibleForm';
import { useHealthWeightsForm } from './hooks/useHealthWeightsForm';
import { useSubtaskAutomationForm } from './hooks/useSubtaskAutomationForm';
import { useSlackChannelForm } from './hooks/useSlackChannelForm';

const section = settingsSection('configuration');

// The Configuration settings page (/:team/:projectKey/settings/configuration).
// Holds the subtask automations, the estimate kinds and the auto-archive
// thresholds; the Save in the page header writes all of them.
export default function SettingsConfigurationPage() {
  const { project } = useShell();
  if (!project) return null;
  return <ConfigurationPage project={project} />;
}

function ConfigurationPage({ project }: { project: ProjectDetail }) {
  const t = useTranslations('settings.configuration');
  const tCommon = useTranslations('common');
  const sectionText = useSettingsSectionText()(section.slug);
  const { can } = usePermissions();
  const features = useProjectFeatures();
  const subtasks = useSubtaskAutomationForm(project.project.ref);
  const estimates = useEstimatesForm(project.project);
  const masking = useMaskingForm(project.project);
  const responsible = useResponsibleForm(project.project);
  const archive = useAutoArchiveForm(project.project.ref);
  const slack = useSlackChannelForm(project.project.ref);
  const healthWeights = useHealthWeightsForm(project.project.ref);
  const saving =
    subtasks.saving ||
    estimates.saving ||
    masking.saving ||
    responsible.saving ||
    archive.saving ||
    healthWeights.saving;
  const loaded = subtasks.loaded && archive.loaded && healthWeights.loaded;

  async function save() {
    await subtasks.save();
    await estimates.save();
    await masking.save();
    await responsible.save();
    await archive.save();
    await healthWeights.save();
    toast.success(t('saved'));
  }

  return (
    <SectionPageView
      title={sectionText.label}
      description={sectionText.description}
      actions={
        can(section.resource, 'edit') ? (
          <Button size="sm" onClick={() => void save()} disabled={saving || !loaded}>
            {tCommon('save')}
          </Button>
        ) : undefined
      }
    >
      <SettingsResourceProvider resource={section.resource}>
        <RequirePermission resource={section.resource} action="read">
          <div className="space-y-10">
            {features.subtasks && <SettingsSubtaskAutomation form={subtasks} />}
            <SettingsEstimates form={estimates} />
            <SettingsClientMasking form={masking} />
            <SettingsProjectResponsible form={responsible} />
            <SettingsAutoArchive form={archive} />
            <SettingsSlackChannel form={slack} />
            <SettingsHealthWeights form={healthWeights} />
          </div>
        </RequirePermission>
      </SettingsResourceProvider>
    </SectionPageView>
  );
}
