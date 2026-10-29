import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ClusterSpec, Profile, StemStyle, SweepSpec } from './fruitTypes';

// Fruit geometry comes in three kinds. Most fruit are lathe profiles: (radius,
// y) from the bottom pole to the top pole, spun around the y axis. Curved
// fruit (banana) are a cross-section swept along an arc. Grapes are a cluster
// of spheres. All produce the same bundle: the whole fruit, two halves with
// their cut faces at y = 0 facing -y, and where the stem attaches.

export interface FruitGeometry {
  full: THREE.BufferGeometry;
  top: THREE.BufferGeometry; // the half that keeps the stem; cut face at y = 0 facing -y, body toward +y
  bottom: THREE.BufferGeometry; // the other half, in the same convention
  capTop: THREE.BufferGeometry; // flat cut faces, facing -y
  capBottom: THREE.BufferGeometry;
  attachFull: THREE.Matrix4; // where accessories go on the whole fruit (+y points away from the fruit)
  attachTop: THREE.Matrix4; // the same spot on the top half
}

// ---- lathe fruit ----------------------------------------------------------

const SEGMENTS = 32; // profile points per fruit; the equator is at SEGMENTS / 2

/** 1 at the pole fading to 0 at `radius` from the axis, with a smooth curve. */
function dip(r0: number, radius: number): number {
  const s = Math.max(0, Math.min(1, (radius - r0) / radius));
  return s * s;
}

export function profilePoints(profile: Profile): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const theta = (Math.PI * i) / SEGMENTS;
    const r0 = Math.sin(theta);
    const y0 = -Math.cos(theta);
    const up = Math.max(0, y0); // 0 below the equator, 1 at the top pole
    let r = r0;
    let y = y0;
    switch (profile) {
      case 'apple':
        r = r0 * (0.98 + 0.07 * y0); // broad shoulders
        y = y0 > 0 ? y0 - 0.3 * dip(r0, 0.38) : y0 + 0.14 * dip(r0, 0.3); // stem well and a small base dimple
        break;
      case 'orange':
        y = y0 * 0.96 - (y0 > 0 ? 0.07 * dip(r0, 0.22) : 0); // slightly flattened, navel on top
        break;
      case 'lemon':
        y = y0 * 1.02 + Math.sign(y0) * 0.26 * dip(r0, 0.5); // nipples at both ends
        break;
      case 'lime':
        y = y0 * 0.98 + Math.sign(y0) * 0.12 * dip(r0, 0.4);
        break;
      case 'melon':
        y = y0 * 1.18;
        break;
      case 'kiwi':
        y = y0 * 1.12;
        r = r0 * (1 - 0.06 * y0); // a little narrower at one end
        break;
      case 'plum':
        y = y0 * 0.94 - (y0 > 0 ? 0.14 * dip(r0, 0.32) : 0);
        break;
      case 'pear':
        r = r0 * (1 - 0.42 * up ** 1.3); // bulb below, neck above
        y = y0 * 1.22 - (y0 > 0 ? 0.1 * dip(r0, 0.3) : 0);
        break;
      case 'strawberry':
        r = r0 * (0.5 + 0.5 * (0.5 + 0.5 * y0)); // widest near the calyx
        y = y0 * 1.1 - (y0 < 0 ? 0.2 * dip(r0, 0.5) : 0); // drawn to a point at the bottom
        break;
      case 'mango':
        y = y0 * 1.25;
        r = r0 * (1 - 0.15 * y0);
        break;
      case 'squat':
        y = y0 * 0.85 - (y0 > 0 ? 0.12 * dip(r0, 0.35) : 0); // persimmon: flattened, dimpled on top
        break;
      case 'pineapple':
        y = y0 * 1.3;
        r = r0 ** 0.7 * 0.92; // barrel-shaped: flatter sides, rounder ends
        break;
      case 'papaya':
        y = y0 * 1.45;
        r = r0 * (1 - 0.12 * y0); // long, a little narrower toward the stem
        break;
      case 'fig':
        r = r0 * (1 - 0.3 * up ** 1.5); // round bottom, narrowing neck
        y = y0 * 1.1 - (y0 > 0 ? 0.06 * dip(r0, 0.25) : 0);
        break;
      case 'tomato':
        r = r0 * (1 + 0.04 * (1 - y0 * y0)); // plump shoulders
        y = y0 * 0.9 - (y0 > 0 ? 0.18 * dip(r0, 0.42) : 0); // flattened, sunk around the calyx
        break;
      case 'eggplant':
        r = r0 * (1 - 0.25 * up ** 1.5); // bulb below, broad shoulders the cap can lie on
        y = y0 * 1.45 - (y0 > 0 ? 0.08 * dip(r0, 0.3) : 0);
        break;
      case 'pumpkin':
        y = y0 * 0.72 - Math.sign(y0) * 0.16 * dip(r0, 0.45); // squat, sunk at both ends
        break;
      case 'potato':
        y = y0 * 1.3;
        r = r0 * (0.95 - 0.06 * y0 + 0.06 * Math.sin(theta * 2.5 + 0.8)); // oblong and a little lumpy
        break;
      case 'sphere':
        break;
    }
    points.push(new THREE.Vector2(Math.max(r, 0), y));
  }
  return points;
}

export interface HalfProfiles {
  top: THREE.Vector2[]; // equator → top pole
  bottom: THREE.Vector2[]; // equator → bottom pole, mirrored so it also rises from y = 0
  equatorRadius: number;
}

export function halfProfiles(points: THREE.Vector2[]): HalfProfiles {
  const mid = SEGMENTS / 2;
  return {
    top: points.slice(mid),
    bottom: points
      .slice(0, mid + 1)
      .map((p) => new THREE.Vector2(p.x, -p.y))
      .reverse(),
    equatorRadius: points[mid].x,
  };
}

/**
 * Lathe a profile. For halves the texture's v range is remapped so the skin
 * pattern stays the same size as on the whole fruit.
 */
export function lathe(points: THREE.Vector2[], part: 'full' | 'top' | 'bottom'): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(points, 64);
  if (part !== 'full') {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const v = uv.getY(i);
      uv.setY(i, part === 'top' ? 0.5 + 0.5 * v : 0.5 - 0.5 * v);
    }
  }
  return geometry;
}

export function buildLathe(profile: Profile): FruitGeometry {
  const points = profilePoints(profile);
  const halves = halfProfiles(points);
  const topY = points[points.length - 1].y;
  const cap = () => new THREE.CircleGeometry(halves.equatorRadius, 48).rotateX(Math.PI / 2); // faces -y
  const attach = new THREE.Matrix4().makeTranslation(0, topY, 0);
  return {
    full: lathe(points, 'full'),
    top: lathe(halves.top, 'top'),
    bottom: lathe(halves.bottom, 'bottom'),
    capTop: cap(),
    capBottom: cap(),
    attachFull: attach,
    attachTop: attach.clone(), // the top half shares the whole fruit's frame
  };
}

// ---- swept fruit ----------------------------------------------------------

const SWEEP_STEPS = 48;
const SWEEP_SIDES = 40; // a multiple of 4, 5 and 8, so polygon corners land on vertices

/** Centreline point, tangent and in-plane normal at `s` ∈ [0, 1] along the arc. */
function sweepFrame(spec: SweepSpec, s: number): { p: THREE.Vector3; t: THREE.Vector3; n: THREE.Vector3 } {
  const R = spec.length / Math.sin(spec.bend / 2);
  const phi = (s - 0.5) * spec.bend;
  const sag = R * (1 - Math.cos(spec.bend / 2));
  return {
    p: new THREE.Vector3(R * Math.sin(phi), R * Math.cos(phi) - R + sag / 2, 0), // apex near the origin, centred vertically
    t: new THREE.Vector3(Math.cos(phi), -Math.sin(phi), 0),
    n: new THREE.Vector3(-Math.sin(phi), -Math.cos(phi), 0),
  };
}

function sweepRadius(spec: SweepSpec, s: number): number {
  const end = (x: number, e: number) => Math.min(1, x / 0.22) ** e;
  return spec.thickness * end(s, spec.taper[0]) * end(1 - s, spec.taper[1]);
}

/**
 * Cross-section radius at `theta`: a circle blended toward a regular polygon
 * by `ridge` (0 = round, 1 = flat faces with sharp corners). A banana is a
 * pentagon with softened corners, so its five facets catch the light.
 */
function sweepRho(spec: SweepSpec, r: number, theta: number): number {
  if (!spec.sides) return r;
  const sector = (Math.PI * 2) / spec.sides;
  const a = (((theta % sector) + sector) % sector) - sector / 2; // angle from the nearest face centre
  const polygon = Math.cos(sector / 2) / Math.cos(a); // ≤ 1, equal to 1 at the corners
  return r * (1 + spec.ridge * (polygon - 1));
}

function sweepBody(spec: SweepSpec, s0: number, s1: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const B = new THREE.Vector3(0, 0, 1);
  const v = new THREE.Vector3();
  for (let i = 0; i <= SWEEP_STEPS; i++) {
    const s = s0 + ((s1 - s0) * i) / SWEEP_STEPS;
    const { p, n } = sweepFrame(spec, s);
    const r = sweepRadius(spec, s);
    for (let k = 0; k <= SWEEP_SIDES; k++) {
      const theta = (Math.PI * 2 * k) / SWEEP_SIDES;
      const rho = sweepRho(spec, r, theta);
      v.copy(p).addScaledVector(n, Math.cos(theta) * rho).addScaledVector(B, Math.sin(theta) * rho);
      positions.push(v.x, v.y, v.z);
      uvs.push(k / SWEEP_SIDES, s);
    }
  }
  const ring = SWEEP_SIDES + 1;
  for (let i = 0; i < SWEEP_STEPS; i++) {
    for (let k = 0; k < SWEEP_SIDES; k++) {
      const a = i * ring + k;
      const b = a + ring;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The cross-section at `s` as a flat fan. `facing` +1 looks along the tangent, -1 against it. */
function sweepCap(spec: SweepSpec, s: number, facing: 1 | -1): THREE.BufferGeometry {
  const { p, n } = sweepFrame(spec, s);
  const B = new THREE.Vector3(0, 0, 1);
  const r = sweepRadius(spec, s);
  const positions: number[] = [p.x, p.y, p.z];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  const v = new THREE.Vector3();
  for (let k = 0; k <= SWEEP_SIDES; k++) {
    const theta = (Math.PI * 2 * k) / SWEEP_SIDES;
    const rho = sweepRho(spec, r, theta);
    v.copy(p).addScaledVector(n, Math.cos(theta) * rho).addScaledVector(B, Math.sin(theta) * rho);
    positions.push(v.x, v.y, v.z);
    uvs.push(0.5 + (Math.cos(theta) * rho) / (2 * spec.thickness), 0.5 + (Math.sin(theta) * rho) / (2 * spec.thickness));
  }
  // n × B = -t, so counter-clockwise in the (n, B) frame faces against the tangent.
  for (let k = 1; k <= SWEEP_SIDES; k++) {
    if (facing === -1) indices.push(0, k, k + 1);
    else indices.push(0, k + 1, k);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildSweep(spec: SweepSpec): FruitGeometry {
  const cut = sweepFrame(spec, 0.5).p;
  // Move the cut point to the origin, then turn each half so its body points
  // up (+y) and its cut face looks down (-y), matching the lathe halves.
  const toCut = new THREE.Matrix4().makeTranslation(-cut.x, -cut.y, -cut.z);
  const stemHalf = new THREE.Matrix4().makeRotationZ(-Math.PI / 2).multiply(toCut); // s ∈ [0, 0.5]: body along -x → +y
  const tipHalf = new THREE.Matrix4().makeRotationZ(Math.PI / 2).multiply(toCut); // s ∈ [0.5, 1]: body along +x → +y

  const end = sweepFrame(spec, 0);
  const outward = end.t.clone().negate();
  const attachFull = new THREE.Matrix4()
    .makeTranslation(end.p.x, end.p.y, end.p.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward)));

  return {
    full: sweepBody(spec, 0, 1),
    top: sweepBody(spec, 0, 0.5).applyMatrix4(stemHalf),
    bottom: sweepBody(spec, 0.5, 1).applyMatrix4(tipHalf),
    capTop: sweepCap(spec, 0.5, 1).applyMatrix4(stemHalf),
    capBottom: sweepCap(spec, 0.5, -1).applyMatrix4(tipHalf),
    attachFull,
    attachTop: stemHalf.clone().multiply(attachFull),
  };
}

// ---- clustered fruit ------------------------------------------------------

/** Centres of every berry in the bunch, top layer first, centred vertically. */
function clusterCentres(spec: ClusterSpec): THREE.Vector3[] {
  const centres: THREE.Vector3[] = [];
  const R = spec.berryRadius;
  spec.layers.forEach((layer, i) => {
    const y = -i * spec.spacing * R;
    for (let k = 0; k < layer.count; k++) {
      const a = (k / layer.count) * Math.PI * 2 + i * 0.7; // each layer turned a little
      const ring = layer.ring * R;
      centres.push(new THREE.Vector3(Math.cos(a) * ring, y + Math.sin(k * 2.3 + i) * R * 0.12, Math.sin(a) * ring * 0.6)); // bunches are flatter than they are wide
    }
  });
  const top = Math.max(...centres.map((c) => c.y)) + R;
  const bottom = Math.min(...centres.map((c) => c.y)) - R;
  const shift = -(top + bottom) / 2;
  for (const c of centres) c.y += shift;
  return centres;
}

function berries(centres: THREE.Vector3[], R: number): THREE.BufferGeometry {
  const parts = centres.map((c) => new THREE.SphereGeometry(R, 20, 14).translate(c.x, c.y, c.z));
  return mergeGeometries(parts)!;
}

/**
 * A bunch cut through its middle: the top half keeps the stalk and the
 * berries above the cut, the bottom half has the rest mirrored upward. The
 * cut faces are just the stalk's small disc.
 */
export function buildCluster(spec: ClusterSpec): FruitGeometry {
  const R = spec.berryRadius;
  const centres = clusterCentres(spec);
  // Berries straddling the cut are lifted so each sub-bunch sits wholly above it.
  const lift = (list: THREE.Vector3[]) => {
    const low = Math.min(...list.map((c) => c.y)) - R;
    return low < 0 ? list.map((c) => new THREE.Vector3(c.x, c.y - low, c.z)) : list;
  };
  const upper = lift(centres.filter((c) => c.y >= 0));
  const lower = lift(centres.filter((c) => c.y < 0).map((c) => new THREE.Vector3(c.x, -c.y, c.z)));
  const topY = Math.max(...centres.map((c) => c.y)) + R * 0.6;
  const topYOnHalf = Math.max(...upper.map((c) => c.y)) + R * 0.6;
  const cap = () => new THREE.CircleGeometry(R * 0.35, 16).rotateX(Math.PI / 2);
  return {
    full: berries(centres, R),
    top: berries(upper, R),
    bottom: berries(lower, R),
    capTop: cap(),
    capBottom: cap(),
    attachFull: new THREE.Matrix4().makeTranslation(0, topY, 0),
    attachTop: new THREE.Matrix4().makeTranslation(0, topYOnHalf, 0),
  };
}

// ---- accessories ----------------------------------------------------------

export interface AccessoryMaterials {
  stem: THREE.Material;
  leaf: THREE.Material;
  button: THREE.Material;
}

const stemGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.42, 8);
const shortStemGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.26, 8);
const longStemGeo = new THREE.CylinderGeometry(0.022, 0.03, 0.9, 8);
const melonStemGeo = new THREE.CylinderGeometry(0.06, 0.085, 0.22, 8);
const leafGeo = new THREE.CircleGeometry(0.17, 18).scale(1, 0.42, 1);
const sepalGeo = new THREE.CircleGeometry(0.2, 3).scale(0.55, 1, 1).translate(0, 0.1, 0); // one calyx leaf, base at origin
const crownLeafGeo = new THREE.ConeGeometry(0.07, 0.75, 5).translate(0, 0.37, 0);
const buttonGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.05, 12);
const nubGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.07, 8);
const capSepalGeo = new THREE.CircleGeometry(0.46, 3).scale(0.5, 1, 1).translate(0, 0.22, 0); // eggplant cap leaf
const capStemGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.32, 8);
const stalkGeo = new THREE.CylinderGeometry(0.1, 0.16, 0.34, 7); // pumpkin: thick, faceted

/**
 * Stem, leaf or button meshes around the attach point (the origin, with +y
 * pointing away from the fruit). The caller positions them with the
 * geometry's attach matrix.
 */
export function makeAccessories(stem: StemStyle, mats: AccessoryMaterials): THREE.Object3D[] {
  switch (stem) {
    case 'apple': {
      const s = new THREE.Mesh(stemGeo, mats.stem);
      s.position.set(0.02, 0.19, 0);
      s.rotation.z = 0.2;
      const leaf = new THREE.Mesh(leafGeo, mats.leaf);
      leaf.position.set(0.16, 0.3, 0.05);
      leaf.rotation.set(-Math.PI / 2.4, 0.3, 0.5);
      return [s, leaf];
    }
    case 'plum': {
      const s = new THREE.Mesh(shortStemGeo, mats.stem);
      s.position.set(0, 0.1, 0);
      s.rotation.z = 0.15;
      return [s];
    }
    case 'cherry': {
      const s = new THREE.Mesh(longStemGeo, mats.stem);
      s.position.set(0.1, 0.42, 0);
      s.rotation.z = -0.25;
      return [s];
    }
    case 'melon': {
      const s = new THREE.Mesh(melonStemGeo, mats.stem);
      s.position.set(0.03, 0.08, 0);
      s.rotation.z = 0.4;
      return [s];
    }
    case 'calyx': {
      // Five sepals splayed around a short stem, like a tomato or strawberry top.
      const parts: THREE.Object3D[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const sepal = new THREE.Mesh(sepalGeo, mats.leaf);
        sepal.position.set(Math.cos(a) * 0.08, 0.02, Math.sin(a) * 0.08);
        sepal.rotation.set(0, -a, 0);
        sepal.rotateX(Math.PI / 2.6); // lean outward
        sepal.rotateY(Math.PI / 2);
        parts.push(sepal);
      }
      const s = new THREE.Mesh(shortStemGeo, mats.stem);
      s.position.set(0, 0.1, 0);
      parts.push(s);
      return parts;
    }
    case 'cap': {
      // Eggplant: a big calyx lying down over the shoulders, with a stout stem.
      const parts: THREE.Object3D[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sepal = new THREE.Mesh(capSepalGeo, mats.leaf);
        sepal.position.set(Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05);
        sepal.rotation.set(0, -a, 0);
        sepal.rotateX(Math.PI * 0.53); // just past horizontal: a flat star drooping at the tips
        sepal.rotateY(Math.PI / 2);
        parts.push(sepal);
      }
      const s = new THREE.Mesh(capStemGeo, mats.stem);
      s.position.set(0.02, 0.17, 0);
      s.rotation.z = 0.12;
      parts.push(s);
      return parts;
    }
    case 'stalk': {
      const s = new THREE.Mesh(stalkGeo, mats.stem);
      s.position.set(0.03, 0.14, 0);
      s.rotation.z = 0.35;
      return [s];
    }
    case 'crown': {
      // Pineapple top: an outer ring of long leaves leaning out, an inner ring
      // standing taller, lengths varied so it looks grown rather than built.
      const parts: THREE.Object3D[] = [];
      const rings: [number, number, number, number][] = [
        [13, 0.14, 0.55, 0.85], // count, ring radius, lean, length scale
        [8, 0.07, 0.25, 1.15],
        [4, 0.02, 0.08, 1.4],
      ];
      rings.forEach(([count, radius, lean, length], ring) => {
        for (let i = 0; i < count; i++) {
          const a = ((i + ring * 0.5) / count) * Math.PI * 2;
          const leaf = new THREE.Mesh(crownLeafGeo, mats.leaf);
          leaf.position.set(Math.cos(a) * radius, -0.02, Math.sin(a) * radius);
          leaf.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
          leaf.scale.set(1, length * (0.85 + 0.3 * ((i * 7) % 3) / 2), 1);
          parts.push(leaf);
        }
      });
      return parts;
    }
    case 'button': {
      const b = new THREE.Mesh(buttonGeo, mats.button);
      b.position.set(0, 0.015, 0);
      const nub = new THREE.Mesh(nubGeo, mats.stem);
      nub.position.set(0, 0.06, 0);
      return [b, nub];
    }
    case 'none':
      return [];
  }
}
