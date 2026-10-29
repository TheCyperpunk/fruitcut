import { describe, expect, it } from 'vitest';
import { isFist } from '../src/gestures';

// Minimal hands: only the wrist, PIP joints and fingertips matter.
function hand(tipDistance: number, pipDistance = 60): { x: number; y: number }[] {
  const pts = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  const wrist = { x: 100, y: 200 };
  pts[0] = wrist;
  for (const [pip, tip] of [[6, 8], [10, 12], [14, 16], [18, 20]]) {
    pts[pip] = { x: wrist.x, y: wrist.y - pipDistance };
    pts[tip] = { x: wrist.x, y: wrist.y - tipDistance };
  }
  return pts;
}

describe('isFist', () => {
  it('is false for an open hand with fingertips beyond the middle joints', () => {
    expect(isFist(hand(110))).toBe(false);
  });

  it('is true when the fingertips curl back closer to the wrist than the middle joints', () => {
    expect(isFist(hand(40))).toBe(true);
  });

  it('needs at least three curled fingers', () => {
    const pts = hand(40);
    pts[8] = { x: 100, y: 90 }; // index extended
    pts[12] = { x: 100, y: 90 }; // middle extended
    expect(isFist(pts)).toBe(false);
  });
});
