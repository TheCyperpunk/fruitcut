// Tunables in one place. Distances and speeds are in screen heights so the
// feel is the same on a laptop and a phone.
export const CONFIG = {
  filter: {
    minCutoff: 1.2, // Hz; lower = steadier when the hand is still
    beta: 8, // how fast the cutoff rises with speed; higher = less lag on swipes
    dCutoff: 1.0,
  },
  blade: {
    trailMs: 160, // how long a trail segment stays visible
    maxGapMs: 100, // a tracking dropout shorter than this does not break the stroke (one frame at 30 fps is 66 ms)
    minSpeed: 1.5, // screen heights per second needed to count as a slicing swipe
    maxSpeed: 12, // faster than any hand: treated as a tracking glitch and starts a new stroke
    rampRatio: 0.5, // the previous sample must already be this fraction of minSpeed (hands don't teleport)
    minTurnDot: -0.2, // a sharper reversal than this starts a new stroke (glitch out-and-back)
    minPath: 0.06, // screen heights travelled within pathWindowMs; filters single jitter jumps
    pathWindowMs: 120,
  },
  calibration: {
    // The swipe that cuts the starter fruit sets the slice threshold for the
    // round: minSpeed = clamp(peak swipe speed × ratio, floor, blade.minSpeed)
    ratio: 0.4,
    floor: 0.8,
  },
  game: {
    gravity: 1.4, // screen heights per second²
    fruitRadius: 0.07, // screen heights, before each fruit's size multiplier
    hitMargin: 1.15, // forgiveness: hit radius as a multiple of the fruit radius
    comboGapMs: 400, // fruits cut in one swipe within this gap build a combo
    bombStart: 0.12, // fraction of a level before its first bomb can appear
    bombPenaltySeconds: 5,
    frenzySeconds: 8, // final stretch of a frenzy level: dense fruit, no bombs
  },
  feel: {
    hitStopMs: 45, // fruit freezes this long on a cut; feels like resistance
    hitStopComboMs: 15, // added per combo level, capped below
    hitStopMaxMs: 90,
    shakePx: 12, // maximum screen shake at full trauma
    traumaPerSlice: 0.3,
    traumaDecay: 2.6, // trauma lost per second
  },
  mask: {
    // 'hand': camera pixels only around the tracked hand (person mask ∩ hand region)
    // 'person': the whole player; 'landmarks': hand shape from landmarks, no ML;
    // 'camera': the raw camera feed as the background
    mode: 'camera' as 'hand' | 'person' | 'landmarks' | 'camera',
    holdMs: 250, // keep showing the last hand region this long after tracking drops
    maxMs: 30, // fall back to 'landmarks' if segmentation averages slower than this
    auto: true,
    edgeLow: 0.35, // person-confidence range mapped to transparent → opaque
    edgeHigh: 0.7,
  },
  tracking: {
    numHands: 1,
    tipLandmark: 8, // index fingertip
  },
  debug: false,
};
