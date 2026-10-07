import { describe, expect, test } from 'bun:test';
import {
  morningText,
  eveningText,
  stateEmoji,
  type SlackProject,
  type DigestIssue,
} from '../../slack-digest-format';

const project: SlackProject = {
  projectId: 1,
  teamId: 1,
  key: 'IAP',
  name: 'Demo',
  teamSlug: 'demo',
  channel: '#demo',
};

function issue(seq: number, stateType: string): DigestIssue {
  return { seq, title: `Task ${seq}`, dueDate: '2026-10-07', stateType };
}

describe('stateEmoji', () => {
  test('maps each column state type', () => {
    expect(stateEmoji('backlog')).toBe('⬜');
    expect(stateEmoji('unstarted')).toBe('⬜');
    expect(stateEmoji('started')).toBe('🔄');
    expect(stateEmoji('completed')).toBe('✅');
    expect(stateEmoji('canceled')).toBe('❌');
  });

  test('falls back to a bullet for an unknown state', () => {
    expect(stateEmoji('whatever')).toBe('•');
  });
});

describe('morningText', () => {
  test('mentions the channel and shows a state emoji per task', () => {
    const text = morningText(project, [issue(1, 'started'), issue(2, 'unstarted')]);
    expect(text).toContain('<!channel>');
    expect(text).toContain('🔄');
    expect(text).toContain('⬜');
    expect(text).toContain('IAP-1');
    expect(text).toContain('IAP-2');
  });

  test('does not mention the channel when nothing is due', () => {
    const text = morningText(project, []);
    expect(text).not.toContain('<!channel>');
    expect(text).toContain('Nothing due today');
  });
});

describe('eveningText', () => {
  test('mentions the channel and marks completed vs pending with emojis', () => {
    const text = eveningText(project, [issue(1, 'completed')], [issue(2, 'started')]);
    expect(text).toContain('<!channel>');
    expect(text).toContain('✅');
    expect(text).toContain('🔄');
    expect(text).toContain('Completed today');
    expect(text).toContain('Still pending');
  });

  test('does not mention the channel when there is nothing to report', () => {
    const text = eveningText(project, [], []);
    expect(text).not.toContain('<!channel>');
  });
});
