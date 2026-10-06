import * as THREE from 'three';
import { Bucket, atlasUV, box, lathe, rbox } from './kit';
import type { Buckets } from './furniture';
import type { UVRect } from './textures';

/** Shared under-balcony facade grammar (wall face at z = 8): wainscot, pilasters, cornice, framed plates. */
export const FACE_Z = 8;

/** Thin rectangular frame (4 bars) around a box region, in the z band [z0, z1]. */
export function frameBars(bk: Bucket, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, t: number): void {
  bk.add(box(x0, y0, z0, x1, y0 + t, z1));
  bk.add(box(x0, y1 - t, z0, x1, y1, z1));
  bk.add(box(x0, y0 + t, z0, x0 + t, y1 - t, z1));
  bk.add(box(x1 - t, y0 + t, z0, x1, y1 - t, z1));
}

/** Atlas-textured plate facing +z, centred at (cx, cy), with a brass frame. */
export function plate(b: Buckets, rect: UVRect, cx: number, cy: number, w: number, h: number, z = FACE_Z + 0.012, frame = 0.025): void {
  const g = new THREE.PlaneGeometry(w, h);
  atlasUV(g, rect);
  g.translate(cx, cy, z);
  b.paper.add(g);
  frameBars(b.brass, cx - w / 2 - frame, cy - h / 2 - frame, cx + w / 2 + frame, cy + h / 2 + frame, FACE_Z, z + 0.006, frame);
}

/** Walnut raised-panel wainscot with dark-marble plinth and cap rail, y 0..1.05. */
export function wainscot(b: Buckets, x0: number, x1: number): void {
  b.dark.add(box(x0, 0, FACE_Z, x1, 0.14, FACE_Z + 0.07));
  b.dark.add(box(x0, 0.14, FACE_Z, x1, 0.16, FACE_Z + 0.055)); // little step
  // rails
  b.wood.add(box(x0, 0.16, FACE_Z, x1, 0.25, FACE_Z + 0.05));
  b.wood.add(box(x0, 0.92, FACE_Z, x1, 1.0, FACE_Z + 0.05));
  const n = Math.max(1, Math.round((x1 - x0) / 0.9));
  const pitch = (x1 - x0) / n;
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * pitch;
    b.wood.add(box(Math.max(x0, x - 0.045), 0.25, FACE_Z, Math.min(x1, x + 0.045), 0.92, FACE_Z + 0.05));
  }
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * pitch + 0.06;
    const xb = x0 + (i + 1) * pitch - 0.06;
    b.wood.add(rbox(xa, 0.28, FACE_Z + 0.03, xb, 0.89, FACE_Z + 0.075, 0.012, 2));
    b.brass.add(box(xa + 0.012, 0.29, FACE_Z + 0.074, xb - 0.012, 0.296, FACE_Z + 0.079));
  }
  // cap rail
  b.wood.add(rbox(x0, 1.0, FACE_Z, x1, 1.045, FACE_Z + 0.11, 0.012, 2));
}

/** Cream-marble fluted pilaster on the wall, centred on x, from the floor to y = 3.48. */
export function pilaster(b: Buckets, x: number, half = 0.18): void {
  const z1 = FACE_Z + 0.15;
  b.dark.add(box(x - half - 0.05, 0, FACE_Z, x + half + 0.05, 0.22, z1 + 0.05));
  b.marble.add(box(x - half - 0.03, 0.22, FACE_Z, x + half + 0.03, 0.3, z1 + 0.03));
  b.marble.add(rbox(x - half, 0.3, FACE_Z, x + half, 3.3, z1, 0.012, 2));
  // flutes read as dark grooves
  const flutes = 5;
  for (let i = 0; i < flutes; i++) {
    const fx = x - half + 0.04 + (i / (flutes - 1)) * (2 * half - 0.08);
    b.dark.add(box(fx - 0.004, 0.5, z1 + 0.0005, fx + 0.004, 3.1, z1 + 0.002));
  }
  b.marble.add(box(x - half - 0.03, 3.3, FACE_Z, x + half + 0.03, 3.38, z1 + 0.03));
  b.marble.add(box(x - half - 0.06, 3.38, FACE_Z, x + half + 0.06, 3.47, z1 + 0.06));
  b.brass.add(box(x - half - 0.065, 3.465, FACE_Z, x + half + 0.065, 3.475, z1 + 0.065));
}

/** Stepped marble cornice shelf with a brass line, y 3.48..3.66. */
export function shopCornice(b: Buckets, x0: number, x1: number): void {
  b.marble.add(box(x0, 3.475, FACE_Z, x1, 3.54, FACE_Z + 0.07));
  b.marble.add(box(x0, 3.54, FACE_Z, x1, 3.6, FACE_Z + 0.11));
  b.marble.add(rbox(x0, 3.6, FACE_Z, x1, 3.66, FACE_Z + 0.15, 0.015, 2));
  b.brass.add(box(x0, 3.536, FACE_Z + 0.069, x1, 3.546, FACE_Z + 0.075));
}

/** Framed poster (atlas cell) with a brass frame, facing +z. */
export function poster(b: Buckets, rect: UVRect, cx: number, cy: number, w: number, h: number): void {
  const g = new THREE.PlaneGeometry(w, h);
  atlasUV(g, rect);
  g.translate(cx, cy, FACE_Z + 0.03);
  b.paper.add(g);
  frameBars(b.brass, cx - w / 2 - 0.035, cy - h / 2 - 0.035, cx + w / 2 + 0.035, cy + h / 2 + 0.035, FACE_Z, FACE_Z + 0.045, 0.035);
  b.wood.add(box(cx - w / 2 - 0.05, cy - h / 2 - 0.05, FACE_Z, cx + w / 2 + 0.05, cy + h / 2 + 0.05, FACE_Z + 0.018));
}

/** Small brass tray (shallow oval) centred at (x, y, z). */
export function brassTray(b: Buckets, x: number, y: number, z: number, scaleX = 1.3, scaleZ = 0.8): void {
  const g = lathe([[0.001, 0], [0.115, 0], [0.12, 0.006], [0.126, 0.02], [0.114, 0.018], [0.1, 0.008], [0.001, 0.008]], 28, 0.5);
  g.scale(scaleX, 1, scaleZ);
  g.translate(x, y, z);
  b.brass.add(g);
}
