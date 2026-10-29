import { CONFIG } from './config';
import { OneEuroFilter2D } from './oneEuro';

export interface BladeSample {
  x: number; // CSS px
  y: number;
  t: number; // capture time of the camera frame, ms
  speed: number; // screen heights per second
  stroke: number; // samples with different strokes are never joined
}

export interface StrokeInfo {
  path: number; // screen heights travelled by this stroke within the window
  peakSpeed: number; // fastest sample so far in this stroke
  turn: number; // dot product of the last two segment directions: 1 straight on, -1 reversal
}

// Fingertip history in camera time. Slicing tests the segments between
// consecutive samples, so a fast swipe can't skip over a fruit between frames.
export class Blade {
  readonly samples: BladeSample[] = [];
  minSpeed = CONFIG.blade.minSpeed;
  private readonly filter = new OneEuroFilter2D(CONFIG.filter);
  private stroke: number;

  /** `strokeBase` keeps stroke ids unique when several fingertips are blades. */
  constructor(strokeBase = 0) {
    this.stroke = strokeBase;
  }
  private strokePeak = 0;
  private last: BladeSample | null = null;
  private prev: BladeSample | null = null;
  private lastRaw: { x: number; y: number; t: number } | null = null;
  private screenH = 1;

  push(x: number, y: number, t: number, screenH: number): BladeSample {
    if (this.last && t - this.last.t > CONFIG.blade.maxGapMs) this.breakStroke();
    this.screenH = screenH;

    // No hand moves this fast: the landmarks jumped. Checked on raw positions,
    // because the filter would smear the jump over several frames.
    if (this.last && this.lastRaw) {
      const rawSpeed = Math.hypot(x - this.lastRaw.x, y - this.lastRaw.y) / screenH / ((t - this.lastRaw.t) / 1000);
      if (rawSpeed > CONFIG.blade.maxSpeed) this.breakStroke();
    }
    this.lastRaw = { x, y, t };

    // Filter in screen-height units so the tuning holds on any screen size.
    let f = this.filter.filter(x / screenH, y / screenH, t / 1000);
    let speed = this.last ? this.speedTo(f.x * screenH, f.y * screenH, t) : 0;

    // A sharp reversal is either a glitch snapping back or a new motion.
    // Either way start a fresh stroke, which also snaps the filter to here.
    if (this.reverses(f.x * screenH, f.y * screenH)) {
      this.breakStroke();
      f = this.filter.filter(x / screenH, y / screenH, t / 1000);
      speed = 0;
    }

    const sample = { x: f.x * screenH, y: f.y * screenH, t, speed, stroke: this.stroke };
    this.samples.push(sample);
    this.prev = this.last;
    this.last = sample;
    this.strokePeak = Math.max(this.strokePeak, speed);
    return sample;
  }

  strokeInfo(windowMs = CONFIG.blade.pathWindowMs): StrokeInfo {
    const latest = this.last;
    if (!latest) return { path: 0, peakSpeed: 0, turn: 1 };

    let path = 0;
    for (let i = this.samples.length - 1; i > 0; i--) {
      const b = this.samples[i];
      const a = this.samples[i - 1];
      if (a.stroke !== latest.stroke || a.t < latest.t - windowMs) break;
      path += Math.hypot(b.x - a.x, b.y - a.y);
    }

    let turn = 1;
    const n = this.samples.length;
    if (n >= 3 && this.samples[n - 3].stroke === latest.stroke) {
      const [p0, p1, p2] = [this.samples[n - 3], this.samples[n - 2], latest];
      const ax = p1.x - p0.x;
      const ay = p1.y - p0.y;
      const bx = p2.x - p1.x;
      const by = p2.y - p1.y;
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      const tiny = this.screenH * 0.004; // a segment too short to have a direction
      if (la > tiny && lb > tiny) turn = (ax * bx + ay * by) / (la * lb);
    }

    return { path: path / this.screenH, peakSpeed: this.strokePeak, turn };
  }

  prune(now: number): void {
    const cutoff = now - CONFIG.blade.trailMs;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
  }

  get latest(): BladeSample | null {
    return this.last;
  }

  /** The sample before `latest` in the same stroke, if any. */
  get previous(): BladeSample | null {
    return this.prev;
  }

  get armed(): boolean {
    return (this.last?.speed ?? 0) >= this.minSpeed;
  }

  private speedTo(px: number, py: number, t: number): number {
    const last = this.last!;
    return Math.hypot(px - last.x, py - last.y) / this.screenH / ((t - last.t) / 1000);
  }

  private reverses(px: number, py: number): boolean {
    if (!this.last || !this.prev) return false;
    const ax = this.last.x - this.prev.x;
    const ay = this.last.y - this.prev.y;
    const bx = px - this.last.x;
    const by = py - this.last.y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const tiny = this.screenH * 0.004; // too short to have a direction
    if (la <= tiny || lb <= tiny) return false;
    return (ax * bx + ay * by) / (la * lb) < CONFIG.blade.minTurnDot;
  }

  private breakStroke(): void {
    this.stroke++;
    this.strokePeak = 0;
    this.last = null;
    this.prev = null;
    this.filter.reset();
  }
}
