import { COMMON_WORDS } from './common-words';

// Client-facing attribution masking. For a client-role viewer of a project, every
// team-member actor identity is shown under one "face" user. The real actor is always
// what the database stores; this rewrites the identity at the read/serialize layer and
// at notification render time only. Kept in @repo/db so the api, worker and bot can all
// import it.

export interface FaceIdentity {
  userId: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

export interface MaskableActor {
  actorUserId: string | null;
  actorName: string | null;
}

// Rewrites a row's actor id and name together to the face when masking applies.
// isActorMaskable is the caller's decision: true when the actor must be hidden from a
// client (every non-null actor that is not a current client member). A null actor (a
// system write) is never masked. id and name are swapped together because an avatar is
// looked up by the id. Fails closed: when the actor is maskable but no face resolves,
// the actor is suppressed (id and name null) rather than revealed, and the client sees
// the existing null/system placeholder instead of the real person.
export function maskActor<T extends MaskableActor>(
  row: T,
  face: FaceIdentity | null,
  isActorMaskable: boolean,
): T {
  if (!isActorMaskable || row.actorUserId == null) return row;
  if (!face) return { ...row, actorUserId: null, actorName: null };
  return { ...row, actorUserId: face.userId, actorName: face.name };
}

// The names system writers store with no user behind them: the auto-archive sweep and
// the git providers (apps/api modules/git).
export const SYSTEM_ACTOR_NAMES: ReadonlySet<string> = new Set([
  'Auto-archive',
  'GitHub',
  'GitLab',
  'Gitea',
  'Forgejo',
  'Bitbucket',
]);

// Rewrites a name with no user behind it to the face for a client: a deleted account or
// an imported author may be anyone at the agency. A system writer keeps its name.
export function maskOrphanActor<T extends MaskableActor>(row: T, face: FaceIdentity | null): T {
  if (row.actorUserId != null || row.actorName == null) return row;
  if (SYSTEM_ACTOR_NAMES.has(row.actorName)) return row;
  return { ...row, actorUserId: face?.userId ?? null, actorName: face?.name ?? null };
}

// A person the identity scrubber knows. userId is null for a name snapshot with no
// user behind it (an imported comment author, a deleted user).
export interface GuardIdentity {
  userId: string | null;
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
  // Other names the person goes by: a display username, an agent's mention handle.
  aliases?: (string | null)[];
  // An agent's bot user. Its name words are product words ('Code Reviewer'), so only
  // its full name, written capitalised, and its handle are rewritten.
  isAgent?: boolean;
}

// One project a client sees: every hidden identity is rewritten to that project's
// face. keep holds the identities shown as they are (the project's current clients);
// a token of theirs or of the face is never rewritten in this group. vocabulary holds
// the project key, project name and team slug the client navigates by: they are left
// as they are except after an '@'.
export interface IdentityGuardGroup {
  face: GuardIdentity;
  hidden: GuardIdentity[];
  keep: GuardIdentity[];
  vocabulary?: string[];
}

export interface IdentityScrubber {
  <T>(value: T): T;
  // One string read as prose, even when it is a single lowercase word: a search
  // query, a file name.
  prose(text: string): string;
}

interface Term {
  group: number;
  // A phrase of two or more name words: the full name or two of its words.
  name?: boolean;
  // A single name word or nickname that is not a common word.
  word?: boolean;
  // A 4-letter nickname: rewritten in an identifier only when it is the whole value.
  nick?: boolean;
  // A 3-letter first-name prefix ('Dio'): rewritten only when written capitalised.
  initial?: boolean;
  // 'strong' is rewritten wherever it stands; 'weak' (short or a common word) only
  // after '@', in a profile URL, or as the whole value of a username field.
  handle?: 'strong' | 'weak';
  // An agent's full name: rewritten only when every word is capitalised.
  capOnly?: boolean;
}

interface Face {
  id: string;
  name: string;
  first: string;
  handle: string;
  email: string;
  image: string | null;
}

const MIN_WORD = 3;
const MIN_ID = 8;
const STRONG_HANDLE = 5;
// A single name word is rewritten inside an identifier ('rafael-tasks') from this
// length, or at any length when it is the whole value.
const IDENTIFIER_WORD = 5;
const DIMINUTIVES = ['i', 'inha', 'inho', 'zinha', 'zinho', 'ita', 'ito'];
// A whole string that is one lowercase identifier is an enum value, a key or a slug.
const IDENTIFIER = /^[a-z0-9_.-]+$/;
const BASE64 = /^[A-Za-z0-9+/=\r\n]+$/;
const PROSE_KEY =
  /name$|^(?:title|body|text|description|content|message|summary|subject|html|markdown|comment|note|notes|prompt|query|q|search)$/i;
const IDENTITY_KEY = /(?:username|handle|login|mention)s?$/i;
// A letter run, or a percent escape that separates runs ('%2Frafael').
const TOKEN = /%[0-9A-Fa-f]{2}|\p{L}[\p{L}\p{M}]*/gu;
// What may stand between two words of one name: 'Rafael Maffazioli', 'rafael_maffazioli',
// 'Rafael%20Maffazioli', 'Maffazioli, Rafael'.
const GAP = /^(?:\s+|\s*,\s*|[_.+-]|%20)$/;
const EMAIL = /[\p{L}\p{N}._%+-]+(?:@|%40)[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/giu;
const MENTION_AT = /(?:^|[^\p{L}\p{N}._%+-])@$/u;
const PROFILE_URL =
  /(?:github\.com|gitlab\.com|bitbucket\.org|twitter\.com|x\.com|instagram\.com|linkedin\.com\/in|t\.me)\/$/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_ALNUM = /[A-Za-z0-9]{12,}/g;
const ID_TOKEN = /[A-Za-z0-9_-]+/g;
const MEMO_MAX = 256;
const PERSON_KEYS = ['userId', 'id'];
const KEY_MEMO_MAX = 5_000;

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function letterWords(value: string): string[] {
  return fold(value).match(/\p{L}+/gu) ?? [];
}

// The lookup key of a handle made of letter runs joined by '.', '_', '-' or '+'
// ('pedro.dev' reads 'pedro dev'); null for one with digits or other characters.
function handleKey(handle: string): string | null {
  const folded = fold(handle.trim());
  return /^\p{L}+(?:[._+-]\p{L}+)*$/u.test(folded) ? folded.split(/[._+-]/).join(' ') : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// Every phrase of a name: the full name and each ordered pair of its words.
function namePhrases(words: string[]): string[] {
  const usable = words.filter((w) => w.length >= 2);
  if (usable.length < 2) return [];
  const phrases = new Set([usable.join(' ')]);
  for (let i = 0; i < usable.length; i++) {
    for (let j = 0; j < usable.length; j++) if (i !== j) phrases.add(`${usable[i]} ${usable[j]}`);
  }
  return [...phrases];
}

function nicknames(first: string | undefined): { nick: string[]; initial: string | null } {
  if (!first || first.length <= 4) return { nick: [], initial: null };
  const nick = [first.slice(0, 4)];
  for (const base of [first.slice(0, 3), first.slice(0, 4)]) {
    for (const suffix of DIMINUTIVES) nick.push(base + suffix);
  }
  return { nick: nick.filter((n) => n !== first), initial: first.slice(0, 3) };
}

// Every key an identity is known by, for the keep side: its phrases, words, nicknames,
// handles and email.
function identityKeys(identity: GuardIdentity): string[] {
  const keys: string[] = [];
  for (const name of [identity.name, ...(identity.aliases ?? [])]) {
    if (!name) continue;
    const words = letterWords(name);
    keys.push(...words, ...namePhrases(words));
    const { nick, initial } = nicknames(words[0]);
    keys.push(...nick);
    if (initial) keys.push(initial);
  }
  for (const handle of [identity.username, ...(identity.aliases ?? [])]) {
    if (!handle) continue;
    keys.push(handleKey(handle) ?? fold(handle.trim()));
  }
  if (identity.email) keys.push(fold(identity.email));
  return keys;
}

function toFace(identity: GuardIdentity): Face {
  const name = identity.name?.trim() || 'Team';
  const first = name.split(/\s+/)[0] || name;
  const handle = identity.username?.trim() || fold(first);
  return {
    id: identity.userId ?? '',
    name,
    first,
    handle,
    email: identity.email ?? handle,
    image: identity.image,
  };
}

function avatarId(image: string): string | null {
  return image.match(/^\/avatars\/([^/?#]+)\/raw$/)?.[1] ?? null;
}

interface Run {
  start: number;
  end: number;
  key: string;
  cap: boolean;
}

interface Span {
  start: number;
  end: number;
  to: string | null;
}

// Builds a function that rewrites, in every string of a JSON value (and in object keys,
// ids only), each hidden person's user id, email, avatar, full name, name words,
// nicknames and username to the matching value of their group's face. Matching is case-
// and accent-insensitive on whole words. A token is skipped only in a group that keeps
// it; one hidden in any group is rewritten. The database keeps the real text; this runs
// on what a client receives.
export function buildIdentityScrubber(groups: IdentityGuardGroup[]): IdentityScrubber {
  const faces = groups.map((g) => toFace(g.face));
  const ids = new Map<string, string>();
  const images = new Map<string, string | null>();
  const emails = new Map<string, number>();
  const keptEmails = new Set<string>();
  const singles = new Map<string, Term>();
  const phrases = new Map<string, Term>();
  const rawHandles = new Map<string, { group: number; strong: boolean }>();
  const vocabulary = new Set<string>();

  const add = (map: Map<string, Term>, key: string, term: Term) => {
    const existing = map.get(key);
    if (!existing) {
      map.set(key, term);
      return;
    }
    if (!existing.name) existing.capOnly = term.capOnly;
    else if (term.name && !term.capOnly) existing.capOnly = false;
    existing.name ||= term.name;
    existing.word ||= term.word;
    existing.nick ||= term.nick;
    existing.initial ||= term.initial;
    if (term.handle === 'strong' || !existing.handle)
      existing.handle = term.handle ?? existing.handle;
  };

  for (const group of groups) {
    for (const entry of group.vocabulary ?? []) {
      const words = letterWords(entry);
      if (words.length) vocabulary.add(words.join(' '));
    }
  }

  groups.forEach((group, g) => {
    const face = faces[g]!;
    const kept = [group.face, ...group.keep];
    const keepIds = new Set(kept.map((k) => k.userId).filter((id): id is string => !!id));
    const keepImages = new Set(kept.map((k) => k.image).filter((i): i is string => !!i));
    const keepKeys = new Set(kept.flatMap(identityKeys));
    for (const k of kept) if (k.email) keptEmails.add(fold(k.email));
    const keepTerm = (key: string) => keepKeys.has(key);

    for (const person of group.hidden) {
      if (person.userId && keepIds.has(person.userId)) continue;
      if (person.userId && person.userId.length >= MIN_ID && !ids.has(person.userId)) {
        ids.set(person.userId, face.id);
      }
      if (person.image && !keepImages.has(person.image) && !images.has(person.image)) {
        images.set(person.image, face.image);
        const from = avatarId(person.image);
        const to = face.image ? avatarId(face.image) : null;
        if (from && to && from !== to && !ids.has(from)) ids.set(from, to);
      }
      if (person.email) {
        const key = fold(person.email);
        if (!keepKeys.has(key) && !emails.has(key)) emails.set(key, g);
      }

      for (const name of [person.name, ...(person.aliases ?? [])]) {
        if (!name) continue;
        const words = letterWords(name);
        for (const phrase of namePhrases(words)) {
          if (!keepTerm(phrase))
            add(phrases, phrase, { group: g, name: true, capOnly: !!person.isAgent });
        }
        if (person.isAgent) continue;
        for (const word of words) {
          if (word.length >= MIN_WORD && !COMMON_WORDS.has(word) && !keepTerm(word)) {
            add(singles, word, { group: g, word: true });
          }
        }
        if (name !== person.name) continue;
        const { nick, initial } = nicknames(words[0]);
        for (const n of nick) {
          if (!COMMON_WORDS.has(n) && !keepTerm(n)) add(singles, n, { group: g, nick: true });
        }
        if (initial && !COMMON_WORDS.has(initial) && !keepTerm(initial)) {
          add(singles, initial, { group: g, initial: true });
        }
      }

      for (const handle of [person.username, ...(person.aliases ?? [])]) {
        if (!handle?.trim()) continue;
        const key = handleKey(handle);
        const letters = (key ?? fold(handle)).replace(/[^\p{L}\p{N}]/gu, '');
        const strong = letters.length >= STRONG_HANDLE && !COMMON_WORDS.has(letters);
        if (key == null) {
          const raw = fold(handle.trim());
          if (!keepKeys.has(raw) && !rawHandles.has(raw)) rawHandles.set(raw, { group: g, strong });
        } else if (!keepKeys.has(key)) {
          add(key.includes(' ') ? phrases : singles, key, {
            group: g,
            handle: strong ? 'strong' : 'weak',
          });
        }
      }
    }
  });

  const maxPhrase = Math.max(
    1,
    ...[...phrases.keys(), ...vocabulary].map((k) => k.split(' ').length),
  );
  const idLengths = [...new Set([...ids.keys()].map((id) => id.length))].sort((a, b) => b - a);
  const minId = idLengths.length ? idLengths[idLengths.length - 1]! : Infinity;
  const imageRegex = [...images.keys()].length
    ? new RegExp(
        [...images.keys()]
          .sort((a, b) => b.length - a.length)
          .map(escapeRegex)
          .join('|'),
        'g',
      )
    : null;
  const rawHandleRegex = rawHandles.size
    ? new RegExp(
        `(?<![\\p{L}\\p{N}_.-])(?:${[...rawHandles.keys()]
          .sort((a, b) => b.length - a.length)
          .map(escapeRegex)
          .join('|')})(?![\\p{L}\\p{N}_-]|\\.[\\p{L}\\p{N}])`,
        'giu',
      )
    : null;
  const nothingToScan =
    !singles.size && !phrases.size && !emails.size && !rawHandles.size && !keptEmails.size;

  const replaceIds = (value: string): string => {
    if (value.length < minId) return value;
    const whole = ids.get(value);
    if (whole != null) return whole;
    return value.replace(ID_TOKEN, (token) => {
      if (token.length < minId) return token;
      const exact = ids.get(token);
      if (exact != null) return exact;
      let out = token;
      for (const length of idLengths) {
        if (length > out.length) continue;
        for (let i = 0; i + length <= out.length; i++) {
          const to = ids.get(out.slice(i, i + length));
          if (to != null) {
            out = out.slice(0, i) + to + out.slice(i + length);
            i += to.length - 1;
          }
        }
      }
      return out;
    });
  };

  // The ranges no name is matched inside: emails (rewritten whole when known), uuids
  // and long mixed-case alphanumeric ids.
  const protectedSpans = (text: string): Span[] => {
    const spans: Span[] = [];
    if (text.includes('@') || /%40/i.test(text)) {
      for (const m of text.matchAll(EMAIL)) {
        const key = fold(m[0].replace(/%40/i, '@'));
        const group = emails.get(key);
        const to = group != null ? faces[group]!.email : null;
        if (to != null || keptEmails.has(key)) {
          spans.push({ start: m.index, end: m.index + m[0].length, to });
        }
      }
    }
    // A percent escape is not part of an id ('%2Frafael'); the copy keeps offsets.
    const unescaped = text.replace(/%[0-9A-Fa-f]{2}/g, '%%%');
    for (const m of unescaped.matchAll(UUID)) {
      spans.push({ start: m.index, end: m.index + m[0].length, to: null });
    }
    for (const m of unescaped.matchAll(LONG_ALNUM)) {
      const s = m[0];
      if (/\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s)) {
        spans.push({ start: m.index, end: m.index + s.length, to: null });
      }
    }
    return spans;
  };

  const replaceNames = (value: string, mode: { prose: boolean; identity: boolean }): string => {
    if (nothingToScan || !/\p{L}/u.test(value)) return value;
    const text = value.normalize('NFD');
    const identifier = !mode.prose && IDENTIFIER.test(text);
    const edits: Span[] = [];

    let rawSpans: Span[] = [];
    if (rawHandleRegex) {
      for (const m of text.matchAll(rawHandleRegex)) {
        const entry = rawHandles.get(fold(m[0]));
        if (!entry) continue;
        const before = text.slice(Math.max(0, m.index - 40), m.index);
        const whole = m.index === 0 && m[0].length === text.length;
        if (
          entry.strong ||
          MENTION_AT.test(before) ||
          PROFILE_URL.test(before) ||
          (mode.identity && whole)
        ) {
          rawSpans.push({
            start: m.index,
            end: m.index + m[0].length,
            to: faces[entry.group]!.handle,
          });
        }
      }
    }

    const spans = protectedSpans(text);
    for (const span of spans) if (span.to != null) edits.push(span);
    rawSpans = rawSpans.filter((r) => !spans.some((s) => r.start < s.end && s.start < r.end));
    edits.push(...rawSpans);
    const blocked = [...spans, ...rawSpans];
    const isBlocked = (start: number, end: number) =>
      blocked.some((s) => start < s.end && s.start < end);

    const runs: Run[] = [];
    for (const m of text.matchAll(TOKEN)) {
      if (m[0][0] === '%') continue;
      runs.push({
        start: m.index,
        end: m.index + m[0].length,
        key: m[0].replace(/\p{M}/gu, '').toLowerCase(),
        cap: /^\p{Lu}/u.test(m[0]),
      });
    }

    const gapOk = (a: Run, b: Run) => GAP.test(text.slice(a.end, b.start));
    const decide = (term: Term, from: number, to: number, gap: string): string | null => {
      const face = faces[term.group]!;
      const start = runs[from]!.start;
      const end = runs[to]!.end;
      const before = text.slice(Math.max(0, start - 40), start);
      const whole = start === 0 && end === text.length;
      const phrase = to > from;
      if (MENTION_AT.test(before) || PROFILE_URL.test(before)) return face.handle;
      if (mode.identity && whole && term.handle) return face.handle;
      if (identifier) {
        if (phrase) return term.name || term.handle ? face.handle : null;
        if (term.handle === 'strong') return face.handle;
        const length = runs[from]!.key.length;
        if (term.word && (length >= IDENTIFIER_WORD || whole)) return face.handle;
        if (term.nick && whole) return face.handle;
        return null;
      }
      if (phrase) {
        if (term.name && (!term.capOnly || runs.slice(from, to + 1).every((r) => r.cap))) {
          return /\s/.test(gap) ? face.name : face.name.split(/\s+/).join(gap);
        }
        return term.handle === 'strong' ? face.handle : null;
      }
      if (term.word || term.nick) return face.first;
      if (term.initial && runs[from]!.cap) return face.first;
      if (term.handle === 'strong') return face.handle;
      return null;
    };

    for (let i = 0; i < runs.length;) {
      const run = runs[i]!;
      if (isBlocked(run.start, run.end)) {
        i++;
        continue;
      }
      // A hex run beside a digit is part of an id or a hash.
      const prev = text[run.start - 1] ?? '';
      const next = text[run.end] ?? '';
      if (/^[a-f]+$/.test(run.key) && (/\d/.test(prev) || /\d/.test(next))) {
        i++;
        continue;
      }
      let consumed = 0;
      let key = run.key;
      const keys: string[] = [key];
      for (let k = 1; k < maxPhrase && i + k < runs.length; k++) {
        if (!gapOk(runs[i + k - 1]!, runs[i + k]!)) break;
        key += ` ${runs[i + k]!.key}`;
        keys.push(key);
      }
      for (let k = keys.length - 1; k >= 0 && !consumed; k--) {
        const candidate = keys[k]!;
        if (vocabulary.has(candidate) && !MENTION_AT.test(text.slice(0, run.start).slice(-40))) {
          consumed = k + 1;
          break;
        }
        const term = k > 0 ? phrases.get(candidate) : singles.get(candidate);
        if (!term) continue;
        const last = runs[i + k]!;
        if (isBlocked(run.start, last.end)) continue;
        const gap = k > 0 ? text.slice(run.end, runs[i + 1]!.start) : ' ';
        const to = decide(term, i, i + k, gap);
        if (to == null) continue;
        edits.push({ start: run.start, end: last.end, to });
        consumed = k + 1;
      }
      i += consumed || 1;
    }

    if (!edits.length) return value;
    edits.sort((a, b) => a.start - b.start);
    let out = '';
    let at = 0;
    for (const edit of edits) {
      if (edit.start < at) continue;
      out += text.slice(at, edit.start) + edit.to;
      at = edit.end;
    }
    return (out + text.slice(at)).normalize('NFC');
  };

  const scrubString = (value: string, key: string | undefined, forceProse = false): string => {
    if (value.startsWith('data:') || (value.length > 512 && BASE64.test(value))) return value;
    let out = replaceIds(value);
    const image = images.get(out);
    if (image !== undefined) return image as string;
    if (imageRegex && (out.includes('/avatars/') || out.includes('://'))) {
      out = out.replace(imageRegex, (m) => images.get(m) ?? '');
    }
    return replaceNames(out, {
      prose: forceProse || (key != null && PROSE_KEY.test(key)),
      identity: key != null && IDENTITY_KEY.test(key),
    });
  };

  const keyMemo = new Map<string, string>();
  const scrubKey = (key: string): string => {
    if (key.length < minId) return key;
    let out = keyMemo.get(key);
    if (out == null) {
      out = replaceIds(key);
      if (keyMemo.size >= KEY_MEMO_MAX) keyMemo.clear();
      keyMemo.set(key, out);
    }
    return out;
  };

  const walk = (value: unknown, key: string | undefined, memo: Map<string, string>): unknown => {
    if (typeof value === 'string') {
      if (value.length > MEMO_MAX) return scrubString(value, key);
      const memoKey = `${key ?? ''}\u0000${value}`;
      let out = memo.get(memoKey);
      if (out == null) {
        out = scrubString(value, key);
        memo.set(memoKey, out);
      }
      return out;
    }
    if (Array.isArray(value)) return walkArray(value, memo);
    if (value && typeof value === 'object') {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return value;
      let changed = false;
      const out: Record<string, unknown> = {};
      const rewrittenKeys = new Set<string>();
      for (const [k, item] of Object.entries(value)) {
        const nextKey = scrubKey(k);
        const next = walk(item, k, memo);
        if (nextKey !== k || next !== item) changed = true;
        // A key rewritten to one already present (two users collapsed to the face)
        // keeps the entry stored under the face's own key, else the first.
        if (nextKey in out) {
          changed = true;
          if (nextKey === k && rewrittenKeys.has(nextKey)) {
            out[nextKey] = next;
            rewrittenKeys.delete(nextKey);
          }
          continue;
        }
        out[nextKey] = next;
        if (nextKey !== k) rewrittenKeys.add(nextKey);
      }
      return changed ? out : value;
    }
    return value;
  };

  // People rewritten to the face collapse into one entry: an item whose userId (or id)
  // was rewritten is dropped when another item already carries the same value.
  const walkArray = (value: unknown[], memo: Map<string, string>): unknown[] => {
    const next = value.map((item) => walk(item, undefined, memo));
    if (next.every((item, i) => item === value[i])) return value;
    const field = (item: unknown, prop: string): unknown =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)[prop]
        : undefined;
    const rewritten = (i: number, prop: string): string | null => {
      const after = field(next[i], prop);
      return typeof after === 'string' && after !== field(value[i], prop) ? after : null;
    };
    const own = new Map<string, Set<unknown>>();
    const seen = new Map<string, Set<unknown>>();
    for (const prop of PERSON_KEYS) {
      own.set(prop, new Set());
      seen.set(prop, new Set());
      next.forEach((item, i) => {
        if (rewritten(i, prop) == null) own.get(prop)!.add(field(item, prop));
      });
    }
    return next.filter((_, i) => {
      for (const prop of PERSON_KEYS) {
        const after = rewritten(i, prop);
        if (after == null) continue;
        if (own.get(prop)!.has(after) || seen.get(prop)!.has(after)) return false;
        seen.get(prop)!.add(after);
      }
      return true;
    });
  };

  return Object.assign(<T>(value: T): T => walk(value, undefined, new Map()) as T, {
    prose: (text: string) => scrubString(text, undefined, true),
  });
}
