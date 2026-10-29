import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from '../src/oneEuro';

const run = (beta: number, signal: (t: number) => number, seconds = 1, hz = 30) => {
  const f = new OneEuroFilter({ minCutoff: 1.2, beta, dCutoff: 1 });
  let out = 0;
  for (let i = 0; i <= seconds * hz; i++) out = f.filter(signal(i / hz), i / hz);
  return out;
};

describe('OneEuroFilter', () => {
  it('passes the first value through unchanged', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    expect(f.filter(0.42, 0)).toBe(0.42);
  });

  it('settles on a constant input', () => {
    expect(run(8, () => 0.5)).toBeCloseTo(0.5, 6);
  });

  it('lags far less on a fast swipe than a fixed low-pass', () => {
    const swipe = (t: number) => 2 * t; // 2 screen heights per second
    const lagFixed = 2 - run(0, swipe);
    const lagAdaptive = 2 - run(8, swipe);
    expect(lagAdaptive).toBeLessThan(lagFixed / 3);
  });

  it('ignores repeated timestamps', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    f.filter(0, 0);
    expect(f.filter(1, 0)).toBe(0);
  });
});
