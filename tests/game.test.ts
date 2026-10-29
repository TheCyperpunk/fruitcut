import { describe, expect, it } from 'vitest';
import type { BladeSample, StrokeInfo } from '../src/blade';
import { CONFIG } from '../src/config';
import { Fruit } from '../src/fruit';
import { FRUIT_KINDS } from '../src/fruitTypes';
import { Game } from '../src/game';
import { LEVELS } from '../src/levels';

const W = 1000;
const H = 800;

// Deterministic random numbers so waves are the same every run.
function seeded(seed = 1): () => number {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const GOOD_STROKE: StrokeInfo = { path: 0.3, peakSpeed: 3, turn: 1 };

function sample(x: number, y: number, t: number, speed = 3, stroke = 0): BladeSample {
  return { x, y, t, speed, stroke };
}

function swipeAcross(game: Game, fruit: Fruit, speed = 3, stroke: Partial<StrokeInfo> = {}): void {
  const p = fruit.positionAt(game.time);
  game.handleBlade(
    sample(p.x - 80, p.y, game.time - 16, speed),
    sample(p.x + 80, p.y, game.time, speed),
    { ...GOOD_STROKE, peakSpeed: speed, ...stroke },
  );
}

function advance(game: Game, toT: number): void {
  for (let t = game.time + 16; t <= toT; t += 16) game.update(t);
}

function readyGame(): Game {
  const game = new Game(W, H, 0, seeded());
  game.update(1000);
  advance(game, 1100);
  return game;
}

describe('Game', () => {
  it('waits with a starter fruit and starts level 1 when it is sliced', () => {
    const game = readyGame();
    expect(game.state).toBe('ready');
    const starter = game.fruits.find((f) => f.starter)!;

    swipeAcross(game, starter);

    expect(game.state).toBe('playing');
    expect(game.hasStarter).toBe(false);
    expect(game.halves).toHaveLength(2);
    expect(game.events.map((e) => e.type)).toEqual(['slice', 'calibrated', 'levelStart']);
  });

  it('ignores a hand moving slowly through a fruit', () => {
    const game = readyGame();
    swipeAcross(game, game.fruits[0], CONFIG.blade.minSpeed * 0.5);
    expect(game.state).toBe('ready');
  });

  it('ignores a fast segment whose previous sample was slow (a one-frame jump)', () => {
    const game = readyGame();
    const p = game.fruits[0].positionAt(game.time);
    game.handleBlade(sample(p.x - 80, p.y, game.time - 16, 0.1), sample(p.x + 80, p.y, game.time, 3), GOOD_STROKE);
    expect(game.state).toBe('ready');
  });

  it('ignores a segment that reverses the stroke direction', () => {
    const game = readyGame();
    swipeAcross(game, game.fruits[0], 3, { turn: -0.9 });
    expect(game.state).toBe('ready');
  });

  it('ignores a single jitter jump that has no real path behind it', () => {
    const game = readyGame();
    swipeAcross(game, game.fruits[0], 3, { path: CONFIG.blade.minPath * 0.5 });
    expect(game.state).toBe('ready');
  });

  it('ignores a segment that joins two different strokes', () => {
    const game = readyGame();
    const p = game.fruits[0].positionAt(game.time);
    game.handleBlade(sample(p.x - 80, p.y, game.time - 16, 3, 0), sample(p.x + 80, p.y, game.time, 3, 1), GOOD_STROKE);
    expect(game.state).toBe('ready');
  });

  it('tests the hand against where the fruit was when the frame was captured', () => {
    const game = new Game(W, H, 0, seeded());
    const fruit = new Fruit({
      id: 99, kind: FRUIT_KINDS[1], x: 500, y: 400, vx: 1000, vy: 0, radius: 40, spinAxis: [0, 1, 0], spinRate: 0,
    });
    game.fruits.push(fruit);
    game.update(1000);
    advance(game, 1200); // fruit has moved ~200 px since t = 1000

    const then = fruit.positionAt(1000);
    game.handleBlade(sample(then.x, then.y - 60, 984), sample(then.x, then.y + 60, 1000), GOOD_STROKE);
    expect(game.fruits).not.toContain(fruit);
  });

  it('scores sliced fruit, fails the level when time runs out short, and keeps the best score', () => {
    const game = readyGame();
    swipeAcross(game, game.fruits[0]);
    advance(game, game.time + 1500);

    const target = game.fruits.find((f) => !f.starter)!;
    expect(target).toBeDefined();
    swipeAcross(game, target);
    expect(game.score).toBe(1);

    advance(game, game.time + LEVELS[0].seconds * 1000);
    expect(game.state).toBe('over');
    expect(game.best).toBe(1);
    expect(game.events.some((e) => e.type === 'failed' && e.newBest)).toBe(true);
  });

  it('gives combo points for three fruit in one stroke', () => {
    const game = new Game(W, H, 0, seeded());
    for (let i = 0; i < 3; i++) {
      game.fruits.push(
        // Kept well above the starter watermelon in the middle of the screen.
        new Fruit({ id: 100 + i, kind: FRUIT_KINDS[1], x: 300 + i * 150, y: 120, vx: 0, vy: 0, radius: 40, spinAxis: [0, 1, 0], spinRate: 0 }),
      );
    }
    game.update(1000);
    game.update(1016);
    game.handleBlade(sample(200, 120, 1000), sample(800, 120, 1016), GOOD_STROKE);
    expect(game.score).toBe(1 + 1 + 2);
  });

  describe('calibration', () => {
    it('lowers the slice threshold for a gentle starter swipe', () => {
      const game = readyGame();
      swipeAcross(game, game.fruits[0], 2, { peakSpeed: 2 });
      expect(game.minSpeed).toBeCloseTo(Math.max(2 * CONFIG.calibration.ratio, CONFIG.calibration.floor));
    });

    it('never raises the threshold above the default for a hard swipe', () => {
      const game = readyGame();
      swipeAcross(game, game.fruits[0], 8, { peakSpeed: 8 });
      expect(game.minSpeed).toBe(CONFIG.blade.minSpeed);
    });
  });

  describe('pause', () => {
    it('freezes fruit and the clock, ignores slices, and resumes where it left off', () => {
      const game = readyGame();
      swipeAcross(game, game.fruits[0]);
      advance(game, game.time + 1500);
      const target = game.fruits.find((f) => !f.starter)!;
      const timeLeft = game.timeLeft;

      game.pause();
      expect(game.state).toBe('paused');
      const { x, y } = target;
      advance(game, game.time + 3000);
      expect(target.x).toBe(x);
      expect(target.y).toBe(y);
      expect(game.timeLeft).toBeCloseTo(timeLeft, 2);

      swipeAcross(game, target);
      expect(game.fruits).toContain(target);

      game.resume();
      expect(game.state).toBe('playing');
      expect(game.timeLeft).toBeCloseTo(timeLeft, 2);
      advance(game, game.time + 200);
      expect(target.y).not.toBe(y);
    });
  });
});
