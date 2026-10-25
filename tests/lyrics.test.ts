import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc } from '../src/lyrics/lrc';

test('plain LRC retains line timing without inventing word timestamps', () => {
  const lines = parseLrc('[00:01.00]Run, run, run\n[00:03.00]Into the night');
  assert.deepEqual(lines.map((line) => [line.startMs, line.endMs]), [[1000, 3000], [3000, 7500]]);
  assert.equal(lines[0].words, undefined);
});

test('enhanced LRC gives repeated words independent timestamps', () => {
  const lines = parseLrc('[offset:100]\n[00:02.00]<00:02.00>Run <00:02.30>run <00:02.60>run\n[00:03.00]Next');
  assert.equal(lines[0].startMs, 2100);
  assert.deepEqual(lines[0].words?.map((word) => [word.text, word.startMs]), [['Run', 2100], ['run', 2400], ['run', 2700]]);
  assert.ok(lines[0].words!.every((word) => word.endMs > word.startMs));
});
