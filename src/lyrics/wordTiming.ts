import type { TimedLine, WordTimingKind } from '../types';

// Estimated words stay near the start of their line. A long line usually means
// the instrumental continues until the next lyric, not that the singer draws
// every word out, so pace the words and leave the rest of the line as silence.
const TAIL_MS = 140;
const MAX_WORD_MS = 460;
const MAX_SPAN_MS = 8000;

export function withWordTiming(lines: TimedLine[]): { lines: TimedLine[]; timing: WordTimingKind } {
  let recorded = false;
  let estimated = false;
  const result = lines.map((line) => {
    if (line.words?.length) { recorded = true; return line; }
    const tokens = line.text.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return line;
    estimated = true;
    const span = Math.max(1, Math.min(MAX_SPAN_MS, line.endMs - line.startMs));
    const tail = Math.min(TAIL_MS, span * .15);
    const usable = Math.max(120, Math.min(span - tail, tokens.length * MAX_WORD_MS + 160));
    const weights = tokens.map((token) => {
      const letters = [...token.replace(/[^\p{L}\p{N}]/gu, '')].length;
      return 0.65 + Math.sqrt(Math.max(1, letters)) + (/[,.!?;:]$/.test(token) ? .35 : 0);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let elapsed = 0;
    const words = tokens.map((token, index) => {
      const startMs = line.startMs + Math.round(usable * elapsed / total);
      elapsed += weights[index];
      const endMs = line.startMs + Math.round(usable * elapsed / total);
      return { text: token, startMs, endMs: Math.max(startMs + 1, endMs), confidence: 0 };
    });
    return { ...line, words };
  });
  return { lines: result, timing: recorded && estimated ? 'mixed' : recorded ? 'word' : estimated ? 'estimated' : 'none' };
}
