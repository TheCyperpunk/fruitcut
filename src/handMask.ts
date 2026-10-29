import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { CONFIG } from './config';
import type { PersonSegmenter } from './segmenter';

export type MaskMode = 'hand' | 'person' | 'landmarks' | 'camera';
export const MASK_MODES: MaskMode[] = ['hand', 'person', 'landmarks', 'camera'];

// Mask resolution. 16:9 like most cameras; the frame is stretched into it and
// the mask is stretched back, so the geometry always lines up with the video.
const W = 256;
const H = 144;

const FINGERS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
const PALM = [0, 1, 5, 9, 13, 17];

const supportsFilter =
  typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d', { willReadFrequently: false })!];
}

function blurred(ctx: CanvasRenderingContext2D, px: number, draw: () => void): void {
  if (supportsFilter) ctx.filter = `blur(${px}px)`;
  draw();
  if (supportsFilter) ctx.filter = 'none';
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
}

// Builds a small alpha mask of the player's hand each camera frame. The main
// loop clips the camera image to it, so the hand floats over the game backdrop.
export class HandMask {
  readonly canvas: HTMLCanvasElement;
  readonly aura: HTMLCanvasElement;
  mode: MaskMode;
  segmentMs = 0;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly auraCtx: CanvasRenderingContext2D;
  private readonly source: HTMLCanvasElement;
  private readonly sourceCtx: CanvasRenderingContext2D;
  private readonly conf: HTMLCanvasElement;
  private readonly confCtx: CanvasRenderingContext2D;
  private readonly region: HTMLCanvasElement;
  private readonly regionCtx: CanvasRenderingContext2D;
  private confData: ImageData | null = null;
  private lastLandmarks: NormalizedLandmark[] | null = null;
  private lastLandmarkT = -Infinity;
  private slowSince = 0;

  /** Set later if the player switches to a mode that needs it; loading is lazy. */
  segmenter: PersonSegmenter | null = null;

  constructor() {
    [this.canvas, this.ctx] = makeCanvas(W, H);
    [this.aura, this.auraCtx] = makeCanvas(W, H);
    [this.source, this.sourceCtx] = makeCanvas(W, H);
    [this.conf, this.confCtx] = makeCanvas(W, H);
    [this.region, this.regionCtx] = makeCanvas(W, H);
    this.mode = CONFIG.mask.mode;
  }

  needsSegmenter(mode: MaskMode = this.mode): boolean {
    return mode === 'hand' || mode === 'person';
  }

  cycleMode(): MaskMode {
    this.mode = MASK_MODES[(MASK_MODES.indexOf(this.mode) + 1) % MASK_MODES.length];
    this.slowSince = 0;
    return this.mode;
  }

  update(video: HTMLVideoElement, landmarks: NormalizedLandmark[] | null, t: number, armed: boolean): void {
    if (landmarks) {
      this.lastLandmarks = landmarks;
      this.lastLandmarkT = t;
    }
    const lm = t - this.lastLandmarkT < CONFIG.mask.holdMs ? this.lastLandmarks : null;

    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (this.mode === 'camera') return;

    if (this.needsSegmenter(this.mode) && this.segmenter) {
      this.sourceCtx.drawImage(video, 0, 0, W, H);
      const t0 = performance.now();
      const seg = this.segmenter.segment(this.source, t);
      this.segmentMs += (performance.now() - t0 - this.segmentMs) * 0.1;
      this.checkBudget(t);

      if (seg) {
        this.writeConfidence(seg);
        blurred(ctx, 0.8, () => ctx.drawImage(this.conf, 0, 0, W, H));
      }
      if (this.mode === 'hand') {
        this.drawRegion(lm, 'soft');
        ctx.globalCompositeOperation = 'destination-in';
        blurred(ctx, 4, () => ctx.drawImage(this.region, 0, 0));
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // 'landmarks', or a segmenter mode whose model is still loading.
      this.drawRegion(lm, 'tight');
      blurred(ctx, 1.5, () => ctx.drawImage(this.region, 0, 0));
    }

    this.drawAura(armed);
  }

  // Segmentation that can't keep up would make the hand lag behind the trail;
  // the landmark shape is cruder but always on time.
  private checkBudget(t: number): void {
    if (!CONFIG.mask.auto) return;
    if (this.segmentMs > CONFIG.mask.maxMs) {
      this.slowSince ||= t;
      if (t - this.slowSince > 2000) {
        console.warn(`segmentation averaging ${this.segmentMs.toFixed(0)} ms; switching to landmark hand mask`);
        this.mode = 'landmarks';
      }
    } else {
      this.slowSince = 0;
    }
  }

  private writeConfidence(seg: { data: Float32Array; width: number; height: number }): void {
    if (this.conf.width !== seg.width || this.conf.height !== seg.height) {
      this.conf.width = seg.width;
      this.conf.height = seg.height;
      this.confData = null;
    }
    this.confData ??= this.confCtx.createImageData(seg.width, seg.height);
    const px = this.confData.data;
    const { edgeLow, edgeHigh } = CONFIG.mask;
    for (let i = 0, j = 0; i < seg.data.length; i++, j += 4) {
      px[j] = px[j + 1] = px[j + 2] = 255;
      px[j + 3] = smoothstep(edgeLow, edgeHigh, seg.data[i]) * 255;
    }
    this.confCtx.putImageData(this.confData, 0, 0);
  }

  // 'soft': a generous blob around the hand and some forearm, to gate the
  // person mask. 'tight': an actual hand shape, used when there is no mask.
  private drawRegion(lm: NormalizedLandmark[] | null, style: 'soft' | 'tight'): void {
    const ctx = this.regionCtx;
    ctx.clearRect(0, 0, W, H);
    if (!lm) return;

    const p = lm.map((l) => ({ x: l.x * W, y: l.y * H }));
    const wrist = p[0];
    const hs = Math.max(Math.hypot(p[9].x - wrist.x, p[9].y - wrist.y), 4); // wrist → middle knuckle
    const dx = (wrist.x - p[9].x) / hs;
    const dy = (wrist.y - p[9].y) / hs;

    ctx.fillStyle = ctx.strokeStyle = '#fff';
    ctx.lineCap = ctx.lineJoin = 'round';

    if (style === 'soft') {
      ctx.lineWidth = hs * 2.2;
      ctx.beginPath();
      ctx.moveTo(wrist.x, wrist.y);
      ctx.lineTo(wrist.x + dx * hs * 2.4, wrist.y + dy * hs * 2.4);
      ctx.stroke();
      for (const q of p) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, hs * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    ctx.lineWidth = hs * 1.3;
    ctx.beginPath();
    ctx.moveTo(wrist.x, wrist.y);
    ctx.lineTo(wrist.x + dx * hs * 1.8, wrist.y + dy * hs * 1.8);
    ctx.stroke();

    ctx.beginPath();
    PALM.forEach((i, k) => (k ? ctx.lineTo(p[i].x, p[i].y) : ctx.moveTo(p[i].x, p[i].y)));
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = hs * 0.5;
    ctx.stroke();

    for (const finger of FINGERS) {
      ctx.beginPath();
      finger.forEach((i, k) => (k ? ctx.lineTo(p[i].x, p[i].y) : ctx.moveTo(p[i].x, p[i].y)));
      ctx.stroke();
    }
  }

  private drawAura(armed: boolean): void {
    const ctx = this.auraCtx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    blurred(ctx, 5, () => ctx.drawImage(this.canvas, 0, 0));
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = armed ? '#ffc45c' : '#9fd8ff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
}
