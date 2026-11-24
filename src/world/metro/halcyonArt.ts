import * as THREE from 'three';
import { HALCYON, HALCYON_ART, SHELL, halcyonBenches, halcyonPoint } from '../../layoutMetro';
import { dayNight } from '../../metro/dayNight';
import { vnoise } from '../../metro/forestGround';
import { CELL, Mesher, MOSS, bezier, card, frond, mixc, mulberry32, sharedFoliageAtlas, tube, type Cell } from './forest';
import { vertexGlow } from './glow';
import { makeOakTexture } from './walkKit';

/**
 * Halcyon makeover (user-approved 2026-11-24; coordinates in HALCYON_ART, layoutMetro.ts): the warm slatted oak ceiling with its
 * recessed light lines, the planted central island (kerbed oak beds, tree ferns, small trees, ferns, moss, boulders, benches facing
 * them) and the dappled-light art wall (a backlit translucent stone ribbon with a slow leaf-shadow shader).
 *
 * Draw calls: 4. halcyonOak (ceiling, kerbs, benches; vertex glow = the warm light lines), halcyonPlanterSoil (soil, moss, boulders,
 * bark), halcyonPlanterFoliage (atlas cards, wind sway), halcyonLightArt (the ribbon). No real lights.
 */

export interface HalcyonArtOpts {
  /** Only used for texture anisotropy; omitted = a conservative 8. */
  renderer?: THREE.WebGLRenderer;
  /** Ceiling openings (convex, world x/z): the light well and the F6 headroom slot. Slats and light lines stop short of them. */
  holesWorld: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  /** Soffit height (HALCYON.ceilingY). */
  ceilY: number;
  /** The art ribbon: stack-bond joints along s, bottom and top y. */
  art: { joints: readonly number[]; y0: number; y1: number };
}

export interface HalcyonArtBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  /** Draw calls this adds. */
  calls: number;
}

type V3 = readonly [number, number, number];
type RGB = readonly [number, number, number];

const UX = HALCYON.dir[0], UZ = HALCYON.dir[1];
const VX = -UZ, VZ = UX;
const Y_TOP = HALCYON.topY;
const W_HALL = HALCYON.hallHalfWidth;
const L_HALL = HALCYON.halfLength + HALCYON.portalExtra;
const CE = HALCYON_ART.ceiling;
const PL = HALCYON_ART.planter;

const NS: V3 = [UX, 0, UZ];
const NT: V3 = [VX, 0, VZ];
const wp = (s: number, y: number, t: number): V3 => { const [x, z] = halcyonPoint(s, t); return [x, y, z]; };

/** Oak texture tile: 2.24 m along the grain (u), 1.12 m across eight 0.14 m boards (v). */
const TILE_U = 2.24, TILE_V = 1.12;

/** Day/night + time shared by the animated materials, written from onBeforeRender (real time, no allocation). */
const U = { time: { value: 0 }, night: { value: 0 }, golden: { value: 0 } };
const syncUniforms = (): void => {
  U.time.value = dayNight.realTime;
  U.night.value = dayNight.state.night;
  U.golden.value = dayNight.state.golden;
};

// ---- geometry buffer for the oak mesh ----------------------------------------------------------------------------------------

class OakBuf {
  private pos: number[] = []; private nor: number[] = []; private uv: number[] = []; private col: number[] = []; private lift: number[] = []; private idx: number[] = [];
  /** One quad (any corner order); `n` decides which side is the front. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uvs: ReadonlyArray<readonly [number, number]>, col: RGB, lift: number): void {
    const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    const order = cx * n[0] + cy * n[1] + cz * n[2] >= 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
    const p = [a, b, c, d];
    const base = this.pos.length / 3;
    for (const i of order) {
      const v = p[i]!, t = uvs[i]!;
      this.pos.push(v[0], v[1], v[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(t[0], t[1]);
      this.col.push(col[0], col[1], col[2]); this.lift.push(lift);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Box in hall-local (s, y, t); faces by name; oak uv with the grain along s. */
  box(s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, o: BoxOpts): void {
    const vo = o.vOff ?? 0, vs = o.vScale ?? 0.6, col = o.col, L = o.lift ?? {};
    const skip = o.skip ?? [];
    const has = (f: string): boolean => !skip.includes(f);
    const uS = (s: number): number => s / TILE_U;
    if (has('bot')) this.quad(wp(s0, y0, t0), wp(s1, y0, t0), wp(s1, y0, t1), wp(s0, y0, t1), [0, -1, 0],
      [[uS(s0), vo], [uS(s1), vo], [uS(s1), vo + (t1 - t0) / TILE_V], [uS(s0), vo + (t1 - t0) / TILE_V]], col, L.bot ?? 0);
    if (has('top')) this.quad(wp(s0, y1, t0), wp(s1, y1, t0), wp(s1, y1, t1), wp(s0, y1, t1), [0, 1, 0],
      [[uS(s0), vo], [uS(s1), vo], [uS(s1), vo + (t1 - t0) / TILE_V], [uS(s0), vo + (t1 - t0) / TILE_V]], col, L.top ?? 0);
    const vh = vo + ((y1 - y0) * vs) / TILE_V;
    if (has('t0')) this.quad(wp(s0, y0, t0), wp(s1, y0, t0), wp(s1, y1, t0), wp(s0, y1, t0), [-NT[0], 0, -NT[2]],
      [[uS(s0), vo], [uS(s1), vo], [uS(s1), vh], [uS(s0), vh]], col, L.t0 ?? 0);
    if (has('t1')) this.quad(wp(s0, y0, t1), wp(s1, y0, t1), wp(s1, y1, t1), wp(s0, y1, t1), NT,
      [[uS(s0), vo], [uS(s1), vo], [uS(s1), vh], [uS(s0), vh]], col, L.t1 ?? 0);
    if (has('s0')) this.quad(wp(s0, y0, t0), wp(s0, y0, t1), wp(s0, y1, t1), wp(s0, y1, t0), [-NS[0], 0, -NS[2]],
      [[t0 / TILE_U, vo], [t1 / TILE_U, vo], [t1 / TILE_U, vh], [t0 / TILE_U, vh]], col, L.end ?? 0);
    if (has('s1')) this.quad(wp(s1, y0, t0), wp(s1, y0, t1), wp(s1, y1, t1), wp(s1, y1, t0), NS,
      [[t0 / TILE_U, vo], [t1 / TILE_U, vo], [t1 / TILE_U, vh], [t0 / TILE_U, vh]], col, L.end ?? 0);
  }
  /** Flat glowing quad (vertex colour above 1.2 = unlit HDR emitter in the oak call). */
  glowQuad(a: V3, b: V3, c: V3, d: V3, n: V3, col: RGB): void {
    this.quad(a, b, c, d, n, [[0, 0], [1, 0], [1, 1], [0, 1]], col, 0);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aLift', new THREE.Float32BufferAttribute(this.lift, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
interface BoxOpts { col: RGB; lift?: { bot?: number; top?: number; t0?: number; t1?: number; end?: number }; vOff?: number; vScale?: number; skip?: string[] }

// ---- 1. the oak slat ceiling ---------------------------------------------------------------------------------------------------

type P2 = readonly [number, number];

/** Subtract open intervals from [a, b]. */
function subtract1D(a: number, b: number, cuts: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  let segs: Array<[number, number]> = [[a, b]];
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [s0, s1] of segs) {
      if (c1 <= s0 || c0 >= s1) { next.push([s0, s1]); continue; }
      if (c0 > s0 + 0.02) next.push([s0, c0]);
      if (c1 < s1 - 0.02) next.push([c1, s1]);
    }
    segs = next;
  }
  return segs;
}

function localPoly(poly: ReadonlyArray<readonly [number, number]>): P2[] {
  return poly.map(([x, z]) => {
    const dx = x - HALCYON.centre[0], dz = z - HALCYON.centre[1];
    return [dx * UX + dz * UZ, dx * VX + dz * VZ] as P2;
  });
}

/** s extent of a convex polygon (hall-local) along the line t = const, or null when the line misses it. */
function sliceS(poly: readonly P2[], t: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    if ((p[1] - t) * (q[1] - t) > 0 || p[1] === q[1]) continue;
    const s = p[0] + ((t - p[1]) / (q[1] - p[1])) * (q[0] - p[0]);
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  return hi > lo ? [lo, hi] : null;
}

/** Hash for per-slat variety (deterministic). */
const rnd1 = (i: number, k: number): number => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

function addCeiling(b: OakBuf, o: HalcyonArtOpts): void {
  const yBot = o.ceilY, yTop = o.ceilY + CE.slatDepth;
  const holes = o.holesWorld.map(localPoly);
  const sEnd = L_HALL - 0.04;
  const blocked = (ta: number, tb: number, pad: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (const poly of holes) {
      let lo = Infinity, hi = -Infinity;
      for (const t of [ta, (ta + tb) / 2, tb]) {
        const sl = sliceS(poly, t);
        if (sl) { lo = Math.min(lo, sl[0]); hi = Math.max(hi, sl[1]); }
      }
      if (hi > lo) out.push([lo - pad, hi + pad]);
    }
    return out;
  };

  // Bays between the light lines (and the long walls): slats flush with the line edges at both sides.
  const lw = CE.lineW / 2;
  const bounds: Array<[number, number]> = [];
  const edges = [-W_HALL + CE.wallInset, ...CE.lineT.flatMap((t) => [t - lw, t + lw]), W_HALL - CE.wallInset];
  for (let i = 0; i < edges.length; i += 2) bounds.push([edges[i]!, edges[i + 1]!]);

  const tint: RGB = [1.0, 0.86, 0.66];
  let slatIdx = 0;
  for (const [T0, T1] of bounds) {
    const n = Math.max(2, Math.round((T1 - T0 - CE.slatW) / CE.slatPitch) + 1);
    const pitch = (T1 - T0 - CE.slatW) / (n - 1);
    for (let k = 0; k < n; k++, slatIdx++) {
      const tc = T0 + CE.slatW / 2 + k * pitch;
      const ta = tc - CE.slatW / 2, tb = tc + CE.slatW / 2;
      // nearest light line: the slat sides facing it catch the glow, and the bottoms brighten toward it
      let dl = Infinity, dir = 0;
      for (const lt of CE.lineT) { const d = Math.abs(tc - lt); if (d < dl) { dl = d; dir = Math.sign(lt - tc); } }
      const near = Math.exp(-Math.max(0, dl - lw) / 0.9);
      const bot = 0.07 + 0.30 * near;
      const tone = 0.9 + 0.16 * rnd1(slatIdx, 1);
      const col: RGB = [tint[0] * tone, tint[1] * tone, tint[2] * tone];
      const vOff = Math.floor(rnd1(slatIdx, 2) * 8) / 8 + 0.02;
      const free = subtract1D(-sEnd, sEnd, blocked(ta, tb, CE.holePad));
      for (const [fa, fb] of free) {
        let cur = fa, first = true;
        while (cur < fb - 1e-6) {
          let next = Math.min(fb, cur + (first ? CE.moduleLen * (0.35 + 0.65 * rnd1(slatIdx, 3)) : CE.moduleLen));
          if (fb - next < 0.5) next = fb;
          const a = cur + (cur > fa ? CE.jointGap / 2 : 0), c = next - (next < fb ? CE.jointGap / 2 : 0);
          const skip = ['top'];
          if (cur > fa) skip.push('s0');
          if (next < fb) skip.push('s1');
          // t0 side faces -t, t1 side faces +t; the side toward the nearest line is the lit one
          b.box(a, c, yBot, yTop, ta, tb, {
            col, vOff, vScale: 0.55, skip,
            lift: { bot, t0: dir < 0 ? 0.85 : 0.18, t1: dir > 0 ? 0.85 : 0.18, end: 0.2 },
          });
          cur = next; first = false;
        }
      }
    }
  }

  // Recessed warm light lines in the grooves between the bays (vertex glow: unlit HDR in the oak call).
  const glow: RGB = [2.35, 1.62, 0.86];
  for (const lt of CE.lineT) {
    for (const [fa, fb] of subtract1D(-sEnd, sEnd, blocked(lt - lw, lt + lw, CE.holePad))) {
      const y = yTop - 0.008;
      b.glowQuad(wp(fa, y, lt - lw), wp(fb, y, lt - lw), wp(fb, y, lt + lw), wp(fa, y, lt + lw), [0, -1, 0], glow);
    }
  }

  // Oak trim band around each ceiling opening (mitred; the edges lying on a long wall get none).
  for (const poly of o.holesWorld) {
    const n = poly.length;
    const cxm = poly.reduce((a, p) => a + p[0], 0) / n, czm = poly.reduce((a, p) => a + p[1], 0) / n;
    const onWall = (i: number): boolean => {
      const a = localPoly([poly[i]!, poly[(i + 1) % n]!]);
      return Math.abs(Math.abs(a[0]![1]) - W_HALL) < 0.05 && Math.abs(Math.abs(a[1]![1]) - W_HALL) < 0.05;
    };
    // offset line of edge i: point + direction
    const line = (i: number, off: number): { px: number; pz: number; dx: number; dz: number } => {
      const p = poly[i]!, q = poly[(i + 1) % n]!;
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const dx = (q[0] - p[0]) / L, dz = (q[1] - p[1]) / L;
      let nx = -dz, nz = dx;
      if (nx * ((p[0] + q[0]) / 2 - cxm) + nz * ((p[1] + q[1]) / 2 - czm) < 0) { nx = -nx; nz = -nz; }
      return { px: p[0] + nx * off, pz: p[1] + nz * off, dx, dz };
    };
    const meet = (A: { px: number; pz: number; dx: number; dz: number }, B: { px: number; pz: number; dx: number; dz: number }): [number, number] => {
      const den = A.dx * B.dz - A.dz * B.dx;
      if (Math.abs(den) < 1e-9) return [A.px, A.pz];
      const k = ((B.px - A.px) * B.dz - (B.pz - A.pz) * B.dx) / den;
      return [A.px + A.dx * k, A.pz + A.dz * k];
    };
    const vtx = (i: number): [number, number] => poly[i]! as unknown as [number, number];
    for (let i = 0; i < n; i++) {
      if (onWall(i)) continue;
      const prev = (i + n - 1) % n, next = (i + 1) % n;
      const me = line(i, CE.trimW);
      const q0 = onWall(prev) ? meet(me, line(prev, 0)) : meet(me, line(prev, CE.trimW));
      const q1 = onWall(next) ? meet(me, line(next, 0)) : meet(me, line(next, CE.trimW));
      const p0 = vtx(i), p1 = vtx(next);
      const mx = (p0[0] + p1[0]) / 2 - cxm, mz = (p0[1] + p1[1]) / 2 - czm;
      const eL = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const ln = (a: [number, number], y: number): V3 => [a[0], y, a[1]];
      const outN: V3 = (() => { const l = Math.hypot(mx, mz) || 1; return [mx / l, 0, mz / l]; })();
      const col: RGB = [0.92, 0.78, 0.6];
      const u = (x: number): number => x / TILE_U;
      b.quad(ln(p0, yBot), ln(p1, yBot), ln(q1, yBot), ln(q0, yBot), [0, -1, 0], [[0, 0.1], [u(eL), 0.1], [u(eL), 0.22], [0, 0.22]], col, 0.12);
      // inner face (toward the opening) and outer face
      const inN: V3 = [-outN[0], 0, -outN[2]];
      b.quad(ln(p0, yBot), ln(p1, yBot), ln(p1, yTop), ln(p0, yTop), inN, [[0, 0.1], [u(eL), 0.1], [u(eL), 0.2], [0, 0.2]], col, 0.18);
      b.quad(ln(q0, yBot), ln(q1, yBot), ln(q1, yTop), ln(q0, yTop), outN, [[0, 0.1], [u(eL), 0.1], [u(eL), 0.2], [0, 0.2]], col, 0.1);
    }
  }
}

// ---- 2. the planter beds and benches (oak) --------------------------------------------------------------------------------------

const KERB_TOP = Y_TOP + PL.kerbH;
/** Soil height at hall-local (s, t) inside a bed: a low crown with a little noise, dropping toward the kerb. */
const soilY = (s: number, t: number): number =>
  KERB_TOP - 0.09 + 0.07 * (1 - (t / PL.halfWidth) * (t / PL.halfWidth)) + 0.035 * (vnoise(s * 1.7, t * 1.7 + 3) - 0.5) * 2;

function addBeds(b: OakBuf): void {
  const hw = PL.halfWidth;
  const kerb: RGB = [0.98, 0.84, 0.64];
  const dark: RGB = [0.2, 0.15, 0.11];
  const y0 = Y_TOP + PL.plinthH, y1 = KERB_TOP;
  for (const bed of PL.beds) {
    const { s0, s1 } = bed;
    const vo = (Math.abs(s0) * 0.37) % 1;
    // recessed plinth (dark), so the bed floats on a shadow gap
    b.box(s0 + PL.plinthInset, s1 - PL.plinthInset, Y_TOP, y0, -(hw - PL.plinthInset), hw - PL.plinthInset, { col: dark, skip: ['bot', 'top'], vOff: 0.3 });
    // four oak walls
    for (const sg of [-1, 1] as const) {
      const ta = sg > 0 ? hw - PL.wallT : -hw, tb = sg > 0 ? hw : -hw + PL.wallT;
      b.box(s0, s1, y0, y1, ta, tb, { col: kerb, skip: ['bot', 's0', 's1'], vOff: vo + (sg > 0 ? 0 : 0.5), vScale: 1.0 });
    }
    for (const se of [-1, 1] as const) {
      const sa = se > 0 ? s1 - PL.wallT : s0, sb = se > 0 ? s1 : s0 + PL.wallT;
      b.box(sa, sb, y0, y1, -hw + PL.wallT, hw - PL.wallT, { col: kerb, skip: ['bot', 't0', 't1'], vOff: vo + 0.25, vScale: 1.0 });
    }
  }
  // benches facing the beds
  const { gap, depth, length, seatY, backTop } = PL.bench;
  const seat: RGB = [1.0, 0.88, 0.7];
  for (const bn of halcyonBenches()) {
    const sg = bn.side;
    const tIn = sg * (hw + gap), tOut = sg * (hw + gap + depth);
    const tLo = Math.min(tIn, tOut), tHi = Math.max(tIn, tOut);
    const sa = bn.s - length / 2, sb = bn.s + length / 2;
    const ySeat = Y_TOP + seatY;
    const slats = 5, sGap = 0.012, sw = (depth - (slats - 1) * sGap) / slats;
    for (let i = 0; i < slats; i++) {
      const ta = tLo + i * (sw + sGap);
      b.box(sa, sb, ySeat - 0.04, ySeat, ta, ta + sw, { col: seat, vOff: ((i * 3 + Math.abs(bn.s)) % 8) / 8 + 0.02 });
    }
    for (const e of [0.2, length - 0.27]) {
      // seat support slab and the back post rising from it
      b.box(sa + e, sa + e + 0.07, Y_TOP, ySeat - 0.04, tLo + 0.03, tHi - 0.03, { col: seat, skip: ['bot'], vOff: 0.5 });
      const tPost0 = sg > 0 ? tHi - 0.045 : tLo, tPost1 = sg > 0 ? tHi : tLo + 0.045;
      b.box(sa + e, sa + e + 0.07, ySeat - 0.04, Y_TOP + backTop, tPost0, tPost1, { col: seat, vOff: 0.1 });
    }
    // backrest on the far side: two oak rails between the posts
    const tB0 = sg > 0 ? tHi - 0.04 : tLo + 0.01, tB1 = sg > 0 ? tHi - 0.01 : tLo + 0.04;
    for (const [ya, yb] of [[ySeat + 0.14, ySeat + 0.215], [ySeat + 0.255, ySeat + 0.33]] as const) {
      b.box(sa + 0.02, sb - 0.02, ya, yb, tB0, tB1, { col: seat, vOff: 0.35, vScale: 1.0 });
    }
  }
}

// ---- 3. planting (soil, bark, foliage) --------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const BARK: RGB = [0.26, 0.2, 0.15];
const FERN_BARK: RGB = [0.15, 0.1, 0.07];

const toV = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
const at3 = (s: number, t: number, dy = 0): THREE.Vector3 => toV(wp(s, soilY(s, t) + dy, t));

function treeFern(bark: Mesher, fol: Mesher, s: number, t: number, h: number, seed: number): void {
  const rnd = mulberry32(seed);
  const base = at3(s, t, -0.1);
  const top = at3(s + (rnd() - 0.5) * 0.25, t + (rnd() - 0.5) * 0.25).add(new THREE.Vector3(0, h, 0));
  const k = 0.6 + 0.4 * Math.min(1, h / 2);
  const spine = bezier(base, base.clone().lerp(top, 0.5).add(new THREE.Vector3(0.03, 0, 0.03)), top, 6);
  tube(bark, spine, 8, (u) => (u > 0.94 ? 0.125 * k * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - (u - 0.94) / 0.06))) : (0.18 - 0.06 * u) * k),
    (u) => mixc(FERN_BARK, MOSS, 0.3 * (1 - u)), 0);
  const ph = rnd() * TAU;
  const fronds = 11;
  const lenK = 0.55 + 0.45 * Math.min(1, h / 1.6);
  for (let i = 0; i < fronds; i++) {
    const az = (i / fronds) * TAU + (rnd() - 0.5) * 0.4;
    const len = (1.25 + rnd() * 0.45) * lenK;
    const tone = 0.9 + rnd() * 0.25;
    frond(fol, top.clone().add(new THREE.Vector3(0, -0.1 * k, 0)), az, 0.75 + rnd() * 0.3, -0.45 - rnd() * 0.35, len, len * 0.3, 6,
      rnd() < 0.5 ? CELL.frondA : CELL.frondB, [tone, tone, tone * 0.95], 0.7, ph + i);
  }
}

function smallTree(bark: Mesher, fol: Mesher, s: number, t: number, h: number, seed: number): void {
  const rnd = mulberry32(seed);
  const stems = 3;
  const tips: THREE.Vector3[] = [];
  const crown = at3(s, t).add(new THREE.Vector3(0, h * 0.74, 0));
  for (let i = 0; i < stems; i++) {
    const ang = (i / stems) * TAU + rnd() * 0.6;
    const lean = 0.18 + rnd() * 0.22;
    const base = at3(s + Math.cos(ang) * 0.1, t + Math.sin(ang) * 0.1, -0.06);
    const hh = h * (0.8 + 0.2 * rnd());
    const top = base.clone().add(new THREE.Vector3(Math.cos(ang) * lean * hh * 0.5, hh, Math.sin(ang) * lean * hh * 0.5));
    const mid = base.clone().lerp(top, 0.5).add(new THREE.Vector3(-Math.cos(ang) * 0.12, 0, -Math.sin(ang) * 0.12));
    const r0 = 0.03 + 0.007 * h;
    tube(bark, bezier(base, mid, top, 8), 6, (u) => r0 * (1 - 0.72 * u) + 0.012, (u) => mixc(BARK, MOSS, 0.12 + 0.28 * (1 - u)), 0);
    tips.push(top);
    for (let j = 0; j < 2; j++) {
      const f = 0.55 + rnd() * 0.25;
      const q0 = base.clone().lerp(top, f);
      const az2 = ang + (j ? 1 : -1) * (0.7 + rnd() * 0.8);
      const q1 = q0.clone().add(new THREE.Vector3(Math.cos(az2) * (0.5 + rnd() * 0.4), 0.4 + rnd() * 0.4, Math.sin(az2) * (0.5 + rnd() * 0.4)));
      tube(bark, [q0, q0.clone().lerp(q1, 0.5), q1], 5, (u) => r0 * 0.4 * (1 - 0.75 * u) + 0.008, () => mixc(BARK, MOSS, 0.3), 0);
      tips.push(q1);
    }
  }
  const rh = h * 0.27, rv = h * 0.2;
  const nrm = (p: THREE.Vector3): THREE.Vector3 => {
    const d = p.clone().sub(crown);
    d.y *= rh / Math.max(0.4, rv);
    return d.normalize().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.25, 0)).normalize();
  };
  const clump = (c: THREE.Vector3): void => {
    const size = 0.75 + rnd() * 0.45;
    const tone = 0.95 + rnd() * 0.3;
    const lift = Math.min(1, Math.max(0, (c.y - (crown.y - rv)) / (2 * rv)));
    const tint: RGB = [tone * (0.95 + lift * 0.12), tone * (1.02 + lift * 0.06), tone * 0.85];
    const ph = rnd() * TAU;
    for (let q = 0; q < 2; q++) {
      const yaw = rnd() * TAU, pitch = (rnd() - 0.5) * 1.2;
      const a = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(size / 2);
      const bb = new THREE.Vector3(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)).multiplyScalar(size / 2);
      if (q === 1) { bb.set(0, 0, 0).add(new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(size / 2)); bb.y = size * 0.12; }
      card(fol, c, a, bb, rnd() < 0.5 ? CELL.leafA : CELL.leafB, tint, nrm, 0.5, 0.9, ph);
    }
  };
  for (const tip of tips) clump(tip);
  const fill = Math.round(8 + h * 5);
  for (let k = 0; k < fill; k++) {
    const u = rnd() * TAU, v = Math.acos(1 - 2 * Math.pow(rnd(), 0.8)) * 0.9, rr = 0.5 + 0.5 * Math.sqrt(rnd());
    clump(new THREE.Vector3(crown.x + Math.cos(u) * Math.sin(v) * rh * rr, crown.y + Math.cos(v) * rv * rr, crown.z + Math.sin(u) * Math.sin(v) * rh * rr));
  }
}

/** Bromeliad rosette (crossed cards), the colour accent of the beds. */
function bromeliad(fol: Mesher, p: THREE.Vector3, size: number, rnd: () => number): void {
  const yaw = rnd() * TAU;
  const n = new THREE.Vector3(0, 1, 0);
  for (const off of [0, Math.PI / 2]) {
    const a = new THREE.Vector3(Math.cos(yaw + off), 0, Math.sin(yaw + off)).multiplyScalar(size / 2);
    card(fol, p.clone().add(new THREE.Vector3(0, size * 0.42, 0)), a, new THREE.Vector3(0, size / 2, 0), CELL.bromeliad, [1, 1, 1], () => n, 0.05, 0.25, rnd() * TAU);
  }
}

function addPlanting(soil: Mesher, bark: Mesher, fol: Mesher): void {
  const hw = PL.halfWidth;
  const rnd = mulberry32(8819);
  const FERN_CELLS: readonly Cell[] = [CELL.frondA, CELL.frondB];
  for (const bed of PL.beds) {
    const sa = bed.s0 + PL.wallT, sb = bed.s1 - PL.wallT, ta = -(hw - PL.wallT), tb = hw - PL.wallT;
    // soil grid
    const nx = Math.max(2, Math.round((sb - sa) / 0.25)), nz = 8;
    const start = soil.pos.length / 3;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const s = sa + ((sb - sa) * i) / nx, t = ta + ((tb - ta) * j) / nz;
        const m = Math.min(1, Math.max(0, 0.55 + 0.9 * (vnoise(s * 0.8, t * 1.2 + 9) - 0.5)));
        soil.vert(at3(s, t), s / 1.4, t / 1.4, mixc([0.07, 0.05, 0.035], [0.12, 0.24, 0.05], m));
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = start + j * (nx + 1) + i;
      // s x t points down, so wind the quad the other way to face up
      soil.quad(a, a + nx + 1, a + nx + 2, a + 1);
    }
    // boulders
    const nb = Math.round((sb - sa) / 2.6);
    for (let k = 0; k < nb; k++) {
      const s = sa + 0.5 + rnd() * (sb - sa - 1), t = (rnd() - 0.5) * 1.1;
      const r = 0.13 + rnd() * 0.16, squash = 0.6 + rnd() * 0.25, seed = Math.floor(rnd() * 1000);
      const ico = new THREE.IcosahedronGeometry(1, 2);
      const pp = ico.getAttribute('position');
      const st = soil.pos.length / 3;
      const c = at3(s, t);
      for (let i = 0; i < pp.count; i++) {
        const v = new THREE.Vector3(pp.getX(i), pp.getY(i), pp.getZ(i));
        const d = 1 + 0.2 * (vnoise(v.x * 2.1 + seed, v.z * 2.1 + v.y * 1.7) - 0.5) * 2;
        v.multiplyScalar(r * d);
        v.y *= squash;
        const top = Math.max(0, v.y / (r * squash));
        soil.vert(c.clone().add(v).add(new THREE.Vector3(0, -r * squash * 0.3, 0)), v.x, v.z, mixc([0.24, 0.235, 0.22], MOSS, Math.min(1, top * 1.3 + 0.15)));
      }
      const ix = ico.getIndex();
      if (ix) for (let i = 0; i < ix.count; i += 3) soil.tri(st + ix.getX(i), st + ix.getX(i + 1), st + ix.getX(i + 2));
      ico.dispose();
    }
  }
  // specimens
  for (const sp of PL.specimens) {
    if (sp.kind === 'tree') smallTree(bark, fol, sp.s, sp.t, sp.h, sp.seed);
    else treeFern(bark, fol, sp.s, sp.t, sp.h, sp.seed);
  }
  // fern carpet, spilling a little over the kerbs; a few bromeliads for colour
  for (const bed of PL.beds) {
    const sa = bed.s0 + PL.wallT + 0.25, sb = bed.s1 - PL.wallT - 0.25;
    const rows = [-0.62, -0.22, 0.2, 0.6];
    let bro = 0;
    for (let s = sa; s <= sb; s += 0.5) {
      for (const row of rows) {
        const fs = s + (rnd() - 0.5) * 0.4, ft = row + (rnd() - 0.5) * 0.22;
        if (rnd() < 0.14) continue;
        if (PL.specimens.some((p) => Math.hypot(p.s - fs, p.t - ft) < 0.4)) continue;
        // low ferns only near the ceiling-hung boards' footprint is moot (they are 0.9 m); keep all ferns small
        const size = (Math.abs(ft) > 0.55 ? 0.5 : 0.62) * (0.8 + rnd() * 0.5);
        const base = at3(fs, ft, -0.02);
        const ph = rnd() * TAU, tone = 0.82 + rnd() * 0.3;
        const nf = 7;
        for (let k = 0; k < nf; k++) {
          const az = (k / nf) * TAU + rnd() * 0.6;
          frond(fol, base, az, 0.95 + rnd() * 0.3, 0.05 - rnd() * 0.25, size * (0.8 + rnd() * 0.4), size * 0.42, 4,
            FERN_CELLS[rnd() < 0.5 ? 0 : 1]!, [tone * 0.95, tone, tone * 0.85], 0.3, ph + k * 0.7);
        }
        if (bro < 3 && rnd() < 0.05 && Math.abs(ft) < 0.7) { bromeliad(fol, base, 0.34 + rnd() * 0.14, rnd); bro++; }
      }
    }
  }
}

// ---- 4. the dappled-light art wall --------------------------------------------------------------------------------------------------

function buildArtGeometry(joints: readonly number[], y0: number, y1: number): THREE.BufferGeometry {
  const side = HALCYON_ART.artWall.side;
  const t = side * (W_HALL - 0.03);
  const g = SHELL.gap / 2;
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const inN: V3 = [-side * NT[0], 0, -side * NT[2]];
  for (let i = 0; i + 1 < joints.length; i++) {
    const a = joints[i]! + g, b = joints[i + 1]! - g;
    const base = pos.length / 3;
    for (const [s, y] of [[a, y0], [b, y0], [b, y1], [a, y1]] as const) {
      const p = wp(s, y, t);
      pos.push(p[0], p[1], p[2]); nor.push(inN[0], inN[1], inN[2]);
    }
    // winding: (b-a) x (c-a) must face inN; decide from the world positions
    const pa = [pos[base * 3]!, pos[base * 3 + 1]!, pos[base * 3 + 2]!], pb = [pos[base * 3 + 3]!, pos[base * 3 + 4]!, pos[base * 3 + 5]!], pc = [pos[base * 3 + 6]!, pos[base * 3 + 7]!, pos[base * 3 + 8]!];
    const e1 = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!], e2 = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
    const cx = e1[1]! * e2[2]! - e1[2]! * e2[1]!, cy = e1[2]! * e2[0]! - e1[0]! * e2[2]!, cz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
    if (cx * inN[0] + cy * inN[1] + cz * inN[2] >= 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

const ART_GLSL = /* glsl */ `
uniform float uArtTime;
uniform float uArtNight;
uniform float uArtGolden;
varying vec3 vArtWorld;
vec2 aH22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float aH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float aN(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(aH(i), aH(i + vec2(1.0, 0.0)), f.x), mix(aH(i + vec2(0.0, 1.0)), aH(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Squared distance to the nearest of a field of slowly wandering points: soft round gaps in a leaf canopy.
float aGaps(vec2 p, float scale, vec2 drift, float seed, float t, float ang, float wob) {
  float c = cos(ang), s = sin(ang);
  p = mat2(c, -s, s, c) * p;
  p *= scale; p.x *= 0.8;
  p += drift * t;
  p += 0.2 * vec2(sin(p.y * 1.3 + t * 0.045 + seed), cos(p.x * 1.1 + t * 0.037 + seed * 1.7));
  vec2 i = floor(p), f = fract(p);
  float d = 9.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = aH22(i + g + seed);
      vec2 w = 0.5 + wob * sin(t * (0.03 + 0.035 * o.yx) + 6.2831 * o);
      vec2 r = g + w - f;
      d = min(d, dot(r, r));
    }
  }
  return d;
}`;

const ART_BODY = (y0: number, y1: number, nightGain: number): string => /* glsl */ `
  {
    vec2 p = vec2(dot(vArtWorld.xz - vec2(${HALCYON.centre[0].toFixed(3)}, ${HALCYON.centre[1].toFixed(3)}), vec2(${UX.toFixed(5)}, ${UZ.toFixed(5)})), vArtWorld.y);
    float t = uArtTime;
    float wobble = aN(p * 2.3 + vec2(t * 0.02, 0.0)) - 0.5;
    // three canopy layers: broad gaps, mid gaps, small sparkles; each drifts and wanders at its own slow pace
    float g1 = 1.0 - smoothstep(0.008 + 0.03 * wobble, 0.135, aGaps(p, 0.30, vec2(0.0042, -0.0016), 1.0, t, 0.5, 0.36));
    float g2 = 1.0 - smoothstep(0.008, 0.105, aGaps(p, 0.62, vec2(-0.0030, 0.0021), 7.0, t, -0.4, 0.34));
    float g3 = 1.0 - smoothstep(0.003, 0.055, aGaps(p, 1.45, vec2(0.0034, 0.0026), 13.0, t, 1.1, 0.30));
    float breeze = 0.84 + 0.16 * sin(t * 0.09 + p.x * 0.07);
    float spark = 0.65 + 0.35 * sin(t * 0.21 + aH(floor(p * 1.45)) * 40.0);
    float light = clamp(g1 * 0.95 + g2 * 0.7 * (0.75 + 0.25 * sin(t * 0.063 + p.x * 0.11)) + g3 * 0.42 * spark, 0.0, 1.0);
    light = light * light * (3.0 - 2.0 * light);
    light *= breeze;
    float vg = mix(0.7, 1.0, smoothstep(${y0.toFixed(3)}, ${y1.toFixed(3)}, p.y));
    float mott = 0.86 + 0.28 * (aN(p * vec2(0.9, 1.8)) * 0.6 + aN(p * vec2(3.1, 5.3) + 4.0) * 0.4);
    vec3 shade = vec3(0.085, 0.058, 0.034);
    vec3 sun = vec3(1.0, 0.80, 0.52) * 0.95;
    vec3 day = mix(shade, sun, light) * mott * vg;
    day = mix(day, day * vec3(1.12, 0.84, 0.56), uArtGolden * 0.8);
    vec3 moon = mix(vec3(0.012, 0.017, 0.03), vec3(0.56, 0.70, 1.0) * ${(1.45 * nightGain).toFixed(3)}, light) * mott * vg;
    totalEmissiveRadiance += mix(day, moon, uArtNight);
  }`;

function patchArt(mat: THREE.MeshStandardMaterial, y0: number, y1: number): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uArtTime = U.time;
    sh.uniforms.uArtNight = U.night;
    sh.uniforms.uArtGolden = U.golden;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vArtWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vArtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${ART_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${ART_BODY(y0, y1, HALCYON_ART.artWall.nightGain)}`);
  };
  mat.customProgramCacheKey = () => 'halcyonLightArt';
}

// ---- materials -----------------------------------------------------------------------------------------------------------------------

const GL_STUB = { capabilities: { getMaxAnisotropy: () => 8 } } as unknown as THREE.WebGLRenderer;

function patchOak(mat: THREE.MeshStandardMaterial): void {
  vertexGlow(mat);
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLift;\nvarying float vLift;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLift = aLift;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLift;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.8, 0.52) * vLift;');
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|halcyonOakLift`;
}

const NOISE_GLSL = `
varying vec3 vHalWorld;
float hH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hN(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hH(i), hH(i + vec2(1.0, 0.0)), f.x), mix(hH(i + vec2(0.0, 1.0)), hH(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

function patchSoil(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHalWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vHalWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 hp = vHalWorld;
    float g = 0.62 + 0.5 * hN(hp.xz * 11.0 + hp.y * 7.0) * 0.55 + 0.5 * hN(hp.xz * 29.0 + hp.y * 13.0) * 0.45;
    diffuseColor.rgb *= g;
  }`);
  };
  mat.customProgramCacheKey = () => 'halcyonSoil';
}

function patchFoliage(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHalTime = U.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uHalTime;\nattribute vec2 aWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    float wt = aWind.x, ph = aWind.y;
    float gust = 0.6 + 0.4 * sin(uHalTime * 0.21 + position.x * 0.05);
    transformed.x += (sin(uHalTime * 0.8 + ph) * 0.65 + sin(uHalTime * 2.1 + ph * 1.7) * 0.25) * 0.045 * wt * gust;
    transformed.z += (cos(uHalTime * 0.65 + ph * 1.3) * 0.6 + sin(uHalTime * 1.7 + ph) * 0.2) * 0.045 * wt * gust;
    transformed.y += sin(uHalTime * 1.2 + ph * 2.1) * 0.016 * wt;
  }`);
    // authored normals for both faces (never flipped on back faces); a faint translucency keeps undersides alive
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vec3(0.05, 0.065, 0.03);');
  };
  mat.customProgramCacheKey = () => 'halcyonFoliage';
}

// ---- assemble ----------------------------------------------------------------------------------------------------------------------------

export function buildHalcyonArt(opts: HalcyonArtOpts): HalcyonArtBuild {
  const renderer = opts.renderer ?? GL_STUB;
  const group = new THREE.Group();
  group.name = 'metroHalcyonArt';

  const oak = new OakBuf();
  addCeiling(oak, opts);
  addBeds(oak);
  const soil = new Mesher(), bark = new Mesher(), fol = new Mesher();
  addPlanting(soil, bark, fol);

  const oakMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepHalcyonOak', map: makeOakTexture(renderer), vertexColors: true, color: 0xffffff, roughness: 0.6, metalness: 0, envMapIntensity: 0.7,
  });
  patchOak(oakMat);
  const soilMat = new THREE.MeshStandardMaterial({ name: 'metroDeepHalcyonSoil', vertexColors: true, roughness: 0.95, metalness: 0 });
  patchSoil(soilMat);
  const folMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepHalcyonFoliage', map: sharedFoliageAtlas(renderer), vertexColors: true, roughness: 0.62, metalness: 0, alphaTest: 0.42, side: THREE.DoubleSide,
  });
  patchFoliage(folMat);
  const artMat = new THREE.MeshStandardMaterial({ name: 'metroDeepHalcyonLightArt', color: 0x2a2018, roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
  patchArt(artMat, opts.art.y0, opts.art.y1);

  // the soil mesh carries the bark tubes too (same matte vertex-coloured material): append the bark vertices
  const offset = soil.pos.length / 3;
  soil.pos.push(...bark.pos); soil.uv.push(...bark.uv); soil.col.push(...bark.col); soil.wind.push(...bark.wind);
  for (const i of bark.idx) soil.idx.push(i + offset);

  const meshes: THREE.Mesh[] = [
    new THREE.Mesh(oak.build(), oakMat),
    new THREE.Mesh(soil.build(false, false), soilMat),
    new THREE.Mesh(fol.build(true, true), folMat),
    new THREE.Mesh(buildArtGeometry(opts.art.joints, opts.art.y0, opts.art.y1), artMat),
  ];
  const names = ['halcyonOak', 'halcyonPlanterSoil', 'halcyonPlanterFoliage', 'halcyonLightArt'];
  meshes.forEach((m, i) => { m.name = names[i]!; group.add(m); });
  meshes[2]!.onBeforeRender = syncUniforms;
  meshes[3]!.onBeforeRender = syncUniforms;
  meshes[3]!.userData.noShadow = true;

  return { group, deepMaterials: [oakMat, soilMat, folMat, artMat], calls: meshes.length };
}
