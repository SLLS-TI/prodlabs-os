// Pure slot/date logic for the daily Slack digests: no @repo/db, no clock of its own,
// so it is unit-tested directly. The DB access and the digest composition live in
// slack-digest.ts.

export type DigestSlot = 'morning' | 'evening';

const SLOT_HOUR: Record<DigestSlot, number> = { morning: 7, evening: 17 };

export function digestTimezone(): string {
  const tz = process.env.DIGEST_TIMEZONE;
  return tz && tz.length > 0 ? tz : 'UTC';
}

// The local calendar date (YYYY-MM-DD) and hour (0-23) of `now` in `tz`. Uses Intl so
// the zone's DST offset is applied correctly without hand-rolled offset math.
export function localDateHour(now: Date, tz: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  // Intl can render midnight as hour '24'; normalize it to 0.
  const hour = Number(get('hour')) % 24;
  return { date, hour };
}

// Which slots are due as of `now` in `tz`, with the local date each covers. A slot is
// due once its local hour has arrived for the day; the marker then stops a repost, so
// a worker that was down at the firing minute still posts on a later tick the same day.
export function dueSlots(now: Date, tz: string): { slot: DigestSlot; runDate: string }[] {
  const { date, hour } = localDateHour(now, tz);
  const due: { slot: DigestSlot; runDate: string }[] = [];
  for (const slot of ['morning', 'evening'] as const) {
    if (hour >= SLOT_HOUR[slot]) due.push({ slot, runDate: date });
  }
  return due;
}
