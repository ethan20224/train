import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary, MaterialName } from '../../core/types';

/** 2D profile point: (a, b) in the sweep frame. */
export type P2 = readonly [number, number];

export const v3 = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** noUncheckedIndexedAccess helper. */
export function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of range`);
  return v;
}

// ---------------------------------------------------------------------------------------------
// GeoBag: collects geometry for ONE material, normalises attributes, assigns world UVs, merges.
// ---------------------------------------------------------------------------------------------
export class GeoBag {
  private readonly parts: THREE.BufferGeometry[] = [];

  constructor(
    private readonly lib: MaterialLibrary,
    readonly mat: MaterialName,
    private readonly tile: number = lib.tileSize(mat),
  ) {}

  /**
   * Adds a geometry (cloned, never mutated).
   *  - m: optional transform to world space.
   *  - uv 'world' (default): box-projection UVs from world positions; 'keep': use the geometry's own uv.
   *  - mirrorX: mirror across x = 0 AFTER m (winding is fixed), for symmetric west/east copies.
   */
  add(g: THREE.BufferGeometry, m?: THREE.Matrix4, uv: 'world' | 'keep' = 'world', mirrorX = false): this {
    let geo = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (m) geo.applyMatrix4(m);
    if (mirrorX) mirrorXInPlace(geo);
    if (uv === 'world') geo = this.lib.applyWorldUVs(geo, this.tile);
    else if (!geo.getAttribute('uv')) throw new Error('GeoBag.add uv=keep but geometry has no uv');
    this.parts.push(geo);
    return this;
  }

  get size(): number {
    return this.parts.length;
  }

  merge(): THREE.BufferGeometry | null {
    if (this.parts.length === 0) return null;
    const out = this.parts.length === 1 ? at(this.parts, 0) : mergeGeometries(this.parts, false);
    if (!out) throw new Error(`mergeGeometries failed for ${this.mat}`);
    if (this.parts.length > 1) for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return out;
  }
}

function mirrorXInPlace(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, -pos.getX(i));
    nor.setX(i, -nor.getX(i));
  }
  for (const name of ['position', 'normal', 'uv']) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const s = a.itemSize;
    for (let t = 0; t + 2 < a.count; t += 3) {
      for (let k = 0; k < s; k++) {
        const x1 = a.getComponent(t + 1, k);
        a.setComponent(t + 1, k, a.getComponent(t + 2, k));
        a.setComponent(t + 2, k, x1);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Profile sweeping: the workhorse for every molding (cornice, architrave, rib, rail, ...)
// ---------------------------------------------------------------------------------------------
export interface Frame {
  /** origin of the profile plane at this sample */
  o: THREE.Vector3;
  /** profile x axis ("a") in world/local space (unit) */
  a: THREE.Vector3;
  /** profile y axis ("b") (unit) */
  b: THREE.Vector3;
}

export interface SweepOpts {
  /** include the closing segment last -> first (default false) */
  closed?: boolean;
  /** add triangulated end caps (polygon = the profile) */
  caps?: boolean;
  /** max angle (deg) between adjacent profile segments that still get smooth normals (default 35) */
  smooth?: number;
  /** number of times u (path length, in meters) wraps, only used for uv; irrelevant when world UVs are used */
}

/**
 * Sweeps a 2D profile (CCW travel => outward normal on the right of travel, i.e. (dy, -dx)) along a list of
 * frames. Triangle winding is auto-corrected from the intended normal, so orientation mistakes in the
 * frames cannot flip faces. Output is non-indexed (position, normal, uv).
 */
export function sweep(profile: readonly P2[], frames: readonly Frame[], opts: SweepOpts = {}): THREE.BufferGeometry {
  const n = profile.length;
  const segCount = opts.closed ? n : n - 1;
  const smoothCos = Math.cos(THREE.MathUtils.degToRad(opts.smooth ?? 35));
  // 2D segment normals
  const segN: THREE.Vector2[] = [];
  for (let i = 0; i < segCount; i++) {
    const p = at(profile, i);
    const q = at(profile, (i + 1) % n);
    segN.push(new THREE.Vector2(q[1] - p[1], -(q[0] - p[0])).normalize());
  }
  const startN = (i: number): THREE.Vector2 => {
    const cur = at(segN, i);
    const prevIdx = i - 1 >= 0 ? i - 1 : opts.closed ? segCount - 1 : -1;
    if (prevIdx < 0) return cur;
    const prev = at(segN, prevIdx);
    return prev.dot(cur) >= smoothCos ? prev.clone().add(cur).normalize() : cur;
  };
  const endN = (i: number): THREE.Vector2 => {
    const cur = at(segN, i);
    const nextIdx = i + 1 < segCount ? i + 1 : opts.closed ? 0 : -1;
    if (nextIdx < 0) return cur;
    const next = at(segN, nextIdx);
    return next.dot(cur) >= smoothCos ? next.clone().add(cur).normalize() : cur;
  };

  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const pt = (f: Frame, p: P2): THREE.Vector3 => f.o.clone().addScaledVector(f.a, p[0]).addScaledVector(f.b, p[1]);
  const nv = (f: Frame, q: THREE.Vector2): THREE.Vector3 => f.a.clone().multiplyScalar(q.x).addScaledVector(f.b, q.y).normalize();

  const emit = (
    p0: THREE.Vector3, n0: THREE.Vector3, u0: number, w0: number,
    p1: THREE.Vector3, n1: THREE.Vector3, u1: number, w1: number,
    p2: THREE.Vector3, n2: THREE.Vector3, u2: number, w2: number,
  ): void => {
    const e1 = p1.clone().sub(p0);
    const e2 = p2.clone().sub(p0);
    const c = e1.cross(e2);
    if (c.lengthSq() < 1e-14) return;
    const avg = n0.clone().add(n1).add(n2);
    if (c.dot(avg) >= 0) {
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      nor.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
      uvs.push(u0, w0, u1, w1, u2, w2);
    } else {
      pos.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
      nor.push(n0.x, n0.y, n0.z, n2.x, n2.y, n2.z, n1.x, n1.y, n1.z);
      uvs.push(u0, w0, u2, w2, u1, w1);
    }
  };

  let dist = 0;
  const profLen: number[] = [0];
  for (let i = 0; i < n; i++) {
    const p = at(profile, i);
    const q = at(profile, (i + 1) % n);
    profLen.push(at(profLen, i) + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  for (let s = 0; s + 1 < frames.length; s++) {
    const f0 = at(frames, s);
    const f1 = at(frames, s + 1);
    const d0 = dist;
    const d1 = dist + f0.o.distanceTo(f1.o);
    dist = d1;
    for (let i = 0; i < segCount; i++) {
      const pa = at(profile, i);
      const pb = at(profile, (i + 1) % n);
      const nA = startN(i);
      const nB = endN(i);
      const a0 = pt(f0, pa), b0 = pt(f0, pb), a1 = pt(f1, pa), b1 = pt(f1, pb);
      const na0 = nv(f0, nA), nb0 = nv(f0, nB), na1 = nv(f1, nA), nb1 = nv(f1, nB);
      const vA = at(profLen, i), vB = at(profLen, i + 1);
      emit(a0, na0, d0, vA, b0, nb0, d0, vB, b1, nb1, d1, vB);
      emit(a0, na0, d0, vA, b1, nb1, d1, vB, a1, na1, d1, vA);
    }
  }

  if (opts.caps && frames.length >= 2) {
    const contour = profile.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const capAt = (f: Frame, dir: THREE.Vector3): void => {
      for (const t of tris) {
        const ps = t.map((k) => pt(f, at(profile, k)));
        emit(at(ps, 0), dir, 0, 0, at(ps, 1), dir, 1, 0, at(ps, 2), dir, 0, 1);
      }
    };
    const f0 = at(frames, 0);
    const fl = at(frames, frames.length - 1);
    capAt(f0, at(frames, 1).o.clone().sub(f0.o).normalize().negate());
    capAt(fl, fl.o.clone().sub(at(frames, frames.length - 2).o).normalize());
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** Straight path: two frames. */
export function lineFrames(p0: THREE.Vector3, p1: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): Frame[] {
  return [
    { o: p0.clone(), a: a.clone(), b: b.clone() },
    { o: p1.clone(), a: a.clone(), b: b.clone() },
  ];
}

/**
 * Circular arc path about `center` in the plane spanned by (ex, ey), from angle a0 to a1 (radians).
 * Profile 'a' axis = radial (outward if sign = 1, inward if -1) and 'b' = bAxis.
 */
export function arcFrames(
  center: THREE.Vector3, ex: THREE.Vector3, ey: THREE.Vector3, r: number, a0: number, a1: number,
  segs: number, bAxis: THREE.Vector3, sign: 1 | -1 = 1,
): Frame[] {
  const out: Frame[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = a0 + ((a1 - a0) * i) / segs;
    const radial = ex.clone().multiplyScalar(Math.cos(t)).addScaledVector(ey, Math.sin(t));
    out.push({
      o: center.clone().addScaledVector(radial, r),
      a: radial.clone().multiplyScalar(sign),
      b: bAxis.clone(),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shapes & misc geometry
// ---------------------------------------------------------------------------------------------

/**
 * Round-headed opening outline in the (u, v) plane: sill at v0, straight jambs to vSpring, semicircular head of
 * radius w/2 (grown by `grow` on every side). Orientation is arbitrary (Three normalises holes).
 */
export function archShape(cu: number, v0: number, vSpring: number, w: number, grow = 0, segs = 40): THREE.Shape {
  const r = w / 2 + grow;
  const s = new THREE.Shape();
  s.moveTo(cu - r, v0 - grow);
  s.lineTo(cu - r, vSpring);
  s.absarc(cu, vSpring, r, Math.PI, 0, true);
  s.lineTo(cu + r, v0 - grow);
  s.closePath();
  void segs;
  return s;
}

export function archPath(cu: number, v0: number, vSpring: number, w: number, grow = 0): THREE.Path {
  const r = w / 2 + grow;
  const s = new THREE.Path();
  s.moveTo(cu - r, v0 - grow);
  s.lineTo(cu - r, vSpring);
  s.absarc(cu, vSpring, r, Math.PI, 0, true);
  s.lineTo(cu + r, v0 - grow);
  s.closePath();
  return s;
}

/** Axis-aligned box from min/max corners. */
export function boxMM(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Box centred at origin of size (w,h,d) transformed by position/rotation Z (radians). */
export function rotatedBoxZ(w: number, h: number, d: number, cx: number, cy: number, cz: number, rotZ: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateZ(rotZ);
  g.translate(cx, cy, cz);
  return g;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
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
 * Lathe a closed/open profile of (radius, y) around Y with ANALYTIC uv in meters: u = angle * radius_ref / tile,
 * v = arclength along the profile / tile. Normals via LatheGeometry. Profile order bottom->top.
 */
export function latheMeters(pts: readonly P2[], segments: number, tile: number, uRepeats = 3): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), segments);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // cumulative profile length
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const p = at(pts, i - 1);
    const q = at(pts, i);
    cum.push(at(cum, i - 1) + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j < pts.length; j++) {
      const k = i * pts.length + j;
      uv.setXY(k, (i / segments) * uRepeats, at(cum, j) / tile);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Soup: tiny triangle-soup builder with winding fixed from the supplied normals.
// ---------------------------------------------------------------------------------------------
export class Soup {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];

  /** Triangle with per-vertex normals (used to fix winding) and uvs. */
  tri(
    a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
    na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3,
    ua: P2 = [0, 0], ub: P2 = [1, 0], uc: P2 = [0, 1],
  ): void {
    const e1 = b.clone().sub(a);
    const e2 = c.clone().sub(a);
    const cr = e1.cross(e2);
    if (cr.lengthSq() < 1e-14) return;
    const avg = na.clone().add(nb).add(nc);
    const flip = cr.dot(avg) < 0;
    const order = flip ? [a, c, b] : [a, b, c];
    const nrm = flip ? [na, nc, nb] : [na, nb, nc];
    const uvv = flip ? [ua, uc, ub] : [ua, ub, uc];
    for (let i = 0; i < 3; i++) {
      const p = at(order, i);
      const n = at(nrm, i);
      const t = at(uvv, i);
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(t[0], t[1]);
    }
  }

  /** Quad a,b,c,d in loop order. */
  quad(
    a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3,
    na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3, nd: THREE.Vector3,
    ua: P2 = [0, 0], ub: P2 = [1, 0], uc: P2 = [1, 1], ud: P2 = [0, 1],
  ): void {
    this.tri(a, b, c, na, nb, nc, ua, ub, uc);
    this.tri(a, c, d, na, nc, nd, ua, uc, ud);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

/**
 * Surface of revolution around Y with an arbitrary radius function r(phi, y). Smooth analytic-ish normals by
 * central differences with wrap-around (no seam). UV: u = phi/2pi * uRepeats, v = y / tile.
 */
export function gridLathe(
  nPhi: number, ys: readonly number[], rFn: (phi: number, y: number) => number, uRepeats: number, tile: number,
  phis?: readonly number[],
): THREE.BufferGeometry {
  const nY = ys.length;
  const P: THREE.Vector3[][] = [];
  for (let i = 0; i < nPhi; i++) {
    const phi = phis ? at(phis, i) : (i / nPhi) * Math.PI * 2;
    const col: THREE.Vector3[] = [];
    for (let j = 0; j < nY; j++) {
      const y = at(ys, j);
      const r = rFn(phi, y);
      col.push(v3(r * Math.cos(phi), y, r * Math.sin(phi)));
    }
    P.push(col);
  }
  const get = (i: number, j: number): THREE.Vector3 => at(at(P, ((i % nPhi) + nPhi) % nPhi), j);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= nPhi; i++) {
    for (let j = 0; j < nY; j++) {
      const p = get(i, j);
      const dPhi = get(i + 1, j).clone().sub(get(i - 1, j));
      const dY = get(i, Math.min(nY - 1, j + 1)).clone().sub(get(i, Math.max(0, j - 1)));
      const n = dY.cross(dPhi).normalize();
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(((phis ? at(phis, i % nPhi) + (i === nPhi ? Math.PI * 2 : 0) : (i / nPhi) * Math.PI * 2) / (Math.PI * 2)) * uRepeats, at(ys, j) / tile);
    }
  }
  const idx: number[] = [];
  const stride = nY;
  let flip = false;
  {
    // decide winding from the first quad
    const a = get(0, 0), b = get(1, 0), c = get(0, 1);
    const cr = b.clone().sub(a).cross(c.clone().sub(a));
    const n0 = new THREE.Vector3(at(nor, 0), at(nor, 1), at(nor, 2));
    flip = cr.dot(n0) < 0;
  }
  for (let i = 0; i < nPhi; i++) {
    for (let j = 0; j + 1 < nY; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + j + 1;
      const d = i * stride + j + 1;
      if (flip) idx.push(a, c, b, a, d, c);
      else idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
