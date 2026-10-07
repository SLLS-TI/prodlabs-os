import { useState } from 'react';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateProject } from '@/services/projects.service';
import { useTeamsQuery, useTeamProjectDefaultsQuery } from '@/services/teams.service';
import { useAiAgentsQuery } from '@/services/aiAgents.service';
import { uploadProjectLogo } from '@/lib/api/endpoints/projects';
import { qk } from '@/services/queryKeys';
import { normalizeKey, suggestKey } from '@/utils/projectKey';
import type { PresetKey } from '@/utils/projectPresets';
import Modal from '@/components/common/overlay/Modal';
import { Button } from '@/components/ui/button';
import CopyProjectForm from '@/components/layout/CopyProjectForm';
import NewProjectForm from '@/components/layout/NewProjectForm';
import { allSelected, type CopyInclude } from '@/components/layout/CopyProjectOptions';

// Creates a project, or — when `copyFrom` is set — copies that project's structure
// (states, issue types, labels, custom fields) into a new project without its
// issues. `teamId` is the team the project belongs to; a copy is always made within
// the source project's team.
export default function NewProjectModal({
  onClose,
  onCreated,
  teamId,
  copyFrom,
}: {
  onClose: () => void;
  onCreated: (projectKey: string) => void;
  teamId: number;
  copyFrom?: { id: number; name: string; description: string };
}) {
  const t = useTranslations('newProject');
  const initialName = copyFrom ? t('copyName', { name: copyFrom.name }) : '';
  const [key, setKey] = useState(() => suggestKey(initialName));
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(copyFrom?.description ?? '');
  // Once the user edits the key, stop deriving it from the name. Clearing the
  // key field resumes auto-generation.
  const [keyEdited, setKeyEdited] = useState(false);
  // Which parts of the source project to copy. Defaults to everything; the user
  // clears what they don't want.
  const [include, setInclude] = useState<CopyInclude>(allSelected);
  // Which issue types the new project starts with. A copy takes its types from the
  // source project, so the preset applies only when creating from scratch.
  const [preset, setPreset] = useState<PresetKey>('general');
  // A logo chosen before the project exists. Uploaded to the project-scoped
  // endpoint once creation succeeds. Only the create-from-scratch form offers it.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const createProject = useCreateProject();
  const qc = useQueryClient();
  // Names the team in the header, so the dialog says where the project lands.
  const teams = useTeamsQuery().data;
  const team = teams?.find((one) => one.id === teamId);
  const defaults = useTeamProjectDefaultsQuery(copyFrom ? null : teamId).data;
  const agents = useAiAgentsQuery(copyFrom ? null : teamId).data ?? [];
  const defaultAgentNames = agents
    .filter((agent) => defaults?.defaultAgentIds.includes(agent.id))
    .map((agent) => agent.name);

  function onNameChange(value: string) {
    setName(value);
    if (!keyEdited) setKey(suggestKey(value));
  }

  function onKeyChange(value: string) {
    const next = normalizeKey(value);
    setKey(next);
    setKeyEdited(next !== '');
  }

  function submit() {
    const input = {
      key: key.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim(),
      ...(copyFrom ? { include } : { preset }),
    };
    createProject.mutate(
      { teamId, copyFromId: copyFrom?.id, input },
      {
        onSuccess: async (project) => {
          // Create first, then upload the logo to the project-scoped endpoint. A
          // failed upload must not block creation — the project already exists, so
          // surface a non-blocking error and still navigate to it.
          if (logoFile) {
            try {
              await uploadProjectLogo(project.ref, logoFile);
              void qc.invalidateQueries({ queryKey: qk.projects });
              void qc.invalidateQueries({ queryKey: qk.anyTeam });
            } catch {
              toast.error(t('logoUploadFailed'));
            }
          }
          onCreated(project.ref);
        },
      },
    );
  }

  return (
    <Modal
      title={copyFrom ? t('copyTitle', { name: copyFrom.name }) : t('title')}
      scope={
        team && (
          <>
            <Users className="size-3.5" />
            {team.name}
          </>
        )
      }
      onClose={onClose}
      wide="xl"
      className="pb-3"
    >
      <div className="flex min-h-0 flex-col">
        {/* On a short viewport the form scrolls on its own so the submit button
            stays in place instead of sitting below the fold. */}
        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {copyFrom ? (
            <CopyProjectForm
              name={name}
              projectKey={key}
              description={description}
              include={include}
              onNameChange={onNameChange}
              onKeyChange={onKeyChange}
              onDescriptionChange={setDescription}
              onIncludeChange={setInclude}
            />
          ) : (
            <NewProjectForm
              name={name}
              projectKey={key}
              description={description}
              preset={preset}
              logoFile={logoFile}
              onNameChange={onNameChange}
              onKeyChange={onKeyChange}
              onDescriptionChange={setDescription}
              onPresetChange={setPreset}
              onLogoChange={setLogoFile}
            />
          )}
          {!copyFrom && defaultAgentNames.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              {t('defaultAgents', { names: defaultAgentNames.join(', ') })}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end border-t pt-3">
          <Button
            disabled={createProject.isPending || !key.trim() || !name.trim()}
            onClick={submit}
          >
            {t(copyFrom ? 'copyAction' : 'create')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
