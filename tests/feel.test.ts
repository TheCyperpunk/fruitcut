import { describe, expect, it } from 'vitest';
import type { BladeSample } from '../src/blade';
import { CONFIG } from '../src/config';
import { Fruit } from '../src/fruit';
import { FRUIT_KINDS } from '../src/fruitTypes';
import { Game } from '../src/game';
import { smoothstep } from '../src/handMask';

const sample = (x: number, y: number, t: number): BladeSample => ({ x, y, t, speed: 3, stroke: 0 });

describe('hit-stop', () => {
  it('freezes the remaining fruit briefly after a cut, then resumes', () => {
    const game = new Game(1000, 800, 0, () => 0.5);
    const target = new Fruit({ id: 1, kind: FRUIT_KINDS[1], x: 300, y: 120, vx: 0, vy: 0, radius: 40, spinAxis: [0, 1, 0], spinRate: 0 });
    const other = new Fruit({ id: 2, kind: FRUIT_KINDS[2], x: 700, y: 120, vx: 500, vy: 0, radius: 40, spinAxis: [0, 1, 0], spinRate: 0 });
    game.fruits.push(target, other);
    game.update(1000);
    game.update(1016);

    game.handleBlade(sample(300, 40, 1000), sample(300, 200, 1016), { path: 0.3, peakSpeed: 3, turn: 1 });
    expect(game.fruits).not.toContain(target);
    expect(game.fruits).toContain(other);

    const xBefore = other.x;
    game.update(1016 + CONFIG.feel.hitStopMs * 0.5);
    expect(other.x).toBe(xBefore); // frozen

    game.update(1016 + CONFIG.feel.hitStopMs + 50);
    expect(other.x).toBeGreaterThan(xBefore); // moving again
  });
});

describe('smoothstep', () => {
  it('clamps outside the edges and eases between them', () => {
    expect(smoothstep(0.3, 0.7, 0)).toBe(0);
    expect(smoothstep(0.3, 0.7, 1)).toBe(1);
    expect(smoothstep(0.3, 0.7, 0.5)).toBeCloseTo(0.5);
    expect(smoothstep(0.3, 0.7, 0.4)).toBeLessThan(0.25);
  });
});
