// Copies MediaPipe's WASM runtime into public/ so the game works offline
// without pulling it from a CDN at runtime.
import { cpSync, existsSync } from 'node:fs';

const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dest = 'public/wasm';

if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
  console.log(`copied ${src} -> ${dest}`);
}
