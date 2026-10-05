import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildContext, PBRMaterial } from '../../core/types';

/** Strip a geometry down to position/normal/uv, non-indexed, so everything merges. */
export function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const r = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(r.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') r.deleteAttribute(k);
  if (!r.getAttribute('uv')) r.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(r.getAttribute('position').count * 2), 2));
  if (!r.getAttribute('normal')) r.computeVertexNormals();
  return r;
}

/** Merge parts (already positioned) and project world-scale UVs. */
export function finish(ctx: BuildContext, parts: THREE.BufferGeometry[], material: Parameters<BuildContext['materials']['tileSize']>[0]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map(plain), false);
  if (!merged) throw new Error('shed: mergeGeometries failed');
  const out = ctx.materials.applyWorldUVs(merged, ctx.materials.tileSize(material));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** Axis aligned box by extents. */
export function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Beam in the XY plane from p0 to p1 (thickness w in-plane, depth d along z), centred at z = zc. */
export function beam(p0: readonly [number, number], p1: readonly [number, number], w: number, d: number, zc = 0, overshoot = 0.03): THREE.BufferGeometry {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy) + overshoot * 2;
  const g = new THREE.BoxGeometry(len, w, d);
  g.rotateZ(Math.atan2(dy, dx));
  g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, zc);
  return g;
}

/** Cylinder with its axis along z. */
export function zCylinder(r: number, len: number, x: number, y: number, z: number, seg = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Sheet of a circular arc (in the XY plane) extruded along z. th measured from +Y toward +X. */
export function arcSheet(cy: number, r: number, th0: number, th1: number, segs: number, z0: number, z1: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = th0 + ((th1 - th0) * i) / segs;
    const s = Math.sin(t);
    const c = Math.cos(t);
    pos.push(r * s, cy + r * c, z0, r * s, cy + r * c, z1);
    nor.push(s, c, 0, s, c, 0);
    uv.push(i / segs, 0, i / segs, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Painted black-green cast iron (clone of the library material; shared between shed pieces). */
export function ironPaint(ctx: BuildContext): PBRMaterial {
  const m = ctx.materials.get('castIron').clone();
  m.name = 'shedIron';
  m.color.set(0x24342b);
  m.metalness = 0.45;
  m.roughness = 0.78;
  return m;
}

export function tinted(ctx: BuildContext, name: Parameters<BuildContext['materials']['get']>[0], color: number, extra?: Partial<{ roughness: number; metalness: number }>): PBRMaterial {
  const m = ctx.materials.get(name).clone();
  m.color.multiply(new THREE.Color(color));
  if (extra?.roughness !== undefined) m.roughness = extra.roughness;
  if (extra?.metalness !== undefined) m.metalness = extra.metalness;
  return m;
}

export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], cast: boolean, receive = true): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mx, i) => m.setMatrixAt(i, mx));
  m.instanceMatrix.needsUpdate = true;
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.computeBoundingSphere();
  m.matrixAutoUpdate = false;
  return m;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast: boolean, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.matrixAutoUpdate = false;
  return m;
}

export const T = (x: number, y: number, z: number, ry = 0): THREE.Matrix4 => {
  const m = new THREE.Matrix4().makeRotationY(ry);
  m.setPosition(x, y, z);
  return m;
};
