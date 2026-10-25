import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPaletteFromPixels } from '../src/theme/palette';

test('a vivid accent can win over a mostly black cover', () => {
  const data = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < 100; i++) {
    data[i * 4] = i < 80 ? 10 : 145;
    data[i * 4 + 1] = i < 80 ? 10 : 45;
    data[i * 4 + 2] = i < 80 ? 12 : 240;
    data[i * 4 + 3] = 255;
  }
  const palette = extractPaletteFromPixels(data);
  const red = parseInt(palette.primary.slice(1, 3), 16);
  const blue = parseInt(palette.primary.slice(5, 7), 16);
  assert.ok(blue > red + 40, palette.primary);
});

test('transparent artwork falls back to a legible palette', () => {
  const palette = extractPaletteFromPixels(new Uint8ClampedArray(40));
  assert.match(palette.primary, /^#[0-9a-f]{6}$/);
  assert.notEqual(palette.primary, '#000000');
});
