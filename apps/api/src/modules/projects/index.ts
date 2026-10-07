import { Elysia, t } from 'elysia';
import { mcpTool } from '#mcp/generate';
import { noContent } from '#shared/http';
import { HttpError } from '#shared/lib';
import { authContext } from '#shared/auth-context';
import { guards } from '#shared/guards';
import { isMaskableActor, requireUser, resolveMaskContext, type MaskContext } from '#shared/access';
import { isMcpRequest } from '#shared/mcp-request';
import { accessErrors, commonErrors, errors } from '#shared/responses';
import {
  getMemberContext,
  listAssigneeCandidates,
  type AssigneeCandidate,
} from '#modules/members/service';
import { getDefaultRoleId } from '#modules/roles/service';
import { canSeeTimeTracking } from './visibility';
import { listColumns } from '#modules/columns/service';
import { listIssueTypes } from '#modules/issue-types/service';
import { listLabels, listLabelGroups } from '#modules/labels/service';
import { listCustomFields } from '#modules/custom-fields/service';
import { getTeamMembership } from '#modules/teams/service';
import { listIssueTemplates } from '#modules/issue-templates/service';
import {
  AutoArchiveResponse,
  EstimatesResponse,
  HealthWeightsResponse,
  MaskingResponse,
  PROJECT_DESCRIPTION_LIMIT,
  ProjectBoardResponse,
  ProjectListResponse,
  ProjectLogoResponse,
  ProjectResponse,
  ProjectSettingsResponse,
  SlackProjectResponse,
  SubtaskAutomationResponse,
  copyProjectBody,
  createProjectBody,
  listProjectsQuery,
  logoParams,
  updateAutoArchiveBody,
  updateEstimatesBody,
  updateHealthWeightsBody,
  updateMaskingBody,
  updateProjectBody,
  updateProjectSettingsBody,
  updateSlackProjectBody,
  updateSubtaskAutomationBody,
  uploadLogoBody,
} from './model';
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  projectFeatures,
  setProjectFeatures,
  getAutoArchiveSettings,
  setAutoArchiveSettings,
  getSubtaskAutomationSettings,
  setSubtaskAutomationSettings,
  getSlackProjectSettings,
  setSlackProjectSettings,
  setEstimateSettings,
  setMaskingSettings,
  getHealthWeights,
  setHealthWeights,
} from './service';
import { copyProject } from './copy';
import { projectPreferences } from './preferences';
import { replaceProjectLogo, clearProjectLogo, readProjectLogo } from './logo';

// For a client viewer, reduces the assignee-candidate list to the viewing client plus a
// single face entry standing for the team, so the web resolves a masked assignee's chip
// to the face and a client can never read a team identity or enumerate the agency's
// other clients out of the scaffold. No email is carried for anyone but the viewer. A
// null mask (team/owner) returns the list unchanged.
function collapseAssignees(
  assignees: AssigneeCandidate[],
  mask: MaskContext | null,
): AssigneeCandidate[] {
  if (!mask) return assignees;
  const kept = assignees.filter((a) => a.userId === mask.viewerId);
  const hadMaskable = assignees.some((a) => isMaskableActor(mask, a.userId));
  if (!hadMaskable || !mask.face) return kept;
  const face = mask.face;
  if (kept.some((a) => a.userId === face.userId)) return kept;
  const faceEntry: AssigneeCandidate = {
    userId: face.userId,
    name: face.name ?? '',
    email: '',
    username: face.username,
    image: face.image,
    kind: 'member',
    agentKind: null,
    role: null,
    description: null,
    restrictedToUserId: null,
    canReadWorkItems: true,
  };
  return [faceEntry, ...kept];
}

export const projectRoutes = new Elysia({ name: 'projects', detail: { tags: ['Projects'] } })
  .use(authContext)
  .use(guards)
  .use(projectPreferences)
  .get(
    '/projects',
    ({ user, request, query }) =>
      listProjects(requireUser(user).id, {
        mcpOnly: isMcpRequest(request.headers),
        withPermissions: query.permissions === 'true',
        q: query.q,
        sort: query.sort,
        teamId: query.teamId,
      }),
    {
      query: listProjectsQuery,
      response: { 200: ProjectListResponse, ...errors(400, 401) },
      detail: {
        summary: 'List projects',
        description:
          'List the projects you are a member of, with their latest work-item activity timestamp. ' +
          'Search key, name, and description with q; filter by teamId; sort by key, name, created, ' +
          'or activity. Pass permissions=true to include your permission matrix on each.',
        ...mcpTool('list_projects'),
      },
    },
  )

  .post(
    '/projects',
    async ({ body, user, set }) => {
      set.status = 201;
      return createProject(body, requireUser(user).id);
    },
    {
      body: createProjectBody,
      response: { 201: ProjectResponse, ...errors(400, 401) },
      detail: {
        summary: 'Create a project',
        description:
          'Create a project you own. `key` is the immutable prefix for issue ids, unique within the team ' +
          "(e.g. 'MKT' -> 'MKT-1'). Seeds the default columns and the issue types of the " +
          'chosen `preset`.',
        ...mcpTool('create_project'),
      },
    },
  )

  .post(
    '/projects/:projectKey/copy',
    async ({ project, body, user, set }) => {
      const { include, ...meta } = body;
      set.status = 201;
      return await copyProject(project.id, meta, requireUser(user).id, include);
    },
    {
      body: copyProjectBody,
      teamRunsProject: true,
      response: { 201: ProjectResponse, ...commonErrors, ...errors(409) },
      detail: {
        summary: 'Copy a project',
        description:
          "Copy a project's configuration into a new project you own, without its issues. " +
          'Only an owner or a manager of the team that owns the source project may copy it. ' +
          'By default the structure (states, issue types, labels, custom fields, views, ' +
          'dashboards, documents, actions) is copied. Pass `include` to choose sections; the API ' +
          'force-enables dependencies (e.g. a view pulls in the states it references).',
        ...mcpTool('copy_project'),
      },
    },
  )

  // Full project view: columns, issue types, labels, issues, and the caller's own
  // effective access (role + resolved permission matrix) — everything the work
  // items UI needs in one call. Assignee options come from the project's members
  // and AI agents, fetched separately. The web app gates its UI off `viewer`; the
  // API still enforces the same matrix on every request.
  //
  // Open to any project member: the payload is the project's own naming (columns,
  // types, labels, fields) plus the caller's own access, not the work items
  // themselves. A role without work item access still needs it to open any page.
  .get(
    '/projects/:projectKey',
    async ({ project, user }) => {
      const userId = requireUser(user).id;
      const [
        columns,
        issueTypes,
        labels,
        labelGroups,
        assignees,
        customFields,
        issueTemplates,
        viewer,
        teamRole,
      ] = await Promise.all([
        listColumns(project.id),
        listIssueTypes(project.id),
        listLabels(project.id),
        listLabelGroups(project.id),
        listAssigneeCandidates(project.id),
        listCustomFields(project.id, { allTypes: true }),
        listIssueTemplates(project.id),
        getMemberContext(project.id, userId),
        getTeamMembership(project.teamId, userId),
      ]);
      // The permission guard already asserted membership, so a context always
      // exists here; guard against a race (membership revoked mid-request).
      if (!viewer) throw new HttpError(403, 'You do not have access to this project');
      const effectiveRoleId = viewer.roleId ?? (await getDefaultRoleId(project.teamId));
      const mask = await resolveMaskContext(project.id, user);
      return {
        project,
        columns,
        issueTypes,
        labels,
        labelGroups,
        assignees: collapseAssignees(assignees, mask),
        customFields,
        issueTemplates,
        viewer: { role: viewer.role, teamRole },
        permissions: viewer.permissions,
        canSeeTimeTracking: canSeeTimeTracking(
          viewer.role,
          effectiveRoleId,
          project.timeVisibleRoleIds,
        ),
      };
    },
    {
      projectMember: true,
      response: { 200: ProjectBoardResponse, ...accessErrors },
      detail: {
        summary: 'Get a project',
        description:
          'Get a project setup by key: columns, issue types, labels, custom fields, issue ' +
          'templates, and assignable users and agents. Resolves the ids create_issue and update_issue ' +
          'take. For issues use list_issues or search_issues.',
        ...mcpTool('get_project'),
      },
    },
  )

  // Updates a project's name, description, and a key that does not match the key
  // pattern (see updateProject). Owner-only.
  .patch(
    '/projects/:projectKey',
    async ({ project, body }) => {
      const updated = await updateProject(project.id, body);
      if (!updated) throw new HttpError(404, 'Project not found');
      return updated;
    },
    {
      body: updateProjectBody,
      projectOwner: true,
      response: { 200: ProjectResponse, ...commonErrors, ...errors(409) },
      detail: {
        summary: 'Update a project',
        description:
          "Update a project's name and/or description. The description is given to the " +
          `agents of the project in their system prompt; up to ${PROJECT_DESCRIPTION_LIMIT} ` +
          'characters. The key changes only when it does not match the key pattern: a key ' +
          'created before the pattern existed, for example one that starts with a digit. ' +
          'A key that another project of the team has is refused with 409.',
        ...mcpTool('update_project'),
      },
    },
  )

  // Uploads a custom logo for the project, replacing any previous one. Owner-only.
  .post(
    '/projects/:projectKey/logo',
    async ({ project, body }) => {
      const url = await replaceProjectLogo(project.id, project.logoUrl, body.file);
      return { logoUrl: url };
    },
    {
      body: uploadLogoBody,
      projectOwner: true,
      response: { 200: ProjectLogoResponse, ...errors(400, 401, 403, 404, 413, 502) },
      detail: { summary: "Upload the project's logo" },
    },
  )

  // Removes the project's logo, returning it to the name-initials fallback. Owner-only.
  .delete(
    '/projects/:projectKey/logo',
    async ({ project }) => {
      await clearProjectLogo(project.id, project.logoUrl);
      return noContent();
    },
    {
      projectOwner: true,
      response: { 204: t.Void(), ...accessErrors },
      detail: { summary: "Remove the project's logo" },
    },
  )

  // Reads the project's settings: whether it is reachable over MCP and which
  // optional sections are enabled. Any member may read. MCP reachability is reported
  // as the two flags behind it, so the page can say which one closed the project.
  .get(
    '/projects/:projectKey/settings',
    ({ project }) => ({
      mcpEnabled: project.mcpEnabled,
      teamMcpEnabled: project.teamMcpEnabled,
      features: projectFeatures(project),
    }),
    {
      projectMember: true,
      response: { 200: ProjectSettingsResponse, ...accessErrors },
      detail: { summary: "Get a project's settings" },
    },
  )

  // Updates the project's settings: which optional sections are on. Open to the
  // project's owner and to an owner or manager of the team that runs it. MCP
  // reachability is not here — it is the team's, set in its MCP settings.
  .patch(
    '/projects/:projectKey/settings',
    async ({ project, body }) => {
      let current = project;
      if (body.features !== undefined) {
        const updated = await setProjectFeatures(project.id, body.features);
        if (!updated) throw new HttpError(404, 'Project not found');
        current = updated;
      }
      return {
        mcpEnabled: current.mcpEnabled,
        teamMcpEnabled: current.teamMcpEnabled,
        features: projectFeatures(current),
      };
    },
    {
      body: updateProjectSettingsBody,
      projectAdmin: true,
      response: { 200: ProjectSettingsResponse, ...commonErrors },
      detail: { summary: "Update a project's settings" },
    },
  )

  // The workflow configuration — the auto-archive thresholds and the subtask
  // automations — is its own permission resource rather than part of the settings
  // payload above: a granted role reads or changes it without being an owner.
  .get(
    '/projects/:projectKey/settings/auto-archive',
    ({ project }) => getAutoArchiveSettings(project.id),
    {
      permission: ['workflow_config', 'read'],
      response: { 200: AutoArchiveResponse, ...accessErrors },
      detail: { summary: "Get a project's auto-archive thresholds" },
    },
  )

  // Sets both thresholds at once: a partial body would read as "leave the other
  // group as it is", which this endpoint does not do.
  .patch(
    '/projects/:projectKey/settings/auto-archive',
    ({ project, body }) => setAutoArchiveSettings(project.id, body),
    {
      body: updateAutoArchiveBody,
      permission: ['workflow_config', 'edit'],
      response: { 200: AutoArchiveResponse, ...commonErrors },
      detail: { summary: "Update a project's auto-archive thresholds" },
    },
  )

  .get(
    '/projects/:projectKey/settings/subtasks',
    ({ project }) => getSubtaskAutomationSettings(project.id),
    {
      permission: ['workflow_config', 'read'],
      response: { 200: SubtaskAutomationResponse, ...accessErrors },
      detail: { summary: "Get a project's subtask automations" },
    },
  )

  // Both automations are sent together, the same as the thresholds above.
  .patch(
    '/projects/:projectKey/settings/subtasks',
    ({ project, body }) => setSubtaskAutomationSettings(project.id, body),
    {
      body: updateSubtaskAutomationBody,
      permission: ['workflow_config', 'edit'],
      response: { 200: SubtaskAutomationResponse, ...commonErrors },
      detail: { summary: "Update a project's subtask automations" },
    },
  )

  // The Slack channel this project posts notifications and daily digests to. The
  // bot token is a team/instance setting; here only the channel and whether posting
  // is on. Owner-only, since it directs the project's activity to an external chat.
  .get(
    '/projects/:projectKey/settings/slack',
    ({ project }) => getSlackProjectSettings(project.id),
    {
      projectOwner: true,
      response: { 200: SlackProjectResponse, ...accessErrors },
      detail: { summary: "Get a project's Slack channel" },
    },
  )

  .patch(
    '/projects/:projectKey/settings/slack',
    ({ project, body }) => setSlackProjectSettings(project.id, body),
    {
      projectOwner: true,
      body: updateSlackProjectBody,
      response: { 200: SlackProjectResponse, ...commonErrors },
      detail: { summary: "Update a project's Slack channel" },
    },
  )

  // The estimate kinds the issues carry and whether members log the time they
  // spend. The current state comes with the project payload every member already
  // gets, so only the write lives here.
  .patch(
    '/projects/:projectKey/settings/estimates',
    async ({ project, body }) => {
      const updated = await setEstimateSettings(project.id, body);
      if (!updated) throw new HttpError(404, 'Project not found');
      return updated;
    },
    {
      body: updateEstimatesBody,
      permission: ['workflow_config', 'edit'],
      response: { 200: EstimatesResponse, ...commonErrors },
      detail: { summary: "Update a project's estimate kinds and time logging" },
    },
  )

  // Sets the client-facing face user: who a client-role member sees every team-member
  // action attributed to. Owner-only — the face user is security-sensitive, so it is
  // not folded into the editor-level estimates settings. The current value comes with
  // the project payload, so only the write lives here.
  .patch(
    '/projects/:projectKey/settings/masking',
    async ({ project, body }) => {
      const updated = await setMaskingSettings(project.id, body);
      if (!updated) throw new HttpError(404, 'Project not found');
      return updated;
    },
    {
      body: updateMaskingBody,
      projectOwner: true,
      response: { 200: MaskingResponse, ...commonErrors },
      detail: { summary: "Set a project's client-facing face user" },
    },
  )

  // The weights for this project's health score in the god stats view. Configured here
  // rather than in god mode: it is the team's judgement of what matters for the project.
  // Read with workflow_config read so a granted non-owner sees them; written with edit.
  .get(
    '/projects/:projectKey/settings/health-weights',
    ({ project }) => getHealthWeights(project),
    {
      permission: ['workflow_config', 'read'],
      response: { 200: HealthWeightsResponse, ...accessErrors },
      detail: { summary: "Get a project's health-score weights" },
    },
  )

  .patch(
    '/projects/:projectKey/settings/health-weights',
    async ({ project, body }) => {
      const updated = await setHealthWeights(project.id, body);
      if (!updated) throw new HttpError(404, 'Project not found');
      return updated;
    },
    {
      body: updateHealthWeightsBody,
      permission: ['workflow_config', 'edit'],
      response: { 200: HealthWeightsResponse, ...commonErrors },
      detail: { summary: "Update a project's health-score weights" },
    },
  )

  // Permanently removes the project and everything scoped to it. Irreversible.
  // Owner-only.
  .delete(
    '/projects/:projectKey',
    async ({ project }) => {
      await deleteProject(project.id);
      return noContent();
    },
    {
      permission: ['danger_zone', 'delete'],
      response: { 204: t.Void(), ...accessErrors },
      detail: {
        summary: 'Delete a project',
        description: 'Permanently delete a project and everything in it. Irreversible.',
        ...mcpTool('delete_project'),
      },
    },
  );

// Public preview URL for a project logo. Its own top-level path (not under
// /projects/:projectKey) so its numeric :id param does not clash with the
// :projectKey tree in the Eden Treaty client. Unauthenticated so it works in an
// <img> tag. The uuid is unguessable and must match the project's current logo.
// Only raster image types are stored, and nosniff keeps the bytes from being
// interpreted as executable.
export const projectLogoRawRoute = new Elysia({
  name: 'project-logo-raw',
  detail: { tags: ['Projects'] },
}).get(
  '/project-logos/:id/:uuid/raw',
  async ({ params }) => {
    const obj = await readProjectLogo(params.id, params.uuid);
    const ct = /^image\//i.test(obj.contentType) ? obj.contentType : 'application/octet-stream';
    const headers: Record<string, string> = {
      'Content-Type': ct,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    if (obj.contentLength != null) headers['Content-Length'] = String(obj.contentLength);
    return new Response(obj.body, { headers });
  },
  {
    params: logoParams,
    response: { ...errors(404) },
    detail: { summary: "Preview a project's logo (public, no auth)" },
  },
);
