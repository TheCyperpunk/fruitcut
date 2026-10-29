interface Orb {
  x: number; // fractions of the screen
  y: number;
  r: number; // fraction of screen height
  hue: number;
  speed: number;
  phase: number;
}

// The game background: a night-sky gradient with a warm glow, drifting bokeh
// and a vignette. The static part is cached and redrawn only on resize.
export class Backdrop {
  private readonly cache = document.createElement('canvas');
  private readonly orbs: Orb[] = [];
  private pulseColor = '#ffffff';
  private pulseT = -Infinity;

  constructor() {
    for (let i = 0; i < 16; i++) {
      this.orbs.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.03 + Math.random() * 0.07,
        hue: [18, 32, 340, 45, 190][i % 5],
        speed: 0.006 + Math.random() * 0.012,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  resize(width: number, height: number, dpr: number): void {
    this.cache.width = Math.round(width * dpr);
    this.cache.height = Math.round(height * dpr);
    const ctx = this.cache.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0b1026');
    sky.addColorStop(0.55, '#2a1240');
    sky.addColorStop(1, '#5a2340');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const sun = ctx.createRadialGradient(width * 0.78, height * 0.12, 0, width * 0.78, height * 0.12, height * 0.6);
    sun.addColorStop(0, 'rgba(255, 179, 107, 0.45)');
    sun.addColorStop(0.3, 'rgba(255, 120, 90, 0.18)');
    sun.addColorStop(1, 'rgba(255, 120, 90, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, width, height);

    const horizon = ctx.createLinearGradient(0, height * 0.7, 0, height);
    horizon.addColorStop(0, 'rgba(255, 140, 90, 0)');
    horizon.addColorStop(1, 'rgba(255, 140, 90, 0.28)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, height * 0.95);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  /** Briefly tint the whole backdrop, used with the juice colour of a cut fruit. */
  pulse(color: string, t: number): void {
    this.pulseColor = color;
    this.pulseT = t;
  }

  draw(ctx: CanvasRenderingContext2D, t: number, width: number, height: number): void {
    ctx.drawImage(this.cache, 0, 0, width, height);

    const seconds = t / 1000;
    for (const o of this.orbs) {
      const y = ((o.y - seconds * o.speed) % 1 + 1) % 1;
      const x = o.x + Math.sin(seconds * 0.3 + o.phase) * 0.02;
      const r = o.r * height;
      const cx = x * width;
      const cy = y * height;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `hsla(${o.hue}, 90%, 70%, 0.16)`);
      g.addColorStop(0.7, `hsla(${o.hue}, 90%, 65%, 0.06)`);
      g.addColorStop(1, `hsla(${o.hue}, 90%, 65%, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    const pulse = 1 - (t - this.pulseT) / 220;
    if (pulse > 0) {
      ctx.globalAlpha = 0.22 * pulse;
      ctx.fillStyle = this.pulseColor;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }
}
