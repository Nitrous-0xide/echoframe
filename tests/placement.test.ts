import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PeripheralPlacementEngine, protectedZone, rectanglesOverlap, type Rect } from '../src/scene/PlacementEngine';
import type { Edge } from '../src/types';

const engine = new PeripheralPlacementEngine();
const allEdges: Edge[] = ['top', 'right', 'bottom', 'left'];

test('all reserved word bounds remain inside the viewport and outside the protected centre', () => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 800, height: 326 }, { width: 1280, height: 720 }]) {
    for (const safeZone of [.3, .65, .8]) {
      for (const wordSize of [39, 58, 120]) {
        const centre = protectedZone(viewport, safeZone);
        let placed = 0;
        for (let seed = 1; seed <= 60; seed++) {
          const p = engine.place({ viewport, textSize: { width: wordSize * 5, height: wordSize }, settings: { safeZone, enabledEdges: allEdges }, occupied: [], recent: [], seed });
          if (!p) continue;
          placed++;
          assert.ok(p.reserved.x >= 0 && p.reserved.y >= 0);
          assert.ok(p.reserved.x + p.reserved.width <= viewport.width);
          assert.ok(p.reserved.y + p.reserved.height <= viewport.height);
          assert.equal(rectanglesOverlap(p.reserved, centre), false);
        }
        if (viewport.width === 800 && safeZone === .8 && wordSize === 120) assert.equal(placed, 0, 'unreadably small words should wait for more space');
        else assert.ok(placed > 0, `no valid placement for ${JSON.stringify({ viewport, safeZone, wordSize })}`);
      }
    }
  }
});

test('simultaneous words avoid one another and impossible placements wait', () => {
  const viewport = { width: 1280, height: 720 };
  const occupied: Rect[] = [];
  const recent: { edge: Edge; x: number; y: number }[] = [];
  let count = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const p = engine.place({ viewport, textSize: { width: 240, height: 58 }, settings: { safeZone: .65, enabledEdges: allEdges }, occupied, recent, seed });
    if (!p) continue;
    assert.ok(occupied.every((r) => !rectanglesOverlap(p.reserved, r)));
    occupied.push(p.reserved); recent.unshift({ edge: p.edge, x: p.x, y: p.y }); count++;
  }
  assert.ok(count >= 3);
  const blocked = engine.place({ viewport, textSize: { width: 240, height: 58 }, settings: { safeZone: .65, enabledEdges: allEdges }, occupied: [{ x: 0, y: 0, width: viewport.width, height: viewport.height }], recent, seed: 123 });
  assert.equal(blocked, null);
});

test('an edge restriction never selects another edge', () => {
  for (const edge of allEdges) {
    for (let seed = 1; seed < 30; seed++) {
      const p = engine.place({ viewport: { width: 1920, height: 1080 }, textSize: { width: 250, height: 55 }, settings: { safeZone: .65, enabledEdges: [edge] }, occupied: [], recent: [], seed });
      assert.equal(p?.edge, edge);
      assert.equal(p?.rotation, 0);
    }
  }
});

test('manual exclusions prevent placement even in immersive mode', () => {
  const viewport = { width: 1200, height: 800 };
  const exclusion = { x: 0, y: 0, width: .5, height: 1 };
  for (let seed = 1; seed < 30; seed++) {
    const p = engine.place({ viewport, textSize: { width: 200, height: 50 },
      settings: { safeZone: .65, enabledEdges: allEdges, placementMode: 'Immersive', manualExclusion: exclusion }, occupied: [], recent: [], seed });
    if (p) assert.equal(rectanglesOverlap(p.reserved, { x: 0, y: 0, width: 600, height: 800 }), false);
  }
});

test('words in one lyric line follow a readable line, staircase, or vertical path', () => {
  const viewport = { width: 1920, height: 1080 };
  for (const [layout, edge] of [['line', 'top'], ['staircase', 'bottom'], ['vertical', 'right']] as const) {
    const settings = { safeZone: .65, enabledEdges: [edge] };
    const first = engine.place({ viewport, textSize: { width: 115, height: 48 }, settings, occupied: [], recent: [], seed: 3 });
    assert.ok(first);
    const second = engine.place({ viewport, textSize: { width: 125, height: 48 }, settings,
      occupied: [first.reserved], recent: [], seed: 4, follow: { ...first, layout } });
    assert.ok(second, `${layout} did not place a second word`);
    assert.equal(rectanglesOverlap(first.reserved, second.reserved), false);
    assert.ok(Math.hypot((first.x - second.x) * viewport.width, (first.y - second.y) * viewport.height) < 175, `${layout} words scattered`);
    if (layout === 'line') assert.ok(Math.abs(first.y - second.y) < .025);
    if (layout === 'vertical') assert.ok(Math.abs(first.x - second.x) < .025);
  }
});

test('a repeated word can start in a different screen area', () => {
  const viewport = { width: 1920, height: 1080 };
  const settings = { safeZone: .65, enabledEdges: allEdges };
  const first = engine.place({ viewport, textSize: { width: 120, height: 50 }, settings, occupied: [], recent: [], seed: 2 });
  assert.ok(first);
  const repeat = engine.place({ viewport, textSize: { width: 120, height: 50 }, settings, occupied: [], recent: [], seed: 3,
    avoid: [{ x: first.x, y: first.y }] });
  assert.ok(repeat);
  assert.ok(Math.hypot(first.x - repeat.x, first.y - repeat.y) > .3);
});
