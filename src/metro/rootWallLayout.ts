/**
 * The Root Wall: pure, deterministic plan of the strangler fig on the east end wall (no three.js, so Node tests import it).
 *
 *  - Roots are curves in the wall plane (z, y) with a radius per sample. The big ones (trunks, buttress roots, portal arches,
 *    branches) are fused into ONE relief field `reliefDepth(z, y)` (metres in front of the wall face) by a smooth maximum, so
 *    junctions are filleted and nothing looks like separate tubes; a low rocky-moss base layer covers the wall between them.
 *    The relief is zero inside every portal opening (+ margin) and fades in over a soft band.
 *  - Thin roots ride on that relief as tubes; the crown (limbs, leaf clumps, hanging moss) and the aerial strands are 3D data.
 * Geometry is built from this data in src/world/metro/rootWall.ts; invariants are asserted in scripts/metro-rootwall-test.ts.
 */
import { PORTAL, ROOT_WALL as RW, VESPER } from '../layoutMetro';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const ss = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---- portal openings --------------------------------------------------------------------------------------------------

const BED_Y = VESPER.railY - PORTAL.bedBelowRail; // -71.7
const TOP_Y = BED_Y + PORTAL.h; // -66.2
/** The two east Vesper bore openings in the wall plane (z, y rectangles). */
export const BORES = VESPER.trackZ.map((tz) => ({ z0: tz - PORTAL.w / 2, z1: tz + PORTAL.w / 2, y0: BED_Y, y1: TOP_Y }));

/** Distance from (z, y) to the nearest opening rectangle (0 inside). */
export function boreDist(z: number, y: number): number {
  let best = Infinity;
  for (const b of BORES) {
    const dz = Math.max(b.z0 - z, 0, z - b.z1), dy = Math.max(b.y0 - y, 0, y - b.y1);
    best = Math.min(best, Math.hypot(dz, dy));
  }
  return best;
}

/** Push a point radially out of the openings until it is `need` away. */
function pushOut(p: [number, number], need: number): void {
  for (let it = 0; it < 3; it++) {
    for (const b of BORES) {
      const cz = Math.min(b.z1, Math.max(b.z0, p[0])), cy = Math.min(b.y1, Math.max(b.y0, p[1]));
      const dz = p[0] - cz, dy = p[1] - cy;
      const d = Math.hypot(dz, dy);
      if (d >= need) continue;
      if (d > 1e-6) { p[0] = cz + (dz / d) * need; p[1] = cy + (dy / d) * need; continue; }
      // inside the rectangle: leave by the nearest side
      const exits: Array<[number, number, number]> = [
        [p[0] - b.z0, -1, 0], [b.z1 - p[0], 1, 0], [b.y1 - p[1], 0, 1],
      ];
      exits.sort((a, c) => a[0] - c[0]);
      const e = exits[0]!;
      p[0] = e[1] !== 0 ? (e[1] < 0 ? b.z0 - need : b.z1 + need) : p[0];
      p[1] = e[2] !== 0 ? b.y1 + need : p[1];
    }
  }
}

// ---- curves -----------------------------------------------------------------------------------------------------------

export type CurveKind = 'main' | 'ring' | 'branch';
/** A root in the wall plane, sampled every ~0.2 m. Radius r is the true half-width of its relief (bulges and flare included). */
export interface Curve { readonly kind: CurveKind; readonly z: number[]; readonly y: number[]; readonly r: number[] }
/** A thin root that rides on the relief (x is derived from the field in the builder). */
export interface ThinRoot { readonly z: number[]; readonly y: number[]; readonly r: number[]; readonly seed: number }
export type V3 = readonly [number, number, number];
export interface Limb { readonly pts: V3[]; readonly r: number[] }
export interface Clump { readonly x: number; readonly y: number; readonly z: number; readonly size: number; readonly seed: number }
export interface Aerial { readonly pts: V3[]; readonly r: number; readonly phase: number }
export interface MossStrand { readonly x: number; readonly y: number; readonly z: number; readonly len: number; readonly w: number; readonly seed: number }

const STEP = 0.2;

/** Uniform Catmull-Rom through `pts`, resampled every `step` metres of arc length. */
function spline(pts: ReadonlyArray<readonly [number, number]>, step: number): Array<[number, number]> {
  const dense: Array<[number, number]> = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(n - 1, i + 2)]!;
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const last = pts[n - 1]!;
  dense.push([last[0], last[1]]);
  const out: Array<[number, number]> = [dense[0]!];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    let a = dense[i - 1]!;
    const b = dense[i]!;
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(a);
      seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      acc = 0;
    }
    acc += seg;
  }
  const e = dense[dense.length - 1]!;
  const o = out[out.length - 1]!;
  if (Math.hypot(e[0] - o[0], e[1] - o[1]) > 0.05) out.push(e);
  return out;
}

/** Keep curves out of the openings and inside the wall extent, then relax kinks; the last pass is always a push-out. */
function relax(pts: Array<[number, number]>, r: number[], keepEnds: boolean, margin: number): void {
  const zLo = RW.zMin + 0.2, zHi = RW.zMax - 0.2;
  const fix = (): void => {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      p[0] = Math.min(zHi - r[i]!, Math.max(zLo + r[i]!, p[0]));
      pushOut(p, r[i]! + RW.boreMargin + margin);
    }
  };
  fix();
  for (let pass = 0; pass < 3; pass++) {
    const copy = pts.map((p) => [p[0], p[1]] as [number, number]);
    for (let i = 1; i < pts.length - 1; i++) {
      if (keepEnds && (i < 3 || i > pts.length - 4)) continue;
      pts[i]![0] = (copy[i - 1]![0] + 2 * copy[i]![0] + copy[i + 1]![0]) / 4;
      pts[i]![1] = (copy[i - 1]![1] + 2 * copy[i]![1] + copy[i + 1]![1]) / 4;
    }
    fix();
  }
}

// ---- the plan ---------------------------------------------------------------------------------------------------------

const LEVELS = [-33.4, -42, -50, -58, -64, -69] as const;
interface MainSpec { z: readonly number[]; rTop: number; rFoot: number; splay: number }
/** z at each LEVELS y, trunk to foot. Feet 3 and 8 are the arch legs (62.45 -+ 3.75, 85.55 -+ 3.75), clear of the openings by ~0.5 m. */
const MAINS: readonly MainSpec[] = [
  { z: [66.0, 64.6, 62.0, 59.8, 58.0, 56.9], rTop: 1.2, rFoot: 0.6, splay: +1 },
  { z: [68.2, 67.4, 65.2, 61.5, 58.9, 58.7], rTop: 1.45, rFoot: 0.74, splay: -1 },
  { z: [70.6, 70.2, 69.0, 67.4, 66.3, 66.2], rTop: 1.5, rFoot: 0.74, splay: +1 },
  { z: [72.3, 72.0, 71.4, 70.6, 69.8, 69.5], rTop: 1.7, rFoot: 0.66, splay: -1 },
  { z: [74.2, 74.0, 74.8, 74.4, 73.4, 73.0], rTop: 1.85, rFoot: 0.95, splay: +1 },
  { z: [76.2, 76.4, 77.0, 77.2, 76.8, 76.5], rTop: 1.75, rFoot: 0.6, splay: -1 },
  { z: [78.0, 78.4, 79.0, 79.6, 79.6, 79.5], rTop: 1.55, rFoot: 0.7, splay: +1 },
  { z: [80.0, 80.6, 81.0, 81.4, 81.8, 81.8], rTop: 1.4, rFoot: 0.74, splay: -1 },
  { z: [82.4, 84.0, 86.4, 88.4, 89.3, 89.4], rTop: 1.35, rFoot: 0.74, splay: +1 },
  { z: [84.0, 86.0, 88.8, 91.0, 91.8, 91.9], rTop: 1.1, rFoot: 0.58, splay: -1 },
];

const U_SPAN = RW.yTop - RW.yFloor;
const radiusAt = (spec: { rTop: number; rFoot: number }, y: number, ph: number): number => {
  const u = Math.min(1, Math.max(0, (RW.yTop - y) / U_SPAN));
  const base = lerp(spec.rTop, spec.rFoot, ss(0.3, 0.85, u));
  const flare = 1 + 0.55 * ss(0.9, 1.0, u);
  const bulge = 1 + 0.1 * Math.sin(u * 21 + ph) + 0.16 * (vnoise(u * 8 + ph, ph) - 0.5);
  return base * flare * bulge;
};

export interface RootWallPlan {
  readonly curves: Curve[];
  readonly thin: ThinRoot[];
  readonly limbs: Limb[];
  readonly clumps: Clump[];
  readonly aerials: Aerial[];
  readonly moss: MossStrand[];
}

let cached: RootWallPlan | null = null;

export function rootWallPlan(): RootWallPlan {
  if (cached) return cached;
  const rnd = mulberry32(RW.seed);
  const curves: Curve[] = [];

  const finish = (kind: CurveKind, ctrl: Array<[number, number]>, spec: { rTop: number; rFoot: number }, ph: number, keepEnds = false): Curve => {
    const pts = spline(ctrl, STEP);
    const r = pts.map((p) => radiusAt(spec, p[1], ph));
    relax(pts, r, keepEnds, 0.15);
    return { kind, z: pts.map((p) => p[0]), y: pts.map((p) => p[1]), r };
  };

  // Mains: trunk to floor, weaving (so neighbours touch, fuse and part again), flaring and splaying along the ground.
  const LEG = new Set([1, 2, 7, 8]); // the arch legs: no weave near the openings
  const zAt = (m: MainSpec, y: number): number => {
    for (let k = 0; k < LEVELS.length - 1; k++) {
      if (y <= LEVELS[k]! && y >= LEVELS[k + 1]!) return lerp(m.z[k]!, m.z[k + 1]!, ss(LEVELS[k]!, LEVELS[k + 1]!, y));
    }
    return m.z[m.z.length - 1]!;
  };
  for (let i = 0; i < MAINS.length; i++) {
    const m = MAINS[i]!;
    const ph = rnd() * 6.28, ph2 = rnd() * 6.28, amp = 0.55 + rnd() * 0.55;
    const ctrl: Array<[number, number]> = [];
    for (let y = LEVELS[0]!; y >= -69; y -= 3.6) {
      const u = (LEVELS[0]! - y) / 36;
      const win = ss(0, 0.12, u) * (LEG.has(i) ? 1 - ss(0.62, 0.82, u) : 1 - ss(0.88, 1, u));
      ctrl.push([zAt(m, y) + amp * win * (0.65 * Math.sin(u * 7.2 + ph) + 0.35 * Math.sin(u * 14 + ph2)), y]);
    }
    const zf = m.z[m.z.length - 1]!;
    const d = 1.8 + rnd() * 1.4;
    ctrl.push([zf + m.splay * 0.35, -71.3], [zf + m.splay * d, RW.yFloor + 0.05]);
    curves.push(finish('main', ctrl, { rTop: m.rTop * 1.08, rFoot: m.rFoot }, rnd() * 6.28));
  }
  // Diagonals: big roots that sweep across the mains (anastomosis) and drape over the arch crowns or run out to the corners.
  const DIAGS: ReadonlyArray<{ c: ReadonlyArray<[number, number]>; r0: number; r1: number }> = [
    { c: [[70.0, -42], [66.8, -50], [64.2, -58], [62.9, -62.6], [62.45, -63.9]], r0: 0.72, r1: 0.5 },
    { c: [[79.8, -42], [83.2, -50], [85.2, -58], [85.6, -62.6], [85.55, -63.9]], r0: 0.72, r1: 0.5 },
    { c: [[68.0, -45], [62.5, -51], [58.2, -58], [56.4, -66], [56.0, -72.0]], r0: 0.7, r1: 0.5 },
    { c: [[80.6, -45], [86.8, -52], [91.4, -60], [92.6, -67], [92.4, -72.0]], r0: 0.7, r1: 0.5 },
    { c: [[72.4, -47], [76.8, -55], [75.6, -62], [76.6, -68], [77.0, -72.0]], r0: 0.62, r1: 0.42 },
    { c: [[77.2, -47], [72.2, -55], [73.8, -62], [72.6, -68], [72.2, -72.0]], r0: 0.62, r1: 0.42 },
    { c: [[66.0, -38], [61.0, -44], [57.2, -50], [55.8, -56]], r0: 0.55, r1: 0.3 },
    { c: [[83.8, -38], [89.0, -44], [92.0, -50], [92.8, -56]], r0: 0.55, r1: 0.3 },
  ];
  for (const dg of DIAGS) {
    const ctrl = dg.c.map((p) => [p[0], p[1]] as [number, number]);
    const last = ctrl[ctrl.length - 1]!;
    if (last[1] <= -71) { const sgn = last[0] < 74 ? -1 : 1; ctrl.push([last[0] + sgn * 0.6, -72.4]); }
    curves.push(finish('branch', ctrl, { rTop: dg.r0, rFoot: dg.r1 }, rnd() * 6.28));
  }

  // Buttress flanges: fat, low roots that sweep out and down beside each bore, flaring into the floor.
  const FLANGES: ReadonlyArray<{ z: number; dir: number }> = [
    { z: 58.7, dir: -1 }, { z: 66.2, dir: +1 }, { z: 81.8, dir: -1 }, { z: 89.3, dir: +1 },
  ];
  for (const f of FLANGES) {
    const ctrl: Array<[number, number]> = [[f.z, -60], [f.z + f.dir * 0.7, -65], [f.z + f.dir * 1.9, -69.2], [f.z + f.dir * 3.4, -71.9], [f.z + f.dir * 4.8, RW.yFloor + 0.05]];
    curves.push(finish('branch', ctrl, { rTop: 0.7, rFoot: 0.8 }, rnd() * 6.28));
  }

  // Portal arches: a root ring over each bore, fusing into its two legs.
  for (const tz of VESPER.trackZ) {
    const o = 3.75;
    const ctrl: Array<[number, number]> = [
      [tz - o, -68.8], [tz - o + 0.1, -66.8], [tz - 3.15, -65.45], [tz - 1.95, -64.85], [tz, -64.62],
      [tz + 1.95, -64.85], [tz + 3.15, -65.45], [tz + o - 0.1, -66.8], [tz + o, -68.8],
    ];
    curves.push(finish('ring', ctrl, { rTop: 0.8, rFoot: 0.8 }, rnd() * 6.28, true));
  }

  // Branches: side roots peeling off the mains, descending to the floor and fusing into neighbours.
  const mains = curves.slice(0, MAINS.length);
  for (const c of mains) {
    const nKids = 2 + (rnd() < 0.6 ? 1 : 0);
    for (let k = 0; k < nKids; k++) {
      const cand: number[] = [];
      for (let i = 0; i < c.y.length; i++) if (c.y[i]! < -42 && c.y[i]! > -62) cand.push(i);
      if (cand.length === 0) continue;
      const i0 = cand[Math.floor(rnd() * cand.length)]!;
      const side = rnd() < 0.5 ? -1 : 1;
      const z0 = c.z[i0]! + side * c.r[i0]! * 0.5, y0 = c.y[i0]!;
      const dz = side * (1.2 + rnd() * 3.0);
      const dy = y0 - RW.yFloor;
      const ctrl: Array<[number, number]> = [
        [z0, y0], [z0 + dz * 0.3, y0 - dy * 0.26], [z0 + dz * 0.75, y0 - dy * 0.6], [z0 + dz, -71.3], [z0 + dz + side * (1 + rnd()), RW.yFloor + 0.05],
      ];
      const r0 = Math.min(0.55, Math.max(0.3, c.r[i0]! * 0.45));
      curves.push(finish('branch', ctrl, { rTop: r0, rFoot: Math.max(0.24, r0 * 0.7) }, rnd() * 6.28));
    }
  }

  // Thin roots: tubes that wander down over the relief and drape; some dangle short hairs under the arch beams.
  const thin: ThinRoot[] = [];
  const big = curves;
  const addThin = (z0: number, y0: number, r0: number, len: number, drift: number, seed: number): void => {
    const rr = mulberry32(seed);
    const zs: number[] = [z0], ys: number[] = [y0], rs: number[] = [r0];
    let z = z0, y = y0, vz = drift * 0.3, run = 0;
    while (run < len && y > RW.yFloor + 0.04) {
      vz += (rr() - 0.5) * 0.35 + (drift - vz) * 0.06;
      vz = Math.max(-0.7, Math.min(0.7, vz));
      const step = 0.22;
      y = Math.max(RW.yFloor + 0.03, y - step);
      z += vz * step;
      run += step;
      zs.push(z); ys.push(y);
      const t = run / len;
      const reachFloor = y <= RW.yFloor + 0.05;
      rs.push(reachFloor ? r0 * 1.25 : r0 * (1 - 0.45 * t * t));
    }
    const pts = zs.map((q, i) => [q, ys[i]!] as [number, number]);
    relax(pts, rs, false, 0.12);
    thin.push({ z: pts.map((p) => p[0]), y: pts.map((p) => p[1]), r: rs, seed });
  };
  const nThin = 44;
  for (let k = 0; k < nThin; k++) {
    const c = big[Math.floor(rnd() * big.length)]!;
    if (c.kind === 'ring') continue;
    const cand: number[] = [];
    for (let i = 0; i < c.y.length; i++) if (c.y[i]! < -40 && c.y[i]! > -66) cand.push(i);
    if (cand.length === 0) continue;
    const i0 = cand[Math.floor(rnd() * cand.length)]!;
    const side = rnd() < 0.5 ? -1 : 1;
    addThin(c.z[i0]! + side * c.r[i0]! * 0.7, c.y[i0]!, 0.07 + rnd() * rnd() * 0.2, 5 + rnd() * 17, side * (0.1 + rnd() * 0.3), Math.floor(rnd() * 1e9));
  }
  for (const ring of curves.filter((c) => c.kind === 'ring')) {
    const topY = Math.max(...ring.y);
    const cand: number[] = [];
    for (let i = 0; i < ring.y.length; i++) if (ring.y[i]! > topY - 0.35) cand.push(i);
    for (let k = 0; k < 5 && cand.length > 0; k++) {
      const i = cand[Math.floor(rnd() * cand.length)]!;
      addThin(ring.z[i]!, ring.y[i]! - ring.r[i]! * 0.8, 0.05 + rnd() * 0.05, 0.5 + rnd() * 0.4, 0, Math.floor(rnd() * 1e9));
    }
  }

  // Crown: limbs spread out from the trunk top under the sky; clumps along them; moss and aerial roots hang from them.
  const limbs: Limb[] = [];
  const clumps: Clump[] = [];
  const moss: MossStrand[] = [];
  const aerialStarts: V3[] = [];
  const CR = RW.crown;
  const clumpAt = (cx: number, cy: number, cz: number): void => {
    const size = 1.8 + rnd() * 1.0;
    const x = Math.min(RW.faceX - 0.6 * size, Math.max(CR.xMin + 0.6 * size, cx));
    const y = Math.min(CR.topCapY - 0.6 * size, Math.max(CR.yMin + 0.5 * size, cy));
    const z = Math.min(RW.zMax - 0.5 * size, Math.max(RW.zMin + 0.5 * size, cz));
    clumps.push({ x, y, z, size, seed: Math.floor(rnd() * 1e9) });
  };
  const limbPath = (a: V3, b: V3, mid: V3, r0: number, r1: number): Limb => {
    const n = 14;
    const pts: V3[] = [], r: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * a[0] + 2 * u * t * mid[0] + t * t * b[0], u * u * a[1] + 2 * u * t * mid[1] + t * t * b[1], u * u * a[2] + 2 * u * t * mid[2] + t * t * b[2]]);
      r.push(lerp(r0, r1, Math.pow(t, 0.8)) * (1 + 0.1 * Math.sin(t * 9 + r0 * 20)));
    }
    return { pts, r };
  };
  const nLimbs = 10;
  for (let i = 0; i < nLimbs; i++) {
    const zb = 66 + (i / (nLimbs - 1)) * 19 + (rnd() - 0.5) * 1.2;
    const yb = -36.8 + (rnd() - 0.5) * 2.6;
    const phi = ((zb - 75.5) / 10.5) * 0.9 + (rnd() - 0.5) * 0.3;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const L = Math.min(10.5, 7.6 / Math.max(0.5, cp)) * (0.78 + rnd() * 0.3);
    const a: V3 = [RW.faceX - 1.6, yb, zb];
    const tipX = Math.max(CR.xMin + 1.3, a[0] - L * cp);
    const tipZ = Math.min(RW.zMax - 1.4, Math.max(RW.zMin + 1.4, zb + L * sp));
    const b: V3 = [tipX, Math.min(-35.6, Math.max(-41.5, yb + (rnd() - 0.55) * 3.0)), tipZ];
    const mid: V3 = [(a[0] + b[0]) / 2 + 0.2, Math.max(a[1], b[1]) + 0.7, (a[2] + b[2]) / 2];
    const limb = limbPath(a, b, mid, 0.5 + rnd() * 0.2, 0.09);
    limbs.push(limb);
    const subs: Limb[] = [limb];
    for (let j = 0; j < 2; j++) {
      const s = 0.35 + rnd() * 0.45;
      const k = Math.round(s * (limb.pts.length - 1));
      const p = limb.pts[k]!;
      const ang = phi + (j === 0 ? -1 : 1) * (0.5 + rnd() * 0.5);
      const l2 = 2.8 + rnd() * 2.4;
      const e: V3 = [
        Math.max(CR.xMin + 1.2, p[0] - l2 * Math.cos(ang)),
        Math.min(-35.4, Math.max(-42, p[1] + (rnd() - 0.55) * 2.4)),
        Math.min(RW.zMax - 1.3, Math.max(RW.zMin + 1.3, p[2] + l2 * Math.sin(ang))),
      ];
      const sub = limbPath(p, e, [(p[0] + e[0]) / 2, Math.max(p[1], e[1]) + 0.35, (p[2] + e[2]) / 2], limb.r[k]! * 0.55, 0.06);
      limbs.push(sub);
      subs.push(sub);
    }
    for (const lb of subs) {
      for (let k = 3; k < lb.pts.length; k += 2) {
        const p = lb.pts[k]!;
        for (let q = 0; q < 2; q++) clumpAt(p[0] + (rnd() - 0.5) * 2.6, p[1] + (rnd() - 0.35) * 2.6, p[2] + (rnd() - 0.5) * 2.6);
        if (rnd() < 0.5) moss.push({ x: p[0], y: p[1] - lb.r[k]!, z: p[2], len: 1.5 + rnd() * 2.2, w: 0.4 + rnd() * 0.3, seed: Math.floor(rnd() * 1e9) });
        if (p[0] < RW.faceX - 3.2 && p[1] > -42) aerialStarts.push([p[0], p[1] - lb.r[k]!, p[2]]);
      }
    }
  }
  // Fill: dense foliage hiding the trunk tops against the sky reveal.
  for (let k = 0; k < 110; k++) {
    clumpAt(RW.faceX - 1.2 - rnd() * 3.2, -35.0 - Math.pow(rnd(), 1.4) * 8.5, 62 + rnd() * 26);
  }

  const aerials: Aerial[] = [];
  for (let k = 0; k < 72 && aerialStarts.length > 0; k++) {
    const s = aerialStarts[Math.floor(rnd() * aerialStarts.length)]!;
    const x0 = s[0] + (rnd() - 0.5) * 0.9, z0 = s[2] + (rnd() - 0.5) * 0.9;
    const len = Math.min(RW.aerial.lenMin + rnd() * (RW.aerial.lenMax - RW.aerial.lenMin), s[1] - RW.aerial.yMin);
    if (len < 4) continue;
    const n = Math.max(4, Math.round(len / 0.9));
    const pts: V3[] = [];
    const ph = rnd() * 6.28, amp = 0.05 + rnd() * 0.18;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x0 + Math.sin(ph + t * 3.1) * amp * t, s[1] - len * t, z0 + Math.cos(ph * 1.3 + t * 2.6) * amp * t]);
    }
    aerials.push({ pts, r: 0.016 + rnd() * 0.026, phase: ph });
  }

  cached = { curves, thin, limbs, clumps, aerials, moss };
  return cached;
}

// ---- the relief field -------------------------------------------------------------------------------------------------

const CELL = 1.0;
const GZ0 = RW.zMin - 3, GY0 = RW.yFloor - 1;
const GNZ = Math.ceil((RW.zMax - RW.zMin + 6) / CELL), GNY = Math.ceil((RW.yTop - RW.yFloor + 3) / CELL);
let grid: Array<Array<number>> | null = null; // cell -> flat [curve, segment, ...]
let segPlan: RootWallPlan | null = null;

function depthCap(y: number): number {
  return lerp(RW.depthCapLow, RW.depthCapHigh, ss(RW.capRampY[0], RW.capRampY[1], y));
}
/** Lowest x any root surface may reach at height y (the relief cap, plus its 6 cm bulge allowance). */
export function rootMinXAt(y: number): number {
  return RW.faceX - depthCap(y) - 0.06;
}
function smax(a: number, b: number, k: number): number {
  const mn = Math.min(a, b);
  if (mn <= 1e-4) return Math.max(a, b);
  const kk = k * ss(0, 0.2, mn);
  const h = Math.max(kk - Math.abs(a - b), 0) / kk;
  return Math.max(a, b) + (h * h * kk) / 4;
}

function buildGrid(plan: RootWallPlan): void {
  grid = Array.from({ length: GNZ * GNY }, () => []);
  plan.curves.forEach((c, ci) => {
    for (let i = 0; i < c.z.length - 1; i++) {
      const rr = Math.max(c.r[i]!, c.r[i + 1]!) * 1.02;
      const z0 = Math.min(c.z[i]!, c.z[i + 1]!) - rr, z1 = Math.max(c.z[i]!, c.z[i + 1]!) + rr;
      const y0 = Math.min(c.y[i]!, c.y[i + 1]!) - rr, y1 = Math.max(c.y[i]!, c.y[i + 1]!) + rr;
      const iz0 = Math.max(0, Math.floor((z0 - GZ0) / CELL)), iz1 = Math.min(GNZ - 1, Math.floor((z1 - GZ0) / CELL));
      const iy0 = Math.max(0, Math.floor((y0 - GY0) / CELL)), iy1 = Math.min(GNY - 1, Math.floor((y1 - GY0) / CELL));
      for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) grid![iy * GNZ + iz]!.push(ci, i);
    }
  });
  segPlan = plan;
}

/** Rocky-moss base layer under everything: 5 to 38 cm of low undulation. */
export function baseDepth(z: number, y: number): number {
  const n1 = vnoise(z * 0.25 + 11, y * 0.25 - 3), n2 = vnoise(z * 0.7 - 5, y * 0.7 + 2), n3 = vnoise(z * 2.1, y * 2.1);
  return 0.05 + 0.27 * n1 * n1 * 1.4 + 0.14 * n2 + 0.05 * n3;
}

const bestRatio = new Float64Array(256), bestR = new Float64Array(256), bestY = new Float64Array(256);
const stamp = new Int32Array(256);
let stampId = 0;

/** Height of the fused roots alone (before the base layer, masks and caps). */
export function rootsOnly(z: number, y: number): number {
  const plan = rootWallPlan();
  if (!grid || segPlan !== plan) buildGrid(plan);
  const iz = Math.floor((z - GZ0) / CELL), iy = Math.floor((y - GY0) / CELL);
  if (iz < 0 || iz >= GNZ || iy < 0 || iy >= GNY) return 0;
  const list = grid![iy * GNZ + iz]!;
  stampId++;
  const touched: number[] = [];
  for (let q = 0; q < list.length; q += 2) {
    const ci = list[q]!, i = list[q + 1]!;
    const c = plan.curves[ci]!;
    const ax = c.z[i]!, ay = c.y[i]!, bx = c.z[i + 1]!, by = c.y[i + 1]!;
    const dx = bx - ax, dy = by - ay;
    const t = Math.min(1, Math.max(0, ((z - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy + 1e-9)));
    const d = Math.hypot(z - (ax + dx * t), y - (ay + dy * t));
    const r = lerp(c.r[i]!, c.r[i + 1]!, t);
    const ratio = d / r;
    if (stamp[ci] !== stampId) { stamp[ci] = stampId; bestRatio[ci] = ratio; bestR[ci] = r; bestY[ci] = ay + dy * t; touched.push(ci); }
    else if (ratio < bestRatio[ci]!) { bestRatio[ci] = ratio; bestR[ci] = r; bestY[ci] = ay + dy * t; }
  }
  touched.sort((a, b) => a - b);
  let acc = 0;
  for (const ci of touched) {
    const t = bestRatio[ci]!;
    if (t >= 1) continue;
    const rr = bestR[ci]!;
    const A = Math.min(rr * (1.02 + 0.38 * ss(1.0, 1.9, rr)), depthCap(bestY[ci]!));
    acc = smax(acc, A * Math.pow(1 - t * t, 0.62), 0.28);
  }
  return acc;
}

/** Relief depth (m in front of the wall face) at (z, y): fused roots over the base layer, zero in the openings. */
export function reliefDepth(z: number, y: number): number {
  const ez = ss(RW.zMin, RW.zMin + 0.7, z) * ss(RW.zMax, RW.zMax - 0.7, z);
  const ey = ss(RW.yTop, RW.yTop - 0.8, y);
  if (ez * ey <= 0) return 0;
  const bore = ss(RW.boreMargin, RW.boreMargin + RW.boreSoft, boreDist(z, y));
  if (bore <= 0) return 0;
  const d = smax(rootsOnly(z, y), baseDepth(z, y), 0.12);
  return Math.min(d, depthCap(y) + 0.06) * ez * ey * bore;
}
