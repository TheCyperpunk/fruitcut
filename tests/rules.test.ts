import { describe, expect, it } from 'vitest';
import type { BladeSample, StrokeInfo } from '../src/blade';
import { CONFIG } from '../src/config';
import { Fruit } from '../src/fruit';
import { BOMB, FRUIT_KINDS } from '../src/fruitTypes';
import { Game } from '../src/game';
import { LEVELS } from '../src/levels';
import { DEFAULT_SETTINGS, loadSettings, rulesFor, saveSettings } from '../src/settings';

const W = 1000;
const H = 800;
const STROKE: StrokeInfo = { path: 0.3, peakSpeed: 3, turn: 1 };

function seeded(seed = 1): () => number {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const sample = (x: number, y: number, t: number, speed = 3): BladeSample => ({ x, y, t, speed, stroke: 0 });

function advance(game: Game, toT: number): void {
  for (let t = game.time + 16; t <= toT; t += 16) game.update(t);
}

/** A game already playing the given level (0-based), with no pending events. */
function playingGame(level = 0, seed = 1): Game {
  const game = new Game(W, H, 0, seeded(seed));
  game.update(1000);
  game.startLevel(level);
  game.events.length = 0;
  return game;
}

function addBomb(game: Game, x = 500, y = 120): Fruit {
  const bomb = new Fruit({ id: 999, kind: BOMB, x, y, vx: 0, vy: 0, radius: 40, spinAxis: [0, 1, 0], spinRate: 0 });
  game.fruits.push(bomb);
  game.update(game.time + 16);
  return bomb;
}

function bombLaunches(game: Game): number {
  return game.events.filter((e) => e.type === 'launch' && e.bomb).length;
}

describe('bombs', () => {
  it('cutting one costs time, resets the combo and leaves no halves', () => {
    const game = playingGame();
    const bomb = addBomb(game);
    const before = game.timeLeft;
    const halves = game.halves.length;

    game.handleBlade(sample(500, 40, game.time - 16), sample(500, 200, game.time), STROKE);

    expect(game.fruits).not.toContain(bomb);
    expect(game.halves).toHaveLength(halves);
    expect(game.timeLeft).toBeCloseTo(before - CONFIG.game.bombPenaltySeconds, 1);
    expect(game.stats.bombs).toBe(1);
    expect(game.events.map((e) => e.type)).toEqual(['bomb']);
  });

  it('a penalty near the end ends the level instead of going negative', () => {
    const game = playingGame();
    advance(game, game.time + (LEVELS[0].seconds - 2) * 1000);
    addBomb(game);
    game.handleBlade(sample(500, 40, game.time - 16), sample(500, 200, game.time), STROKE);
    expect(game.timeLeft).toBe(0);
    game.update(game.time + 16);
    expect(game.state).toBe('over');
  });

  it('never appear in the first levels, nor early in a bomb level, and can be switched off', () => {
    const early = playingGame(0);
    advance(early, early.time + LEVELS[0].seconds * 1000 * 0.95);
    expect(bombLaunches(early)).toBe(0);

    const bombLevel = LEVELS.findIndex((l) => l.bombChance[1] > 0);
    for (const bombs of [true, false]) {
      const game = playingGame(bombLevel, 7);
      game.setRules({ bombs });
      advance(game, game.time + LEVELS[bombLevel].seconds * 1000 * CONFIG.game.bombStart - 100);
      expect(bombLaunches(game)).toBe(0);
      advance(game, game.time + LEVELS[bombLevel].seconds * 1000 * 0.75);
      if (bombs) expect(bombLaunches(game)).toBeGreaterThan(0);
      else expect(bombLaunches(game)).toBe(0);
    }
  });
});

describe('launch lanes', () => {
  it('starts every fruit in a wave from its own lane, well apart', () => {
    const level = LEVELS.findIndex((l) => l.waveSize[0] >= 2);
    const game = playingGame(level);
    advance(game, game.time + LEVELS[level].seconds * 1000 * 0.9);
    const waves = game.events.flatMap((e) => (e.type === 'launch' && e.xs.length > 1 ? [e.xs] : []));
    expect(waves.length).toBeGreaterThan(0);
    for (const xs of waves) {
      const sorted = [...xs].sort((a, b) => a - b);
      const laneWidth = (W * 0.8) / xs.length;
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(laneWidth * 0.5 - 1e-6);
    }
  });
});

describe('frenzy', () => {
  it('starts in the final seconds of a frenzy level, spawns faster and launches no bombs', () => {
    const level = LEVELS.findIndex((l) => l.frenzy);
    const seconds = LEVELS[level].seconds;
    const game = playingGame(level);
    advance(game, game.time + (seconds - CONFIG.game.frenzySeconds - 0.5) * 1000);
    expect(game.frenzy).toBe(false);
    game.events.length = 0;

    advance(game, game.time + 1000);
    expect(game.frenzy).toBe(true);
    expect(game.events.some((e) => e.type === 'frenzy')).toBe(true);
    game.events.length = 0;

    advance(game, game.time + 3000);
    const launches = game.events.filter((e) => e.type === 'launch');
    expect(launches.length).toBeGreaterThanOrEqual(5); // ~450 ms apart
    expect(launches.every((e) => e.type === 'launch' && !e.bomb)).toBe(true);
  });

  it('never happens on a level without it', () => {
    const game = playingGame(0);
    advance(game, game.time + LEVELS[0].seconds * 1000 - 100);
    expect(game.frenzy).toBe(false);
  });
});

describe('level summary', () => {
  it('reports fruit cut, best combo and bombs when a level ends', () => {
    const game = playingGame();
    for (let i = 0; i < 3; i++) {
      game.fruits.push(new Fruit({ id: 200 + i, kind: FRUIT_KINDS[1], x: 300 + i * 150, y: 120, vx: 0, vy: 0, radius: 40, spinAxis: [0, 1, 0], spinRate: 0 }));
    }
    game.update(game.time + 16);
    game.handleBlade(sample(200, 120, game.time - 16), sample(800, 120, game.time), STROKE);
    advance(game, game.time + LEVELS[0].seconds * 1000);

    const end = game.events.find((e) => e.type === 'failed');
    expect(end && end.type === 'failed' && end.stats).toEqual({ fruit: 3, bombs: 0, bestCombo: 3 });
  });
});

describe('settings', () => {
  function memory(): { getItem(k: string): string | null; setItem(k: string, v: string): void; data: Record<string, string> } {
    const data: Record<string, string> = {};
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) };
  }

  it('round-trips through storage and ignores junk', () => {
    const store = memory();
    saveSettings(store, { ...DEFAULT_SETTINGS, pace: 'relaxed', sound: false });
    expect(loadSettings(store)).toMatchObject({ pace: 'relaxed', sound: false });

    store.data['fruitcut.settings'] = JSON.stringify({ pace: 'frantic', sound: 'yes', extra: 1 });
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);

    store.data['fruitcut.settings'] = '{not json';
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  it('takes the OS reduced-motion preference as the default', () => {
    expect(loadSettings(null, true).reducedMotion).toBe(true);
    expect(loadSettings(null, false).reducedMotion).toBe(false);
  });

  it('turns accessibility options into gentler rules', () => {
    const normal = rulesFor(DEFAULT_SETTINGS);
    const easy = rulesFor({ ...DEFAULT_SETTINGS, pace: 'relaxed', fruitSize: 'large', sensitivity: 'gentle', bombs: false });
    expect(easy.gravity).toBeLessThan(normal.gravity);
    expect(easy.spawnScale).toBeGreaterThan(normal.spawnScale);
    expect(easy.fruitRadius).toBeGreaterThan(normal.fruitRadius);
    expect(easy.minSpeed).toBeLessThan(normal.minSpeed);
    expect(easy.calibrationFloor).toBeLessThan(normal.calibrationFloor);
    expect(easy.bombs).toBe(false);
  });

  it('applied rules cap the calibrated slice threshold', () => {
    const game = new Game(W, H, 0, seeded());
    game.setRules(rulesFor({ ...DEFAULT_SETTINGS, sensitivity: 'gentle' }));
    game.update(1000);
    advance(game, 1100);
    const starter = game.fruits.find((f) => f.starter)!;
    game.handleBlade(sample(starter.x - 80, starter.y, 1084), sample(starter.x + 80, starter.y, 1100), { ...STROKE, peakSpeed: 9 });
    expect(game.minSpeed).toBe(1.0);
  });
});
