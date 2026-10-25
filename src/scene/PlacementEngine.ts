import type { AppSettings, Edge } from '../types';

export interface Rect { x: number; y: number; width: number; height: number }
export interface Placement {
  edge: Edge;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  depth: number;
  reserved: Rect;
}
export interface PlacementRequest {
  viewport: { width: number; height: number };
  textSize: { width: number; height: number };
  settings: Pick<AppSettings, 'safeZone' | 'enabledEdges'> & Partial<Pick<AppSettings, 'placementMode' | 'manualExclusion'>>;
  occupied: Rect[];
  recent: { edge: Edge; x: number; y: number }[];
  seed: number;
  direction?: number;
  follow?: { edge: Edge; x: number; y: number; width: number; height: number; layout: 'line' | 'staircase' | 'vertical' };
  avoid?: { x: number; y: number }[];
}

const EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];
const GOLDEN = 0.618033988749895;
const PAD = 8;
const RESERVE = 1.12; // Room for the small scale and motion changes without a large visible gap.
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fractional = (value: number) => value - Math.floor(value);
const intersectionArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const inside = (r: Rect, width: number, height: number) => r.x >= PAD && r.y >= PAD && r.x + r.width <= width - PAD && r.y + r.height <= height - PAD;

export function protectedZone(viewport: { width: number; height: number }, safeZone: number): Rect {
  const width = viewport.width * safeZone;
  const height = viewport.height * safeZone;
  return { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height };
}

export class PeripheralPlacementEngine {
  place(request: PlacementRequest): Placement | null {
    const { viewport, settings, textSize, occupied, recent, seed } = request;
    const { width: screenW, height: screenH } = viewport;
    if (screenW < 160 || screenH < 120 || textSize.width <= 0 || textSize.height <= 0) return null;
    const effectiveSafe = settings.placementMode === 'Immersive' ? .12 : settings.placementMode === 'Dynamic Edge' ? settings.safeZone * .65 : settings.safeZone;
    const zone = protectedZone(viewport, clamp(effectiveSafe, .1, .8));
    const exclusions = [...occupied];
    if (settings.manualExclusion) exclusions.push({ x: settings.manualExclusion.x * screenW, y: settings.manualExclusion.y * screenH,
      width: settings.manualExclusion.width * screenW, height: settings.manualExclusion.height * screenH });
    const allowed = EDGES.filter((edge) => settings.enabledEdges.includes(edge));
    if (allowed.length === 0) return null;
    let best: { value: Placement; score: number } | null = null;
    const start = request.follow ? allowed.indexOf(request.follow.edge) : Math.floor(fractional(seed * GOLDEN) * allowed.length);
    for (let e = 0; e < allowed.length; e++) {
      const edge = allowed[(Math.max(0, start) + e) % allowed.length];
      const side = edge === 'left' || edge === 'right';
      const follow = request.follow && edge === request.follow.edge ? request.follow : null;
      const band = side ? zone.x : zone.y;
      const along = side ? screenH : screenW;
      const desiredThickness = side ? textSize.width : textSize.height;
      const desiredLength = side ? textSize.height : textSize.width;
      const maxScale = Math.min(1, (band - PAD * 2) / (desiredThickness * RESERVE), (along - PAD * 2) / (desiredLength * RESERVE));
      if (maxScale < .18) continue;
      const scale = maxScale;
      const renderW = textSize.width * scale;
      const renderH = textSize.height * scale;
      const boxW = renderW * RESERVE;
      const boxH = renderH * RESERVE;
      const perp = side ? boxW : boxH;
      const length = side ? boxH : boxW;
      const minAlong = PAD + length / 2;
      const maxAlong = along - PAD - length / 2;
      if (minAlong > maxAlong) continue;
      const bandCentre = band / 2;
      for (let i = 0; i < 22; i++) {
        const alongCentre = minAlong + fractional(seed * .371 + i * GOLDEN + e * .127) * (maxAlong - minAlong);
        let cx = side ? (edge === 'left' ? bandCentre : screenW - bandCentre) : alongCentre;
        let cy = side ? alongCentre : (edge === 'top' ? bandCentre : screenH - bandCentre);
        if (follow && i < 16) {
          const dx = (follow.width + renderW) * RESERVE / 2 + 2;
          const dy = (follow.height + renderH) * RESERVE / 2 + 2;
          const forwardX = follow.x * screenW + dx;
          const forwardY = follow.y * screenH + dy;
          const n = Math.floor(i / 4) + 1;
          const direction = i % 2 === 0 ? 1 : -1;
          if (follow.layout === 'vertical' || (follow.layout === 'staircase' && side)) {
            cy = follow.y * screenH + direction * n * dy;
            cx = follow.x * screenW + (follow.layout === 'staircase' ? (i % 4 < 2 ? 1 : -1) * Math.min(18, band * .13) : 0);
          } else {
            cx = follow.x * screenW + direction * n * dx;
            cy = follow.y * screenH + (follow.layout === 'staircase' ? (i % 4 < 2 ? 1 : -1) * Math.min(18, band * .13) : 0);
          }
          // Keep the first candidate in reading order when there is room.
          if (i === 0) { cx = follow.layout === 'vertical' || (follow.layout === 'staircase' && side) ? follow.x * screenW : forwardX;
            cy = follow.layout === 'vertical' || (follow.layout === 'staircase' && side) ? forwardY : follow.y * screenH; }
        }
        const reserved = { x: cx - boxW / 2, y: cy - boxH / 2, width: boxW, height: boxH };
        if (!inside(reserved, screenW, screenH) || intersectionArea(reserved, zone) > 0) continue;
        if (exclusions.some((r) => intersectionArea(reserved, r) > 0)) continue;
        const historyPenalty = recent.reduce((sum, prev, age) => {
          const dist = Math.hypot((cx / screenW - prev.x) * 2, (cy / screenH - prev.y) * 2);
          return sum + (prev.edge === edge ? .16 : 0) / (age + 1) + .35 * Math.max(0, .25 - dist) / (age + 1);
        }, 0);
        const balance = .12 * Math.abs((side ? cx / screenW : cy / screenH) - .5);
        const directionalBias = (edge === 'right' ? -1 : edge === 'left' ? 1 : 0) * clamp(request.direction ?? 0, -1, 1) * .18;
        const proximity = follow ? (edge === follow.edge ? Math.hypot(cx / screenW - follow.x, cy / screenH - follow.y) : 3) : 0;
        const repetitionPenalty = (request.avoid ?? []).reduce((sum, point) => sum + Math.max(0, .45 - Math.hypot(cx / screenW - point.x, cy / screenH - point.y)) * 8, 0);
        const score = (follow ? proximity : historyPenalty) + repetitionPenalty + balance + directionalBias + e * .008 + i * .0001;
        if (!best || score < best.score) {
          best = { score, value: { edge, x: cx / screenW, y: cy / screenH, width: renderW, height: renderH, scale, rotation: 0, depth: -1.4 + fractional(seed * .293) * 2.2, reserved } };
        }
      }
    }
    return best?.value ?? null;
  }
}

export function rectanglesOverlap(a: Rect, b: Rect): boolean { return intersectionArea(a, b) > 0; }
