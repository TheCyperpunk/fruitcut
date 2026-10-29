import './style.css';
import { Sfx } from './audio';
import { Backdrop } from './backdrop';
import { Blade } from './blade';
import { CameraError, startCamera } from './camera';
import { GameClock } from './clock';
import { CONFIG } from './config';
import { drawLandmarks, Stats } from './debug';
import type { FakeCamera } from './devcam';
import { Effects } from './effects';
import { Fruit, Half } from './fruit';
import { BOMB, FRUIT_KINDS, KINDS_BY_NAME } from './fruitTypes';
import { Game, type GameEvent } from './game';
import { isFist } from './gestures';
import { HandMask } from './handMask';
import { Music } from './music';
import { downloadRecording, Recorder } from './recorder';
import { cleanName, fetchBoard, loadPlayer, savePlayer, SHARED, submitScore, type Board } from './scoreboard';
import { FruitScene, type SceneView } from './scene';
import { loadSettings, rulesFor, saveSettings, type Settings } from './settings';
import type { Tracker } from './tracker';
import { drawFingertip, drawTrail } from './trail';
import { CoverMapper } from './view';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const video = $<HTMLVideoElement>('camera');
const stage = $('stage');
const bg = $<HTMLCanvasElement>('bg');
const fx = $<HTMLCanvasElement>('fx');
const bgCtx = bg.getContext('2d')!;
const fxCtx = fx.getContext('2d')!;
const handCanvas = document.createElement('canvas');
const handCtx = handCanvas.getContext('2d')!;
const startScreen = $('start');
const startButton = $<HTMLButtonElement>('start-button');
const startStatus = $('start-status');
const logo = $('logo');
const bestEl = $('best');
const loadEl = $('load');
const loadFill = $('load-fill');
const loadText = $('load-text');
const crashEl = $('crash');
const crashReload = $<HTMLButtonElement>('crash-reload');
const playerNameInput = $<HTMLInputElement>('player-name');
const boardLink = $<HTMLButtonElement>('board-link');
const boardEl = $('board');
const boardScope = $('board-scope');
const boardList = $('board-list');
const boardMe = $('board-me');
const boardForm = $<HTMLFormElement>('board-form');
const boardName = $<HTMLInputElement>('board-name');
const boardClose = $<HTMLButtonElement>('board-close');
const boardQuit = $<HTMLButtonElement>('board-quit');
const menuEl = $('menu');
const menuTitle = $('menu-title');
const menuContinue = $<HTMLButtonElement>('menu-continue');
const menuBoard = $<HTMLButtonElement>('menu-board');
const menuQuit = $<HTMLButtonElement>('menu-quit');
const hint = $('hint');
const hud = $('hud');
const levelEl = $('level');
const scoreEl = $('score');
const timerEl = $('timer');
const progressEl = $('progress');
const timerFill = $('timer-fill');
const banner = $('banner');
const toast = $('toast');
const statsPanel = $('stats');
const settingsDialog = $<HTMLDialogElement>('settings');
const settingsForm = $<HTMLFormElement>('settings-form');
const settingsButton = $<HTMLButtonElement>('settings-button');
const pauseButton = $<HTMLButtonElement>('pause-button');
const settingsLink = $<HTMLButtonElement>('settings-link');
const vibrationRow = $('vibration-row');

const BEST_KEY = 'fruitcut.best';
const BEST_LEVEL_KEY = 'fruitcut.bestLevel';
const FINGER_TIPS = [8, 12, 16, 20]; // index, middle, ring, pinky fingertip landmarks

const storage = ((): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null; // storage blocked: nothing is remembered between visits
  }
})();

function loadNumber(key: string): number {
  try {
    return Number(storage?.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key: string, value: number): void {
  try {
    storage?.setItem(key, String(value));
  } catch {
    // private mode or storage blocked: the record just isn't remembered
  }
}

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let settings: Settings = loadSettings(storage, prefersReducedMotion);

const mapper = new CoverMapper();
// One blade per fingertip; the level decides how many are active.
const blades = FINGER_TIPS.map((_, i) => new Blade(i * 1_000_000));
const stats = new Stats();
const clock = new GameClock();
const effects = new Effects();
const backdrop = new Backdrop();
const sfx = new Sfx();
const music = new Music();
const scene = new FruitScene($<HTMLCanvasElement>('gl'));
const game = new Game(window.innerWidth, window.innerHeight, loadNumber(BEST_KEY), Math.random, loadNumber(BEST_LEVEL_KEY));
const handMask = new HandMask();
const recorder = new Recorder();

let tracker: Tracker;
let trackerPromise: Promise<Tracker> | null = null; // started while the title is up, see preloadTracker
let segmenterLoading = false;
let lastFist = false;
let width = 0;
let height = 0;
let dpr = 1;
let lastCameraT = 0;
let lastHandT = -Infinity;
let lastHand: NormalizedLandmark[] | null = null;
let lastStatsUpdate = 0;
let lastRenderNow = 0;
let bannerText = '';
let levelBannerUntil = 0; // show the level intro in the banner until this game time
let lastScore = -1;
let trauma = 0; // screen shake energy, 0..1
let toastTimer = 0;
let devHand: NormalizedLandmark[] | null = null; // dev-only synthetic hand, see bottom of file
let fakeCamera: FakeCamera | null = null; // dev-only, `?fakecam=1`
let player = loadPlayer(storage);
let pendingScore: { score: number; level: number } | null = null; // a score waiting for a name
let menuOpen = false;
let running = false; // camera on and the game loop going; false on the title
let cameraLoopStarted = false;

function resize(): void {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const canvas of [bg, fx, handCanvas]) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  scene.resize(width, height, dpr);
  backdrop.resize(width, height, dpr);
  game.resize(width, height);
  if (titleActive) buildTitle();
}

// ---- title screen ---------------------------------------------------------
// The start screen's illustration is the game's own renderer: fruit drifting
// around the edges and a watermelon already cut in two. Spots are screen
// fractions chosen to leave the middle column clear for the words.

interface TitleSpot {
  name: string;
  u: number;
  v: number;
  scale: number;
}

const TITLE_WIDE: TitleSpot[] = [
  { name: 'orange', u: 0.1, v: 0.2, scale: 1 },
  { name: 'banana', u: 0.9, v: 0.1, scale: 1.05 },
  { name: 'strawberry', u: 0.19, v: 0.52, scale: 0.95 },
  { name: 'kiwi', u: 0.9, v: 0.5, scale: 0.95 },
  { name: 'lemon', u: 0.08, v: 0.82, scale: 1 },
  { name: 'grapes', u: 0.84, v: 0.82, scale: 1 },
  { name: 'apple', u: 0.3, v: 0.92, scale: 0.9 },
  { name: 'plum', u: 0.68, v: 0.06, scale: 0.85 },
];
const TITLE_TALL: TitleSpot[] = [
  { name: 'orange', u: 0.13, v: 0.06, scale: 0.9 },
  { name: 'banana', u: 0.82, v: 0.05, scale: 1 },
  { name: 'lemon', u: 0.12, v: 0.95, scale: 0.9 },
  { name: 'grapes', u: 0.86, v: 0.94, scale: 0.9 },
];
const TITLE_AXIS: [number, number, number] = [0.33, 0.94, 0]; // a tilted spin shows stems and bellies in turn
const TITLE_KINDS = [...new Set([...TITLE_WIDE, ...TITLE_TALL].map((s) => s.name).concat('watermelon'))].map((n) => KINDS_BY_NAME.get(n)!);

const title: SceneView & { fruits: Fruit[]; halves: Half[] } = { fruits: [], halves: [], time: 300 };
const titleRest = new Map<number, { x: number; y: number; phase: number }>();
let titleActive = false;
let titleRaf = 0;
let titleLast = 0;

function buildTitle(): void {
  const wide = width > height * 1.1;
  const unit = wide ? 0.07 * Math.min(height, width * 0.8) : 0.1 * width;
  title.fruits.length = 0;
  title.halves.length = 0;
  titleRest.clear();
  (wide ? TITLE_WIDE : TITLE_TALL).forEach((spot, i) => {
    const kind = KINDS_BY_NAME.get(spot.name)!;
    const f = new Fruit({
      id: -2000 - i, kind, x: spot.u * width, y: spot.v * height, vx: 0, vy: 0,
      radius: unit * kind.size * spot.scale, spinAxis: TITLE_AXIS, spinRate: 0, starter: true,
    });
    f.spinAngle = 0.45 + i * 1.3;
    title.fruits.push(f);
    titleRest.set(f.id, { x: f.x, y: f.y, phase: i * 1.7 });
  });

  // The cut watermelon flanks the logo, or sits above it when there's no room beside.
  const melon = KINDS_BY_NAME.get('watermelon')!;
  const r = unit * melon.size * (wide ? 1 : 0.7);
  const box = logo.getBoundingClientRect();
  const xs = wide ? [box.left - r * 1.15, box.right + r * 1.15] : [width / 2 - r * 0.95, width / 2 + r * 0.95];
  const y = wide ? box.top + box.height / 2 : Math.max(r, box.top - r * 1.2);
  ([-1, 1] as const).forEach((side, i) => {
    // Flesh faces the middle; `born: 0` at time 300 freezes the halves at the moment they swing open.
    const h = new Half({
      id: -2100 - i, fruitId: -2100, kind: melon, x: xs[i], y, vx: 0, vy: 0, radius: r,
      normal: { x: 1, y: 0 }, dir: { x: 0, y: 1 }, side, born: 0, baseAngle: 0.6,
    });
    title.halves.push(h);
    titleRest.set(h.id, { x: h.x, y: h.y, phase: 0.4 });
  });
}

function renderTitle(now: number): void {
  if (!titleActive) return;
  const dt = titleLast ? Math.min((now - titleLast) / 1000, 0.05) : 0;
  titleLast = now;
  const motion = settings.reducedMotion ? 0 : 1;
  for (const f of title.fruits) {
    const rest = titleRest.get(f.id)!;
    f.y = rest.y + Math.sin(now / 900 + rest.phase) * f.radius * 0.12 * motion;
    f.spinAngle += 0.35 * dt * motion;
  }
  for (const h of title.halves) {
    const rest = titleRest.get(h.id)!;
    h.y = rest.y + Math.sin(now / 900 + rest.phase) * h.radius * 0.08 * motion;
  }
  scene.render(title);
  titleRaf = requestAnimationFrame(renderTitle);
}

function showTitle(): void {
  if (game.best > 0) {
    const level = game.bestLevel > 0 ? `, cleared level ${game.bestLevel}` : '';
    bestEl.textContent = `Your best: ${game.best} points${level}`;
    bestEl.hidden = false;
  }
  performance.mark('title-art-start');
  scene.prepare(TITLE_KINDS); // only what the title shows; the rest is drawn while it's on screen
  performance.measure('title-art', 'title-art-start');
  titleActive = true;
  titleLast = 0;
  buildTitle();
  titleRaf = requestAnimationFrame(renderTitle);
  requestAnimationFrame(() => {
    // Runs after the first title frame: finish the fruit art in idle time and
    // fetch the tracking runtime, so Play is close to instant.
    scene.prepareAll();
    if (!saveData()) preloadTracker().catch(() => undefined); // a failure here is reported when Play is pressed
  });
}

// ---- hand tracking download -----------------------------------------------
// 22 MB of runtime and model. Downloading it while the title is up, with a
// progress bar, turns a long "Starting…" into a short one.

function preloadTracker(): Promise<Tracker> {
  trackerPromise ??= import('./tracker')
    .then((m) => m.createTracker(showLoadProgress))
    .then((t) => {
      showLoadDone();
      return t;
    })
    .catch((err: unknown) => {
      trackerPromise = null; // the next attempt starts over
      loadEl.hidden = true;
      throw err;
    });
  return trackerPromise;
}

function saveData(): boolean {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}

function showLoadProgress(loaded: number, total: number): void {
  loadEl.hidden = false;
  loadFill.style.width = `${Math.min(100, (100 * loaded) / total).toFixed(1)}%`;
  loadText.textContent = `Loading hand tracking: ${(loaded / 1e6).toFixed(0)} of ${(total / 1e6).toFixed(0)} MB`;
}

function showLoadDone(): void {
  loadEl.hidden = false;
  loadEl.classList.add('done');
  loadFill.style.width = '100%';
  loadText.textContent = 'Hand tracking ready';
  window.setTimeout(() => (loadEl.hidden = true), 1800);
}

// ---- scoreboard, menu, quit -----------------------------------------------

function setName(raw: string): void {
  player = { ...player, name: cleanName(raw) };
  savePlayer(storage, player);
  playerNameInput.value = player.name;
  boardName.value = player.name;
}

/** Record a run's score. Without a name it waits in the board panel for one. */
async function recordScore(score: number, level: number): Promise<void> {
  if (score <= 0) return;
  if (!player.name) {
    pendingScore = { score, level };
    return;
  }
  pendingScore = null;
  try {
    await submitScore(player, score, level, storage);
  } catch (err) {
    console.warn('Score not saved', err);
  }
}

async function openBoard(): Promise<void> {
  boardEl.hidden = false;
  boardScope.textContent = SHARED ? 'Everyone who has played' : 'This device only';
  boardForm.hidden = Boolean(player.name) && !pendingScore;
  boardName.value = player.name;
  boardQuit.hidden = !running;
  boardList.replaceChildren(boardItem('board-loading', 'Loading…'));
  boardMe.textContent = pendingScore ? `${pendingScore.score} points, waiting for a name` : '';
  try {
    renderBoard(await fetchBoard(player, storage));
  } catch (err) {
    console.warn(err);
    boardList.replaceChildren();
    boardMe.textContent = "Couldn't reach the scoreboard. Check your connection and try again.";
  }
}

function closeBoard(): void {
  boardEl.hidden = true;
}

function boardItem(className: string, text: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = className;
  li.textContent = text;
  return li;
}

function renderBoard(board: Board): void {
  if (!board.rows.length) {
    boardList.replaceChildren(boardItem('board-empty', 'No scores yet. Yours could be the first.'));
  } else {
    boardList.replaceChildren(
      ...board.rows.map((r, i) => {
        const li = document.createElement('li');
        if (r.player_id === player.id) li.classList.add('me');
        for (const [cls, text] of [['rank', String(i + 1)], ['name', r.name], ['score', String(r.score)], ['lvl', `L${r.level}`]] as const) {
          const span = document.createElement('span');
          span.className = cls;
          span.textContent = text;
          li.append(span);
        }
        return li;
      }),
    );
  }
  if (pendingScore) return; // the "waiting for a name" line stays
  boardMe.textContent = board.rank ? `You're #${board.rank} of ${board.total}` : player.name ? 'No score saved yet' : 'Enter a name to save your score';
}

/** Camera off, back to the title. The run's score is recorded first. */
function quit(): void {
  void recordScore(game.score, game.level + 1);
  closeBoard();
  menuOpen = false;
  menuEl.hidden = true;
  running = false;
  music.stop();
  const stream = video.srcObject as MediaStream | null;
  if (stream && !fakeCamera) for (const track of stream.getTracks()) track.stop(); // the camera light goes off
  video.srcObject = null;
  game.reset();
  lastHand = null;
  lastFist = false;
  devHand = null;
  trauma = 0;
  stage.style.transform = '';
  lastScore = -1;
  bannerText = '';
  bgCtx.setTransform(1, 0, 0, 1, 0, 0);
  bgCtx.clearRect(0, 0, bg.width, bg.height);
  fxCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxCtx.clearRect(0, 0, fx.width, fx.height);
  for (const el of [hud, pauseButton, settingsButton, hint, banner, toast]) el.hidden = true;
  startButton.disabled = false;
  startButton.textContent = fakeCamera ? 'Play (fake camera)' : 'Play';
  startStatus.textContent = '';
  startScreen.hidden = false;
  showTitle();
}

function hideTitle(): void {
  titleActive = false;
  cancelAnimationFrame(titleRaf);
  title.fruits.length = 0;
  title.halves.length = 0; // the game's first frame then drops them from the scene
}

function showToast(text: string, ms = 1400): void {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), ms);
}

function buzz(ms: number): void {
  if (settings.vibration) navigator.vibrate?.(ms);
}

// ---- settings -------------------------------------------------------------

function applySettings(): void {
  saveSettings(storage, settings);
  game.setRules(rulesFor(settings));
  for (const b of blades) b.minSpeed = game.minSpeed;
  sfx.enabled = settings.sound;
  music.enabled = settings.music;
  if (settings.music && tracker) music.start(); // no-op before the camera is on, or if already playing
  else music.stop();
  effects.reducedMotion = settings.reducedMotion;
  document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  statsPanel.hidden = !settings.debug;
}

function syncSettingsForm(): void {
  for (const el of Array.from(settingsForm.elements)) {
    if (!(el instanceof HTMLInputElement)) continue;
    const value = settings[el.name as keyof Settings];
    if (el.type === 'checkbox') el.checked = value === true;
    else if (el.type === 'radio') el.checked = String(value) === el.value;
  }
}

function readSettingsForm(): void {
  const fd = new FormData(settingsForm);
  settings = {
    sound: fd.has('sound'),
    music: fd.has('music'),
    vibration: fd.has('vibration'),
    reducedMotion: fd.has('reducedMotion'),
    bombs: fd.has('bombs'),
    debug: fd.has('debug'),
    pace: fd.get('pace') as Settings['pace'],
    fruitSize: fd.get('fruitSize') as Settings['fruitSize'],
    sensitivity: fd.get('sensitivity') as Settings['sensitivity'],
  };
  applySettings();
}

function openSettings(): void {
  if (game.state === 'playing') game.pause();
  syncSettingsForm();
  settingsDialog.showModal();
}

// The pause button, P and Esc open a menu (pausing the round); closing it resumes.
function openMenu(): void {
  if (game.state === 'playing') game.pause();
  menuOpen = true;
  menuTitle.textContent = game.state === 'paused' ? 'Paused' : 'Menu';
  menuEl.hidden = false;
}

function closeMenu(): void {
  menuOpen = false;
  menuEl.hidden = true;
  if (game.state === 'paused') game.resume();
}

function togglePause(): void {
  if (menuOpen) closeMenu();
  else if (game.state === 'paused') game.resume(); // paused by the settings dialog
  else openMenu();
}

// ---- camera frames --------------------------------------------------------

// Runs once per camera frame, in camera time. The hand layer is built from the
// exact frame the hand was found in, so the cutout lines up with the trail.
function onCameraFrame(captureT: number): void {
  const t = Math.max(captureT, lastCameraT + 1); // MediaPipe needs increasing timestamps
  lastCameraT = t;
  mapper.update(video.videoWidth, video.videoHeight, width, height);

  const inferenceStart = performance.now();
  const result = tracker.detect(video, t);
  const inferenceMs = performance.now() - inferenceStart;

  const hand = result.landmarks[0] ?? devHand ?? null;
  recorder.push(t, hand);
  if (hand) {
    const points = hand.map((l) => mapper.toScreen(l.x, l.y));
    const fist = isFist(points);
    lastFist = fist;

    // Each active fingertip is its own blade. The index finger's stroke is the
    // swipe id for combos, so cuts by any finger of one swipe chain together.
    let comboKey = 0;
    for (let i = 0; i < game.fingers; i++) {
      const blade = blades[i];
      const tip = points[FINGER_TIPS[i]];
      const sample = blade.push(tip.x, tip.y, t, height);
      if (i === 0) comboKey = sample.stroke;
      const prev = blade.previous;
      // A fist never slices: it's the "safe" pose for letting a bomb pass.
      if (prev && !fist) game.handleBlade(prev, sample, blade.strokeInfo(), comboKey);
      if (blade.armed && !fist) effects.sparkle(sample, t, height);
    }
    lastHandT = t;
  } else {
    lastFist = false;
  }
  lastHand = hand;
  for (const b of blades) b.prune(t);
  hint.hidden = t - lastHandT < 1000;

  handMask.update(video, hand, t, blades[0].armed);
  compositeHand();

  const now = performance.now();
  clock.observe(captureT, now);
  stats.hand = !!hand;
  stats.fist = lastFist;
  stats.speed = hand ? (blades[0].latest?.speed ?? 0) : 0;
  stats.minSpeed = game.minSpeed;
  stats.fingers = game.fingers;
  stats.segmentMs = handMask.segmentMs;
  stats.maskMode = handMask.mode;
  stats.frame(t, inferenceMs, now);
}

function ensureSegmenter(): void {
  if (handMask.segmenter || segmenterLoading) return;
  segmenterLoading = true;
  import('./segmenter')
    .then((m) => m.PersonSegmenter.create())
    .then((s) => (handMask.segmenter = s))
    .catch((err: unknown) => console.warn('Segmentation unavailable; showing the landmark hand shape', err));
}

function toggleRecording(): void {
  if (recorder.active) {
    downloadRecording(recorder.stop({ w: video.videoWidth, h: video.videoHeight }, { w: width, h: height }));
    showToast('Recording saved');
  } else {
    recorder.start();
    showToast('Recording hand movement (landmarks only). Press R to stop.');
  }
}

// Camera frame clipped to the hand mask (or the whole frame in camera mode).
function compositeHand(): void {
  handCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  handCtx.globalCompositeOperation = 'source-over';
  handCtx.clearRect(0, 0, width, height);
  mapper.drawCover(handCtx, video, dpr);
  if (handMask.mode !== 'camera') {
    handCtx.globalCompositeOperation = 'destination-in';
    mapper.drawCover(handCtx, handMask.canvas, dpr);
    handCtx.globalCompositeOperation = 'source-over';
  }
}

// ---- game events ----------------------------------------------------------

function onGameEvent(e: GameEvent): void {
  switch (e.type) {
    case 'launch':
      sfx.launch();
      if (e.bomb) sfx.fuse();
      break;
    case 'slice': {
      const f = e.fruit;
      effects.slice(f, f.radius, e.dir, e.normal, f.kind.juice, f.kind.flesh, game.time, height);
      backdrop.pulse(f.kind.juice, game.time);
      if (e.points) effects.popup({ x: f.x, y: f.y - f.radius }, `+${e.points}`, game.time);
      if (e.combo >= 3) {
        effects.popup({ x: f.x, y: f.y - f.radius * 2 }, `Combo ×${e.combo}`, game.time, true);
        effects.flash('#ffc45c', game.time);
      }
      if (!settings.reducedMotion) trauma = Math.min(1, trauma + CONFIG.feel.traumaPerSlice + (e.combo - 1) * 0.1);
      sfx.slice(e.combo);
      buzz(15);
      break;
    }
    case 'bomb': {
      const f = e.fruit;
      effects.explode(f, f.radius, game.time, height);
      effects.popup({ x: f.x, y: f.y - f.radius * 1.5 }, `−${e.penaltySeconds} s`, game.time, true);
      effects.flash('#ff5a1a', game.time);
      if (!settings.reducedMotion) trauma = 1;
      sfx.bomb();
      buzz(150);
      break;
    }
    case 'frenzy':
      effects.popup({ x: width / 2, y: height * 0.3 }, 'FRENZY!', game.time, true);
      effects.flash('#ffd089', game.time);
      sfx.frenzy();
      music.intensity = 1;
      buzz(40);
      break;
    case 'calibrated':
      for (const b of blades) b.minSpeed = e.minSpeed;
      break;
    case 'levelStart':
      sfx.start();
      music.intensity = 0;
      closeBoard();
      levelBannerUntil = game.time + 3000;
      bannerText = ''; // force a refresh
      break;
    case 'cleared':
      sfx.frenzy();
      music.intensity = 0;
      void recordScore(e.score, e.level + 1); // the board always has the run so far
      effects.flash('#ffd089', game.time);
      effects.popup({ x: width / 2, y: height * 0.3 }, 'Level cleared!', game.time, true);
      saveNumber(BEST_LEVEL_KEY, game.bestLevel);
      saveNumber(BEST_KEY, game.best);
      buzz(60);
      break;
    case 'failed':
      sfx.end();
      music.intensity = 0;
      effects.flash('#ffffff', game.time);
      if (e.newBest) saveNumber(BEST_KEY, e.best);
      void recordScore(e.score, e.level + 1).then(openBoard);
      break;
    case 'pause':
      music.duck(true);
      showToast('Paused');
      break;
    case 'resume':
      music.duck(false);
      showToast('Go!');
      break;
  }
}

// ---- rendering ------------------------------------------------------------

function fingersLabel(n: number): string {
  return n === 1 ? '1 finger' : `${n} fingers`;
}

function updateHud(): void {
  hud.hidden = game.state === 'ready';
  if (game.score !== lastScore) {
    scoreEl.textContent = String(game.score);
    if (lastScore >= 0 && game.score > lastScore) {
      scoreEl.classList.remove('pop');
      void scoreEl.offsetWidth; // restart the animation
      scoreEl.classList.add('pop');
    }
    lastScore = game.score;
  }
  const left = game.timeLeft;
  const inRound = game.state === 'playing' || game.state === 'paused';
  pauseButton.hidden = !running;
  const paused = game.state === 'paused';
  pauseButton.textContent = menuOpen ? '✕' : paused ? '▶' : game.state === 'playing' ? '❚❚' : '☰';
  pauseButton.setAttribute('aria-label', menuOpen ? 'Close menu' : paused ? 'Play' : game.state === 'playing' ? 'Pause' : 'Menu');
  levelEl.textContent = `Level ${game.level + 1} · ${game.def.name} · ${fingersLabel(game.fingers)}`;
  progressEl.textContent = inRound ? `${game.stats.fruit} / ${game.target} fruit` : '';
  timerEl.textContent = inRound ? `${Math.ceil(left)}s` : '';
  timerFill.style.width = `${(left / game.def.seconds) * 100}%`;
  timerFill.classList.toggle('low', game.state === 'playing' && left < 10 && !game.frenzy);
  timerFill.classList.toggle('frenzy', game.state === 'playing' && game.frenzy);

  const s = game.stats;
  const summary = `${s.fruit} fruit · best combo ×${s.bestCombo}` + (s.bombs ? ` · ${s.bombs} bomb${s.bombs > 1 ? 's' : ''}` : '');
  let text = '';
  if (game.state === 'ready') text = 'Slice the watermelon to start';
  else if (game.state === 'playing' && game.time < levelBannerUntil) {
    text = `Level ${game.level + 1}: ${game.def.name}\n${game.def.intro}\nCut ${game.target} in ${game.def.seconds} s`;
  } else if (game.state === 'paused') text = menuOpen ? '' : 'Paused\nPress ▶ or P to continue';
  else if (game.state === 'cleared') {
    text = `Level ${game.level + 1} cleared!\n${summary}` + (game.hasStarter ? '\nSlice to continue' : '');
  } else if (game.state === 'over') {
    text = `Level ${game.level + 1}: time's up at ${s.fruit} / ${game.target}\n${game.score} points · best ${game.best}` +
      (game.hasStarter ? '\nSlice to retry' : '');
  }
  if (text !== bannerText) {
    bannerText = text;
    banner.textContent = text;
    banner.hidden = !text;
  }
}

// Shake scales with trauma squared, so one cut nudges and a combo rattles.
function updateShake(dt: number): void {
  if (trauma <= 0) {
    if (stage.style.transform) stage.style.transform = '';
    return;
  }
  const amp = trauma * trauma * CONFIG.feel.shakePx;
  const x = (Math.random() * 2 - 1) * amp;
  const y = (Math.random() * 2 - 1) * amp;
  stage.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  trauma = Math.max(0, trauma - dt * CONFIG.feel.traumaDecay);
}

function renderFrame(now: number): void {
  if (!running) return; // quit: the title loop draws instead
  const dt = lastRenderNow ? Math.min((now - lastRenderNow) / 1000, 0.05) : 0;
  lastRenderNow = now;

  const t = clock.now();
  game.update(t);
  for (const e of game.events.splice(0)) onGameEvent(e);
  effects.update(dt, game.rules.gravity * height, t);
  updateShake(dt);

  // Background layer: raw camera (or the backdrop in cutout views) and juice stains.
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (handMask.mode === 'camera') {
    bgCtx.drawImage(handCanvas, 0, 0, width, height);
    bgCtx.fillStyle = 'rgba(10, 6, 20, 0.3)';
    bgCtx.fillRect(0, 0, width, height);
  } else {
    backdrop.draw(bgCtx, t, width, height);
  }
  effects.drawStains(bgCtx, t);

  scene.render(game);

  // Foreground layer: the hand cutout (if any) over the fruit, then juice, trails and text.
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fxCtx.clearRect(0, 0, width, height);
  if (handMask.mode !== 'camera') {
    fxCtx.globalAlpha = 0.6;
    mapper.drawCover(fxCtx, handMask.aura, dpr);
    fxCtx.globalAlpha = 1;
    fxCtx.drawImage(handCanvas, 0, 0, width, height);
  }
  effects.drawFx(fxCtx, t, width, height);
  for (let i = 0; i < game.fingers; i++) {
    drawTrail(fxCtx, blades[i].samples, lastCameraT);
    const tip = blades[i].latest;
    if (lastHand && tip) drawFingertip(fxCtx, tip, blades[i].armed);
  }
  if (settings.debug && lastHand) drawLandmarks(fxCtx, lastHand, mapper);

  updateHud();
  if (settings.debug && now - lastStatsUpdate > 250) {
    statsPanel.textContent = stats.text(tracker.delegate, video);
    lastStatsUpdate = now;
  }
  requestAnimationFrame(renderFrame);
}

function captureTimeOf(now: number, meta: VideoFrameCallbackMetadata): number {
  // captureTime shares performance.now()'s clock, but isn't always provided.
  const c = meta.captureTime;
  return c !== undefined && c <= now && c > now - 1000 ? c : now;
}

function runCameraLoop(): void {
  if (cameraLoopStarted) return; // the callbacks below outlive a quit and pick up the next stream
  cameraLoopStarted = true;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const onFrame = (now: number, meta: VideoFrameCallbackMetadata) => {
      if (running) onCameraFrame(captureTimeOf(now, meta));
      video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
    return;
  }
  // Fallback for browsers without requestVideoFrameCallback: poll for new frames.
  let lastVideoTime = -1;
  const poll = () => {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      if (running) onCameraFrame(performance.now());
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

async function start(): Promise<void> {
  sfx.unlock();
  music.attach(sfx.context);
  startButton.disabled = true;
  startStatus.textContent = 'Starting camera and hand tracking…';
  try {
    [, tracker] = await Promise.all([startCamera(video, fakeCamera?.stream), preloadTracker()]);
    if (handMask.needsSegmenter()) ensureSegmenter();
  } catch (err) {
    startButton.disabled = false;
    startButton.textContent = 'Try again';
    startStatus.textContent =
      err instanceof CameraError ? err.message : "Couldn't load hand tracking. Check your connection and try again.";
    console.error(err);
    return;
  }
  hideTitle();
  startScreen.hidden = true;
  settingsButton.hidden = false;
  hint.hidden = false;
  if (settings.music) music.start();
  running = true;
  runCameraLoop();
  requestAnimationFrame(renderFrame);
}

// If something throws past every handler, say so instead of freezing silently.
function showCrash(reason: unknown): void {
  if (String(reason).includes('ResizeObserver')) return; // benign browser noise
  crashEl.hidden = false;
  console.error(reason);
}
window.addEventListener('error', (e) => showCrash(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showCrash(e.reason));
crashReload.addEventListener('click', () => location.reload());

// A hidden tab gets no frames and would drift out of time, so audio stops with it.
document.addEventListener('visibilitychange', () => {
  const ctx = sfx.context;
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else void ctx.resume();
});

// Dev-only handle for poking at the game from the browser console. injectHand
// feeds fake landmarks through the real pipeline when no hand is tracked.
if (import.meta.env.DEV) {
  Object.assign(window, {
    fruitcut: {
      game,
      blades,
      blade: blades[0],
      effects,
      handMask,
      music,
      quit,
      openBoard,
      injectHand: (hand: NormalizedLandmark[] | null) => {
        devHand = hand;
        fakeCamera?.setHand(hand ? hand[9].x : null, hand ? hand[9].y : 0);
      },
      // Hovers in place (like the starter fruit) so it can be aimed at.
      addBomb: (x = width / 2, y = height * 0.55) =>
        game.fruits.push(
          new Fruit({ id: -Date.now(), kind: BOMB, x, y, vx: 0, vy: 0, radius: 0.07 * height, spinAxis: [0, 1, 0], spinRate: 0.8, starter: true }),
        ),
      // Every kind in rows, stems up and tipped toward the camera, for art review.
      showcase: () => {
        game.fruits.length = 0;
        const perRow = 10;
        const rows = Math.ceil(FRUIT_KINDS.length / perRow);
        FRUIT_KINDS.forEach((kind, i) => {
          const row = Math.floor(i / perRow);
          const col = i % perRow;
          const f = new Fruit({
            id: -1000 - i, kind, x: (width * (col + 1)) / (perRow + 1), y: (height * (row + 1)) / (rows + 1), vx: 0, vy: 0,
            radius: 0.05 * height * kind.size, spinAxis: [1, 0, 0], spinRate: 0, starter: true,
          });
          f.spinAngle = 0.45;
          game.fruits.push(f);
        });
      },
    },
  });
  if (new URLSearchParams(location.search).has('fakecam')) {
    const { createFakeCamera } = await import('./devcam');
    fakeCamera = createFakeCamera();
    startButton.textContent = 'Play (fake camera)';
  }
}

resize();
applySettings();
showTitle();
// The logo's width changes once the display font arrives; the halves sit beside it.
document.fonts?.ready.then(() => titleActive && buildTitle());
vibrationRow.hidden = !('vibrate' in navigator);
window.addEventListener('resize', resize);
startButton.addEventListener('click', start);
settingsButton.addEventListener('click', openSettings);
pauseButton.addEventListener('click', togglePause);
settingsLink.addEventListener('click', openSettings);
playerNameInput.value = player.name;
playerNameInput.addEventListener('change', () => setName(playerNameInput.value));
boardLink.addEventListener('click', () => void openBoard());
boardClose.addEventListener('click', closeBoard);
boardQuit.addEventListener('click', quit);
boardForm.addEventListener('submit', (e) => {
  e.preventDefault();
  setName(boardName.value);
  const pending = pendingScore;
  void (pending ? recordScore(pending.score, pending.level) : Promise.resolve()).then(openBoard);
});
menuContinue.addEventListener('click', closeMenu);
menuBoard.addEventListener('click', () => void openBoard());
menuQuit.addEventListener('click', quit);
settingsForm.addEventListener('change', readSettingsForm);
window.addEventListener('keydown', (e) => {
  if (settingsDialog.open) return; // the dialog handles its own keys
  if (e.target instanceof HTMLInputElement) return; // typing a name
  const key = e.key.toLowerCase();
  if (key === 'p' || key === 'escape') togglePause();
  if (key === 'd') {
    settings = { ...settings, debug: !settings.debug };
    applySettings();
  }
  if (key === 'r' && tracker) toggleRecording();
  if (key === 'm' && tracker) {
    const mode = handMask.cycleMode();
    if (handMask.needsSegmenter(mode)) ensureSegmenter();
    showToast(`Camera view: ${mode}`);
  }
});
