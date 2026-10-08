import { describe, it, expect } from 'bun:test';
import { canSeeLevel } from '../../visibility';
import { stripLevel } from '../../service';
import { isSingleEmoji } from '../../emoji';

// Pure logic behind the project level: who may see it, the field strip for a client,
// and the single-emoji check. No session/HTTP/DB.

const level: { levelEmoji: string | null; levelName: string | null; levelColor: string | null } = {
  levelEmoji: '🚀',
  levelName: 'Launch',
  levelColor: '#aabbcc',
};

describe('canSeeLevel', () => {
  it('is false only for a client', () => {
    expect(canSeeLevel('owner')).toBe(true);
    expect(canSeeLevel('member')).toBe(true);
    expect(canSeeLevel('client')).toBe(false);
  });
});

describe('stripLevel', () => {
  it('nulls exactly the three level fields for a client', () => {
    expect(stripLevel({ ...level, other: 1 }, 'client')).toEqual({
      levelEmoji: null,
      levelName: null,
      levelColor: null,
      other: 1,
    });
  });

  it('is identity for a non-client', () => {
    const row = { ...level, other: 1 };
    expect(stripLevel(row, 'member')).toBe(row);
    expect(stripLevel(row, 'owner')).toBe(row);
  });
});

describe('isSingleEmoji', () => {
  it('accepts a single emoji grapheme', () => {
    expect(isSingleEmoji('🚀')).toBe(true);
    expect(isSingleEmoji('🧑‍🚀')).toBe(true);
  });

  it('rejects empty, plain text, and multiple graphemes', () => {
    expect(isSingleEmoji('')).toBe(false);
    expect(isSingleEmoji('ab')).toBe(false);
    expect(isSingleEmoji('a')).toBe(false);
    expect(isSingleEmoji('🚀🚀')).toBe(false);
  });
});
