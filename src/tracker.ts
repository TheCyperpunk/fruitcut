import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { CONFIG } from './config';

export interface Tracker {
  delegate: 'GPU' | 'CPU';
  detect(source: HTMLVideoElement, timestampMs: number): HandLandmarkerResult;
}

export type Progress = (loadedBytes: number, totalBytes: number) => void;

// Guesses for the progress bar until each response's Content-Length arrives.
const WASM_BYTES = 14_500_000;
const MODEL_BYTES = 7_800_000;

/** MediaPipe loads its SIMD build when the browser has SIMD; prefetch the same one. */
function wasmVariant(): string {
  const simd = WebAssembly.validate(
    new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]),
  );
  return simd ? 'vision_wasm_internal' : 'vision_wasm_nosimd_internal';
}

/** GET with a byte counter. */
async function download(url: string, guess: number, onBytes: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || guess;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onBytes(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Loads the hand landmarker. The runtime (wasm) and model are fetched here
 * first so the title screen can show progress: the model is handed over as
 * bytes, and the wasm comes back out of the HTTP cache when MediaPipe asks
 * for it.
 */
export async function createTracker(onProgress?: Progress): Promise<Tracker> {
  const base = import.meta.env.BASE_URL;
  const loaded = [0, 0];
  const totals = [WASM_BYTES, MODEL_BYTES];
  const report = (i: number) => (l: number, t: number) => {
    loaded[i] = l;
    totals[i] = t;
    onProgress?.(loaded[0] + loaded[1], totals[0] + totals[1]);
  };
  const [, model] = await Promise.all([
    download(`${base}wasm/${wasmVariant()}.wasm`, WASM_BYTES, report(0)),
    download(`${base}models/hand_landmarker.task`, MODEL_BYTES, report(1)),
  ]);
  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`);

  const create = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: 'VIDEO',
      numHands: CONFIG.tracking.numHands,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  let delegate: Tracker['delegate'] = 'GPU';
  let landmarker: HandLandmarker;
  try {
    landmarker = await create('GPU');
  } catch (err) {
    console.warn('GPU hand tracking unavailable, falling back to CPU', err);
    delegate = 'CPU';
    landmarker = await create('CPU');
  }

  return {
    delegate,
    detect: (source, timestampMs) => landmarker.detectForVideo(source, timestampMs),
  };
}
