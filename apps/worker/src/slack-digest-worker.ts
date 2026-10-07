import { runSlackDigests } from './slack-digest';
import { intEnv } from './env';
import { startPollLoop, type WorkerHandle } from './poll-loop';

// Enqueues the daily Slack digests at their local firing windows. The tick is cheap
// when no slot is due, so a short poll interval keeps the post close to 07:00/17:00.
export function startSlackDigestWorker(): WorkerHandle {
  return startPollLoop(
    'slack-digest',
    () => runSlackDigests(),
    () => intEnv('SLACK_DIGEST_POLL_INTERVAL_MS', 60_000),
  );
}
