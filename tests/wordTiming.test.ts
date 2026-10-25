import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLyricsfile } from '../src/lyrics/lyricsfile';
import { withWordTiming } from '../src/lyrics/wordTiming';

test('Lyricsfile keeps recorded timestamps for independently repeated words', () => {
  const lines = parseLyricsfile(`version: '1.0'
lines:
  - text: Go go go
    start_ms: 1200
    end_ms: 2400
    words:
      - { text: 'Go ', start_ms: 1200, end_ms: 1500 }
      - { text: 'go ', start_ms: 1600, end_ms: 1900 }
      - { text: 'go', start_ms: 2000, end_ms: 2400 }
`);
  const result = withWordTiming(lines);
  assert.equal(result.timing, 'word');
  assert.deepEqual(result.lines[0].words?.map((word) => word.startMs), [1200, 1600, 2000]);
  assert.deepEqual(result.lines[0].words?.map((word) => word.text), ['Go', 'go', 'go']);
});

test('line-only text gets labeled estimated word timing without stretching across silence', () => {
  const result = withWordTiming([{ text: 'One two three', startMs: 1000, endMs: 20000 }]);
  assert.equal(result.timing, 'estimated');
  assert.equal(result.lines[0].words?.length, 3);
  assert.equal(result.lines[0].words?.[0].startMs, 1000);
  assert.ok(result.lines[0].words![2].endMs <= 7000);
  assert.equal(result.lines[0].words?.[0].confidence, 0);
});

test('mixed lyrics retain recorded words and estimate only missing lines', () => {
  const result = withWordTiming([
    { text: 'Go', startMs: 0, endMs: 500, words: [{ text: 'Go', startMs: 0, endMs: 500 }] },
    { text: 'Away now', startMs: 600, endMs: 1600 }
  ]);
  assert.equal(result.timing, 'mixed');
  assert.equal(result.lines[0].words?.[0].confidence, undefined);
  assert.equal(result.lines[1].words?.length, 2);
});
