import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FRUIT_KINDS } from '../src/fruitTypes';
import { buildCluster, buildLathe, buildSweep, profilePoints, type FruitGeometry } from '../src/shapes';

function finite(geo: THREE.BufferGeometry): boolean {
  const p = geo.attributes.position.array;
  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) return false;
  return p.length > 0;
}

function bounds(geo: THREE.BufferGeometry): THREE.Box3 {
  geo.computeBoundingBox();
  return geo.boundingBox!;
}

function checkBundle(g: FruitGeometry): void {
  for (const geo of [g.full, g.top, g.bottom, g.capTop, g.capBottom]) expect(finite(geo)).toBe(true);
  // Halves follow the lathe convention: cut face at y = 0, body above it.
  expect(bounds(g.top).min.y).toBeGreaterThan(-0.02);
  expect(bounds(g.bottom).min.y).toBeGreaterThan(-0.02);
  expect(bounds(g.top).max.y).toBeGreaterThan(0.3);
  expect(Math.abs(bounds(g.capTop).max.y)).toBeLessThan(0.02);
  expect(Math.abs(bounds(g.capBottom).max.y)).toBeLessThan(0.02);
}

describe('fruit geometry', () => {
  it('builds every kind without NaNs, with halves in the shared convention', () => {
    for (const kind of FRUIT_KINDS) {
      checkBundle(kind.sweep ? buildSweep(kind.sweep) : kind.cluster ? buildCluster(kind.cluster) : buildLathe(kind.profile));
    }
  });

  it('a bunch of grapes is widest at the top and splits into two sub-bunches', () => {
    const grapes = FRUIT_KINDS.find((k) => k.name === 'grapes')!;
    const g = buildCluster(grapes.cluster!);
    const full = bounds(g.full);
    expect(full.max.y - full.min.y).toBeGreaterThan(1.5);
    expect(g.top.attributes.position.count).toBeGreaterThan(0);
    expect(g.bottom.attributes.position.count).toBeGreaterThan(0);
    expect(g.top.attributes.position.count + g.bottom.attributes.position.count).toBe(g.full.attributes.position.count);
  });

  it('a swept banana is curved, wider than tall, and its stem sits at one end', () => {
    const banana = FRUIT_KINDS.find((k) => k.name === 'banana')!;
    const g = buildSweep(banana.sweep!);
    const box = bounds(g.full);
    expect(box.max.x - box.min.x).toBeGreaterThan(1.8);
    expect(box.max.y - box.min.y).toBeLessThan(box.max.x - box.min.x);

    const stem = new THREE.Vector3().setFromMatrixPosition(g.attachFull);
    expect(Math.abs(stem.x)).toBeGreaterThan(0.8); // at an end, not the middle
    const stemOnHalf = new THREE.Vector3().setFromMatrixPosition(g.attachTop);
    expect(stemOnHalf.y).toBeGreaterThan(0.5); // on the top half, away from the cut
  });

  it('a pear profile is wider in its lower half than in its neck', () => {
    const pts = profilePoints('pear');
    const widest = (pick: (y: number) => boolean) => Math.max(...pts.filter((p) => pick(p.y)).map((p) => p.x));
    expect(widest((y) => y < -0.3)).toBeGreaterThan(widest((y) => y > 0.9) * 1.5);
  });
});
