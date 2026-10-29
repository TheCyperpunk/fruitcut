export type SkinPattern =
  | 'stripes' // watermelon
  | 'speckle' // citrus pores (bumpy)
  | 'fuzzy' // kiwi
  | 'shine' // apple streaks and lenticels
  | 'bloom' // plum haze and crease
  | 'plain' // smooth, lightly mottled
  | 'dots' // strawberry seeds in pits
  | 'bumpy' // avocado
  | 'husk' // coconut fibres
  | 'banana' // ridge lines and brown speckles
  | 'peach' // blush, crease, fine fuzz
  | 'scales' // pineapple: hexagonal eyes, each with a withered bract
  | 'leafy' // dragon fruit: big soft overlapping scales with green tips
  | 'blush' // mango: green shoulder, red sun blush, lenticel freckles
  | 'net' // cantaloupe webbing
  | 'drupelets' // raspberry, blackberry, lychee: a lattice of little bumps
  | 'wrinkled' // passion fruit
  | 'fig' // bloom with lengthwise streaks
  | 'ribs' // pumpkin: grooves from pole to pole
  | 'potato'; // dusty earth-brown skin with eyes
export type FleshPattern = 'seeds' | 'segments' | 'core' | 'kiwi' | 'hollow' | 'solid' | 'arils' | 'pit' | 'speckled' | 'seedcavity' | 'locules';
export type Profile =
  | 'apple' | 'orange' | 'lemon' | 'lime' | 'melon' | 'kiwi' | 'plum' | 'pear' | 'strawberry' | 'mango'
  | 'squat' | 'sphere' | 'pineapple' | 'papaya' | 'fig' | 'tomato' | 'eggplant' | 'pumpkin' | 'potato';
export type StemStyle = 'apple' | 'button' | 'plum' | 'melon' | 'calyx' | 'crown' | 'cherry' | 'cap' | 'stalk' | 'none';

/** A curved fruit: a cross-section swept along an arc (banana). */
export interface SweepSpec {
  bend: number; // total arc angle, radians
  thickness: number; // cross-section radius at the thickest point
  taper: [number, number]; // how the stem end and the tip end narrow; bigger = pointier
  sides: number; // ridges around the cross-section (5 for a banana), 0 for round
  ridge: number; // ridge depth as a fraction of the radius
  length: number; // half the end-to-end span, in unit-fruit space
}

/** A bunch of berries (grapes): rings of spheres, widest at the top. */
export interface ClusterSpec {
  berryRadius: number;
  layers: { count: number; ring: number }[]; // top to bottom; `ring` is the ring radius in berry radii
  spacing: number; // vertical distance between layers, in berry radii
}

export interface FruitKind {
  name: string;
  size: number; // radius multiplier
  profile: Profile; // silhouette, see shapes.ts (ignored when `sweep` or `cluster` is set)
  sweep?: SweepSpec;
  cluster?: ClusterSpec;
  stem: StemStyle; // stem, leaf or button on top
  shape: [number, number, number]; // extra scale; local y is the stem axis
  skin: string;
  skinDetail: string;
  skinEnds?: string; // tint toward the two poles
  skinPattern: SkinPattern;
  skinParam?: number; // pattern-specific, e.g. drupelet size
  rind: string;
  rindWidth: number; // fraction of the cut face that is rind
  flesh: string;
  fleshDetail: string;
  fleshPattern: FleshPattern;
  fleshParam?: number; // pattern-specific, e.g. pit or cavity radius as a fraction of the flesh
  seed?: string; // seed colour where the flesh pattern shows seeds (dark by default)
  juice: string;
  hazard?: boolean; // cutting it hurts instead of scoring
}

export const FRUIT_KINDS: FruitKind[] = [
  {
    name: 'watermelon', size: 1.35, profile: 'melon', stem: 'melon', shape: [1, 1, 1],
    skin: '#6fb53a', skinDetail: '#1d4d1c', skinEnds: '#5a9c33', skinPattern: 'stripes',
    rind: '#e9f7c9', rindWidth: 0.16, flesh: '#ff3b55', fleshDetail: '#1a1214', fleshPattern: 'seeds', juice: '#ff2d4a',
  },
  {
    name: 'banana', size: 1.4, profile: 'sphere', stem: 'melon', shape: [1, 1, 1],
    sweep: { bend: 1.7, thickness: 0.3, taper: [0.7, 0.7], sides: 5, ridge: 0.8, length: 1 },
    skin: '#f0c22e', skinDetail: '#5a3a14', skinEnds: '#8fae3a', skinPattern: 'banana',
    rind: '#f9f0c2', rindWidth: 0.07, flesh: '#f7edc9', fleshDetail: '#5a4324', fleshPattern: 'solid', juice: '#f4e4a0',
  },
  {
    name: 'orange', size: 1, profile: 'orange', stem: 'button', shape: [1, 1, 1],
    skin: '#ff7f12', skinDetail: '#ffb15c', skinEnds: '#ec6e0c', skinPattern: 'speckle',
    rind: '#fff1d6', rindWidth: 0.09, flesh: '#ffa431', fleshDetail: '#ffe2b0', fleshPattern: 'segments', juice: '#ffa000',
  },
  {
    name: 'lemon', size: 0.9, profile: 'lemon', stem: 'button', shape: [1, 1, 1],
    skin: '#f7c800', skinDetail: '#fff08a', skinEnds: '#c4bd1e', skinPattern: 'speckle',
    rind: '#fffbe3', rindWidth: 0.1, flesh: '#fff06a', fleshDetail: '#fffde0', fleshPattern: 'segments', juice: '#ffe600',
  },
  {
    name: 'lime', size: 0.82, profile: 'lime', stem: 'button', shape: [1, 1, 1],
    skin: '#4aa534', skinDetail: '#9fe36d', skinEnds: '#3a8a2a', skinPattern: 'speckle',
    rind: '#eaffd6', rindWidth: 0.09, flesh: '#b6f27a', fleshDetail: '#f0ffd0', fleshPattern: 'segments', juice: '#9be15d',
  },
  {
    name: 'grapefruit', size: 1.25, profile: 'orange', stem: 'button', shape: [1, 1, 1],
    skin: '#ef9638', skinDetail: '#f07a5a', skinEnds: '#e08a30', skinPattern: 'speckle',
    rind: '#fde7d7', rindWidth: 0.1, flesh: '#ff7f8a', fleshDetail: '#ffd0d4', fleshPattern: 'segments', juice: '#ff6f7a',
  },
  {
    name: 'apple', size: 0.95, profile: 'apple', stem: 'apple', shape: [1, 1, 1],
    skin: '#c8202f', skinDetail: '#f2c84b', skinEnds: '#8f1420', skinPattern: 'shine',
    rind: '#fff6dc', rindWidth: 0.04, flesh: '#fff2c2', fleshDetail: '#5a3417', fleshPattern: 'core', juice: '#ffd23f',
  },
  {
    name: 'pear', size: 0.95, profile: 'pear', stem: 'apple', shape: [1, 1, 1],
    skin: '#b7c84a', skinDetail: '#8a6a2f', skinEnds: '#9fae3a', skinPattern: 'speckle',
    rind: '#f5f7d9', rindWidth: 0.04, flesh: '#fbf6d8', fleshDetail: '#6b4a1e', fleshPattern: 'core', juice: '#e8e58a',
  },
  {
    name: 'kiwi', size: 0.85, profile: 'kiwi', stem: 'none', shape: [1, 1, 1],
    skin: '#8a6a43', skinDetail: '#5e4529', skinPattern: 'fuzzy',
    rind: '#c8e6a0', rindWidth: 0.06, flesh: '#7cc242', fleshDetail: '#14100a', fleshPattern: 'kiwi', juice: '#9ccc65',
  },
  {
    name: 'plum', size: 0.88, profile: 'plum', stem: 'plum', shape: [1, 1, 1],
    skin: '#4a1d6e', skinDetail: '#b79ad0', skinEnds: '#36124f', skinPattern: 'bloom',
    rind: '#f3e8ff', rindWidth: 0.04, flesh: '#f9d976', fleshDetail: '#6b3a1e', fleshPattern: 'core', juice: '#8b3fd9',
  },
  {
    name: 'peach', size: 0.95, profile: 'plum', stem: 'plum', shape: [1, 1, 1],
    skin: '#f6b26b', skinDetail: '#e8553e', skinEnds: '#f0a050', skinPattern: 'peach',
    rind: '#ffe4c4', rindWidth: 0.05, flesh: '#ffcf80', fleshDetail: '#8a4b2a', fleshPattern: 'pit', fleshParam: 0.28, juice: '#ffb35c',
  },
  {
    name: 'apricot', size: 0.78, profile: 'plum', stem: 'plum', shape: [1, 1, 1],
    skin: '#f5a742', skinDetail: '#e8663a', skinEnds: '#f0b060', skinPattern: 'peach',
    rind: '#ffe2b8', rindWidth: 0.05, flesh: '#ffb347', fleshDetail: '#7a4a2a', fleshPattern: 'pit', fleshParam: 0.3, juice: '#ffa63d',
  },
  {
    name: 'cherry', size: 0.62, profile: 'plum', stem: 'cherry', shape: [1, 1, 1],
    skin: '#8e0f2a', skinDetail: '#ff6a7a', skinEnds: '#5e0a1c', skinPattern: 'plain',
    rind: '#ffd1d8', rindWidth: 0.06, flesh: '#c9183a', fleshDetail: '#5a3a1e', fleshPattern: 'pit', fleshParam: 0.22, juice: '#c8102e',
  },
  {
    name: 'strawberry', size: 0.8, profile: 'strawberry', stem: 'calyx', shape: [1, 1, 1],
    skin: '#e0213a', skinDetail: '#f7d65a', skinEnds: '#f05a5a', skinPattern: 'dots',
    rind: '#ffd7dc', rindWidth: 0.08, flesh: '#ff6f86', fleshDetail: '#fff2f4', fleshPattern: 'solid', juice: '#ff2e4c',
  },
  {
    name: 'raspberry', size: 0.68, profile: 'strawberry', stem: 'none', shape: [1, 1, 1],
    skin: '#d6204b', skinDetail: '#ff6f8f', skinEnds: '#b0163d', skinPattern: 'drupelets', skinParam: 0.1,
    rind: '#f7c9d4', rindWidth: 0.06, flesh: '#ffe9ee', fleshDetail: '#f2a7b8', fleshPattern: 'hollow', juice: '#e0245c',
  },
  {
    name: 'blackberry', size: 0.65, profile: 'kiwi', stem: 'none', shape: [1, 1, 1],
    skin: '#241530', skinDetail: '#5a3a6e', skinEnds: '#120a18', skinPattern: 'drupelets', skinParam: 0.09,
    rind: '#6a4a7a', rindWidth: 0.05, flesh: '#5b2a6e', fleshDetail: '#8a4a9e', fleshPattern: 'solid', juice: '#5e1a6e',
  },
  {
    name: 'grapes', size: 1.15, profile: 'sphere', stem: 'plum', shape: [1, 1, 1],
    cluster: { berryRadius: 0.3, layers: [{ count: 6, ring: 2.1 }, { count: 5, ring: 1.75 }, { count: 3, ring: 1.1 }, { count: 1, ring: 0 }], spacing: 1.45 },
    skin: '#4b2a6e', skinDetail: '#b79ad0', skinEnds: '#3a1f55', skinPattern: 'plain',
    rind: '#e8dcf2', rindWidth: 0.04, flesh: '#cfe8a8', fleshDetail: '#e9f5d0', fleshPattern: 'solid', juice: '#7a3fa0',
  },
  {
    name: 'mango', size: 1.05, profile: 'mango', stem: 'plum', shape: [1, 1, 1],
    skin: '#f2b01e', skinDetail: '#e0452b', skinEnds: '#8cbf2a', skinPattern: 'blush',
    rind: '#ffe9a8', rindWidth: 0.05, flesh: '#ffb62e', fleshDetail: '#f5e3b0', fleshPattern: 'solid', juice: '#ffb300',
  },
  {
    name: 'pineapple', size: 1.3, profile: 'pineapple', stem: 'crown', shape: [1, 1, 1],
    skin: '#c98a2a', skinDetail: '#e8b040', skinPattern: 'scales', // ends are tinted by the pattern: green crown end, orange base
    rind: '#f3d99a', rindWidth: 0.1, flesh: '#ffd84d', fleshDetail: '#fff0b0', fleshPattern: 'solid', juice: '#ffd23f',
  },
  {
    name: 'pomegranate', size: 1, profile: 'orange', stem: 'calyx', shape: [1, 1, 1],
    skin: '#b4162f', skinDetail: '#e0506a', skinEnds: '#7a0f22', skinPattern: 'plain',
    rind: '#f6e0d6', rindWidth: 0.08, flesh: '#f3e5e5', fleshDetail: '#c81e3c', fleshPattern: 'arils', juice: '#c8102e',
  },
  {
    name: 'dragon fruit', size: 1.05, profile: 'mango', stem: 'none', shape: [1, 1, 1],
    skin: '#e8307a', skinDetail: '#ff9cc8', skinEnds: '#c21e63', skinPattern: 'leafy',
    rind: '#ff9fcb', rindWidth: 0.07, flesh: '#f8f5f2', fleshDetail: '#111111', fleshPattern: 'speckled', juice: '#ff4d94',
  },
  {
    name: 'papaya', size: 1.3, profile: 'papaya', stem: 'plum', shape: [1, 1, 1],
    skin: '#f2a93b', skinDetail: '#8cbf2a', skinEnds: '#7fb33a', skinPattern: 'plain',
    rind: '#f8d9a0', rindWidth: 0.06, flesh: '#ff9a4a', fleshDetail: '#ffb870', fleshPattern: 'seedcavity', fleshParam: 0.4, juice: '#ff9f3d',
  },
  {
    name: 'lychee', size: 0.6, profile: 'plum', stem: 'plum', shape: [1, 1, 1],
    skin: '#d9484a', skinDetail: '#ff8f8a', skinEnds: '#b2322f', skinPattern: 'drupelets', skinParam: 0.05,
    rind: '#f7d6d0', rindWidth: 0.08, flesh: '#fbf5ee', fleshDetail: '#4a2a1e', fleshPattern: 'pit', fleshParam: 0.3, juice: '#f3e6dc',
  },
  {
    name: 'coconut', size: 1, profile: 'sphere', stem: 'none', shape: [1, 1, 1],
    skin: '#6b4a2b', skinDetail: '#3d2816', skinEnds: '#5a3d22', skinPattern: 'husk',
    rind: '#8a6a43', rindWidth: 0.12, flesh: '#fbfbf4', fleshDetail: '#3b2a1a', fleshPattern: 'hollow', juice: '#f4f1e6',
  },
  {
    name: 'avocado', size: 1, profile: 'pear', stem: 'plum', shape: [1, 1, 1],
    skin: '#2f4a22', skinDetail: '#4f7a34', skinEnds: '#1f3316', skinPattern: 'bumpy',
    rind: '#5a7a3a', rindWidth: 0.05, flesh: '#c9df7a', fleshDetail: '#7a4a26', fleshPattern: 'pit', fleshParam: 0.42, juice: '#b5d16a',
  },
  {
    name: 'fig', size: 0.85, profile: 'fig', stem: 'plum', shape: [1, 1, 1],
    skin: '#5b2a5e', skinDetail: '#9fb86b', skinEnds: '#3e1b42', skinPattern: 'fig',
    rind: '#e8d8e8', rindWidth: 0.06, flesh: '#e85a7a', fleshDetail: '#ffd9c0', fleshPattern: 'speckled', juice: '#d94a70',
  },
  {
    name: 'passion fruit', size: 0.8, profile: 'sphere', stem: 'none', shape: [1, 1, 1],
    skin: '#5a2a66', skinDetail: '#2a1030', skinEnds: '#4a2256', skinPattern: 'wrinkled',
    rind: '#f3e7d2', rindWidth: 0.12, flesh: '#f7c948', fleshDetail: '#f7c948', fleshPattern: 'seedcavity', fleshParam: 0.8, juice: '#f2b63a',
  },
  {
    name: 'guava', size: 0.9, profile: 'orange', stem: 'button', shape: [1, 1, 1],
    skin: '#9ccc65', skinDetail: '#6aa84f', skinEnds: '#86b84e', skinPattern: 'speckle',
    rind: '#eef7d6', rindWidth: 0.08, flesh: '#ff8fa3', fleshDetail: '#ffe6c4', fleshPattern: 'speckled', juice: '#ff8fa3',
  },
  {
    name: 'persimmon', size: 0.95, profile: 'squat', stem: 'calyx', shape: [1, 1, 1],
    skin: '#f28c28', skinDetail: '#ffb570', skinEnds: '#e07a1a', skinPattern: 'plain',
    rind: '#ffd9b0', rindWidth: 0.05, flesh: '#ffa54a', fleshDetail: '#ffd08a', fleshPattern: 'solid', juice: '#ff9a3d',
  },
  {
    name: 'cantaloupe', size: 1.25, profile: 'sphere', stem: 'melon', shape: [1, 1, 1],
    skin: '#c8b36b', skinDetail: '#efe3b8', skinEnds: '#a8984f', skinPattern: 'net',
    rind: '#d9ecb8', rindWidth: 0.12, flesh: '#ff9f4a', fleshDetail: '#ffc98a', fleshPattern: 'seedcavity', fleshParam: 0.35, juice: '#ffa64d',
  },
  // Vegetables (well, a tomato is a fruit, but it lives with these).
  {
    name: 'tomato', size: 0.95, profile: 'tomato', stem: 'calyx', shape: [1, 1, 1],
    skin: '#d4231a', skinDetail: '#ff6a4a', skinEnds: '#a81c14', skinPattern: 'plain',
    rind: '#ffb3a6', rindWidth: 0.05, flesh: '#f0503f', fleshDetail: '#ffd9ae', fleshPattern: 'locules', seed: '#f7e6a6', juice: '#e8342a',
  },
  {
    name: 'eggplant', size: 1.2, profile: 'eggplant', stem: 'cap', shape: [1, 1, 1],
    skin: '#3b1452', skinDetail: '#8a4ab0', skinEnds: '#2a0e3a', skinPattern: 'plain',
    rind: '#5c2a78', rindWidth: 0.05, flesh: '#f4edda', fleshDetail: '#b08a58', fleshPattern: 'speckled', juice: '#d9c8a8',
  },
  {
    name: 'pumpkin', size: 1.4, profile: 'pumpkin', stem: 'stalk', shape: [1, 1, 1],
    skin: '#ef7a1f', skinDetail: '#b24a0e', skinEnds: '#d86a16', skinPattern: 'ribs',
    rind: '#ffd79a', rindWidth: 0.1, flesh: '#ffa33a', fleshDetail: '#f0b860', fleshPattern: 'seedcavity', fleshParam: 0.5, seed: '#f6ecd0', juice: '#ff9a2e',
  },
  {
    name: 'potato', size: 0.85, profile: 'potato', stem: 'none', shape: [1, 1, 1],
    skin: '#b8895a', skinDetail: '#6e4a2c', skinEnds: '#a07040', skinPattern: 'potato',
    rind: '#c9a67a', rindWidth: 0.05, flesh: '#f7e7b8', fleshDetail: '#fff6d8', fleshPattern: 'solid', juice: '#efe0b0',
  },
];

export const KINDS_BY_NAME = new Map(FRUIT_KINDS.map((k) => [k.name, k]));

// A spiked mine. Its silhouette, not just its colour, says "don't cut me".
export const BOMB: FruitKind = {
  name: 'bomb', size: 1, profile: 'sphere', stem: 'none', shape: [1, 1, 1],
  skin: '#2a2a33', skinDetail: '#45454f', skinPattern: 'shine',
  rind: '#45454f', rindWidth: 0, flesh: '#45454f', fleshDetail: '#45454f', fleshPattern: 'core', juice: '#ff7a1a',
  hazard: true,
};
