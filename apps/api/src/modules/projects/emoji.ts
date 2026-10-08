// A project level's emoji is one pictographic grapheme. The web form validates with
// the same rule; this is the authoritative check.
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

// Whether the string is exactly one emoji grapheme: a single segment under grapheme
// segmentation, and that segment carries a pictographic code point.
export function isSingleEmoji(value: string): boolean {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const segments = [...segmenter.segment(value)];
  return segments.length === 1 && EMOJI_PATTERN.test(value);
}
