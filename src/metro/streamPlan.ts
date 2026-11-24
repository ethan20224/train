/**
 * Stream and koi pond plan (pure, deterministic, no three.js: Node tests, the forest planner and the height field import it).
 * Data lives in layoutMetro.ts (STREAM). This module derives the centre-line samples (arc length, half width, water level, flow
 * speed), the signed distance to the water edge (stream + pond, smooth union), the terrain carve applied by forestGroundY, the
 * stones and pebbles, the stepping stones, the lily layout and the koi swim paths. Geometry: src/world/metro/stream.ts.
 */
import { STREAM } from '../layoutMetro';

const P = STREAM;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function mulberry32(seed: number): () => number {
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
function vn(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---- centre line ---------------------------------------------------------------------------------------------------------

/** Spacing of the centre-line samples (m). */
export const LINE_STEP = 0.25;

interface Line {
  readonly n: number;
  readonly x: Float64Array; readonly z: Float64Array; readonly hw: Float64Array; readonly s: Float64Array;
  readonly tx: Float64Array; readonly tz: Float64Array; readonly level: Float64Array; readonly speed: Float64Array;
  readonly total: number;
  readonly riffleS: readonly number[];
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildLine(): Line {
  const cps = P.path.map((c) => [c[0], c[1], c[2]] as [number, number, number]);
  const first = cps[0]!, second = cps[1]!, last = cps[cps.length - 1]!, prev = cps[cps.length - 2]!;
  const ext = [
    [2 * first[0] - second[0], 2 * first[1] - second[1], first[2]] as [number, number, number],
    ...cps,
    [2 * last[0] - prev[0], 2 * last[1] - prev[1], last[2]] as [number, number, number],
  ];
  // dense spline
  const dx: number[] = [], dz: number[] = [], dh: number[] = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const a = ext[i - 1]!, b = ext[i]!, c = ext[i + 1]!, d = ext[i + 2]!;
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      dx.push(catmull(a[0], b[0], c[0], d[0], t));
      dz.push(catmull(a[1], b[1], c[1], d[1], t));
      dh.push(catmull(a[2], b[2], c[2], d[2], t));
    }
  }
  dx.push(last[0]); dz.push(last[1]); dh.push(last[2]);
  // resample at LINE_STEP by arc length
  const xs: number[] = [dx[0]!], zs: number[] = [dz[0]!], hs: number[] = [dh[0]!];
  let carry = 0;
  for (let i = 1; i < dx.length; i++) {
    const ax = dx[i - 1]!, az = dz[i - 1]!, bx = dx[i]!, bz = dz[i]!;
    const len = Math.hypot(bx - ax, bz - az);
    let pos = LINE_STEP - carry;
    while (pos <= len + 1e-9) {
      const t = len > 0 ? pos / len : 0;
      xs.push(mix(ax, bx, t)); zs.push(mix(az, bz, t)); hs.push(mix(dh[i - 1]!, dh[i]!, t));
      pos += LINE_STEP;
    }
    carry = len - (pos - LINE_STEP);
  }
  xs.push(last[0]); zs.push(last[1]); hs.push(last[2]);
  const n = xs.length;
  const x = Float64Array.from(xs), z = Float64Array.from(zs), hw = Float64Array.from(hs);
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1]! + Math.hypot(x[i]! - x[i - 1]!, z[i]! - z[i - 1]!);
  const total = s[n - 1]!;
  const tx = new Float64Array(n), tz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const ex = x[b]! - x[a]!, ez = z[b]! - z[a]!, l = Math.hypot(ex, ez) || 1;
    tx[i] = ex / l; tz[i] = ez / l;
  }
  // riffle sites: nearest sample to each approximate point
  const riffleS = P.riffles.map(([rx, rz]) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (x[i]! - rx) ** 2 + (z[i]! - rz) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    return s[bi]!;
  });
  const level = new Float64Array(n), speed = new Float64Array(n);
  const baseDrop = P.level.start - P.level.pond - riffleS.length * P.level.riffleDrop;
  for (let i = 0; i < n; i++) {
    const si = s[i]!;
    let l = P.level.start - baseDrop * clamp01(si / (total - 5));
    let boost = 0;
    for (const sr of riffleS) {
      l -= P.level.riffleDrop * smooth(sr - 0.5, sr + 0.5, si);
      boost += Math.exp(-(((si - sr) / 0.9) ** 2));
    }
    level[i] = l;
    const base = Math.min(0.55, Math.max(0.15, (0.34 * 1.15) / hw[i]!));
    speed[i] = base * (1 + 0.9 * Math.min(1, boost)) * (1 - 0.92 * smooth(total - 6, total - 1.5, si));
  }
  return { n, x, z, hw, s, tx, tz, level, speed, total, riffleS };
}

let _line: Line | null = null;
const line = (): Line => (_line ??= buildLine());

/** Total arc length of the centre line (m). */
export function streamLength(): number { return line().total; }
/** Centre-line samples for the geometry builders (read-only views). */
export function streamSamples(): { n: number; x: Float64Array; z: Float64Array; hw: Float64Array; s: Float64Array; tx: Float64Array; tz: Float64Array; level: Float64Array; speed: Float64Array; riffleS: readonly number[] } {
  return line();
}

// ---- pond ----------------------------------------------------------------------------------------------------------------

const POND = P.pond;
const CR = Math.cos(POND.rot), SR = Math.sin(POND.rot);
/** Pond-local (u, v) of a world point and the reverse. */
export function pondLocal(x: number, z: number): [number, number] {
  const dx = x - POND.cx, dz = z - POND.cz;
  return [dx * CR + dz * SR, -dx * SR + dz * CR];
}
export function pondWorld(u: number, v: number): [number, number] {
  return [POND.cx + u * CR - v * SR, POND.cz + u * SR + v * CR];
}
/** Pond edge radius at local angle th. */
export function pondEdge(th: number): number {
  const ce = Math.cos(th), se = Math.sin(th);
  const re = (POND.a * POND.b) / Math.sqrt((POND.b * ce) ** 2 + (POND.a * se) ** 2);
  let lobe = 1;
  for (const [amp, k, ph] of POND.lobes) lobe += amp * Math.cos(k * th + ph);
  return re * lobe;
}
function pondSd(x: number, z: number): number {
  const [u, v] = pondLocal(x, z);
  const rho = Math.hypot(u, v);
  return rho - pondEdge(Math.atan2(v, u));
}

// ---- water field ---------------------------------------------------------------------------------------------------------

export interface WaterField {
  /** Signed distance to the water edge (< 0 inside), smooth union of stream and pond. */
  sd: number; sdStream: number; sdPond: number;
  /** 0 in the channel, 1 in the pond. */
  pondW: number;
  /** Arc length of the nearest centre-line point, its half width, water level, flow speed and unit tangent. */
  s: number; hw: number; level: number; speed: number; tx: number; tz: number;
}
export const newWaterField = (): WaterField => ({ sd: 99, sdStream: 99, sdPond: 99, pondW: 0, s: 0, hw: 1, level: P.level.pond, speed: 0, tx: 1, tz: 0 });

/** Bounding box in which the water field is evaluated at all (the carve reaches bankRamp + liftFade past the edge). */
const REACH = P.bankRamp + P.liftFade;
let _bb: { x0: number; x1: number; z0: number; z1: number } | null = null;
function bbox(): { x0: number; x1: number; z0: number; z1: number } {
  if (_bb) return _bb;
  const l = line();
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, hmax = 0;
  for (let i = 0; i < l.n; i++) {
    x0 = Math.min(x0, l.x[i]!); x1 = Math.max(x1, l.x[i]!); z0 = Math.min(z0, l.z[i]!); z1 = Math.max(z1, l.z[i]!);
    hmax = Math.max(hmax, l.hw[i]!);
  }
  const pr = Math.max(POND.a, POND.b) * 1.15;
  x0 = Math.min(x0 - hmax, POND.cx - pr); x1 = Math.max(x1 + hmax, POND.cx + pr);
  z0 = Math.min(z0 - hmax, POND.cz - pr); z1 = Math.max(z1 + hmax, POND.cz + pr);
  return (_bb = { x0: x0 - REACH, x1: x1 + REACH, z0: z0 - REACH, z1: z1 + REACH });
}
/** Axis-aligned region covered by the water (edge only, without the bank reach): for the water mesh and flow map. */
export function waterRegion(): { x0: number; x1: number; z0: number; z1: number } {
  const b = bbox();
  return { x0: b.x0 + REACH, x1: b.x1 - REACH, z0: b.z0 + REACH, z1: b.z1 - REACH };
}

const COARSE = 8;
const smin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** Fills `o` with the water field at (x, z). Outside the bounding box everything is far (sd = 99). */
export function waterField(x: number, z: number, o: WaterField): WaterField {
  const b = bbox();
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) { o.sd = o.sdStream = o.sdPond = 99; o.pondW = 0; return o; }
  const l = line();
  const n = l.n;
  let best = Infinity, bi = 0;
  for (let i = 0; i < n; i += COARSE) {
    const d = (l.x[i]! - x) ** 2 + (l.z[i]! - z) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  { const d = (l.x[n - 1]! - x) ** 2 + (l.z[n - 1]! - z) ** 2; if (d < best) { best = d; bi = n - 1; } }
  const lo = Math.max(0, bi - COARSE - 1), hi = Math.min(n - 2, bi + COARSE);
  let bd = Infinity, bs = 0, bhw = 1, blevel: number = P.level.pond, bspeed = 0, btx = 1, btz = 0;
  for (let i = lo; i <= hi; i++) {
    const ax = l.x[i]!, az = l.z[i]!, ex = l.x[i + 1]! - ax, ez = l.z[i + 1]! - az;
    const el2 = ex * ex + ez * ez;
    const t = el2 > 0 ? clamp01(((x - ax) * ex + (z - az) * ez) / el2) : 0;
    const d = Math.hypot(x - (ax + ex * t), z - (az + ez * t));
    if (d < bd) {
      bd = d;
      bs = mix(l.s[i]!, l.s[i + 1]!, t);
      bhw = mix(l.hw[i]!, l.hw[i + 1]!, t);
      blevel = mix(l.level[i]!, l.level[i + 1]!, t);
      bspeed = mix(l.speed[i]!, l.speed[i + 1]!, t);
      btx = mix(l.tx[i]!, l.tx[i + 1]!, t); btz = mix(l.tz[i]!, l.tz[i + 1]!, t);
    }
  }
  const tl = Math.hypot(btx, btz) || 1;
  o.sdStream = bd - bhw;
  o.sdPond = pondSd(x, z);
  o.sd = smin(o.sdStream, o.sdPond, 0.7);
  o.pondW = smooth(-0.5, 1.0, o.sdStream - o.sdPond);
  o.s = bs; o.hw = bhw; o.level = blevel; o.speed = bspeed; o.tx = btx / tl; o.tz = btz / tl;
  return o;
}

const _f = newWaterField();
/** Signed distance to the water edge (negative inside); 99 far from the water. Not re-entrant (shared scratch). */
export function waterSd(x: number, z: number): number {
  return waterField(x, z, _f).sd;
}

/**
 * Terrain height with the channel and basin carved into base height g0. Inside the water the bed is a shallow bowl (never below
 * STREAM.bedMinY, which keeps it clear of the base floor slab); outside, banks rise from the waterline to a crest above the water
 * and the surrounding ground is lifted (fading over liftFade) wherever it would otherwise sit below the crest.
 */
export function carveGround(x: number, z: number, g0: number): number {
  const F = waterField(x, z, _f);
  const sd = F.sd;
  if (sd > REACH) return g0;
  const level = F.level;
  if (sd < 0) {
    const wd = mix(F.hw, 2.2, F.pondW);
    const f = clamp01(-sd / wd);
    const depth = Math.min(P.maxDepth, level - P.bedMinY);
    const bed = level - depth * (1 - Math.pow(1 - f, 1.7));
    const lump = 0.012 * (vn(x * 3.1, z * 3.1) - 0.5) * 2 * f;
    return Math.max(P.bedMinY, bed + lump);
  }
  const rim = mix(P.inletRimH, P.rimH, smooth(0, P.inletRimLen, F.s) * (1 - F.pondW) + F.pondW);
  const g1 = Math.max(g0, level + rim);
  const lifted = g0 + (g1 - g0) * (1 - smooth(P.bankRamp, REACH, sd));
  const u = smooth(0, P.bankRamp, sd);
  const lump = 0.03 * (vn(x * 2.3 + 5, z * 2.3) - 0.5) * smooth(0, 0.6, sd);
  return level + (lifted - level) * u + lump * u;
}

// ---- stones --------------------------------------------------------------------------------------------------------------

export interface StoneInst {
  readonly x: number; readonly y: number; readonly z: number;
  readonly sx: number; readonly sy: number; readonly sz: number;
  readonly yaw: number; readonly tilt: number; readonly tiltAz: number;
  readonly tint: readonly [number, number, number];
  /** Water level at the stone (wet band height) and kind for the builder. */
  readonly level: number;
  readonly kind: 'bank' | 'bed' | 'riffle' | 'pebble' | 'rim' | 'step';
}
/** A stone that touches the water: foam source for the flow map. */
export interface WetStone { readonly x: number; readonly z: number; readonly r: number; readonly strong: boolean }
export interface StonePlan {
  readonly stones: readonly StoneInst[];
  readonly wet: readonly WetStone[];
  /** Stepping stone centres and half-sizes (world), for the koi keep-out test and the lily layout. */
  readonly steps: ReadonlyArray<{ readonly x: number; readonly z: number; readonly r: number }>;
}

const TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [0.20, 0.21, 0.20], [0.26, 0.25, 0.23], [0.15, 0.16, 0.16], [0.30, 0.28, 0.24], [0.18, 0.2, 0.17], [0.34, 0.33, 0.3], [0.12, 0.13, 0.13],
];

/** Stone and pebble layout; `groundY` is the carved height field (forestGroundY). Deterministic. */
export function planStones(groundY: (x: number, z: number) => number): StonePlan {
  const rnd = mulberry32(P.seed);
  const l = line();
  const stones: StoneInst[] = [];
  const wet: WetStone[] = [];
  const steps: Array<{ x: number; z: number; r: number }> = [];
  const F = newWaterField();
  const pick = (): readonly [number, number, number] => {
    const t = TINTS[Math.floor(rnd() * TINTS.length)]!;
    const k = 0.85 + rnd() * 0.3;
    return [t[0] * k, t[1] * k, t[2] * k];
  };
  const add = (x: number, z: number, r: number, topAbove: number | null, kind: StoneInst['kind'], flat = 0): void => {
    waterField(x, z, F);
    const sy = r * (0.45 + rnd() * 0.35) * (1 - flat * 0.5);
    const sx = r * (0.85 + rnd() * 0.45), sz = r * (0.85 + rnd() * 0.45);
    let y: number;
    if (topAbove !== null) y = F.level + topAbove - sy;
    else y = Math.max(groundY(x, z), F.level - 0.03) + sy * 0.3 - 0.01;
    const inWater = F.sd < sx * 0.5;
    if (inWater && y + sy > F.level - 0.002) wet.push({ x, z, r: Math.max(sx, sz), strong: kind === 'riffle' || kind === 'step' || F.pondW < 0.5 });
    stones.push({ x, y, z, sx, sy, sz, yaw: rnd() * Math.PI * 2, tilt: (rnd() - 0.5) * 0.5, tiltAz: rnd() * Math.PI * 2, tint: pick(), level: F.level, kind });
  };
  const skipEnd = 3.0;

  // A. bank stones on both sides, mostly small, a few big ones
  for (let s = 0.6; s < l.total - skipEnd; s += 0.3 + rnd() * 0.55) {
    const i = Math.min(l.n - 1, Math.round(s / LINE_STEP));
    for (const side of [-1, 1]) {
      if (rnd() < 0.3) continue;
      const off = l.hw[i]! + (rnd() - 0.55) * 0.7;
      const x = l.x[i]! - l.tz[i]! * side * off, z = l.z[i]! + l.tx[i]! * side * off;
      const r = 0.07 + Math.pow(rnd(), 2.4) * 0.26;
      add(x, z, r, null, 'bank');
    }
  }
  // B. awash stones scattered in the channel (tops just break the surface)
  for (let s = 1.0; s < l.total - skipEnd; s += 0.9 + rnd() * 1.6) {
    const i = Math.min(l.n - 1, Math.round(s / LINE_STEP));
    const off = (rnd() - 0.5) * 2 * l.hw[i]! * 0.7;
    add(l.x[i]! - l.tz[i]! * off, l.z[i]! + l.tx[i]! * off, 0.05 + rnd() * 0.08, 0.004 + rnd() * 0.05, 'bed');
  }
  // C. riffle clusters across the channel
  for (const sr of l.riffleS) {
    const i = Math.min(l.n - 1, Math.round(sr / LINE_STEP));
    const cnt = 8;
    for (let k = 0; k < cnt; k++) {
      const off = ((k + 0.5) / cnt - 0.5) * 2 * l.hw[i]! * 0.9 + (rnd() - 0.5) * 0.15;
      const along = (rnd() - 0.5) * 0.9;
      const j = Math.min(l.n - 1, Math.max(0, i + Math.round(along / LINE_STEP)));
      add(l.x[j]! - l.tz[j]! * off, l.z[j]! + l.tx[j]! * off, 0.08 + rnd() * 0.11, 0.02 + rnd() * 0.1, 'riffle');
    }
  }
  // D. pebbles along both shorelines and awash in the shallows
  for (let s = 0.3; s < l.total - skipEnd; s += 0.12 + rnd() * 0.25) {
    const i = Math.min(l.n - 1, Math.round(s / LINE_STEP));
    const side = rnd() < 0.5 ? -1 : 1;
    const off = l.hw[i]! + (rnd() - 0.65) * 0.9;
    const x = l.x[i]! - l.tz[i]! * side * off, z = l.z[i]! + l.tx[i]! * side * off;
    const r = 0.022 + rnd() * 0.04;
    waterField(x, z, F);
    add(x, z, r, F.sd < 0 ? 0.004 + rnd() * 0.02 : null, 'pebble');
  }
  // E. pond rim stones (gap where the stream enters)
  const edge = (th: number): [number, number] => {
    const R = pondEdge(th);
    return pondWorld(Math.cos(th) * R, Math.sin(th) * R);
  };
  for (let th = rnd() * 0.3; th < Math.PI * 2; th += 0.09 + rnd() * 0.12) {
    const R = pondEdge(th);
    const off = (rnd() - 0.5) * 0.4;
    const [x, z] = pondWorld(Math.cos(th) * (R + off), Math.sin(th) * (R + off));
    waterField(x, z, F);
    if (F.sdStream < 0.1) continue; // keep the stream mouth open
    if (rnd() < 0.18) continue;
    const r = 0.14 + Math.pow(rnd(), 1.6) * 0.3;
    add(x, z, r, F.sd < -0.15 ? 0.02 + rnd() * 0.08 : null, 'rim');
  }
  // F. stepping stones across the pond (flat tops, 10-14 cm above the water)
  const st = P.steps;
  for (let k = 0; k < st.count; k++) {
    const v = -st.span + ((k + 0.5) * 2 * st.span) / st.count + (rnd() - 0.5) * 0.18;
    const u = st.u + (rnd() - 0.5) * 0.35 + 0.18 * Math.sin(v * 0.9);
    const [x, z] = pondWorld(u, v);
    const r = 0.22 + rnd() * 0.1;
    add(x, z, r, 0.1 + rnd() * 0.04, 'step', 1);
    const last = stones[stones.length - 1]!;
    steps.push({ x, z, r: Math.max(last.sx, last.sz) });
  }
  void edge;
  return { stones, wet, steps };
}

// ---- koi ------------------------------------------------------------------------------------------------------------------

export interface KoiSpec { readonly length: number; readonly kind: number; readonly seed: number }
export const KOI: readonly KoiSpec[] = P.koi.map((k, i) => ({ length: k[8], kind: k[9], seed: hash2(i + 7, 31) }));
export interface KoiPose { x: number; z: number; hx: number; hz: number; speed: number }
export const newKoiPose = (): KoiPose => ({ x: 0, z: 0, hx: 1, hz: 0, speed: 0 });

/** Pose of fish i at real time t (s): a Lissajous path in the pond's local frame. */
export function koiPose(i: number, t: number, o: KoiPose): KoiPose {
  const k = P.koi[i]!;
  const a1 = k[4] * t + k[6], a2 = k[5] * t + k[7];
  const u = k[0] + k[2] * Math.sin(a1), v = k[1] + k[3] * Math.sin(a2);
  const du = k[2] * k[4] * Math.cos(a1), dv = k[3] * k[5] * Math.cos(a2);
  const [x, z] = pondWorld(u, v);
  const vx = du * CR - dv * SR, vz = du * SR + dv * CR;
  const sp = Math.hypot(vx, vz);
  o.x = x; o.z = z; o.speed = sp;
  const l = sp > 1e-4 ? sp : 1;
  o.hx = sp > 1e-4 ? vx / l : 1; o.hz = sp > 1e-4 ? vz / l : 0;
  return o;
}

// ---- lilies ----------------------------------------------------------------------------------------------------------------

export interface LilyInst { readonly x: number; readonly z: number; readonly r: number; readonly yaw: number; readonly flower: boolean }
/** Pads cluster in the pond's quiet corners (away from the stream mouth and the stepping stones). Deterministic. */
export function planLilies(steps: StonePlan['steps']): LilyInst[] {
  const rnd = mulberry32(P.seed + 11);
  const F = newWaterField();
  const out: LilyInst[] = [];
  const centres: Array<[number, number]> = [];
  // cluster centres at fixed rim angles, pulled inside the pond
  for (const th of [0.5, 2.2, 3.7, 5.3]) {
    const R = pondEdge(th) * 0.62;
    centres.push(pondWorld(Math.cos(th) * R, Math.sin(th) * R));
  }
  const ok = (x: number, z: number, r: number): boolean => {
    waterField(x, z, F);
    if (F.sdPond > -(r + 0.35) || F.sdStream < 0.4) return false;
    for (const s of steps) if (Math.hypot(x - s.x, z - s.z) < s.r + r + 0.12) return false;
    for (const o of out) if (Math.hypot(x - o.x, z - o.z) < o.r + r + 0.03) return false;
    return true;
  };
  let guard = 0;
  while (out.length < P.lilies.pads + P.lilies.flowers && guard++ < 4000) {
    const c = centres[Math.floor(rnd() * centres.length)]!;
    const ang = rnd() * Math.PI * 2, rad = Math.pow(rnd(), 0.7) * 1.7;
    const x = c[0] + Math.cos(ang) * rad, z = c[1] + Math.sin(ang) * rad;
    const flower = out.length >= P.lilies.pads;
    const r = flower ? 0.1 : P.lilies.radius[0] + rnd() * (P.lilies.radius[1] - P.lilies.radius[0]);
    if (ok(x, z, r)) out.push({ x, z, r, yaw: rnd() * Math.PI * 2, flower });
  }
  return out;
}
