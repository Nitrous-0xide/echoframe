import type { AppSettings } from './types';

export interface ToggleAction {
  id: keyof AppSettings & string;
  label: string;
  description: string;
}

export const TOGGLE_ACTIONS = [
  { id: 'overlayEnabled', label: 'Overlay', description: 'Show or hide the words and light' },
  { id: 'clickThrough', label: 'Click-through', description: 'Let clicks pass to the desktop' },
  { id: 'lightingEnabled', label: 'Lighting', description: 'Peripheral light field' },
  { id: 'lightingOnly', label: 'Lighting only', description: 'Hide lyric words on the desktop' },
  { id: 'photosensitivitySafe', label: 'Photosensitivity safe', description: 'Cap flashes and brightness jumps' },
  { id: 'reducedMotion', label: 'Reduced motion', description: 'Lower overlay drift and rotation' },
  { id: 'miniplayerEnabled', label: 'Miniplayer', description: 'Collapse lyrics into the side panel' },
  { id: 'miniplayerBounce', label: 'Word bounce', description: 'Bounce each word in the miniplayer' },
  { id: 'audioEnabled', label: 'Audio analysis', description: 'Opt into local output capture' },
  { id: 'manualExclusion', label: 'Protected rectangle', description: 'Keep words out of a chosen area' },
  { id: 'uiAnimations', label: 'Menu animations', description: 'Animate studio pages and panels' }
] as const satisfies readonly ToggleAction[];

export type ToggleActionId = (typeof TOGGLE_ACTIONS)[number]['id'];

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super'] as const;
const NAMED_KEYS: Record<string, string> = {
  Space: 'Space', Tab: 'Tab', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  Insert: 'Insert', Delete: 'Delete', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right'
};
const NORMALIZED_KEYS: Record<string, string> = {
  space: 'Space', tab: 'Tab', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
  insert: 'Insert', delete: 'Delete', up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right'
};

function functionKey(value: string) {
  return /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(value);
}

function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

export function acceleratorFromEvent(event: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null {
  const key = keyFromCode(event.code);
  if (!key) return null;
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Super');
  if (!modifiers.length && !functionKey(key)) return null;
  return [...modifiers, key].join('+');
}

// Accepts user/file accelerators in any order or case and returns one canonical form.
export function normalizeAccelerator(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 1) return null;
  const rawKey = parts.pop()!;
  const modifiers = new Set<string>();
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') modifiers.add('Ctrl');
    else if (lower === 'alt') modifiers.add('Alt');
    else if (lower === 'shift') modifiers.add('Shift');
    else if (lower === 'super' || lower === 'meta' || lower === 'cmd' || lower === 'command') modifiers.add('Super');
    else return null;
  }
  let key: string | null = null;
  if (/^[a-z]$/i.test(rawKey)) key = rawKey.toUpperCase();
  else if (/^[0-9]$/.test(rawKey)) key = rawKey;
  else if (/^f(?:[1-9]|1[0-9]|2[0-4])$/i.test(rawKey)) key = rawKey.toUpperCase();
  else key = NORMALIZED_KEYS[rawKey.toLowerCase()] ?? null;
  if (!key) return null;
  if (!modifiers.size && !functionKey(key)) return null;
  return [...MODIFIERS.filter((modifier) => modifiers.has(modifier)), key].join('+');
}

export function sanitizeKeybinds(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const result: Record<string, string> = {};
  const used = new Set<string>();
  for (const action of TOGGLE_ACTIONS) {
    const accelerator = normalizeAccelerator(source[action.id]);
    if (!accelerator || used.has(accelerator)) continue;
    used.add(accelerator);
    result[action.id] = accelerator;
  }
  return result;
}

export function acceleratorParts(value: string): string[] {
  return value.split('+').filter(Boolean);
}
