import type { BladeSample } from './blade';
import { CONFIG } from './config';

// Three passes: a wide additive glow, a coloured body, then a thin bright core,
// so later segments' glow never paints over earlier segments' core.
export function drawTrail(ctx: CanvasRenderingContext2D, samples: BladeSample[], now: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const pass of ['glow', 'body', 'core'] as const) {
    ctx.globalCompositeOperation = pass === 'glow' ? 'lighter' : 'source-over';
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (a.stroke !== b.stroke) continue;

      const life = 1 - (now - b.t) / CONFIG.blade.trailMs;
      if (life <= 0) continue;
      const hot = b.speed >= CONFIG.blade.minSpeed;
      const width = (hot ? 14 : 5) * life + 1;

      if (pass === 'glow') {
        ctx.strokeStyle = hot ? `rgba(255, 150, 60, ${0.35 * life})` : `rgba(140, 200, 255, ${0.15 * life})`;
        ctx.lineWidth = width * 3;
      } else if (pass === 'body') {
        ctx.strokeStyle = hot ? `rgba(255, 205, 110, ${0.9 * life})` : `rgba(200, 230, 255, ${0.4 * life})`;
        ctx.lineWidth = width;
      } else {
        ctx.strokeStyle = `rgba(255, 255, 255, ${(hot ? 1 : 0.5) * life})`;
        ctx.lineWidth = width * 0.35;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

export function drawFingertip(ctx: CanvasRenderingContext2D, tip: BladeSample, armed: boolean): void {
  const r = armed ? 9 : 6;
  const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, r * 2.2);
  g.addColorStop(0, armed ? 'rgba(255, 230, 160, 0.9)' : 'rgba(220, 240, 255, 0.6)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}
