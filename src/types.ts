export type Edge = 'top' | 'right' | 'bottom' | 'left';
export type Preset = 'Ethereal' | 'Neon Depth' | 'Minimal' | 'Kinetic' | 'Ambient' | 'Spatial';
export type AnimationMode = 'Float' | 'Bounce' | 'Pop' | 'Orbit' | 'Drift' | 'Depth Shift' | 'Scatter' | 'Echo' | 'Wave' | 'Cinematic';
export type ThemeMode = 'Album Adaptive' | 'Monochrome' | 'Gradient' | 'Custom Palette' | 'Rainbow' | 'Dynamic Audio Colour';
export type PlacementMode = 'Strict Edge' | 'Dynamic Edge' | 'Immersive';
export type MiniplayerSide = 'left' | 'right';
export type MiniplayerBounceStyle = 'soft' | 'pop' | 'spring' | 'tilt';
export type MediaCommand = 'toggle' | 'previous' | 'next' | 'back' | 'forward';
export interface AppSettings {
  overlayEnabled: boolean;
  color: string;
  secondaryColor: string;
  brightness: number;
  intensity: number;
  wordSize: number;
  safeZone: number;
  speed: number;
  maxWords: number;
  reducedMotion: boolean;
  clickThrough: boolean;
  preset: Preset;
  animationMode: AnimationMode;
  enabledEdges: Edge[];
  audioEnabled: boolean;
  audioDeviceId: string;
  lightingEnabled: boolean;
  lightingBrightness: number;
  glowRadius: number;
  stereoSensitivity: number;
  photosensitivitySafe: boolean;
  themeMode: ThemeMode;
  targetFps: 30 | 60;
  renderScale: number;
  fontFamily: 'Segoe UI' | 'Arial' | 'Georgia' | 'Consolas' | 'Impact';
  fontWeight: number;
  letterSpacing: number;
  outlineWidth: number;
  glowStrength: number;
  lightingOnly: boolean;
  lightingEdges: Edge[];
  placementMode: PlacementMode;
  manualExclusion: { x: number; y: number; width: number; height: number } | null;
  lyricOffsetMs: number;
  miniplayerEnabled: boolean;
  miniplayerSide: MiniplayerSide;
  miniplayerScale: number;
  miniplayerOpacity: number;
  miniplayerX: number | null;
  miniplayerY: number | null;
  miniplayerBounce: boolean;
  miniplayerBounceStyle: MiniplayerBounceStyle;
  miniplayerBounceSpeed: number;
  uiAnimations: boolean;
  uiAnimationSpeed: number;
  keybinds: Record<string, string>;
}
export interface AudioFeatures {
  timestampMs: number; leftRms: number; rightRms: number; balance: number;
  midEnergy: number; sideEnergy: number; bass: number; midrange: number; treble: number;
  spectralFlux: number; transient: number; stereoMovement: number; onset: boolean; intensity: number;
}
export interface AudioDevice { id: string; name: string }
export interface TimedWord { text: string; startMs: number; endMs: number; confidence?: number; emphasis?: number }
export interface TimedLine { text: string; startMs: number; endMs: number; words?: TimedWord[] }
export type WordTimingKind = 'word' | 'estimated' | 'mixed' | 'none';
export interface PlaybackState { trackId: string | null; title: string | null; artist: string | null; album?: string | null; positionMs: number; durationMs: number; playing: boolean }
export interface RuntimeStatus { overlayVisible: boolean; displayCount: number; gpu: string; audioCaptureActive?: boolean; cpuPercent?: number; audioLatencyMs?: number; error?: string; playbackSource?: 'system' | 'local'; lyricsStatus?: 'searching' | 'retrying' | 'synced' | 'unavailable' | 'error' | 'local'; lyricsTiming?: WordTimingKind; mediaSource?: string; shortcutIssues?: string[] }
export interface EchoAPI {
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getStatus(): Promise<RuntimeStatus>;
  setOverlayVisible(value: boolean): Promise<void>;
  onSettings(callback: (settings: AppSettings) => void): () => void;
  onStatus(callback: (status: RuntimeStatus) => void): () => void;
  listAudioDevices(): Promise<AudioDevice[]>;
  onAudioFrame(callback: (features: AudioFeatures) => void): () => void;
  publishPlayback(state: PlaybackState): Promise<void>;
  publishLyrics(lines: TimedLine[], timing?: WordTimingKind): Promise<void>;
  setPlaybackSource(source: 'system' | 'local'): Promise<void>;
  getPlayback(): Promise<PlaybackState>;
  getLyrics(): Promise<TimedLine[]>;
  onPlayback(callback: (state: PlaybackState) => void): () => void;
  onLyrics(callback: (lines: TimedLine[]) => void): () => void;
  mediaControl(command: MediaCommand): Promise<boolean>;
  onPlaybackCommand(callback: (command: MediaCommand) => void): () => void;
  setKeybindCapture(active: boolean): Promise<void>;
}
declare global { interface Window { echo?: EchoAPI } }

export const DEFAULT_SETTINGS: AppSettings = {
  overlayEnabled: true,
  color: '#a997ff',
  secondaryColor: '#66e0eb',
  brightness: 0.7,
  intensity: 0.56,
  wordSize: 58,
  safeZone: 0.65,
  speed: 1,
  maxWords: 9,
  reducedMotion: false,
  clickThrough: true,
  preset: 'Ethereal',
  animationMode: 'Float',
  enabledEdges: ['top', 'right', 'bottom', 'left'],
  audioEnabled: false,
  audioDeviceId: '',
  lightingEnabled: true,
  lightingBrightness: .42,
  glowRadius: .6,
  stereoSensitivity: .75,
  photosensitivitySafe: true,
  themeMode: 'Album Adaptive',
  targetFps: 60,
  renderScale: 1,
  fontFamily: 'Segoe UI', fontWeight: 800, letterSpacing: 0, outlineWidth: 10, glowStrength: 30,
  lightingOnly: false, lightingEdges: ['top', 'right', 'bottom', 'left'], placementMode: 'Strict Edge', manualExclusion: null,
  lyricOffsetMs: 0, miniplayerEnabled: false, miniplayerSide: 'right', miniplayerScale: 1,
  miniplayerOpacity: .94, miniplayerX: null, miniplayerY: null,
  miniplayerBounce: true, miniplayerBounceStyle: 'soft', miniplayerBounceSpeed: 1,
  uiAnimations: true, uiAnimationSpeed: 1,
  keybinds: { overlayEnabled: 'Ctrl+Alt+Shift+O' }
};
