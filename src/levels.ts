// Level table. Each level adds one idea: a few new kinds, denser waves, bombs,
// a frenzy ending, or another finger on the blade. Goals are roughly a third
// of what gets launched, so a decent player clears each level with time to
// spare and a first-timer fails only the later ones. Tune here, nowhere else.

export interface LevelDef {
  name: string;
  seconds: number;
  target: number; // fruit to cut before time runs out
  fingers: 1 | 2 | 3 | 4; // fingertips that act as blades (index first)
  kinds: string[]; // names from fruitTypes
  waveSize: [number, number]; // fruit per wave, inclusive
  intervalMs: [number, number]; // time between waves at the start and end of the level
  bombChance: [number, number]; // per wave, start → end; 0 for none
  frenzy: boolean; // dense bomb-free burst in the last seconds
  intro: string; // one line shown when the level starts
}

const BASIC = ['apple', 'banana', 'orange', 'watermelon'];
const CITRUS = [...BASIC, 'lemon', 'lime', 'grapefruit'];
const ORCHARD = [...CITRUS, 'kiwi', 'plum', 'pear', 'peach', 'apricot', 'cherry', 'tomato', 'potato'];
const BERRIES = [...ORCHARD, 'strawberry', 'raspberry', 'blackberry', 'grapes', 'mango'];
const TROPICS = [...BERRIES, 'pineapple', 'pomegranate', 'dragon fruit', 'papaya', 'lychee'];
const MARKET = [...TROPICS, 'coconut', 'avocado', 'fig', 'passion fruit', 'guava', 'persimmon', 'cantaloupe', 'eggplant', 'pumpkin'];

export const LEVELS: LevelDef[] = [
  { name: 'Orchard', seconds: 30, target: 10, fingers: 1, kinds: BASIC, waveSize: [1, 1], intervalMs: [1500, 1200], bombChance: [0, 0], frenzy: false, intro: 'Cut 10 fruit with your index finger' },
  { name: 'Citrus grove', seconds: 35, target: 15, fingers: 1, kinds: CITRUS, waveSize: [1, 2], intervalMs: [1400, 1000], bombChance: [0, 0], frenzy: false, intro: 'Fruit now come in pairs' },
  { name: 'Two-finger blade', seconds: 40, target: 22, fingers: 2, kinds: ORCHARD, waveSize: [1, 2], intervalMs: [1300, 900], bombChance: [0.05, 0.1], frenzy: false, intro: 'Your middle finger cuts too. Watch for bombs' },
  { name: 'Berry patch', seconds: 45, target: 30, fingers: 2, kinds: BERRIES, waveSize: [1, 3], intervalMs: [1200, 800], bombChance: [0.06, 0.14], frenzy: true, intro: 'Triples, and a frenzy at the end' },
  { name: 'Three fingers', seconds: 50, target: 40, fingers: 3, kinds: TROPICS, waveSize: [2, 3], intervalMs: [1100, 700], bombChance: [0.08, 0.18], frenzy: true, intro: 'Three fingers, and the tropics join in' },
  { name: 'Market day', seconds: 55, target: 52, fingers: 3, kinds: MARKET, waveSize: [2, 3], intervalMs: [1000, 650], bombChance: [0.1, 0.2], frenzy: true, intro: 'Everything from the market, vegetables too' },
  { name: 'Four-finger blade', seconds: 60, target: 68, fingers: 4, kinds: MARKET, waveSize: [2, 4], intervalMs: [900, 550], bombChance: [0.1, 0.22], frenzy: true, intro: 'All four fingers. Sweep wide' },
  { name: 'Harvest storm', seconds: 60, target: 85, fingers: 4, kinds: MARKET, waveSize: [3, 4], intervalMs: [800, 450], bombChance: [0.12, 0.24], frenzy: true, intro: 'Hold on' },
];

/** Levels past the table repeat the last one with a bigger goal. */
export function levelAt(index: number): LevelDef {
  const last = LEVELS.length - 1;
  if (index <= last) return LEVELS[index];
  const extra = index - last;
  return { ...LEVELS[last], name: `${LEVELS[last].name} ${extra + 1}`, target: LEVELS[last].target + extra * 15 };
}
