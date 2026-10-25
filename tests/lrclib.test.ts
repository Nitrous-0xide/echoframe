import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { LrclibClient } from '../electron/lyricsService';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const record = { trackName: 'I Want to Live', artistName: 'Borislav Slavov', duration: 233, syncedLyrics: '[00:01.00] First line\n[00:03.00] Second line', instrumental: false };
function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } }); }

test('fetches timed lyrics with track metadata and caches the result', async () => {
  const requests: URL[] = [];
  globalThis.fetch = async (input) => { requests.push(new URL(String(input))); return json(record); };
  const client = new LrclibClient();
  const track = { title: 'I Want to Live', artist: 'Borislav Slavov', durationMs: 233000 };
  const result = await client.lookup(track, new AbortController().signal);
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0].startMs, 1000);
  assert.equal(result.timing, 'estimated');
  assert.equal(result.lines[0].words?.length, 2);
  assert.equal(requests[0].searchParams.get('duration'), '233');
  await client.lookup(track, new AbortController().signal);
  assert.equal(requests.length, 1);
});

test('rejects mismatched lyrics and finds an exact timed search result', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json(calls === 1 ? { ...record, artistName: 'Wrong artist' } : [{ ...record, duration: 270 }, record]); };
  const result = await new LrclibClient().lookup({ title: record.trackName, artist: record.artistName, durationMs: 233000 }, new AbortController().signal);
  assert.equal(calls, 2);
  assert.equal(result.lines.length, 2);
});

test('reports unavailable when a track has only plain lyrics', async () => {
  globalThis.fetch = async () => json({ ...record, syncedLyrics: null, plainLyrics: 'Untimed text' });
  const result = await new LrclibClient().lookup({ title: record.trackName, artist: record.artistName, durationMs: 233000 }, new AbortController().signal);
  assert.equal(result.lines.length, 0);
});

test('prefers recorded Lyricsfile word timestamps over line LRC', async () => {
  globalThis.fetch = async () => json({ ...record, lyricsfile: `version: '1.0'
lines:
  - text: First line
    start_ms: 1000
    end_ms: 2200
    words:
      - { text: 'First ', start_ms: 1000, end_ms: 1600 }
      - { text: 'line', start_ms: 1600, end_ms: 2200 }
` });
  const result = await new LrclibClient().lookup({ title: record.trackName, artist: record.artistName, durationMs: 233000 }, new AbortController().signal);
  assert.equal(result.timing, 'word');
  assert.deepEqual(result.lines[0].words?.map((word) => word.startMs), [1000, 1600]);
});
