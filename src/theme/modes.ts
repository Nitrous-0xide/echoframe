import * as THREE from 'three';
import type { AppSettings, AudioFeatures } from '../types';

export function resolveThemeColors(settings: AppSettings, features: AudioFeatures | null, now: number): [THREE.Color, THREE.Color] {
  const primary = new THREE.Color(settings.color), secondary = new THREE.Color(settings.secondaryColor);
  if (settings.themeMode === 'Monochrome') secondary.copy(primary).multiplyScalar(.55);
  if (settings.themeMode === 'Rainbow') {
    const hue = (now / 14000) % 1;
    primary.setHSL(hue, .73, .59); secondary.setHSL((hue + .25) % 1, .7, .6);
  }
  if (settings.themeMode === 'Dynamic Audio Colour') {
    const hue = (.55 + (features?.balance ?? 0) * .18 + (features?.intensity ?? 0) * .1 + 1) % 1;
    primary.setHSL(hue, .7, .62); secondary.setHSL((hue + .22) % 1, .65, .6);
  }
  return [primary, secondary];
}
