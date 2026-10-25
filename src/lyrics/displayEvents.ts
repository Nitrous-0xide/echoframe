import type { TimedLine } from '../types';

export interface DisplayWord {
  text: string;
  startMs: number;
  endMs: number;
  lineEndMs: number;
  lineId: number;
  wordIndex: number;
}

// Show the next line just after the previous one ends, so two chunks never share
// the screen. The nudge is capped per line and across the song: provider timings
// that already touch each other (a 0–40 ms gap is inaudible) must never push the
// lyrics seconds behind the vocals by the final chorus.
const LINE_GAP_MS = 40;
const MAX_LINE_SHIFT_MS = 240;
const MAX_TOTAL_SHIFT_MS = 320;

// Keep words in lyric order even when a provider gives adjacent lines overlapping timestamps.
export function displayEvents(lines: TimedLine[]): DisplayWord[] {
  const events: DisplayWord[] = [];
  const ordered = [...lines].map((line, lineId) => ({ line, lineId })).sort((a, b) => a.line.startMs - b.line.startMs);
  let previousEnd = -Infinity;
  let totalShift = 0;
  for (const { line, lineId } of ordered) {
    const words = (line.words?.length ? line.words : [{ text: line.text, startMs: line.startMs, endMs: line.endMs }])
      .slice().sort((a, b) => a.startMs - b.startMs);
    if (!words.length) continue;
    const naturalStart = words[0].startMs;
    const naturalEnd = Math.max(...words.map((word) => word.endMs));
    const overlap = previousEnd + LINE_GAP_MS - naturalStart;
    let shift = 0;
    if (overlap > 0) {
      shift = Math.min(overlap, MAX_LINE_SHIFT_MS, Math.max(0, MAX_TOTAL_SHIFT_MS - totalShift));
      totalShift += shift;
    } else {
      // The schedule caught up with the provider, so earlier corrections are spent.
      totalShift = 0;
    }
    const lineEndMs = naturalEnd + shift;
    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
      const word = words[wordIndex];
      events.push({ text: word.text, startMs: word.startMs + shift, endMs: word.endMs + shift,
        lineEndMs, lineId, wordIndex });
    }
    previousEnd = lineEndMs;
  }
  return events;
}
