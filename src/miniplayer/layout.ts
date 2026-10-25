export interface ScreenArea { x: number; y: number; width: number; height: number }
export interface MiniplayerBounds { x: number; y: number; width: number; height: number }

export const MINIPLAYER_BASE = { width: 268, height: 620 };
export const MINIPLAYER_MARGIN = 16;
export const MINIPLAYER_SCALE = { min: .75, max: 1.35 };

export function miniplayerScale(value: number) {
  return Math.min(MINIPLAYER_SCALE.max, Math.max(MINIPLAYER_SCALE.min, Number.isFinite(value) ? value : 1));
}

// A tall, narrow panel that hugs either edge of the work area and stays vertically centred.
export function miniplayerBounds(area: ScreenArea, side: 'left' | 'right', scale: number): MiniplayerBounds {
  const factor = miniplayerScale(scale);
  const availableHeight = Math.max(320, area.height - MINIPLAYER_MARGIN * 2);
  const availableWidth = Math.max(200, area.width - MINIPLAYER_MARGIN * 2);
  const width = Math.min(Math.round(MINIPLAYER_BASE.width * factor), availableWidth);
  const height = Math.min(Math.round(MINIPLAYER_BASE.height * factor), availableHeight);
  const x = side === 'left' ? area.x + MINIPLAYER_MARGIN : area.x + area.width - width - MINIPLAYER_MARGIN;
  const y = area.y + Math.round((area.height - height) / 2);
  return { x, y, width, height };
}
