import { rng, smoothstep } from '../concourse/geo';

/**
 * Sedimentary strata for the void's middle era (spec §2.2). A height field over (azimuth, y): the wall is cut in beds
 * 0.3-1.2 m thick that dip and undulate gently around the shaft; hard beds stand proud with an undercut base and a
 * weathered top shelf, soft beds are eroded back, beds pinch and swell sideways, hard beds are cut by steep joints.
 * "Machined" bands (the light-ring channels, the era joints and the landing bearings) are flat: the rock is saw-cut there.
 * Pure function of its options: no randomness at sample time.
 */

const TAU = Math.PI * 2;
const sm = (t: number): number => t * t * (3 - 2 * t);

function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Value noise, periodic in x with integer period `px`, smooth in y. */
function vn(x: number, y: number, px: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = sm(x - xi), fy = sm(y - yi);
  const w = (v: number): number => ((v % px) + px) % px;
  const a = hash(w(xi), yi, s), b = hash(w(xi + 1), yi, s), c = hash(w(xi), yi + 1, s), d = hash(w(xi + 1), yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export interface StrataPocket {
  /** Azimuth interval (radians, atan2(z - cz, x - cx)) the landing occupies at the wall, and its deck y. */
  phi0: number; phi1: number; y: number;
}
export interface StrataOptions {
  /** Wall radius of the cylinder the rock is cut into. */
  R0: number;
  seed: number;
  /** y of every machined (flat) band. */
  cutYs: readonly number[];
  cutHalf: number; cutBlend: number;
  pockets: readonly StrataPocket[];
  maxProtrude: number;
}
export interface RockSample {
  /** Protrusion into the void from radius R0 (metres, negative = eroded back). */
  p: number;
  /** Vertex colour multiplier (albedo variation, crevice darkening). */
  col: [number, number, number];
}

interface Bed { hard: boolean; P: number; col: readonly [number, number, number]; kLat: number; kWob: number; kCrack: number; jointM: number; seed: number }

export function createStrata(o: StrataOptions): (theta: number, y: number) => RockSample {
  const rnd = rng(o.seed);
  // hard beds: pale sandstone, ochre, grey-white limestone, rust; soft beds: dark shales and mudstone
  const HARD: ReadonlyArray<readonly [number, number, number]> = [[1.0, 0.93, 0.8], [0.95, 0.94, 0.9], [0.9, 0.76, 0.58], [0.82, 0.58, 0.45], [0.78, 0.8, 0.8], [0.96, 0.9, 0.82]];
  const SOFT: ReadonlyArray<readonly [number, number, number]> = [[0.3, 0.31, 0.34], [0.22, 0.23, 0.26], [0.42, 0.38, 0.35], [0.28, 0.33, 0.32]];
  const beds: Bed[] = [];
  const lower: number[] = []; // lower boundary s of each bed
  let s = -4;
  let prevHard = false;
  let i = 0;
  while (s > -34) {
    const zone = 1 + 0.45 * Math.sin(s * 0.62 + 1.1); // laminated packets alternate with massive beds
    const thick = Math.min(1.2, Math.max(0.3, (0.3 + 0.9 * Math.pow(rnd(), 1.8)) * zone));
    const hard: boolean = prevHard ? rnd() < 0.28 : rnd() < 0.64;
    const pal = hard ? HARD : SOFT;
    const base = pal[Math.floor(rnd() * pal.length)]!;
    const jit = 0.9 + 0.2 * rnd();
    const dark = rnd() < 0.07; // a coal-black seam
    beds.push({
      hard,
      P: hard ? 0.22 + 0.42 * rnd() : -(0.1 + 0.3 * rnd()),
      col: dark ? [0.2, 0.2, 0.21] : [base[0] * jit, base[1] * jit, base[2] * jit],
      kLat: 6 + Math.floor(rnd() * 9),
      kWob: 5 + (i % 7),
      kCrack: Math.round(TAU * o.R0 / (hard ? 1.6 + 2.6 * rnd() : 4 + 4 * rnd())),
      jointM: hard ? 1 : 0.28,
      seed: Math.floor(rnd() * 100000),
    });
    s -= thick;
    lower.push(s);
    prevHard = hard;
    i++;
  }
  const n = beds.length;
  const wobble = (idx: number, th: number): number => {
    const b = beds[idx]!;
    return 0.11 * (vn((th / TAU) * b.kWob, idx * 0.37, b.kWob, b.seed) - 0.5) * 2;
  };
  const kFine = Math.round(TAU * o.R0 / 0.7);
  const kStreak = 90;
  const kDip = 6;

  return (theta: number, y: number): RockSample => {
    const th = ((theta % TAU) + TAU) % TAU;
    // machined mask: flat, saw-cut
    let m = 1;
    for (const cy of o.cutYs) m *= smoothstep(o.cutHalf, o.cutHalf + o.cutBlend, Math.abs(y - cy));
    for (const pk of o.pockets) {
      let dphi = 0;
      const t = ((theta - pk.phi0) % TAU + TAU) % TAU;
      const span = (pk.phi1 - pk.phi0 + TAU) % TAU;
      if (t > span) dphi = Math.min(t - span, TAU - t);
      const w = 1 - smoothstep(0, 0.14, dphi);
      m *= 1 - w * (1 - smoothstep(0.45, 1.0, Math.abs(y - pk.y)));
    }
    // gentle dip: the beds are not level
    const dip = 0.85 * Math.sin(th + 0.6) + 0.38 * Math.sin(2 * th + 2.1) + 0.4 * (vn((th / TAU) * kDip, 0.3, kDip, 91) - 0.5);
    const sw = y + dip;
    // find the bed: boundaries are monotone because the wobble (<= 0.11) is below a third of the thinnest bed
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sw > lower[mid]! + wobble(mid, th)) hi = mid; else lo = mid + 1;
    }
    const bed = beds[lo]!;
    const bot = lower[lo]! + wobble(lo, th);
    const top = lo > 0 ? lower[lo - 1]! + wobble(lo - 1, th) : -4;
    const uB = Math.min(1, Math.max(0, (sw - bot) / Math.max(1e-3, top - bot))); // 0 at the bottom of the bed, 1 at its top
    const lat = 0.55 + 0.95 * vn((th / TAU) * bed.kLat, lo * 0.7, bed.kLat, bed.seed + 5);
    let p: number;
    if (bed.hard) {
      // cliff-forming bed: sharp undercut at the base, near-vertical face, crisp top edge
      const w = 0.1 / Math.max(0.2, top - bot); // edges are ~10 cm wide: wider than a grid row, so they never alias into stairs
      p = bed.P * lat * smoothstep(0, w, uB) * (1 - 0.22 * smoothstep(1 - w, 1.0, uB));
    } else {
      // soft bed: eroded back, most under the bed above it (a talus slope)
      p = bed.P * lat * (0.3 + 0.7 * smoothstep(0.05, 0.95, uB));
    }
    // steep joints, slightly inclined
    const cx = (th / TAU) * bed.kCrack + (0.25 * sw * bed.kCrack) / (TAU * o.R0);
    const ridge = Math.pow(1 - Math.abs(2 * vn(cx, lo * 0.3, bed.kCrack, bed.seed + 9) - 1), 9);
    p -= 0.24 * bed.jointM * ridge;
    // fine roughness
    p += 0.03 * (vn((th / TAU) * kFine, sw * 2.2, kFine, bed.seed + 3) - 0.5) * 2;
    p = Math.max(-0.5, Math.min(o.maxProtrude, p));
    const pe = p * m;
    // albedo: bed colour, stained streaks, darker in crevices and under overhangs
    const streak = 1 - 0.2 * smoothstep(0.55, 0.9, vn((th / TAU) * kStreak, sw * 0.12, kStreak, 17));
    const ao = (0.55 + 0.45 * smoothstep(-0.35, 0.25, pe)) * (0.78 + 0.22 * smoothstep(0, 0.25, uB)) * streak;
    const vary = 0.88 + 0.24 * vn((th / TAU) * bed.kLat * 3, lo * 1.3, bed.kLat * 3, bed.seed + 21);
    const machined: readonly [number, number, number] = [0.78, 0.77, 0.74];
    const k = (c: number, mc: number): number => (mc + (c - mc) * m) * (m < 1 ? 0.92 + 0.08 * ao : ao);
    return { p: pe, col: [k(bed.col[0] * vary, machined[0]), k(bed.col[1] * vary, machined[1]), k(bed.col[2] * vary, machined[2])] };
  };
}
