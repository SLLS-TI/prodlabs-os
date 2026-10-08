import { t } from 'elysia';
import { PROJECT_KEY_PATTERN } from './key';
import { PROJECT_FEATURES } from '#shared/features';
import { ColumnResponse } from '#modules/columns/model';
import { CustomFieldResponse } from '#modules/custom-fields/model';
import { IssueTemplateResponse } from '#modules/issue-templates/model';
import { IssueTypeResponse } from '#modules/issue-types/model';
import { LabelGroupResponse, LabelResponse } from '#modules/labels/model';
import { PermissionMatrixSchema } from '#shared/permissions';
import { ISSUE_TYPE_PRESET_KEYS } from './service';
import { COPY_INCLUDE_KEYS } from './copy';

// The description goes into the system prompt of every agent run, where it costs
// input tokens each time, so it is capped on the way in and cut again in the prompt.
export const PROJECT_DESCRIPTION_LIMIT = 2000;

const projectKey = t.String({
  pattern: PROJECT_KEY_PATTERN,
  description: 'Upper-case letters and digits, starting with a letter, up to 10 characters.',
});

const projectBody = t.Object({
  key: projectKey,
  name: t.String({ minLength: 1 }),
  description: t.Optional(t.String({ maxLength: PROJECT_DESCRIPTION_LIMIT })),
});

// Create adds the issue-type preset: which set of types the new project starts with.
// Omitted → "general" (a single Task). Copy takes its types from the source project,
// so the preset applies to create only.
export const createProjectBody = t.Composite([
  projectBody,
  t.Object({
    preset: t.Optional(
      t.Union(
        ISSUE_TYPE_PRESET_KEYS.map((k) => t.Literal(k)),
        { description: `Issue-type preset: ${ISSUE_TYPE_PRESET_KEYS.join(', ')}.` },
      ),
    ),
  }),
]);

// Copy adds an optional selection of which parts of the source project to carry over.
// Omitted → the source project's structure (states, types, labels, custom fields,
// views, dashboards, documents, actions). Each flag maps to a project section
// menu; the service force-enables dependencies.
export const copyProjectBody = t.Composite([
  projectBody,
  t.Object({
    include: t.Optional(
      t.Object(Object.fromEntries(COPY_INCLUDE_KEYS.map((k) => [k, t.Optional(t.Boolean())]))),
    ),
  }),
]);

export const updateProjectBody = t.Object({
  key: t.Optional(projectKey),
  name: t.Optional(t.String({ minLength: 1 })),
  description: t.Optional(t.String({ maxLength: PROJECT_DESCRIPTION_LIMIT })),
  color: t.Optional(t.Nullable(t.String())),
  // The emoji is a coarse length guard here; the service does the authoritative
  // single-grapheme check. Null clears the whole level trio together.
  levelEmoji: t.Optional(t.Nullable(t.String({ maxLength: 16 }))),
  levelName: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
  levelColor: t.Optional(t.Nullable(t.String({ pattern: '^#[0-9a-fA-F]{6}$' }))),
});

// Params of the public logo raw route: the numeric project id and the object's uuid.
export const logoParams = t.Object({ id: t.Numeric(), uuid: t.String() });

export const uploadLogoBody = t.Object({ file: t.File() });

// The relative serve URL stored on the project, returned after an upload.
export const ProjectLogoResponse = t.Object({ logoUrl: t.String() });

export const ProjectPreferencesResponse = t.Object({
  isFavorite: t.Boolean(),
  isHidden: t.Boolean(),
});

export const updateProjectPreferencesBody = t.Object(
  {
    isFavorite: t.Optional(t.Boolean()),
    isHidden: t.Optional(t.Boolean()),
  },
  { minProperties: 1 },
);

export const listProjectsQuery = t.Object({
  q: t.Optional(
    t.String({
      description: 'Case-insensitive literal substring of the project key, name, or description.',
    }),
  ),
  sort: t.Optional(
    t.UnionEnum(['key', 'name', 'created', 'activity'], {
      description:
        'Sort by key (default), name, newest creation, or newest work-item activity/comment. ' +
        'Activity puts projects without activity last. Ties are ordered by key.',
    }),
  ),
  teamId: t.Optional(
    t.Numeric({
      minimum: 1,
      multipleOf: 1,
      description: 'Limit results to projects in this team that you belong to.',
    }),
  ),
  permissions: t.Optional(
    t.String({ description: "'true' to include the caller's permission matrix per project." }),
  ),
});

// A project DTO (ProjectRow from the service).
export const ProjectResponse = t.Object({
  id: t.Number(),
  teamId: t.Number(),
  teamName: t.String(),
  teamRef: t.String({ description: "The team's slug, or its id while it has none." }),
  key: t.String(),
  ref: t.String({
    description: "'<teamRef>.<key>': how routes containing {projectKey} name this project.",
  }),
  name: t.String(),
  description: t.String(),
  // An optional hex background tint for the whole project interface; null = no tint.
  color: t.Nullable(t.String()),
  // Relative serve URL of the project's custom logo, or null to fall back to initials.
  logoUrl: t.Nullable(t.String()),
  mcpEnabled: t.Boolean(),
  teamMcpEnabled: t.Boolean(),
  // The optional sections, toggled in Settings -> General. All on by default; a
  // disabled section is hidden in the web app and its rows are kept.
  initiativesEnabled: t.Boolean(),
  dashboardsEnabled: t.Boolean(),
  documentsEnabled: t.Boolean(),
  notesEnabled: t.Boolean(),
  cyclesEnabled: t.Boolean(),
  subtasksEnabled: t.Boolean(),
  checklistsEnabled: t.Boolean(),
  issueStatsEnabled: t.Boolean(),
  aiTeamEnabled: t.Boolean(),
  inboxEnabled: t.Boolean(),
  workItemsEnabled: t.Boolean(),
  membersEnabled: t.Boolean(),
  notificationsEnabled: t.Boolean(),
  pointsEstimateEnabled: t.Boolean(),
  timeEstimateEnabled: t.Boolean(),
  timeLoggingEnabled: t.Boolean(),
  timeGoalMinutes: t.Nullable(t.Integer({ minimum: 1 })),
  timeGoalPeriod: t.Nullable(t.Union([t.Literal('total'), t.Literal('weekly')])),
  // Which team roles may see the project's time tracking. Empty means every role.
  // Editor-only config, read by the settings page.
  timeVisibleRoleIds: t.Array(t.Integer()),
  // The member a client viewer sees every team-member action attributed to, or null to
  // fall back to the oldest owner. Owner-only config, read by the masking settings page.
  faceUserId: t.Nullable(t.String()),
  // The project's level: a single emoji, its name, and the emoji's dominant color (hex),
  // lightened at render into the chip. Null when unset. Stripped to null for a client viewer.
  levelEmoji: t.Nullable(t.String()),
  levelName: t.Nullable(t.String()),
  levelColor: t.Nullable(t.String()),
  availableFeatures: t.Array(t.UnionEnum([...PROJECT_FEATURES])),
  createdAt: t.String(),
});

// The client-masking settings write (owner-only). Face user is security-sensitive, so
// it is a route of its own rather than folded into the estimates settings.
export const MaskingResponse = t.Object({
  faceUserId: t.Nullable(t.String()),
});

export const updateMaskingBody = MaskingResponse;

// A project in the caller's list (ProjectListItem): ProjectRow plus the caller's
// own role in it, and the caller's permission matrix when requested with
// ?permissions=true.
export const ProjectListResponse = t.Array(
  t.Composite([
    ProjectResponse,
    t.Object({
      role: t.Union([t.Literal('owner'), t.Literal('member'), t.Literal('client')]),
      lastActivityAt: t.Nullable(
        t.String({
          description: 'Newest readable work-item activity or comment timestamp, or null.',
        }),
      ),
      isFavorite: t.Boolean({ description: 'Whether you starred this project.' }),
      isHidden: t.Boolean({
        description: 'Whether you hid this project in your navigation. Does not restrict access.',
      }),
      canSeeTimeTracking: t.Boolean({
        description: "Whether you may see this project's time tracking (owner or an allowed role).",
      }),
      permissions: t.Optional(PermissionMatrixSchema),
    }),
  ]),
);

// An assignable candidate (AssigneeCandidate from members/service): a project
// member or an AI agent's bot user.
const AssigneeCandidateResponse = t.Object({
  userId: t.String(),
  name: t.String(),
  email: t.String(),
  username: t.Nullable(t.String()),
  image: t.Nullable(t.String()),
  kind: t.Union([t.Literal('member'), t.Literal('agent')]),
  agentKind: t.Nullable(t.Union([t.Literal('external'), t.Literal('internal')])),
  restrictedToUserId: t.Nullable(t.String()),
  canReadWorkItems: t.Boolean(),
});

// The caller's own role in a project (from MemberContext in members/service). The
// resolved permission matrix is a sibling `permissions` key on the board payload.
const ViewerResponse = t.Object({
  role: t.Union([t.Literal('owner'), t.Literal('member'), t.Literal('client')]),
  // The caller's standing in the team that owns the project, null when they are not
  // a member of it. An owner or manager of the team governs the project's settings
  // alongside the project's own owner; 'agent' is a bot user reading its own board,
  // which governs nothing.
  teamRole: t.Nullable(
    t.Union([t.Literal('owner'), t.Literal('manager'), t.Literal('member'), t.Literal('agent')]),
  ),
});

// The project board scaffold (GET /projects/:projectKey): the project plus its
// columns, issue types, labels, label groups, assignable users, custom fields,
// issue templates, and the caller's own effective access. The issues themselves come from
// GET /projects/:projectKey/issues/board.
export const ProjectBoardResponse = t.Object({
  project: ProjectResponse,
  columns: t.Array(ColumnResponse),
  issueTypes: t.Array(IssueTypeResponse),
  labels: t.Array(LabelResponse),
  labelGroups: t.Array(LabelGroupResponse),
  assignees: t.Array(AssigneeCandidateResponse),
  customFields: t.Array(CustomFieldResponse),
  issueTemplates: t.Array(IssueTemplateResponse),
  viewer: ViewerResponse,
  // The caller's resolved permission matrix (owners get every flag).
  permissions: PermissionMatrixSchema,
  // Whether the caller may see this project's time tracking (owner or an allowed
  // role). The web app hides every time surface behind it; the API enforces it too.
  canSeeTimeTracking: t.Boolean(),
});

// Which optional sections the project shows (ProjectFeatures from the service).
const FeaturesResponse = t.Object({
  initiatives: t.Boolean(),
  dashboards: t.Boolean(),
  documents: t.Boolean(),
  notes: t.Boolean(),
  cycles: t.Boolean(),
  subtasks: t.Boolean(),
  checklists: t.Boolean(),
  issueStats: t.Boolean(),
  aiTeam: t.Boolean(),
  inbox: t.Boolean(),
  workItems: t.Boolean(),
  members: t.Boolean(),
  notifications: t.Boolean(),
});

// The project's settings: MCP reachability and the enabled sections. Reachability is
// read-only here — both flags behind it are set from the team's MCP settings.
export const ProjectSettingsResponse = t.Object({
  mcpEnabled: t.Boolean({ description: "Whether the team's MCP reach covers this project." }),
  teamMcpEnabled: t.Boolean({ description: 'Whether the team is reachable over MCP at all.' }),
  features: FeaturesResponse,
});

export const updateProjectSettingsBody = t.Object({
  features: t.Optional(t.Partial(FeaturesResponse)),
});

// Ten years, well inside the range make_interval and a timestamp can hold.
export const MAX_AUTO_ARCHIVE_DAYS = 3650;

// Auto-archive thresholds (AutoArchiveSettings from the service): days of inactivity
// in a completed/canceled column before the worker archives an issue; null = off.
export const AutoArchiveResponse = t.Object({
  completedDays: t.Nullable(t.Number()),
  canceledDays: t.Nullable(t.Number()),
});

// The upper bound keeps the value inside what an interval can carry: the worker
// subtracts it from now() for every project in one statement, so a day count large
// enough to overflow a timestamp fails that statement for the whole instance.
export const updateAutoArchiveBody = t.Object({
  completedDays: t.Nullable(t.Integer({ minimum: 1, maximum: MAX_AUTO_ARCHIVE_DAYS })),
  canceledDays: t.Nullable(t.Integer({ minimum: 1, maximum: MAX_AUTO_ARCHIVE_DAYS })),
});

// The estimate kinds the project's issues carry and whether its members log time
// (EstimateSettings from the service). Sent together, the same as the automations
// below.
export const EstimatesResponse = t.Object({
  points: t.Boolean(),
  time: t.Boolean(),
  logging: t.Boolean(),
  // The project's time goal, or null for none. timeGoalPeriod reads it against all
  // time ever logged ('total') or the current week's ('weekly'). Both null together.
  timeGoalMinutes: t.Nullable(t.Integer({ minimum: 1 })),
  timeGoalPeriod: t.Nullable(t.Union([t.Literal('total'), t.Literal('weekly')])),
  // Which team roles may see the project's time tracking. Empty means every role.
  // The write validates each id belongs to the project's team.
  timeVisibleRoleIds: t.Array(t.Integer()),
});

export const updateEstimatesBody = EstimatesResponse;

// The weights for the cross-project health score (god stats), configured per project. The
// response merges the stored partial over the defaults, so every key is present. Values are
// stored as-is and the score normalizes by proportion, so they need not sum to 100.
export const HealthWeightsResponse = t.Object({
  schedule: t.Integer({ minimum: 0, maximum: 1000 }),
  budget: t.Integer({ minimum: 0, maximum: 1000 }),
  velocity: t.Integer({ minimum: 0, maximum: 1000 }),
  load: t.Integer({ minimum: 0, maximum: 1000 }),
  freshness: t.Integer({ minimum: 0, maximum: 1000 }),
});

export const updateHealthWeightsBody = HealthWeightsResponse;

// The subtask automations (SubtaskAutomationSettings from the service).
export const SubtaskAutomationResponse = t.Object({
  completeParent: t.Boolean(),
  closeSubtasks: t.Boolean(),
});

export const updateSubtaskAutomationBody = SubtaskAutomationResponse;

// The project's Slack target (SlackProjectSettings from the service). channel is a
// Slack channel id or '#name'; enabling with a blank channel is coerced to off.
export const SlackProjectResponse = t.Object({
  channel: t.String(),
  enabled: t.Boolean(),
});

export const updateSlackProjectBody = t.Object({
  channel: t.String({ maxLength: 200 }),
  enabled: t.Boolean(),
});
