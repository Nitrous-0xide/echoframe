import * as THREE from 'three';
import type { AnimationMode, AppSettings, AudioFeatures, PlaybackState, TimedLine } from '../types';
import { PeripheralPlacementEngine, type Placement, type Rect } from './PlacementEngine';
import { LightingSystem } from './LightingSystem';
import { resolveThemeColors } from '../theme/modes';
import { displayEvents, type DisplayWord } from '../lyrics/displayEvents';

const demoWords = ['ECHO', 'INTO', 'THE', 'NIGHT', 'FEEL', 'IT', 'MOVE', 'AROUND', 'YOU', 'AGAIN', 'AGAIN', 'AGAIN'];
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const random = (seed: number) => { const x = Math.sin(seed * 127.1 + 78.233) * 43758.5453; return x - Math.floor(x); };

interface Word {
  text: string;
  lineId: number | null;
  accent: boolean;
  group: THREE.Group;
  texture: THREE.CanvasTexture;
  geometry: THREE.PlaneGeometry;
  faces: THREE.MeshBasicMaterial[];
  placement: Placement;
  born: number;
  life: number;
  phase: number;
  velocity: number;
  spring: number;
  beat: number;
}

interface Motion { dx: number; dy: number; dz: number; scale: number; tiltX: number; tiltY: number; tiltZ: number; trail: number }
function motionFor(mode: AnimationMode, age: number, now: number, phase: number, spring: number): Motion {
  const t = age / 1000;
  const s = now / 1000;
  const slow = Math.sin(s * 1.1 + phase);
  const result: Motion = { dx: 0, dy: 0, dz: 0, scale: 1, tiltX: 0, tiltY: 0, tiltZ: 0, trail: .24 };
  switch (mode) {
    case 'Float': result.dy = slow; result.dx = Math.cos(s * .8 + phase); result.dz = Math.sin(s * .7 + phase) * .22; result.tiltY = .08 * slow; break;
    case 'Bounce': result.dy = -spring * 1.8; result.scale = 1 + spring * .07; result.dz = spring * .15; break;
    case 'Pop': result.scale = 1 + .22 * Math.exp(-t * 7) * Math.sin(t * 18) - .4 * Math.exp(-t * 10); result.dz = .25 * Math.exp(-t * 4); break;
    case 'Orbit': result.dx = Math.cos(s * 1.3 + phase) * 1.1; result.dy = Math.sin(s * 1.3 + phase) * .75; result.tiltY = .12 * slow; break;
    case 'Drift': result.dx = Math.sin(t * .8 + phase) * 1.3; result.dy = Math.cos(t * .55 + phase) * .4; break;
    case 'Depth Shift': result.dz = Math.sin(s * .8 + phase) * .55; result.scale = 1 + Math.sin(s * .8 + phase) * .025; result.tiltX = .08 * slow; break;
    case 'Scatter': result.dx = Math.sin(t * 1.2 + phase) * .5; result.dy = Math.cos(t * 1.4 + phase) * .5; result.dz = Math.sin(s * 1.1 + phase) * .28; break;
    case 'Echo': result.dx = slow * .8; result.dy = Math.cos(s + phase) * .5; result.trail = .5; break;
    case 'Wave': result.dy = Math.sin(s * 2.2 + phase) * 1.1; result.tiltZ = Math.sin(s * 2.2 + phase) * .025; break;
    case 'Cinematic': result.dx = Math.sin(s * .35 + phase) * .35; result.dy = Math.cos(s * .42 + phase) * .3; result.dz = Math.sin(s * .4 + phase) * .16; result.trail = .12; break;
  }
  return result;
}

function wordTexture(text: string, settings: AppSettings): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const font = `${settings.fontWeight} 112px "${settings.fontFamily}", Arial, sans-serif`;
  context.font = font;
  context.letterSpacing = `${settings.letterSpacing}px`;
  canvas.width = Math.max(64, Math.ceil(context.measureText(text).width) + 28);
  canvas.height = 156;
  context.font = font; context.letterSpacing = `${settings.letterSpacing}px`;
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.shadowColor = '#ffffff'; context.shadowBlur = settings.glowStrength;
  context.lineWidth = settings.outlineWidth; context.strokeStyle = 'rgba(13,12,33,.8)';
  context.strokeText(text, canvas.width / 2, 78);
  context.fillStyle = '#ffffff'; context.fillText(text, canvas.width / 2, 78);
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,.42)';
  context.font = `600 112px "${settings.fontFamily}", Arial, sans-serif`;
  context.fillText(text, canvas.width / 2 - 2, 75);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

export class SpatialScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  private placementEngine = new PeripheralPlacementEngine();
  private lighting = new LightingSystem(this.scene);
  private audioFeatures: AudioFeatures | null = null;
  private audioFrameAt = 0;
  private lastOnsetTimestamp = 0;
  private playback: PlaybackState | null = null;
  private playbackReceivedAt = 0;
  private lyricEvents: DisplayWord[] = [];
  private nextLyricIndex = 0;
  private words: Word[] = [];
  private history: { edge: Placement['edge']; x: number; y: number; text: string }[] = [];
  private linePlacement: { lineId: number; layout: 'line' | 'staircase' | 'vertical'; last: Placement; seen: Set<string> } | null = null;
  private settings: AppSettings;
  private raf = 0;
  private last = performance.now();
  private clock = 0;
  private nextSpawn = 0;
  private count = 0;
  private paused = false;
  private width = 1;
  private height = 1;
  private observer: ResizeObserver;
  private onFrame?: (fps: number) => void;
  private effectiveRenderScale = 1;
  private slowSeconds = 0;

  constructor(private container: HTMLElement, settings: AppSettings, onFrame?: (fps: number) => void, private preview = false) {
    this.settings = settings; this.onFrame = onFrame;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.effectiveRenderScale = settings.renderScale;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.effectiveRenderScale);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 18);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.raf = requestAnimationFrame(this.animate);
  }

  setSettings(settings: AppSettings) {
    const changedPlacement = settings.safeZone !== this.settings.safeZone || settings.wordSize !== this.settings.wordSize || settings.enabledEdges.join() !== this.settings.enabledEdges.join() ||
      settings.placementMode !== this.settings.placementMode || JSON.stringify(settings.manualExclusion) !== JSON.stringify(this.settings.manualExclusion) ||
      settings.fontFamily !== this.settings.fontFamily || settings.fontWeight !== this.settings.fontWeight || settings.letterSpacing !== this.settings.letterSpacing ||
      settings.outlineWidth !== this.settings.outlineWidth || settings.glowStrength !== this.settings.glowStrength || settings.lightingOnly !== this.settings.lightingOnly ||
      settings.miniplayerEnabled !== this.settings.miniplayerEnabled;
    const changedScale = settings.renderScale !== this.settings.renderScale;
    this.settings = settings;
    if (changedScale) { this.effectiveRenderScale = settings.renderScale; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.effectiveRenderScale); this.renderer.setSize(this.width, this.height, false); }
    if (changedPlacement) this.clearWords();
  }
  setAudioFeatures(features: AudioFeatures) { this.audioFeatures = features; this.audioFrameAt = performance.now(); }
  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.last = performance.now();
  }
  private lyricPosition(positionMs: number) { return positionMs + this.settings.lyricOffsetMs; }
  setPlayback(state: PlaybackState) {
    const now = performance.now();
    const prior = this.playback;
    const expected = prior ? prior.positionMs + (prior.playing ? now - this.playbackReceivedAt : 0) : state.positionMs;
    if (!prior || prior.trackId !== state.trackId || Math.abs(expected - state.positionMs) > 800) {
      this.clearWords();
      this.nextLyricIndex = this.lyricEvents.findIndex((event) => event.startMs >= this.lyricPosition(state.positionMs) - 250);
      if (this.nextLyricIndex < 0) this.nextLyricIndex = this.lyricEvents.length;
    }
    this.playback = state; this.playbackReceivedAt = now;
  }
  setLyrics(lines: TimedLine[]) {
    this.lyricEvents = displayEvents(lines);
    const position = this.lyricPosition(this.playback?.positionMs ?? 0);
    this.nextLyricIndex = this.lyricEvents.findIndex((event) => event.startMs >= position - 250);
    if (this.nextLyricIndex < 0) this.nextLyricIndex = this.lyricEvents.length;
    this.clearWords();
  }
  private featuresAt(now: number): AudioFeatures | null {
    if (this.audioFeatures && now - this.audioFrameAt < 1000) return this.audioFeatures;
    if (!this.preview) return null;
    const t = now / 1000;
    const balance = Math.sin(t * .85) * .82;
    const intensity = .42 + .18 * Math.sin(t * 1.7);
    return { timestampMs: Date.now(), leftRms: intensity * (1 - balance) / 2,
      rightRms: intensity * (1 + balance) / 2, balance, midEnergy: intensity * .8,
      sideEnergy: Math.abs(balance) * intensity, bass: .12 + .08 * Math.sin(t * 2),
      midrange: .16, treble: .1, spectralFlux: .1, transient: 0,
      stereoMovement: Math.cos(t * .85) * .7, onset: false, intensity };
  }

  private clearWords() { this.words.forEach((word) => this.disposeWord(word)); this.words = []; this.history = []; this.linePlacement = null; }
  private resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    if (width !== this.width || height !== this.height) this.clearWords();
    this.width = width; this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private spawn(now: number, lyric?: DisplayWord) {
    if (lyric && this.linePlacement && this.linePlacement.lineId !== lyric.lineId) {
      this.words = this.words.filter((word) => {
        if (word.lineId === lyric.lineId) return true;
        this.disposeWord(word); return false;
      });
    }
    if (this.words.length >= this.settings.maxWords) return;
    const index = this.count++;
    const text = lyric?.text ?? demoWords[index % demoWords.length];
    const token = text.trim().toLocaleLowerCase();
    if (lyric && this.linePlacement?.lineId !== lyric.lineId) this.linePlacement = null;
    const layout = lyric ? this.linePlacement?.layout ?? (['line', 'staircase', 'vertical'] as const)[Math.floor(random(lyric.lineId + 17) * 3)] : null;
    const repeatedInLine = !!lyric && !!this.linePlacement?.seen.has(token);
    const follow = lyric && !repeatedInLine && lyric.wordIndex > 0 && this.linePlacement
      ? { ...this.linePlacement.last, layout: this.linePlacement.layout } : undefined;
    const accent = index % 4 === 0;
    const texture = wordTexture(text, this.settings);
    const desiredHeight = this.settings.wordSize * .92;
    const desiredWidth = desiredHeight * texture.image.width / texture.image.height;
    const occupied: Rect[] = this.words.map((word) => word.placement.reserved);
    const preferredEdges = layout === 'line' ? ['top', 'bottom'] : layout === 'vertical' ? ['left', 'right'] : this.settings.enabledEdges;
    const enabledEdges = this.settings.enabledEdges.filter((edge) => preferredEdges.includes(edge));
    const placement = this.placementEngine.place({
      viewport: { width: this.width, height: this.height },
      textSize: { width: desiredWidth, height: desiredHeight },
      settings: { ...this.settings, enabledEdges: enabledEdges.length ? enabledEdges : this.settings.enabledEdges }, occupied, recent: this.history, seed: index + 1,
      direction: this.featuresAt(performance.now())?.balance,
      follow,
      avoid: this.history.filter((item) => item.text === token).map((item) => ({ x: item.x, y: item.y }))
    });
    if (!placement) { texture.dispose(); return; }
    const worldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (this.camera.position.z - placement.depth);
    const worldPerPixel = worldHeight / this.height;
    const geometry = new THREE.PlaneGeometry(placement.width * worldPerPixel, placement.height * worldPerPixel);
    const group = new THREE.Group();
    const faces: THREE.MeshBasicMaterial[] = [];
    for (let layer = 0; layer < 3; layer++) {
      const face = new THREE.MeshBasicMaterial({ map: texture, color: layer === 0 ? (accent ? this.settings.secondaryColor : this.settings.color) : layer === 1 ? 0x5c4b86 : 0x201932, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide });
      const plane = new THREE.Mesh(geometry, face);
      plane.position.set(layer * -.035, layer * .025, -.06 * layer);
      group.add(plane); faces.push(face);
    }
    this.scene.add(group);
    this.words.push({ text, lineId: lyric?.lineId ?? null, accent, group, texture, geometry, faces, placement, born: now,
      life: lyric ? clamp(lyric.lineEndMs - lyric.startMs + 650, 750, 12000) : 4200 + random(index + 7) * 1300, phase: random(index + 55) * Math.PI * 2,
      velocity: 0, spring: 0, beat: -1 });
    this.history.unshift({ edge: placement.edge, x: placement.x, y: placement.y, text: token });
    this.history.length = Math.min(this.history.length, 30);
    if (lyric && layout) {
      const seen = this.linePlacement?.lineId === lyric.lineId ? this.linePlacement.seen : new Set<string>();
      seen.add(token);
      this.linePlacement = { lineId: lyric.lineId, layout, last: placement, seen };
    }
  }

  private disposeWord(word: Word) {
    this.scene.remove(word.group);
    word.geometry.dispose(); word.texture.dispose(); word.faces.forEach((face) => face.dispose());
  }

  private animate = (now: number) => {
    this.raf = requestAnimationFrame(this.animate);
    if (this.paused) { this.last = now; return; }
    if (now - this.last < 1000 / this.settings.targetFps - 1) return;
    const dt = clamp((now - this.last) / 1000, .001, .1);
    this.last = now;
    if (!this.playback?.trackId || this.playback.playing) this.clock += dt * 1000;
    this.onFrame?.(1 / dt);
    this.slowSeconds = dt > 1.6 / this.settings.targetFps ? this.slowSeconds + dt : Math.max(0, this.slowSeconds - dt * .5);
    if (this.slowSeconds > 4 && this.effectiveRenderScale > .55) {
      this.effectiveRenderScale = Math.max(.55, this.effectiveRenderScale - .15);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.effectiveRenderScale);
      this.renderer.setSize(this.width, this.height, false);
      this.slowSeconds = 0;
    }
    if (this.settings.lightingOnly || this.settings.miniplayerEnabled) {
      // The lighting field continues; lyrics live in the miniplayer instead.
    } else if (this.playback?.trackId) {
      if (this.playback.playing) {
        // Extrapolate from the last reported frame, but never run away from a stalled bridge.
        const elapsed = Math.min(now - this.playbackReceivedAt, 4000);
        const position = this.lyricPosition(this.playback.positionMs + elapsed);
        while (this.nextLyricIndex < this.lyricEvents.length && this.lyricEvents[this.nextLyricIndex].startMs <= position) {
          const event = this.lyricEvents[this.nextLyricIndex++];
          if (event.startMs >= position - 300) this.spawn(this.clock, event);
        }
      }
    } else if (this.clock >= this.nextSpawn) {
      this.spawn(this.clock);
      this.nextSpawn = this.clock + 440 / this.settings.speed;
    }
    const energy = this.settings.reducedMotion ? .04 : this.settings.intensity;
    const features = this.featuresAt(now);
    const [primaryColor, secondaryColor] = resolveThemeColors(this.settings, features, now);
    for (const word of this.words) {
      const age = this.clock - word.born;
      const fadeIn = clamp(age / 430, 0, 1);
      const fadeOut = clamp((word.life - age) / 950, 0, 1);
      const opacity = Math.min(fadeIn, fadeOut) * this.settings.brightness;
      const beat = Math.floor(this.clock / 560);
      if (beat !== word.beat) { word.beat = beat; if (this.settings.animationMode === 'Bounce' && this.preview && !this.audioFeatures) word.velocity += 5.5; }
      word.velocity += (-36 * word.spring - 8.5 * word.velocity) * dt;
      word.spring += word.velocity * dt;
      const motion = motionFor(this.settings.animationMode, age, this.clock, word.phase, Math.max(0, word.spring));
      // Keep the full animated plane inside the placement engine's reserved box.
      const dx = motion.dx * Math.min(2, word.placement.width * .015) * energy;
      const dy = motion.dy * Math.min(2, word.placement.height * .015) * energy;
      const depth = word.placement.depth + motion.dz * energy;
      const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (this.camera.position.z - depth);
      const viewWidth = viewHeight * this.camera.aspect;
      word.group.position.set((word.placement.x - .5 + dx / this.width) * viewWidth,
        (.5 - word.placement.y - dy / this.height) * viewHeight, depth);
      const tiltLimit = Math.min(word.placement.width, word.placement.height) / Math.max(word.placement.width, word.placement.height);
      word.group.rotation.set(motion.tiltX * energy, motion.tiltY * energy, word.placement.rotation + motion.tiltZ * tiltLimit * energy);
      word.group.scale.setScalar(clamp(1 + (motion.scale - 1) * energy, .55, 1.08));
      word.faces[0].opacity = opacity;
      word.faces[0].color.lerp(word.accent ? secondaryColor : primaryColor, 1 - Math.exp(-dt * 2.6));
      word.faces[1].opacity = opacity * .35;
      word.faces[2].opacity = opacity * motion.trail;
    }
    this.words = this.words.filter((word) => { if (this.clock - word.born < word.life) return true; this.disposeWord(word); return false; });
    if (features?.onset && features.timestampMs !== this.lastOnsetTimestamp && this.settings.animationMode === 'Bounce') {
      this.lastOnsetTimestamp = features.timestampMs;
      this.words.forEach((word) => { word.velocity = Math.min(8, word.velocity + 2); });
    }
    const lightHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (this.camera.position.z + 5);
    this.lighting.update(dt, this.settings, features, lightHeight * this.camera.aspect, lightHeight, now);
    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.clearWords();
    this.lighting.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
