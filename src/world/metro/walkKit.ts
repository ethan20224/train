import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOARDWALK, type WalkPad } from '../../layoutMetro';
import type { PathStation, RailKind, Side, WalkPlanPad, WalkRun } from '../../metro/walks';

/**
 * Shared kit of the canopy walk and the forest boardwalk (src/metro/walks.ts holds the plans; canopyWalk.ts / boardwalk.ts build
 * from them): materials (muted oiled oak with a fine-plank procedural map, satin stainless), geometry accumulators merged per
 * material (timber, metal, glass, warm LED = 4 draw calls for BOTH walks) and the shared primitives: oriented beams, rods,
 * sheared glass panes, the two balustrade kinds (1.1 m, and the full-height laminated screen near trains), flat decks, stairs and
 * spline ribbons.
 */

export type V3 = readonly [number, number, number];
export type { Side };

/** Texture repeat: one tile is 2.4 m along the planks and 1.12 m across (8 boards of 0.14 m). */
const TILE_U = 2.4, TILE_V = 1.12;

/** Balustrade dimensions (metres). `high` is the train-side screen. */
export const RAIL = {
  height: 1.1, glassBottom: 0.1, glassTop: 1.0, glassT: 0.012, postPitch: 1.9, postW: 0.03,
  handW: 0.07, handH: 0.045, bayGap: 0.02, shoeW: 0.04, shoeH: 0.05,
  ledW: 0.016, ledH: 0.008, ledInset: 0.03,
  high: {
    height: BOARDWALK.highScreen, glassBottom: 0.15, glassT: 0.028, postPitch: 1.5, postW: 0.065, postD: 0.09,
    baseW: 0.12, baseH: 0.15, capW: 0.1, capH: 0.05, handY: 1.1, handOff: 0.075,
  },
} as const;

export class WalkBags {
  timber: THREE.BufferGeometry[] = [];
  metal: THREE.BufferGeometry[] = [];
  glass: THREE.BufferGeometry[] = [];
  led: THREE.BufferGeometry[] = [];
  private seed = 1;
  /** Deterministic per-element texture offset so neighbouring boards never repeat exactly. */
  rnd(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
    if (list.length === 0) return null;
    const g = mergeGeometries(list, false);
    for (const p of list) p.dispose();
    g.computeBoundingSphere();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3();
const _m = new THREE.Matrix4();

function basis(a: V3, b: V3): number {
  _a.set(...a); _b.set(...b);
  _d.copy(_b).sub(_a);
  const len = _d.length();
  _d.divideScalar(len);
  _s.crossVectors(_d, UP);
  if (_s.lengthSq() < 1e-8) _s.set(0, 0, 1);
  _s.normalize();
  _u.crossVectors(_s, _d);
  _m.makeBasis(_d, _u, _s);
  _m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return len;
}

/** Box `w` wide (horizontal, across) and `h` thick (perpendicular to the slope), long axis a -> b, kept level across. */
export function boxBetween(a: V3, b: V3, w: number, h: number): THREE.BoxGeometry {
  const len = basis(a, b);
  const g = new THREE.BoxGeometry(len, h, w);
  g.applyMatrix4(_m);
  return g;
}

/** Re-map a BoxGeometry's UVs to metres on the timber tile (long axis along u). Call before transforming, with the box dims. */
function timberUV(g: THREE.BoxGeometry, len: number, h: number, w: number, ou: number, ov: number): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims: ReadonlyArray<readonly [number, number]> = [[w, h], [w, h], [len, w], [len, w], [len, h], [len, h]];
  for (let i = 0; i < uv.count; i++) {
    const [du, dv] = dims[Math.floor(i / 4)]!;
    uv.setXY(i, (uv.getX(i) * du) / TILE_U + ou, (uv.getY(i) * dv) / TILE_V + ov);
  }
  uv.needsUpdate = true;
}

export function timberBeam(bags: WalkBags, a: V3, b: V3, w: number, h: number): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new THREE.BoxGeometry(len, h, w);
  timberUV(g, len, h, w, bags.rnd(), bags.rnd());
  basis(a, b);
  g.applyMatrix4(_m);
  bags.timber.push(g);
}

export function metalBeam(bags: WalkBags, a: V3, b: V3, w: number, h: number): void {
  bags.metal.push(boxBetween(a, b, w, h));
}
export function ledBeam(bags: WalkBags, a: V3, b: V3, w: number, h: number): void {
  bags.led.push(boxBetween(a, b, w, h));
}

/** Round stainless rod / column from a to b. */
export function metalRod(bags: WalkBags, a: V3, b: V3, r: number, seg = 8): void {
  _a.set(...a); _b.set(...b);
  _d.copy(_b).sub(_a);
  const len = _d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, _d.divideScalar(len)));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  bags.metal.push(g);
}
/** Flat round plate (rosette, foot plate) centred at c, axis up. */
export function metalDisc(bags: WalkBags, c: V3, r: number, t: number, seg = 14): void {
  const g = new THREE.CylinderGeometry(r, r, t, seg, 1, false);
  g.translate(c[0], c[1], c[2]);
  bags.metal.push(g);
}

/** Axis-aligned metal box. */
export function metalBox(bags: WalkBags, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  bags.metal.push(g);
}

/**
 * Glass pane standing on the rail line A -> B (world x, deck y, z), between fractions t0..t1, from `yBot` to `yTop` above the deck
 * (sheared to follow a slope), `thick` thick, centred on the line.
 */
function glassPane(bags: WalkBags, a: V3, b: V3, t0: number, t1: number, yBot: number, yTop: number, thick: number, nx: number, nz: number): void {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = t0 + (t1 - t0) * (p.getX(i) + 0.5), v = p.getY(i) + 0.5, s = p.getZ(i) * thick;
    p.setXYZ(
      i,
      a[0] + (b[0] - a[0]) * u + nx * s,
      a[1] + (b[1] - a[1]) * u + yBot + (yTop - yBot) * v,
      a[2] + (b[2] - a[2]) * u + nz * s,
    );
  }
  g.computeVertexNormals();
  bags.glass.push(g);
}

export interface RailLine {
  /** Ends on the deck: x, deck y, z. */
  readonly a: V3;
  readonly b: V3;
  /** Horizontal unit vector pointing to the walking side. */
  readonly inward: readonly [number, number];
  readonly kind: 'low' | 'high';
}

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const addY = (p: V3, dy: number): V3 => [p[0], p[1] + dy, p[2]];

/**
 * low: 1.1 m balustrade (stainless posts and shoe, ultra-clear glass bays, timber handrail, warm LED line under it).
 * high: the train-side screen: 28 mm laminated glass (green edge) from a 150 mm stainless base channel to a stainless top cap at
 * 2.65 m, 65 x 90 mm posts every <= 1.5 m, and the timber handrail on the walking side at 1.1 m on stainless brackets.
 */
export function addRail(bags: WalkBags, line: RailLine): void {
  const { a, b, inward, kind } = line;
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  if (len < 0.05) return;
  const high = kind === 'high';
  const R = RAIL, Hh = R.high;
  const H = high ? Hh.height : R.height;
  const n = Math.max(1, Math.ceil(len / (high ? Hh.postPitch : R.postPitch)));
  const dx = (b[0] - a[0]) / len, dz = (b[2] - a[2]) / len, dy = (b[1] - a[1]) / len;
  const ext = 0.04;
  const along = (p: V3, e: number): V3 => [p[0] + dx * e, p[1] + dy * e, p[2] + dz * e];

  // posts
  const pw = high ? Hh.postW : R.postW, pd = high ? Hh.postD : R.postW;
  const topCap = high ? Hh.capH : R.handH;
  for (let k = 0; k <= n; k++) {
    const p = lerp3(a, b, k / n);
    // posts are wider across the screen (postD) than along it (postW)
    const hx = Math.abs(dz) * pd / 2 + Math.abs(dx) * pw / 2, hz = Math.abs(dx) * pd / 2 + Math.abs(dz) * pw / 2;
    metalBox(bags, p[0] - hx, p[1], p[2] - hz, p[0] + hx, p[1] + H - topCap, p[2] + hz);
  }

  if (high) {
    // base channel and top cap rail (stainless), full length
    metalBeam(bags, addY(a, Hh.baseH / 2), addY(b, Hh.baseH / 2), Hh.baseW, Hh.baseH);
    metalBeam(bags, addY(along(a, -ext), H - Hh.capH / 2), addY(along(b, ext), H - Hh.capH / 2), Hh.capW, Hh.capH);
    // walking-side timber handrail on brackets
    const o = Hh.handOff;
    const ha: V3 = [a[0] + inward[0] * o, a[1] + Hh.handY - R.handH / 2, a[2] + inward[1] * o];
    const hb: V3 = [b[0] + inward[0] * o, b[1] + Hh.handY - R.handH / 2, b[2] + inward[1] * o];
    timberBeam(bags, along(ha, -ext), along(hb, ext), R.handW, R.handH);
    for (let k = 0; k <= n; k++) {
      const p = lerp3(a, b, k / n);
      metalBeam(bags, [p[0], p[1] + Hh.handY - 0.04, p[2]], [p[0] + inward[0] * o, p[1] + Hh.handY - 0.04, p[2] + inward[1] * o], 0.035, 0.035);
    }
    const la: V3 = [ha[0] + inward[0] * 0.012, ha[1] - R.handH / 2 - R.ledH / 2 - 0.002, ha[2] + inward[1] * 0.012];
    const lb: V3 = [hb[0] + inward[0] * 0.012, hb[1] - R.handH / 2 - R.ledH / 2 - 0.002, hb[2] + inward[1] * 0.012];
    ledBeam(bags, la, lb, R.ledW, R.ledH);
  } else {
    const ra = addY(along(a, -ext), R.height - R.handH / 2);
    const rb = addY(along(b, ext), R.height - R.handH / 2);
    timberBeam(bags, ra, rb, R.handW, R.handH);
    const la = addY([a[0] + inward[0] * R.ledInset, a[1], a[2] + inward[1] * R.ledInset], R.height - R.handH - R.ledH / 2 - 0.002);
    const lb = addY([b[0] + inward[0] * R.ledInset, b[1], b[2] + inward[1] * R.ledInset], R.height - R.handH - R.ledH / 2 - 0.002);
    ledBeam(bags, la, lb, R.ledW, R.ledH);
    metalBeam(bags, addY(a, R.shoeH / 2 + 0.02), addY(b, R.shoeH / 2 + 0.02), R.shoeW, R.shoeH);
  }

  const gap = (high ? 0.01 : R.bayGap) / len;
  const gb = high ? Hh.glassBottom : R.glassBottom, gt = high ? H - Hh.capH : R.glassTop, gth = high ? Hh.glassT : R.glassT;
  for (let k = 0; k < n; k++) glassPane(bags, a, b, k / n + gap, (k + 1) / n - gap, gb, gt, gth, inward[0], inward[1]);
}

// ---- runs and pads --------------------------------------------------------------------------------------------------------

export const pointAt = (r: WalkRun, c: number, across = 0): V3 => {
  const t = r.to === r.from ? 0 : (c - r.from) / (r.to - r.from);
  const y = r.yFrom + (r.yTo - r.yFrom) * t;
  return r.axis === 'x' ? [c, y, r.across + across] : [r.across + across, y, c];
};

/** Rail lines along a run's two sides (only the flagged ones). */
export function runRails(r: WalkRun): RailLine[] {
  const out: RailLine[] = [];
  for (let s = 0; s < 2; s++) {
    const kind: RailKind = r.rails[s]!;
    if (kind === 'none') continue;
    const off = (s === 0 ? -1 : 1) * r.halfWidth;
    const inward: [number, number] = r.axis === 'x' ? [0, -Math.sign(off)] : [-Math.sign(off), 0];
    out.push({ a: pointAt(r, r.from, off), b: pointAt(r, r.to, off), inward, kind });
  }
  return out;
}

/** Intervals of a pad side that are not a run mouth. */
export function padSideIntervals(p: WalkPad, side: Side): Array<readonly [number, number]> {
  const horizontal = side === 'n' || side === 's';
  const c0 = horizontal ? p.x - p.hx : p.z - p.hz, c1 = horizontal ? p.x + p.hx : p.z + p.hz;
  let out: Array<[number, number]> = [[c0, c1]];
  for (const o of p.open) {
    if (o.side !== side) continue;
    const m0 = o.c - o.half, m1 = o.c + o.half;
    out = out.flatMap(([a, b]): Array<[number, number]> => {
      if (m1 <= a || m0 >= b) return [[a, b]];
      const r: Array<[number, number]> = [];
      if (m0 > a + 1e-6) r.push([a, m0]);
      if (m1 < b - 1e-6) r.push([m1, b]);
      return r;
    });
  }
  return out.filter(([a, b]) => b - a > 0.02);
}

export function padSideLine(p: WalkPad, side: Side, t0: number, t1: number, kind: 'low' | 'high'): RailLine {
  switch (side) {
    case 'n': return { a: [t0, p.y, p.z + p.hz], b: [t1, p.y, p.z + p.hz], inward: [0, -1], kind };
    case 's': return { a: [t0, p.y, p.z - p.hz], b: [t1, p.y, p.z - p.hz], inward: [0, 1], kind };
    case 'e': return { a: [p.x + p.hx, p.y, t0], b: [p.x + p.hx, p.y, t1], inward: [-1, 0], kind };
    case 'w': return { a: [p.x - p.hx, p.y, t0], b: [p.x - p.hx, p.y, t1], inward: [1, 0], kind };
  }
}

export function padRails(p: WalkPlanPad): RailLine[] {
  const out: RailLine[] = [];
  for (const side of ['n', 's', 'e', 'w'] as const) {
    const kind = p.railKinds[side];
    if (!kind) continue;
    for (const [t0, t1] of padSideIntervals(p, side)) out.push(padSideLine(p, side, t0, t1, kind));
  }
  return out;
}

/** Timber deck slab of a flat or sloped run (top at the centre-line height), with its metal edge beams and cross ribs. */
export function deckRun(bags: WalkBags, r: WalkRun, opts: { slabT: number; beamH: number; beamW: number; ribPitch: number }): void {
  const hw = r.halfWidth;
  // the slab hangs from the walkable height so its top face is the walking surface
  timberBeam(bags, addY(pointAt(r, r.from, 0), -opts.slabT / 2), addY(pointAt(r, r.to, 0), -opts.slabT / 2), 2 * hw - 0.02, opts.slabT);
  for (const s of [-1, 1]) {
    metalBeam(bags, addY(pointAt(r, r.from, s * (hw - opts.beamW / 2)), -opts.slabT - opts.beamH / 2), addY(pointAt(r, r.to, s * (hw - opts.beamW / 2)), -opts.slabT - opts.beamH / 2), opts.beamW, opts.beamH);
  }
  const len = Math.abs(r.to - r.from);
  const dir = Math.sign(r.to - r.from) || 1;
  const nr = Math.max(1, Math.round(len / opts.ribPitch));
  for (let k = 0; k <= nr; k++) {
    const c = r.from + dir * (len * k) / nr;
    metalBeam(bags, addY(pointAt(r, c, -hw + 0.04), -opts.slabT - 0.025), addY(pointAt(r, c, hw - 0.04), -opts.slabT - 0.025), 0.035, 0.05);
  }
}

/** Open-riser timber stair: treads of ~0.17 m rise, two sloped stainless stringer plates. */
export function stairRun(bags: WalkBags, r: WalkRun): void {
  const hw = r.halfWidth;
  const rise = Math.abs(r.yTo - r.yFrom);
  const n = Math.max(2, Math.ceil(rise / 0.17));
  const dir = Math.sign(r.to - r.from) || 1;
  const step = (Math.abs(r.to - r.from)) / n;
  for (let j = 0; j < n; j++) {
    const c0 = r.from + dir * step * j, c1 = c0 + dir * step;
    const cm = (c0 + c1) / 2;
    timberBeam(bags, addY(pointAt(r, cm, -hw + 0.045), -0.02), addY(pointAt(r, cm, hw - 0.045), -0.02), step - 0.012, 0.04);
  }
  for (const s of [-1, 1]) {
    const o = s * (hw - 0.03);
    metalBeam(bags, addY(pointAt(r, r.from, o), -0.2), addY(pointAt(r, r.to, o), -0.2), 0.03, 0.3);
  }
}

/** Flat pad: timber slab with metal fascia beams on its four edges. */
export function padSlab(bags: WalkBags, p: WalkPad, opts: { slabT: number; beamH: number }): void {
  const t = opts.slabT;
  timberBeam(bags, [p.x - p.hx, p.y - t / 2, p.z], [p.x + p.hx, p.y - t / 2, p.z], 2 * p.hz, t);
  const b = 0.02;
  metalBeam(bags, [p.x - p.hx, p.y - t - opts.beamH / 2, p.z - p.hz + b / 2], [p.x + p.hx, p.y - t - opts.beamH / 2, p.z - p.hz + b / 2], b, opts.beamH);
  metalBeam(bags, [p.x - p.hx, p.y - t - opts.beamH / 2, p.z + p.hz - b / 2], [p.x + p.hx, p.y - t - opts.beamH / 2, p.z + p.hz - b / 2], b, opts.beamH);
  metalBeam(bags, [p.x - p.hx + b / 2, p.y - t - opts.beamH / 2, p.z - p.hz], [p.x - p.hx + b / 2, p.y - t - opts.beamH / 2, p.z + p.hz], b, opts.beamH);
  metalBeam(bags, [p.x + p.hx - b / 2, p.y - t - opts.beamH / 2, p.z - p.hz], [p.x + p.hx - b / 2, p.y - t - opts.beamH / 2, p.z + p.hz], b, opts.beamH);
}

// ---- spline ribbons ---------------------------------------------------------------------------------------------------------

/**
 * Prism along stations i0..i1 (inclusive): cross-section from lateral offset o0 to o1 (positive = left of travel, normal
 * (-tz, tx)) and from yb to yt relative to each station's deck height. Faces are separate strips so edges stay crisp. With
 * `timber` the UVs are metres on the plank tile (grain along the path).
 */
export function pathPrism(
  target: THREE.BufferGeometry[], st: readonly PathStation[], i0: number, i1: number, o0: number, o1: number, yb: number, yt: number,
  timber?: { ou: number; ov: number },
): void {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let s = 0;
  const arc: number[] = [];
  for (let i = i0; i <= i1; i++) {
    if (i > i0) s += Math.hypot(st[i]!.x - st[i - 1]!.x, st[i]!.z - st[i - 1]!.z);
    arc.push(s);
  }
  const P = (i: number, o: number, y: number): V3 => {
    const q = st[i]!;
    return [q.x - q.tz * o, q.y + y, q.z + q.tx * o];
  };
  // strip between lines (oa, ya) and (ob, yb2); outward hint decides the winding
  const strip = (oa: number, ya: number, ob: number, yb2: number, out: V3, vOf: (k: number) => [number, number]): void => {
    const base = pos.length / 3;
    for (let i = i0; i <= i1; i++) {
      const k = i - i0;
      const pa = P(i, oa, ya), pb = P(i, ob, yb2);
      pos.push(...pa, ...pb);
      const [va, vb] = vOf(k);
      const u = timber ? arc[k]! / TILE_U + timber.ou : 0;
      uv.push(u, timber ? va : 0, u, timber ? vb : 0);
    }
    // winding from the first quad against the outward direction
    const p0 = P(i0, oa, ya), p1 = P(i0, ob, yb2), p2 = P(Math.min(i1, i0 + 1), oa, ya);
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const nrm = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const flip = nrm[0]! * out[0] + nrm[1]! * out[1] + nrm[2]! * out[2] < 0;
    for (let k = 0; k + 1 <= i1 - i0; k++) {
      const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
      if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, c, b, d);
    }
  };
  const across = (k: number): [number, number] => { void k; return [(o0 + 100) / TILE_V + (timber?.ov ?? 0), (o1 + 100) / TILE_V + (timber?.ov ?? 0)]; };
  const hgt = (): [number, number] => [(timber?.ov ?? 0), (timber?.ov ?? 0) + (yt - yb) / TILE_V];
  strip(o0, yt, o1, yt, [0, 1, 0], across);       // top
  strip(o0, yb, o1, yb, [0, -1, 0], across);       // bottom
  const nx = -st[i0]!.tz, nz = st[i0]!.tx;
  strip(o0, yb, o0, yt, [-nx, 0, -nz], hgt);        // side at the smaller offset: outward = -normal
  strip(o1, yb, o1, yt, [nx, 0, nz], hgt);          // side at the larger offset: outward = +normal
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  target.push(g);
}

/** Timber disc (round pad slab) centred at (x, y, z) of radius r, thickness t, top at y. UVs are metres on the plank tile. */
export function timberDisc(bags: WalkBags, x: number, y: number, z: number, r: number, t: number): void {
  const g = new THREE.CylinderGeometry(r, r, t, 48, 1, false);
  const p = g.getAttribute('position') as THREE.BufferAttribute, nr = g.getAttribute('normal') as THREE.BufferAttribute, uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const ou = bags.rnd(), ov = bags.rnd();
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(nr.getY(i)) > 0.9) uv.setXY(i, p.getX(i) / TILE_U + ou, p.getZ(i) / TILE_V + ov);
    else uv.setXY(i, (Math.atan2(p.getZ(i), p.getX(i)) * r) / TILE_U + ou, (p.getY(i) + t / 2) / TILE_V + ov);
  }
  g.translate(x, y - t / 2, z);
  bags.timber.push(g);
}

// ---- materials ------------------------------------------------------------------------------------------------------------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Procedural deck map: muted warm oiled oak going silver at the surface. 8 boards of 0.14 m across a 1.12 m tile, tile-periodic
 * fine grain (low contrast), rare faint knots, butt joints and soft shadow gaps.
 */
export function makeOakTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const W = 1536, H = 768, boards = 8, bh = H / boards;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const rnd = rng(77031);
  for (let b = 0; b < boards; b++) {
    const y0 = b * bh;
    const l = 47 + rnd() * 6, sat = 19 + rnd() * 7, hue = 33 + rnd() * 5;
    g.fillStyle = `hsl(${hue},${sat}%,${l}%)`;
    g.fillRect(0, y0, W, bh);
    // long fine grain, wobbling along u (periodic so the repeat is seamless)
    for (let k = 0; k < 90; k++) {
      const yy = y0 + 1 + rnd() * (bh - 2), amp = 0.3 + rnd() * 1.1, f = 1 + Math.floor(rnd() * 4), ph = rnd() * 6.28;
      g.strokeStyle = rnd() < 0.6 ? `rgba(92,70,48,${0.04 + rnd() * 0.07})` : `rgba(226,212,190,${0.04 + rnd() * 0.07})`;
      g.lineWidth = 0.5 + rnd() * 0.9;
      g.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const y = yy + Math.sin((x / W) * 6.2832 * f + ph) * amp;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    if (rnd() < 0.25) {
      const kx = rnd() * W, ky = y0 + bh * (0.3 + rnd() * 0.4), kr = 2 + rnd() * 3;
      g.fillStyle = 'rgba(88,66,46,0.28)';
      g.beginPath(); g.ellipse(kx, ky, kr * 1.6, kr * 0.7, 0, 0, 6.2832); g.fill();
    }
    const jx = rnd() * W;
    g.fillStyle = 'rgba(70,56,42,0.45)';
    g.fillRect(jx, y0, 2, bh);
    g.fillStyle = 'rgba(64,50,38,0.55)';
    g.fillRect(0, y0, W, 2.2);
    g.fillStyle = 'rgba(240,228,205,0.07)';
    g.fillRect(0, y0 + 2.2, W, 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

export interface WalkMaterials {
  timber: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}
export function createWalkMaterials(renderer: THREE.WebGLRenderer): WalkMaterials {
  const timber = new THREE.MeshStandardMaterial({
    name: 'metroDeepWalkOak', map: makeOakTexture(renderer), color: 0xffffff, roughness: 0.62, metalness: 0, envMapIntensity: 0.75,
  });
  const metal = new THREE.MeshStandardMaterial({
    name: 'metroDeepWalkStainless', color: 0xd0d5d9, metalness: 1.0, roughness: 0.3, envMapIntensity: 1.15,
  });
  return { timber, metal };
}
