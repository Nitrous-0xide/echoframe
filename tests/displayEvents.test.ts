import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayEvents } from '../src/lyrics/displayEvents';
import { withWordTiming } from '../src/lyrics/wordTiming';

test('a new lyric chunk waits until every word in the prior line has finished', () => {
  const events = displayEvents([
    { text: 'one two', startMs: 1000, endMs: 2200, words: [
      { text: 'one', startMs: 1000, endMs: 1700 }, { text: 'two', startMs: 1700, endMs: 2200 }
    ] },
    { text: 'three four', startMs: 2000, endMs: 2700, words: [
      { text: 'three', startMs: 2000, endMs: 2350 }, { text: 'four', startMs: 2350, endMs: 2700 }
    ] }
  ]);
  assert.deepEqual(events.map((event) => event.text), ['one', 'two', 'three', 'four']);
  assert.ok(events[2].startMs > events[1].endMs);
  assert.equal(events[0].lineEndMs, events[1].lineEndMs);
  assert.equal(events[2].lineEndMs, events[3].lineEndMs);
  assert.equal(events[3].startMs - events[2].startMs, 350);
});

test('touching line timings cannot push the lyrics seconds behind the song', () => {
  // Plain LRC ends every line where the next one starts. That 0 ms gap must not
  // add up into a growing delay over a full song.
  const source = Array.from({ length: 60 }, (_, index) => ({
    text: `line ${index}`,
    startMs: 1000 + index * 2000,
    endMs: 1000 + index * 2000 + 2000,
    words: [{ text: 'word', startMs: 1000 + index * 2000, endMs: 1000 + index * 2000 + 2000 }]
  }));
  const events = displayEvents(source);
  const drift = events.map((event) => event.startMs - source[event.lineId].startMs);
  assert.ok(Math.max(...drift) <= 320, `worst drift was ${Math.max(...drift)} ms`);
  assert.equal(events[events.length - 1].startMs - source[59].startMs, 0);
  for (let index = 1; index < events.length; index++) assert.ok(events[index].lineId >= events[index - 1].lineId);
});

test('a large overlap is only nudged, and real silence restores the provider timing', () => {
  const events = displayEvents([
    { text: 'one', startMs: 1000, endMs: 3000, words: [{ text: 'one', startMs: 1000, endMs: 3000 }] },
    { text: 'two', startMs: 2500, endMs: 4000, words: [{ text: 'two', startMs: 2500, endMs: 4000 }] },
    { text: 'three', startMs: 9000, endMs: 10_000, words: [{ text: 'three', startMs: 9000, endMs: 10_000 }] }
  ]);
  assert.equal(events[1].startMs, 2740);
  assert.equal(events[2].startMs, 9000);
});

test('estimated lines leave the next line its own time, so no correction builds up', () => {
  const source = Array.from({ length: 40 }, (_, index) => ({
    text: 'one two three four five', startMs: 1000 + index * 3000, endMs: 1000 + index * 3000 + 3000
  }));
  const { lines } = withWordTiming(source);
  const events = displayEvents(lines);
  const lastLine = events.filter((event) => event.lineId === 39);
  assert.equal(lastLine[0].startMs, 1000 + 39 * 3000);
  assert.ok(lastLine[lastLine.length - 1].endMs < source[39].endMs);
});
