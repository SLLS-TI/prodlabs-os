import { useTranslations } from 'next-intl';
import type { ProjectDetail } from '@/lib/api/endpoints/projects';
import type { WidgetInstance } from '@/utils/dashboardWidgets';
import { usePermissions } from '@/hooks/usePermissions';
import StatWidget from './widgets/StatWidget';
import BreakdownWidget from './widgets/BreakdownWidget';
import ThroughputWidget from './widgets/ThroughputWidget';
import BurnupWidget from './widgets/BurnupWidget';
import PulseWidget from './widgets/PulseWidget';
import RecentIssuesWidget from './widgets/RecentIssuesWidget';
import ActivityFeedWidget from './widgets/ActivityFeedWidget';
import AgentRunsWidget from './widgets/AgentRunsWidget';
import AgentHealthWidget from './widgets/AgentHealthWidget';
import WebhookHealthWidget from './widgets/WebhookHealthWidget';
import AgentWorkloadWidget from './widgets/AgentWorkloadWidget';
import TimeByUserWidget from './widgets/TimeByUserWidget';
import TimeGoalWidget from './widgets/TimeGoalWidget';
import TimeTotalWidget from './widgets/TimeTotalWidget';

// The widget body for a given type. Each widget reads its own config and analytics
// query and renders a static view; its config is edited through WidgetSettings.
export default function WidgetBody({
  widget,
  projectKey,
  project,
}: {
  widget: WidgetInstance;
  projectKey: string;
  project: ProjectDetail;
}) {
  const config = widget.config ?? {};
  const t = useTranslations('dashboards');
  const { canSeeTime } = usePermissions(project);

  const isTimeWidget =
    widget.type === 'time_by_user' || widget.type === 'time_goal' || widget.type === 'time_total';
  if (isTimeWidget && !canSeeTime) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('timeNoAccess')}</p>;
  }

  switch (widget.type) {
    case 'stat':
      return <StatWidget config={config} />;
    case 'breakdown':
      return <BreakdownWidget projectKey={projectKey} config={config} />;
    case 'throughput':
      return <ThroughputWidget projectKey={projectKey} config={config} />;
    case 'burnup':
      return <BurnupWidget projectKey={projectKey} config={config} />;
    case 'pulse':
      return <PulseWidget projectKey={projectKey} config={config} />;
    case 'recent_issues':
      return <RecentIssuesWidget projectKey={projectKey} config={config} />;
    case 'activity_feed':
      return <ActivityFeedWidget projectKey={projectKey} project={project} config={config} />;
    case 'agent_runs':
      return <AgentRunsWidget projectKey={projectKey} config={config} />;
    case 'agent_health':
      return <AgentHealthWidget projectKey={projectKey} config={config} />;
    case 'webhook_health':
      return <WebhookHealthWidget projectKey={projectKey} config={config} />;
    case 'agent_workload':
      return <AgentWorkloadWidget projectKey={projectKey} />;
    case 'time_by_user':
      return <TimeByUserWidget projectKey={projectKey} />;
    case 'time_goal':
      return <TimeGoalWidget projectKey={projectKey} />;
    case 'time_total':
      return <TimeTotalWidget projectKey={projectKey} />;
    default:
      return null;
  }
}
