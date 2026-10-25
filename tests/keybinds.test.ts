import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceleratorFromEvent, normalizeAccelerator, sanitizeKeybinds } from '../src/keybinds';

function event(code: string, modifiers: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) {
  return { code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers };
}

test('key recording turns a key event into an accelerator', () => {
  assert.equal(acceleratorFromEvent(event('KeyK', { ctrlKey: true, altKey: true })), 'Ctrl+Alt+K');
  assert.equal(acceleratorFromEvent(event('F8')), 'F8');
  assert.equal(acceleratorFromEvent(event('ArrowUp', { ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+Up');
  assert.equal(acceleratorFromEvent(event('Digit1', { ctrlKey: true })), 'Ctrl+1');
  assert.equal(acceleratorFromEvent(event('KeyM', { metaKey: true })), 'Super+M');
});

test('plain letters and unsupported keys are not accepted', () => {
  assert.equal(acceleratorFromEvent(event('KeyK')), null);
  assert.equal(acceleratorFromEvent(event('Semicolon', { ctrlKey: true })), null);
  assert.equal(acceleratorFromEvent(event('ControlLeft')), null);
});

test('stored accelerators are normalized and validated', () => {
  assert.equal(normalizeAccelerator('shift+control+k'), 'Ctrl+Shift+K');
  assert.equal(normalizeAccelerator('alt+F8'), 'Alt+F8');
  assert.equal(normalizeAccelerator('Ctrl+Alt+Shift+O'), 'Ctrl+Alt+Shift+O');
  assert.equal(normalizeAccelerator('K'), null);
  assert.equal(normalizeAccelerator('Ctrl+F25'), null);
  assert.equal(normalizeAccelerator(42), null);
});

test('keybinds drop unknown actions, invalid accelerators, and duplicates', () => {
  const result = sanitizeKeybinds({
    overlayEnabled: 'Ctrl+K',
    miniplayerEnabled: 'ctrl+k',
    lightingEnabled: 'K',
    unknownAction: 'Ctrl+J',
    uiAnimations: 'Shift+Ctrl+P'
  });
  assert.deepEqual(result, { overlayEnabled: 'Ctrl+K', uiAnimations: 'Ctrl+Shift+P' });
  assert.deepEqual(sanitizeKeybinds(null), {});
});
