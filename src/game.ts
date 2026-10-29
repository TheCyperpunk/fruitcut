import type { BladeSample, StrokeInfo } from './blade';
import { CONFIG } from './config';
import { Fruit, Half, type Vec2 } from './fruit';
import { BOMB, FRUIT_KINDS, KINDS_BY_NAME, type FruitKind } from './fruitTypes';
import { levelAt, type LevelDef } from './levels';
import { cutFrame, segmentHitsCircle } from './slicer';

export type GameState = 'ready' | 'playing' | 'paused' | 'cleared' | 'over';

export interface Rules {
  gravity: number; // screen heights per second²
  fruitRadius: number; // screen heights
  spawnScale: number; // multiplies the time between waves; >1 is calmer
  bombs: boolean;
  minSpeed: number; // cap for the calibrated slice threshold
  calibrationFloor: number;
}

export const DEFAULT_RULES: Rules = {
  gravity: CONFIG.game.gravity,
  fruitRadius: CONFIG.game.fruitRadius,
  spawnScale: 1,
  bombs: true,
  minSpeed: CONFIG.blade.minSpeed,
  calibrationFloor: CONFIG.calibration.floor,
};

export interface RoundStats {
  fruit: number;
  bombs: number;
  bestCombo: number;
}

export type GameEvent =
  | { type: 'launch'; count: number; bomb: boolean; xs: number[] }
  | { type: 'slice'; fruit: Fruit; dir: Vec2; normal: Vec2; combo: number; points: number }
  | { type: 'bomb'; fruit: Fruit; penaltySeconds: number }
  | { type: 'frenzy' }
  | { type: 'calibrated'; minSpeed: number }
  | { type: 'levelStart'; level: number; def: LevelDef; retry: boolean }
  | { type: 'cleared'; level: number; score: number; stats: RoundStats }
  | { type: 'failed'; level: number; score: number; stats: RoundStats; best: number; newBest: boolean }
  | { type: 'pause' }
  | { type: 'resume' };

const STARTER_DELAY_MS = 1200; // pause after a level before the starter fruit appears
const FIRST_WAVE_DELAY_MS = 600;

function removeWhere<T>(list: T[], predicate: (item: T) => boolean): void {
  for (let i = list.length - 1; i >= 0; i--) if (predicate(list[i])) list.splice(i, 1);
}

// Pure game logic: no DOM, no rendering. Main feeds it time and blade
// segments, then reads `fruits`, `halves` and drains `events`.
//
// Flow: slice the starter fruit → level 1. Cut the level's target before
// time runs out → 'cleared', slice the starter → next level. Run out of
// time → 'over', slice the starter → retry the same level.
export class Game {
  state: GameState = 'ready';
  rules: Rules = { ...DEFAULT_RULES };
  readonly fruits: Fruit[] = [];
  readonly halves: Half[] = [];
  readonly events: GameEvent[] = [];
  score = 0;
  best: number;
  bestLevel: number; // highest level cleared, 1-based; 0 = none yet
  time = 0;
  minSpeed = DEFAULT_RULES.minSpeed; // retuned by the swipe that cuts the starter fruit
  frenzy = false;
  stats: RoundStats = { fruit: 0, bombs: 0, bestCombo: 0 };
  level = 0; // index into the level table
  def: LevelDef = levelAt(0);

  private kinds: FruitKind[] = FRUIT_KINDS;
  private levelStartScore = 0;
  private roundStartT = 0;
  private roundEndT = 0;
  private overT = 0;
  private pausedAt = 0;
  private nextSpawnT = 0;
  private nextId = 1;
  private comboKey = -1;
  private comboT = 0;
  private combo = 0;
  private freezeUntil = -Infinity;

  constructor(
    private width: number,
    private height: number,
    best = 0,
    private readonly rng: () => number = Math.random,
    bestLevel = 0,
  ) {
    this.best = best;
    this.bestLevel = bestLevel;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  setRules(rules: Partial<Rules>): void {
    this.rules = { ...this.rules, ...rules };
    this.minSpeed = this.rules.minSpeed; // the next starter swipe recalibrates
  }

  get target(): number {
    return this.def.target;
  }

  /** Fingertips acting as blades on this level, index finger first. */
  get fingers(): number {
    return this.def.fingers;
  }

  get timeLeft(): number {
    if (this.state === 'playing') return Math.max(0, (this.roundEndT - this.time) / 1000);
    if (this.state === 'paused') return Math.max(0, (this.roundEndT - this.pausedAt) / 1000);
    return 0;
  }

  get hasStarter(): boolean {
    return this.fruits.some((f) => f.starter);
  }

  update(t: number): void {
    const dt = this.time ? Math.min((t - this.time) / 1000, 0.05) : 0;
    this.time = t;
    if (this.state === 'paused') return;

    if (this.state === 'playing') {
      if (t >= this.roundEndT) this.fail(t);
      else {
        if (this.def.frenzy && !this.frenzy && this.roundEndT - t <= CONFIG.game.frenzySeconds * 1000) this.startFrenzy(t);
        if (t >= this.nextSpawnT) this.spawnWave(t);
      }
    }
    if (this.needsStarter(t)) this.addStarter();

    // Hit-stop: fruit and halves hold still for a few frames after a cut.
    const simDt = t < this.freezeUntil ? 0 : dt;
    const g = this.rules.gravity * this.height;
    for (const f of this.fruits) f.step(t, simDt, g);
    for (const h of this.halves) h.step(simDt, g);

    removeWhere(this.fruits, (f) => !f.starter && f.vy > 0 && f.y - f.radius * 1.5 > this.height);
    removeWhere(this.halves, (h) => h.y - h.radius * 2 > this.height);
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = this.time;
    this.events.push({ type: 'pause' });
  }

  resume(): void {
    if (this.state !== 'paused') return;
    const shift = this.time - this.pausedAt;
    this.roundEndT += shift;
    this.nextSpawnT += shift;
    this.comboT += shift;
    this.freezeUntil += shift;
    this.state = 'playing';
    this.events.push({ type: 'resume' });
  }

  /**
   * Test one blade segment (two consecutive samples of one fingertip) against
   * every fruit. A cut needs a fast segment that is part of a sustained,
   * non-reversing stroke, so a single-frame landmark glitch can't slice.
   * `comboKey` identifies the hand's swipe, so cuts by different fingers of
   * the same swipe still chain into a combo.
   */
  handleBlade(prev: BladeSample, cur: BladeSample, stroke: StrokeInfo, comboKey = cur.stroke): void {
    if (this.state === 'paused') return;
    if (prev.stroke !== cur.stroke) return;
    if (cur.speed < this.minSpeed) return;
    if (prev.speed < this.minSpeed * CONFIG.blade.rampRatio) return;
    if (stroke.path < CONFIG.blade.minPath) return;
    if (stroke.turn < CONFIG.blade.minTurnDot) return;

    const tMid = (prev.t + cur.t) / 2;
    for (const fruit of [...this.fruits]) {
      const center = fruit.positionAt(tMid);
      if (segmentHitsCircle(prev, cur, center, fruit.radius * CONFIG.game.hitMargin)) {
        if (fruit.kind.hazard) this.explode(fruit);
        else this.slice(fruit, prev, cur, stroke, comboKey);
      }
    }
  }

  /** Jump straight into a level (used by tests and dev tools). */
  startLevel(index: number, retry = false): void {
    this.level = index;
    this.def = levelAt(index);
    const kinds = this.def.kinds.flatMap((name) => KINDS_BY_NAME.get(name) ?? []);
    this.kinds = kinds.length ? kinds : FRUIT_KINDS;
    if (retry) this.score = this.levelStartScore;
    else this.levelStartScore = this.score;
    this.state = 'playing';
    this.frenzy = false;
    this.stats = { fruit: 0, bombs: 0, bestCombo: 0 };
    this.combo = 0;
    this.comboKey = -1;
    this.roundStartT = this.time;
    this.roundEndT = this.time + this.def.seconds * 1000;
    this.nextSpawnT = this.time + FIRST_WAVE_DELAY_MS;
    this.events.push({ type: 'levelStart', level: index, def: this.def, retry });
  }

  private explode(bomb: Fruit): void {
    this.fruits.splice(this.fruits.indexOf(bomb), 1);
    this.combo = 0;
    this.comboKey = -1;
    this.stats.bombs++;
    const penalty = CONFIG.game.bombPenaltySeconds;
    if (this.state === 'playing') this.roundEndT = Math.max(this.time, this.roundEndT - penalty * 1000);
    this.freezeUntil = this.time + CONFIG.feel.hitStopMaxMs;
    this.events.push({ type: 'bomb', fruit: bomb, penaltySeconds: penalty });
  }

  private slice(fruit: Fruit, a: BladeSample, b: BladeSample, stroke: StrokeInfo, comboKey: number): void {
    this.fruits.splice(this.fruits.indexOf(fruit), 1);
    const { dir, normal } = cutFrame(a, b);

    const sameSwipe = comboKey === this.comboKey && b.t - this.comboT < CONFIG.game.comboGapMs;
    this.combo = sameSwipe ? this.combo + 1 : 1;
    this.comboKey = comboKey;
    this.comboT = b.t;

    const points = fruit.starter ? 0 : this.combo >= 3 ? 2 : 1;
    this.score += points;
    if (!fruit.starter) {
      this.stats.fruit++;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    }

    const { hitStopMs, hitStopComboMs, hitStopMaxMs } = CONFIG.feel;
    this.freezeUntil = this.time + Math.min(hitStopMs + (this.combo - 1) * hitStopComboMs, hitStopMaxMs);

    const separation = 0.3 * this.height;
    const push = 0.2 * this.height;
    for (const side of [1, -1] as const) {
      this.halves.push(
        new Half({
          id: this.nextId++,
          fruitId: fruit.id,
          kind: fruit.kind,
          x: fruit.x + normal.x * side * fruit.radius * 0.08,
          y: fruit.y + normal.y * side * fruit.radius * 0.08,
          vx: fruit.vx * 0.5 + normal.x * side * separation + dir.x * push,
          vy: fruit.vy * 0.5 + normal.y * side * separation + dir.y * push,
          radius: fruit.radius,
          normal,
          dir,
          side,
          born: this.time,
          baseAngle: fruit.spinAngle,
        }),
      );
    }
    this.events.push({ type: 'slice', fruit, dir, normal, combo: this.combo, points });

    if (fruit.starter) {
      this.calibrate(stroke.peakSpeed);
      this.begin();
    } else if (this.state === 'playing' && this.stats.fruit >= this.target) {
      this.clear();
    }
  }

  // The starter swipe shows how this player swipes: a gentle swipe lowers the
  // threshold so they aren't ignored, a hard one keeps the cap so jitter
  // can't trigger cuts. Re-done each level, so it tracks how they play now.
  private calibrate(peakSpeed: number): void {
    const { ratio } = CONFIG.calibration;
    this.minSpeed = Math.min(Math.max(peakSpeed * ratio, this.rules.calibrationFloor), this.rules.minSpeed);
    this.events.push({ type: 'calibrated', minSpeed: this.minSpeed });
  }

  private begin(): void {
    if (this.state === 'ready') this.startLevel(0);
    else if (this.state === 'cleared') this.startLevel(this.level + 1);
    else if (this.state === 'over') this.startLevel(this.level, true);
  }

  private startFrenzy(t: number): void {
    this.frenzy = true;
    this.nextSpawnT = t;
    this.events.push({ type: 'frenzy' });
  }

  private clear(): void {
    this.state = 'cleared';
    this.overT = this.time;
    this.bestLevel = Math.max(this.bestLevel, this.level + 1);
    this.best = Math.max(this.best, this.score);
    this.events.push({ type: 'cleared', level: this.level, score: this.score, stats: this.stats });
  }

  private fail(t: number): void {
    this.state = 'over';
    this.overT = t;
    const newBest = this.score > this.best;
    if (newBest) this.best = this.score;
    this.events.push({ type: 'failed', level: this.level, score: this.score, stats: this.stats, best: this.best, newBest });
  }

  private needsStarter(t: number): boolean {
    if (this.hasStarter) return false;
    if (this.state === 'ready') return true;
    if (this.state !== 'cleared' && this.state !== 'over') return false;
    return t - this.overT > STARTER_DELAY_MS && this.fruits.length === 0;
  }

  private baseRadius(): number {
    return Math.min(this.rules.fruitRadius * this.height, 0.12 * this.width);
  }

  private addStarter(): void {
    const kind = FRUIT_KINDS[0];
    this.fruits.push(
      new Fruit({
        id: this.nextId++,
        kind,
        x: this.width / 2,
        y: this.height * 0.55,
        vx: 0,
        vy: 0,
        radius: this.baseRadius() * kind.size,
        spinAxis: [0, 1, 0],
        spinRate: 0.6,
        starter: true,
      }),
    );
  }

  private spawnWave(t: number): void {
    const { rng, def } = this;
    const progress = Math.min(1, Math.max(0, (t - this.roundStartT) / (def.seconds * 1000)));
    let count: number;
    let interval: number;
    let bomb = false;

    if (this.frenzy) {
      count = 2 + Math.floor(rng() * 3); // 2–4, relentless, no bombs
      interval = 450;
    } else {
      const [wMin, wMax] = def.waveSize;
      count = wMin + Math.floor(rng() * (wMax - wMin + 1));
      interval = def.intervalMs[0] + (def.intervalMs[1] - def.intervalMs[0]) * progress;
      const [lo, hi] = def.bombChance;
      const chance = lo + (hi - lo) * progress;
      bomb = this.rules.bombs && chance > 0 && progress >= CONFIG.game.bombStart && rng() < chance;
    }

    // Everything in a wave launches from its own lane, so fruit never start on top of each other.
    const lanes = count + (bomb ? 1 : 0);
    const bombLane = bomb ? Math.floor(rng() * lanes) : -1;
    const xs: number[] = [];
    for (let lane = 0; lane < lanes; lane++) {
      const x0 = this.width * (0.1 + 0.8 * ((lane + 0.25 + 0.5 * rng()) / lanes));
      xs.push(x0);
      this.launch(lane === bombLane ? BOMB : this.kinds[Math.floor(rng() * this.kinds.length)], x0);
    }
    this.nextSpawnT = t + interval * this.rules.spawnScale * (0.8 + 0.4 * rng());
    this.events.push({ type: 'launch', count, bomb, xs });
  }

  private launch(kind: FruitKind, x0: number): void {
    const { width: W, height: H, rng } = this;
    const g = this.rules.gravity * H;
    const radius = this.baseRadius() * kind.size;

    const y0 = H + radius;
    const apexY = H * (0.12 + 0.33 * rng());
    const vy = -Math.sqrt(2 * g * (y0 - apexY));
    const timeToApex = -vy / g;
    const vx = (W * (0.25 + 0.5 * rng()) - x0) / (2 * timeToApex);

    const ax = rng() - 0.5;
    const ay = rng() - 0.5;
    const az = rng() - 0.5;
    const len = Math.hypot(ax, ay, az) || 1;
    const spin = kind.hazard ? 0.8 : 1.5 + 2.5 * rng();

    this.fruits.push(
      new Fruit({
        id: this.nextId++,
        kind,
        x: x0,
        y: y0,
        vx,
        vy,
        radius,
        spinAxis: [ax / len, ay / len, az / len],
        spinRate: spin * (rng() < 0.5 ? -1 : 1),
      }),
    );
  }
}
