import type { Vec2 } from './fruit';

const WRIST = 0;
// index, middle, ring, pinky: [PIP joint, fingertip]
const FINGERS: [number, number][] = [
  [6, 8],
  [10, 12],
  [14, 16],
  [18, 20],
];

/**
 * A fist: at least three of the four long fingers are curled, meaning the
 * fingertip is closer to the wrist than the middle joint is. The thumb is
 * ignored because it often sits beside a fist rather than inside it.
 */
export function isFist(points: Vec2[]): boolean {
  const wrist = points[WRIST];
  let curled = 0;
  for (const [pip, tip] of FINGERS) {
    const dTip = Math.hypot(points[tip].x - wrist.x, points[tip].y - wrist.y);
    const dPip = Math.hypot(points[pip].x - wrist.x, points[pip].y - wrist.y);
    if (dTip < dPip) curled++;
  }
  return curled >= 3;
}
