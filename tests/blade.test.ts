import { describe, expect, it } from 'vitest';
import { Blade } from '../src/blade';
import { CONFIG } from '../src/config';

const H = 1000;

describe('Blade', () => {
  it('measures speed from real timestamps, not frame counts', () => {
    const a = new Blade();
    const b = new Blade();
    // Same distance per sample; b's frames arrive half as often, so it is half as fast.
    for (let i = 0; i < 10; i++) {
      a.push(i * 50, 500, i * 16, H);
      b.push(i * 50, 500, i * 32, H);
    }
    expect(a.latest!.speed).toBeGreaterThan(b.latest!.speed * 1.8);
  });

  it('arms only on fast movement', () => {
    const slow = new Blade();
    const fast = new Blade();
    for (let i = 0; i < 10; i++) {
      slow.push(i * 2, 500, i * 33, H); // ~0.06 screens/s
      fast.push(i * 100, 500, i * 33, H); // ~3 screens/s
    }
    expect(slow.armed).toBe(false);
    expect(fast.armed).toBe(true);
  });

  it('bridges short tracking gaps but breaks the stroke on long ones', () => {
    const blade = new Blade();
    blade.push(0, 0, 0, H);
    blade.push(10, 0, CONFIG.blade.maxGapMs - 10, H);
    blade.push(20, 0, CONFIG.blade.maxGapMs * 3, H);
    const [s0, s1, s2] = blade.samples;
    expect(s1.stroke).toBe(s0.stroke);
    expect(s2.stroke).not.toBe(s1.stroke);
  });

  it('starts a new stroke on an impossibly fast raw jump', () => {
    const blade = new Blade();
    for (let i = 0; i < 5; i++) blade.push(100, 500, i * 33, H);
    const jump = blade.push(900, 500, 5 * 33, H); // 1 screen height in 33 ms ≈ 30 screens/s
    expect(jump.stroke).not.toBe(blade.samples[0].stroke);
    expect(jump.speed).toBe(0);
    expect(jump.x).toBe(900); // filter snapped to the raw position, no smear
  });

  it('starts a new stroke on a sharp reversal', () => {
    const blade = new Blade();
    for (let i = 0; i < 6; i++) blade.push(100 + i * 60, 500, i * 33, H);
    const before = blade.latest!.stroke;
    const back = blade.push(100 + 5 * 60 - 60, 500, 6 * 33, H);
    expect(back.stroke).not.toBe(before);
  });

  it('keeps the stroke through a gentle curve', () => {
    const blade = new Blade();
    const stroke0 = blade.push(100, 500, 0, H).stroke;
    for (let i = 1; i < 10; i++) {
      const a = (i / 10) * Math.PI * 0.5; // quarter turn over ten samples
      blade.push(100 + Math.sin(a) * 400, 500 - (1 - Math.cos(a)) * 400, i * 33, H);
    }
    expect(blade.latest!.stroke).toBe(stroke0);
  });

  it('drops samples older than the trail length', () => {
    const blade = new Blade();
    blade.push(0, 0, 0, H);
    blade.push(1, 0, 20, H);
    blade.prune(CONFIG.blade.trailMs + 10);
    expect(blade.samples).toHaveLength(1);
  });
});
