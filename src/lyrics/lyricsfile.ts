import YAML from 'yaml';
import type { TimedLine, TimedWord } from '../types';
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400_000;
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export function parseLyricsfile(source: string): TimedLine[] {
  if (source.length > 1_000_000) return [];
  let value: unknown;
  try { value = YAML.parse(source, { maxAliasCount: 0, uniqueKeys: true }); } catch { return []; }
  if (!value || typeof value !== 'object') return [];
  const rawLines = (value as { lines?: unknown }).lines;
  if (!Array.isArray(rawLines)) return [];
  const lines: TimedLine[] = [];
  for (const item of rawLines.slice(0, 5000)) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const wordItems = Array.isArray(raw.words) ? raw.words.slice(0, 100) : [];
    const words: TimedWord[] = wordItems.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return [];
      const word = candidate as Record<string, unknown>;
      const label = text(word.text, 100);
      return label && number(word.start_ms) ? [{ text: label, startMs: word.start_ms, endMs: number(word.end_ms) ? word.end_ms : 0 }] : [];
    }).sort((a, b) => a.startMs - b.startMs);
    const label = text(raw.text) || text(words.map((word) => word.text).join(' '));
    const start = number(raw.start_ms) ? raw.start_ms : words[0]?.startMs;
    if (!label || start === undefined) continue;
    lines.push({ text: label, startMs: start, endMs: number(raw.end_ms) ? raw.end_ms : 0, words: words.length ? words : undefined });
  }
  lines.sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    line.endMs = Math.max(line.startMs + 300, line.endMs || lines[i + 1]?.startMs || line.startMs + 4500);
    line.words?.forEach((word, index) => { word.endMs = Math.max(word.startMs + 80, word.endMs || line.words?.[index + 1]?.startMs || line.endMs); });
  }
  return lines;
}
