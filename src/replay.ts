import { Blade } from './blade';
import { CONFIG } from './config';
import type { Game } from './game';
import type { Recording } from './recorder';
import { CoverMapper } from './view';

export interface ReplayResult {
  slices: number;
  peakSpeed: number;
}

// Feeds a recording through the same blade and slicing rules the game uses.
// Fruit must already be in `game` (or be its starter) before calling.
export function replay(rec: Recording, game: Game): ReplayResult {
  const blade = new Blade();
  const mapper = new CoverMapper();
  mapper.update(rec.video.w, rec.video.h, rec.screen.w, rec.screen.h);
  game.resize(rec.screen.w, rec.screen.h);

  let slices = 0;
  let peakSpeed = 0;
  for (const frame of rec.frames) {
    game.update(frame.t);
    if (!frame.lm) continue;
    const tip = CONFIG.tracking.tipLandmark;
    const p = mapper.toScreen(frame.lm[tip * 2], frame.lm[tip * 2 + 1]);
    const cur = blade.push(p.x, p.y, frame.t, rec.screen.h);
    const prev = blade.previous;
    if (prev) game.handleBlade(prev, cur, blade.strokeInfo());
    peakSpeed = Math.max(peakSpeed, cur.speed);
    for (const e of game.events.splice(0)) {
      if (e.type === 'slice') slices++;
      if (e.type === 'calibrated') blade.minSpeed = e.minSpeed;
    }
  }
  return { slices, peakSpeed };
}
