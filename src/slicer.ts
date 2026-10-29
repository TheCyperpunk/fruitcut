import type { Vec2 } from './fruit';

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + k * abx), p.y - (a.y + k * aby));
}

// Testing the whole segment between two hand samples, not just its endpoints,
// means a fast swipe can't jump over a fruit between camera frames.
export function segmentHitsCircle(a: Vec2, b: Vec2, center: Vec2, radius: number): boolean {
  return distanceToSegment(center, a, b) <= radius;
}

// The cut plane contains the swipe and the view axis, so on screen the cut
// lies exactly along the swipe. Its normal is the swipe direction turned 90°.
export function cutFrame(a: Vec2, b: Vec2): { dir: Vec2; normal: Vec2 } {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  return { dir, normal: { x: -dir.y, y: dir.x } };
}
