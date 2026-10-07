import { describe, it, expect } from 'bun:test';
import { dueSlots, localDateHour } from '../../slack-digest-schedule';

// Pure slot/date logic for the daily Slack digests. No DB, no clock of its own.

describe('localDateHour', () => {
  it('reads the local date and hour in the given zone', () => {
    // 2026-10-07T10:30:00Z is 07:30 in America/Sao_Paulo (UTC-3).
    const now = new Date('2026-10-07T10:30:00Z');
    expect(localDateHour(now, 'America/Sao_Paulo')).toEqual({ date: '2026-10-07', hour: 7 });
  });

  it('rolls the local date back across the day boundary', () => {
    // 02:30Z is 23:30 the previous day in America/Sao_Paulo.
    const now = new Date('2026-10-07T02:30:00Z');
    expect(localDateHour(now, 'America/Sao_Paulo')).toEqual({ date: '2026-10-06', hour: 23 });
  });

  it('normalizes midnight to hour 0', () => {
    const now = new Date('2026-10-07T03:00:00Z'); // 00:00 in Sao_Paulo
    expect(localDateHour(now, 'America/Sao_Paulo')).toEqual({ date: '2026-10-07', hour: 0 });
  });
});

describe('dueSlots', () => {
  it('returns nothing before 07:00 local', () => {
    const now = new Date('2026-10-07T09:00:00Z'); // 06:00 Sao_Paulo
    expect(dueSlots(now, 'America/Sao_Paulo')).toEqual([]);
  });

  it('returns only the morning slot between 07:00 and 17:00 local', () => {
    const now = new Date('2026-10-07T13:00:00Z'); // 10:00 Sao_Paulo
    expect(dueSlots(now, 'America/Sao_Paulo')).toEqual([
      { slot: 'morning', runDate: '2026-10-07' },
    ]);
  });

  it('returns both slots at or after 17:00 local', () => {
    const now = new Date('2026-10-07T20:30:00Z'); // 17:30 Sao_Paulo
    expect(dueSlots(now, 'America/Sao_Paulo')).toEqual([
      { slot: 'morning', runDate: '2026-10-07' },
      { slot: 'evening', runDate: '2026-10-07' },
    ]);
  });

  it('dates the slot by the local day across a UTC date change', () => {
    // 2026-02-01T01:00:00Z is 22:00 on 2026-01-31 in Sao_Paulo: both slots passed,
    // dated to the local day, not the UTC day.
    const now = new Date('2026-02-01T01:00:00Z');
    expect(dueSlots(now, 'America/Sao_Paulo')).toEqual([
      { slot: 'morning', runDate: '2026-01-31' },
      { slot: 'evening', runDate: '2026-01-31' },
    ]);
  });

  it('applies the zone DST offset when deciding the slot', () => {
    // New York observes DST. 2026-07-01T11:30:00Z is 07:30 EDT (UTC-4): morning due.
    const summer = new Date('2026-07-01T11:30:00Z');
    expect(dueSlots(summer, 'America/New_York')).toEqual([
      { slot: 'morning', runDate: '2026-07-01' },
    ]);
    // 2026-01-01T11:30:00Z is 06:30 EST (UTC-5): not yet due.
    const winter = new Date('2026-01-01T11:30:00Z');
    expect(dueSlots(winter, 'America/New_York')).toEqual([]);
  });
});
