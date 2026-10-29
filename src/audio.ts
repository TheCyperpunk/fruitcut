// All sounds are synthesized with Web Audio, so there are no files to load and
// a slice sound can start on the same frame as the cut.
export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Must be called from a user gesture (the Start button) so audio may play. */
  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
      if (!this.master) {
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.6;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
    } catch {
      this.ctx = null; // no audio support; the game still works silently
    }
  }

  /** The unlocked context, for the music to share; null before `unlock` or without audio. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  slice(combo: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Swish: a band of noise sweeping down.
    const swish = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(4200, t);
    band.frequency.exponentialRampToValueAtTime(900, t + 0.14);
    swish.connect(band).connect(this.envelope(t, 0.005, 0.16, 0.9));
    swish.start(t);
    swish.stop(t + 0.2);

    // Squelch: a short falling thump, a little higher on combos.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const pitch = 1 + Math.min(combo - 1, 5) * 0.08;
    thump.frequency.setValueAtTime(220 * pitch, t);
    thump.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    thump.connect(this.envelope(t, 0.002, 0.13, 0.7));
    thump.start(t);
    thump.stop(t + 0.15);

    if (combo >= 3) this.notes([660, 880, 1100].slice(0, Math.min(combo - 1, 3)), 0.05, 0.25);
  }

  /** A cut bomb: a low boom with a rumbling tail. */
  bomb(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;

    const boom = this.noiseSource();
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(1800, t);
    low.frequency.exponentialRampToValueAtTime(120, t + 0.45);
    boom.connect(low).connect(this.envelope(t, 0.005, 0.55, 1));
    boom.start(t);
    boom.stop(t + 0.7);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.4);
    sub.connect(this.envelope(t, 0.005, 0.45, 0.9));
    sub.start(t);
    sub.stop(t + 0.5);
  }

  /** A quiet hiss when a bomb is launched: a warning you can hear. */
  fuse(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const hiss = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.8;
    band.frequency.value = 6000;
    hiss.connect(band).connect(this.envelope(t, 0.05, 0.4, 0.12));
    hiss.start(t);
    hiss.stop(t + 0.5);
  }

  launch(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const whoosh = this.noiseSource();
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(300, t);
    low.frequency.linearRampToValueAtTime(1200, t + 0.25);
    whoosh.connect(low).connect(this.envelope(t, 0.08, 0.3, 0.25));
    whoosh.start(t);
    whoosh.stop(t + 0.4);
  }

  start(): void {
    this.notes([523, 659, 784], 0.08, 0.3);
  }

  frenzy(): void {
    this.notes([523, 659, 784, 1046, 1318], 0.06, 0.32);
  }

  end(): void {
    this.notes([784, 523], 0.16, 0.3);
  }

  private ready(): AudioContext | null {
    return this.enabled && this.master ? this.ctx : null;
  }

  private notes(freqs: number[], spacing: number, gain: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    freqs.forEach((f, i) => {
      const t = ctx.currentTime + i * spacing;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.connect(this.envelope(t, 0.005, 0.18, gain));
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    return src;
  }

  private envelope(t: number, attack: number, decay: number, peak: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master!);
    return g;
  }
}
