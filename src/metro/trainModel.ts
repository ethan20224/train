// Meridian Deep metro train model: geometry builders + materials + rig (pure three.js, no DOM, no scene wiring).
// Local frame of one train: +X = travel direction (front), +Y up (rail head at y = 0), Z lateral; origin = train centre,
// so door k sits at x = doorOffsets()[k] (the same offsets the platform screen doors use).
// 2035 driverless set: monocoque mirror-stainless body with a hint of tumblehome, continuous band glazing, flush glass
// fronts (no cab), open gangways, warm empty saloon. Draw calls per train: <= 10 (9 near, 8 far).
import * as THREE from 'three';
import { METRO_TRAIN } from '../layoutMetro';
import { doorOffsets, type LineId } from './tracks';

/** Line accent colours, LINEAR RGB (use with Color.setRGB / THREE.Color(r,g,b)). Ink blue, jade, oxblood. */
export const LINE_COLORS: Record<LineId, readonly [number, number, number]> = {
  meridian: [0.012, 0.075, 0.62],
  vesper: [0.0, 0.62, 0.27],
  halcyon: [0.42, 0.006, 0.02],
};

// ---- cross-section constants (metres) ----
const HW = METRO_TRAIN.width / 2;          // 1.45 half width at the waist
const Y_SKIRT = 0.55;                      // underside of the body shell
const Y_SILL = 1.1;                        // floor / sill line
const Y_BELT = 3.1;                        // top of the glazing band
const Y_TOP = METRO_TRAIN.height;          // 4.0
const TUMBLE = 0.07;                       // inward lean of the glazing band
const ZB = HW - TUMBLE;                    // half width at the roof springing
const RN = 2.4;                            // roof super-ellipse exponent
const Y_WIN = Y_SILL + 0.22;               // window sill (opaque mirror sill strip below it carries the line stripe)
const DOOR_HALF = 0.72;                    // half aperture (leaf width)
const POCKET = 0.78;                       // opaque pocket beyond the aperture
const SLIDE = 0.7;                         // leaf travel when fully open
const L_HALF = METRO_TRAIN.length / 2;

/** Outer half-width of the body at height y (lower band, glazing band, roof). */
export function halfWidthAt(y: number): number {
  if (y <= Y_SKIRT) return HW - 0.16;
  if (y < Y_SILL) { const t = (Y_SILL - y) / (Y_SILL - Y_SKIRT); return HW - 0.16 * t * t; }
  if (y <= Y_BELT) return HW - (TUMBLE * (y - Y_SILL)) / (Y_BELT - Y_SILL);
  if (y >= Y_TOP) return 0;
  const s = (y - Y_BELT) / (Y_TOP - Y_BELT);
  return ZB * Math.pow(1 - Math.pow(s, RN), 1 / RN);
}

type V3 = readonly [number, number, number];
type RGB = readonly [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

class Builder {
  pos: number[] = []; nor: number[] = []; col: number[] = []; slide: number[] = []; idx: number[] = [];
  constructor(private readonly useColor = false, private readonly useSlide = false) {}
  private vtx(p: V3, n: V3, c: RGB, s: number): number {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]);
    if (this.useColor) this.col.push(c[0], c[1], c[2]);
    if (this.useSlide) this.slide.push(s);
    return i;
  }
  /** Quad a,b,c,d. Winding is corrected so the face normal points along `hint` (or the smooth normals' mean). */
  quad(p: [V3, V3, V3, V3], hint: V3, c: RGB = [1, 1, 1], s = 0, n?: [V3, V3, V3, V3]): void {
    let g = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    if (Math.hypot(...g) < 1e-12) g = cross(sub(p[2], p[0]), sub(p[3], p[0]));
    const flip = dot(g, hint) < 0;
    const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
    const fn = norm(flip ? [-g[0], -g[1], -g[2]] : g);
    const ids = order.map((k) => this.vtx(p[k]!, n ? n[k]! : fn, c, s));
    this.idx.push(ids[0]!, ids[1]!, ids[2]!, ids[0]!, ids[2]!, ids[3]!);
  }
  /** Axis-aligned box, all faces outward. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: RGB = [1, 1, 1], s = 0): void {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const P = (x: number, y: number, z: number): V3 => [x, y, z];
    const faces: Array<[V3, V3, V3, V3]> = [
      [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], [P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)],
      [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)],
      [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)],
    ];
    for (const f of faces) {
      const m: V3 = [(f[0][0] + f[2][0]) / 2 - cx, (f[0][1] + f[2][1]) / 2 - cy, (f[0][2] + f[2][2]) / 2 - cz];
      this.quad(f, m, c, s);
    }
  }
  /** Slab following the body's side profile (tumblehome): outer face at |z| = halfWidthAt(y) + zOff, `thick` inboard. */
  slab(x0: number, x1: number, y0: number, y1: number, side: 1 | -1, zOff: number, thick: number, c: RGB = [1, 1, 1], s = 0): void {
    const zo0 = side * (halfWidthAt(y0) + zOff), zo1 = side * (halfWidthAt(y1) + zOff);
    const zi0 = zo0 - side * thick, zi1 = zo1 - side * thick;
    const o = (x: number, y: number, z: number): V3 => [x, y, z];
    const A = [o(x0, y0, zo0), o(x1, y0, zo0), o(x1, y1, zo1), o(x0, y1, zo1)] as const;   // outer
    const B = [o(x0, y0, zi0), o(x1, y0, zi0), o(x1, y1, zi1), o(x0, y1, zi1)] as const;   // inner
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = side * (halfWidthAt(cy) + zOff - thick / 2);
    const out = (f: V3[]): V3 => [(f[0]![0] + f[2]![0]) / 2 - cx, (f[0]![1] + f[2]![1]) / 2 - cy, (f[0]![2] + f[2]![2]) / 2 - cz];
    const face = (f: [V3, V3, V3, V3]): void => this.quad(f, out(f), c, s);
    face([A[0], A[1], A[2], A[3]]); face([B[0], B[1], B[2], B[3]]);
    face([A[0], A[1], B[1], B[0]]); face([A[3], A[2], B[2], B[3]]);
    face([A[0], A[3], B[3], B[0]]); face([A[1], A[2], B[2], B[1]]);
  }
  /** Vertical cylinder (poles): 8 sided, no caps. */
  pole(x: number, z: number, y0: number, y1: number, r: number, sides = 8, c: RGB = [1, 1, 1]): void {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0: V3 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], p1: V3 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
      const q0: V3 = [p0[0], y1, p0[2]], q1: V3 = [p1[0], y1, p1[2]];
      const am = (a0 + a1) / 2;
      this.quad([p0, p1, q1, q0], [Math.cos(am), 0, Math.sin(am)], c);
    }
  }
  /** Wheel / axle: cylinder along Z at (x, y), radius r, from z0 to z1 (with end caps). */
  wheel(x: number, y: number, z0: number, z1: number, r: number, sides = 14, c: RGB = [1, 1, 1]): void {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2;
      const p = (a: number, z: number): V3 => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
      this.quad([p(a0, z0), p(a1, z0), p(a1, z1), p(a0, z1)], [Math.cos(am), Math.sin(am), 0], c);
      this.quad([[x, y, z1], p(a0, z1), p(a1, z1), p(a1, z1)], [0, 0, 1], c);
      this.quad([[x, y, z0], p(a1, z0), p(a0, z0), p(a0, z0)], [0, 0, -1], c);
    }
  }
  /** Extrude a 2D (z, y) polyline along X from x0 to x1 with smooth normals. `outward` fixes the winding. */
  extrude(profile: ReadonlyArray<readonly [number, number]>, x0: number, x1: number, flip = false, c: RGB = [1, 1, 1]): void {
    const nrm = profile.map((_p, i) => {
      const a = profile[Math.max(0, i - 1)]!, b = profile[Math.min(profile.length - 1, i + 1)]!;
      const dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy) || 1;
      const s = flip ? -1 : 1;
      return [0, (s * -dz) / l, (s * dy) / l] as V3;      // outward for a profile running bottom -> up -> over the roof
    });
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i]!, b = profile[i + 1]!;
      const hint = norm([0, nrm[i]![1] + nrm[i + 1]![1], nrm[i]![2] + nrm[i + 1]![2]]);
      this.quad([[x0, a[1], a[0]], [x1, a[1], a[0]], [x1, b[1], b[0]], [x0, b[1], b[0]]], hint, c, 0,
        [nrm[i]!, nrm[i]!, nrm[i + 1]!, nrm[i + 1]!]);
    }
  }
  /** Closed convex (z, y) outline extruded along X with smooth normals and flat end caps (cushions). */
  solid(pts: Array<[number, number]>, x0: number, x1: number, c: RGB = [1, 1, 1]): void {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; area += a[0] * b[1] - b[0] * a[1]; }
    const cw = area > 0 ? pts.slice() : pts.slice().reverse();          // counter-clockwise in (z, y) => outward normals (extrude convention)
    this.extrude([...cw, cw[0]!], x0, x1, false, c);
    const cz = cw.reduce((a, p) => a + p[0], 0) / cw.length, cy = cw.reduce((a, p) => a + p[1], 0) / cw.length;
    for (const [x, h] of [[x0, -1], [x1, 1]] as const) {
      for (let i = 0; i < cw.length; i++) {
        const a = cw[i]!, b = cw[(i + 1) % cw.length]!;
        this.quad([[x, cy, cz], [x, a[1], a[0]], [x, b[1], b[0]], [x, b[1], b[0]]], [h, 0, 0], c);
      }
    }
  }
  /** Parametric surface, (u, v) in the given counts; normals by finite differences, oriented along `hint`. */
  grid(fn: (u: number, v: number) => V3, nu: number, nv: number, hint: V3, c: RGB = [1, 1, 1], u0 = 0, u1 = 1, v0 = 0, v1 = 1): void {
    const e = 1e-3;
    const at = (i: number, j: number): [V3, V3] => {
      const u = u0 + ((u1 - u0) * i) / nu, v = v0 + ((v1 - v0) * j) / nv;
      const p = fn(u, v);
      let n = norm(cross(sub(fn(u + e, v), fn(u - e, v)), sub(fn(u, v + e), fn(u, v - e))));
      if (dot(n, hint) < 0) n = [-n[0], -n[1], -n[2]];
      if (Math.abs(dot(n, hint)) < 1e-6) n = hint;
      return [p, n];
    };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = at(i, j), b = at(i + 1, j), cc = at(i + 1, j + 1), d = at(i, j + 1);
      this.quad([a[0], b[0], cc[0], d[0]], hint, c, 0, [a[1], b[1], cc[1], d[1]]);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (this.useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.useSlide) g.setAttribute('aSlide', new THREE.Float32BufferAttribute(this.slide, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---- geometry ----

export interface TrainGeometry {
  body: THREE.BufferGeometry; glass: THREE.BufferGeometry; doorFrame: THREE.BufferGeometry; doorGlass: THREE.BufferGeometry;
  lights: THREE.BufferGeometry; stripe: THREE.BufferGeometry; underframe: THREE.BufferGeometry;
  upholstery: THREE.BufferGeometry; champagne: THREE.BufferGeometry; card: THREE.BufferGeometry;
  /** Door centre x offsets (train centre = 0), measured from the door-leaf geometry itself (one per door). */
  doorCentres: number[];
}

const WARM_STRIP: RGB = [1.0, 0.56, 0.27];      // ~3500 K
const WARM = (k: number): RGB => [WARM_STRIP[0] * k, WARM_STRIP[1] * k, WARM_STRIP[2] * k];

/** Roof half-ring profile points on the right side from belt to crown (z, y). */
function roofHalf(n = 14): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * (Math.PI / 2);
    const cz = Math.cos(th), sy = Math.sin(th);
    out.push([ZB * Math.pow(cz, 2 / RN), Y_BELT + (Y_TOP - Y_BELT) * Math.pow(sy, 2 / RN)]);
  }
  return out;
}
/** Whole roof profile, right belt -> crown -> left belt. */
function roofProfile(inset = 0): Array<[number, number]> {
  const r = roofHalf().map(([z, y]) => [z - inset, y - inset * 0.6] as [number, number]);
  const l = r.slice(0, -1).reverse().map(([z, y]) => [-z, y] as [number, number]);
  return [...r, ...l];
}
function lowerHalf(side: 1 | -1, y0 = Y_SKIRT, n = 6): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) { const y = y0 + ((Y_SILL - y0) * i) / n; out.push([side * halfWidthAt(y), y]); }
  return out;
}

/** Front-cap surface point: flush, gently domed. (u in -1..1 across, y metres). */
function capPoint(end: 1 | -1, zRel: number, y: number): V3 {
  const R = halfWidthAt(y);
  const k = Math.max(0, Math.sin((Math.PI * (y - Y_SKIRT)) / (Y_TOP - Y_SKIRT)));
  const bulge = 0.3 * Math.pow(Math.max(0, 1 - zRel * zRel), 0.8) * Math.pow(k, 0.7);
  return [end * (L_HALF + bulge), y, zRel * R];
}

let cached: TrainGeometry | null = null;
export function getTrainGeometry(): TrainGeometry {
  if (cached) return cached;
  const { cars, carLength, gap, doorsPerSidePerCar: nd } = METRO_TRAIN;
  const doors = doorOffsets();
  const body = new Builder(), glass = new Builder(), doorFrame = new Builder(false, true), doorGlass = new Builder(false, true);
  const lights = new Builder(true), stripe = new Builder(), under = new Builder(), uph = new Builder(), champ = new Builder(), card = new Builder();
  const sides: Array<1 | -1> = [1, -1];
  const carStart = (c: number): number => -L_HALF + c * (carLength + gap);

  for (let c = 0; c < cars; c++) {
    const x0 = carStart(c), x1 = x0 + carLength;
    // --- shell: roof, lower bands (open ends; the gangway sleeve and end caps close them)
    body.extrude(roofProfile(), x0, x1);
    for (const s of sides) body.extrude(lowerHalf(s), x0, x1, s === -1);
    // lower-band underside (dark, keeps the silhouette crisp)
    // --- glazing band: door pockets + fixed windows + end pillars
    const dc = doors.slice(c * nd, (c + 1) * nd);
    for (const s of sides) {
      body.slab(x0, x0 + 0.1, Y_SILL, Y_BELT, s, 0, 0.05); body.slab(x1 - 0.1, x1, Y_SILL, Y_BELT, s, 0, 0.05);
      let from = x0 + 0.1, stripeFrom = x0 + 0.12;
      for (const d of dc) {
        const a = d - DOOR_HALF - POCKET, b = d + DOOR_HALF + POCKET;
        glass.slab(from, a, Y_WIN, Y_BELT, s, -0.03, 0.02);
        body.slab(from, a, Y_SILL, Y_WIN, s, 0, 0.05);
        stripe.slab(stripeFrom, d - DOOR_HALF, Y_SILL + 0.075, Y_SILL + 0.135, s, 0.008, 0.006);
        stripeFrom = d + DOOR_HALF;
        body.slab(a, d - DOOR_HALF, Y_SILL, Y_BELT, s, 0, 0.05); body.slab(d + DOOR_HALF, b, Y_SILL, Y_BELT, s, 0, 0.05);
        // door leaves: inboard of the pockets so they slide behind them
        for (const leaf of [-1, 1] as const) {
          const lx0 = leaf < 0 ? d - DOOR_HALF : d + 0.003, lx1 = leaf < 0 ? d - 0.003 : d + DOOR_HALF;
          const sl = leaf * SLIDE;
          doorGlass.slab(lx0 + 0.04, lx1 - 0.04, Y_SILL + 0.07, Y_BELT - 0.07, s, -0.05, 0.016, [1, 1, 1], sl);
          doorFrame.slab(lx0, lx1, Y_SILL, Y_SILL + 0.07, s, -0.04, 0.04, [1, 1, 1], sl);
          doorFrame.slab(lx0, lx1, Y_BELT - 0.07, Y_BELT, s, -0.04, 0.04, [1, 1, 1], sl);
          doorFrame.slab(lx0, lx0 + 0.04, Y_SILL, Y_BELT, s, -0.04, 0.04, [1, 1, 1], sl);
          doorFrame.slab(lx1 - 0.04, lx1, Y_SILL, Y_BELT, s, -0.04, 0.04, [1, 1, 1], sl);
        }
        from = b;
      }
      glass.slab(from, x1 - 0.1, Y_WIN, Y_BELT, s, -0.03, 0.02);
      body.slab(from, x1 - 0.1, Y_SILL, Y_WIN, s, 0, 0.05);
      stripe.slab(stripeFrom, x1 - 0.12, Y_SILL + 0.075, Y_SILL + 0.135, s, 0.008, 0.006);   // line-colour band at sill level
    }
    // thresholds (champagne) across each door
    for (const d of dc) for (const s of sides) champ.box(d - DOOR_HALF, d + DOOR_HALF, Y_SILL, Y_SILL + 0.015, s * 1.28, s * 1.43);

    // --- underframe: skirt between bogies, bogies, wheelsets
    for (const s of sides) under.box(x0 + 2.0, x1 - 2.0, 0.36, Y_SKIRT + 0.03, s * 0.55, s * 1.12);
    under.box(x0 + 1.0, x1 - 1.0, 0.5, Y_SKIRT + 0.02, -0.5, 0.5);
    for (const bx of [x0 + 3.2, x1 - 3.2]) {
      under.box(bx - 1.25, bx + 1.25, 0.34, 0.5, -0.78, 0.78);
      under.box(bx - 1.25, bx + 1.25, 0.3, 0.42, -0.9, -0.74); under.box(bx - 1.25, bx + 1.25, 0.3, 0.42, 0.74, 0.9);
      for (const wx of [bx - 0.95, bx + 0.95]) {
        for (const s of sides) under.wheel(wx, 0.42, s * 0.62, s * 0.76, 0.42, 14);
        under.wheel(wx, 0.42, -0.62, 0.62, 0.06, 6);
      }
    }
    // --- interior: seats between pockets, poles, displays (champagne + upholstery)
    const runs: Array<[number, number]> = [];
    let f = x0 + 0.3;
    for (const d of dc) { runs.push([f, d - DOOR_HALF - POCKET - 0.05]); f = d + DOOR_HALF + POCKET + 0.05; }
    runs.push([f, x1 - 0.3]);
    for (const s of sides) {
      for (const [a, b] of runs) {
        if (b - a < 0.8) continue;
        const n = Math.max(2, Math.round((b - a) / 0.58));
        const w = (b - a) / n;
        // champagne frame visible beneath the pan: recessed panel, plinth and a front rail
        champ.box(a, b, Y_SILL + 0.1, Y_SILL + 0.3, s * 1.0, s * 1.3);
        champ.box(a, b, Y_SILL + 0.04, Y_SILL + 0.1, s * 0.96, s * 1.32);
        champ.box(a, b, Y_SILL + 0.3, Y_SILL + 0.335, s * 0.9, s * 0.945);
        for (let i = 0; i < n; i++) {
          const pa = a + i * w + 0.008, pb = a + (i + 1) * w - 0.008;
          const Z = (d: number): number => s * (1.37 - d);
          const y0 = Y_SILL + 0.34;
          // seat pan with a front radius
          uph.solid([[Z(0.02), y0], [Z(0.44), y0], [Z(0.5), y0 + 0.02], [Z(0.53), y0 + 0.06], [Z(0.52), y0 + 0.1], [Z(0.46), y0 + 0.125], [Z(0.2), y0 + 0.13], [Z(0.02), y0 + 0.12]], pa, pb);
          // raked two-panel backrest (lower bolster + upper) with a seam gap
          const rake = (y: number): number => 0.02 + 0.08 * ((y - (Y_SILL + 0.48)) / 0.5);
          uph.solid([[Z(rake(Y_SILL + 0.48)), Y_SILL + 0.48], [Z(rake(Y_SILL + 0.48) + 0.1), Y_SILL + 0.49], [Z(rake(Y_SILL + 0.72) + 0.11), Y_SILL + 0.72], [Z(rake(Y_SILL + 0.72)), Y_SILL + 0.72]], pa, pb);
          uph.solid([[Z(rake(Y_SILL + 0.73)), Y_SILL + 0.73], [Z(rake(Y_SILL + 0.73) + 0.11), Y_SILL + 0.73], [Z(rake(Y_SILL + 0.95) + 0.1), Y_SILL + 0.93], [Z(rake(Y_SILL + 0.93) + 0.05), Y_SILL + 0.97], [Z(rake(Y_SILL + 0.93) - 0.0), Y_SILL + 0.96]], pa, pb);
        }
        // slim champagne end partitions
        champ.box(a - 0.012, a, Y_SILL + 0.04, Y_SILL + 0.6, s * 0.94, s * 1.0); champ.box(b, b + 0.012, Y_SILL + 0.04, Y_SILL + 0.6, s * 0.94, s * 1.0);
      }
      for (const d of dc) {
        for (const o of [-0.97, 0.97]) body.pole(d + o, s * 0.98, Y_SILL, 3.04, 0.02, 10);
        body.pole(d, s * 0.42, Y_SILL, 3.04, 0.018, 10);
        // hairline display above the door (inside the transom)
        {
          const zi = s * (halfWidthAt(2.9) - 0.1);
          lights.box(d - 0.5, d + 0.5, 2.875, 2.925, zi - s * 0.006, zi + s * 0.006, [0.012, 0.015, 0.02]);
          let gx = d - 0.42, k = 0;                                     // faint dot-matrix "text": two short words of blocks
          while (gx < d + 0.4) {
            const gw = 0.025 + 0.02 * ((k * 7 + 3) % 4); k++;
            if (k % 6 === 0 || k % 6 === 3) { gx += 0.05; continue; }
            for (const f of [-1, 1]) lights.box(gx, gx + gw, 2.892, 2.908, zi + f * s * 0.0065, zi + f * s * 0.0067, [0.2, 0.34, 0.42]);
            gx += gw + 0.014;
          }
        }
      }
      // warm sill wash under the seats (inner wall)
      {
        const za = s * (halfWidthAt(Y_SILL) - 0.06), zb = s * (halfWidthAt(Y_SILL + 0.5) - 0.06);
        lights.quad([[x0, Y_SILL, za], [x1, Y_SILL, za], [x1, Y_SILL + 0.5, zb], [x0, Y_SILL + 0.5, zb]], [0, 0, -s], WARM(0.07));
      }
    }
    // overhead stainless grab rail along the saloon, fed by short hangers at each door pole
    for (const s of sides) body.box(x0 + 0.4, x1 - 0.4, 2.62, 2.65, s * 0.76, s * 0.79);
    for (const d of dc) for (const s of sides) body.box(d - 0.012, d + 0.012, 2.62, 3.04, s * 0.76, s * 0.79);

    // --- gangway sleeve to the next car
    if (c < cars - 1) {
      const a = x1, b = x1 + gap;
      under.extrude(roofProfile(0.03), a, b);
      for (const s of sides) {
        under.extrude(lowerHalf(s).map(([z, y]) => [z - s * 0.03, y] as [number, number]), a, b, s === -1);
        under.extrude([[s * (halfWidthAt(Y_SILL) - 0.03), Y_SILL], [s * (ZB - 0.03), Y_BELT]], a, b, s === -1);
      }
    }
  }
  // --- continuous saloon: floor, ceiling wash and strips, run through the gangways
  const xa = -L_HALF + 0.02, xb = L_HALF - 0.02;
  lights.quad([[xa, Y_SILL, -1.38], [xb, Y_SILL, -1.38], [xb, Y_SILL, 1.38], [xa, Y_SILL, 1.38]], [0, 1, 0], [0.05, 0.034, 0.024]);
  lights.quad([[xa, 3.07, -1.34], [xb, 3.07, -1.34], [xb, 3.07, 1.34], [xa, 3.07, 1.34]], [0, -1, 0], WARM(0.3));
  for (const z of [-0.62, 0.62]) lights.quad([[xa, 3.068, z - 0.3], [xb, 3.068, z - 0.3], [xb, 3.068, z + 0.3], [xa, 3.068, z + 0.3]], [0, -1, 0], WARM(0.8));
  for (const z of [-0.62, 0.62]) lights.quad([[xa, 3.065, z - 0.07], [xb, 3.065, z - 0.07], [xb, 3.065, z + 0.07], [xa, 3.065, z + 0.07]], [0, -1, 0], WARM(3.0));
  // floor centre line of warm light (a hairline) for depth
  lights.quad([[xa, Y_SILL + 0.004, -0.015], [xb, Y_SILL + 0.004, -0.015], [xb, Y_SILL + 0.004, 0.015], [xa, Y_SILL + 0.004, 0.015]], [0, 1, 0], WARM(0.9));

  // dark vaulted roof lining above the ceiling (seen through the glass fronts)
  lights.extrude(roofProfile(0.05), -L_HALF, L_HALF, true, WARM(0.05));

  // --- end caps: rounded monocoque nose (frame), one curved glass panel inset 30 mm, black bulkhead ring, edge light, lamps
  for (const end of [1, -1] as const) {
    const hint: V3 = [end, 0, 0];
    const gy0 = 1.0, gy1 = 3.72, gk = 0.95, rc = 0.25, band = 0.14, NR = 44;
    /** Half-extent of the glass panel as a fraction of the local half-width, with ~0.25 m corner radii at top and bottom. */
    const ulim = (y: number): number => {
      const R = halfWidthAt(y), d = Math.min(y - gy0, gy1 - y);
      const sh = d < rc ? rc - Math.sqrt(Math.max(0, rc * rc - (rc - d) * (rc - d))) : 0;
      return Math.max(0.05, gk * R - sh) / R;
    };
    const cp = (zRel: number, y: number, dx = 0): V3 => { const p = capPoint(end, zRel, y); return [p[0] + end * dx, p[1], p[2]]; };
    // frame: full rows below / above the panel, and strips either side following its rounded edge
    body.grid((u, y) => cp(u, y), 12, 4, hint, [1, 1, 1], -1, 1, Y_SKIRT, gy0);
    body.grid((u, y) => cp(u, y), 12, 8, hint, [1, 1, 1], -1, 1, gy1, Y_TOP);
    body.grid((t, y) => cp(-1 + t * (1 - ulim(y)), y), 2, NR, hint, [1, 1, 1], 0, 1, gy0, gy1);
    body.grid((t, y) => cp(ulim(y) + t * (1 - ulim(y)), y), 2, NR, hint, [1, 1, 1], 0, 1, gy0, gy1);
    // glass panel: follows the cap curvature, recessed 30 mm, tucked 7 cm behind the frame edge
    glass.grid((t, y) => cp((2 * t - 1) * Math.min(1, ulim(y) + 0.07 / halfWidthAt(y)), y, -0.03), 16, NR, hint, [1, 1, 1], 0, 1, gy0, gy1);
    // slim black bulkhead ring just behind the glass
    const black: RGB = [0.004, 0.004, 0.005];
    lights.grid((t, y) => cp(-ulim(y) + t * (band / halfWidthAt(y)), y, -0.06), 2, NR, hint, black, 0, 1, gy0, gy1);
    lights.grid((t, y) => cp(ulim(y) - t * (band / halfWidthAt(y)), y, -0.06), 2, NR, hint, black, 0, 1, gy0, gy1);
    lights.grid((t, y) => cp((2 * t - 1) * ulim(y), y, -0.06), 10, 3, hint, black, 0, 1, gy1 - band, gy1);
    lights.grid((t, y) => cp((2 * t - 1) * ulim(y), y, -0.06), 10, 3, hint, black, 0, 1, gy0, gy0 + band);
    // light line following the panel edge (counter-clockwise loop in (z, y))
    const loop: Array<[number, number]> = [];
    for (let i = 0; i <= NR; i++) { const y = gy0 + ((gy1 - gy0) * i) / NR; loop.push([halfWidthAt(y) * ulim(y), y]); }
    for (let i = 1; i < 12; i++) loop.push([halfWidthAt(gy1) * ulim(gy1) * (1 - (2 * i) / 12), gy1]);
    for (let i = NR; i >= 0; i--) { const y = gy0 + ((gy1 - gy0) * i) / NR; loop.push([-halfWidthAt(y) * ulim(y), y]); }
    for (let i = 1; i < 12; i++) loop.push([-halfWidthAt(gy0) * ulim(gy0) * (1 - (2 * i) / 12), gy0]);
    const edgeCol: RGB = end > 0 ? [1.5, 1.5, 1.45] : [1.0, 1.0, 0.95];
    const lpt = (i: number, grow: number): V3 => {
      const q = loop[(i + loop.length) % loop.length]!, a = loop[(i - 1 + loop.length) % loop.length]!, b = loop[(i + 1) % loop.length]!;
      const dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy) || 1;
      const z = q[0] + (dy / l) * 0.022 * grow, y = q[1] - (dz / l) * 0.022 * grow;
      return cp(z / halfWidthAt(y), y, 0.004);
    };
    for (let i = 0; i < loop.length; i++) lights.quad([lpt(i, 0), lpt(i + 1, 0), lpt(i + 1, 1), lpt(i, 1)], hint, edgeCol);
    // lamps: small slots in the skirt, white headlights (front, +x), dim red tail lights (rear, -x)
    for (const sd of sides) {
      const y = 0.7, zc = sd * 0.62;
      const lp = (dz: number, dy: number): V3 => cp((zc + dz) / halfWidthAt(y + dy), y + dy, 0.006);
      lights.quad([lp(-0.18, -0.016), lp(0.18, -0.016), lp(0.18, 0.016), lp(-0.18, 0.016)], hint, end > 0 ? [3.2, 3.2, 3.0] : [0.9, 0.02, 0.02]);
    }
  }

  // --- LOD card: simplified lit saloon seen through the windows (two backing planes)
  for (const s of sides) card.quad([[-L_HALF + 0.1, Y_SILL + 0.05, s * 1.30], [L_HALF - 0.1, Y_SILL + 0.05, s * 1.30], [L_HALF - 0.1, 3.0, s * 1.30], [-L_HALF + 0.1, 3.0, s * 1.30]], [0, 0, s]);
  card.quad([[-L_HALF + 0.1, 3.0, -1.3], [L_HALF - 0.1, 3.0, -1.3], [L_HALF - 0.1, 3.0, 1.3], [-L_HALF + 0.1, 3.0, 1.3]], [0, -1, 0]);

  const dg = doorGlass.build();
  // measure door centres from the door-glass leaf geometry (closed state, one side): cluster vertices by x
  const px = dg.getAttribute('position'), pz = dg.getAttribute('position');
  const xs: number[] = [];
  for (let i = 0; i < px.count; i++) if (pz.getZ(i) > 0) xs.push(px.getX(i));
  xs.sort((a, b) => a - b);
  const doorCentres: number[] = [];
  let lo = xs[0]!, prev = xs[0]!;
  for (let i = 1; i <= xs.length; i++) {
    if (i === xs.length || xs[i]! - prev > 1.0) { doorCentres.push((lo + prev) / 2); lo = xs[i] ?? 0; }
    prev = xs[i] ?? prev;
  }
  cached = {
    body: body.build(), glass: glass.build(), doorFrame: doorFrame.build(), doorGlass: dg, lights: lights.build(),
    stripe: stripe.build(), underframe: under.build(), upholstery: uph.build(), champagne: champ.build(), card: card.build(),
    doorCentres,
  };
  return cached;
}

// ---- materials ----

export interface TrainSharedMaterials {
  body: THREE.MeshStandardMaterial; glass: THREE.MeshStandardMaterial; lights: THREE.MeshBasicMaterial;
  underframe: THREE.MeshStandardMaterial; upholstery: THREE.MeshStandardMaterial; champagne: THREE.MeshStandardMaterial;
  card: THREE.MeshBasicMaterial;
}
export interface TrainPerTrainMaterials {
  doorFrame: THREE.MeshStandardMaterial; doorGlass: THREE.MeshStandardMaterial; stripe: THREE.MeshStandardMaterial;
  /** Door open amount (0..1) drives the leaf slide in the vertex shader. */
  doorUniform: { value: number };
}

export function createSharedMaterials(champagneBase?: THREE.MeshStandardMaterial): TrainSharedMaterials {
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.84, 0.86, 0.9), metalness: 1, roughness: 0.06, envMapIntensity: 1.25 });
  const glass = glassMaterial();
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
  const underframe = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.02, 0.022, 0.026), metalness: 0.6, roughness: 0.55 });
  const upholstery = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.04, 0.046, 0.06), roughness: 0.85, metalness: 0, emissive: new THREE.Color(1.0, 0.56, 0.27), emissiveIntensity: 0.008,
  });
  const champagne = champagneBase ? champagneBase.clone() : new THREE.MeshStandardMaterial({ color: new THREE.Color(0.58, 0.52, 0.42), metalness: 1, roughness: 0.3 });
  champagne.emissive = new THREE.Color(1.0, 0.56, 0.27); champagne.emissiveIntensity = 0.03;
  const card = new THREE.MeshBasicMaterial({ color: new THREE.Color(...WARM(0.5)) });
  return { body, glass, lights, underframe, upholstery, champagne, card };
}

function glassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.004, 0.012, 0.009), metalness: 0.0, roughness: 0.02, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 0.55,
  });
}

/** Per-train materials (leaf slide uniform, line stripe colour). The door materials are mirrors patched to slide. */
export function createPerTrainMaterials(shared: TrainSharedMaterials, line: LineId): TrainPerTrainMaterials {
  const doorUniform = { value: 0 };
  const patch = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uOpen = doorUniform;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSlide;\nuniform float uOpen;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += aSlide * uOpen;');
    };
    m.customProgramCacheKey = () => 'metroDoorSlide';
    return m;
  };
  const doorFrame = patch(shared.body.clone());
  const doorGlass = patch(shared.glass.clone());
  const stripe = new THREE.MeshStandardMaterial({ color: new THREE.Color(0, 0, 0), metalness: 0.1, roughness: 0.45 });
  const t: TrainPerTrainMaterials = { doorFrame, doorGlass, stripe, doorUniform };
  setLine(t, line);
  return t;
}
export function setLine(t: TrainPerTrainMaterials, line: LineId): void {
  const c = LINE_COLORS[line];
  t.stripe.color.setRGB(c[0] * 0.75, c[1] * 0.75, c[2] * 0.75);
}

// ---- rig ----

export interface TrainRig {
  group: THREE.Group;
  /** All materials of this rig (shared + per-train), for registering with the deep env map. */
  materials: THREE.Material[];
  setLine(line: LineId): void;
  setDoors(open01: number): void;
  /** true = full interior detail; false = simplified emissive interior card. */
  setInteriorDetail(on: boolean): void;
  readonly interior: readonly THREE.Mesh[];
  readonly card: THREE.Mesh;
}

export function createTrainRig(shared: TrainSharedMaterials, line: LineId): TrainRig {
  const geo = getTrainGeometry();
  const per = createPerTrainMaterials(shared, line);
  const group = new THREE.Group();
  group.name = 'metroTrain';
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, order = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = order; mesh.matrixAutoUpdate = true;
    mesh.userData.noShadow = true; mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  };
  mk(geo.body, shared.body); mk(geo.doorFrame, per.doorFrame); mk(geo.underframe, shared.underframe);
  mk(geo.stripe, per.stripe); mk(geo.lights, shared.lights);
  const interior = [mk(geo.upholstery, shared.upholstery), mk(geo.champagne, shared.champagne)];
  const card = mk(geo.card, shared.card); card.visible = false;
  mk(geo.glass, shared.glass, 10); mk(geo.doorGlass, per.doorGlass, 10);
  // door leaves slide outside the geometry's bounding sphere by < 1 m: the sphere (r ~ 41) already has slack; none needed
  const materials: THREE.Material[] = [shared.body, shared.glass, shared.lights, shared.underframe, shared.upholstery, shared.champagne, shared.card,
    per.doorFrame, per.doorGlass, per.stripe];
  return {
    group, materials, interior, card,
    setLine: (l) => setLine(per, l),
    setDoors: (v) => { per.doorUniform.value = v; },
    setInteriorDetail: (on) => { for (const m of interior) m.visible = on; card.visible = !on; },
  };
}
