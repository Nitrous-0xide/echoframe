import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryLookup } from '../electron/lyricsRetry';

test('a temporary lookup failure retries without changing the track', async () => {
  let calls = 0;
  const retries: number[] = [];
  const value = await retryLookup(async () => {
    calls++;
    if (calls < 3) throw new Error('LRCLIB temporarily unavailable');
    return 'timed lyrics';
  }, new AbortController().signal, (_error, attempt) => retries.push(attempt), [0, 1, 1]);
  assert.equal(value, 'timed lyrics');
  assert.equal(calls, 3);
  assert.deepEqual(retries, [1, 2]);
});

test('track changes cancel a pending retry', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = retryLookup(async () => { calls++; throw new Error('temporary'); }, controller.signal,
    () => controller.abort('track changed'), [0, 1000]);
  await assert.rejects(pending);
  assert.equal(calls, 1);
});
