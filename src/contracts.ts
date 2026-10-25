import type { AppSettings, AudioFeatures, PlaybackState, TimedLine } from './types';

export interface PlaybackProvider {
  getState(): Promise<PlaybackState>;
  onState(callback: (state: PlaybackState) => void): () => void;
}
export interface LyricsProvider { getLyrics(trackId: string): Promise<TimedLine[] | null> }
export interface AudioCaptureProvider { start(deviceId?: string): Promise<void>; stop(): Promise<void> }
export interface AudioAnalyzer { process(interleavedPcm: Float32Array, sampleRate: number): AudioFeatures }
export interface Placement { x: number; y: number; depth: number; rotation: number }
export interface PlacementEngine { place(text: string, settings: AppSettings, features?: AudioFeatures): Placement }
export interface ThemePalette { primary: string; secondary: string; shadow: string }
export interface ThemeProvider { fromArtwork(image: ImageBitmap): Promise<ThemePalette> }
export interface VisualizationRenderer { update(settings: AppSettings, features?: AudioFeatures): void; dispose(): void }
