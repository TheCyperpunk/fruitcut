import { describe, expect, it } from 'vitest';
import { cutFrame, distanceToSegment, segmentHitsCircle } from '../src/slicer';

describe('slicer', () => {
  it('hits a fruit the segment passes through', () => {
    expect(segmentHitsCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 5 }, 10)).toBe(true);
  });

  it('hits on a fast swipe whose two samples both land outside the fruit', () => {
    // At 30 fps a fast hand can be on opposite sides of a fruit in consecutive frames.
    expect(segmentHitsCircle({ x: -300, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 0 }, 40)).toBe(true);
  });

  it('misses a fruit beside the segment', () => {
    expect(segmentHitsCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 30 }, 10)).toBe(false);
  });

  it('misses a fruit beyond the end of the segment', () => {
    expect(segmentHitsCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 140, y: 0 }, 30)).toBe(false);
  });

  it('measures distance to a zero-length segment as distance to the point', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it('puts the cut normal at right angles to the swipe', () => {
    const { dir, normal } = cutFrame({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(dir.x).toBeCloseTo(0.6);
    expect(dir.y).toBeCloseTo(0.8);
    expect(dir.x * normal.x + dir.y * normal.y).toBeCloseTo(0);
    expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1);
  });
});
