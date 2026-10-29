import type { FruitKind } from './fruitTypes';

export interface Vec2 {
  x: number;
  y: number;
}

type Vec3 = [number, number, number];

// Positions are in screen CSS px (y down), velocities in px/s, time in ms.

const HISTORY_MS = 400;
const MAX_EXTRAPOLATE_MS = 60;

export interface FruitInit {
  id: number;
  kind: FruitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  spinAxis: Vec3;
  spinRate: number; // rad/s
  starter?: boolean; // floats in place; slicing it starts a round
}

export class Fruit {
  readonly id: number;
  readonly kind: FruitKind;
  readonly radius: number;
  readonly spinAxis: Vec3;
  readonly spinRate: number;
  readonly starter: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spinAngle = 0;
  private readonly baseY: number;
  // Recent positions, so a hand sample captured a few frames ago is tested
  // against where the fruit was at that moment, not where it is now.
  private readonly history: { t: number; x: number; y: number }[] = [];

  constructor(init: FruitInit) {
    this.id = init.id;
    this.kind = init.kind;
    this.radius = init.radius;
    this.spinAxis = init.spinAxis;
    this.spinRate = init.spinRate;
    this.starter = init.starter ?? false;
    this.x = init.x;
    this.y = init.y;
    this.vx = init.vx;
    this.vy = init.vy;
    this.baseY = init.y;
  }

  step(t: number, dt: number, gravity: number): void {
    if (this.starter) {
      this.y = this.baseY + Math.sin(t / 450) * this.radius * 0.12;
    } else {
      this.vy += gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    this.spinAngle += this.spinRate * dt;
    this.history.push({ t, x: this.x, y: this.y });
    while (this.history.length > 2 && this.history[0].t < t - HISTORY_MS) this.history.shift();
  }

  positionAt(t: number): Vec2 {
    const h = this.history;
    if (!h.length) return { x: this.x, y: this.y };

    const last = h[h.length - 1];
    if (t >= last.t) {
      const dt = Math.min(t - last.t, MAX_EXTRAPOLATE_MS) / 1000;
      return this.starter ? { x: last.x, y: last.y } : { x: last.x + this.vx * dt, y: last.y + this.vy * dt };
    }
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1];
      if (a.t <= t) {
        const b = h[i];
        const k = (t - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return { x: h[0].x, y: h[0].y };
  }
}

export interface HalfInit {
  id: number;
  fruitId: number; // the fruit this came from; halves share its depth layer
  kind: FruitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  normal: Vec2; // cut-plane normal on screen
  dir: Vec2; // swipe direction on screen
  side: 1 | -1; // which side of the cut this half is on
  born: number;
  baseAngle: number;
}

export class Half {
  readonly id: number;
  readonly fruitId: number;
  readonly kind: FruitKind;
  readonly radius: number;
  readonly normal: Vec2;
  readonly dir: Vec2;
  readonly side: 1 | -1;
  readonly born: number;
  readonly baseAngle: number;
  x: number;
  y: number;
  vx: number;
  vy: number;

  constructor(init: HalfInit) {
    this.id = init.id;
    this.fruitId = init.fruitId;
    this.kind = init.kind;
    this.radius = init.radius;
    this.normal = init.normal;
    this.dir = init.dir;
    this.side = init.side;
    this.born = init.born;
    this.baseAngle = init.baseAngle;
    this.x = init.x;
    this.y = init.y;
    this.vx = init.vx;
    this.vy = init.vy;
  }

  step(dt: number, gravity: number): void {
    this.vy += gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
