import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MaterialLibrary } from '../../core/types';
import { latheMeters, type P2 } from '../concourse/geo';

/**
 * Hotel geometry kit: a `Bucket` collects transformed geometry for ONE material and merges it into a single draw
 * call; small parametric builders (rounded boxes, lathes, tubes) used by every piece of furniture.
 */

export class Bucket {
  private readonly parts: THREE.BufferGeometry[] = [];

  /**
   * @param lib   when given, UVs are re-projected from WORLD positions (tile = meters per texture repeat); otherwise
   *              the geometry's own uv is kept (atlas materials / analytic UVs).
   * @param color paint vertex colours (the material must set vertexColors).
   */
  constructor(
    private readonly lib: MaterialLibrary | null,
    private readonly tile = 1,
    readonly vertexColors = false,
  ) {}

  add(g: THREE.BufferGeometry, m?: THREE.Matrix4, color?: THREE.ColorRepresentation): this {
    let geo = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    if (m) geo.applyMatrix4(m);
    if (this.lib) geo = this.lib.applyWorldUVs(geo, this.tile);
    else if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    if (this.vertexColors) {
      const c = new THREE.Color(color ?? 0xffffff);
      const n = geo.getAttribute('position').count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    this.parts.push(geo);
    return this;
  }

  get size(): number {
    return this.parts.length;
  }

  merge(): THREE.BufferGeometry | null {
    if (this.parts.length === 0) return null;
    const out = this.parts.length === 1 ? this.parts[0]! : mergeGeometries(this.parts, false);
    if (!out) throw new Error('hotel Bucket merge failed');
    if (this.parts.length > 1) for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    return out;
  }
}

/** Transform helper: translate + yaw (+ optional uniform scale). */
export function xf(x: number, y: number, z: number, yaw = 0, s = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s));
}

/** Transform = place * local, where `local` is any Matrix4. */
export function mul(a: THREE.Matrix4, b: THREE.Matrix4): THREE.Matrix4 {
  return a.clone().multiply(b);
}

/** Axis-aligned rounded box from min/max corners (radius clamped). */
export function rbox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.02, seg = 2): THREE.BufferGeometry {
  const w = x1 - x0;
  const h = y1 - y0;
  const d = z1 - z0;
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.max(rr, 0.001));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Lathe around local Y from a (radius, y) profile (bottom -> top). UV analytic, 1 repeat per `tile` m. */
export function lathe(pts: readonly P2[], seg = 24, tile = 1): THREE.BufferGeometry {
  return latheMeters(pts, seg, tile, 1);
}

/** Cylinder between two points. */
export function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8, r2 = r): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

export function sphere(x: number, y: number, z: number, r: number, w = 12, h = 8): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, w, h);
  g.translate(x, y, z);
  return g;
}

/** Horizontal cylinder along local x / z centred at (x,y,z). */
export function cylX(x: number, y: number, z: number, r: number, len: number, seg = 14): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
export function cylZ(x: number, y: number, z: number, r: number, len: number, seg = 14): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Closed rounded-rectangle outline in the XZ plane, extruded upward by `h` with a soft bevel. y from y0. */
export function slab(cx: number, cz: number, w: number, d: number, y0: number, h: number, corner: number, bevel = 0.006): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const hw = w / 2 - bevel;
  const hd = d / 2 - bevel;
  const c = Math.min(corner, hw, hd);
  s.moveTo(-hw + c, -hd);
  s.lineTo(hw - c, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + c);
  s.lineTo(hw, hd - c);
  s.quadraticCurveTo(hw, hd, hw - c, hd);
  s.lineTo(-hw + c, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - c);
  s.lineTo(-hw, -hd + c);
  s.quadraticCurveTo(-hw, -hd, -hw + c, -hd);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(h - 2 * bevel, 0.001), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); // shape (x, y) -> world (x, -z); extrusion +z -> +y
  g.translate(cx, y0 + bevel, cz);
  return g;
}

/** Stretches `g` (assumed unit-circle based) - utility for oval trays. */
export function scaled(g: THREE.BufferGeometry, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  g.scale(sx, sy, sz);
  return g;
}

/** Maps every uv of `g` into the atlas rect (u0,v0)-(u1,v1) assuming it currently spans 0..1. */
export function atlasUV(g: THREE.BufferGeometry, r: { u0: number; v0: number; u1: number; v1: number }): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  return g;
}

/** Counts draw calls / triangles of an object tree (instancing aware). */
export function countStats(root: THREE.Object3D): { calls: number; tris: number } {
  let calls = 0;
  let tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    const t = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    tris += t * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
    calls++;
  });
  return { calls, tris: Math.round(tris) };
}

export { mergeGeometries };
