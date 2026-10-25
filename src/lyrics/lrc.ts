import type { TimedLine, TimedWord } from '../types';

const stamp = /^(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?$/;
function timeMs(raw: string): number | null {
  const match = stamp.exec(raw);
  if (!match) return null;
  const fraction = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
  return (Number(match[1]) * 60 + Number(match[2])) * 1000 + fraction;
}
function clean(text: string) { return text.replace(/\s+/g, ' ').trim(); }

export function parseLrc(source: string): TimedLine[] {
  const lines: TimedLine[] = [];
  const offsetRaw = /^\[offset:([+-]?\d+)\]/im.exec(source)?.[1];
  const offset = offsetRaw ? Number(offsetRaw) : 0;
  for (const rawLine of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const times = [...rawLine.matchAll(/\[([^\]]+)\]/g)].map((m) => timeMs(m[1])).filter((v): v is number => v !== null);
    if (times.length === 0) continue;
    const body = rawLine.replace(/^(?:\[[^\]]+\])+/, '');
    const markers = [...body.matchAll(/<([^>]+)>/g)].map((m) => ({ start: timeMs(m[1]), index: m.index!, length: m[0].length })).filter((m): m is { start: number; index: number; length: number } => m.start !== null);
    const text = clean(body.replace(/<[^>]+>/g, ''));
    if (!text) continue;
    for (const time of times) {
      const startMs = Math.max(0, time + offset);
      const words: TimedWord[] = [];
      for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        const next = markers[i + 1];
        const wordText = clean(body.slice(marker.index + marker.length, next?.index ?? body.length));
        if (wordText) words.push({ text: wordText, startMs: Math.max(0, marker.start + offset), endMs: 0 });
      }
      lines.push({ text, startMs, endMs: 0, words: words.length ? words : undefined });
    }
  }
  lines.sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const nextStart = lines[i + 1]?.startMs;
    current.endMs = Math.max(current.startMs + 300, nextStart ?? current.startMs + 4500);
    if (current.words) for (let j = 0; j < current.words.length; j++) {
      const word = current.words[j];
      word.endMs = Math.max(word.startMs + 100, current.words[j + 1]?.startMs ?? current.endMs);
    }
  }
  return lines;
}
