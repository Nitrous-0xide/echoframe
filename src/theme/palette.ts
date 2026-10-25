export interface Palette { primary: string; secondary: string }
type Candidate = { r: number; g: number; b: number; count: number; saturation: number; lightness: number; hue: number };
const fallback: Palette = { primary: '#a997ff', secondary: '#66e0eb' };
const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number) => `#${hex(r)}${hex(g)}${hex(b)}`;
function hsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (delta) {
    if (max === r / 255) h = (((g - b) / 255 / delta) % 6) / 6;
    else if (max === g / 255) h = (((b - r) / 255 / delta) + 2) / 6;
    else h = (((r - g) / 255 / delta) + 4) / 6;
  }
  return { h: (h + 1) % 1, s, l };
}
function fromHsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return toHex(f(0), f(8), f(4));
}
function readable(candidate: Candidate) { return fromHsl(candidate.hue, Math.max(.38, candidate.saturation), Math.max(.38, Math.min(.7, candidate.lightness))); }

export function extractPaletteFromPixels(data: Uint8ClampedArray | Uint8Array): Palette {
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.count++;
    buckets.set(key, bucket);
  }
  const candidates: Candidate[] = [...buckets.values()].map((bucket) => {
    const r = bucket.r / bucket.count, g = bucket.g / bucket.count, b = bucket.b / bucket.count;
    const color = hsl(r, g, b);
    return { r, g, b, count: bucket.count, saturation: color.s, lightness: color.l, hue: color.h };
  });
  if (candidates.length === 0) return fallback;
  const score = (candidate: Candidate) => Math.pow(candidate.count, .42) * Math.pow(.12 + candidate.saturation, 1.6) * (.25 + Math.sin(Math.PI * candidate.lightness));
  candidates.sort((a, b) => score(b) - score(a));
  const primary = candidates[0];
  const secondary = candidates.find((candidate) => {
    const distance = Math.abs(candidate.hue - primary.hue);
    return Math.min(distance, 1 - distance) > .12 && candidate.saturation > .22;
  });
  return { primary: readable(primary), secondary: secondary ? readable(secondary) : fromHsl((primary.hue + .36) % 1, Math.max(.45, primary.saturation * .8), .62) };
}

export async function paletteFromArtwork(blob: Blob): Promise<Palette> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(bitmap, 0, 0, 64, 64);
    return extractPaletteFromPixels(context.getImageData(0, 0, 64, 64).data);
  } finally { bitmap.close(); }
}
