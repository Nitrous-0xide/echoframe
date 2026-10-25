import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoothTravel } from '../src/scene/lightingMath';

test('a left-to-right signal travels smoothly instead of switching sides', () => {
  let x = .5;
  for (let i = 0; i < 60; i++) x = smoothTravel(x, -1, 1, 1 / 60);
  assert.ok(x < .2);
  const next = smoothTravel(x, 1, 1, 1 / 60);
  assert.ok(next > x && next < .3, `${x} -> ${next}`);
  for (let i = 0; i < 90; i++) x = smoothTravel(x, 1, 1, 1 / 60);
  assert.ok(x > .8);
});
