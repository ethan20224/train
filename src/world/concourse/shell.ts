import * as THREE from 'three';
import { ARCHES, LOUNGE_ROOM, LUNETTE, VAULT, WINDOW } from '../../layout';
import {
  GeoBag, Soup, archPath, arcFrames, at, boxMM, lineFrames, rotatedBoxZ, sweep, v3, type Frame, type P2,
} from './geo';
import { BLIND_Z, END_WALLS, SIDE_WALLS, WALLS, WALL_CORNICE, uOfZ, type WallFrame } from './frames';

export interface Bags {
  stone: GeoBag;
  dark: GeoBag;
  col: GeoBag;
  floor: GeoBag;
  brass: GeoBag;
  iron: GeoBag;
  glass: GeoBag;
}

// ---------------------------------------------------------------------------------------------
// Profiles (a = projection from the wall into the hall, b = height) - all CCW, wall-side closing omitted.
// ---------------------------------------------------------------------------------------------
export const CORNICE_PROFILE: P2[] = [
  [0, 22.6], [0.1, 22.6], [0.1, 22.94], [0.16, 22.97], [0.16, 23.04], [0.12, 23.04], [0.12, 23.28],
  [0.36, 23.28], [0.36, 23.36], [0.78, 23.36], [0.78, 23.66], [0.72, 23.74], [0.66, 23.8], [0.62, 23.9], [0.62, 24], [0, 24],
];

const PLINTH_PROFILE: P2[] = [[0.3, 0], [0.3, 1.0], [0.35, 1.05], [0.35, 1.15], [0.3, 1.2], [0, 1.2]];

function rusticCourse(y0: number, y1: number): P2[] {
  return [[0.06, y0], [0.14, y0 + 0.06], [0.14, y1 - 0.06], [0.06, y1]];
}

const SILL_PROFILE: P2[] = [[0.3, 2.6], [0.3, 2.82], [0.37, 2.86], [0.37, 2.98], [0.34, 3.0], [0, 3.0]];

function surroundProfile(s: number): P2[] {
  const p: P2[] = [
    [0.62, 0], [0.62, 0.07], [0.55, 0.1], [0.55, 0.15], [0.36, 0.15], [0.36, 0.22], [0.31, 0.26], [0.2, 0.26],
    [0.2, 0.18], [0.1, 0.18], [0.06, 0.13], [0, 0.13], [0, 0],
  ];
  return p.map(([a, b]): P2 => [a * s, b * s]);
}

/** Sweep helper: along local u at constant v-profile (profile b = absolute v, a = w projection). */
function alongU(profile: P2[], u0: number, u1: number, opts: { caps?: boolean } = {}): THREE.BufferGeometry {
  return sweep(profile, lineFrames(v3(u0, 0, 0), v3(u1, 0, 0), v3(0, 0, 1), v3(0, 1, 0)), { caps: opts.caps ?? true });
}

export interface Opening {
  cu: number;
  v0: number;
  spring: number;
  w: number;
}

/** Window-class openings (glazed) for a side wall, local u. */
export function sideWindows(wall: WallFrame): Opening[] {
  return [26, 50, 74].map((z) => ({ cu: uOfZ(wall, z), v0: WINDOW.sillY, spring: WINDOW.springY, w: WINDOW.width }));
}
export function sideBlinds(wall: WallFrame): Opening[] {
  return BLIND_Z.map((z) => ({ cu: uOfZ(wall, z), v0: WINDOW.sillY, spring: WINDOW.springY, w: WINDOW.width }));
}
export const NORTH_ARCHES: Opening[] = ARCHES.centersX.map((x) => ({
  cu: -x, v0: 0, spring: ARCHES.height - ARCHES.width / 2, w: ARCHES.width,
}));

const BLIND_DEPTH = 0.55;

function extrudeWall(shape: THREE.Shape, w0: number, w1: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: w1 - w0, bevelEnabled: false, curveSegments: 48 });
  g.translate(0, 0, w0);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------------------------
function buildWallSolids(bags: Bags): void {
  // Side walls: front layer (deep recess for blind arches) + back layer (windows only).
  for (const wall of SIDE_WALLS) {
    const wins = sideWindows(wall);
    const blinds = sideBlinds(wall);
    const front = new THREE.Shape();
    front.moveTo(-50, -0.5); front.lineTo(50, -0.5); front.lineTo(50, 24); front.lineTo(-50, 24); front.closePath();
    front.holes = [...wins, ...blinds].map((o) => archPath(o.cu, o.v0, o.spring, o.w));
    bags.stone.add(extrudeWall(front, -BLIND_DEPTH, 0), wall.m);
    const back = new THREE.Shape();
    back.moveTo(-50, -0.5); back.lineTo(50, -0.5); back.lineTo(50, 24); back.lineTo(-50, 24); back.closePath();
    back.holes = wins.map((o) => archPath(o.cu, o.v0, o.spring, o.w));
    bags.stone.add(extrudeWall(back, -wall.thickness, -BLIND_DEPTH), wall.m);
  }
  // End walls (rect + half-disc up to the outer vault radius).
  const outerR = 32.5;
  const outline = (): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(-outerR, -0.5); s.lineTo(outerR, -0.5); s.lineTo(outerR, 24);
    s.absarc(0, 24, outerR, 0, Math.PI, false);
    s.lineTo(-outerR, -0.5);
    return s;
  };
  const lunetteHole = (): THREE.Path => {
    const h = new THREE.Path();
    const r = LUNETTE_OPEN_R;
    h.moveTo(-r, LUNETTE_BASE_Y); h.absarc(0, LUNETTE_BASE_Y, r, Math.PI, 0, true); h.closePath();
    return h;
  };
  {
    // south wall: front layer carries recessed blind arches, back layer only the lunette
    const w = WALLS.south;
    const front = outline();
    front.holes = [lunetteHole(), ...SOUTH_BLINDS.map((o) => (o.cu === 0 ? loungePortalPath(o) : archPath(o.cu, o.v0, o.spring, o.w)))];
    bags.stone.add(extrudeWall(front, -BLIND_DEPTH, 0), w.m);
    const back = outline();
    back.holes = [lunetteHole(), loungeDoorPath()]; // first-class lounge doorway through the wall (Phase 4B)
    bags.stone.add(extrudeWall(back, -w.thickness, -BLIND_DEPTH), w.m);
    const w2 = WALLS.north;
    const s2 = outline();
    s2.holes = NORTH_ARCHES.map((o) => archPath(o.cu, o.v0, o.spring, o.w));
    bags.stone.add(extrudeWall(s2, -w2.thickness, 0), w2.m);
  }
}

/** Door rectangle through the south wall into the first-class lounge (world x, y; y from the balcony floor). */
const DOOR = {
  half: (LOUNGE_ROOM.door.xMax - LOUNGE_ROOM.door.xMin) / 2,
  v0: LOUNGE_ROOM.floorY,
  v1: LOUNGE_ROOM.floorY + LOUNGE_ROOM.door.height,
};
const ARCHITRAVE_W = 0.5;

function loungeDoorPath(): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(-DOOR.half, DOOR.v0); p.lineTo(DOOR.half, DOOR.v0); p.lineTo(DOOR.half, DOOR.v1); p.lineTo(-DOOR.half, DOOR.v1); p.closePath();
  return p;
}

/** The centre blind arch, merged with the door notch below it (one hole: holes must not overlap). */
function loungePortalPath(o: Opening): THREE.Path {
  const r = o.w / 2;
  const p = new THREE.Path();
  p.moveTo(-DOOR.half, DOOR.v0);
  p.lineTo(-DOOR.half, o.v0);
  p.lineTo(o.cu - r, o.v0);
  p.lineTo(o.cu - r, o.spring);
  p.absarc(o.cu, o.spring, r, Math.PI, 0, true);
  p.lineTo(o.cu + r, o.v0);
  p.lineTo(DOOR.half, o.v0);
  p.lineTo(DOOR.half, DOOR.v0);
  p.closePath();
  return p;
}

/** Molded stone architrave (jambs + head + cap shelf) around the lounge doorway, hall side. */
function loungeArchitrave(bag: GeoBag, wallM: THREE.Matrix4): void {
  // stands on the recess floor of the centre blind arch (w = -BLIND_DEPTH), so it never floats in front of the hollow
  const m = wallM.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -BLIND_DEPTH));
  const prof = surroundProfile(0.8);
  const bAxis = v3(0, 0, 1);
  const h = DOOR.half;
  for (const s of [-1, 1]) {
    bag.add(sweep(prof, lineFrames(v3(s * h, DOOR.v0, 0), v3(s * h, DOOR.v1, 0), v3(s, 0, 0), bAxis), { caps: true }), m);
  }
  bag.add(sweep(prof, lineFrames(v3(-h - ARCHITRAVE_W, DOOR.v1, 0), v3(h + ARCHITRAVE_W, DOOR.v1, 0), v3(0, 1, 0), bAxis), { caps: true }), m);
  // frieze + cap shelf
  bag.add(boxMM(-h - ARCHITRAVE_W - 0.1, DOOR.v1 + ARCHITRAVE_W, 0, h + ARCHITRAVE_W + 0.1, DOOR.v1 + ARCHITRAVE_W + 0.5, 0.2), m);
  bag.add(boxMM(-h - ARCHITRAVE_W - 0.25, DOOR.v1 + ARCHITRAVE_W + 0.5, 0, h + ARCHITRAVE_W + 0.25, DOOR.v1 + ARCHITRAVE_W + 0.62, 0.34), m);
  bag.add(boxMM(-h - ARCHITRAVE_W - 0.17, DOOR.v1 + ARCHITRAVE_W + 0.62, 0, h + ARCHITRAVE_W + 0.17, DOOR.v1 + ARCHITRAVE_W + 0.7, 0.28), m);
}

export const SOUTH_BLINDS: Opening[] = [-24, -12, 0, 12, 24].map((cu) => ({ cu, v0: 7.4, spring: 17.5, w: 9 }));

export const LUNETTE_BASE_Y = LUNETTE.baseY + 0.4;
export const LUNETTE_OPEN_R = LUNETTE.radius - 2.4;

// ---------------------------------------------------------------------------------------------
// Wall trim: plinth, rustication, cornice with dentils, surrounds, keystones, sills
// ---------------------------------------------------------------------------------------------
function dentils(bag: GeoBag, m: THREE.Matrix4, u0: number, u1: number): void {
  const pitch = 0.3;
  const n = Math.floor((u1 - u0) / pitch);
  for (let i = 0; i < n; i++) {
    const u = u0 + (i + 0.5) * pitch;
    bag.add(boxMM(u - 0.075, 23.04, 0.1, u + 0.075, 23.28, 0.3), m);
  }
}

function keystone(bag: GeoBag, m: THREE.Matrix4, cu: number, vApex: number, s: number): void {
  const sh = new THREE.Shape();
  const hb = 0.36 * s;
  const ht = 0.52 * s;
  const v0 = vApex - 0.12;
  const v1 = vApex + 0.62 * s + 0.3 * s;
  sh.moveTo(cu - hb, v0); sh.lineTo(cu + hb, v0); sh.lineTo(cu + ht, v1); sh.lineTo(cu - ht, v1); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: 0.28 * s, bevelEnabled: true, bevelSize: 0.05 * s, bevelThickness: 0.06 * s, bevelSegments: 2,
  });
  g.translate(0, 0, 0.1);
  bag.add(g, m);
  // small shield boss
  const boss = new THREE.CylinderGeometry(0.17 * s, 0.17 * s, 0.06, 20).rotateX(Math.PI / 2);
  boss.translate(cu, (v0 + v1) / 2 + 0.05, 0.5 * s + 0.05);
  bag.add(boss, m);
}

/** Molded architrave surround (jambs + archivolt + keystone) for an opening. */
export function surround(bag: GeoBag, m: THREE.Matrix4, o: Opening, s = 1, withKeystone = true): void {
  const prof = surroundProfile(s);
  const half = o.w / 2;
  const bAxis = v3(0, 0, 1);
  // jambs
  bag.add(sweep(prof, lineFrames(v3(o.cu - half, o.v0, 0), v3(o.cu - half, o.spring, 0), v3(-1, 0, 0), bAxis), { caps: true }), m);
  bag.add(sweep(prof, lineFrames(v3(o.cu + half, o.v0, 0), v3(o.cu + half, o.spring, 0), v3(1, 0, 0), bAxis), { caps: true }), m);
  // archivolt
  bag.add(sweep(prof, arcFrames(v3(o.cu, o.spring, 0), v3(1, 0, 0), v3(0, 1, 0), half, 0, Math.PI, 64, bAxis, 1)), m);
  if (withKeystone) keystone(bag, m, o.cu, o.spring + half, s);
}

function trimWall(wall: WallFrame, bags: Bags): void {
  const m = wall.m;
  const side = wall.name === 'west' || wall.name === 'east';
  // --- plinth / rustication intervals -----------------------------------------------------
  let intervals: Array<[number, number]> = [];
  if (wall.name === 'west') intervals = [[-50, 42]];
  else if (wall.name === 'east') intervals = [[-42, 50]];
  else if (wall.name === 'north') {
    intervals = [[-30, -25.9], [-14.1, -5.9], [5.9, 14.1], [25.9, 30]];
  }
  // (south wall base is hidden behind the balcony)
  for (const [a, b] of intervals) {
    bags.dark.add(alongU(PLINTH_PROFILE, a, b), m);
    bags.stone.add(alongU(rusticCourse(1.2, 2.1), a, b), m);
    bags.stone.add(alongU(rusticCourse(2.1, 3.0), a, b), m);
  }
  if (wall.name === 'south') {
    // skirting + dado on the balcony level
    // (interrupted by the lounge doorway and its architrave)
    for (const [a, b] of [[-29.7, -DOOR.half - ARCHITRAVE_W - 0.08], [DOOR.half + ARCHITRAVE_W + 0.08, 29.7]] as const) {
      bags.dark.add(alongU(PLINTH_PROFILE.map(([pa, pb]): P2 => [pa, pb + 6]), a, b), m);
    }
    loungeArchitrave(bags.stone, m);
  }
  // --- cornice (frieze + corona) with dentils ---------------------------------------------
  const lim = side ? 50 - 0.78 : 30;
  bags.stone.add(alongU(CORNICE_PROFILE, -lim, lim), m);
  dentils(bags.stone, m, -lim, lim);
  void WALL_CORNICE;

  if (side) {
    for (const o of sideWindows(wall)) {
      surround(bags.stone, m, o);
      bags.stone.add(alongU(SILL_PROFILE, o.cu - 5.78, o.cu + 5.78), m);
    }
    for (const o of sideBlinds(wall)) {
      surround(bags.stone, m, o);
      bags.stone.add(alongU(SILL_PROFILE, o.cu - 5.78, o.cu + 5.78), m);
      blindPanel(bags, m, o);
    }
  } else if (wall.name === 'north') {
    for (const o of NORTH_ARCHES) surround(bags.stone, m, o, 1.45);
  } else {
    for (const o of SOUTH_BLINDS) {
      surround(bags.stone, m, o, 0.95);
      const sill = SILL_PROFILE.map(([a, b]): P2 => [a, b + (o.v0 - 3)]);
      if (o.cu === 0) {
        const gap = DOOR.half + ARCHITRAVE_W + 0.25;
        bags.stone.add(alongU(sill, -5.2, -gap), m);
        bags.stone.add(alongU(sill, gap, 5.2), m);
      } else bags.stone.add(alongU(sill, o.cu - 5.2, o.cu + 5.2), m);
      blindPanel(bags, m, o);
    }
  }
}

/** Blind-arch outline with the lounge door notch cut out of its foot (solid polygon, no hole). */
function notchedArch(o: Opening, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(o.cu - r, o.v0);
  s.lineTo(-DOOR.half, o.v0);
  s.lineTo(-DOOR.half, DOOR.v1);
  s.lineTo(DOOR.half, DOOR.v1);
  s.lineTo(DOOR.half, o.v0);
  s.lineTo(o.cu + r, o.v0);
  s.lineTo(o.cu + r, o.spring);
  s.absarc(o.cu, o.spring, r, 0, Math.PI, false);
  s.closePath();
  return s;
}

/** Framed marble panel at the back of a blind arch: cream marble field with a fine black-marble keyline. */
function blindPanel(bags: Bags, m: THREE.Matrix4, o: Opening): void {
  const archAt = (r: number, v0: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(o.cu - r, v0);
    s.lineTo(o.cu - r, o.spring);
    s.absarc(o.cu, o.spring, r, Math.PI, 0, true);
    s.lineTo(o.cu + r, v0);
    s.closePath();
    return s;
  };
  const pathAt = (r: number, v0: number): THREE.Path => {
    const p = new THREE.Path();
    p.moveTo(o.cu - r, v0);
    p.lineTo(o.cu - r, o.spring);
    p.absarc(o.cu, o.spring, r, Math.PI, 0, true);
    p.lineTo(o.cu + r, v0);
    p.closePath();
    return p;
  };
  const half = o.w / 2;
  // cream marble field filling the recess floor
  const field = new THREE.ExtrudeGeometry(o.cu === 0 ? notchedArch(o, half - 0.02) : archAt(half - 0.02, o.v0), { depth: 0.06, bevelEnabled: false, curveSegments: 48 });
  field.translate(0, 0, -BLIND_DEPTH);
  bags.col.add(field, m);
  if (o.cu === 0) return; // the doorway replaces the keyline ring
  // keyline: thin black-marble ring 0.7 m inside the opening
  const rOut = half - 0.7;
  const ring = archAt(rOut, o.v0 + 0.7);
  ring.holes = [pathAt(rOut - 0.09, o.v0 + 0.79)];
  const kg = new THREE.ExtrudeGeometry(ring, { depth: 0.05, bevelEnabled: false, curveSegments: 48 });
  kg.translate(0, 0, -BLIND_DEPTH + 0.06);
  bags.dark.add(kg, m);
}

// ---------------------------------------------------------------------------------------------
// North wall relief + panels, south wall lunette ring
// ---------------------------------------------------------------------------------------------
function northRelief(bags: Bags): void {
  const m = WALLS.north.m;
  const cu = 0;
  const cv = 40;
  const R = 8.2;
  const wAxis = v3(0, 0, 1);
  // backing disc
  const disc = new THREE.CylinderGeometry(R, R, 0.12, 96).rotateX(Math.PI / 2);
  disc.translate(cu, cv, 0.06);
  bags.stone.add(disc, m);
  // stepped rim ring
  const rim: P2[] = [[0, 0.12], [1.15, 0.12], [1.15, 0.3], [1.0, 0.36], [1.0, 0.44], [0.78, 0.44], [0.78, 0.58], [0.66, 0.66], [0.52, 0.66], [0.5, 0.5], [0.34, 0.5], [0.34, 0.22], [0, 0.22]];
  bags.stone.add(sweep(rim, arcFrames(v3(cu, cv, 0), v3(1, 0, 0), v3(0, 1, 0), R - 0.3, 0, Math.PI * 2, 128, wAxis, 1)), m);
  // inner beaded ring
  const bead: P2[] = [[-0.14, 0.12], [-0.14, 0.2], [-0.08, 0.3], [0.08, 0.3], [0.14, 0.2], [0.14, 0.12]];
  bags.stone.add(sweep(bead, arcFrames(v3(cu, cv, 0), v3(1, 0, 0), v3(0, 1, 0), 6.5, 0, Math.PI * 2, 96, wAxis, 1)), m);
  // radial rays (sunburst)
  const rayBase = 1.7;
  for (let i = 0; i < 32; i++) {
    const long = i % 2 === 0;
    const rEnd = long ? 6.1 : 4.7;
    const hw = long ? 0.3 : 0.2;
    const s = new THREE.Shape();
    s.moveTo(rayBase, -hw); s.lineTo(rEnd, 0); s.lineTo(rayBase, hw); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: long ? 0.2 : 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.04, bevelSegments: 1 });
    g.translate(0, 0, 0.12);
    g.rotateZ((i / 32) * Math.PI * 2);
    g.translate(cu, cv, 0);
    bags.stone.add(g, m);
  }
  // central boss: stacked lathe disc
  const prof: P2[] = [[0, 0.62], [0.35, 0.6], [0.8, 0.5], [1.15, 0.36], [1.5, 0.24], [1.62, 0.12], [0, 0.12]].map(([a, b]): P2 => [a as number, b as number]);
  const boss = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 48);
  boss.rotateX(Math.PI / 2);
  boss.translate(cu, cv, 0);
  bags.stone.add(boss, m);
  // laurel wreath: leaf pairs around r = 7.0
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const leaf = new THREE.SphereGeometry(0.2, 8, 6);
    leaf.scale(1, 0.38, 0.28);
    leaf.rotateZ(Math.PI / 2 + 0.55);
    leaf.rotateZ(a);
    leaf.translate(cu + Math.cos(a) * 7.35, cv + Math.sin(a) * 7.35, 0.22);
    bags.stone.add(leaf, m);
    const leaf2 = new THREE.SphereGeometry(0.2, 8, 6);
    leaf2.scale(1, 0.38, 0.28);
    leaf2.rotateZ(Math.PI / 2 - 0.55);
    leaf2.rotateZ(a);
    leaf2.translate(cu + Math.cos(a) * 7.0, cv + Math.sin(a) * 7.0, 0.22);
    bags.stone.add(leaf2, m);
  }
  // two long recessed-look panels flanking the medallion
  for (const sgn of [-1, 1]) {
    const x0 = sgn * 14.2;
    const frame = (w: number, h: number, depth: number): THREE.BufferGeometry => boxMM(x0 - w / 2, 29 - h / 2 + 5, 0, x0 + w / 2, 29 + h / 2 + 5, depth);
    bags.stone.add(frame(9.4, 9.4, 0.22), m);
    bags.dark.add(boxMM(x0 - 4.0, 29 + 5 - 4.0, 0.22, x0 + 4.0, 29 + 5 + 4.0, 0.3), m);
    bags.col.add(boxMM(x0 - 3.3, 29 + 5 - 3.3, 0.3, x0 + 3.3, 29 + 5 + 3.3, 0.34), m);
    bags.dark.add(boxMM(x0 - 2.9, 29 + 5 - 2.9, 0.34, x0 + 2.9, 29 + 5 + 2.9, 0.38), m);
    // brass keylines: one around the black field, one just inside the stone frame
    for (const [half, t] of [[2.9, 0.1], [4.0, 0.12]] as const) {
      const z0 = half === 2.9 ? 0.34 : 0.22;
      const z1 = z0 + (half === 2.9 ? 0.1 : 0.14);
      bags.brass.add(boxMM(x0 - half - t, 34 - half - t, z0, x0 + half + t, 34 - half, z1), m);
      bags.brass.add(boxMM(x0 - half - t, 34 + half, z0, x0 + half + t, 34 + half + t, z1), m);
      bags.brass.add(boxMM(x0 - half - t, 34 - half, z0, x0 - half, 34 + half, z1), m);
      bags.brass.add(boxMM(x0 + half, 34 - half, z0, x0 + half + t, 34 + half, z1), m);
    }
    wingedWheel(bags, m, x0, 34.15);
  }
  void ARCHES;
}

/** Art Deco winged-wheel railway emblem in low brass relief on the black field (field surface is at w = 0.38). */
function wingedWheel(bags: Bags, m: THREE.Matrix4, cx: number, cy: number): void {
  const W0 = 0.38;
  const relief = (shape: THREE.Shape, depth: number): THREE.BufferGeometry =>
    new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 }).translate(0, 0, W0);
  // wheel rim
  const rim = new THREE.Shape();
  rim.absarc(cx, cy, 0.95, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(cx, cy, 0.78, 0, Math.PI * 2, true);
  rim.holes.push(hole);
  bags.brass.add(relief(rim, 0.09), m);
  // spokes and hub
  for (let i = 0; i < 8; i++) bags.brass.add(rotatedBoxZ(1.56, 0.07, 0.06, cx, cy, W0 + 0.03, (i / 8) * Math.PI), m);
  const hub = new THREE.Shape();
  hub.absarc(cx, cy, 0.24, 0, Math.PI * 2, false);
  bags.brass.add(relief(hub, 0.13), m);
  // wings: five stacked tapering feathers per side, longest at the bottom, sweeping gently upward
  for (const sg of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const y = cy + 0.02 + k * 0.2;
      const x0 = 1.02;
      const L = 1.95 - k * 0.2;
      const f = new THREE.Shape();
      f.moveTo(cx + sg * x0, y - 0.07);
      f.lineTo(cx + sg * (x0 + L), y + 0.14 + k * 0.05);
      f.lineTo(cx + sg * (x0 + L - 0.07), y + 0.21 + k * 0.05);
      f.lineTo(cx + sg * x0, y + 0.07);
      f.closePath();
      bags.brass.add(relief(f, 0.07), m);
    }
  }
  // two Deco chevrons below the wheel
  for (let k = 0; k < 2; k++) {
    const y = cy - 1.75 - k * 0.32;
    for (const sg of [-1, 1]) bags.brass.add(rotatedBoxZ(1.5, 0.09, 0.06, cx + sg * 0.6, y + 0.22, W0 + 0.03, sg * -0.42), m);
  }
}

function lunetteRing(bags: Bags): void {
  const m = WALLS.south.m;
  // molded archivolt around the lunette opening, hugging the opening edge (a measured outward from r = open radius)
  const prof = surroundProfile(2.6).map(([a, b]): P2 => [a, b]);
  bags.stone.add(sweep(prof, arcFrames(v3(0, LUNETTE_BASE_Y, 0), v3(1, 0, 0), v3(0, 1, 0), LUNETTE_OPEN_R, 0, Math.PI, 160, v3(0, 0, 1), 1)), m);
  // sill slab / plinth
  bags.stone.add(alongU([[0.5, 24.0], [0.5, 24.34], [0.4, 24.4], [0, 24.4]], -LUNETTE_OPEN_R - 1.5, LUNETTE_OPEN_R + 1.5), m);
}

// ---------------------------------------------------------------------------------------------
// Vault: shell + ribs + coffers
// ---------------------------------------------------------------------------------------------
const VAULT_PANEL_R = VAULT.radius + 0.9;
const VAULT_OUTER_R = VAULT.radius + 2.5;
const COFFER_CELLS_PHI = 24;
const COFFER_PITCH_Z = 4;
const COFFER_CELLS_Z = 25;

function vaultShell(bag: GeoBag): void {
  const N = 96;
  const tile = 2;
  const make = (r: number, inward: boolean): THREE.BufferGeometry => {
    const s = new Soup();
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI;
      const t1 = ((i + 1) / N) * Math.PI;
      const p = (t: number, z: number) => v3(r * Math.cos(t), VAULT.springlineY + r * Math.sin(t), z);
      const n = (t: number) => v3(Math.cos(t) * (inward ? -1 : 1), Math.sin(t) * (inward ? -1 : 1), 0);
      s.quad(p(t0, 0), p(t1, 0), p(t1, 100), p(t0, 100), n(t0), n(t1), n(t1), n(t0),
        [(t0 * r) / tile, 0], [(t1 * r) / tile, 0], [(t1 * r) / tile, 100 / tile], [(t0 * r) / tile, 100 / tile]);
    }
    return s.build();
  };
  bag.add(make(VAULT_PANEL_R, true), undefined, 'keep');
  bag.add(make(VAULT_OUTER_R, false), undefined, 'keep');
}

function vaultRibs(bag: GeoBag): void {
  const prof: P2[] = [
    [0, -0.62], [0.12, -0.62], [0.12, -0.5], [0.5, -0.5], [0.5, -0.4], [0.72, -0.34], [0.72, 0.34], [0.5, 0.4], [0.5, 0.5], [0.12, 0.5], [0.12, 0.62], [0, 0.62],
  ];
  for (let k = 0; k < 8; k++) {
    const z = 8 + 12 * k;
    bag.add(sweep(prof, arcFrames(v3(0, VAULT.springlineY, z), v3(1, 0, 0), v3(0, 1, 0), VAULT.radius, 0, Math.PI, 96, v3(0, 0, 1), -1)));
  }
}

/** One coffer cell in local cylinder space (axis = local z, cell centre direction = +x). */
function cofferSkin(tile: number): THREE.BufferGeometry {
  const R0 = VAULT.radius;
  const halfPhi = Math.PI / COFFER_CELLS_PHI / 2;
  const halfZ = COFFER_PITCH_Z / 2;
  const insets = [0, 0.5, 0.8, 1.05];
  const radii = [R0, R0 + 0.3, R0 + 0.6, R0 + 0.9];
  const s = new Soup();
  const cyl = (r: number, phi: number, z: number): THREE.Vector3 => v3(r * Math.cos(phi), r * Math.sin(phi), z);
  const inN = (phi: number): THREE.Vector3 => v3(-Math.cos(phi), -Math.sin(phi), 0);
  const uvOf = (r: number, phi: number, z: number): P2 => [(phi * r) / tile + 0.37, z / tile + 0.21];

  const patch = (r: number, p0: number, p1: number, z0: number, z1: number): void => {
    if (p1 - p0 < 1e-9 || z1 - z0 < 1e-9) return;
    const n = Math.max(1, Math.ceil((p1 - p0) / THREE.MathUtils.degToRad(1.6)));
    for (let i = 0; i < n; i++) {
      const a = p0 + ((p1 - p0) * i) / n;
      const b = p0 + ((p1 - p0) * (i + 1)) / n;
      s.quad(cyl(r, a, z0), cyl(r, b, z0), cyl(r, b, z1), cyl(r, a, z1), inN(a), inN(b), inN(b), inN(a),
        uvOf(r, a, z0), uvOf(r, b, z0), uvOf(r, b, z1), uvOf(r, a, z1));
    }
  };
  const ringFaces = (r: number, k0: number, k1: number): void => {
    const hA = halfPhi - at(insets, k0) / R0;
    const hB = halfPhi - at(insets, k1) / R0;
    const zA = halfZ - at(insets, k0);
    const zB = halfZ - at(insets, k1);
    patch(r, -hA, hA, -zA, -zB);
    patch(r, -hA, hA, zB, zA);
    patch(r, -hA, -hB, -zB, zB);
    patch(r, hB, hA, -zB, zB);
  };
  const risers = (k: number, rA: number, rB: number): void => {
    const h = halfPhi - at(insets, k) / R0;
    const z = halfZ - at(insets, k);
    const n = Math.max(1, Math.ceil((2 * h) / THREE.MathUtils.degToRad(1.6)));
    // faces along phi at z = +-z, facing the cell centre
    for (const sg of [-1, 1]) {
      const nz = v3(0, 0, -sg);
      for (let i = 0; i < n; i++) {
        const a = -h + ((2 * h) * i) / n;
        const b = -h + ((2 * h) * (i + 1)) / n;
        s.quad(cyl(rA, a, sg * z), cyl(rA, b, sg * z), cyl(rB, b, sg * z), cyl(rB, a, sg * z), nz, nz, nz, nz,
          uvOf(rA, a, sg * z), uvOf(rA, b, sg * z), uvOf(rB, b, sg * z), uvOf(rB, a, sg * z));
      }
      // faces along z at phi = +-h, facing the cell centre
      const ph = sg * h;
      const tang = v3(-Math.sin(ph), Math.cos(ph), 0).multiplyScalar(-sg); // pointing toward the centre
      s.quad(cyl(rA, ph, -z), cyl(rA, ph, z), cyl(rB, ph, z), cyl(rB, ph, -z), tang, tang, tang, tang,
        uvOf(rA, ph, -z), uvOf(rA, ph, z), uvOf(rB, ph, z), uvOf(rB, ph, -z));
    }
  };
  ringFaces(radii[0] as number, 0, 1);
  risers(1, radii[0] as number, radii[1] as number);
  ringFaces(radii[1] as number, 1, 2);
  risers(2, radii[1] as number, radii[2] as number);
  ringFaces(radii[2] as number, 2, 3);
  risers(3, radii[2] as number, radii[3] as number);
  return s.build();
}

function rosetteGeo(): THREE.BufferGeometry {
  // dome built around Y (height = inward protrusion), petal ridges via vertex modulation
  const prof: P2[] = [
    [0, 0.5], [0.12, 0.46], [0.18, 0.36], [0.36, 0.32], [0.44, 0.22], [0.62, 0.18], [0.7, 0.07], [0.72, 0],
  ];
  const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 10);
  g.deleteAttribute('uv');
  const out = g.toNonIndexed();
  out.rotateZ(Math.PI / 2);
  out.translate(VAULT_PANEL_R, 0, 0);
  return out;
}

export interface ShellResult {
  coffers: THREE.InstancedMesh | null;
  rosettes: THREE.InstancedMesh | null;
}

export function buildShell(bags: Bags, stoneMat: THREE.Material, brassMat: THREE.Material): ShellResult {
  buildWallSolids(bags);
  for (const w of [...SIDE_WALLS, ...END_WALLS]) trimWall(w, bags);
  northRelief(bags);
  lunetteRing(bags);
  vaultShell(bags.stone);
  vaultRibs(bags.stone);

  // coffers
  const skin = cofferSkin(2);
  const count = COFFER_CELLS_PHI * COFFER_CELLS_Z;
  const coffers = new THREE.InstancedMesh(skin, stoneMat, count);
  const rosettes = new THREE.InstancedMesh(rosetteGeo(), brassMat, count);
  const mtx = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  let i = 0;
  for (let ip = 0; ip < COFFER_CELLS_PHI; ip++) {
    const th = ((ip + 0.5) / COFFER_CELLS_PHI) * Math.PI;
    for (let iz = 0; iz < COFFER_CELLS_Z; iz++) {
      const z = (iz + 0.5) * COFFER_PITCH_Z;
      rot.makeRotationZ(th);
      mtx.makeTranslation(0, VAULT.springlineY, z).multiply(rot);
      coffers.setMatrixAt(i, mtx);
      rosettes.setMatrixAt(i, mtx);
      i++;
    }
  }
  coffers.instanceMatrix.needsUpdate = true;
  rosettes.instanceMatrix.needsUpdate = true;
  coffers.castShadow = coffers.receiveShadow = true;
  rosettes.castShadow = false;
  rosettes.receiveShadow = true;
  coffers.frustumCulled = false;
  rosettes.frustumCulled = false;
  return { coffers, rosettes };
}

export type { Frame };
