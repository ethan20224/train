import * as THREE from 'three';
import { beam } from '../shed/common';

/** Cylinder between two world points. */
export function rod(a: readonly [number, number, number], b: readonly [number, number, number], r: number, seg = 8): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  const m = va.clone().add(vb).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/** Flat bar in the YZ plane from (z0,y0) to (z1,y1), thickness w in-plane, depth d along world x, centred at x = xc. */
export function beamYZ(z0: number, y0: number, z1: number, y1: number, w: number, d: number, xc: number): THREE.BufferGeometry {
  const g = beam([-z0, y0], [-z1, y1], w, d, xc, 0.01);
  g.rotateY(Math.PI / 2);
  return g;
}

/** Sphere at a point. */
export function ball(x: number, y: number, z: number, r: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2));
  g.translate(x, y, z);
  return g;
}

/** Cylinder with a vertical axis. */
export function post(x: number, y0: number, y1: number, z: number, r: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}

/** Cylinder with its axis along z, dished roundel. */
export function disc(x: number, y: number, z: number, r: number, thick: number, seg = 14): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, thick, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
