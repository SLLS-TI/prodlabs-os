// A project level's emoji is one pictographic grapheme. The API runs the same check
// authoritatively; this enables Save and the field error in the settings form.
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

// Whether the string is exactly one emoji grapheme. If Intl.Segmenter is missing,
// allow the value and let the API validate, so the form never crashes.
export function isSingleEmoji(value: string): boolean {
  if (typeof Intl.Segmenter !== 'function') return value.length > 0;
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)];
  return segments.length === 1 && EMOJI_PATTERN.test(value);
}
