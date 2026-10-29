import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// MediaPipe's HAND_CONNECTIONS, copied so this overlay doesn't pull the
// tracking library into the title page.
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
  [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
import type { CoverMapper } from './view';

export function drawLandmarks(ctx: CanvasRenderingContext2D, hand: NormalizedLandmark[], mapper: CoverMapper): void {
  const pts = hand.map((l) => mapper.toScreen(l.x, l.y));

  ctx.strokeStyle = 'rgba(120, 255, 180, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [start, end] of HAND_CONNECTIONS) {
    ctx.moveTo(pts[start].x, pts[start].y);
    ctx.lineTo(pts[end].x, pts[end].y);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(120, 255, 180, 0.9)';
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Rolling stats for the debug panel. Latency is camera capture → frame drawn,
// which excludes display scan-out but includes inference and drawing.
export class Stats {
  private frameTimes: number[] = [];
  private inferenceMs = 0;
  private latencyMs = 0;
  speed = 0;
  minSpeed = 0;
  fingers = 1;
  hand = false;
  fist = false;
  segmentMs = 0;
  maskMode = '';

  frame(captureT: number, inferenceMs: number, drawnAt: number): void {
    this.frameTimes.push(captureT);
    while (this.frameTimes.length && this.frameTimes[0] < captureT - 1000) this.frameTimes.shift();
    this.inferenceMs += (inferenceMs - this.inferenceMs) * 0.1;
    this.latencyMs += (drawnAt - captureT - this.latencyMs) * 0.1;
  }

  text(delegate: string, video: HTMLVideoElement): string {
    const seg = this.maskMode === 'hand' || this.maskMode === 'person' ? `  ${this.segmentMs.toFixed(1)} ms` : '';
    return [
      `camera     ${video.videoWidth}×${video.videoHeight} @ ${this.frameTimes.length} fps`,
      `tracking   ${delegate}  ${this.inferenceMs.toFixed(1)} ms`,
      `view       ${this.maskMode}${seg}   [M] to change`,
      `latency    ${this.latencyMs.toFixed(0)} ms (capture → drawn)`,
      `hand       ${this.hand ? (this.fist ? 'fist' : 'yes') : 'no'}   blades: ${this.fingers} finger${this.fingers > 1 ? 's' : ''}`,
      `speed      ${this.speed.toFixed(2)} screens/s  (slice ≥ ${this.minSpeed.toFixed(2)})`,
      `[R] record hand movement for replay tests`,
    ].join('\n');
  }
}
