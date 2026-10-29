import * as THREE from 'three';
import type { FruitKind, SkinPattern } from './fruitTypes';

// Fruit art is drawn procedurally on canvases: no image assets to load.
// Skin textures wrap around the fruit: u goes around, v runs bottom → top.
// Each skin comes with a bump map (relief) and a roughness map (where the
// surface is glossy or matte), drawn from the same seeded layout so pits,
// seeds and ridges line up across all three.

const SKIN_W = 1024;
const SKIN_H = 512;
const MAP_W = 512;
const MAP_H = 256;

type Ctx = CanvasRenderingContext2D;

/** Small deterministic generator (mulberry32), so skin and relief agree. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')!];
}

function toTexture(canvas: HTMLCanvasElement, srgb = true): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function disc(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function seedShape(ctx: Ctx, x: number, y: number, len: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(0, 0, len, len * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Soft blotches of `color`. */
function mottle(ctx: Ctx, rnd: () => number, color: string, count: number, rMin: number, rMax: number, alpha: number, W: number, H: number): void {
  for (let i = 0; i < count; i++) {
    const r = rMin + rnd() * (rMax - rMin);
    const x = rnd() * W;
    const y = rnd() * H;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.5 + rnd() * 0.5);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

/** Short strokes in random directions (fuzz, fibres). */
function hairs(ctx: Ctx, rnd: () => number, colors: string[], count: number, length: number, vertical: boolean, W: number, H: number): void {
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const a = vertical ? Math.PI / 2 + (rnd() - 0.5) * 0.8 : rnd() * Math.PI * 2;
    const len = length * (0.5 + rnd());
    ctx.globalAlpha = 0.2 + rnd() * 0.35;
    ctx.strokeStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Grain: fine random dots, for roughness and bump maps. */
function grain(ctx: Ctx, rnd: () => number, count: number, strength: number, W: number, H: number): void {
  for (let i = 0; i < count; i++) {
    const v = Math.round(128 + (rnd() - 0.5) * 2 * strength);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

// ---- shared layouts (used by skin, bump and roughness alike) --------------

interface Dot {
  x: number;
  y: number;
  r: number;
}

/** A jittered lattice of dots, in texture pixels of a W × H map. */
function lattice(rnd: () => number, cols: number, rows: number, jitter: number, W: number, H: number): Dot[] {
  const dots: Dot[] = [];
  const dx = W / cols;
  const dy = H / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      dots.push({
        x: (col + (row % 2 ? 0.5 : 0)) * dx + (rnd() - 0.5) * dx * jitter,
        y: (row + 0.5) * dy + (rnd() - 0.5) * dy * jitter,
        r: Math.min(dx, dy) * 0.5,
      });
    }
  }
  return dots;
}

/** Segments joining nearby points: netting or wrinkle creases. */
function web(rnd: () => number, count: number, links: number, W: number, H: number): [number, number, number, number][] {
  const pts = Array.from({ length: count }, () => [rnd() * W, rnd() * H] as [number, number]);
  const segs: [number, number, number, number][] = [];
  for (const [x, y] of pts) {
    const near = pts
      .map(([px, py]) => ({ px, py, d: Math.hypot(px - x, py - y) }))
      .filter((p) => p.d > 0)
      .sort((a, b) => a.d - b.d)
      .slice(0, links);
    for (const n of near) segs.push([x, y, n.px, n.py]);
  }
  return segs;
}

function drawWeb(ctx: Ctx, segs: [number, number, number, number][], scaleX: number, scaleY: number, wobble: number, rnd: () => number): void {
  for (const [x1, y1, x2, y2] of segs) {
    ctx.beginPath();
    ctx.moveTo(x1 * scaleX, y1 * scaleY);
    const mx = ((x1 + x2) / 2 + (rnd() - 0.5) * wobble) * scaleX;
    const my = ((y1 + y2) / 2 + (rnd() - 0.5) * wobble) * scaleY;
    ctx.quadraticCurveTo(mx, my, x2 * scaleX, y2 * scaleY);
    ctx.stroke();
  }
}

/** The pattern-specific layout, generated once per kind so every map matches. */
function layoutFor(kind: FruitKind): { dots: Dot[]; segs: [number, number, number, number][] } {
  const rnd = seeded(hash(kind.name));
  switch (kind.skinPattern) {
    case 'dots':
      return { dots: lattice(rnd, 26, 15, 0.3, SKIN_W, SKIN_H), segs: [] };
    case 'drupelets': {
      const cols = Math.round(1 / (kind.skinParam ?? 0.08));
      return { dots: lattice(rnd, cols, Math.round(cols / 2), 0.12, SKIN_W, SKIN_H), segs: [] };
    }
    case 'net':
      return { dots: [], segs: web(rnd, 260, 3, SKIN_W, SKIN_H) };
    case 'wrinkled':
      return { dots: [], segs: web(rnd, 140, 2, SKIN_W, SKIN_H) };
    case 'potato':
      return { dots: lattice(rnd, 7, 4, 0.7, SKIN_W, SKIN_H), segs: [] }; // the eyes
    default:
      return { dots: [], segs: [] };
  }
}

const RIBS = 10; // pumpkin grooves around the fruit

/** Pumpkin ribs: a groove at each meridian, a crest between, as one gradient across the map. */
function ribGradient(ctx: Ctx, W: number, groove: string, crest: string): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  for (let i = 0; i <= RIBS; i++) {
    g.addColorStop(Math.min(1, i / RIBS), groove);
    if (i < RIBS) g.addColorStop((i + 0.5) / RIBS, crest);
  }
  return g;
}

/** Base colour with the poles tinted toward `skinEnds`. */
function baseCoat(ctx: Ctx, kind: FruitKind, W: number, H: number): void {
  ctx.fillStyle = kind.skin;
  ctx.fillRect(0, 0, W, H);
  if (!kind.skinEnds) return;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, kind.skinEnds);
  g.addColorStop(0.22, 'rgba(0,0,0,0)');
  g.addColorStop(0.78, 'rgba(0,0,0,0)');
  g.addColorStop(1, kind.skinEnds);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function crease(ctx: Ctx, color: string, W: number, H: number): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 3; pass++) {
    ctx.lineWidth = 14 - pass * 4;
    ctx.globalAlpha = 0.2 + pass * 0.2;
    ctx.beginPath();
    ctx.moveTo(W * 0.3, H * 0.02);
    ctx.quadraticCurveTo(W * 0.31, H * 0.3, W * 0.29, H * 0.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A seamless staggered grid of pointy-top hexagons, `cols` across the map: the pineapple's eyes. */
function hexes(W: number, H: number, cols: number, draw: (cx: number, cy: number, r: number) => void): void {
  const dx = W / cols; // flat-to-flat width
  const r = dx / Math.sqrt(3); // circumradius
  const dy = r * 1.5;
  for (let row = -1; row * dy <= H + r; row++) {
    for (let col = -1; col <= cols; col++) {
      draw((col + (row % 2 ? 0.5 : 0)) * dx + dx / 2, row * dy, r);
    }
  }
}

function hexPath(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Dragon-fruit scales: a teardrop pointing up, base below the centre. */
function scalePath(ctx: Ctx, cx: number, cy: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.6);
  ctx.bezierCurveTo(cx + w * 0.95, cy - h * 0.1, cx + w * 0.8, cy + h * 0.5, cx, cy + h * 0.5);
  ctx.bezierCurveTo(cx - w * 0.8, cy + h * 0.5, cx - w * 0.95, cy - h * 0.1, cx, cy - h * 0.6);
  ctx.closePath();
}

/** Rows of scales, top row first so each lower scale's tip lies over the row above. */
function scaleRows(W: number, H: number, draw: (cx: number, cy: number, w: number, h: number) => void): void {
  const cols = 6;
  const rows = 4;
  const dx = W / cols;
  const dy = H / rows;
  for (let row = -1; row <= rows; row++) {
    for (let col = -1; col <= cols; col++) {
      draw((col + (row % 2 ? 0.5 : 0)) * dx + dx / 2, row * dy + dy * 0.5, dx * 0.62, dy * 1.15);
    }
  }
}

// ---- skin colour ----------------------------------------------------------

export function makeSkinTexture(kind: FruitKind): THREE.Texture {
  const W = SKIN_W;
  const H = SKIN_H;
  const [canvas, ctx] = makeCanvas(W, H);
  const rnd = seeded(hash(kind.name) ^ 0x9e3779b9);
  const { dots, segs } = layoutFor(kind);
  baseCoat(ctx, kind, W, H);

  switch (kind.skinPattern) {
    case 'stripes': {
      // Watermelon: jagged dark stripes over a mottled light-green ground.
      mottle(ctx, rnd, kind.skinDetail, 900, 4, 14, 0.18, W, H);
      mottle(ctx, rnd, '#a9d86a', 400, 6, 20, 0.14, W, H);
      ctx.strokeStyle = kind.skinDetail;
      ctx.lineCap = 'round';
      const stripes = 11;
      for (let i = 0; i < stripes; i++) {
        const u = ((i + 0.5) / stripes) * W;
        const phase = rnd() * Math.PI * 2;
        let prev = { x: u, y: 0 };
        for (let y = 6; y <= H; y += 6) {
          const taper = Math.sin((y / H) * Math.PI);
          const x = u + Math.sin(y * 0.035 + phase) * 16 + (rnd() - 0.5) * 9;
          ctx.lineWidth = (10 + rnd() * 20) * (0.35 + 0.65 * taper);
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(x, y);
          ctx.stroke();
          prev = { x, y };
        }
      }
      mottle(ctx, rnd, '#2f6b2a', 500, 2, 6, 0.4, W, H);
      break;
    }
    case 'speckle': {
      // Citrus, pear, guava: fine pores, faint patches of lighter and darker
      // peel, and a soft wash of the detail colour on each side (the pink of
      // a grapefruit, a pear's russet).
      for (const u of [0.25, 0.75]) {
        const wash = ctx.createRadialGradient(W * u, H * 0.5, 0, W * u, H * 0.5, W * 0.3);
        wash.addColorStop(0, kind.skinDetail);
        wash.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      mottle(ctx, rnd, kind.skinDetail, 300, 10, 40, 0.1, W, H);
      mottle(ctx, rnd, kind.skinEnds ?? kind.skin, 200, 10, 40, 0.14, W, H);
      for (let i = 0; i < 2600; i++) {
        ctx.globalAlpha = 0.1 + rnd() * 0.2;
        ctx.fillStyle = rnd() < 0.5 ? kind.skinDetail : 'rgba(0,0,0,1)';
        disc(ctx, rnd() * W, rnd() * H, 0.8 + rnd() * 1.6);
      }
      break;
    }
    case 'fuzzy': {
      // Kiwi: dense short hairs over a mottled brown.
      mottle(ctx, rnd, '#a0825a', 300, 8, 30, 0.16, W, H);
      mottle(ctx, rnd, kind.skinDetail, 300, 8, 30, 0.16, W, H);
      hairs(ctx, rnd, [kind.skinDetail, '#d9b88a', '#c9a876', '#3d2a14'], 6000, 9, false, W, H);
      hairs(ctx, rnd, ['#2e1e0c', '#e8cfa0'], 1500, 12, false, W, H); // a few long, high-contrast ones that read at a distance
      break;
    }
    case 'shine': {
      // Apple: vertical streaks, a yellow blush toward the base, lenticel dots.
      const blush = ctx.createLinearGradient(0, 0, 0, H);
      blush.addColorStop(0.45, 'rgba(0,0,0,0)');
      blush.addColorStop(1, kind.skinDetail);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = blush;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 260; i++) {
        const x = rnd() * W;
        const w = 2 + rnd() * 9;
        const g = ctx.createLinearGradient(0, 0, 0, H);
        const light = rnd() < 0.45;
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.3 + rnd() * 0.3, light ? kind.skinDetail : '#7a0f1c');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = light ? 0.1 + rnd() * 0.12 : 0.08 + rnd() * 0.14;
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, w, H);
      }
      ctx.fillStyle = '#ffe9b0';
      for (let i = 0; i < 700; i++) {
        ctx.globalAlpha = 0.18 + rnd() * 0.22;
        disc(ctx, rnd() * W, rnd() * H, 0.8 + rnd() * 1.2);
      }
      break;
    }
    case 'bloom': {
      // Plum: dusty pale bloom over dark purple, and a crease down one side.
      mottle(ctx, rnd, kind.skinDetail, 60, 40, 140, 0.16, W, H);
      mottle(ctx, rnd, '#2a0e40', 80, 20, 70, 0.3, W, H);
      crease(ctx, '#2a0e40', W, H);
      break;
    }
    case 'plain': {
      // Cherry, mango, pomegranate, papaya, grapes, persimmon, tomato, eggplant: smooth skin with soft variation.
      mottle(ctx, rnd, kind.skinDetail, 200, 20, 70, 0.14, W, H);
      mottle(ctx, rnd, kind.skinEnds ?? kind.skin, 120, 20, 70, 0.16, W, H);
      for (let i = 0; i < 60; i++) {
        ctx.globalAlpha = 0.04 + rnd() * 0.05;
        ctx.fillStyle = rnd() < 0.5 ? kind.skinDetail : '#000';
        ctx.fillRect(rnd() * W, 0, 3 + rnd() * 10, H);
      }
      break;
    }
    case 'dots': {
      // Strawberry: a lattice of yellow seeds, each sitting in a small pit.
      mottle(ctx, rnd, kind.skinEnds ?? kind.skin, 200, 10, 40, 0.14, W, H);
      for (const d of dots) {
        const pit = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 8);
        pit.addColorStop(0, '#8d1020');
        pit.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = pit;
        ctx.fillRect(d.x - 8, d.y - 8, 16, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = kind.skinDetail;
        seedShape(ctx, d.x, d.y, 3.6, Math.PI / 2 + (rnd() - 0.5) * 0.6);
      }
      break;
    }
    case 'bumpy': {
      // Avocado: pebbled dark skin.
      mottle(ctx, rnd, kind.skinDetail, 250, 15, 60, 0.18, W, H);
      mottle(ctx, rnd, '#6a8a4a', 200, 15, 60, 0.1, W, H);
      for (let i = 0; i < 4000; i++) {
        ctx.globalAlpha = 0.08 + rnd() * 0.14;
        ctx.fillStyle = rnd() < 0.5 ? '#000' : '#9ab07a';
        disc(ctx, rnd() * W, rnd() * H, 1 + rnd() * 2.2);
      }
      break;
    }
    case 'husk': {
      // Coconut: fibres running pole to pole, and the three eyes near the top.
      mottle(ctx, rnd, kind.skinDetail, 200, 15, 60, 0.2, W, H);
      hairs(ctx, rnd, ['#8a6a43', '#2e1c0e', '#a07a4a', kind.skinDetail], 6000, 18, true, W, H);
      for (let i = 0; i < 3; i++) {
        const x = W * 0.5 + (i - 1) * 42;
        const y = H * 0.12 + (i === 1 ? -14 : 8);
        ctx.fillStyle = '#1e120a';
        disc(ctx, x, y, 11);
        ctx.fillStyle = '#3d2816';
        disc(ctx, x - 2, y - 2, 6);
      }
      break;
    }
    case 'banana': {
      // Five facets: the geometry's corners sit at u = k/5, so a dark ridge
      // line goes there with a lit edge beside it. Green stem end, a black
      // blossom scar at the tip, sugar spots in clusters, scuffs on the ridges.
      mottle(ctx, rnd, '#ffe066', 150, 20, 60, 0.16, W, H);
      mottle(ctx, rnd, '#c9a227', 120, 20, 70, 0.12, W, H);
      for (let k = 0; k <= 5; k++) {
        const x = (k / 5) * W; // k = 0 and 5 are the same ridge, drawn at both edges so it wraps
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#6b4e12';
        ctx.fillRect(x - 5, 0, 10, H);
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#fff6b0';
        ctx.fillRect(x + 7, 0, 6, H);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#8a6a1a';
        ctx.fillRect(x - 14, 0, 8, H);
      }
      // The canvas top is the tip of the fruit (v = 1), the bottom its stem.
      const tip = ctx.createLinearGradient(0, 0, 0, H * 0.14);
      tip.addColorStop(0, '#1e1206');
      tip.addColorStop(0.45, 'rgba(60, 36, 12, 0.7)');
      tip.addColorStop(1, 'rgba(60, 36, 12, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = tip;
      ctx.fillRect(0, 0, W, H * 0.14);
      const stemEnd = ctx.createLinearGradient(0, H * 0.9, 0, H);
      stemEnd.addColorStop(0, 'rgba(90, 110, 40, 0)');
      stemEnd.addColorStop(1, 'rgba(70, 80, 30, 0.8)');
      ctx.fillStyle = stemEnd;
      ctx.fillRect(0, H * 0.9, W, H * 0.1);
      for (let i = 0; i < 90; i++) {
        const cx = rnd() * W;
        const cy = H * (0.2 + rnd() * 0.6);
        const n = rnd() < 0.3 ? 4 + Math.floor(rnd() * 5) : 1;
        for (let j = 0; j < n; j++) {
          ctx.globalAlpha = 0.35 + rnd() * 0.45;
          ctx.fillStyle = rnd() < 0.5 ? kind.skinDetail : '#3a2410';
          disc(ctx, cx + (rnd() - 0.5) * 30, cy + (rnd() - 0.5) * 30, 1.5 + rnd() * 3.5);
        }
      }
      ctx.strokeStyle = '#4a3010';
      ctx.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        const x = (Math.floor(rnd() * 5) / 5) * W + (rnd() - 0.5) * 24;
        const y = rnd() * H * 0.8;
        ctx.globalAlpha = 0.15 + rnd() * 0.3;
        ctx.lineWidth = 1 + rnd() * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 6, y + 20 + rnd() * 70);
        ctx.stroke();
      }
      break;
    }
    case 'peach': {
      // Peach, apricot: a red blush over yellow, a crease, and a very fine light fuzz.
      mottle(ctx, rnd, kind.skinDetail, 70, 60, 170, 0.45, W, H);
      mottle(ctx, rnd, '#ffd9a0', 30, 40, 120, 0.15, W, H);
      crease(ctx, '#b8402a', W, H);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff1d6';
      for (let i = 0; i < 2200; i++) {
        const x = rnd() * W;
        const y = rnd() * H;
        const a = rnd() * Math.PI * 2;
        ctx.globalAlpha = 0.06 + rnd() * 0.1; // fuzz is a hint, not a coat
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'scales': {
      // Pineapple: hexagonal eyes, each a plump plate in a dark groove with a
      // withered bract at its centre. Ripening runs from the base up, so the
      // crown end stays green and the base goes orange.
      hexes(W, H, 9, (cx, cy, r) => {
        const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
        g.addColorStop(0, kind.skinDetail);
        g.addColorStop(0.55, kind.skin);
        g.addColorStop(0.85, '#7a4a14');
        g.addColorStop(1, '#3a2408');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        hexPath(ctx, cx, cy, r);
        ctx.fill();
        ctx.fillStyle = '#2e1c08'; // the dried bract, a spike pointing at the crown
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.62);
        ctx.lineTo(cx + r * 0.16, cy + r * 0.05);
        ctx.lineTo(cx - r * 0.16, cy + r * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#8a6a3a';
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.55);
        ctx.lineTo(cx + r * 0.07, cy - r * 0.1);
        ctx.lineTo(cx - r * 0.07, cy - r * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.5; // the lip under it
        ctx.fillStyle = '#4a2c0c';
        ctx.beginPath();
        ctx.ellipse(cx, cy + r * 0.12, r * 0.3, r * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      const ripe = ctx.createLinearGradient(0, 0, 0, H);
      ripe.addColorStop(0, 'rgba(70, 110, 40, 0.55)');
      ripe.addColorStop(0.4, 'rgba(70, 110, 40, 0)');
      ripe.addColorStop(0.7, 'rgba(230, 120, 20, 0)');
      ripe.addColorStop(1, 'rgba(230, 120, 20, 0.35)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = ripe;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'leafy': {
      // Dragon fruit: rows of big soft scales, pink with yellow-green tips,
      // each lying over the base of the one above like shingles.
      scaleRows(W, H, (cx, cy, w, h) => {
        const g = ctx.createLinearGradient(0, cy - h * 0.6, 0, cy + h * 0.5);
        g.addColorStop(0, '#d8e468');
        g.addColorStop(0.14, '#8fc24a');
        g.addColorStop(0.3, kind.skinDetail);
        g.addColorStop(0.7, kind.skin);
        g.addColorStop(1, kind.skinEnds ?? kind.skin);
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        scalePath(ctx, cx, cy, w, h);
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#a8164f';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 0.45; // a pale ridge down the middle of each scale
        ctx.strokeStyle = '#ffd0e6';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy - h * 0.45);
        ctx.lineTo(cx, cy + h * 0.35);
        ctx.stroke();
      });
      break;
    }
    case 'blush': {
      // Mango: yellow-orange with a green shoulder at the stem, a red sun
      // blush on one side, and lenticel freckles.
      mottle(ctx, rnd, '#ffd25a', 120, 30, 90, 0.14, W, H);
      const shoulder = ctx.createLinearGradient(0, 0, 0, H);
      shoulder.addColorStop(0, kind.skinEnds ?? kind.skin);
      shoulder.addColorStop(0.35, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = shoulder;
      ctx.fillRect(0, 0, W, H);
      // One blush on each side (u = ¼ and ¾), so one faces the player however the fruit spins.
      for (const [u, alpha] of [[0.25, 0.75], [0.75, 0.5]]) {
        const blush = ctx.createRadialGradient(W * u, H * 0.42, 0, W * u, H * 0.42, W * 0.28);
        blush.addColorStop(0, kind.skinDetail);
        blush.addColorStop(0.45, kind.skinDetail);
        blush.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = blush;
        ctx.fillRect(0, 0, W, H);
      }
      for (let i = 0; i < 900; i++) {
        ctx.globalAlpha = 0.15 + rnd() * 0.25;
        ctx.fillStyle = rnd() < 0.7 ? '#6b4a1a' : '#fff0b0';
        disc(ctx, rnd() * W, rnd() * H, 0.8 + rnd() * 1.6);
      }
      break;
    }
    case 'net': {
      // Cantaloupe: raised pale webbing over a tan-green ground.
      mottle(ctx, rnd, '#8fa05a', 200, 20, 70, 0.2, W, H);
      mottle(ctx, rnd, kind.skinDetail, 150, 10, 40, 0.1, W, H);
      ctx.strokeStyle = kind.skinDetail;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 5;
      drawWeb(ctx, segs, 1, 1, 18, rnd);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff6dc';
      drawWeb(ctx, segs, 1, 1, 18, seeded(hash(kind.name)));
      break;
    }
    case 'drupelets': {
      // Raspberry, blackberry, lychee: a lattice of rounded bumps.
      for (const d of dots) {
        const g = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r * 1.05);
        g.addColorStop(0, kind.skinDetail);
        g.addColorStop(0.55, kind.skin);
        g.addColorStop(1, kind.skinEnds ?? kind.skin);
        ctx.fillStyle = g;
        disc(ctx, d.x, d.y, d.r * 1.05);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        disc(ctx, d.x - d.r * 0.35, d.y - d.r * 0.35, d.r * 0.18);
      }
      break;
    }
    case 'wrinkled': {
      // Passion fruit: creased, dimpled purple skin.
      mottle(ctx, rnd, '#8a4a9a', 120, 20, 70, 0.14, W, H);
      ctx.strokeStyle = kind.skinDetail;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 7;
      drawWeb(ctx, segs, 1, 1, 30, rnd);
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#c99ad0';
      drawWeb(ctx, segs, 1, 1, 30, seeded(hash(kind.name)));
      break;
    }
    case 'fig': {
      // Fig: purple with pale green lengthwise streaks and a dusty bloom.
      for (let i = 0; i < 220; i++) {
        const x = rnd() * W;
        ctx.globalAlpha = 0.06 + rnd() * 0.12;
        ctx.fillStyle = rnd() < 0.6 ? kind.skinDetail : '#2a0e30';
        ctx.fillRect(x, 0, 2 + rnd() * 7, H);
      }
      mottle(ctx, rnd, '#c9b8d8', 50, 40, 120, 0.14, W, H);
      break;
    }
    case 'ribs': {
      // Pumpkin: dark grooves running pole to pole, waxy crests between, a few scuffs.
      mottle(ctx, rnd, kind.skinDetail, 200, 15, 60, 0.12, W, H);
      mottle(ctx, rnd, '#ffb36a', 150, 15, 60, 0.12, W, H);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = ribGradient(ctx, W, kind.skinDetail, 'rgba(0,0,0,0)');
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = ribGradient(ctx, W, 'rgba(0,0,0,0)', '#ffd08a');
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 900; i++) {
        ctx.globalAlpha = 0.08 + rnd() * 0.15;
        ctx.fillStyle = rnd() < 0.6 ? '#7a3208' : '#ffe0a0';
        disc(ctx, rnd() * W, rnd() * H, 1 + rnd() * 2.5);
      }
      break;
    }
    case 'potato': {
      // Potato: dusty brown with darker and sandy patches, freckles, and sunken eyes.
      mottle(ctx, rnd, kind.skinDetail, 260, 20, 80, 0.18, W, H);
      mottle(ctx, rnd, '#d9b584', 220, 20, 80, 0.16, W, H);
      mottle(ctx, rnd, '#8a6238', 300, 6, 24, 0.2, W, H);
      for (let i = 0; i < 2200; i++) {
        ctx.globalAlpha = 0.1 + rnd() * 0.2;
        ctx.fillStyle = rnd() < 0.6 ? '#4a2e18' : '#e8cfa6';
        disc(ctx, rnd() * W, rnd() * H, 0.8 + rnd() * 2);
      }
      for (const d of dots) {
        const eye = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 11);
        eye.addColorStop(0, '#3a2210');
        eye.addColorStop(0.5, 'rgba(58, 34, 16, 0.6)');
        eye.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = eye;
        disc(ctx, d.x, d.y, 11);
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#e0c094'; // the lit rim of the hollow
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 8, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

// ---- relief and gloss -----------------------------------------------------

export interface Surface {
  bump: THREE.Texture | null;
  bumpScale: number;
  roughness: THREE.Texture | null; // multiplied by `baseRoughness`
  baseRoughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenColor: string;
  envMapIntensity: number;
}

const GLOSSY: SkinPattern[] = ['shine', 'stripes', 'bloom', 'plain', 'fig', 'bumpy', 'blush'];

/** Bump and roughness maps plus material settings for a skin. */
export function makeSurface(kind: FruitKind): Surface {
  const pattern = kind.skinPattern;
  const rnd = seeded(hash(kind.name) ^ 0x51ed270b);
  const { dots, segs } = layoutFor(kind);
  const sx = MAP_W / SKIN_W;
  const sy = MAP_H / SKIN_H;

  const [bumpCanvas, b] = makeCanvas(MAP_W, MAP_H);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, MAP_W, MAP_H);
  let bumpScale = 1.2;

  switch (pattern) {
    case 'speckle':
    case 'bumpy':
      for (let i = 0; i < 2600; i++) {
        const r = 1.5 + rnd() * 2.5;
        const g = b.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, pattern === 'bumpy' ? '#b0b0b0' : '#404040');
        g.addColorStop(1, '#808080');
        b.save();
        b.translate(rnd() * MAP_W, rnd() * MAP_H);
        b.fillStyle = g;
        disc(b, 0, 0, r);
        b.restore();
      }
      bumpScale = 2;
      break;
    case 'fuzzy':
    case 'husk':
    case 'peach':
      grain(b, rnd, pattern === 'peach' ? 9000 : 16000, pattern === 'peach' ? 30 : 60, MAP_W, MAP_H);
      bumpScale = pattern === 'peach' ? 0.6 : 1.2;
      break;
    case 'stripes':
      grain(b, rnd, 6000, 22, MAP_W, MAP_H);
      bumpScale = 0.5;
      break;
    case 'shine':
      for (let i = 0; i < 500; i++) {
        b.fillStyle = '#5a5a5a';
        disc(b, rnd() * MAP_W, rnd() * MAP_H, 0.8 + rnd());
      }
      bumpScale = 0.6;
      break;
    case 'dots':
      for (const d of dots) {
        const g = b.createRadialGradient(d.x * sx, d.y * sy, 0, d.x * sx, d.y * sy, 5);
        g.addColorStop(0, '#303030');
        g.addColorStop(1, '#808080');
        b.fillStyle = g;
        disc(b, d.x * sx, d.y * sy, 5);
      }
      bumpScale = 2.5;
      break;
    case 'drupelets':
      for (const d of dots) {
        const r = d.r * sx;
        const g = b.createRadialGradient(d.x * sx, d.y * sy, 0, d.x * sx, d.y * sy, r);
        g.addColorStop(0, '#e0e0e0');
        g.addColorStop(0.8, '#808080');
        g.addColorStop(1, '#505050');
        b.fillStyle = g;
        disc(b, d.x * sx, d.y * sy, r);
      }
      bumpScale = 3;
      break;
    case 'scales':
      hexes(MAP_W, MAP_H, 9, (cx, cy, r) => {
        const g = b.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, '#d8d8d8');
        g.addColorStop(0.6, '#a0a0a0');
        g.addColorStop(1, '#202020');
        b.fillStyle = g;
        hexPath(b, cx, cy, r);
        b.fill();
        b.fillStyle = '#404040'; // the bract sits in a small dip
        disc(b, cx, cy - r * 0.15, r * 0.14);
      });
      bumpScale = 5;
      break;
    case 'leafy':
      scaleRows(MAP_W, MAP_H, (cx, cy, w, h) => {
        const g = b.createLinearGradient(cx - w, 0, cx + w, 0);
        g.addColorStop(0, '#303030');
        g.addColorStop(0.5, '#d0d0d0');
        g.addColorStop(1, '#303030');
        b.fillStyle = g;
        scalePath(b, cx, cy, w, h);
        b.fill();
      });
      bumpScale = 4;
      break;
    case 'banana':
      for (let k = 0; k <= 5; k++) {
        const x = (k / 5) * MAP_W; // on the geometry's corners
        const g = b.createLinearGradient(x - 10, 0, x + 10, 0);
        g.addColorStop(0, '#808080');
        g.addColorStop(0.5, '#a8a8a8');
        g.addColorStop(1, '#808080');
        b.fillStyle = g;
        b.fillRect(x - 10, 0, 20, MAP_H);
      }
      grain(b, rnd, 3000, 16, MAP_W, MAP_H);
      bumpScale = 1.2;
      break;
    case 'net':
      b.strokeStyle = '#d8d8d8';
      b.lineCap = 'round';
      b.lineWidth = 3;
      drawWeb(b, segs, sx, sy, 18, seeded(hash(kind.name) ^ 7));
      bumpScale = 3;
      break;
    case 'wrinkled':
      b.strokeStyle = '#303030';
      b.lineCap = 'round';
      b.lineWidth = 4;
      drawWeb(b, segs, sx, sy, 30, seeded(hash(kind.name) ^ 7));
      bumpScale = 3;
      break;
    case 'bloom':
    case 'plain':
    case 'fig':
    case 'blush':
      grain(b, rnd, 2000, 10, MAP_W, MAP_H);
      bumpScale = 0.3;
      break;
    case 'ribs':
      b.fillStyle = ribGradient(b, MAP_W, '#383838', '#c8c8c8');
      b.fillRect(0, 0, MAP_W, MAP_H);
      grain(b, rnd, 2500, 14, MAP_W, MAP_H);
      bumpScale = 4;
      break;
    case 'potato':
      grain(b, rnd, 14000, 50, MAP_W, MAP_H);
      for (const d of dots) {
        const g = b.createRadialGradient(d.x * sx, d.y * sy, 0, d.x * sx, d.y * sy, 6);
        g.addColorStop(0, '#202020');
        g.addColorStop(1, '#808080');
        b.fillStyle = g;
        disc(b, d.x * sx, d.y * sy, 6);
      }
      bumpScale = 2.2;
      break;
  }

  // Roughness: glossy skins vary a little, matte ones more; fuzz is matte all over.
  const [roughCanvas, r] = makeCanvas(MAP_W, MAP_H);
  r.fillStyle = '#ffffff';
  r.fillRect(0, 0, MAP_W, MAP_H);
  const roughRnd = seeded(hash(kind.name) ^ 0x1234567);
  mottle(r, roughRnd, '#a0a0a0', 160, 10, 50, 0.6, MAP_W, MAP_H);
  grain(r, roughRnd, 3000, 40, MAP_W, MAP_H);
  if (pattern === 'speckle') {
    // Citrus pores are duller than the waxy peel between them.
    for (let i = 0; i < 1500; i++) {
      r.fillStyle = '#ffffff';
      disc(r, roughRnd() * MAP_W, roughRnd() * MAP_H, 1 + roughRnd() * 2);
    }
  }
  if (pattern === 'scales') {
    // Pineapple plates are waxy; the grooves between them are dry.
    hexes(MAP_W, MAP_H, 9, (cx, cy, rad) => {
      r.fillStyle = '#8c8c8c';
      hexPath(r, cx, cy, rad * 0.8);
      r.fill();
    });
  }

  const fuzzy = pattern === 'fuzzy' || pattern === 'peach' || pattern === 'husk' || pattern === 'potato';
  const glossy = GLOSSY.includes(pattern);
  const waxy = pattern === 'drupelets' || pattern === 'scales' || pattern === 'ribs' || pattern === 'leafy';
  return {
    bump: toTexture(bumpCanvas, false),
    bumpScale,
    roughness: toTexture(roughCanvas, false),
    baseRoughness: fuzzy ? 0.95 : glossy ? 0.42 : pattern === 'speckle' || pattern === 'ribs' || pattern === 'leafy' ? 0.5 : 0.6,
    // Partial clearcoat: a full coat gives the hard white spots of a plastic toy.
    clearcoat: glossy ? 0.6 : waxy ? 0.45 : 0,
    clearcoatRoughness: pattern === 'bloom' || pattern === 'fig' ? 0.5 : pattern === 'ribs' ? 0.35 : 0.25,
    sheen: pattern === 'peach' ? 0.35 : pattern === 'fuzzy' ? 0.6 : pattern === 'bloom' || (pattern === 'plain' && kind.name === 'grapes') ? 0.4 : 0,
    sheenColor: pattern === 'fuzzy' ? '#c9a876' : pattern === 'peach' ? '#ffcf8a' : '#fff1d6',
    envMapIntensity: fuzzy ? 0.25 : 0.45,
  };
}

// ---- cut faces ------------------------------------------------------------

/** Texture for the flat cut face of a half (a disc filling the square). */
export function makeFleshTexture(kind: FruitKind): THREE.Texture {
  const S = 512;
  const c = S / 2;
  const [canvas, ctx] = makeCanvas(S, S);
  const rnd = seeded(hash(kind.name) ^ 0xabcdef);

  ctx.fillStyle = kind.skin;
  disc(ctx, c, c, c);
  ctx.fillStyle = kind.rind;
  disc(ctx, c, c, c * 0.96);

  const fleshR = c * (1 - kind.rindWidth);
  ctx.fillStyle = kind.flesh;
  disc(ctx, c, c, fleshR);
  const glow = ctx.createRadialGradient(c, c, 0, c, c, fleshR);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
  glow.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  disc(ctx, c, c, fleshR);

  switch (kind.fleshPattern) {
    case 'seeds':
      ctx.fillStyle = kind.fleshDetail;
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2;
        const r = fleshR * (0.35 + rnd() * 0.35);
        seedShape(ctx, c + Math.cos(a) * r, c + Math.sin(a) * r, 9, a);
      }
      break;
    case 'segments': {
      const segments = 10;
      ctx.strokeStyle = kind.fleshDetail;
      ctx.lineWidth = 5;
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.cos(a) * fleshR * 0.97, c + Math.sin(a) * fleshR * 0.97);
        ctx.stroke();
      }
      ctx.fillStyle = kind.fleshDetail;
      for (let i = 0; i < 260; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * fleshR * 0.92;
        ctx.globalAlpha = 0.35;
        seedShape(ctx, c + Math.cos(a) * r, c + Math.sin(a) * r, 5, a);
      }
      ctx.globalAlpha = 1;
      disc(ctx, c, c, fleshR * 0.1);
      break;
    }
    case 'core': {
      ctx.fillStyle = '#f2dfa6';
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = fleshR * (i % 2 === 0 ? 0.32 : 0.16);
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.fill();
      ctx.fillStyle = kind.fleshDetail;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        seedShape(ctx, c + Math.cos(a) * fleshR * 0.2, c + Math.sin(a) * fleshR * 0.2, 12, a);
      }
      break;
    }
    case 'kiwi': {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * fleshR * 0.3, c + Math.sin(a) * fleshR * 0.3);
        ctx.lineTo(c + Math.cos(a) * fleshR * 0.95, c + Math.sin(a) * fleshR * 0.95);
        ctx.stroke();
      }
      ctx.fillStyle = kind.fleshDetail;
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2;
        const r = fleshR * (0.27 + rnd() * 0.12);
        seedShape(ctx, c + Math.cos(a) * r, c + Math.sin(a) * r, 6, a);
      }
      ctx.fillStyle = '#f4f9e4';
      disc(ctx, c, c, fleshR * 0.2);
      break;
    }
    case 'hollow': {
      // Coconut, raspberry: a band of flesh around an open centre.
      ctx.fillStyle = kind.fleshDetail;
      disc(ctx, c, c, fleshR * 0.55);
      const sheen = ctx.createRadialGradient(c - fleshR * 0.15, c - fleshR * 0.15, 0, c, c, fleshR * 0.55);
      sheen.addColorStop(0, 'rgba(255,255,255,0.25)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      disc(ctx, c, c, fleshR * 0.55);
      break;
    }
    case 'arils': {
      // Pomegranate: packed ruby seeds in white membrane.
      ctx.fillStyle = kind.flesh;
      disc(ctx, c, c, fleshR);
      const step = fleshR * 0.2;
      for (let y = c - fleshR; y <= c + fleshR; y += step) {
        for (let x = c - fleshR; x <= c + fleshR; x += step) {
          const px = x + (rnd() - 0.5) * step * 0.5;
          const py = y + (rnd() - 0.5) * step * 0.5;
          if (Math.hypot(px - c, py - c) > fleshR * 0.92) continue;
          const r = step * (0.36 + rnd() * 0.12);
          const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r);
          g.addColorStop(0, '#ff6a7e');
          g.addColorStop(0.5, kind.fleshDetail);
          g.addColorStop(1, '#8e0f2a');
          ctx.fillStyle = g;
          disc(ctx, px, py, r);
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          disc(ctx, px - r * 0.35, py - r * 0.35, r * 0.2);
        }
      }
      break;
    }
    case 'pit': {
      // Peach, apricot, cherry, lychee, avocado: flesh around a central stone.
      const pitR = fleshR * (kind.fleshParam ?? 0.3);
      const halo = ctx.createRadialGradient(c, c, pitR, c, c, pitR * 1.6);
      halo.addColorStop(0, 'rgba(255, 240, 200, 0.5)');
      halo.addColorStop(1, 'rgba(255, 240, 200, 0)');
      ctx.fillStyle = halo;
      disc(ctx, c, c, pitR * 1.6);
      const pit = ctx.createRadialGradient(c - pitR * 0.3, c - pitR * 0.3, 0, c, c, pitR);
      pit.addColorStop(0, '#b07a4a');
      pit.addColorStop(1, kind.fleshDetail);
      ctx.fillStyle = pit;
      disc(ctx, c, c, pitR);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(c, c, pitR * (0.3 + i * 0.1), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'speckled': {
      // Dragon fruit, fig, guava: small seeds scattered through the flesh.
      ctx.fillStyle = kind.fleshDetail;
      for (let i = 0; i < 420; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * fleshR * 0.95;
        disc(ctx, c + Math.cos(a) * r, c + Math.sin(a) * r, 2 + rnd() * 1.5);
      }
      break;
    }
    case 'seedcavity': {
      // Papaya, cantaloupe, passion fruit, pumpkin: a central cavity full of seeds.
      const cavR = fleshR * (kind.fleshParam ?? 0.4);
      ctx.fillStyle = kind.fleshDetail;
      disc(ctx, c, c, cavR);
      const seed = kind.seed ?? '#1a120c';
      for (let i = 0; i < Math.round(cavR * 1.2); i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * cavR * 0.92;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        ctx.fillStyle = seed;
        seedShape(ctx, x, y, kind.seed ? 8 : 6, rnd() * Math.PI);
        ctx.fillStyle = kind.seed ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.4)';
        disc(ctx, x - 1.5, y - 1.5, 1.4);
      }
      break;
    }
    case 'locules': {
      // Tomato: chambers of pale jelly and seeds around a firm core, thick walls between.
      const chambers = 5;
      const seed = kind.seed ?? '#f7e6a6';
      for (let i = 0; i < chambers; i++) {
        const a0 = (i / chambers) * Math.PI * 2 + 0.2;
        const a1 = a0 + (Math.PI * 2) / chambers - 0.32;
        ctx.fillStyle = '#ff9a86';
        ctx.beginPath();
        ctx.arc(c, c, fleshR * 0.84, a0, a1);
        ctx.arc(c, c, fleshR * 0.36, a1, a0, true);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = seed;
        for (let s = 0; s < 16; s++) {
          const a = a0 + rnd() * (a1 - a0);
          const r = fleshR * (0.42 + rnd() * 0.36);
          seedShape(ctx, c + Math.cos(a) * r, c + Math.sin(a) * r, 7, a);
        }
      }
      ctx.fillStyle = kind.fleshDetail;
      disc(ctx, c, c, fleshR * 0.3);
      break;
    }
    case 'solid': {
      // Banana, mango, strawberry, pineapple, persimmon, grapes: a paler core and faint growth rings.
      const core = ctx.createRadialGradient(c, c, 0, c, c, fleshR * 0.45);
      core.addColorStop(0, kind.fleshDetail);
      core.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = core;
      disc(ctx, c, c, fleshR * 0.45);
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 2;
      for (let r = 0.2; r < 0.95; r += 0.12) {
        ctx.beginPath();
        ctx.arc(c, c, fleshR * r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
  }
  return toTexture(canvas);
}
