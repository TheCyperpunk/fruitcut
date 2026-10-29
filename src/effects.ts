import type { Vec2 } from './fruit';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  born: number;
  life: number;
  color: string;
  kind: 'drop' | 'chunk' | 'spark' | 'smoke';
  spin: number;
}

interface Stain {
  blobs: { x: number; y: number; r: number }[];
  born: number;
  color: string;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  born: number;
  big: boolean;
}

interface Slash {
  a: Vec2;
  b: Vec2;
  born: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  born: number;
  color: string;
}

const STAIN_MS = 2500;
const POPUP_MS = 900;
const SLASH_MS = 170;
const RING_MS = 260;
const FLASH_MS = 220;

// 2D canvas effects. Stains draw on the backdrop layer below the fruit; juice,
// slashes, rings, popups and the combo flash draw above it.
export class Effects {
  reducedMotion = false; // fewer particles, no full-screen flashes
  private particles: Particle[] = [];
  private stains: Stain[] = [];
  private popups: Popup[] = [];
  private slashes: Slash[] = [];
  private rings: Ring[] = [];
  private flashT = -Infinity;
  private flashColor = '#ffffff';

  private count(n: number): number {
    return this.reducedMotion ? Math.ceil(n * 0.4) : n;
  }

  slice(at: Vec2, radius: number, dir: Vec2, normal: Vec2, color: string, fleshColor: string, now: number, scale: number): void {
    // Droplets spray sideways from the cut, carried along the swipe.
    for (let i = 0; i < this.count(30); i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const speed = scale * (0.3 + Math.random() * 1.1);
      const spread = (Math.random() - 0.5) * 1.4;
      this.particles.push({
        x: at.x + (Math.random() - 0.5) * radius,
        y: at.y + (Math.random() - 0.5) * radius,
        vx: (normal.x * side + dir.x * (0.6 + spread)) * speed,
        vy: (normal.y * side + dir.y * (0.6 + spread)) * speed - scale * 0.25,
        r: radius * (0.035 + Math.random() * 0.08),
        born: now,
        life: 450 + Math.random() * 450,
        color,
        kind: 'drop',
        spin: 0,
      });
    }
    // A few chunks of flesh tumble out more slowly.
    for (let i = 0; i < this.count(7); i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = scale * (0.15 + Math.random() * 0.45);
      this.particles.push({
        x: at.x + (Math.random() - 0.5) * radius * 0.6,
        y: at.y + (Math.random() - 0.5) * radius * 0.6,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - scale * 0.3,
        r: radius * (0.08 + Math.random() * 0.1),
        born: now,
        life: 600 + Math.random() * 400,
        color: fleshColor,
        kind: 'chunk',
        spin: (Math.random() - 0.5) * 12,
      });
    }

    // One solid splat plus droplets thrown along the swipe.
    const blobs = [{ x: at.x, y: at.y, r: radius * 0.45 }];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.3 + Math.random() * 1.1);
      const along = (Math.random() - 0.5) * radius * 2.4;
      blobs.push({
        x: at.x + Math.cos(a) * d * 0.5 + dir.x * along,
        y: at.y + Math.sin(a) * d * 0.5 + dir.y * along,
        r: radius * (0.05 + Math.random() * 0.14),
      });
    }
    this.stains.push({ blobs, born: now, color });

    const reach = radius * 1.6;
    this.slashes.push({
      a: { x: at.x - dir.x * reach, y: at.y - dir.y * reach },
      b: { x: at.x + dir.x * reach, y: at.y + dir.y * reach },
      born: now,
    });
    this.rings.push({ x: at.x, y: at.y, r: radius, born: now, color });
  }

  /** A cut bomb: smoke, sparks, a double shockwave and a scorch mark. */
  explode(at: Vec2, radius: number, now: number, scale: number): void {
    for (let i = 0; i < this.count(18); i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = scale * (0.05 + Math.random() * 0.3);
      this.particles.push({
        x: at.x + (Math.random() - 0.5) * radius,
        y: at.y + (Math.random() - 0.5) * radius,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - scale * 0.08,
        r: radius * (0.25 + Math.random() * 0.3),
        born: now,
        life: 700 + Math.random() * 400,
        color: `hsl(240, 8%, ${18 + Math.random() * 22}%)`,
        kind: 'smoke',
        spin: 0,
      });
    }
    for (let i = 0; i < this.count(26); i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = scale * (0.5 + Math.random() * 1.4);
      this.particles.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 2 + Math.random() * 3,
        born: now,
        life: 250 + Math.random() * 300,
        color: Math.random() < 0.5 ? '#ffb347' : '#ff6a1a',
        kind: 'spark',
        spin: 0,
      });
    }
    this.rings.push({ x: at.x, y: at.y, r: radius * 1.2, born: now, color: '#ff8a3c' });
    this.rings.push({ x: at.x, y: at.y, r: radius * 2, born: now + 60, color: '#ffd089' });

    const blobs = [{ x: at.x, y: at.y, r: radius * 0.9 }];
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.6 + Math.random() * 0.8);
      blobs.push({ x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d, r: radius * (0.15 + Math.random() * 0.3) });
    }
    this.stains.push({ blobs, born: now, color: '#15151c' });
  }

  /** Small bright motes left behind a fast-moving fingertip. */
  sparkle(at: Vec2, now: number, scale: number): void {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = scale * (0.05 + Math.random() * 0.2);
      this.particles.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 1.5 + Math.random() * 2,
        born: now,
        life: 200 + Math.random() * 200,
        color: '#fff2c4',
        kind: 'spark',
        spin: 0,
      });
    }
  }

  popup(at: Vec2, text: string, now: number, big = false): void {
    this.popups.push({ x: at.x, y: at.y, text, born: now, big });
  }

  flash(color: string, now: number): void {
    if (this.reducedMotion) return;
    this.flashColor = color;
    this.flashT = now;
  }

  update(dt: number, gravity: number, now: number): void {
    for (const p of this.particles) {
      if (p.kind === 'drop' || p.kind === 'chunk') p.vy += gravity * dt;
      if (p.kind === 'smoke') {
        p.vx *= 1 - 1.5 * dt; // smoke slows and hangs
        p.vy *= 1 - 1.5 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => now - p.born < p.life);
    this.stains = this.stains.filter((s) => now - s.born < STAIN_MS);
    this.popups = this.popups.filter((p) => now - p.born < POPUP_MS);
    this.slashes = this.slashes.filter((s) => now - s.born < SLASH_MS);
    this.rings = this.rings.filter((r) => now - r.born < RING_MS);
  }

  drawStains(ctx: CanvasRenderingContext2D, now: number): void {
    for (const s of this.stains) {
      ctx.globalAlpha = 0.6 * (1 - (now - s.born) / STAIN_MS);
      ctx.fillStyle = s.color;
      for (const b of s.blobs) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFx(ctx: CanvasRenderingContext2D, now: number, width: number, height: number): void {
    for (const p of this.particles) {
      const k = 1 - (now - p.born) / p.life;
      ctx.globalAlpha = p.kind === 'spark' ? k : Math.min(1, k * 1.6);
      ctx.fillStyle = p.color;
      if (p.kind === 'drop') {
        // Stretch each droplet along its velocity so fast juice reads as streaks.
        const speed = Math.hypot(p.vx, p.vy);
        const stretch = 1 + Math.min(speed / 600, 2.5);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * stretch, p.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'chunk') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin * ((now - p.born) / 1000));
        ctx.fillRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4);
        ctx.restore();
      } else if (p.kind === 'smoke') {
        ctx.globalAlpha = 0.7 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.6 + 1.4 * (1 - k)), 0, Math.PI * 2); // puffs grow as they fade
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.lineCap = 'round';
    for (const r of this.rings) {
      const k = (now - r.born) / RING_MS;
      if (k < 0) continue; // scheduled slightly later
      ctx.globalAlpha = 0.9 * (1 - k);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.6 + 1.8 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const s of this.slashes) {
      const k = 1 - (now - s.born) / SLASH_MS;
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 + 6 * k;
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
    }

    const flash = 1 - (now - this.flashT) / FLASH_MS;
    if (flash > 0) {
      const g = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, height * 0.8);
      g.addColorStop(0, this.flashColor);
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.globalAlpha = 0.35 * flash;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      const k = (now - p.born) / POPUP_MS;
      const pop = 1 + 0.5 * Math.max(0, 1 - k / 0.14); // lands big, settles fast
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `900 ${(p.big ? 40 : 30) * pop}px system-ui, sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(20, 8, 30, 0.85)';
      ctx.fillStyle = p.big ? '#ffc45c' : '#ffffff';
      const y = p.y - k * 50;
      ctx.strokeText(p.text, p.x, y);
      ctx.fillText(p.text, p.x, y);
    }
    ctx.globalAlpha = 1;
  }
}
