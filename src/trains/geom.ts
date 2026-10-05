import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V2 = readonly [number, number];

/** Reduce to position/normal/uv, non-indexed so everything merges. */
export function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const r = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(r.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') r.deleteAttribute(k);
  if (!r.getAttribute('uv')) r.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(r.getAttribute('position').count * 2), 2));
  return r;
}

export function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(gs.map(plain), false);
  if (!m) throw new Error('train: merge failed');
  m.computeBoundingSphere();
  m.computeBoundingBox();
  return m;
}

/**
 * Smooth lofted surface through closed rings (counter-clockwise seen from +z, ring k at increasing z).
 * Duplicate a point in the ring to get a hard crease there. Smooth normals via computeVertexNormals.
 */
export function loft(rings: number[][]): THREE.BufferGeometry {
  const n = (rings[0]?.length ?? 0) / 3;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  rings.forEach((r, k) => {
    for (let j = 0; j < n; j++) {
      pos.push(r[j * 3]!, r[j * 3 + 1]!, r[j * 3 + 2]!);
      uv.push(j / n, k / (rings.length - 1));
    }
  });
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < n; j++) {
      const a = k * n + j;
      const b = k * n + ((j + 1) % n);
      const c = (k + 1) * n + j;
      const d = (k + 1) * n + ((j + 1) % n);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flat cap closing a ring (facing +z when `facePlus`). */
export function cap(ring: number[], facePlus: boolean): THREE.BufferGeometry {
  const n = ring.length / 3;
  let cx = 0;
  let cy = 0;
  const z = ring[2]!;
  for (let j = 0; j < n; j++) {
    cx += ring[j * 3]!;
    cy += ring[j * 3 + 1]!;
  }
  cx /= n;
  cy /= n;
  const pos: number[] = [];
  for (let j = 0; j < n; j++) {
    const j2 = (j + 1) % n;
    const t = [cx, cy, z, ring[j * 3]!, ring[j * 3 + 1]!, z, ring[j2 * 3]!, ring[j2 * 3 + 1]!, z];
    if (facePlus) pos.push(...t);
    else pos.push(t[0]!, t[1]!, t[2]!, t[6]!, t[7]!, t[8]!, t[3]!, t[4]!, t[5]!);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Cylinder with axis along x. */
export function xCyl(r: number, len: number, x: number, y: number, z: number, seg = 24): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Flat polygon shape (in the z/y plane of the train) extruded across x (centred on x = 0). */
export function sideShape(pts: V2[], thickness: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i === 0 ? s.moveTo(z, y) : s.lineTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  g.rotateY(-Math.PI / 2); // shape x -> world +z, extrusion -> x
  return g;
}

/** Mirror a geometry through x = 0 (flipping winding so normals stay outward). */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = plain(g.clone());
  const p = m.getAttribute('position');
  const n = m.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    p.setX(i, -p.getX(i));
    n.setX(i, -n.getX(i));
  }
  for (let i = 0; i + 2 < p.count; i += 3) {
    for (const a of [p, n, m.getAttribute('uv')]) {
      const sz = a.itemSize;
      for (let c = 0; c < sz; c++) {
        const t = a.getComponent(i + 1, c);
        a.setComponent(i + 1, c, a.getComponent(i + 2, c));
        a.setComponent(i + 2, c, t);
      }
    }
  }
  return m;
}
