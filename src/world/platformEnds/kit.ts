import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildContext } from '../../core/types';

/** Shared geometry kit for the platform-end module: vertex-coloured, non-indexed parts merged per material. */
export type Geo = THREE.BufferGeometry;
export type V3 = readonly [number, number, number];

const _c = new THREE.Color();

/** Strip to position/normal/uv, non-indexed, and bake a (linear) vertex colour scaled by `gain`. */
export function prep(g: Geo, hex: number, gain = 1): Geo {
  const r = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(r.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') r.deleteAttribute(k);
  const n = r.getAttribute('position').count;
  if (!r.getAttribute('uv')) r.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!r.getAttribute('normal')) r.computeVertexNormals();
  _c.setHex(hex);
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = _c.r * gain;
    a[i * 3 + 1] = _c.g * gain;
    a[i * 3 + 2] = _c.b * gain;
  }
  r.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return r;
}

/** Accumulates parts for ONE material (one draw call). */
export class Bag {
  readonly parts: Geo[] = [];
  /** Running vertex count (so callers can address a part inside the merged buffer). */
  count = 0;
  /** Adds a part (transformed by `m` when given) and returns its first vertex index in the merged buffer. */
  add(g: Geo, hex = 0xffffff, m?: THREE.Matrix4, gain = 1): number {
    const p = prep(g, hex, gain);
    if (m) p.applyMatrix4(m);
    const start = this.count;
    this.count += p.getAttribute('position').count;
    this.parts.push(p);
    return start;
  }
  /** Merge; when `tile` is given, project world-scale UVs (one texture repeat per `tile` metres). */
  build(ctx: BuildContext, tile?: number): Geo {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('platformEnds: mergeGeometries failed (' + this.parts.length + ' parts)');
    const out = tile ? ctx.materials.applyWorldUVs(merged, tile) : merged;
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }
}

export interface Bags {
  paint: Bag;
  brass: Bag;
  stone: Bag;
  brick: Bag;
  slate: Bag;
  enamel: Bag;
  glow: Bag;
  glass: Bag;
  goods: Bag;
  lens: Bag;
  mirror: Bag;
}
export const makeBags = (): Bags => ({
  paint: new Bag(),
  brass: new Bag(),
  stone: new Bag(),
  brick: new Bag(),
  slate: new Bag(),
  enamel: new Bag(),
  glow: new Bag(),
  glass: new Bag(),
  goods: new Bag(),
  lens: new Bag(),
  mirror: new Bag(),
});

// ----------------------------------------------------------------------------------------------- shapes
export function box(xa: number, xb: number, ya: number, yb: number, za: number, zb: number): Geo {
  const [x0, x1] = xa <= xb ? [xa, xb] : [xb, xa];
  const [y0, y1] = ya <= yb ? [ya, yb] : [yb, ya];
  const [z0, z1] = za <= zb ? [za, zb] : [zb, za];
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
/** Square-ish bar from a to b (w across, d deep). */
export function strut(a: V3, b: V3, w: number, d = w): Geo {
  _a.set(a[0], a[1], a[2]);
  _b.set(b[0], b[1], b[2]);
  const dir = _b.clone().sub(_a);
  const len = dir.length();
  const g = new THREE.BoxGeometry(w, len, d);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

/** Vertical cylinder standing on y. */
export function cyl(r: number, h: number, x: number, y: number, z: number, seg = 12, rTop = r): Geo {
  const g = new THREE.CylinderGeometry(rTop, r, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}
/** Cylinder with axis along z, centred on (x, y, z). */
export function zcyl(r: number, len: number, x: number, y: number, z: number, seg = 12): Geo {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
/** Cylinder with axis along x, centred on (x, y, z). */
export function xcyl(r: number, len: number, x: number, y: number, z: number, seg = 12): Geo {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
export function ball(r: number, x: number, y: number, z: number, seg = 10): Geo {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2));
  g.translate(x, y, z);
  return g;
}
export function lathe(pts: [number, number][], seg = 14): Geo {
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

/** Matrix: translate * rotateY(ry). */
export function at(x: number, y: number, z: number, ry = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(ry);
  m.setPosition(x, y, z);
  return m;
}
export const mul = (a: THREE.Matrix4, b: THREE.Matrix4): THREE.Matrix4 => a.clone().multiply(b);

/** Flat panel facing +z (ry = 0), -z (PI), +x (PI/2) or -x (-PI/2) with atlas UV rect [u0, v0, u1, v1]. */
export function plate(w: number, h: number, uv: readonly [number, number, number, number] | null, cx: number, cy: number, cz: number, ry: number): Geo {
  const g = new THREE.PlaneGeometry(w, h);
  if (uv) {
    const a = g.getAttribute('uv');
    for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  }
  g.rotateY(ry);
  g.translate(cx, cy, cz);
  return g;
}

/** Hipped roof over a rectangle, ridge along z. */
export function hipRoof(x0: number, x1: number, z0: number, z1: number, yE: number, yR: number): Geo {
  const xc = (x0 + x1) / 2;
  const hw = (x1 - x0) / 2;
  const P: V3[] = [
    [x0, yE, z0], [x1, yE, z0], [x1, yE, z1], [x0, yE, z1], // 0..3 eaves
    [xc, yR, z0 + hw], [xc, yR, z1 - hw], // 4,5 ridge
  ];
  const tris: [number, number, number][] = [
    [0, 4, 3], [4, 5, 3], // west
    [1, 2, 5], [1, 5, 4], // east
    [0, 1, 4], // south hip
    [2, 3, 5], // north hip
  ];
  return fromTris(P, tris);
}

/** Gabled roof (ridge along z): two slopes only (gable ends are brick, added by the caller). */
export function gableRoof(x0: number, x1: number, z0: number, z1: number, yE: number, yR: number): Geo {
  const xc = (x0 + x1) / 2;
  const P: V3[] = [[x0, yE, z0], [xc, yR, z0], [x1, yE, z0], [x0, yE, z1], [xc, yR, z1], [x1, yE, z1]];
  return fromTris(P, [[0, 1, 4], [0, 4, 3], [1, 2, 5], [1, 5, 4]]);
}

/** Vertical triangle (gable end) in the plane z = z, apex at (xc, yR). */
export function gableEnd(x0: number, x1: number, y0: number, yR: number, z: number): Geo {
  return fromTris([[x0, y0, z], [x1, y0, z], [(x0 + x1) / 2, yR, z]], [[0, 1, 2], [1, 0, 2]]);
}

function fromTris(P: V3[], tris: [number, number, number][]): Geo {
  const pos: number[] = [];
  for (const t of tris) for (const i of t) pos.push(...P[i]!);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
