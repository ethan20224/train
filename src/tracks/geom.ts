/**
 * Track geometry primitives (pure math, no three.js: Node tests import this).
 *
 * Plane convention: (x, z), heading h is the angle from +z toward +x, so the unit tangent is (sin h, cos h).
 * A path is a chain of constant-curvature segments (k = 1/R, positive = turning toward +x); a straight is k = 0.
 * Position and heading are closed-form per segment, so a path is G1-continuous by construction and
 * `pointAt(s)` is exact (no sampling error). Vertical profile = sum of smooth ramps (parabolic blends).
 */

export interface Seg {
  readonly len: number;
  /** Signed curvature (1/m). */
  readonly k: number;
}

export interface Pose {
  x: number;
  z: number;
  /** Heading (rad), angle from +z toward +x. */
  h: number;
}

/** Smooth gradient ramp: height rises by `rise` between s0 and s1; slope blends in/out over `blend` m (parabolic). */
export interface Ramp {
  readonly s0: number;
  readonly s1: number;
  readonly rise: number;
  readonly blend: number;
}

/** Peak gradient of a ramp (rise / (length - blend)). */
export const rampGradient = (r: Ramp): number => r.rise / (r.s1 - r.s0 - r.blend);

function rampValue(r: Ramp, s: number): number {
  if (s <= r.s0) return 0;
  if (s >= r.s1) return r.rise;
  const g = rampGradient(r);
  const c = r.blend;
  const a = s - r.s0;
  const L = r.s1 - r.s0;
  if (a < c) return (g * a * a) / (2 * c);
  if (a <= L - c) return g * (c / 2 + (a - c));
  const b = L - a;
  return r.rise - (g * b * b) / (2 * c);
}
function rampSlope(r: Ramp, s: number): number {
  if (s <= r.s0 || s >= r.s1) return 0;
  const g = rampGradient(r);
  const c = r.blend;
  const a = s - r.s0;
  const L = r.s1 - r.s0;
  if (a < c) return (g * a) / c;
  if (a <= L - c) return g;
  return (g * (L - a)) / c;
}

export class TrackPath {
  readonly segs: readonly Seg[];
  readonly start: Pose;
  readonly length: number;
  /** Cumulative start arc length of each segment (+ total at the end). */
  private readonly cum: number[];
  /** Pose at the start of each segment. */
  private readonly poses: Pose[];
  readonly ramps: readonly Ramp[];
  readonly baseY: number;

  constructor(start: Pose, segs: readonly Seg[], baseY = 0, ramps: readonly Ramp[] = []) {
    this.start = { ...start };
    this.segs = segs.filter((s) => s.len > 1e-9);
    this.baseY = baseY;
    this.ramps = ramps;
    this.cum = [0];
    this.poses = [{ ...start }];
    let p: Pose = { ...start };
    let s = 0;
    for (const sg of this.segs) {
      p = advance(p, sg, sg.len);
      s += sg.len;
      this.cum.push(s);
      this.poses.push({ ...p });
    }
    this.length = s;
  }

  /** Index of the segment containing arc length s (clamped). */
  private segIndex(s: number): number {
    const n = this.segs.length;
    if (n === 0) return 0;
    if (s <= 0) return 0;
    if (s >= this.length) return n - 1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid]! <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Pose at arc length s. Outside [0, length] it extrapolates along the end tangent (straight). */
  poseAt(s: number, out: Pose = { x: 0, z: 0, h: 0 }): Pose {
    if (this.segs.length === 0) {
      out.x = this.start.x + Math.sin(this.start.h) * s;
      out.z = this.start.z + Math.cos(this.start.h) * s;
      out.h = this.start.h;
      return out;
    }
    if (s < 0) {
      out.x = this.start.x + Math.sin(this.start.h) * s;
      out.z = this.start.z + Math.cos(this.start.h) * s;
      out.h = this.start.h;
      return out;
    }
    if (s > this.length) {
      const e = this.poses[this.poses.length - 1]!;
      const d = s - this.length;
      out.x = e.x + Math.sin(e.h) * d;
      out.z = e.z + Math.cos(e.h) * d;
      out.h = e.h;
      return out;
    }
    const i = this.segIndex(s);
    const p0 = this.poses[i]!;
    const sg = this.segs[i]!;
    const a = s - this.cum[i]!;
    const r = advance(p0, sg, a);
    out.x = r.x;
    out.z = r.z;
    out.h = r.h;
    return out;
  }

  /** Curvature at s. */
  curvatureAt(s: number): number {
    if (this.segs.length === 0) return 0;
    return this.segs[this.segIndex(s)]!.k;
  }

  /** Rail-top height at s. */
  yAt(s: number): number {
    let y = this.baseY;
    for (const r of this.ramps) y += rampValue(r, s);
    return y;
  }
  /** dy/ds at s. */
  slopeAt(s: number): number {
    let g = 0;
    for (const r of this.ramps) g += rampSlope(r, s);
    return g;
  }

  endPose(): Pose {
    return this.poseAt(this.length);
  }

  /** Segment index range boundaries for sampling: arc-length values at which curvature changes. */
  breakpoints(): number[] {
    return this.cum.slice();
  }

  /** Closest arc length to (x, z) within [sLo, sHi] (coarse scan, then golden-section refinement). Returns { s, d }. */
  project(x: number, z: number, sLo = 0, sHi = this.length): { s: number; d: number } {
    const step = 2;
    let best = sLo;
    let bd = Infinity;
    const p: Pose = { x: 0, z: 0, h: 0 };
    for (let s = sLo; s <= sHi + 1e-9; s += step) {
      const ss = Math.min(s, sHi);
      this.poseAt(ss, p);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = ss;
      }
    }
    let lo = Math.max(sLo, best - step);
    let hi = Math.min(sHi, best + step);
    const f = (s: number): number => {
      this.poseAt(s, p);
      return (p.x - x) ** 2 + (p.z - z) ** 2;
    };
    const gr = 0.6180339887498949;
    let a = hi - gr * (hi - lo);
    let b = lo + gr * (hi - lo);
    let fa = f(a);
    let fb = f(b);
    for (let i = 0; i < 60; i++) {
      if (fa < fb) {
        hi = b;
        b = a;
        fb = fa;
        a = hi - gr * (hi - lo);
        fa = f(a);
      } else {
        lo = a;
        a = b;
        fa = fb;
        b = lo + gr * (hi - lo);
        fb = f(b);
      }
    }
    const s = (lo + hi) / 2;
    return { s, d: Math.sqrt(f(s)) };
  }
}

/** Advance a pose along one constant-curvature segment by arc length a. */
export function advance(p: Pose, sg: Seg, a: number): Pose {
  if (Math.abs(sg.k) < 1e-12) {
    return { x: p.x + Math.sin(p.h) * a, z: p.z + Math.cos(p.h) * a, h: p.h };
  }
  const h1 = p.h + sg.k * a;
  return {
    x: p.x + (Math.cos(p.h) - Math.cos(h1)) / sg.k,
    z: p.z + (Math.sin(h1) - Math.sin(p.h)) / sg.k,
    h: h1,
  };
}

/** Smallest signed difference between two angles (rad), in (-pi, pi]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * S-bend between two parallel tracks: arc(theta) + straight(s) + counter-arc(theta). Lands exactly at lateral offset
 * `d` (signed, + = toward +x for heading 0) and longitudinal length `L`, with end heading = start heading and
 * all arcs of radius `R`. Needs L >= minimum run for that R and d (else the straight would be negative).
 */
export function sBend(d: number, L: number, R: number): Seg[] {
  const ad = Math.abs(d);
  if (ad < 1e-9) return [{ len: L, k: 0 }];
  const f = (t: number): number => ad * Math.cos(t) - L * Math.sin(t) + 2 * R * (1 - Math.cos(t));
  let lo = Math.atan2(ad, L);
  let hi = Math.atan2(L, 2 * R - ad); // minimum of f: the smaller root (shorter arcs, straight in the middle) lies before it
  if (f(lo) < 0 || f(hi) > 0) throw new Error(`sBend: no solution d=${d} L=${L} R=${R}`);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const th = (lo + hi) / 2;
  const s = (L - 2 * R * Math.sin(th)) / Math.cos(th);
  if (s < -1e-6) throw new Error(`sBend: run too short for radius (d=${d}, L=${L}, R=${R}, straight=${s.toFixed(3)})`);
  const sg = Math.sign(d);
  const out: Seg[] = [{ len: R * th, k: sg / R }];
  if (s > 1e-9) out.push({ len: s, k: 0 });
  out.push({ len: R * th, k: -sg / R });
  return out;
}

/** Minimum run length of an S-bend with offset d and radius R (no straight section). */
export function sBendMinRun(d: number, R: number): number {
  const th = Math.acos(1 - Math.abs(d) / (2 * R));
  return 2 * R * Math.sin(th);
}

/** Circular arc of radius R turning by `angle` rad (signed: + toward +x). */
export const arcSeg = (R: number, angle: number): Seg => ({ len: R * Math.abs(angle), k: Math.sign(angle) / R });
export const straightSeg = (len: number): Seg => ({ len, k: 0 });

/** Builder for paths: chain segments from a start pose. */
export class PathBuilder {
  segs: Seg[] = [];
  private pose: Pose;
  constructor(start: Pose) {
    this.pose = { ...start };
  }
  get end(): Pose {
    return { ...this.pose };
  }
  private push(seg: Seg): this {
    this.segs.push(seg);
    this.pose = advance(this.pose, seg, seg.len);
    return this;
  }
  straight(len: number): this {
    return len > 1e-9 ? this.push(straightSeg(len)) : this;
  }
  /** Straight until world z reaches z (valid while heading is 0). */
  toZ(z: number): this {
    if (Math.abs(Math.sin(this.pose.h)) > 1e-9) throw new Error('toZ: heading is not 0');
    return this.straight(z - this.pose.z);
  }
  arc(R: number, angle: number): this {
    return this.push(arcSeg(R, angle));
  }
  /** S-bend that lands at lateral offset d after run L (heading 0 -> heading 0). */
  sbend(d: number, L: number, R: number): this {
    for (const s of sBend(d, L, R)) this.push(s);
    return this;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Intersections
// ---------------------------------------------------------------------------------------------------------

export interface Crossing {
  sa: number;
  sb: number;
  x: number;
  z: number;
  /** Angle between the two tangents (rad, 0..pi/2). */
  angle: number;
}

/** All transversal crossings of two paths in plan view (excludes near-tangent touches). */
export function intersectPaths(a: TrackPath, b: TrackPath, minAngle = 0.04): Crossing[] {
  const out: Crossing[] = [];
  const step = 2;
  const ptsA: Pose[] = [];
  const ptsB: Pose[] = [];
  const sA: number[] = [];
  const sB: number[] = [];
  for (let s = 0; s < a.length + step; s += step) {
    const ss = Math.min(s, a.length);
    sA.push(ss);
    ptsA.push(a.poseAt(ss));
    if (ss >= a.length) break;
  }
  for (let s = 0; s < b.length + step; s += step) {
    const ss = Math.min(s, b.length);
    sB.push(ss);
    ptsB.push(b.poseAt(ss));
    if (ss >= b.length) break;
  }
  // bounding box reject
  const bb = (pts: Pose[]): [number, number, number, number] => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
    return [x0, x1, z0, z1];
  };
  const ba = bb(ptsA);
  const bbb = bb(ptsB);
  if (ba[0] > bbb[1] + 3 || bbb[0] > ba[1] + 3 || ba[2] > bbb[3] + 3 || bbb[2] > ba[3] + 3) return out;
  // spatial hash of B segments
  const cell = 12;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number): string => `${cx},${cz}`;
  for (let j = 0; j + 1 < ptsB.length; j++) {
    const p = ptsB[j]!;
    const q = ptsB[j + 1]!;
    const cx0 = Math.floor(Math.min(p.x, q.x) / cell);
    const cx1 = Math.floor(Math.max(p.x, q.x) / cell);
    const cz0 = Math.floor(Math.min(p.z, q.z) / cell);
    const cz1 = Math.floor(Math.max(p.z, q.z) / cell);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = key(cx, cz);
      const arr = grid.get(k);
      if (arr) arr.push(j);
      else grid.set(k, [j]);
    }
  }
  const seen = new Set<string>();
  for (let i = 0; i + 1 < ptsA.length; i++) {
    const p = ptsA[i]!;
    const q = ptsA[i + 1]!;
    const cx0 = Math.floor(Math.min(p.x, q.x) / cell);
    const cx1 = Math.floor(Math.max(p.x, q.x) / cell);
    const cz0 = Math.floor(Math.min(p.z, q.z) / cell);
    const cz1 = Math.floor(Math.max(p.z, q.z) / cell);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const cand = grid.get(key(cx, cz));
      if (!cand) continue;
      for (const j of cand) {
        const k2 = `${i}:${j}`;
        if (seen.has(k2)) continue;
        seen.add(k2);
        const r = ptsB[j]!;
        const t = ptsB[j + 1]!;
        const d1x = q.x - p.x;
        const d1z = q.z - p.z;
        const d2x = t.x - r.x;
        const d2z = t.z - r.z;
        const den = d1x * d2z - d1z * d2x;
        if (Math.abs(den) < 1e-12) continue;
        const u = ((r.x - p.x) * d2z - (r.z - p.z) * d2x) / den;
        const v = ((r.x - p.x) * d1z - (r.z - p.z) * d1x) / den;
        if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) continue;
        // Newton refine on the exact curves.
        let s1 = sA[i]! + u * (sA[i + 1]! - sA[i]!);
        let s2 = sB[j]! + v * (sB[j + 1]! - sB[j]!);
        for (let it = 0; it < 12; it++) {
          const pa = a.poseAt(s1);
          const pb = b.poseAt(s2);
          const ex = pa.x - pb.x;
          const ez = pa.z - pb.z;
          if (ex * ex + ez * ez < 1e-20) break;
          const ta = [Math.sin(pa.h), Math.cos(pa.h)];
          const tb = [Math.sin(pb.h), Math.cos(pb.h)];
          // pa + ta ds1 = pb + tb ds2  =>  ta ds1 - tb ds2 = -e
          const det = -ta[0]! * tb[1]! + ta[1]! * tb[0]!;
          if (Math.abs(det) < 1e-9) break;
          const ds1 = (-ex * -tb[1]! - -tb[0]! * -ez) / det;
          const ds2 = (ta[0]! * -ez - ta[1]! * -ex) / det;
          s1 += ds1;
          s2 += ds2;
        }
        if (s1 < -1e-6 || s1 > a.length + 1e-6 || s2 < -1e-6 || s2 > b.length + 1e-6) continue;
        const pa = a.poseAt(s1);
        const pb = b.poseAt(s2);
        if (Math.hypot(pa.x - pb.x, pa.z - pb.z) > 1e-4) continue;
        const ang = Math.abs(angleDiff(pa.h, pb.h));
        const angle = Math.min(ang, Math.PI - ang);
        if (angle < minAngle) continue;
        // de-dup near-identical hits (same crossing found via adjacent cells)
        if (out.some((c) => Math.abs(c.sa - s1) < 0.05 && Math.abs(c.sb - s2) < 0.05)) continue;
        out.push({ sa: Math.max(0, Math.min(a.length, s1)), sb: Math.max(0, Math.min(b.length, s2)), x: pa.x, z: pa.z, angle });
      }
    }
  }
  return out.sort((c1, c2) => c1.sa - c2.sa);
}
