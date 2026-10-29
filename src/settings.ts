import { CONFIG } from './config';
import type { Rules } from './game';

export interface Settings {
  sound: boolean; // effects
  music: boolean; // the synthwave loop
  vibration: boolean;
  reducedMotion: boolean; // no screen shake or flashes, fewer particles
  bombs: boolean;
  pace: 'relaxed' | 'normal';
  fruitSize: 'normal' | 'large';
  sensitivity: 'gentle' | 'normal'; // how fast a swipe must be
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  vibration: true,
  reducedMotion: false,
  bombs: true,
  pace: 'normal',
  fruitSize: 'normal',
  sensitivity: 'normal',
  debug: CONFIG.debug,
};

const KEY = 'fruitcut.settings';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isValid<K extends keyof Settings>(key: K, value: unknown): value is Settings[K] {
  const def = DEFAULT_SETTINGS[key];
  if (typeof def === 'boolean') return typeof value === 'boolean';
  if (key === 'pace') return value === 'relaxed' || value === 'normal';
  if (key === 'fruitSize') return value === 'normal' || value === 'large';
  if (key === 'sensitivity') return value === 'gentle' || value === 'normal';
  return false;
}

/** Stored settings over the defaults; unknown or malformed values are ignored. */
export function loadSettings(storage: StorageLike | null, prefersReducedMotion = false): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion };
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return settings;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const value = stored[key];
      if (isValid(key, value)) Object.assign(settings, { [key]: value });
    }
  } catch {
    // corrupt or blocked storage: use defaults
  }
  return settings;
}

export function saveSettings(storage: StorageLike | null, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // private mode or storage blocked: settings just aren't remembered
  }
}

/** The game rules a set of settings produces. */
export function rulesFor(s: Settings): Rules {
  const relaxed = s.pace === 'relaxed';
  const gentle = s.sensitivity === 'gentle';
  return {
    gravity: CONFIG.game.gravity * (relaxed ? 0.7 : 1),
    fruitRadius: CONFIG.game.fruitRadius * (s.fruitSize === 'large' ? 1.3 : 1),
    spawnScale: relaxed ? 1.4 : 1,
    bombs: s.bombs,
    minSpeed: gentle ? 1.0 : CONFIG.blade.minSpeed,
    calibrationFloor: gentle ? 0.6 : CONFIG.calibration.floor,
  };
}
