import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, Tray, Menu, nativeImage, type Display } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AnimationMode, AppSettings, Edge, MediaCommand, PlacementMode, PlaybackState, RuntimeStatus, ThemeMode, TimedLine, WordTimingKind } from '../src/types';
import { miniplayerBounds, miniplayerScale } from '../src/miniplayer/layout';
import { sanitizeKeybinds, TOGGLE_ACTIONS, type ToggleActionId } from '../src/keybinds';
import { AudioBridge } from './audio';
import { MediaBridge, type MediaFrame } from './media';
import { LrclibClient } from './lyricsService';
import { retryLookup } from './lyricsRetry';

const defaults: AppSettings = {
  overlayEnabled: true, color: '#a997ff', secondaryColor: '#66e0eb', brightness: 0.7,
  intensity: 0.56, wordSize: 58, safeZone: 0.65, speed: 1, maxWords: 9,
  reducedMotion: false, clickThrough: true, preset: 'Ethereal', animationMode: 'Float',
  enabledEdges: ['top', 'right', 'bottom', 'left'], audioEnabled: false, audioDeviceId: '',
  lightingEnabled: true, lightingBrightness: .42, glowRadius: .6, stereoSensitivity: .75, photosensitivitySafe: true, themeMode: 'Album Adaptive',
  targetFps: 60, renderScale: 1,
  fontFamily: 'Segoe UI', fontWeight: 800, letterSpacing: 0, outlineWidth: 10, glowStrength: 30,
  lightingOnly: false, lightingEdges: ['top', 'right', 'bottom', 'left'], placementMode: 'Strict Edge', manualExclusion: null,
  lyricOffsetMs: 0, miniplayerEnabled: false, miniplayerSide: 'right', miniplayerScale: 1,
  miniplayerOpacity: .94, miniplayerX: null, miniplayerY: null,
  miniplayerBounce: true, miniplayerBounceStyle: 'soft', miniplayerBounceSpeed: 1,
  uiAnimations: true, uiAnimationSpeed: 1,
  keybinds: { overlayEnabled: 'Ctrl+Alt+Shift+O' }
};
const edgeValues: Edge[] = ['top', 'right', 'bottom', 'left'];
const presets = ['Ethereal', 'Neon Depth', 'Minimal', 'Kinetic', 'Ambient', 'Spatial'];
const animationModes: AnimationMode[] = ['Float', 'Bounce', 'Pop', 'Orbit', 'Drift', 'Depth Shift', 'Scatter', 'Echo', 'Wave', 'Cinematic'];
const themeModes: ThemeMode[] = ['Album Adaptive', 'Monochrome', 'Gradient', 'Custom Palette', 'Rainbow', 'Dynamic Audio Colour'];
const fontFamilies = ['Segoe UI', 'Arial', 'Georgia', 'Consolas', 'Impact'];
const placementModes: PlacementMode[] = ['Strict Edge', 'Dynamic Edge', 'Immersive'];
const bounceStyles: AppSettings['miniplayerBounceStyle'][] = ['soft', 'pop', 'spring', 'tilt'];
let failedShortcuts: string[] = [];
let capturingKeybind = false;
let settings = { ...defaults };
let studio: BrowserWindow | null = null;
let miniplayer: BrowserWindow | null = null;
let overlays = new Map<number, BrowserWindow>();
let tray: Tray | null = null;
let lastError = '';
let quitting = false;
const audioBridge = new AudioBridge();
const mediaBridge = new MediaBridge();
const lyricClient = new LrclibClient();
let playback: PlaybackState = { trackId: null, title: null, artist: null, positionMs: 0, durationMs: 0, playing: false };
let lyrics: TimedLine[] = [];
let playbackSource: 'system' | 'local' = 'system';
let mediaSource = '';
let latestMedia: MediaFrame | null = null;
let lyricsStatus: RuntimeStatus['lyricsStatus'] = 'unavailable';
let lyricsTiming: WordTimingKind = 'none';
let manualLyricsTrackId: string | null = null;
let lyricAbort: AbortController | null = null;
let lastAudioLatencyMs = 0;

function configPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function clamp(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function color(value: unknown, fallback: string) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function validate(input: Partial<AppSettings>): AppSettings {
  return {
    overlayEnabled: typeof input.overlayEnabled === 'boolean' ? input.overlayEnabled : defaults.overlayEnabled,
    color: color(input.color, defaults.color), secondaryColor: color(input.secondaryColor, defaults.secondaryColor),
    brightness: clamp(input.brightness, defaults.brightness, 0, 1),
    intensity: clamp(input.intensity, defaults.intensity, 0, 1),
    wordSize: clamp(input.wordSize, defaults.wordSize, 22, 120),
    safeZone: clamp(input.safeZone, defaults.safeZone, 0.3, 0.8),
    speed: clamp(input.speed, defaults.speed, 0.2, 2.5),
    maxWords: Math.round(clamp(input.maxWords, defaults.maxWords, 2, 18)),
    reducedMotion: typeof input.reducedMotion === 'boolean' ? input.reducedMotion : defaults.reducedMotion,
    clickThrough: typeof input.clickThrough === 'boolean' ? input.clickThrough : defaults.clickThrough,
    preset: presets.includes(input.preset ?? '') ? input.preset! : defaults.preset,
    animationMode: animationModes.includes(input.animationMode ?? 'Float') ? input.animationMode! : defaults.animationMode,
    enabledEdges: Array.isArray(input.enabledEdges) && input.enabledEdges.some((e) => edgeValues.includes(e))
      ? [...new Set(input.enabledEdges.filter((e) => edgeValues.includes(e)))] : defaults.enabledEdges,
    audioEnabled: typeof input.audioEnabled === 'boolean' ? input.audioEnabled : false,
    audioDeviceId: typeof input.audioDeviceId === 'string' && input.audioDeviceId.length < 512 ? input.audioDeviceId : '',
    lightingEnabled: typeof input.lightingEnabled === 'boolean' ? input.lightingEnabled : defaults.lightingEnabled,
    lightingBrightness: clamp(input.lightingBrightness, defaults.lightingBrightness, 0, 1),
    glowRadius: clamp(input.glowRadius, defaults.glowRadius, .1, 1),
    stereoSensitivity: clamp(input.stereoSensitivity, defaults.stereoSensitivity, 0, 1),
    photosensitivitySafe: typeof input.photosensitivitySafe === 'boolean' ? input.photosensitivitySafe : defaults.photosensitivitySafe,
    themeMode: themeModes.includes(input.themeMode ?? 'Album Adaptive') ? input.themeMode! : defaults.themeMode,
    targetFps: input.targetFps === 30 ? 30 : 60,
    renderScale: clamp(input.renderScale, 1, .5, 1),
    fontFamily: fontFamilies.includes(input.fontFamily ?? '') ? input.fontFamily! : defaults.fontFamily,
    fontWeight: Math.round(clamp(input.fontWeight, defaults.fontWeight, 300, 900) / 100) * 100,
    letterSpacing: clamp(input.letterSpacing, defaults.letterSpacing, -2, 12),
    outlineWidth: clamp(input.outlineWidth, defaults.outlineWidth, 0, 20),
    glowStrength: clamp(input.glowStrength, defaults.glowStrength, 0, 60),
    lightingOnly: typeof input.lightingOnly === 'boolean' ? input.lightingOnly : false,
    lightingEdges: Array.isArray(input.lightingEdges)
      ? [...new Set(input.lightingEdges.filter((e) => edgeValues.includes(e)))] : defaults.lightingEdges,
    placementMode: placementModes.includes(input.placementMode ?? defaults.placementMode) ? input.placementMode ?? defaults.placementMode : defaults.placementMode,
    manualExclusion: input.manualExclusion && typeof input.manualExclusion === 'object' ? {
      x: clamp(input.manualExclusion.x, .3, 0, 1), y: clamp(input.manualExclusion.y, .3, 0, 1),
      width: clamp(input.manualExclusion.width, .2, .01, 1), height: clamp(input.manualExclusion.height, .2, .01, 1)
    } : null,
    lyricOffsetMs: Math.round(clamp(input.lyricOffsetMs, 0, -750, 750) / 25) * 25,
    miniplayerEnabled: typeof input.miniplayerEnabled === 'boolean' ? input.miniplayerEnabled : defaults.miniplayerEnabled,
    miniplayerSide: input.miniplayerSide === 'left' || input.miniplayerSide === 'right' ? input.miniplayerSide : defaults.miniplayerSide,
    miniplayerScale: Math.round(miniplayerScale(clamp(input.miniplayerScale, defaults.miniplayerScale, 0, 5)) * 100) / 100,
    miniplayerOpacity: Math.round(clamp(input.miniplayerOpacity, defaults.miniplayerOpacity, .2, 1) * 100) / 100,
    miniplayerX: typeof input.miniplayerX === 'number' && Number.isFinite(input.miniplayerX) ? Math.round(input.miniplayerX) : null,
    miniplayerY: typeof input.miniplayerY === 'number' && Number.isFinite(input.miniplayerY) ? Math.round(input.miniplayerY) : null,
    miniplayerBounce: typeof input.miniplayerBounce === 'boolean' ? input.miniplayerBounce : defaults.miniplayerBounce,
    miniplayerBounceStyle: bounceStyles.includes(input.miniplayerBounceStyle ?? 'soft') ? input.miniplayerBounceStyle! : defaults.miniplayerBounceStyle,
    miniplayerBounceSpeed: Math.round(clamp(input.miniplayerBounceSpeed, defaults.miniplayerBounceSpeed, .5, 2) * 100) / 100,
    uiAnimations: typeof input.uiAnimations === 'boolean' ? input.uiAnimations : defaults.uiAnimations,
    uiAnimationSpeed: Math.round(clamp(input.uiAnimationSpeed, defaults.uiAnimationSpeed, .5, 2) * 100) / 100,
    keybinds: input.keybinds === undefined ? { ...defaults.keybinds } : sanitizeKeybinds(input.keybinds)
  };
}
function loadSettings() {
  try { if (existsSync(configPath())) settings = validate(JSON.parse(readFileSync(configPath(), 'utf8'))); }
  catch (error) { lastError = `Settings reset: ${String(error)}`; }
  settings.audioEnabled = false; // Capture requires an explicit action on each launch.
  if (process.env.ECHOFRAME_SMOKE === '1') settings.overlayEnabled = false;
}
function persistSettings() {
  try { writeFileSync(configPath(), JSON.stringify(settings, null, 2), 'utf8'); }
  catch (error) { lastError = `Could not save settings: ${String(error)}`; broadcastStatus(); }
}
function page(window: BrowserWindow, view: 'studio' | 'overlay' | 'miniplayer') {
  if (app.isPackaged) void window.loadFile(path.join(__dirname, '../../dist/index.html'), { query: { view } });
  else void window.loadURL(`http://127.0.0.1:5173/?view=${view}`);
}
function sendSettings(window: BrowserWindow) { if (!window.isDestroyed()) window.webContents.send('settings:changed', settings); }
function status(): RuntimeStatus {
  const cpuPercent = app.getAppMetrics().reduce((sum, metric) => sum + (metric.cpu?.percentCPUUsage ?? 0), 0);
  return { overlayVisible: settings.overlayEnabled, displayCount: screen.getAllDisplays().length, gpu: 'Three.js / WebGL', audioCaptureActive: audioBridge.active,
    cpuPercent: Math.round(cpuPercent * 10) / 10, audioLatencyMs: lastAudioLatencyMs, error: lastError || undefined,
    playbackSource, lyricsStatus, lyricsTiming, mediaSource,
    shortcutIssues: failedShortcuts.length ? [...failedShortcuts] : undefined };
}
function broadcastPlayback() {
  studio?.webContents.send('playback:changed', playback);
  miniplayer?.webContents.send('playback:changed', playback);
  overlays.forEach((window) => window.webContents.send('playback:changed', playback));
}
function setLyrics(lines: TimedLine[], state: RuntimeStatus['lyricsStatus'], timing: WordTimingKind = 'none') {
  lyrics = lines;
  lyricsStatus = state;
  lyricsTiming = timing;
  studio?.webContents.send('lyrics:changed', lyrics);
  miniplayer?.webContents.send('lyrics:changed', lyrics);
  overlays.forEach((window) => window.webContents.send('lyrics:changed', lyrics));
  broadcastStatus();
}
function setPlayback(next: PlaybackState) {
  const changed = next.trackId !== playback.trackId || !!next.trackId && playback.durationMs === 0 && next.durationMs > 0 && lyricsStatus !== 'local';
  playback = next;
  broadcastPlayback();
  if (!changed) return;
  lyricAbort?.abort();
  lyricAbort = null;
  manualLyricsTrackId = null;
  if (lastError.startsWith('Lyrics lookup:')) lastError = '';
  setLyrics([], next.trackId && next.title && next.artist && next.artist !== 'Local file' ? 'searching' : 'unavailable');
  if (!next.trackId || !next.title || !next.artist || next.artist === 'Local file') return;
  const controller = new AbortController();
  lyricAbort = controller;
  void retryLookup(
    () => lyricClient.lookup({ title: next.title!, artist: next.artist!, durationMs: next.durationMs }, controller.signal),
    controller.signal,
    () => {
      if (controller.signal.aborted || playback.trackId !== next.trackId || manualLyricsTrackId === next.trackId) return;
      lyricsStatus = 'retrying';
      broadcastStatus();
    }
  )
    .then((result) => {
      if (controller.signal.aborted || playback.trackId !== next.trackId || manualLyricsTrackId === next.trackId) return;
      if (lastError.startsWith('Lyrics lookup:')) lastError = '';
      setLyrics(result.lines, result.lines.length ? 'synced' : 'unavailable', result.timing);
    })
    .catch((error) => {
      if (controller.signal.aborted || playback.trackId !== next.trackId) return;
      lastError = `Lyrics lookup: ${String(error)}`;
      setLyrics([], 'error');
    });
}
function applyMedia(frame: MediaFrame) {
  latestMedia = frame;
  if (playbackSource !== 'system') return;
  mediaSource = frame.source;
  const trackId = frame.title ? `windows:${frame.source}:${frame.title}:${frame.artist}` : null;
  const next: PlaybackState = { trackId, title: frame.title || null, artist: frame.artist || null, album: frame.album || null,
    positionMs: frame.positionMs, durationMs: frame.durationMs, playing: frame.playing };
  setPlayback(next);
}
function broadcastStatus() {
  studio?.webContents.send('status:changed', status());
  miniplayer?.webContents.send('status:changed', status());
}
function broadcastSettings() {
  if (studio) sendSettings(studio);
  if (miniplayer) sendSettings(miniplayer);
  overlays.forEach(sendSettings);
  broadcastStatus();
}
function applySettings(patch: Partial<AppSettings>): AppSettings {
  if (!patch || typeof patch !== 'object') return settings;
  const wasCapturing = settings.audioEnabled;
  const oldDevice = settings.audioDeviceId;
  const previousSide = settings.miniplayerSide;
  const previousKeybinds = JSON.stringify(settings.keybinds);
  settings = validate({ ...settings, ...patch });
  if (settings.miniplayerSide !== previousSide) {
    settings.miniplayerX = null;
    settings.miniplayerY = null;
  }
  if (settings.audioEnabled && (!wasCapturing || oldDevice !== settings.audioDeviceId)) audioBridge.start(settings.audioDeviceId);
  else if (!settings.audioEnabled && wasCapturing) audioBridge.stop();
  persistSettings();
  overlays.forEach((window) => {
    window.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
    if (settings.overlayEnabled) window.showInactive(); else window.hide();
  });
  syncMiniplayer();
  broadcastSettings();
  updateTray();
  if (JSON.stringify(settings.keybinds) !== previousKeybinds) registerShortcuts();
  return settings;
}
function setVisibility(visible: boolean) {
  applySettings({ overlayEnabled: visible });
}
function toggleAction(action: ToggleActionId) {
  if (action === 'manualExclusion') {
    applySettings({ manualExclusion: settings.manualExclusion ? null : { x: .3, y: .3, width: .4, height: .4 } });
    return;
  }
  const value = settings[action];
  if (typeof value === 'boolean') applySettings({ [action]: !value } as Partial<AppSettings>);
}
function registerShortcuts() {
  globalShortcut.unregisterAll();
  failedShortcuts = [];
  const fixed: { accelerator: string; label: string; handler: () => void }[] = [
    { accelerator: 'Ctrl+Alt+Shift+H', label: 'Hide overlay', handler: () => setVisibility(false) },
    { accelerator: 'Ctrl+Alt+Shift+S', label: 'Open studio', handler: () => { if (!studio) createStudio(); else studio.show(); } }
  ];
  for (const item of fixed) {
    try { if (!globalShortcut.register(item.accelerator, item.handler)) failedShortcuts.push(item.label); }
    catch { failedShortcuts.push(item.label); }
  }
  for (const action of TOGGLE_ACTIONS) {
    const accelerator = settings.keybinds[action.id];
    if (!accelerator) continue;
    try {
      if (!globalShortcut.register(accelerator, () => toggleAction(action.id))) failedShortcuts.push(action.label);
    } catch { failedShortcuts.push(action.label); }
  }
  broadcastStatus();
}
function createOverlay(monitor: Display) {
  const bounds = monitor.bounds;
  const window = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    frame: false, transparent: true, backgroundColor: '#00000000',
    show: false, focusable: false, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, resizable: false, movable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.setAlwaysOnTop(true, 'normal');
  window.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
  window.webContents.on('render-process-gone', (_event, details) => {
    lastError = `Overlay renderer stopped (${details.reason}). Restarting it.`;
    broadcastStatus();
    if (!window.isDestroyed()) page(window, 'overlay');
  });
  window.webContents.on('did-fail-load', (_event, code, description) => {
    lastError = `Overlay failed to load (${code}): ${description}`;
    broadcastStatus();
  });
  window.once('ready-to-show', () => { if (settings.overlayEnabled) window.showInactive(); });
  page(window, 'overlay');
  overlays.set(monitor.id, window);
}
let miniplayerSideApplied: AppSettings['miniplayerSide'] | null = null;
let miniplayerScaleApplied: number | null = null;
let miniplayerBoundsLock = 0;
function miniplayerPosition() {
  return settings.miniplayerX !== null && settings.miniplayerY !== null ? { x: settings.miniplayerX, y: settings.miniplayerY } : null;
}
function miniplayerTargetBounds(position = miniplayerPosition()) {
  return miniplayerBounds(screen.getPrimaryDisplay().workArea, settings.miniplayerSide, settings.miniplayerScale, position);
}
function applyMiniplayerBounds(bounds: { x: number; y: number; width: number; height: number }) {
  if (!miniplayer || miniplayer.isDestroyed()) return;
  miniplayerBoundsLock = Date.now() + 600;
  miniplayer.setBounds(bounds, false);
}
function createMiniplayer() {
  const bounds = miniplayerTargetBounds();
  miniplayer = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    frame: false, transparent: true, backgroundColor: '#00000000',
    show: false, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, resizable: false, movable: true,
    title: 'ECHOFRAME Miniplayer',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  miniplayer.setAlwaysOnTop(true, 'floating');
  miniplayer.webContents.on('render-process-gone', (_event, details) => {
    lastError = `Miniplayer renderer stopped (${details.reason}). Restarting it.`;
    broadcastStatus();
    if (miniplayer && !miniplayer.isDestroyed()) page(miniplayer, 'miniplayer');
  });
  miniplayer.webContents.on('did-fail-load', (_event, code, description) => {
    lastError = `Miniplayer failed to load (${code}): ${description}`;
    broadcastStatus();
  });
  miniplayer.once('ready-to-show', () => { if (settings.miniplayerEnabled && settings.overlayEnabled) miniplayer?.showInactive(); });
  miniplayer.on('moved', () => {
    if (!miniplayer || Date.now() < miniplayerBoundsLock) return;
    const moved = miniplayer.getBounds();
    settings.miniplayerX = moved.x;
    settings.miniplayerY = moved.y;
    persistSettings();
  });
  miniplayer.on('closed', () => { miniplayer = null; });
  page(miniplayer, 'miniplayer');
}
function syncMiniplayer() {
  if (!settings.miniplayerEnabled) {
    const window = miniplayer;
    miniplayer = null;
    miniplayerSideApplied = null;
    miniplayerScaleApplied = null;
    if (window && !window.isDestroyed()) window.destroy();
    return;
  }
  const sideChanged = miniplayerSideApplied !== null && miniplayerSideApplied !== settings.miniplayerSide;
  const scaleChanged = miniplayerScaleApplied !== null && miniplayerScaleApplied !== settings.miniplayerScale;
  if (!miniplayer || miniplayer.isDestroyed()) {
    createMiniplayer();
    miniplayerSideApplied = settings.miniplayerSide;
    miniplayerScaleApplied = settings.miniplayerScale;
  } else if (sideChanged || scaleChanged) {
    const custom = settings.miniplayerX !== null && settings.miniplayerY !== null;
    const position = sideChanged ? null : custom ? miniplayerPosition() : null;
    const bounds = miniplayerTargetBounds(position);
    applyMiniplayerBounds(bounds);
    if (!sideChanged && custom) {
      settings.miniplayerX = bounds.x;
      settings.miniplayerY = bounds.y;
      persistSettings();
    }
    miniplayerSideApplied = settings.miniplayerSide;
    miniplayerScaleApplied = settings.miniplayerScale;
  }
  if (!miniplayer) return;
  if (settings.overlayEnabled) miniplayer.showInactive();
  else miniplayer.hide();
}
function ensureMiniplayerVisible() {
  if (!miniplayer || miniplayer.isDestroyed()) return;
  const current = miniplayer.getBounds();
  const bounds = miniplayerTargetBounds({ x: current.x, y: current.y });
  if (bounds.x === current.x && bounds.y === current.y && bounds.width === current.width && bounds.height === current.height) return;
  applyMiniplayerBounds(bounds);
  if (settings.miniplayerX !== null) {
    settings.miniplayerX = bounds.x;
    settings.miniplayerY = bounds.y;
    persistSettings();
  }
}
function reconcileDisplays() {
  const displays = screen.getAllDisplays();
  const ids = new Set(displays.map((d) => d.id));
  for (const [id, window] of overlays) {
    if (!ids.has(id)) { window.destroy(); overlays.delete(id); }
  }
  for (const monitor of displays) {
    const window = overlays.get(monitor.id);
    if (!window) createOverlay(monitor);
    else window.setBounds(monitor.bounds, false);
  }
  syncMiniplayer();
  ensureMiniplayerVisible();
  broadcastStatus();
}
function createStudio() {
  studio = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1000, minHeight: 680,
    backgroundColor: '#101114', title: 'ECHOFRAME Studio', show: false,
    icon: path.join(app.getAppPath(), 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  studio.once('ready-to-show', () => { if (process.env.ECHOFRAME_SMOKE !== '1') studio?.show(); });
  studio.setAlwaysOnTop(true, 'floating', 1);
  studio.on('closed', () => {
    studio = null;
    if (capturingKeybind) { capturingKeybind = false; registerShortcuts(); }
    if (settings.audioEnabled) { settings.audioEnabled = false; audioBridge.stop(); persistSettings(); }
  });
  studio.webContents.on('render-process-gone', (_event, details) => {
    lastError = `Studio renderer stopped (${details.reason}).`;
    broadcastStatus();
  });
  studio.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  page(studio, 'studio');
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ECHOFRAME Studio', click: () => { if (!studio) createStudio(); else studio.show(); } },
    { label: settings.overlayEnabled ? 'Hide overlay' : 'Show overlay', click: () => setVisibility(!settings.overlayEnabled) },
    { type: 'separator' }, { label: 'Quit ECHOFRAME', click: () => { quitting = true; app.quit(); } }
  ]));
}
function createTray() {
  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('ECHOFRAME');
  tray.on('double-click', () => { if (!studio) createStudio(); else studio.show(); });
  updateTray();
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  loadSettings();
  audioBridge.onFrame = (frame) => {
    lastAudioLatencyMs = Math.max(0, Date.now() - frame.timestampMs);
    studio?.webContents.send('audio:frame', frame);
    overlays.forEach((window) => window.webContents.send('audio:frame', frame));
  };
  audioBridge.onState = (active, error) => {
    if (error) { lastError = error; settings.audioEnabled = false; persistSettings(); broadcastSettings(); }
    broadcastStatus();
  };
  mediaBridge.onFrame = applyMedia;
  mediaBridge.onError = (error) => { lastError = error; broadcastStatus(); };
  mediaBridge.start();
  ipcMain.handle('audio:devices', () => audioBridge.listDevices());
  ipcMain.handle('media:control', (event, command: MediaCommand) => {
    if (event.sender !== studio?.webContents && event.sender !== miniplayer?.webContents) return false;
    if (command !== 'toggle' && command !== 'previous' && command !== 'next' && command !== 'back' && command !== 'forward') return false;
    if (playbackSource === 'local') {
      if (!studio || studio.isDestroyed()) return false;
      studio.webContents.send('playback:command', command);
      return true;
    }
    return mediaBridge.send(command);
  });
  ipcMain.handle('playback:get', () => playback);
  ipcMain.handle('lyrics:get', () => lyrics);
  ipcMain.handle('playback:source', (event, source: 'system' | 'local') => {
    if (!studio || event.sender !== studio.webContents || (source !== 'system' && source !== 'local')) return;
    playbackSource = source;
    mediaSource = source === 'system' ? latestMedia?.source ?? '' : '';
    if (source === 'system') applyMedia(latestMedia ?? { source: '', title: '', artist: '', album: '', positionMs: 0, durationMs: 0, playing: false });
    else { lyricAbort?.abort(); setPlayback({ trackId: null, title: null, artist: null, positionMs: 0, durationMs: 0, playing: false }); }
    broadcastStatus();
  });
  ipcMain.handle('playback:publish', (event, state: PlaybackState) => {
    if (!studio || event.sender !== studio.webContents || playbackSource !== 'local' || !state || typeof state !== 'object') return;
    setPlayback({
      trackId: typeof state.trackId === 'string' ? state.trackId.slice(0, 256) : null,
      title: typeof state.title === 'string' ? state.title.slice(0, 200) : null,
      artist: typeof state.artist === 'string' ? state.artist.slice(0, 200) : null,
      positionMs: clamp(state.positionMs, 0, 0, 86400000),
      durationMs: clamp(state.durationMs, 0, 0, 86400000),
      playing: state.playing === true
    });
  });
  ipcMain.handle('lyrics:publish', (event, input: TimedLine[], timing: WordTimingKind) => {
    if (!studio || event.sender !== studio.webContents || playbackSource !== 'local' || !Array.isArray(input)) return;
    const validated = input.slice(0, 5000).filter((line) => line && typeof line.text === 'string' && line.text.length <= 500 && Number.isFinite(line.startMs) && Number.isFinite(line.endMs))
      .map((line) => ({ text: line.text, startMs: line.startMs, endMs: line.endMs, words: Array.isArray(line.words) ? line.words.slice(0, 100).filter((word) => word && typeof word.text === 'string' && word.text.length <= 100 && Number.isFinite(word.startMs) && Number.isFinite(word.endMs)) : undefined }));
    manualLyricsTrackId = playback.trackId;
    lyricAbort?.abort();
    setLyrics(validated, validated.length ? 'local' : 'unavailable', ['word', 'estimated', 'mixed'].includes(timing) ? timing : 'none');
  });
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:save', (_event, patch: Partial<AppSettings>) => applySettings(patch));
  ipcMain.handle('keybinds:capture', (event, active: boolean) => {
    if (event.sender !== studio?.webContents) return;
    capturingKeybind = Boolean(active);
    if (capturingKeybind) globalShortcut.unregisterAll();
    else registerShortcuts();
  });
  ipcMain.handle('status:get', status);
  ipcMain.handle('overlay:visible', (_event, visible: boolean) => { setVisibility(Boolean(visible)); });
  createStudio();
  reconcileDisplays();
  createTray();
  screen.on('display-added', reconcileDisplays);
  screen.on('display-removed', reconcileDisplays);
  screen.on('display-metrics-changed', reconcileDisplays);
  registerShortcuts();
});
app.on('window-all-closed', () => { /* The tray keeps the application available. */ });
app.on('before-quit', () => { quitting = true; audioBridge.stop(); mediaBridge.stop(); lyricAbort?.abort(); globalShortcut.unregisterAll(); });
