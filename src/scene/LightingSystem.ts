import * as THREE from 'three';
import type { AppSettings, AudioFeatures } from '../types';
import { resolveThemeColors } from '../theme/modes';
import { smoothTravel } from './lightingMath';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(128, 128, 2, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,255,255,.75)');
  gradient.addColorStop(.32, 'rgba(255,255,255,.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

export class LightingSystem {
  private texture = glowTexture();
  private sprites: THREE.Sprite[] = [];
  private levels = [0, 0, 0, 0, 0];
  private travel = .5;

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < 5; i++) {
      const material = new THREE.SpriteMaterial({ map: this.texture, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.position.z = -5;
      scene.add(sprite); this.sprites.push(sprite);
    }
  }

  update(dt: number, settings: AppSettings, features: AudioFeatures | null, viewWidth: number, viewHeight: number, now: number) {
    const [primary, secondary] = resolveThemeColors(settings, features, now);
    this.sprites.forEach((sprite, index) => (sprite.material as THREE.SpriteMaterial).color.lerp(index % 2 ? secondary : primary, 1 - Math.exp(-dt * 2.6)));
    const width = viewWidth * (.45 + settings.glowRadius * .55);
    const height = viewHeight * (.55 + settings.glowRadius * .75);
    this.sprites[0].position.set(-viewWidth * .5, 0, -5);
    this.sprites[1].position.set(viewWidth * .5, 0, -5);
    this.sprites[2].position.set(0, viewHeight * .5, -5);
    this.sprites[3].position.set(0, -viewHeight * .5, -5);
    this.travel = smoothTravel(this.travel, features?.balance ?? 0, settings.stereoSensitivity, dt);
    this.sprites[4].position.set((this.travel - .5) * viewWidth, viewHeight * .48, -5.1);
    for (let i = 0; i < 5; i++) this.sprites[i].scale.set(i < 2 ? width : width * .8, i < 2 ? height : height * .6, 1);
    const intensity = clamp(features?.intensity ?? 0, 0, 1);
    const balance = clamp((features?.balance ?? 0) * settings.stereoSensitivity, -1, 1);
    const bass = clamp((features?.bass ?? 0) * 8, 0, 1);
    const transient = settings.photosensitivitySafe ? 0 : clamp(features?.transient ?? 0, 0, 1);
    const movement = clamp(Math.abs(features?.stereoMovement ?? 0) / 4, 0, 1);
    const target = settings.lightingEnabled ? [
      .035 + intensity * (.24 - balance * .16) + bass * .08,
      .035 + intensity * (.24 + balance * .16) + bass * .08,
      .025 + intensity * .13 + bass * .06,
      .025 + intensity * .1 + bass * .11,
      movement * .16 + transient * .12
    ] : [0, 0, 0, 0, 0];
    for (let i = 0; i < 4; i++) if (!settings.lightingEdges.includes((['left', 'right', 'top', 'bottom'] as const)[i])) target[i] = 0;
    if (!settings.lightingEdges.includes('top')) target[4] = 0;
    const maxChange = (settings.photosensitivitySafe ? .42 : 1.8) * dt;
    for (let i = 0; i < 5; i++) {
      const delta = clamp(target[i] - this.levels[i], -maxChange, maxChange);
      this.levels[i] = clamp(this.levels[i] + delta, 0, .5);
      (this.sprites[i].material as THREE.SpriteMaterial).opacity = this.levels[i] * settings.lightingBrightness;
    }
  }

  dispose() {
    this.sprites.forEach((sprite) => { this.scene.remove(sprite); (sprite.material as THREE.SpriteMaterial).dispose(); });
    this.texture.dispose(); this.sprites = [];
  }
}
