import { startWorker } from './worker';
import { startAgentWorker } from './agent-worker';
import { startImportWorker } from './import-worker';
import { startSlackDigestWorker } from './slack-digest-worker';

// Entry point for webhook delivery, agent scheduling, autonomous agent runs,
// source imports, and the daily Slack digests. The api applies database migrations
// on startup.
console.log('[worker] worker starting');
const worker = startWorker();
const agentWorker = startAgentWorker();
const importWorker = startImportWorker();
const slackDigestWorker = startSlackDigestWorker();

function shutdown(signal: string): void {
  console.log(`[worker] ${signal} received, stopping`);
  worker.stop();
  agentWorker.stop();
  importWorker.stop();
  slackDigestWorker.stop();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
