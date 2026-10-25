import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpatialScene } from './scene/SpatialScene';
import { parseLrc } from './lyrics/lrc';
import { withWordTiming } from './lyrics/wordTiming';
import { paletteFromArtwork, type Palette } from './theme/palette';
import { DEFAULT_SETTINGS, type AnimationMode, type AppSettings, type AudioDevice, type AudioFeatures, type Edge, type PlaybackState, type Preset, type RuntimeStatus, type ThemeMode, type TimedLine, type WordTimingKind } from './types';
import './style.css';

const isOverlay = new URLSearchParams(location.search).get('view') === 'overlay';
document.title = isOverlay ? 'ECHOFRAME Overlay' : 'ECHOFRAME Studio';
if (isOverlay) {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}
const presetDetails: Record<Preset, { color: string; secondaryColor: string; intensity: number; brightness: number; wordSize: number; speed: number; safeZone: number; animationMode: AnimationMode }> = {
  Ethereal: { color: '#a997ff', secondaryColor: '#66e0eb', intensity: .56, brightness: .7, wordSize: 58, speed: 1, safeZone: .65, animationMode: 'Float' },
  'Neon Depth': { color: '#ff6bd6', secondaryColor: '#6f8cff', intensity: .72, brightness: .85, wordSize: 62, speed: 1.3, safeZone: .65, animationMode: 'Depth Shift' },
  Minimal: { color: '#ecf0ff', secondaryColor: '#9eabc8', intensity: .24, brightness: .45, wordSize: 39, speed: .72, safeZone: .68, animationMode: 'Cinematic' },
  Kinetic: { color: '#ff9f69', secondaryColor: '#ff6f95', intensity: .9, brightness: .9, wordSize: 65, speed: 1.8, safeZone: .62, animationMode: 'Bounce' },
  Ambient: { color: '#80d9c5', secondaryColor: '#b9caff', intensity: .31, brightness: .42, wordSize: 48, speed: .68, safeZone: .7, animationMode: 'Drift' },
  Spatial: { color: '#89b9ff', secondaryColor: '#c587ff', intensity: .75, brightness: .78, wordSize: 60, speed: 1.25, safeZone: .68, animationMode: 'Orbit' }
};
const presetBlurbs: Record<Preset, string> = {
  Ethereal: 'Soft, weightless drift', 'Neon Depth': 'Saturated, layered depth', Minimal: 'Quiet restraint',
  Kinetic: 'Rhythmic energy', Ambient: 'Slow surround', Spatial: 'Directional orbit'
};
const animationModes: AnimationMode[] = ['Float', 'Bounce', 'Pop', 'Orbit', 'Drift', 'Depth Shift', 'Scatter', 'Echo', 'Wave', 'Cinematic'];
const animationBlurbs: Record<AnimationMode, string> = {
  Float: 'Glides gently on every axis', Bounce: 'Follows beats and onsets', Pop: 'Snaps in, then settles',
  Orbit: 'Circles around its anchor', Drift: 'Wanders without hurry', 'Depth Shift': 'Moves between layers',
  Scatter: 'Loosens and regathers', Echo: 'Trails a second impression', Wave: 'Ripples along the edge', Cinematic: 'Slow, deliberate camera drift'
};
const themeModes: ThemeMode[] = ['Album Adaptive', 'Monochrome', 'Gradient', 'Custom Palette', 'Rainbow', 'Dynamic Audio Colour'];
const fontFamilies: AppSettings['fontFamily'][] = ['Segoe UI', 'Arial', 'Georgia', 'Consolas', 'Impact'];
const placementModes: AppSettings['placementMode'][] = ['Strict Edge', 'Dynamic Edge', 'Immersive'];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function timingLabel(timing?: WordTimingKind) {
  return timing === 'word' ? 'recorded word timing' : timing === 'estimated' ? 'estimated word timing' : timing === 'mixed' ? 'mixed recorded and estimated' : 'line timing';
}
function clockText(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/* Icons: one stroke family, 16px grid, used everywhere in the interface. */
type IconName = 'home' | 'note' | 'frame' | 'type' | 'motion' | 'light' | 'theme' | 'wave' | 'placement' | 'preset' | 'gauge' | 'settings' | 'play' | 'pause' | 'plus' | 'minus' | 'chevron' | 'guides' | 'copy' | 'upload' | 'download';
const iconPaths: Record<IconName, ReactNode> = {
  home: <><path d="M2.8 7.3 8 2.9l5.2 4.4v5.5c0 .5-.4.9-.9.9H3.7c-.5 0-.9-.4-.9-.9z"/><path d="M6.4 13.6V9.5h3.2v4.1"/></>,
  note: <><circle cx="5.3" cy="11.3" r="1.9"/><path d="M7.2 11.3V4.2l4.5-1.1v6.2"/><circle cx="9.8" cy="10.3" r="1.9"/></>,
  frame: <><rect x="2.2" y="2.2" width="8.1" height="8.1" rx="1.4"/><path d="M5.7 13.8h7.1a1 1 0 0 0 1-1V5.7"/></>,
  type: <><path d="M3.1 4.3V3h9.8v1.3M8 3v10M5.9 13h4.2"/></>,
  motion: <><circle cx="8" cy="8" r="5.6" strokeDasharray="2.2 2.4"/><path d="M6.7 6.1v3.8L9.9 8z" fill="currentColor" stroke="none"/></>,
  light: <><circle cx="8" cy="8" r="2.5"/><path d="M8 1.7v1.4M8 12.9v1.4M1.7 8h1.4M12.9 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1"/></>,
  theme: <><circle cx="8" cy="8" r="5.6"/><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" stroke="none"/></>,
  wave: <path d="M2.4 6.2v3.6M5.2 3.7v8.6M8 5.3v5.4M10.8 2.5v11M13.6 6.6v2.8"/>,
  placement: <><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.6" strokeDasharray="2.2 2.2"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/></>,
  preset: <><rect x="2.4" y="2.4" width="7.4" height="7.4" rx="1.4"/><path d="M5 13.6h7.2a1.4 1.4 0 0 0 1.4-1.4V5"/></>,
  gauge: <><path d="M2.3 12.3a6.2 6.2 0 1 1 11.4 0"/><path d="m8 8.7 2.9-3"/><circle cx="8" cy="9.5" r="1.1"/></>,
  settings: <><path d="M2.4 5h11.2M2.4 11h11.2"/><circle cx="5.9" cy="5" r="1.6"/><circle cx="10.3" cy="11" r="1.6"/></>,
  play: <path d="M5.5 3.7 12 8l-6.5 4.3z" fill="currentColor" stroke="none"/>,
  pause: <path d="M5.7 3.7v8.6M10.3 3.7v8.6" strokeWidth="1.8"/>,
  plus: <path d="M8 3.4v9.2M3.4 8h9.2"/>,
  minus: <path d="M3.4 8h9.2"/>,
  chevron: <path d="m4.8 6.3 3.2 3.4 3.2-3.4"/>,
  guides: <><rect x="2.4" y="3.6" width="11.2" height="8.8" rx="1.2"/><path d="M8 2.6v2M8 11.4v2M2.8 8h2M11.2 8h2" strokeDasharray="1.6 1.8"/></>,
  copy: <><rect x="2.4" y="2.4" width="8.2" height="8.2" rx="1.3"/><path d="M5.4 13.6h6.9a1.3 1.3 0 0 0 1.3-1.3V5.4"/></>,
  upload: <><path d="M8 10.2V2.6M5.2 5.4 8 2.6l2.8 2.8"/><path d="M2.8 10.4v2.2c0 .4.3.8.8.8h8.8c.5 0 .8-.4.8-.8v-2.2"/></>,
  download: <><path d="M8 2.6v7.6M5.2 7.4 8 10.2l2.8-2.8"/><path d="M2.8 10.4v2.2c0 .4.3.8.8.8h8.8c.5 0 .8-.4.8-.8v-2.2"/></>
};
function Icon({ name }: { name: IconName }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}
function BrandMark() {
  return <svg className="brand-mark" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="2.4" y="2.4" width="10.2" height="10.2" rx="2.4" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M6.4 17.4h9a2 2 0 0 0 2-2v-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".55"/>
    <circle cx="7.5" cy="7.5" r="1.7" fill="currentColor"/>
  </svg>;
}

function SceneView({ settings, onFrame, preview = false, paused = false }: { settings: AppSettings; onFrame?: (fps: number) => void; preview?: boolean; paused?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const scene = useRef<SpatialScene | null>(null);
  useEffect(() => {
    if (!holder.current) return;
    try { scene.current = new SpatialScene(holder.current, settings, onFrame, preview); }
    catch (error) { console.error('WebGL scene failed', error); holder.current.textContent = 'WebGL unavailable. Enable graphics acceleration and restart ECHOFRAME.'; }
    return () => { scene.current?.destroy(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.setSettings(settings); }, [settings]);
  useEffect(() => { scene.current?.setPaused(paused); }, [paused]);
  useEffect(() => window.echo?.onAudioFrame((frame) => scene.current?.setAudioFeatures(frame)), []);
  useEffect(() => {
    void window.echo?.getPlayback().then((state) => scene.current?.setPlayback(state));
    void window.echo?.getLyrics().then((lines) => scene.current?.setLyrics(lines));
    const a = window.echo?.onPlayback((state) => scene.current?.setPlayback(state));
    const b = window.echo?.onLyrics((lines) => scene.current?.setLyrics(lines));
    return () => { a?.(); b?.(); };
  }, []);
  return <div className="scene" ref={holder}/>;
}

function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<RuntimeStatus>({ overlayVisible: true, displayCount: 1, gpu: 'Three.js / WebGL', playbackSource: 'system', lyricsStatus: 'unavailable' });
  useEffect(() => {
    window.echo?.getSettings().then(setSettings);
    window.echo?.getStatus().then(setStatus);
    const a = window.echo?.onSettings(setSettings);
    const b = window.echo?.onStatus(setStatus);
    const timer = setInterval(() => { void window.echo?.getStatus().then(setStatus); }, 2000);
    return () => { a?.(); b?.(); clearInterval(timer); };
  }, []);
  const update = (patch: Partial<AppSettings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
    void window.echo?.saveSettings(patch).then(setSettings);
  };
  return { settings, status, update };
}

function Overlay() {
  const { settings } = useSettings();
  return <div className="overlay-root"><SceneView settings={settings}/></div>;
}

/* Design primitives ------------------------------------------------------- */

function Slider({ label, value, min, max, step, unit = '', onChange, hint }: { label: string; value: number; min: number; max: number; step: number; unit?: 'px' | '%' | '×' | 'ms' | ''; onChange: (value: number) => void; hint?: string }) {
  const fill = clamp(((value - min) / (max - min)) * 100, 0, 100);
  const display = unit === '×' ? value.toFixed(2) : unit === '%' ? Math.round(value * 100) : Math.round(value);
  return <div className="prop">
    <div className="prop-head"><label>{label}</label><span className="prop-value">{display}{unit && ` ${unit}`}</span></div>
    <input className="slider" type="range" value={value} min={min} max={max} step={step} aria-label={label}
      onChange={(event) => onChange(Number(event.target.value))} style={{ '--fill': `${fill}%` } as CSSProperties}/>
    {hint && <p className="hint">{hint}</p>}
  </div>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="switch-row">
    <span className="switch-copy"><span className="switch-label">{label}</span>{description && <span className="switch-desc">{description}</span>}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}/>
    <span className="switch" aria-hidden="true"/>
  </label>;
}

function SelectField({ label, value, options, onChange, hint }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void; hint?: string }) {
  return <div className="field">
    <label>{label}</label>
    <div className="select-wrap">
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className="select-chevron"><Icon name="chevron"/></span>
    </div>
    {hint && <p className="hint">{hint}</p>}
  </div>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="color-field">
    <span className="color-chip" style={{ background: value }}>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}/>
    </span>
    <span className="color-copy"><span>{label}</span><code>{value.toUpperCase()}</code></span>
  </label>;
}

function EdgePicker({ value, onChange }: { value: Edge[]; onChange: (edge: Edge) => void }) {
  return <div className="edge-picker" role="group" aria-label="Enabled edges">
    {(['top', 'right', 'bottom', 'left'] as Edge[]).map((edge) => <button key={edge} type="button"
      className={value.includes(edge) ? 'on' : ''} aria-pressed={value.includes(edge)} onClick={() => onChange(edge)}>{edge}</button>)}
  </div>;
}

function Group({ title, action, children, className = '', columns = 1 }: { title: string; action?: ReactNode; children: ReactNode; className?: string; columns?: 1 | 2 }) {
  return <section className={`group ${className}`}>
    <header className="group-head"><h2>{title}</h2>{action}</header>
    <div className={`group-body ${columns === 2 ? 'col-2' : ''}`}>{children}</div>
  </section>;
}

function Page({ title, subtitle, children, home = false }: { title: string; subtitle: string; children: ReactNode; home?: boolean }) {
  return <div className={`page ${home ? 'page-home' : ''}`}>
    <header className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div></header>
    {children}
  </div>;
}

function PresetGrid({ current, onPick, detailed = false }: { current: Preset; onPick: (preset: Preset) => void; detailed?: boolean }) {
  return <div className={`preset-grid ${detailed ? 'detailed' : ''}`}>
    {(Object.keys(presetDetails) as Preset[]).map((name) => detailed
      ? <button key={name} type="button" className={`preset-tile detailed ${current === name ? 'selected' : ''}`} onClick={() => onPick(name)}>
        <span className="preset-dot" style={{ background: `linear-gradient(135deg, ${presetDetails[name].color}, ${presetDetails[name].secondaryColor})` }}/>
        <span className="preset-copy"><span className="preset-name">{name}</span><span className="preset-meta">{presetDetails[name].animationMode}</span></span>
      </button>
      : <button key={name} type="button" className={`preset-tile ${current === name ? 'selected' : ''}`} onClick={() => onPick(name)}>
        <span className="preset-swatch" style={{ background: `linear-gradient(135deg, ${presetDetails[name].color}, ${presetDetails[name].secondaryColor})` }}/>
        <span className="preset-name">{name}</span>
      </button>)}
  </div>;
}

function Meter({ label, value, scale }: { label: string; value: number; scale: number }) {
  const percent = Math.min(100, Math.max(0, value * scale));
  return <div className="meter">
    <span className="meter-label">{label}</span>
    <span className="meter-track"><i style={{ width: `${percent}%` }}/></span>
    <span className="meter-value">{percent.toFixed(0)}</span>
  </div>;
}

/* Studio ------------------------------------------------------------------ */

function PreviewStage({ settings, status, fps, paused, onPaused, guides, onGuides, onFrame, update, compact = false }: {
  settings: AppSettings; status: RuntimeStatus; fps: number; paused: boolean; onPaused: (value: boolean) => void;
  guides: boolean; onGuides: (value: boolean) => void; onFrame: (fps: number) => void; update: (patch: Partial<AppSettings>) => void; compact?: boolean;
}) {
  return <section className={`stage ${compact ? 'stage-compact' : ''}`}>
    <header className="stage-head">
      <div className="stage-title"><Icon name="frame"/><h2>Live preview</h2></div>
      <div className="stage-tools">
        <div className="seg" role="group" aria-label="Preview mode">
          <button type="button" className={!settings.lightingOnly ? 'on' : ''} onClick={() => update({ lightingOnly: false })}>Words</button>
          <button type="button" className={settings.lightingOnly ? 'on' : ''} onClick={() => update({ lightingOnly: true })}>Light only</button>
        </div>
        <button type="button" className={`icon-btn ${guides ? 'is-on' : ''}`} onClick={() => onGuides(!guides)} aria-pressed={guides} title="Safe-zone guides" aria-label="Safe-zone guides"><Icon name="guides"/></button>
      </div>
    </header>
    <div className="stage-canvas">
      <SceneView settings={settings} onFrame={onFrame} preview paused={paused}/>
      {guides && <>
        <div className="guide" style={{ left: `${(1 - settings.safeZone) * 50}%`, top: `${(1 - settings.safeZone) * 50}%`, width: `${settings.safeZone * 100}%`, height: `${settings.safeZone * 100}%` }}><span>Safe zone</span></div>
        {settings.manualExclusion && <div className="guide guide-exclusion" style={{
          left: `${settings.manualExclusion.x * 100}%`, top: `${settings.manualExclusion.y * 100}%`,
          width: `${settings.manualExclusion.width * 100}%`, height: `${settings.manualExclusion.height * 100}%` }}><span>Excluded</span></div>}
      </>}
    </div>
    <footer className="stage-foot">
      <button type="button" className="icon-btn" onClick={() => onPaused(!paused)} aria-label={paused ? 'Resume preview' : 'Pause preview'} title={paused ? 'Resume preview' : 'Pause preview'}>{paused ? <Icon name="play"/> : <Icon name="pause"/>}</button>
      <span className="foot-text">{paused ? 'Paused' : 'Running'}</span>
      <span className="foot-sep"/>
      <button type="button" className={`overlay-pill ${settings.overlayEnabled ? 'on' : ''}`} onClick={() => update({ overlayEnabled: !settings.overlayEnabled })}>
        <span className="dot"/>{settings.overlayEnabled ? 'Overlay visible' : 'Overlay hidden'}
      </button>
      <span className="spacer"/>
      <span className="foot-mono">{paused ? '—' : `${fps} fps`}</span>
      <span className="foot-mono">{Math.round(settings.renderScale * 100)}%</span>
      <span className="foot-mono">{status.displayCount} {status.displayCount === 1 ? 'display' : 'displays'}</span>
    </footer>
  </section>;
}

function Studio() {
  const { settings, status, update } = useSettings();
  const [section, setSection] = useState<Section>('Home');
  const [fps, setFps] = useState(0);
  const [paused, setPaused] = useState(false);
  const [guides, setGuides] = useState(true);
  const [features, setFeatures] = useState<AudioFeatures | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [track, setTrack] = useState<{ id: string; title: string; artist: string; artworkUrl: string | null } | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [localLyrics, setLocalLyrics] = useState<TimedLine[]>([]);
  const [currentPlayback, setCurrentPlayback] = useState<PlaybackState | null>(null);
  const [lyricClock, setLyricClock] = useState(0);
  const [currentLyrics, setCurrentLyrics] = useState<TimedLine[]>([]);
  const playbackAt = useRef(0);
  const [artworkPalette, setArtworkPalette] = useState<Palette | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [presetName, setPresetName] = useState('My atmosphere');
  const [savedPresets, setSavedPresets] = useState<{ name: string; settings: AppSettings }[]>(() => {
    try { const value: unknown = JSON.parse(localStorage.getItem('echoframe-presets-v1') || '[]'); return Array.isArray(value) ? value.filter((item) => item && typeof item.name === 'string' && item.settings).slice(0, 50) : []; }
    catch { return []; }
  });
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioPickRef = useRef<HTMLInputElement>(null);
  const lrcPickRef = useRef<HTMLInputElement>(null);
  const presetPickRef = useRef<HTMLInputElement>(null);
  const mediaUrlRef = useRef<string | null>(null);
  const artworkUrlRef = useRef<string | null>(null);
  useEffect(() => {
    void window.echo?.listAudioDevices().then(setDevices);
    return window.echo?.onAudioFrame(setFeatures);
  }, []);
  const receivePlayback = (state: PlaybackState) => { playbackAt.current = performance.now(); setCurrentPlayback(state); };
  useEffect(() => {
    void window.echo?.getPlayback().then(receivePlayback);
    void window.echo?.getLyrics().then(setCurrentLyrics);
    const playbackOff = window.echo?.onPlayback(receivePlayback);
    const lyricsOff = window.echo?.onLyrics(setCurrentLyrics);
    return () => { playbackOff?.(); lyricsOff?.(); };
  }, []);
  useEffect(() => {
    const tick = () => {
      const state = currentPlayback;
      if (!state?.trackId) { setLyricClock(0); return; }
      const elapsed = state.playing ? Math.min(performance.now() - playbackAt.current, 4000) : 0;
      setLyricClock(state.positionMs + elapsed + settings.lyricOffsetMs);
    };
    tick();
    const id = setInterval(tick, 120);
    return () => clearInterval(id);
  }, [currentPlayback, settings.lyricOffsetMs]);
  useEffect(() => () => { if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current); if (artworkUrlRef.current) URL.revokeObjectURL(artworkUrlRef.current); }, []);
  const publishPlayback = () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    setPlaying(!audio.paused && !audio.ended);
    setPositionSeconds(audio.currentTime);
    setDurationSeconds(Number.isFinite(audio.duration) ? audio.duration : 0);
    const state: PlaybackState = { trackId: track.id, title: track.title, artist: track.artist,
      positionMs: Math.round(audio.currentTime * 1000), durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0, playing: !audio.paused && !audio.ended };
    void window.echo?.publishPlayback(state);
  };
  useEffect(() => { const id = setInterval(publishPlayback, 120); return () => clearInterval(id); }, [track]);
  const openLocalAudio = async (file: File) => {
    audioRef.current?.pause();
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    if (artworkUrlRef.current) URL.revokeObjectURL(artworkUrlRef.current);
    const url = URL.createObjectURL(file); mediaUrlRef.current = url; setMediaUrl(url);
    let title = file.name.replace(/\.[^.]+$/, ''); let artist = 'Local file'; let artworkUrl: string | null = null;
    try {
      const { parseBlob } = await import('music-metadata');
      const metadata = await parseBlob(file, { duration: false });
      title = metadata.common.title || title; artist = metadata.common.artist || artist;
      const picture = metadata.common.picture?.[0];
      if (picture && picture.data.length < 8_000_000) {
        const blob = new Blob([new Uint8Array(picture.data)], { type: picture.format });
        artworkUrl = URL.createObjectURL(blob);
        artworkUrlRef.current = artworkUrl;
        const palette = await paletteFromArtwork(blob);
        setArtworkPalette(palette);
        if (settings.themeMode === 'Album Adaptive') update({ color: palette.primary, secondaryColor: palette.secondary });
      }
      else setArtworkPalette(null);
    } catch (error) { console.warn('Metadata unavailable', error); setArtworkPalette(null); }
    const next = { id: `${file.name}:${file.size}:${file.lastModified}`, title, artist, artworkUrl };
    await window.echo?.setPlaybackSource('local');
    setTrack(next); setLocalLyrics([]);
    void window.echo?.publishPlayback({ trackId: next.id, title, artist, positionMs: 0, durationMs: 0, playing: false });
    setSection('Now Playing');
  };
  const openLrc = async (file: File) => {
    const result = withWordTiming(parseLrc(await file.text()));
    setLocalLyrics(result.lines);
    setCurrentLyrics(result.lines);
    void window.echo?.publishLyrics(result.lines, result.timing);
  };
  const savePreset = () => {
    const name = presetName.trim().slice(0, 60);
    if (!name) return;
    const next = [...savedPresets.filter((item) => item.name !== name), { name, settings: { ...settings, audioEnabled: false } }].slice(-50);
    setSavedPresets(next); localStorage.setItem('echoframe-presets-v1', JSON.stringify(next));
  };
  const exportPreset = () => {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, name: presetName.trim() || 'ECHOFRAME', settings: { ...settings, audioEnabled: false } }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${(presetName.trim() || 'ECHOFRAME').replace(/[^a-z0-9_-]/gi, '-')}.echoframe.json`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importPreset = async (file: File) => {
    try {
      if (file.size > 100_000) throw new Error('Preset file is too large.');
      const value: unknown = JSON.parse(await file.text());
      if (!value || typeof value !== 'object' || (value as { schemaVersion?: unknown }).schemaVersion !== 1 || !(value as { settings?: unknown }).settings || typeof (value as { settings?: unknown }).settings !== 'object') throw new Error('Unsupported preset file.');
      const bundle = value as { name?: string; settings: Partial<AppSettings> };
      setPresetName(typeof bundle.name === 'string' ? bundle.name.slice(0, 60) : 'Imported preset');
      update({ ...bundle.settings, audioEnabled: false });
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not import preset.'); }
  };
  const duplicatePreset = (item: { name: string; settings: AppSettings }) => {
    const next = [...savedPresets, { name: `${item.name} copy`, settings: { ...item.settings } }].slice(-50);
    setSavedPresets(next); localStorage.setItem('echoframe-presets-v1', JSON.stringify(next));
  };
  const lastFps = useRef(0);
  const recordFrame = (value: number) => { const now = performance.now(); if (now - lastFps.current > 500) { setFps(Math.round(value)); lastFps.current = now; } };
  const applyPreset = (preset: Preset) => update({ preset, ...presetDetails[preset] });
  const edge = (value: Edge) => update({ enabledEdges: settings.enabledEdges.includes(value) ? settings.enabledEdges.filter((item) => item !== value) : [...settings.enabledEdges, value] });
  const lightingEdge = (value: Edge) => update({ lightingEdges: settings.lightingEdges.includes(value) ? settings.lightingEdges.filter((item) => item !== value) : [...settings.lightingEdges, value] });

  const toggleLocal = () => { const audio = audioRef.current; if (!audio) return; if (audio.paused) void audio.play(); else audio.pause(); };
  const followWindows = () => { audioRef.current?.pause(); void window.echo?.setPlaybackSource('system'); };
  const currentTrackTitle = status.playbackSource === 'system' ? currentPlayback?.title ?? null : track?.title ?? null;
  const currentTrackArtist = status.playbackSource === 'system' ? currentPlayback?.artist ?? null : track?.artist ?? null;
  const artwork = status.playbackSource === 'local' ? track?.artworkUrl ?? null : null;
  // A local LRC is the source of truth for local playback and can render before the IPC round trip returns.
  const displayLyrics = status.playbackSource === 'local' && localLyrics.length ? localLyrics : currentLyrics;
  const lyricWords = displayLyrics.reduce((sum, line) => sum + (line.words?.length ?? 0), 0);
  const sourceLabel = status.playbackSource === 'system' ? 'Windows media' : track ? 'Local file' : 'Demo';
  const eqLevels = features && status.audioCaptureActive
    ? [3 + Math.min(9, features.leftRms * 45), 3 + Math.min(9, features.midEnergy * 45), 3 + Math.min(9, features.rightRms * 45)]
    : null;
  const lyricSummary = status.lyricsStatus === 'searching' ? 'Searching LRCLIB'
    : status.lyricsStatus === 'retrying' ? 'Retrying lookup'
    : status.lyricsStatus === 'synced' ? `${displayLyrics.length} lines · ${timingLabel(status.lyricsTiming)}`
    : status.lyricsStatus === 'local' ? `${displayLyrics.length} lines · local LRC`
    : status.lyricsStatus === 'error' ? 'Lookup failed'
    : 'No timed lyrics';
  let activeLine = -1;
  for (let index = 0; index < displayLyrics.length; index++) if (lyricClock >= displayLyrics[index].startMs) activeLine = index;
  const lyricWindowStart = Math.max(0, Math.min(activeLine - 1, displayLyrics.length - 8));
  const lyricWindow = displayLyrics.slice(lyricWindowStart, lyricWindowStart + 8);
  const lyricTone = status.lyricsStatus === 'synced' || status.lyricsStatus === 'local' ? 'ok'
    : status.lyricsStatus === 'error' ? 'bad'
    : status.lyricsStatus === 'searching' || status.lyricsStatus === 'retrying' ? 'pending' : 'muted';

  const stage = <PreviewStage settings={settings} status={status} fps={fps} paused={paused} onPaused={setPaused}
    guides={guides} onGuides={setGuides} onFrame={recordFrame} update={update} compact={section !== 'Home'}/>;

  return <div className="app">
    <audio ref={audioRef} src={mediaUrl ?? undefined} onTimeUpdate={publishPlayback} onPlay={publishPlayback} onPause={publishPlayback} onSeeking={publishPlayback} onLoadedMetadata={publishPlayback} onEnded={publishPlayback}/>
    <input ref={audioPickRef} className="hidden-file" type="file" accept="audio/*,.mp3,.flac,.m4a,.wav,.ogg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openLocalAudio(file); event.target.value = ''; }}/>
    <input ref={lrcPickRef} className="hidden-file" type="file" accept=".lrc,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openLrc(file); event.target.value = ''; }}/>
    <input ref={presetPickRef} className="hidden-file" type="file" accept=".json,.echoframe.json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPreset(file); event.target.value = ''; }}/>

    <aside className="sidebar">
      <div className="brand"><BrandMark/><div className="brand-copy"><span className="brand-name">ECHOFRAME</span><span className="brand-sub">Studio</span></div></div>
      <nav className="nav">
        {navGroups.map((group, index) => <div className="nav-group" key={group.label ?? index}>
          {group.label && <span className="nav-label">{group.label}</span>}
          {group.items.map((item) => <button key={item.id} type="button" className={`nav-item ${section === item.id ? 'selected' : ''}`} onClick={() => setSection(item.id)}>
            <Icon name={item.icon}/><span>{item.label}</span>
          </button>)}
        </div>)}
      </nav>
      <div className="sidebar-foot">
        <nav className="sidebar-tools" aria-label="Studio tools">
          {systemNav.map((item) => <button key={item.id} type="button" className={`nav-item ${section === item.id ? 'selected' : ''}`} onClick={() => setSection(item.id)}>
            <Icon name={item.icon}/><span>{item.label}</span>
          </button>)}
        </nav>
        <div className="status-card">
          <div className="status-row"><span className={`status-dot ${status.audioCaptureActive ? 'live' : ''}`}/><span>{sourceLabel}</span><span className="status-version">v0.9.7</span></div>
          <div className="status-detail">{status.audioCaptureActive ? 'Audio analysis on' : 'Audio analysis off'}</div>
        </div>
      </div>
    </aside>

    <div className="main">
      <header className="toolbar">
        <div className="toolbar-left">
          <button type="button" className={`overlay-state ${settings.overlayEnabled ? 'on' : ''}`} onClick={() => update({ overlayEnabled: !settings.overlayEnabled })} title="Toggle overlay visibility">
            <span className="dot"/><span>Overlay</span><span className="overlay-word">{settings.overlayEnabled ? 'visible' : 'hidden'}</span>
          </button>
          <span className="toolbar-divider"/>
          <button type="button" className="preset-chip" onClick={() => setSection('Visual Studio')} title="Open the active preset">
            <span className="preset-chip-swatch" style={{ background: `linear-gradient(135deg, ${settings.color}, ${settings.secondaryColor})` }}/>
            <span>{settings.preset}</span>
            <Icon name="chevron"/>
          </button>
        </div>
        <div className="toolbar-right">
          <div className="now-chip" title={currentTrackTitle ?? 'No active media session'}>
            {currentPlayback?.playing || playing
              ? <span className={`eq ${eqLevels ? 'live' : 'playing'}`} aria-hidden="true">
                {[0, 1, 2].map((index) => <i key={index} style={eqLevels ? { height: `${eqLevels[index]}px` } : undefined}/>)}
              </span>
              : <span className="now-icon"><Icon name="note"/></span>}
            {currentTrackTitle ? <><span className="now-title">{currentTrackTitle}</span><span className="now-artist">{currentTrackArtist}</span></> : <span className="now-title muted">No active session</span>}
          </div>
          {track && <button type="button" className="icon-btn" onClick={toggleLocal} aria-label={playing ? 'Pause local track' : 'Play local track'} title={playing ? 'Pause local track' : 'Play local track'}>
            {playing ? <Icon name="pause"/> : <Icon name="play"/>}
          </button>}
        </div>
      </header>

      <div className="scroll">
        {section === 'Home' && <Page home title="Workspace" subtitle="The overlay as it appears around your desktop. Everything below updates live.">
          <div className="workspace">
            {stage}
            <aside className="inspector">
              <Group title="Preset" action={<button type="button" className="link-btn" onClick={() => setSection('Presets')}>Library</button>}>
                <div className="current-preset">
                  <span className="swatch-lg" style={{ background: `linear-gradient(135deg, ${settings.color}, ${settings.secondaryColor})` }}/>
                  <div className="current-preset-copy"><b>{settings.preset}</b><span>{presetBlurbs[settings.preset]}</span></div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSection('Visual Studio')}>Edit</button>
                </div>
                <PresetGrid current={settings.preset} onPick={applyPreset}/>
              </Group>
              <Group title="Motion">
                <SelectField label="Behaviour" value={settings.animationMode} options={animationModes.map((mode) => ({ value: mode, label: mode }))} onChange={(value) => update({ animationMode: value as AnimationMode })} hint={animationBlurbs[settings.animationMode]}/>
                <Slider label="Intensity" value={settings.intensity} min={0} max={1} step={.01} unit="%" onChange={(value) => update({ intensity: value })}/>
                <Slider label="Tempo" value={settings.speed} min={.2} max={2.5} step={.01} unit="×" onChange={(value) => update({ speed: value })}/>
              </Group>
              <Group title="Overlay">
                <Toggle label="Click-through" description="Keep the desktop fully interactive" checked={settings.clickThrough} onChange={(value) => update({ clickThrough: value })}/>
                <div className="hint-row"><span>Hide instantly</span><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>Shift</kbd><kbd>H</kbd></div>
              </Group>
            </aside>
          </div>
          <div className="session-bar">
            <div className="session-track">
              <span className="session-art" style={artwork ? { backgroundImage: `url("${artwork}")` } : undefined}>{!artwork && <Icon name="note"/>}</span>
              <div className="session-copy"><b>{currentTrackTitle ?? 'Nothing playing'}</b><span>{currentTrackArtist ?? 'Start a Windows session or load a local file'}</span></div>
            </div>
            <span className={`lyric-chip ${lyricTone}`}>{lyricSummary}</span>
            <div className="sync-control" title="Positive values show lyrics earlier">
              <span className="sync-label">Sync</span>
              <button type="button" className="step-btn" onClick={() => update({ lyricOffsetMs: clamp(settings.lyricOffsetMs - 25, -750, 750) })} aria-label="Show lyrics later"><Icon name="minus"/></button>
              <output>{settings.lyricOffsetMs > 0 ? '+' : ''}{settings.lyricOffsetMs} ms</output>
              <button type="button" className="step-btn" onClick={() => update({ lyricOffsetMs: clamp(settings.lyricOffsetMs + 25, -750, 750) })} aria-label="Show lyrics earlier"><Icon name="plus"/></button>
            </div>
            <button type="button" className="link-btn" onClick={() => setSection('Now Playing')}>Now playing</button>
          </div>
        </Page>}

        {section === 'Visual Studio' && <Page title="Visual studio" subtitle="Preset, typography, motion, and placement in one place.">
          {stage}
          <div className="grid-2">
            <Group title="Direction" className="span-2">
              <PresetGrid current={settings.preset} onPick={applyPreset} detailed/>
            </Group>
            <Group title="Typography">
              <Slider label="Word size" value={settings.wordSize} min={22} max={120} step={1} unit="px" onChange={(value) => update({ wordSize: value })}/>
              <div className="color-row">
                <ColorField label="Primary" value={settings.color} onChange={(value) => update({ color: value })}/>
                <ColorField label="Secondary" value={settings.secondaryColor} onChange={(value) => update({ secondaryColor: value })}/>
              </div>
              <Slider label="Brightness" value={settings.brightness} min={0} max={1} step={.01} unit="%" onChange={(value) => update({ brightness: value })}/>
            </Group>
            <Group title="Motion">
              <SelectField label="Behaviour" value={settings.animationMode} options={animationModes.map((mode) => ({ value: mode, label: mode }))} onChange={(value) => update({ animationMode: value as AnimationMode })}/>
              <Slider label="Intensity" value={settings.intensity} min={0} max={1} step={.01} unit="%" onChange={(value) => update({ intensity: value })}/>
              <Slider label="Tempo" value={settings.speed} min={.2} max={2.5} step={.01} unit="×" onChange={(value) => update({ speed: value })}/>
              <Slider label="Maximum words" value={settings.maxWords} min={2} max={18} step={1} onChange={(value) => update({ maxWords: value })}/>
            </Group>
            <Group title="Placement">
              <SelectField label="Mode" value={settings.placementMode} options={placementModes.map((mode) => ({ value: mode, label: mode }))} onChange={(value) => update({ placementMode: value as AppSettings['placementMode'] })}/>
              <Slider label="Central safe zone" value={settings.safeZone} min={.3} max={.8} step={.01} unit="%" onChange={(value) => update({ safeZone: value })}/>
              <div className="field"><label>Edges</label><EdgePicker value={settings.enabledEdges} onChange={edge}/></div>
            </Group>
            <Group title="Comfort">
              <Toggle label="Reduced motion" description="Lowers drift and rotation" checked={settings.reducedMotion} onChange={(value) => update({ reducedMotion: value })}/>
              <Toggle label="Click-through" description="Desktop stays interactive" checked={settings.clickThrough} onChange={(value) => update({ clickThrough: value })}/>
              <div className="hint-row"><span>Instant hide</span><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>Shift</kbd><kbd>H</kbd></div>
            </Group>
          </div>
        </Page>}

        {section === 'Now Playing' && <Page title="Now playing" subtitle="The current session, its lyrics, and the sync between them.">
          <div className="grid-2">
            <Group title="Session" action={<span className={`tag ${status.playbackSource === 'system' ? 'ok' : 'muted'}`}>{status.playbackSource === 'system' ? 'Windows' : 'Local'}</span>}>
              <div className="session-hero">
                <span className="session-art-lg" style={artwork ? { backgroundImage: `url("${artwork}")` } : undefined}>{!artwork && <Icon name="note"/>}</span>
                <div className="session-hero-copy">
                  <h3>{currentTrackTitle ?? (status.playbackSource === 'system' ? 'Waiting for a media session' : 'No local track loaded')}</h3>
                  <p>{currentTrackArtist ?? (status.playbackSource === 'system' ? 'Play a song in an app that publishes Windows media controls.' : 'Music stays on your device.')}</p>
                  <div className="chip-row">
                    <span className="tag muted">{status.playbackSource === 'system' ? status.mediaSource || 'Windows media' : 'Local playback'}</span>
                    <span className={`tag ${currentPlayback?.playing || playing ? 'ok' : 'muted'}`}>{currentPlayback?.playing || playing ? 'Playing' : 'Paused'}</span>
                  </div>
                </div>
              </div>
              <div className="transport">
                <button type="button" className="icon-btn transport-play" disabled={!track} onClick={toggleLocal} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Icon name="pause"/> : <Icon name="play"/>}</button>
                <input className="seek" type="range" min={0} max={durationSeconds || 1} step={.1} value={Math.min(positionSeconds, durationSeconds || 1)} disabled={!track}
                  onChange={(event) => { if (audioRef.current) { audioRef.current.currentTime = Number(event.target.value); publishPlayback(); } }} aria-label="Seek local track"/>
                <span className="mono-time">{clockText(positionSeconds)} / {clockText(durationSeconds)}</span>
              </div>
              <div className="button-row">
                <button type="button" className="btn btn-primary" onClick={followWindows}>Follow Windows now playing</button>
                <button type="button" className="btn btn-ghost" onClick={() => audioPickRef.current?.click()}>Play a local file</button>
              </div>
            </Group>
            <Group title="Lyrics" action={<span className={`tag ${lyricTone === 'ok' ? 'ok' : lyricTone === 'bad' ? 'bad' : 'muted'}`}>{status.lyricsStatus === 'local' ? 'Local' : status.lyricsStatus === 'synced' ? 'LRCLIB' : status.lyricsStatus === 'searching' ? 'Searching' : status.lyricsStatus === 'retrying' ? 'Retrying' : status.lyricsStatus === 'error' ? 'Failed' : 'None'}</span>}>
              <div className="status-list">
                <div><span>Lines</span><b>{displayLyrics.length}</b></div>
                <div><span>Words</span><b>{lyricWords || '—'}</b></div>
                <div><span>Timing</span><b>{displayLyrics.length ? timingLabel(status.lyricsTiming) : '—'}</b></div>
                <div><span>Source</span><b>{status.lyricsStatus === 'local' ? 'Your LRC file' : status.lyricsStatus === 'synced' ? 'LRCLIB' : '—'}</b></div>
              </div>
              <div className="prop">
                <div className="prop-head"><label>Sync offset</label><span className="prop-value">{settings.lyricOffsetMs > 0 ? '+' : ''}{settings.lyricOffsetMs} ms</span></div>
                <div className="sync-control wide">
                  <button type="button" className="step-btn" onClick={() => update({ lyricOffsetMs: clamp(settings.lyricOffsetMs - 25, -750, 750) })} aria-label="Show lyrics later"><Icon name="minus"/></button>
                  <input className="slider" type="range" min={-750} max={750} step={25} value={settings.lyricOffsetMs} aria-label="Sync offset"
                    onChange={(event) => update({ lyricOffsetMs: Number(event.target.value) })} style={{ '--fill': `${((settings.lyricOffsetMs + 750) / 1500) * 100}%` } as CSSProperties}/>
                  <button type="button" className="step-btn" onClick={() => update({ lyricOffsetMs: clamp(settings.lyricOffsetMs + 25, -750, 750) })} aria-label="Show lyrics earlier"><Icon name="plus"/></button>
                  <button type="button" className="link-btn" onClick={() => update({ lyricOffsetMs: 0 })}>Reset</button>
                </div>
                <p className="hint">Positive values show lyrics earlier. Adjust in 25 ms steps if a provider or output device drifts.</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" disabled={!track} onClick={() => lrcPickRef.current?.click()}>Load LRC file</button>
              <p className="hint">{localLyrics.length ? `${localLyrics.length} local lines loaded · ${localLyrics.filter((line) => line.words?.length).length} with word objects` : 'An LRC file overrides the online result for the loaded local track.'}</p>
            </Group>
          </div>
          <Group title="Lyrics timeline" action={<span className="group-note">{lyricWindow.length ? (activeLine >= 0 ? `Line ${activeLine + 1} of ${displayLyrics.length}` : 'Ready') : 'Live'}</span>}>
            {lyricWindow.length
              ? <ol className="lyric-timeline">
                {lyricWindow.map((line, index) => {
                  const position = lyricWindowStart + index;
                  const state = position === activeLine ? 'active' : position < activeLine ? 'past' : '';
                  return <li key={`${position}-${line.startMs}`} className={state}>
                    <span className="lyric-time">{clockText(line.startMs / 1000)}</span>
                    <span className="lyric-text">{line.text}</span>
                  </li>;
                })}
              </ol>
              : <p className="empty">Timed lyrics appear here while a track is playing. Follow a Windows session or load a local file with an LRC.</p>}
          </Group>
          <div className="note-block">
            <p>Online lookup sends the detected title, artist, and duration to <a href="https://lrclib.net/docs" target="_blank" rel="noreferrer">LRCLIB</a>. Word timestamps are used when the record provides them; line-only lyrics are paced with clearly labelled estimated word timing.</p>
            <p>Windows media sessions include Spotify when it publishes playback metadata. ECHOFRAME does not use the Spotify API or a Spotify lyrics endpoint.</p>
          </div>
        </Page>}

        {section === 'Typography' && <Page title="Typography" subtitle="Typeface, scale, and material for every word on screen.">
          {stage}
          <div className="grid-2">
            <Group title="Scale">
              <Slider label="Word size" value={settings.wordSize} min={22} max={120} step={1} unit="px" onChange={(value) => update({ wordSize: value })}/>
              <Slider label="Brightness" value={settings.brightness} min={0} max={1} step={.01} unit="%" onChange={(value) => update({ brightness: value })}/>
            </Group>
            <Group title="Colour">
              <div className="color-row">
                <ColorField label="Primary" value={settings.color} onChange={(value) => update({ color: value })}/>
                <ColorField label="Secondary" value={settings.secondaryColor} onChange={(value) => update({ secondaryColor: value })}/>
              </div>
            </Group>
            <Group title="Letterform" className="span-2" columns={2}>
              <SelectField label="Typeface" value={settings.fontFamily} options={fontFamilies.map((font) => ({ value: font, label: font }))} onChange={(value) => update({ fontFamily: value as AppSettings['fontFamily'] })}/>
              <Slider label="Font weight" value={settings.fontWeight} min={300} max={900} step={100} onChange={(value) => update({ fontWeight: value })}/>
              <Slider label="Letter spacing" value={settings.letterSpacing} min={-2} max={12} step={1} unit="px" onChange={(value) => update({ letterSpacing: value })}/>
              <Slider label="Outline width" value={settings.outlineWidth} min={0} max={20} step={1} unit="px" onChange={(value) => update({ outlineWidth: value })}/>
              <Slider label="Glow strength" value={settings.glowStrength} min={0} max={60} step={1} unit="px" onChange={(value) => update({ glowStrength: value })}/>
            </Group>
          </div>
        </Page>}

        {section === 'Animation' && <Page title="Animation" subtitle="How each word arrives, settles, and leaves the edge.">
          {stage}
          <div className="grid-2">
            <Group title="Behaviour">
              <SelectField label="Animation" value={settings.animationMode} options={animationModes.map((mode) => ({ value: mode, label: mode }))} onChange={(value) => update({ animationMode: value as AnimationMode })} hint={animationBlurbs[settings.animationMode]}/>
              <Slider label="Maximum words" value={settings.maxWords} min={2} max={18} step={1} onChange={(value) => update({ maxWords: value })}/>
            </Group>
            <Group title="Motion">
              <Slider label="Intensity" value={settings.intensity} min={0} max={1} step={.01} unit="%" onChange={(value) => update({ intensity: value })}/>
              <Slider label="Tempo" value={settings.speed} min={.2} max={2.5} step={.01} unit="×" onChange={(value) => update({ speed: value })}/>
            </Group>
            <Group title="Timing" className="span-2">
              <p className="hint">Bounce reacts to detected onsets when audio analysis is on; the preview uses a simulated pulse. Lyric arrival follows the playback position, not the animation tempo.</p>
            </Group>
          </div>
        </Page>}

        {section === 'Lighting' && <Page title="Lighting" subtitle="The peripheral light field that follows stereo balance and transients.">
          {stage}
          <div className="grid-2">
            <Group title="Light field">
              <Toggle label="Lighting enabled" checked={settings.lightingEnabled} onChange={(value) => update({ lightingEnabled: value })}/>
              <Slider label="Light brightness" value={settings.lightingBrightness} min={0} max={1} step={.01} unit="%" onChange={(value) => update({ lightingBrightness: value })}/>
              <Slider label="Glow radius" value={settings.glowRadius} min={.1} max={1} step={.01} unit="%" onChange={(value) => update({ glowRadius: value })}/>
              <Slider label="Stereo sensitivity" value={settings.stereoSensitivity} min={0} max={1} step={.01} unit="%" onChange={(value) => update({ stereoSensitivity: value })}/>
            </Group>
            <Group title="Active edges">
              <div className="field"><label>Lighting edges</label><EdgePicker value={settings.lightingEdges} onChange={lightingEdge}/></div>
            </Group>
            <Group title="Response" className="span-2" columns={2}>
              <Toggle label="Lighting only" description="Hide lyric objects, keep the light field" checked={settings.lightingOnly} onChange={(value) => update({ lightingOnly: value })}/>
              <Toggle label="Photosensitivity safe" description="Caps brightness changes and suppresses flashes" checked={settings.photosensitivitySafe} onChange={(value) => update({ photosensitivitySafe: value })}/>
              <p className="hint span-2">The preview uses a simulated left-to-right signal when capture is off. The desktop overlay responds to captured audio only.</p>
            </Group>
          </div>
        </Page>}

        {section === 'Theme' && <Page title="Theme" subtitle="Colour rules for words, light, and album artwork.">
          {stage}
          <div className="grid-2">
            <Group title="Mode">
              <SelectField label="Appearance" value={settings.themeMode} options={themeModes.map((mode) => ({ value: mode, label: mode }))} onChange={(value) => {
                const mode = value as ThemeMode;
                update(mode === 'Album Adaptive' && artworkPalette ? { themeMode: mode, color: artworkPalette.primary, secondaryColor: artworkPalette.secondary } : { themeMode: mode });
              }}/>
              <div className="color-row">
                <ColorField label="Primary" value={settings.color} onChange={(value) => update({ color: value, themeMode: 'Custom Palette' })}/>
                <ColorField label="Secondary" value={settings.secondaryColor} onChange={(value) => update({ secondaryColor: value, themeMode: 'Custom Palette' })}/>
              </div>
            </Group>
            <Group title="Palette" action={<span className="group-note">{artworkPalette ? 'From artwork' : 'Default'}</span>}>
              <div className="palette-strip">
                <span style={{ background: settings.color }}/><span style={{ background: settings.secondaryColor }}/>
              </div>
              <p className="hint">{artworkPalette ? `${artworkPalette.primary} · ${artworkPalette.secondary}. Album Adaptive picks readable accents from embedded local artwork.` : 'Load a local audio file with embedded artwork to derive a palette. Changes crossfade across words and lighting.'}</p>
            </Group>
          </div>
        </Page>}

        {section === 'Spatial Audio' && <Page title="Spatial audio" subtitle="Local analysis of the selected Windows output. Nothing is recorded or sent.">
          {stage}
          <div className="grid-2">
            <Group title="Capture" action={<span className={`tag ${status.audioCaptureActive ? 'ok' : 'muted'}`}>{status.audioCaptureActive ? 'Live' : 'Off'}</span>}>
              <Toggle label="Enable system audio analysis" description="Processes the chosen output locally" checked={settings.audioEnabled} onChange={(value) => update({ audioEnabled: value })}/>
              <SelectField label="Output device" value={settings.audioDeviceId}
                options={[{ value: '', label: 'System default' }, ...devices.map((device) => ({ value: device.id, label: device.name }))]}
                onChange={(value) => update({ audioDeviceId: value })}/>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void window.echo?.listAudioDevices().then(setDevices)}>Refresh devices</button>
              <p className="hint">Capture turns off on every launch and requires an explicit action. Protected or unavailable streams may produce no signal.</p>
            </Group>
            <Group title="Stereo monitor">
              <div className="meters">
                <Meter label="Left" value={features?.leftRms ?? 0} scale={250}/>
                <Meter label="Right" value={features?.rightRms ?? 0} scale={250}/>
                <Meter label="Bass" value={features?.bass ?? 0} scale={650}/>
                <Meter label="Mid" value={features?.midrange ?? 0} scale={650}/>
                <Meter label="Treble" value={features?.treble ?? 0} scale={650}/>
              </div>
              <p className="hint">Balance {features ? features.balance.toFixed(2) : '—'} · transient {features?.onset ? 'detected' : 'none'}</p>
            </Group>
          </div>
        </Page>}

        {section === 'Placement' && <Page title="Placement" subtitle="Where words may appear and what they must avoid.">
          {stage}
          <div className="grid-2">
            <Group title="Composition">
              <SelectField label="Placement mode" value={settings.placementMode} options={placementModes.map((mode) => ({ value: mode, label: mode }))} onChange={(value) => update({ placementMode: value as AppSettings['placementMode'] })} hint="Strict Edge fits whole words outside the centre. Dynamic and Immersive allow more interior movement."/>
              <Slider label="Central safe zone" value={settings.safeZone} min={.3} max={.8} step={.01} unit="%" onChange={(value) => update({ safeZone: value })}/>
            </Group>
            <Group title="Edges">
              <div className="field"><label>Enabled edges</label><EdgePicker value={settings.enabledEdges} onChange={edge}/></div>
              <p className="hint">Words near a left or right edge stay horizontal and readable, within the free band outside the safe zone.</p>
            </Group>
            <Group title="Protected rectangle" className="span-2">
              <Toggle label="Enable protected rectangle" description="Words avoid this area in every placement mode" checked={!!settings.manualExclusion}
                onChange={(value) => update({ manualExclusion: value ? { x: .3, y: .3, width: .4, height: .4 } : null })}/>
              {settings.manualExclusion && <div className="col-2">
                <Slider label="Left" value={settings.manualExclusion.x} min={0} max={1} step={.01} unit="%" onChange={(value) => update({ manualExclusion: { ...settings.manualExclusion!, x: value } })}/>
                <Slider label="Top" value={settings.manualExclusion.y} min={0} max={1} step={.01} unit="%" onChange={(value) => update({ manualExclusion: { ...settings.manualExclusion!, y: value } })}/>
                <Slider label="Width" value={settings.manualExclusion.width} min={.01} max={1} step={.01} unit="%" onChange={(value) => update({ manualExclusion: { ...settings.manualExclusion!, width: value } })}/>
                <Slider label="Height" value={settings.manualExclusion.height} min={.01} max={1} step={.01} unit="%" onChange={(value) => update({ manualExclusion: { ...settings.manualExclusion!, height: value } })}/>
              </div>}
            </Group>
          </div>
        </Page>}

        {section === 'Presets' && <Page title="Presets" subtitle="Save, duplicate, and move your looks between machines.">
          {stage}
          <div className="grid-2">
            <Group title="Save and transfer" className="span-2" action={<span className="group-note">{savedPresets.length} saved</span>}>
              <div className="preset-form">
                <input value={presetName} maxLength={60} onChange={(event) => setPresetName(event.target.value)} aria-label="Preset name" placeholder="Preset name"/>
                <button type="button" className="btn btn-primary" onClick={savePreset}>Save preset</button>
                <button type="button" className="btn btn-ghost" onClick={exportPreset}><Icon name="download"/>Export</button>
                <button type="button" className="btn btn-ghost" onClick={() => presetPickRef.current?.click()}><Icon name="upload"/>Import</button>
              </div>
              <p className="hint">Preset files include a schema version. Audio capture is always off when a preset is imported or applied.</p>
            </Group>
            <Group title="Library" className="span-2">
              {savedPresets.length ? <div className="preset-list">
                {savedPresets.map((item) => <div className="preset-row" key={item.name}>
                  <span className="preset-row-swatch" style={{ background: `linear-gradient(135deg, ${item.settings.color}, ${item.settings.secondaryColor})` }}/>
                  <div className="preset-row-copy"><b>{item.name}</b><span>{item.settings.animationMode} · {item.settings.themeMode}</span></div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ ...item.settings, audioEnabled: false })}>Apply</button>
                  <button type="button" className="icon-btn" onClick={() => duplicatePreset(item)} title="Duplicate preset" aria-label={`Duplicate ${item.name}`}><Icon name="copy"/></button>
                </div>)}
              </div> : <p className="empty">No saved presets yet. Tune the look, name it above, and save it here.</p>}
            </Group>
          </div>
        </Page>}

        {section === 'Performance' && <Page title="Performance" subtitle="Frame budget, render resolution, and live system load.">
          {stage}
          <div className="stat-strip">
            <div><b>{paused ? '—' : fps}</b><span>Preview fps</span></div>
            <div><b>{status.cpuPercent !== undefined ? `${status.cpuPercent.toFixed(1)}%` : '—'}</b><span>Process CPU</span></div>
            <div><b>{status.audioCaptureActive ? `${status.audioLatencyMs ?? 0} ms` : 'Off'}</b><span>Audio latency</span></div>
            <div><b>{status.displayCount}</b><span>{status.displayCount === 1 ? 'Display' : 'Displays'}</span></div>
          </div>
          <div className="grid-2">
            <Group title="Rendering">
              <SelectField label="Frame rate" value={String(settings.targetFps)} options={[{ value: '60', label: '60 FPS' }, { value: '30', label: '30 FPS · low power' }]}
                onChange={(value) => update({ targetFps: Number(value) as 30 | 60 })}/>
              <Slider label="Render resolution" value={settings.renderScale} min={.5} max={1} step={.01} unit="%" onChange={(value) => update({ renderScale: value })}/>
              <p className="hint">Resolution drops automatically after sustained slow frames, then recovers on target.</p>
            </Group>
            <Group title="Graphics">
              <div className="status-list">
                <div><span>Renderer</span><b>{status.gpu}</b></div>
                <div><span>Pipeline</span><b>Transparent WebGL</b></div>
                <div><span>Overlay</span><b>{settings.overlayEnabled ? 'Visible' : 'Hidden'}</b></div>
              </div>
              {status.error && <p className="error">{status.error}</p>}
            </Group>
          </div>
        </Page>}

        {section === 'General Settings' && <Page title="General" subtitle="Overlay behaviour, comfort, and shortcuts.">
          {stage}
          <div className="grid-2">
            <Group title="Overlay">
              <Toggle label="Show overlay" description="Draw words and light on every display" checked={settings.overlayEnabled} onChange={(value) => update({ overlayEnabled: value })}/>
              <Toggle label="Click-through" description="Clicks pass to the desktop" checked={settings.clickThrough} onChange={(value) => update({ clickThrough: value })}/>
            </Group>
            <Group title="Comfort">
              <Toggle label="Reduced motion" description="Greatly lowers drift and rotation" checked={settings.reducedMotion} onChange={(value) => update({ reducedMotion: value })}/>
            </Group>
            <Group title="Shortcuts" className="span-2">
              <div className="shortcut-list">
                <div><span>Hide overlay</span><span className="keys"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>Shift</kbd><kbd>H</kbd></span></div>
                <div><span>Toggle overlay</span><span className="keys"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>Shift</kbd><kbd>O</kbd></span></div>
                <div><span>Open studio</span><span className="keys"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>Shift</kbd><kbd>S</kbd></span></div>
              </div>
            </Group>
            <Group title="System" className="span-2">
              <div className="status-list">
                <div><span>Version</span><b>0.9.7</b></div>
                <div><span>Playback source</span><b>{sourceLabel}</b></div>
                <div><span>Lyrics</span><b>{lyricSummary}</b></div>
                <div><span>Displays</span><b>{status.displayCount}</b></div>
              </div>
              {status.error && <p className="error">{status.error}</p>}
            </Group>
          </div>
        </Page>}
      </div>
    </div>
  </div>;
}

type Section = 'Home' | 'Now Playing' | 'Visual Studio' | 'Typography' | 'Animation' | 'Lighting' | 'Theme' | 'Spatial Audio' | 'Placement' | 'Presets' | 'Performance' | 'General Settings';
const navGroups: { label?: string; items: { id: Section; label: string; icon: IconName }[] }[] = [
  { items: [{ id: 'Home', label: 'Home', icon: 'home' }, { id: 'Now Playing', label: 'Now playing', icon: 'note' }] },
  { label: 'Design', items: [
    { id: 'Visual Studio', label: 'Visual studio', icon: 'frame' },
    { id: 'Typography', label: 'Typography', icon: 'type' },
    { id: 'Animation', label: 'Animation', icon: 'motion' },
    { id: 'Lighting', label: 'Lighting', icon: 'light' },
    { id: 'Theme', label: 'Theme', icon: 'theme' }
  ] },
  { label: 'Spatial', items: [
    { id: 'Placement', label: 'Placement', icon: 'placement' },
    { id: 'Spatial Audio', label: 'Spatial audio', icon: 'wave' }
  ] }
];
const systemNav: { id: Section; label: string; icon: IconName }[] = [
  { id: 'Presets', label: 'Presets', icon: 'preset' },
  { id: 'Performance', label: 'Performance', icon: 'gauge' },
  { id: 'General Settings', label: 'General', icon: 'settings' }
];

createRoot(document.getElementById('root')!).render(isOverlay ? <Overlay/> : <Studio/>);
