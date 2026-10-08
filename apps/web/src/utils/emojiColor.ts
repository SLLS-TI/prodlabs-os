// Samples an emoji's dominant color once, client-side, when the owner saves the level.
// The result is stored on the project and read as a hex string on every render, so no
// canvas runs at render time. Returns null when the emoji produced no opaque pixel
// (the chip then falls back to a neutral background).

const SIZE = 64;

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function emojiDominantColor(emoji: string): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.font = '48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, SIZE / 2, SIZE / 2);

  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  let opaque = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 16) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    opaque++;
    sumR += r;
    sumG += g;
    sumB += b;
    // Skip near-grey pixels so the dominant chroma wins over white/black outlines.
    if (Math.max(r, g, b) - Math.min(r, g, b) < 24) continue;
    const key = `${r >> 5}:${g >> 5}:${b >> 5}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  if (opaque === 0) return null;

  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) {
    return toHex(Math.round(sumR / opaque), Math.round(sumG / opaque), Math.round(sumB / opaque));
  }
  return toHex(
    Math.round(best.r / best.count),
    Math.round(best.g / best.count),
    Math.round(best.b / best.count),
  );
}
