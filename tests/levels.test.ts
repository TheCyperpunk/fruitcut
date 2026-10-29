import { describe, expect, it } from 'vitest';
import type { BladeSample, StrokeInfo } from '../src/blade';
import { Fruit } from '../src/fruit';
import { FRUIT_KINDS, KINDS_BY_NAME } from '../src/fruitTypes';
import { Game } from '../src/game';
import { LEVELS, levelAt } from '../src/levels';

const W = 1000;
const H = 800;
const STROKE: StrokeInfo = { path: 0.3, peakSpeed: 3, turn: 1 };

function seeded(seed = 1): () => number {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const sample = (x: number, y: number, t: number, speed = 3, stroke = 0): BladeSample => ({ x, y, t, speed, stroke });

function advance(game: Game, toT: number): void {
  for (let t = game.time + 16; t <= toT; t += 16) game.update(t);
}

/** Wait for the starter fruit and slice it. */
function sliceStarter(game: Game): void {
  for (let i = 0; i < 400 && !game.hasStarter; i++) game.update(game.time + 16);
  const starter = game.fruits.find((f) => f.starter)!;
  expect(starter).toBeDefined();
  game.update(game.time + 16);
  game.handleBlade(sample(starter.x - 80, starter.y, game.time - 16), sample(starter.x + 80, starter.y, game.time), STROKE);
}

/** Add a hovering fruit well away from the starter and cut it. */
function cutOne(game: Game, id: number): void {
  const f = new Fruit({ id, kind: FRUIT_KINDS[1], x: 200, y: 100, vx: 0, vy: 0, radius: 40, spinAxis: [0, 1, 0], spinRate: 0, starter: false });
  game.fruits.push(f);
  game.update(game.time + 16);
  // A fresh stroke id each time, so cuts don't chain into one combo.
  game.handleBlade(sample(200, 20, game.time - 16, 3, id), sample(200, 180, game.time, 3, id), STROKE);
  expect(game.fruits).not.toContain(f);
}

function newGame(): Game {
  const game = new Game(W, H, 0, seeded());
  game.update(1000);
  return game;
}

describe('level flow', () => {
  it('starts at level 1 with one finger and the basic fruit only', () => {
    const game = newGame();
    sliceStarter(game);
    expect(game.state).toBe('playing');
    expect(game.level).toBe(0);
    expect(game.fingers).toBe(1);

    advance(game, game.time + LEVELS[0].seconds * 1000 * 0.9);
    const launched = new Set(game.fruits.filter((f) => !f.starter).map((f) => f.kind.name));
    for (const name of launched) expect(LEVELS[0].kinds).toContain(name);
  });

  it('clears the level at the target, then the next starter swipe starts the next level', () => {
    const game = newGame();
    sliceStarter(game);
    for (let i = 0; i < LEVELS[0].target; i++) cutOne(game, 500 + i);
    expect(game.state).toBe('cleared');
    expect(game.bestLevel).toBe(1);
    expect(game.events.some((e) => e.type === 'cleared')).toBe(true);

    // Leftover fruit fall away, the starter appears, slicing it begins level 2.
    advance(game, game.time + 4000);
    game.fruits.splice(0, game.fruits.length, ...game.fruits.filter((f) => f.starter));
    sliceStarter(game);
    expect(game.state).toBe('playing');
    expect(game.level).toBe(1);
    expect(game.def.name).toBe(LEVELS[1].name);
  });

  it('fails when time runs out short of the target, and retries the same level with the score restored', () => {
    const game = newGame();
    sliceStarter(game);
    cutOne(game, 700);
    cutOne(game, 701);
    const scoreBefore = 0; // score at the start of level 1
    advance(game, game.time + LEVELS[0].seconds * 1000 + 100);
    expect(game.state).toBe('over');
    expect(game.score).toBe(2);

    advance(game, game.time + 4000);
    game.fruits.splice(0, game.fruits.length, ...game.fruits.filter((f) => f.starter));
    sliceStarter(game);
    expect(game.state).toBe('playing');
    expect(game.level).toBe(0);
    expect(game.score).toBe(scoreBefore);
    expect(game.events.some((e) => e.type === 'levelStart' && e.retry)).toBe(true);
  });

  it('gives more fingers and more kinds as levels go on', () => {
    const fingers = LEVELS.map((l) => l.fingers);
    for (let i = 1; i < fingers.length; i++) expect(fingers[i]).toBeGreaterThanOrEqual(fingers[i - 1]);
    expect(fingers[0]).toBe(1);
    expect(fingers[fingers.length - 1]).toBe(4);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].kinds.length).toBeGreaterThanOrEqual(LEVELS[i - 1].kinds.length);
    for (const level of LEVELS) for (const name of level.kinds) expect(KINDS_BY_NAME.has(name)).toBe(true);
  });

  it('keeps going past the table with bigger targets', () => {
    const last = LEVELS.length - 1;
    expect(levelAt(last + 1).target).toBeGreaterThan(LEVELS[last].target);
    expect(levelAt(last + 3).target).toBeGreaterThan(levelAt(last + 1).target);
    expect(levelAt(last + 1).fingers).toBe(4);
  });

  it('jumping to a level applies its finger count', () => {
    const game = newGame();
    game.startLevel(6);
    expect(game.fingers).toBe(4);
    expect(game.state).toBe('playing');
  });
});

describe('combos across fingers', () => {
  it('cuts by different fingers of one swipe chain into a combo when they share the swipe id', () => {
    const game = newGame();
    game.startLevel(6);
    for (let i = 0; i < 3; i++) {
      game.fruits.push(new Fruit({ id: 900 + i, kind: FRUIT_KINDS[1], x: 300 + i * 150, y: 120, vx: 0, vy: 0, radius: 40, spinAxis: [0, 1, 0], spinRate: 0 }));
    }
    game.update(game.time + 16);
    const t = game.time;
    // Three blades (stroke ids 0, 1e6, 2e6), one swipe id.
    game.handleBlade(sample(250, 120, t - 16, 3, 0), sample(350, 120, t, 3, 0), STROKE, 0);
    game.handleBlade(sample(400, 120, t - 16, 3, 1e6), sample(500, 120, t, 3, 1e6), STROKE, 0);
    game.handleBlade(sample(550, 120, t - 16, 3, 2e6), sample(650, 120, t, 3, 2e6), STROKE, 0);
    expect(game.stats.bestCombo).toBe(3);
    expect(game.score).toBe(1 + 1 + 2);
  });
});
