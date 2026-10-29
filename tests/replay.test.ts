import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import type { RecordedFrame, Recording } from '../src/recorder';
import { replay } from '../src/replay';

// Screen and video share a size, so a normalized point maps to screen px by
// (1 - x) * W (mirrored), y * H. The starter watermelon sits at (0.5, 0.55).
const W = 1000;
const H = 800;
const FRAME_MS = 33;

function frame(t: number, nx: number | null, ny = 0.55): RecordedFrame {
  // Every landmark at the same point: only the fingertip (8) matters for slicing.
  return { t, lm: nx === null ? null : Array.from({ length: 21 }, () => [nx, ny]).flat() };
}

function recording(frames: RecordedFrame[]): Recording {
  return { version: 1, video: { w: W, h: H }, screen: { w: W, h: H }, frames };
}

/** Hand moving from x0 to x1 (screen fractions) over `ms`, sampled at camera rate. */
function sweep(x0: number, x1: number, ms: number, opts: { skip?: [number, number]; startT?: number } = {}): RecordedFrame[] {
  const frames: RecordedFrame[] = [];
  const startT = opts.startT ?? 0;
  for (let t = 0; t <= ms; t += FRAME_MS) {
    if (opts.skip && t > opts.skip[0] && t < opts.skip[1]) continue;
    const k = t / ms;
    frames.push(frame(startT + t, 1 - (x0 + (x1 - x0) * k))); // mirrored: camera x = 1 - screen x
  }
  return frames;
}

function rest(x: number, ms: number, startT = 0): RecordedFrame[] {
  const frames: RecordedFrame[] = [];
  for (let t = 0; t <= ms; t += FRAME_MS) frames.push(frame(startT + t, 1 - x));
  return frames;
}

function run(frames: RecordedFrame[]): { slices: number; state: string } {
  const game = new Game(W, H, 0, () => 0.5);
  const { slices } = replay(recording([frame(0, null), ...frames]), game);
  return { slices, state: game.state };
}

describe('replayed hand trajectories', () => {
  it('a clean swipe through the fruit cuts it', () => {
    expect(run([...rest(0.15, 300), ...sweep(0.15, 0.85, 300, { startT: 333 })])).toEqual({ slices: 1, state: 'playing' });
  });

  it('a slow drift through the fruit does not', () => {
    expect(run(sweep(0.15, 0.85, 4000)).slices).toBe(0);
  });

  it('a huge one-frame landmark jump across the fruit and back does not', () => {
    const frames = [...rest(0.3, 500), frame(533, 1 - 0.7), ...rest(0.3, 500, 566)];
    expect(run(frames).slices).toBe(0);
  });

  it('a smaller one-frame jump, under the glitch speed cap, does not either', () => {
    const frames = [...rest(0.38, 500), frame(533, 1 - 0.62), ...rest(0.38, 500, 566)];
    expect(run(frames).slices).toBe(0);
  });

  it('a huge one-frame jump that never comes back does not', () => {
    const frames = [...rest(0.1, 500), ...rest(0.9, 500, 533)];
    expect(run(frames).slices).toBe(0);
  });

  it('a swipe survives a one-frame tracking dropout in the middle', () => {
    const frames = [...rest(0.15, 300), ...sweep(0.15, 0.85, 300, { startT: 333, skip: [120, 140] })];
    expect(run(frames).slices).toBe(1);
  });

  it('a long dropout breaks the stroke, so a fruit crossed during it is not cut', () => {
    const frames = [...rest(0.15, 300), ...sweep(0.15, 0.85, 400, { startT: 333, skip: [100, 300] })];
    expect(run(frames).slices).toBe(0);
  });

  it('a zig-zag still cuts on the way back, after the stroke re-establishes', () => {
    // Out past the fruit, then back through it; the return swipe lasts long enough to count.
    const out = sweep(0.2, 0.8, 300);
    const back = sweep(0.8, 0.2, 300, { startT: 333 });
    expect(run([...rest(0.2, 300), ...out.map((f) => ({ ...f, t: f.t + 333 })), ...back.map((f) => ({ ...f, t: f.t + 333 }))]).slices).toBe(1);
  });
});
