// Maps the camera image onto the screen like CSS `object-fit: cover`, mirrored
// so the player sees themselves as in a mirror.
export class CoverMapper {
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private vw = 1;
  private vh = 1;
  private w = 1;

  update(videoW: number, videoH: number, screenW: number, screenH: number): void {
    this.vw = videoW;
    this.vh = videoH;
    this.w = screenW;
    this.scale = Math.max(screenW / videoW, screenH / videoH);
    this.ox = (screenW - videoW * this.scale) / 2;
    this.oy = (screenH - videoH * this.scale) / 2;
  }

  /** Normalized landmark in camera space → mirrored screen CSS px. */
  toScreen(nx: number, ny: number): { x: number; y: number } {
    return {
      x: this.w - (nx * this.vw * this.scale + this.ox),
      y: ny * this.vh * this.scale + this.oy,
    };
  }

  /** Draw the video, or anything that depicts the same frame, into the mirrored cover rect. */
  drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, dpr: number): void {
    ctx.setTransform(-dpr, 0, 0, dpr, this.w * dpr, 0);
    ctx.drawImage(image, this.ox, this.oy, this.vw * this.scale, this.vh * this.scale);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
