import * as THREE from 'three';
import type { FrameInfo, MaterialLibrary } from '../../core/types';
import { LOUNGE_ROOM } from '../../layout';
import { archPath, archShape, rng } from '../concourse/geo';
import { Bucket, atlasUV, box, cylX, lathe, mul, rbox, sphere, tube, xf } from './kit';
import { addPiece, type Buckets } from './furniture';
import { LOUNGE_PIECES } from './layoutData';
import type { PaperAtlas } from './textures';

/**
 * The First-Class Lounge: a separate, sealed hotel-lobby room behind the hall's south wall at balcony level.
 * Interior x [-15, 15], z [-24, -2], floor y 6, ceiling y 12.5. The hall's south wall (z -2 .. 0) is the room's north
 * wall; the doorway cut through it lives in concourse/shell.ts. This module builds the room shell (stone walls with real
 * window openings, roof, terrace outside), the dressed interior (damask silk, walnut panelling, coffered ceiling, carpet,
 * curtains, furniture) and the swinging etched-glass doors.
 */

const R = LOUNGE_ROOM;
const FLOOR = R.floorY;
const H = R.ceilingY - R.floorY; // 6.5
const L_NS = R.zMax - R.zMin; // 22 (length of west / east walls)
const L_EW = R.xMax - R.xMin; // 30
const T = R.wallThickness;
const DOOR_HALF = (R.door.xMax - R.door.xMin) / 2;
const DOOR_H = R.door.height;
const WIN_V0 = R.windowSillY - FLOOR; // 0.9
const WIN_V1 = R.windowHeadY - FLOOR; // 5.4
const WIN_HALF = R.windowWidth / 2;
const WIN_SPRING = WIN_V1 - WIN_HALF;
const DADO_H = 0.9;

export interface LoungeMaterials {
  wood: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  plaster: THREE.MeshStandardMaterial;
  plain: THREE.MeshStandardMaterial;
  carpet: THREE.MeshStandardMaterial;
  fabric: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshStandardMaterial;
  doorGlass: THREE.MeshStandardMaterial;
  mirror: THREE.MeshStandardMaterial;
}

export interface LoungeInput {
  lib: MaterialLibrary;
  hall: Buckets;
  atlas: PaperAtlas;
  mats: LoungeMaterials;
  stoneMat: THREE.Material;
}

export interface LoungeResult {
  group: THREE.Group;
  /** Per-frame: animates the doors from the player's distance. */
  update(f: FrameInfo): void;
  /** Replaces the hall's leather / wood / brass buckets for lounge furniture (envMap-bearing materials). */
  extraMaterials: THREE.Material[];
}

interface WallF {
  M: THREE.Matrix4;
  L: number;
}

/** Wall frame: u along the wall, v up (from the floor), w into the room; world = origin + u*U + v*Y + w*W. */
function wallFrame(ox: number, oz: number, u: THREE.Vector3Tuple, w: THREE.Vector3Tuple, L: number): WallF {
  const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(...u), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...w)).setPosition(ox, FLOOR, oz);
  return { M, L };
}
const WEST = wallFrame(R.xMin, R.zMax, [0, 0, -1], [1, 0, 0], L_NS);
const EAST = wallFrame(R.xMax, R.zMin, [0, 0, 1], [-1, 0, 0], L_NS);
const SOUTH = wallFrame(R.xMin, R.zMin, [1, 0, 0], [0, 0, 1], L_EW);
const NORTH = wallFrame(R.xMax, R.zMax, [-1, 0, 0], [0, 0, -1], L_EW);

interface Opening {
  c: number;
  half: number;
}
const WEST_WINDOWS: Opening[] = R.westWindowCentersZ.map((z) => ({ c: R.zMax - z, half: WIN_HALF }));
const SOUTH_WINDOWS: Opening[] = R.southWindowCentersX.map((x) => ({ c: x - R.xMin, half: WIN_HALF }));
const NORTH_DOOR: Opening = { c: R.xMax - 0, half: DOOR_HALF };

function rectShape(u0: number, v0: number, u1: number, v1: number, holes: THREE.Path[] = []): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(u0, v0);
  s.lineTo(u1, v0);
  s.lineTo(u1, v1);
  s.lineTo(u0, v1);
  s.closePath();
  s.holes = holes;
  return s;
}

/** Extrusion of a (u, v) shape from w = w0 to w = w1 (w0 < w1). */
function slabGeo(shape: THREE.Shape, w0: number, w1: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: w1 - w0, bevelEnabled: false, curveSegments: 28 });
  g.translate(0, 0, w0);
  return g;
}

/** A pleated drape panel hanging from v1 down to v0 across [u0, u1] at w. Vertex-coloured fold shading. */
function drape(u0: number, u1: number, v0: number, v1: number, w: number, pleats: number, amp: number, base: THREE.Color): THREE.BufferGeometry {
  const nx = pleats * 8;
  const ny = 14;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let j = 0; j <= ny; j++) {
    const tv = j / ny; // 0 top .. 1 bottom
    for (let i = 0; i <= nx; i++) {
      const tu = i / nx;
      const ph = tu * pleats * Math.PI * 2;
      const a = amp * (0.75 + 0.4 * tv);
      const dw = a * Math.sin(ph);
      pos.push(u0 + (u1 - u0) * tu, v1 - (v1 - v0) * tv, w + dw);
      const shade = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(ph + 1.2));
      const topDark = 0.86 + 0.14 * tv;
      c.copy(base).multiplyScalar(shade * topDark);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildLounge(inp: LoungeInput): LoungeResult {
  const { lib, hall, atlas, mats, stoneMat } = inp;
  const group = new THREE.Group();
  group.name = 'lounge';

  const lWood = new Bucket(lib, lib.tileSize('wood'));
  const lBrass = new Bucket(lib, lib.tileSize('brass'));
  const lLeather = new Bucket(lib, 0.6, true);
  const lPlaster = new Bucket(lib, 0.85);
  const lPlain = new Bucket(lib, 2.0);
  const lCarpet = new Bucket(lib, 2.0);
  const lFabric = new Bucket(null, 1, true);
  const lGlass = new Bucket(null);
  const lStone = new Bucket(lib, 11.0);
  const lMirror = new Bucket(null);
  /** Furniture goes through the hall's shared buckets for small materials, the lounge's own for wood / leather / brass. */
  const lb: Buckets = { ...hall, leather: lLeather, wood: lWood, brass: lBrass, mirror: lMirror };

  // ===========================================================================================
  // 1. Shell: stone walls with real window openings, floor + roof slabs, terrace outside
  // ===========================================================================================
  const winHoles = (os: Opening[]): THREE.Path[] => os.map((o) => archPath(o.c, WIN_V0, WIN_SPRING, R.windowWidth));
  const outerTop = H + 0.6; // roof top (y 13.1)
  const wallShell = (wf: WallF, u0: number, u1: number, holes: THREE.Path[]): void => {
    lStone.add(slabGeo(rectShape(u0, -0.6, u1, outerTop, holes), -T, 0), wf.M);
  };
  wallShell(WEST, 0, L_NS + T, winHoles(WEST_WINDOWS));
  wallShell(EAST, -T, L_NS, []);
  wallShell(SOUTH, -T, L_EW + T, winHoles(SOUTH_WINDOWS));
  // massive floor slab below the room, roof slab above, a cornice around the roof edge
  lStone.add(box(R.xMin - T, 0, R.zMin - T, R.xMax + T, FLOOR - 0.06, R.zMax));
  lStone.add(box(R.xMin - T, R.ceilingY, R.zMin - T, R.xMax + T, R.ceilingY + 0.6, R.zMax));
  const cy = R.ceilingY + 0.6;
  lStone.add(box(R.xMin - T - 0.28, cy, R.zMin - T - 0.28, R.xMax + T + 0.28, cy + 0.16, R.zMax));
  lStone.add(box(R.xMin - T - 0.4, cy + 0.16, R.zMin - T - 0.4, R.xMax + T + 0.4, cy + 0.3, R.zMax));
  lStone.add(box(R.xMin - T - 0.15, cy + 0.3, R.zMin - T - 0.15, R.xMax + T + 0.15, cy + 0.42, R.zMax));
  // window sills (stone, full wall depth + a drip lip outside)
  for (const [wf, os] of [[WEST, WEST_WINDOWS], [SOUTH, SOUTH_WINDOWS]] as const) {
    for (const o of os) {
      lStone.add(box(o.c - WIN_HALF - 0.14, WIN_V0 - 0.1, -T - 0.14, o.c + WIN_HALF + 0.14, WIN_V0, 0.0), wf.M);
    }
  }

  // --- terrace outside the windows (west, south, east strips) with a stone balustrade --------------------------
  const TW = 4.8;
  const xo = R.xMin - T - TW + 0.6; // outer edge x of the west strip (-20.4)
  const xe = R.xMax + T + TW - 0.6;
  const zo = R.zMin - T - TW + 0.2; // outer edge z of the south strip (-29.2)
  lStone.add(box(xo, 0, zo, R.xMin - T, FLOOR - 0.02, R.zMax)); // west strip
  lStone.add(box(R.xMax + T, 0, zo, xe, FLOOR - 0.02, R.zMax)); // east strip
  lStone.add(box(xo, 0, zo, xe, FLOOR - 0.02, R.zMin - T)); // south strip
  const rail = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    const bal = lathe([[0.001, 0], [0.065, 0], [0.065, 0.07], [0.04, 0.12], [0.056, 0.26], [0.034, 0.4], [0.05, 0.54], [0.044, 0.7], [0.001, 0.7]], 8, 0.5);
    const n = Math.round(len / 0.27);
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * len;
      lStone.add(bal, xf(x0 + dx * t, FLOOR + 0.12, z0 + dz * t));
    }
    const ax = Math.abs(dx) > 0.5;
    const hw = 0.14;
    const bx = (a0: number, a1: number, y0: number, y1: number, hhw: number): THREE.BufferGeometry =>
      ax ? box(Math.min(x0, x1) - a0, y0, z0 - hhw, Math.max(x0, x1) + a1, y1, z0 + hhw) : box(x0 - hhw, y0, Math.min(z0, z1) - a0, x0 + hhw, y1, Math.max(z0, z1) + a1);
    lStone.add(bx(0, 0, FLOOR, FLOOR + 0.12, hw));
    lStone.add(bx(0, 0, FLOOR + 0.82, FLOOR + 0.9, hw + 0.03));
    lStone.add(bx(0, 0, FLOOR + 0.9, FLOOR + 1.0, hw));
    const posts = Math.max(1, Math.round(len / 3.3));
    for (let i = 0; i <= posts; i++) {
      const t = (i / posts) * len;
      lStone.add(box(x0 + dx * t - 0.2, FLOOR, z0 + dz * t - 0.2, x0 + dx * t + 0.2, FLOOR + 0.98, z0 + dz * t + 0.2));
      lStone.add(box(x0 + dx * t - 0.26, FLOOR + 0.98, z0 + dz * t - 0.26, x0 + dx * t + 0.26, FLOOR + 1.06, z0 + dz * t + 0.26));
      lStone.add(box(x0 + dx * t - 0.17, FLOOR + 1.06, z0 + dz * t - 0.17, x0 + dx * t + 0.17, FLOOR + 1.13, z0 + dz * t + 0.17));
    }
  };
  rail(xo + 0.14, R.zMax - 0.3, xo + 0.14, zo + 0.14); // west edge, running south
  rail(xo + 0.14, zo + 0.14, xe - 0.14, zo + 0.14); // south edge
  rail(xe - 0.14, zo + 0.14, xe - 0.14, R.zMax - 0.3); // east edge, running north

  // ===========================================================================================
  // 2. Interior skin: champagne damask above the dado, walnut panelling, mouldings, cornice
  // ===========================================================================================
  const skin = (wf: WallF, holes: THREE.Path[]): void => void lPlaster.add(slabGeo(rectShape(0, 0, wf.L, H, holes), 0, 0.03), wf.M);
  skin(WEST, winHoles(WEST_WINDOWS));
  skin(EAST, []);
  skin(SOUTH, winHoles(SOUTH_WINDOWS));
  {
    const c = NORTH_DOOR.c;
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(c - DOOR_HALF, 0);
    s.lineTo(c - DOOR_HALF, DOOR_H);
    s.lineTo(c + DOOR_HALF, DOOR_H);
    s.lineTo(c + DOOR_HALF, 0);
    s.lineTo(L_EW, 0);
    s.lineTo(L_EW, H);
    s.lineTo(0, H);
    s.closePath();
    lPlaster.add(slabGeo(s, 0, 0.03), NORTH.M);
  }

  /** Walnut raised-panel dado along [u0, u1] on a wall. */
  const dado = (wf: WallF, u0: number, u1: number): void => {
    const w0 = 0.03;
    const n = Math.max(1, Math.round((u1 - u0) / 1.0));
    const pitch = (u1 - u0) / n;
    lWood.add(box(u0, 0, w0, u1, 0.1, w0 + 0.08), wf.M); // skirting
    lWood.add(box(u0, 0.1, w0, u1, 0.16, w0 + 0.05), wf.M);
    lWood.add(box(u0, DADO_H - 0.1, w0, u1, DADO_H - 0.04, w0 + 0.05), wf.M);
    lWood.add(rbox(u0, DADO_H - 0.04, w0, u1, DADO_H, w0 + 0.11, 0.012, 2), wf.M); // cap rail
    lBrass.add(box(u0, DADO_H - 0.001, w0 + 0.105, u1, DADO_H + 0.006, w0 + 0.112), wf.M);
    for (let i = 0; i <= n; i++) {
      const u = u0 + i * pitch;
      lWood.add(box(Math.max(u0, u - 0.04), 0.16, w0, Math.min(u1, u + 0.04), DADO_H - 0.1, w0 + 0.05), wf.M);
    }
    for (let i = 0; i < n; i++) {
      const a = u0 + i * pitch + 0.07;
      const b = u0 + (i + 1) * pitch - 0.07;
      lWood.add(rbox(a, 0.19, w0 + 0.025, b, DADO_H - 0.13, w0 + 0.07, 0.01, 2), wf.M);
      lBrass.add(box(a + 0.012, 0.2, w0 + 0.069, b - 0.012, 0.206, w0 + 0.073), wf.M);
    }
  };
  /** Moulded frame (walnut + brass inner line) around a damask field. */
  const field = (wf: WallF, u0: number, u1: number, v0: number, v1: number): void => {
    const w0 = 0.03;
    const t = 0.07;
    lWood.add(rbox(u0, v0, w0, u1, v0 + t, w0 + 0.045, 0.008, 1), wf.M);
    lWood.add(rbox(u0, v1 - t, w0, u1, v1, w0 + 0.045, 0.008, 1), wf.M);
    lWood.add(rbox(u0, v0 + t, w0, u0 + t, v1 - t, w0 + 0.045, 0.008, 1), wf.M);
    lWood.add(rbox(u1 - t, v0 + t, w0, u1, v1 - t, w0 + 0.045, 0.008, 1), wf.M);
    lBrass.add(box(u0 + t, v0 + t, w0 + 0.04, u1 - t, v0 + t + 0.012, w0 + 0.05), wf.M);
    lBrass.add(box(u0 + t, v1 - t - 0.012, w0 + 0.04, u1 - t, v1 - t, w0 + 0.05), wf.M);
    lBrass.add(box(u0 + t, v0 + t, w0 + 0.04, u0 + t + 0.012, v1 - t, w0 + 0.05), wf.M);
    lBrass.add(box(u1 - t - 0.012, v0 + t, w0 + 0.04, u1 - t, v1 - t, w0 + 0.05), wf.M);
  };
  const SUR = 0.2; // window surround board width
  const runs = (wf: WallF, os: Opening[], half: (o: Opening) => number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let cur = 0;
    for (const o of [...os].sort((a, b) => a.c - b.c)) {
      out.push([cur, o.c - half(o)]);
      cur = o.c + half(o);
    }
    out.push([cur, wf.L]);
    return out;
  };
  for (const [wf, os] of [[WEST, WEST_WINDOWS], [EAST, [] as Opening[]], [SOUTH, SOUTH_WINDOWS]] as const) {
    for (const [a, b] of runs(wf, os, (o) => o.half + SUR)) {
      dado(wf, a, b);
      if (b - a > 1.4) field(wf, a + 0.25, b - 0.25, 1.15, 5.15);
    }
  }
  for (const [a, b] of runs(NORTH, [NORTH_DOOR], () => DOOR_HALF + 0.42)) {
    dado(NORTH, a, b);
    if (b - a > 1.4) field(NORTH, a + 0.25, b - 0.25, 1.15, 5.15);
  }
  // window architraves: walnut band around each opening and a deep sill board
  for (const [wf, os] of [[WEST, WEST_WINDOWS], [SOUTH, SOUTH_WINDOWS]] as const) {
    for (const o of os) {
      const outer = new THREE.Shape();
      const ro = WIN_HALF + SUR;
      outer.moveTo(o.c - ro, WIN_V0 - 0.02);
      outer.lineTo(o.c - ro, WIN_SPRING);
      outer.absarc(o.c, WIN_SPRING, ro, Math.PI, 0, true);
      outer.lineTo(o.c + ro, WIN_V0 - 0.02);
      outer.closePath();
      outer.holes = [archPath(o.c, WIN_V0 - 0.02, WIN_SPRING, R.windowWidth)];
      lWood.add(slabGeo(outer, 0.03, 0.08), wf.M);
      lWood.add(box(o.c - ro - 0.04, WIN_V0 - 0.045, 0.03, o.c + ro + 0.04, WIN_V0, 0.22), wf.M); // sill board (interior)
      lWood.add(box(o.c - WIN_HALF, WIN_V0 - 0.045, -T, o.c + WIN_HALF, WIN_V0, 0.03), wf.M); // sill through the reveal
    }
  }
  // cornice: stepped cream plaster with walnut / brass bands, all four walls
  const cornice = (wf: WallF): void => {
    const L = wf.L;
    lPlain.add(box(0, H - 0.78, 0, L, H - 0.7, 0.05), wf.M);
    lWood.add(box(0, H - 0.7, 0, L, H - 0.62, 0.09), wf.M);
    lBrass.add(box(0, H - 0.62, 0.0, L, H - 0.605, 0.095), wf.M);
    lPlain.add(box(0, H - 0.605, 0, L, H - 0.45, 0.17), wf.M);
    lWood.add(box(0, H - 0.45, 0, L, H - 0.36, 0.24), wf.M);
    lPlain.add(box(0, H - 0.36, 0, L, H - 0.2, 0.36), wf.M);
    lPlain.add(box(0, H - 0.2, 0, L, H - 0.08, 0.5), wf.M);
    lWood.add(box(0, H - 0.08, 0, L, H, 0.56), wf.M);
    // dentils under the corona
    const pitch = 0.2;
    for (let u = 0.1; u < L - 0.1; u += pitch) lPlain.add(box(u, H - 0.2, 0.36, u + 0.1, H - 0.1, 0.46), wf.M);
  };
  for (const wf of [WEST, EAST, SOUTH, NORTH]) cornice(wf);

  // north wall: walnut architrave and entablature around the doorway (room side)
  {
    const c = NORTH_DOOR.c;
    const w0 = 0.03;
    for (const s of [-1, 1]) {
      const a = s < 0 ? c - DOOR_HALF - 0.3 : c + DOOR_HALF;
      lWood.add(rbox(a, 0, w0, a + 0.3, DOOR_H + 0.3, w0 + 0.07, 0.01, 2), NORTH.M);
      lBrass.add(box(a + (s < 0 ? 0.0 : 0.28), 0.1, w0 + 0.065, a + (s < 0 ? 0.02 : 0.3), DOOR_H + 0.3, w0 + 0.075), NORTH.M);
      lWood.add(box(a - 0.04, 0, w0, a + 0.34, 0.2, w0 + 0.1), NORTH.M);
    }
    lWood.add(rbox(c - DOOR_HALF - 0.3, DOOR_H, w0, c + DOOR_HALF + 0.3, DOOR_H + 0.3, w0 + 0.07, 0.01, 2), NORTH.M);
    lWood.add(rbox(c - DOOR_HALF - 0.42, DOOR_H + 0.3, w0, c + DOOR_HALF + 0.42, DOOR_H + 0.46, w0 + 0.16, 0.01, 2), NORTH.M);
    lPlain.add(box(c - DOOR_HALF - 0.3, DOOR_H + 0.46, w0, c + DOOR_HALF + 0.3, DOOR_H + 0.95, w0 + 0.1), NORTH.M);
    lBrass.add(box(c - DOOR_HALF - 0.3, DOOR_H + 0.46, w0 + 0.1, c + DOOR_HALF + 0.3, DOOR_H + 0.472, w0 + 0.11), NORTH.M);
    lWood.add(rbox(c - DOOR_HALF - 0.5, DOOR_H + 0.95, w0, c + DOOR_HALF + 0.5, DOOR_H + 1.08, w0 + 0.24, 0.01, 2), NORTH.M);
    // gilt Deco sunburst fan on the plaster frieze above the entablature
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.08 + (i / 8) * 0.84);
      const M = NORTH.M.clone().multiply(new THREE.Matrix4().makeTranslation(c, DOOR_H + 0.5, w0 + 0.1)).multiply(new THREE.Matrix4().makeRotationZ(a - Math.PI / 2));
      lBrass.add(box(-0.01, 0.04, 0, 0.01, 0.4, 0.014), M);
    }
  }

  // ===========================================================================================
  // 3. Floor (walnut border + broadloom), ceiling coffers
  // ===========================================================================================
  const wx0 = R.xMin;
  const wx1 = R.xMax;
  lWood.add(box(wx0, FLOOR - 0.06, R.zMin, wx1, FLOOR, R.zMax));
  const BORD = 0.95;
  lCarpet.add(new THREE.PlaneGeometry(L_EW - 2 * BORD, L_NS - 2 * BORD).rotateX(-Math.PI / 2).translate(0, FLOOR + 0.004, (R.zMin + R.zMax) / 2));
  for (const [x0, z0, x1, z1] of [
    [wx0 + BORD, R.zMin + BORD - 0.04, wx1 - BORD, R.zMin + BORD],
    [wx0 + BORD, R.zMax - BORD, wx1 - BORD, R.zMax - BORD + 0.04],
    [wx0 + BORD - 0.04, R.zMin + BORD - 0.04, wx0 + BORD, R.zMax - BORD + 0.04],
    [wx1 - BORD, R.zMin + BORD - 0.04, wx1 - BORD + 0.04, R.zMax - BORD + 0.04],
  ] as const) lBrass.add(box(x0, FLOOR + 0.001, z0, x1, FLOOR + 0.007, z1));
  // dark-marble threshold through the doorway (z -2 .. 0), meeting the balcony deck
  hall.dark.add(box(R.door.xMin, FLOOR - 0.05, R.door.zMin - 0.0, R.door.xMax, FLOOR + 0.012, R.door.zMax));
  hall.brass.add(box(R.door.xMin, FLOOR + 0.012, R.door.zMax - 0.02, R.door.xMax, FLOOR + 0.016, R.door.zMax + 0.02));

  // coffered ceiling
  {
    const y = R.ceilingY;
    lPlain.add(new THREE.PlaneGeometry(L_EW, L_NS).rotateX(Math.PI / 2).translate(0, y - 0.012, (R.zMin + R.zMax) / 2));
    const nx = 6;
    const nz = 4;
    const bw = 0.4;
    const bd = 0.3;
    const cellX = L_EW / nx;
    const cellZ = L_NS / nz;
    for (let i = 0; i <= nx; i++) {
      const x = R.xMin + i * cellX;
      lPlain.add(box(x - bw / 2, y - bd, R.zMin, x + bw / 2, y, R.zMax));
      lWood.add(box(x - 0.11, y - bd - 0.025, R.zMin, x + 0.11, y - bd, R.zMax));
    }
    for (let j = 0; j <= nz; j++) {
      const z = R.zMin + j * cellZ;
      lPlain.add(box(R.xMin, y - bd, z - bw / 2, R.xMax, y, z + bw / 2));
      lWood.add(box(R.xMin, y - bd - 0.025, z - 0.11, R.xMax, y - bd, z + 0.11));
    }
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const cx = R.xMin + (i + 0.5) * cellX;
        const cz = R.zMin + (j + 0.5) * cellZ;
        // inner moulding frame + rosette
        const ix = cellX / 2 - bw / 2 - 0.16;
        const iz = cellZ / 2 - bw / 2 - 0.16;
        for (const s of [-1, 1]) {
          lWood.add(box(cx + s * ix - 0.025, y - 0.08, cz - iz, cx + s * ix + 0.025, y, cz + iz));
          lWood.add(box(cx - ix, y - 0.08, cz + s * iz - 0.025, cx + ix, y, cz + s * iz + 0.025));
        }
        lBrass.add(lathe([[0.001, 0.06], [0.26, 0.02], [0.3, 0], [0.34, 0.0], [0.34, 0.012], [0.001, 0.07]], 20, 0.5).rotateX(Math.PI).translate(cx, y - 0.005, cz));
        lBrass.add(sphere(cx, y - 0.075, cz, 0.06, 10, 6));
      }
    }
  }

  // ===========================================================================================
  // 4. Windows: glass, slim brass glazing bars, drapes and poles
  // ===========================================================================================
  const drapeBase = new THREE.Color(0x7c2229);
  const fabricParts: THREE.BufferGeometry[] = [];
  for (const [wf, os] of [[WEST, WEST_WINDOWS], [SOUTH, SOUTH_WINDOWS]] as const) {
    for (const o of os) {
      const wGlass = -T / 2;
      const gs = archShape(o.c, WIN_V0, WIN_SPRING, R.windowWidth, 0, 36);
      lGlass.add(new THREE.ShapeGeometry(gs, 24), mul(wf.M, xf(0, 0, wGlass)));
      const bar = 0.022;
      const bz0 = wGlass - 0.02;
      const bz1 = wGlass + 0.02;
      // outer frame, centre mullion, transoms
      lBrass.add(box(o.c - WIN_HALF, WIN_V0, bz0, o.c + WIN_HALF, WIN_V0 + 0.06, bz1), wf.M);
      for (const s of [-1, 1]) lBrass.add(box(o.c + s * WIN_HALF - (s > 0 ? 0.035 : 0), WIN_V0, bz0, o.c + s * WIN_HALF + (s > 0 ? 0 : 0.035), WIN_SPRING, bz1), wf.M);
      lBrass.add(box(o.c - bar, WIN_V0, bz0, o.c + bar, WIN_V1, bz1), wf.M);
      for (const v of [WIN_V0 + 1.1, WIN_V0 + 2.2, WIN_SPRING]) lBrass.add(box(o.c - WIN_HALF, v - bar, bz0, o.c + WIN_HALF, v + bar, bz1), wf.M);
      for (const s of [-1, 1]) lBrass.add(box(o.c + s * 0.6 - 0.012, WIN_V0, bz0, o.c + s * 0.6 + 0.012, WIN_SPRING + 0.4, bz1), wf.M);
      // arched head: ring + fan bars
      const ring = new THREE.TorusGeometry(WIN_HALF - 0.02, 0.02, 6, 28, Math.PI);
      lBrass.add(ring, mul(wf.M, xf(o.c, WIN_SPRING, wGlass)));
      const ring2 = new THREE.TorusGeometry(WIN_HALF * 0.55, 0.014, 6, 24, Math.PI);
      lBrass.add(ring2, mul(wf.M, xf(o.c, WIN_SPRING, wGlass)));
      for (let k = 1; k < 6; k++) {
        const a = (k / 6) * Math.PI;
        lBrass.add(tube(new THREE.Vector3(o.c + Math.cos(a) * 0.1, WIN_SPRING + Math.sin(a) * 0.1, wGlass), new THREE.Vector3(o.c + Math.cos(a) * (WIN_HALF - 0.02), WIN_SPRING + Math.sin(a) * (WIN_HALF - 0.02), wGlass), 0.011, 5), wf.M);
      }
      // curtains: pole above the head, two velvet panels
      const poleV = WIN_V1 + 0.07;
      lBrass.add(cylX(o.c, poleV, 0.14, 0.016, 2 * (WIN_HALF + 1.05), 10), mul(wf.M, xf(0, 0, 0)));
      for (const s of [-1, 1]) {
        lBrass.add(sphere(o.c + s * (WIN_HALF + 1.1), poleV, 0.14, 0.035, 10, 8), wf.M);
        const u0 = s < 0 ? o.c - WIN_HALF - 1.0 : o.c + WIN_HALF + 0.1;
        const g = drape(u0, u0 + 0.9, 0.02, poleV - 0.04, 0.17, 4, 0.065, drapeBase);
        g.applyMatrix4(wf.M);
        fabricParts.push(g);
        // tie-back
        lBrass.add(new THREE.TorusGeometry(0.05, 0.008, 6, 14), mul(wf.M, xf(u0 + (s < 0 ? 0.92 : -0.02), 2.0, 0.2)));
      }
    }
  }
  const fabricGeo = (() => {
    const parts = fabricParts.map((g) => {
      const n = g.toNonIndexed();
      n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2));
      return n;
    });
    return parts;
  })();

  // ===========================================================================================
  // 5. Pictures (framed travel posters) and furniture
  // ===========================================================================================
  const picture = (wf: WallF, u: number, v: number, w: number, h: number, i: number): void => {
    const r = atlas.cell[`poster${i % atlas.posterCount}`];
    if (!r) return;
    const g = new THREE.PlaneGeometry(w, h);
    atlasUV(g, r);
    const M = mul(wf.M, xf(0, 0, 0)).multiply(new THREE.Matrix4().makeTranslation(u, v, 0.075));
    hall.paper.add(g, M);
    const fr = 0.07;
    for (const [x0, y0, x1, y1] of [
      [-w / 2 - fr, -h / 2 - fr, w / 2 + fr, -h / 2],
      [-w / 2 - fr, h / 2, w / 2 + fr, h / 2 + fr],
      [-w / 2 - fr, -h / 2, -w / 2, h / 2],
      [w / 2, -h / 2, w / 2 + fr, h / 2],
    ] as const) lBrass.add(rbox(x0, y0, -0.045, x1, y1, 0.012, 0.012, 1), M);
    lWood.add(box(-w / 2 - fr - 0.02, -h / 2 - fr - 0.02, -0.05, w / 2 + fr + 0.02, h / 2 + fr + 0.02, -0.03), M);
    // picture light: brass arm and tube lamp above
    lBrass.add(box(-0.18, h / 2 + fr + 0.04, -0.03, 0.18, h / 2 + fr + 0.06, 0.12), M);
  };
  picture(NORTH, 8, 2.85, 0.95, 1.3, 0);
  picture(NORTH, 22, 2.85, 0.95, 1.3, 5);
  picture(NORTH, 3.2, 2.85, 0.7, 0.95, 2);
  picture(NORTH, 26.8, 2.85, 0.7, 0.95, 6);
  // large pictures above the library cases and the fireplace's neighbours (east wall: u = z + 24)
  [[3.6, 3], [6.9, 4], [14.1, 7], [17.4, 1]].forEach(([u, i]) => picture(EAST, u!, 4.25, 0.8, 1.1, i!));

  const only = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lk') : null;
  for (const p of LOUNGE_PIECES) if (!only || only.split(',').includes(p.kind)) addPiece(lb, atlas, p);

  // ===========================================================================================
  // 6. Doors: tall walnut and etched-glass double doors that swing open as the player nears
  // ===========================================================================================
  const doorGroup = new THREE.Group();
  doorGroup.name = 'loungeDoors';
  const leaves: Array<{ pivot: THREE.Group; side: number }> = [];
  const LINE = 0.028;
  const leafW = DOOR_HALF - LINE - 0.008;
  const leafH = DOOR_H - LINE - 0.012;
  const zMid = (R.door.zMin + R.door.zMin + 1.45) / 2; // inside the wall's back layer (z -2 .. -0.55)
  for (const side of [-1, 1] as const) {
    // hinge at x = side * DOOR_HALF; the leaf extends toward x = 0 (-side)
    const sx = -side;
    const wood = new Bucket(lib, lib.tileSize('wood'));
    const brass = new Bucket(lib, lib.tileSize('brass'));
    const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.BufferGeometry =>
      box(Math.min(sx * x0, sx * x1), y0, z0, Math.max(sx * x0, sx * x1), y1, z1);
    const rbx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number): THREE.BufferGeometry =>
      rbox(Math.min(sx * x0, sx * x1), y0, z0, Math.max(sx * x0, sx * x1), y1, z1, r, 2);
    const th = 0.038;
    const stile = 0.19;
    const gy0 = 1.18;
    const gy1 = leafH - 0.22;
    wood.add(rbx(0, 0, -th, stile, leafH, th, 0.01)); // hinge stile
    wood.add(rbx(leafW - stile, 0, -th, leafW, leafH, th, 0.01)); // meeting stile
    wood.add(rbx(stile, 0, -th, leafW - stile, 0.22, th, 0.01));
    wood.add(rbx(stile, 1.0, -th, leafW - stile, gy0, th, 0.01));
    wood.add(rbx(stile, gy1, -th, leafW - stile, leafH, th, 0.01));
    // raised bottom panel (both faces) and glass beads
    wood.add(rbx(stile + 0.04, 0.26, -th - 0.014, leafW - stile - 0.04, 0.96, th + 0.014, 0.012));
    for (const zz of [-th - 0.016, th + 0.016]) brass.add(bx(stile + 0.06, 0.28, zz - 0.002, leafW - stile - 0.06, 0.285, zz + 0.002));
    const bead = 0.03;
    wood.add(bx(stile, gy0, -th, leafW - stile, gy0 + bead, th + 0.012));
    wood.add(bx(stile, gy1 - bead, -th, leafW - stile, gy1, th + 0.012));
    wood.add(bx(stile, gy0, -th, stile + bead, gy1, th + 0.012));
    wood.add(bx(leafW - stile - bead, gy0, -th, leafW - stile, gy1, th + 0.012));
    // brass kick plate, long pull handles, hinges
    for (const zz of [-th, th]) {
      brass.add(bx(stile + 0.03, 0.03, zz - (zz < 0 ? 0.006 : 0), leafW - 0.03, 0.2, zz + (zz < 0 ? 0 : 0.006)));
      brass.add(tube(new THREE.Vector3(sx * (leafW - 0.09), 0.9, zz * 1.0 + Math.sign(zz) * 0.05), new THREE.Vector3(sx * (leafW - 0.09), 1.62, zz * 1.0 + Math.sign(zz) * 0.05), 0.014, 8));
      for (const y of [0.98, 1.54]) brass.add(tube(new THREE.Vector3(sx * (leafW - 0.09), y, zz), new THREE.Vector3(sx * (leafW - 0.09), y, zz + Math.sign(zz) * 0.05), 0.009, 6));
      brass.add(sphere(sx * (leafW - 0.09), 1.62, zz + Math.sign(zz) * 0.05, 0.02, 8, 6));
    }
    for (const y of [0.25, leafH / 2, leafH - 0.25]) brass.add(tube(new THREE.Vector3(0, y - 0.1, 0), new THREE.Vector3(0, y + 0.1, 0), 0.02, 8));
    const gGeo = new THREE.PlaneGeometry(leafW - 2 * stile, gy1 - gy0);
    gGeo.translate(sx * (stile + (leafW - 2 * stile) / 2), (gy0 + gy1) / 2, 0);
    // etched pattern spans each leaf (mirrored on the other leaf)
    if (sx > 0) {
      const uv = gGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    }
    const pivot = new THREE.Group();
    pivot.position.set(side * (DOOR_HALF - LINE), FLOOR + 0.006, zMid);
    const mk = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, shadow: boolean): void => {
      if (!geo) return;
      const pivotAdd = (m: THREE.Mesh): void => void pivot.add(m);
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.castShadow = shadow;
      m.receiveShadow = true;
      pivotAdd(m);
    };
    mk(wood.merge(), mats.wood, `doorWood${side}`, true);
    mk(brass.merge(), mats.brass, `doorBrass${side}`, true);
    const gm = new THREE.Mesh(gGeo, mats.doorGlass);
    gm.name = `doorGlass${side}`;
    gm.castShadow = false;
    gm.receiveShadow = true;
    pivot.add(gm);
    doorGroup.add(pivot);
    leaves.push({ pivot, side });
  }
  // walnut lining of the doorway reveal (through the wall's back layer, z -2 .. -0.55) so the stone never shows
  for (const s of [-1, 1]) lWood.add(box(s * DOOR_HALF - (s > 0 ? LINE : 0), FLOOR, R.door.zMin, s * DOOR_HALF + (s > 0 ? 0 : LINE), FLOOR + DOOR_H, -0.55));
  lWood.add(box(-DOOR_HALF, FLOOR + DOOR_H - LINE, R.door.zMin, DOOR_HALF, FLOOR + DOOR_H, -0.55));
  group.add(doorGroup);

  // ===========================================================================================
  // 7. Emit meshes
  // ===========================================================================================
  const emit = (bk: Bucket, mat: THREE.Material, name: string, shadow: boolean, receive = true): void => {
    const g = bk.merge();
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.castShadow = shadow;
    m.receiveShadow = receive;
    group.add(m);
  };
  emit(lStone, stoneMat, 'loungeStone', true);
  emit(lPlaster, mats.plaster, 'loungeSilk', true);
  emit(lPlain, mats.plain, 'loungePlaster', true);
  emit(lWood, mats.wood, 'loungeWalnut', true);
  emit(lBrass, mats.brass, 'loungeBrass', true);
  emit(lLeather, mats.leather, 'loungeLeather', true);
  emit(lCarpet, mats.carpet, 'loungeCarpet', false);
  emit(lGlass, mats.glass, 'loungeGlass', false);
  emit(lMirror, mats.mirror, 'loungeMirrors', false);
  {
    const merged = fabricGeo.length ? mergeFabric(fabricGeo) : null;
    if (merged) {
      const m = new THREE.Mesh(merged, mats.fabric);
      m.name = 'loungeDrapes';
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }
  void lFabric;

  // ===========================================================================================
  // 8. Door animation
  // ===========================================================================================
  let open = 0; // 0..1 progress
  let target = 0;
  let leftAt = -1e9;
  let timeNow = 0;
  const MAX_ANGLE = THREE.MathUtils.degToRad(104);
  // hinge at x = side * DOOR_HALF; side -1 (west) opens with rotation +e*angle, side +1 with -e*angle
  const setAngle = (): void => {
    const e = open * open * (3 - 2 * open);
    for (const l of leaves) l.pivot.rotation.y = -l.side * e * MAX_ANGLE;
  };
  setAngle();
  const doorCenter = new THREE.Vector3(0, FLOOR + 1.7, zMid);
  const update = (f: FrameInfo): void => {
    timeNow = f.time;
    const p = f.camera.position;
    const level = Math.abs(p.y - (FLOOR + 1.7)) < 2.4;
    const d = Math.hypot(p.x - doorCenter.x, p.z - doorCenter.z);
    const near = level && d < 3.0;
    if (near) {
      target = 1;
      leftAt = timeNow;
    } else if (target === 1 && timeNow - leftAt > 1.5) target = 0;
    if (open !== target) {
      const step = f.dt / 0.6;
      open = target > open ? Math.min(target, open + step) : Math.max(target, open - step);
      setAngle();
    }
  };

  group.traverse((o) => {
    o.userData.noShadow = o.userData.noShadow ?? false;
  });
  return { group, update, extraMaterials: [] };
}

function mergeFabric(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const p of parts) {
    const c = p.getAttribute('position').count;
    pos.set(p.getAttribute('position').array as Float32Array, o * 3);
    nor.set(p.getAttribute('normal').array as Float32Array, o * 3);
    col.set(p.getAttribute('color').array as Float32Array, o * 3);
    o += c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

void rng;
void lathe;
