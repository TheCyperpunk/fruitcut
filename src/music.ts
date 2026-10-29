// An 80s synthwave loop, synthesized like the sound effects so there is no
// file to load: four-on-the-floor kick, a gated snare, pulsing eighth-note
// bass, a chorused pad, a sixteenth-note arpeggio and a sparse lead with a
// dotted echo. Notes are scheduled a little ahead of time from a timer (the
// usual Web Audio pattern), so the groove survives main-thread hiccups.

const BPM = 112;
const STEP = 60 / BPM / 4; // one sixteenth note, seconds
const BAR = STEP * 16;
const LOOKAHEAD = 0.18; // seconds of notes queued ahead of the clock
const TICK_MS = 40;
const BARS = 8;

// A minor, a bar each: i VI III VII, then i VI III V. Midi note numbers.
const CHORDS = [
  [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62],
  [57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59],
];
const ROOTS = [33, 29, 24, 31, 33, 29, 24, 28]; // bass, two octaves under the chords
const ARP = [0, 1, 2, 3, 2, 1, 0, 2]; // chord degree per sixteenth; 3 = the root an octave up
// Lead melody, one slot per eighth note across the loop; 0 is a rest.
const LEAD = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  76, 0, 72, 0, 74, 0, 72, 0, 69, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 74, 0, 71, 0, 0, 0,
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  enabled = true;
  intensity = 0; // 0 normal, 1 frenzy: brighter bass and pad, open hats
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private chorus: GainNode | null = null; // pad bus
  private echo: GainNode | null = null; // lead bus with a dotted-eighth delay
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private ducked = false;
  private readonly level = 0.16; // well under the effects; the user asked for it quieter

  /** Share the effects' context (already unlocked by a user gesture). Builds the busses once. */
  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Chorus: the dry pad plus a copy through a slowly wobbling short delay.
    this.chorus = ctx.createGain();
    this.chorus.connect(this.out);
    const wobble = ctx.createDelay(0.05);
    wobble.delayTime.value = 0.018;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const depth = ctx.createGain();
    depth.gain.value = 0.004;
    lfo.connect(depth).connect(wobble.delayTime);
    lfo.start();
    this.chorus.connect(wobble).connect(this.out);

    // Echo: a dotted-eighth feedback delay under the lead.
    this.echo = ctx.createGain();
    this.echo.connect(this.out);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    this.echo.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.out);
  }

  get playing(): boolean {
    return this.timer !== 0;
  }

  start(): void {
    if (!this.ctx || !this.out || !this.enabled || this.timer) return;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(this.ducked ? this.level * 0.3 : this.level, now, 0.2);
    this.step = 0;
    this.nextTime = now + 0.06;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = 0;
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  /** Quieter while the game is paused. */
  duck(on: boolean): void {
    this.ducked = on;
    if (this.ctx && this.out && this.timer) this.out.gain.setTargetAtTime(on ? this.level * 0.3 : this.level, this.ctx.currentTime, 0.15);
  }

  private tick(): void {
    const ctx = this.ctx!;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.schedule(this.step, this.nextTime);
      this.step = (this.step + 1) % (BARS * 16);
      this.nextTime += STEP;
    }
  }

  private schedule(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const sixteenth = step % 16;
    const chord = CHORDS[bar];

    if (sixteenth % 4 === 0) this.kick(t);
    if (sixteenth === 4 || sixteenth === 12) this.snare(t);
    if (sixteenth % 2 === 0) this.hat(t, false);
    else if (this.intensity > 0 && sixteenth % 4 === 3) this.hat(t, true);

    if (sixteenth % 2 === 0) this.bass(t, ROOTS[bar] + (sixteenth === 6 || sixteenth === 14 ? 12 : 0));
    if (sixteenth === 0) this.pad(t, chord);

    const degree = ARP[sixteenth % 8];
    this.arp(t, degree < 3 ? chord[degree] + 12 : chord[0] + 24);

    if (sixteenth % 2 === 0) {
      const note = LEAD[bar * 8 + sixteenth / 2];
      if (note) this.lead(t, note);
    }
  }

  // ---- voices ---------------------------------------------------------------

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.1);
    osc.connect(this.env(t, 0.002, 0.28, 1, this.out!));
    osc.start(t);
    osc.stop(t + 0.32);
    const click = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    click.connect(hp).connect(this.env(t, 0.001, 0.02, 0.25, this.out!));
    click.start(t);
    click.stop(t + 0.03);
  }

  /** The gated snare: a long bright noise tail chopped off abruptly. */
  private snare(t: number): void {
    const ctx = this.ctx!;
    const burst = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 0.5;
    const gate = ctx.createGain();
    gate.gain.setValueAtTime(0.0001, t);
    gate.gain.exponentialRampToValueAtTime(0.75, t + 0.003);
    gate.gain.linearRampToValueAtTime(0.45, t + 0.15);
    gate.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    burst.connect(band).connect(gate).connect(this.out!);
    burst.start(t);
    burst.stop(t + 0.2);
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(210, t);
    body.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    body.connect(this.env(t, 0.002, 0.1, 0.5, this.out!));
    body.start(t);
    body.stop(t + 0.12);
  }

  private hat(t: number, open: boolean): void {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    src.connect(hp).connect(this.env(t, 0.001, open ? 0.18 : 0.04, open ? 0.14 : 0.16, this.out!));
    src.start(t);
    src.stop(t + (open ? 0.22 : 0.06));
  }

  private bass(t: number, midi: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 5;
    lp.frequency.setValueAtTime(900 + this.intensity * 900, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    osc.connect(lp).connect(this.env(t, 0.004, STEP * 1.5, 0.42, this.out!));
    osc.start(t);
    osc.stop(t + STEP * 1.6);
  }

  /** Two detuned saws per note through a soft lowpass, held for the bar. */
  private pad(t: number, notes: number[]): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 + this.intensity * 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.35);
    g.gain.setValueAtTime(0.05, t + BAR - 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + BAR + 0.05);
    lp.connect(g).connect(this.chorus!);
    for (const note of notes) {
      for (const cents of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = hz(note);
        osc.detune.value = cents;
        osc.connect(lp);
        osc.start(t);
        osc.stop(t + BAR + 0.1);
      }
    }
  }

  private arp(t: number, midi: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = hz(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    osc.connect(lp).connect(this.env(t, 0.002, 0.1, 0.05, this.out!));
    osc.start(t);
    osc.stop(t + 0.12);
  }

  private lead(t: number, midi: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(this.env(t, 0.01, 0.3, 0.11, this.echo!));
    for (const cents of [-9, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz(midi);
      osc.detune.value = cents;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 0.35);
    }
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    return src;
  }

  private env(t: number, attack: number, decay: number, peak: number, dest: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }
}
