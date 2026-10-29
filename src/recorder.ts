import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface RecordedFrame {
  t: number; // camera capture time, ms
  lm: number[] | null; // 21 landmarks as [x0, y0, x1, y1, …] in normalized camera coords, or null if no hand
}

export interface Recording {
  version: 1;
  video: { w: number; h: number };
  screen: { w: number; h: number };
  frames: RecordedFrame[];
}

// Captures hand landmarks per camera frame (never pixels) so real play
// sessions can be replayed through the slicing rules in tests.
export class Recorder {
  private frames: RecordedFrame[] = [];
  private startT = 0;
  active = false;

  start(): void {
    this.frames = [];
    this.startT = 0;
    this.active = true;
  }

  push(t: number, hand: NormalizedLandmark[] | null): void {
    if (!this.active) return;
    this.startT ||= t;
    this.frames.push({
      t: Math.round(t - this.startT),
      lm: hand ? hand.flatMap((l) => [Number(l.x.toFixed(4)), Number(l.y.toFixed(4))]) : null,
    });
  }

  stop(video: { w: number; h: number }, screen: { w: number; h: number }): Recording {
    this.active = false;
    return { version: 1, video, screen, frames: this.frames };
  }
}

export function downloadRecording(rec: Recording): void {
  const blob = new Blob([JSON.stringify(rec)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fruitcut-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
