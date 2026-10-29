import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Fruit, Half } from './fruit';
import { FRUIT_KINDS, type FruitKind } from './fruitTypes';
import { buildCluster, buildLathe, buildSweep, makeAccessories, type AccessoryMaterials, type FruitGeometry } from './shapes';
import { makeFleshTexture, makeSkinTexture, makeSurface } from './textures';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const POP_SECONDS = 0.14; // halves start slightly oversized and settle

// Every fruit gets its own depth layer, further than any fruit is wide, so
// two that overlap on screen occlude each other instead of merging. The
// camera is orthographic, so depth changes nothing about size or hit tests.
const DEPTH_SLOTS = 40;
const DEPTH_STEP = 400;
function depthOf(id: number): number {
  return -(((id % DEPTH_SLOTS) + DEPTH_SLOTS) % DEPTH_SLOTS) * DEPTH_STEP;
}

// Spike directions for the mine: the six axes and eight diagonals, minus +y
// where the warning light sits.
const SPIKE_DIRS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 1], [1, 1, -1], [-1, 1, 1], [-1, 1, -1],
  [1, -1, 1], [1, -1, -1], [-1, -1, 1], [-1, -1, -1],
];

interface KindAssets {
  skin: THREE.Material;
  flesh: THREE.Material;
  geo: FruitGeometry;
}

/** What the scene draws: the game itself, or the title screen's arrangement. */
export interface SceneView {
  fruits: readonly Fruit[];
  halves: readonly Half[];
  time: number; // ms; halves' ages and the bomb light's pulse come from it
}

// Orthographic camera in CSS px: three x = screen x, three y = -screen y.
// With no perspective, a fruit's screen circle is exactly what slicing tests.
export class FruitScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 1000 + DEPTH_SLOTS * DEPTH_STEP + 1000);
  private readonly sphere = new THREE.SphereGeometry(1, 48, 32);
  private readonly spike = new THREE.ConeGeometry(0.17, 0.55, 8);
  private readonly assets = new Map<FruitKind, KindAssets>();
  private readonly accessoryMats: AccessoryMaterials = {
    stem: new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x4f9d3a, roughness: 0.65, side: THREE.DoubleSide }),
    button: new THREE.MeshStandardMaterial({ color: 0x7fb35a, roughness: 0.8 }),
  };
  private readonly bombBody = new THREE.MeshStandardMaterial({ color: 0x2a2a33, metalness: 0.7, roughness: 0.35 });
  private readonly bombSpike = new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 0.8, roughness: 0.3 });
  private readonly bombLight = new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff2b2b, emissiveIntensity: 1.5 });
  private readonly objects = new Map<number, THREE.Object3D>();
  private readonly qAlign = new THREE.Quaternion();
  private readonly qTilt = new THREE.Quaternion();
  private readonly qSpin = new THREE.Quaternion();
  private readonly normal = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.camera.position.z = 1000;

    // A neutral room reflected in the skins: this is what makes the gloss read as real.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Lit softly: a hard key over ACES tone mapping burns pale skins (banana,
    // lemon) to beige and puts hot white spots on everything.
    this.scene.add(new THREE.HemisphereLight(0xfff1e0, 0x2a1a40, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(-0.6, 0.9, 1);
    this.scene.add(key);
    // Cool rim light from the side, so fruit edges separate from the background.
    const rim = new THREE.DirectionalLight(0x8fb8ff, 1.0);
    rim.position.set(1, 0.3, 0.15);
    this.scene.add(rim);

    for (const kind of FRUIT_KINDS) this.assets.set(kind, this.buildAssets(kind));
    this.precompile();
  }

  // Three compiles a material's shader the first time it is drawn, which
  // would stall the first cut of a round. Draw everything once, offscreen.
  private precompile(): void {
    const warm: THREE.Object3D[] = [this.makeBomb()];
    for (const kind of FRUIT_KINDS) warm.push(this.makeFruit(kind), this.makeHalf(kind, 1), this.makeHalf(kind, -1));
    for (const obj of warm) {
      obj.position.set(-10000, 0, 0);
      this.scene.add(obj);
    }
    this.renderer.compile(this.scene, this.camera);
    for (const obj of warm) this.scene.remove(obj);
  }

  private buildAssets(kind: FruitKind): KindAssets {
    const s = makeSurface(kind);
    const skin = new THREE.MeshPhysicalMaterial({
      map: makeSkinTexture(kind),
      bumpMap: s.bump,
      bumpScale: s.bumpScale,
      roughnessMap: s.roughness,
      roughness: s.baseRoughness,
      clearcoat: s.clearcoat,
      clearcoatRoughness: s.clearcoatRoughness,
      sheen: s.sheen,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color(s.sheenColor),
      envMapIntensity: s.envMapIntensity,
    });
    const flesh = new THREE.MeshStandardMaterial({ map: makeFleshTexture(kind), roughness: 0.55, envMapIntensity: 0.3 });
    const geo = kind.sweep ? buildSweep(kind.sweep) : kind.cluster ? buildCluster(kind.cluster) : buildLathe(kind.profile);
    return { skin, flesh, geo };
  }

  private accessories(kind: FruitKind, attach: THREE.Matrix4): THREE.Object3D | null {
    const parts = makeAccessories(kind.stem, this.accessoryMats);
    if (!parts.length) return null;
    const group = new THREE.Group();
    group.applyMatrix4(attach);
    for (const part of parts) group.add(part);
    return group;
  }

  resize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.right = width;
    this.camera.bottom = -height;
    this.camera.updateProjectionMatrix();
  }

  render(game: SceneView): void {
    const alive = new Set<number>();
    this.bombLight.emissiveIntensity = 1.3 + Math.sin(game.time / 110) * 1.1;

    for (const f of game.fruits) {
      alive.add(f.id);
      const obj = this.objects.get(f.id) ?? this.add(f.id, f.kind.hazard ? this.makeBomb() : this.makeFruit(f.kind));
      obj.position.set(f.x, -f.y, depthOf(f.id));
      obj.scale.setScalar(f.radius);
      obj.quaternion.setFromAxisAngle(this.axis.set(...f.spinAxis), f.spinAngle);
    }

    for (const h of game.halves) {
      alive.add(h.id);
      const obj = this.objects.get(h.id) ?? this.add(h.id, this.makeHalf(h.kind, h.side));
      obj.position.set(h.x, -h.y, depthOf(h.fruitId));
      const age = (game.time - h.born) / 1000;
      obj.scale.setScalar(h.radius * (1 + 0.18 * Math.max(0, 1 - age / POP_SECONDS)));
      this.orientHalf(obj, h, age);
    }

    for (const [id, obj] of this.objects) {
      if (!alive.has(id)) {
        this.scene.remove(obj);
        this.objects.delete(id);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // Each half is a pre-cut piece, turned so its cut face lies on the swipe's
  // cut plane, then tilted about the swipe direction so the flesh swings
  // toward the player as the halves fly apart.
  private orientHalf(obj: THREE.Object3D, h: Half, age: number): void {
    const n = this.normal.set(h.normal.x, -h.normal.y, 0);
    const d = this.dir.set(h.dir.x, -h.dir.y, 0);
    const zSign = Math.sign(d.x * n.y - d.y * n.x) || 1;
    const tilt = -h.side * zSign * (0.7 + 1.6 * age);

    this.qAlign.setFromUnitVectors(Y_AXIS, this.axis.copy(n).multiplyScalar(h.side));
    this.qTilt.setFromAxisAngle(d, tilt);
    this.qSpin.setFromAxisAngle(Y_AXIS, h.baseAngle);
    obj.quaternion.copy(this.qTilt).multiply(this.qAlign).multiply(this.qSpin);
  }

  private add(id: number, obj: THREE.Object3D): THREE.Object3D {
    this.objects.set(id, obj);
    this.scene.add(obj);
    return obj;
  }

  private makeFruit(kind: FruitKind): THREE.Object3D {
    const a = this.assets.get(kind)!;
    const group = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.set(...kind.shape);
    inner.add(new THREE.Mesh(a.geo.full, a.skin));
    const acc = this.accessories(kind, a.geo.attachFull);
    if (acc) inner.add(acc);
    group.add(inner);
    return group;
  }

  private makeBomb(): THREE.Object3D {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.sphere, this.bombBody);
    body.scale.setScalar(0.8);
    group.add(body);
    for (const d of SPIKE_DIRS) {
      const dir = this.axis.set(...d).normalize();
      const spike = new THREE.Mesh(this.spike, this.bombSpike);
      spike.position.copy(dir).multiplyScalar(0.92);
      spike.quaternion.setFromUnitVectors(Y_AXIS, dir);
      group.add(spike);
    }
    const light = new THREE.Mesh(this.sphere, this.bombLight);
    light.scale.setScalar(0.22);
    light.position.set(0, 0.88, 0);
    group.add(light);
    return group;
  }

  // The top half keeps the stem; the bottom half is the mirrored lower piece.
  private makeHalf(kind: FruitKind, side: 1 | -1): THREE.Object3D {
    const a = this.assets.get(kind)!;
    const group = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.set(...kind.shape);
    const { geo } = a;
    inner.add(new THREE.Mesh(side === 1 ? geo.top : geo.bottom, a.skin), new THREE.Mesh(side === 1 ? geo.capTop : geo.capBottom, a.flesh));
    if (side === 1) {
      const acc = this.accessories(kind, geo.attachTop);
      if (acc) inner.add(acc);
    }
    group.add(inner);
    return group;
  }
}
