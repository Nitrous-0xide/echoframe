import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniplayerBounds, miniplayerScale, MINIPLAYER_MARGIN } from '../src/miniplayer/layout';

const area = { x: 0, y: 0, width: 1920, height: 1040 };

test('the miniplayer hugs either edge and stays vertically centred', () => {
  const left = miniplayerBounds(area, 'left', 1);
  const right = miniplayerBounds(area, 'right', 1);
  assert.equal(left.x, MINIPLAYER_MARGIN);
  assert.equal(right.x + right.width, area.width - MINIPLAYER_MARGIN);
  assert.equal(left.width, right.width);
  assert.equal(left.y, Math.round((area.height - left.height) / 2));
  assert.equal(left.y, right.y);
});

test('scale changes the panel size and is clamped to a usable range', () => {
  const base = miniplayerBounds(area, 'right', 1);
  const large = miniplayerBounds(area, 'right', 1.35);
  assert.ok(large.width > base.width && large.height > base.height);
  assert.deepEqual(miniplayerBounds(area, 'right', 9), miniplayerBounds(area, 'right', 1.35));
  assert.deepEqual(miniplayerBounds(area, 'right', 0), miniplayerBounds(area, 'right', .75));
  assert.equal(miniplayerScale(Number.NaN), 1);
});

test('a short or narrow work area keeps the panel fully on screen', () => {
  const short = miniplayerBounds({ x: 100, y: 40, width: 1366, height: 728 }, 'right', 1.35);
  assert.ok(short.height <= 728 - MINIPLAYER_MARGIN * 2);
  assert.ok(short.width <= 1366 - MINIPLAYER_MARGIN * 2);
  assert.equal(short.x + short.width, 100 + 1366 - MINIPLAYER_MARGIN);
  const narrow = miniplayerBounds({ x: 0, y: 0, width: 240, height: 900 }, 'left', 1.35);
  assert.ok(narrow.width <= 240 - MINIPLAYER_MARGIN * 2);
  assert.equal(narrow.x, MINIPLAYER_MARGIN);
});
