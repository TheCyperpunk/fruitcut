// 1€ filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass filter whose cutoff
// rises with speed, so a resting hand is smoothed and a fast swipe passes through.

export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

function smoothingFactor(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private tSec = 0;

  constructor(private readonly params: OneEuroParams) {}

  reset(): void {
    this.x = null;
    this.dx = 0;
  }

  filter(value: number, tSec: number): number {
    if (this.x === null) {
      this.x = value;
      this.tSec = tSec;
      return value;
    }
    const dt = tSec - this.tSec;
    if (dt <= 0) return this.x;
    this.tSec = tSec;

    const { minCutoff, beta, dCutoff } = this.params;
    const aD = smoothingFactor(dCutoff, dt);
    this.dx = aD * ((value - this.x) / dt) + (1 - aD) * this.dx;

    const a = smoothingFactor(minCutoff + beta * Math.abs(this.dx), dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }
}

export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(params: OneEuroParams) {
    this.fx = new OneEuroFilter(params);
    this.fy = new OneEuroFilter(params);
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }

  filter(x: number, y: number, tSec: number): { x: number; y: number } {
    return { x: this.fx.filter(x, tSec), y: this.fy.filter(y, tSec) };
  }
}
