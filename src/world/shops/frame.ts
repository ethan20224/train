import * as THREE from 'three';
import { Bucket, atlasUV, box, lathe, rbox, xf } from '../hotel/kit';
import type { UVRect } from './atlas';

export { rng } from '../concourse/geo';

/** Material buckets of the shops module (one merged mesh each). */
export interface Buckets {
  wood: Bucket;
  brass: Bucket;
  dark: Bucket;
  marble: Bucket;
  silver: Bucket;
  glass: Bucket;
  glow: Bucket;
  /** vertex-coloured, warm self-lit interiors (walls, ceilings, shelf boards) */
  warm: Bucket;
  /** vertex-coloured goods (flowers, sweets, pastries, china, leather) */
  goods: Bucket;
  /** vertex-coloured glossy paint (post box, enamel) */
  paint: Bucket;
  /** atlas-textured planes (signs, covers, papers) */
  atlas: Bucket;
}
export type K = keyof Buckets;

type Col = THREE.ColorRepresentation;

/**
 * A local authoring frame: everything added through it is transformed by `m` (shop-local -> world) before it is merged.
 * `at()` derives a child frame (translate + yaw) so rotated pieces are authored upright in their own coordinates.
 */
export class Frame {
  constructor(readonly b: Buckets, readonly m: THREE.Matrix4) {}

  at(x: number, y: number, z: number, yaw = 0): Frame {
    return new Frame(this.b, this.m.clone().multiply(xf(x, y, z, yaw)));
  }

  add(k: K, g: THREE.BufferGeometry, color?: Col, local?: THREE.Matrix4): void {
    this.b[k].add(g, local ? this.m.clone().multiply(local) : this.m, color);
  }

  box(k: K, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color?: Col): void {
    this.add(k, box(x0, y0, z0, x1, y1, z1), color);
  }

  rbox(k: K, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.01, color?: Col): void {
    this.add(k, rbox(x0, y0, z0, x1, y1, z1, r, 2), color);
  }

  /** Centre-based box. */
  cbox(k: K, cx: number, y0: number, cz: number, w: number, h: number, d: number, color?: Col): void {
    this.add(k, box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2), color);
  }

  /** Vertical cylinder with its base at y. */
  cyl(k: K, x: number, y: number, z: number, r: number, h: number, seg = 14, color?: Col, rTop = r): void {
    const g = new THREE.CylinderGeometry(rTop, r, h, seg);
    g.translate(x, y + h / 2, z);
    this.add(k, g, color);
  }

  /** Cylinder lying along local x. */
  cylX(k: K, x: number, y: number, z: number, r: number, len: number, seg = 12, color?: Col): void {
    const g = new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    this.add(k, g, color);
  }

  /** Cylinder lying along local z. */
  cylZ(k: K, x: number, y: number, z: number, r: number, len: number, seg = 12, color?: Col): void {
    const g = new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
    g.translate(x, y, z);
    this.add(k, g, color);
  }

  ball(k: K, x: number, y: number, z: number, r: number, color?: Col, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6): void {
    const g = new THREE.SphereGeometry(r, ws, hs);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    this.add(k, g, color);
  }

  tube(k: K, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, seg = 6, color?: Col): void {
    const a = new THREE.Vector3(ax, ay, az);
    const d = new THREE.Vector3(bx, by, bz).sub(a);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        a.clone().addScaledVector(d, 0.5),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    this.add(k, g, color);
  }

  /** Lathe around a vertical axis through (x, y, z); profile = (radius, height) bottom -> top. */
  lathe(k: K, pts: ReadonlyArray<readonly [number, number]>, x: number, y: number, z: number, seg = 18, color?: Col, yaw = 0): void {
    this.add(k, lathe(pts as Array<[number, number]>, seg, 0.5), color, xf(x, y, z, yaw));
  }

  /** Atlas-textured plane (faces local +z; `yaw` turns it about local Y, `pitch` tilts it about local X). */
  plane(rect: UVRect, cx: number, cy: number, cz: number, w: number, h: number, yaw = 0, pitch = 0, double = false): void {
    const mk = (flip: boolean): void => {
      const g = new THREE.PlaneGeometry(w, h);
      atlasUV(g, rect);
      const m = new THREE.Matrix4().makeRotationX(pitch);
      const r = new THREE.Matrix4().makeRotationY(yaw + (flip ? Math.PI : 0));
      const t = new THREE.Matrix4().makeTranslation(cx, cy, cz);
      this.add('atlas', g, undefined, t.multiply(r).multiply(m));
    };
    mk(false);
    if (double) mk(true);
  }

  /** Horizontal atlas plane facing up at height y. */
  top(rect: UVRect, cx: number, y: number, cz: number, w: number, d: number, yaw = 0): void {
    const g = new THREE.PlaneGeometry(w, d);
    atlasUV(g, rect);
    g.rotateX(-Math.PI / 2);
    this.add('atlas', g, undefined, xf(cx, y, cz, yaw));
  }

  /** Four thin bars framing a rectangle in the local x-y plane at depth z0..z1. */
  frame(k: K, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, t: number, color?: Col): void {
    this.box(k, x0, y0, z0, x1, y0 + t, z1, color);
    this.box(k, x0, y1 - t, z0, x1, y1, z1, color);
    this.box(k, x0, y0 + t, z0, x0 + t, y1 - t, z1, color);
    this.box(k, x1 - t, y0 + t, z0, x1, y1 - t, z1, color);
  }
}
