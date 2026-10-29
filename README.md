# fruitcut

Slice flying fruit with your bare hand in front of a webcam or phone camera.
Runs entirely in the browser; the video never leaves the device.

## Run it

```
npm install
npm run dev          # http://localhost:5173 on this computer
npm run dev:phone    # https address for a phone on the same Wi-Fi (accept the certificate warning)
npm test             # slicing rules, replayed trajectories, gestures
npm run build        # static site in dist/
```

## Play

1. Stand an arm's length or more from the camera, raise one hand.
2. Slice the floating watermelon with your index finger to start level 1.
3. Each level has a goal (fruit to cut) and a time limit. Reach the goal → level
   cleared, slice the watermelon to continue. Run out of time → slice to retry.
4. Levels add kinds (30 fruit plus tomato, potato, eggplant and pumpkin by the end), denser waves, bombs and
   a frenzy ending, and from level 3 on, more fingers: index + middle, then three,
   then all four fingertips cut at once. Sweep wide.
5. Each fruit is +1; three or more in one swipe (any fingers) is a combo worth +2 each.
6. Don't cut the spiked bombs: each costs 5 seconds and breaks your combo. A fist
   never slices, so make one when a bomb passes.
7. The ❚❚ button (or **P** / **Esc**) opens the menu: continue, scoreboard, or
   quit to the title (which turns the camera off).
8. When time runs out the scoreboard appears. Enter a name once and your best
   run is saved under it; everyone who plays sees the same board.

## Scoreboard

Scores live in a small Supabase table (`public.scores`, one row per player
with their best run). The player's name and a random id are kept in the
browser's localStorage, so there is no login. The table is readable by anyone;
writes only go through the `submit_score` function, which checks the name and
score range and keeps the best. Configure it with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (a `.env.local` locally, project env on Vercel);
without them the board is kept on the device only.

The level table is `src/levels.ts`; every number in it is meant to be tuned.

Settings (gear button, or the link on the start screen): sound effects, music,
vibration, reduce motion, bombs on/off, relaxed pace, large fruit, gentle swipe
sensitivity, debug stats. The music is an 80s synthwave loop synthesized in
`src/music.ts` (no audio files); it starts with the camera, ducks while paused,
and brightens during a frenzy. Keys: **P**/**Esc** pause, **D** debug overlay, **M** camera view (raw
camera / hand cutout / whole person / landmark hand shape), **R** record hand
landmarks to a JSON file for replay tests.

## How slicing works

- MediaPipe Hand Landmarker finds 21 hand points per camera frame; the index
  fingertip is the blade, smoothed with a One Euro filter.
- Each pair of consecutive fingertip samples forms a segment that is tested
  against every fruit, at the fruit's position when that frame was captured.
- A cut needs: speed above the threshold, the previous sample already moving,
  a non-reversing stroke, and some real path behind it. One-frame tracking
  glitches fail these; a tracking dropout under 60 ms does not break a stroke.
- The swipe that cuts the starter watermelon calibrates the threshold for the
  round (gentle swipers get a lower one; it never goes above the default).

Tuning lives in `src/config.ts`. Game rules in `src/game.ts` have no DOM
dependencies, so `tests/` drive them directly, including replayed recordings.
