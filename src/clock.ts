// The world is shown in camera time: the video on screen is a few tens of ms
// old, so fruit is simulated and drawn that far behind too. Then the fruit,
// the video and the blade trail all line up, and a hit looks like a hit.
export class GameClock {
  private delay = 40;
  private last = 0;

  /** Record how long a camera frame took from capture to being processed. */
  observe(captureT: number, processedAt: number): void {
    const d = Math.min(Math.max(processedAt - captureT, 0), 150);
    this.delay += (d - this.delay) * 0.1;
  }

  now(): number {
    this.last = Math.max(this.last, performance.now() - this.delay);
    return this.last;
  }
}
