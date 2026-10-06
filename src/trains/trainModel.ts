import * as THREE from 'three';
import type { BuildContext } from '../core/types';
import { PLATFORM_SAFETY, RAIL } from '../layout';
import { box, cap, loft, merge, mirrorX, sideShape, xCyl, type V2 } from './geom';
import { contactShadowTexture, glowAtlas, lettersTexture, windowAtlas } from './textures';

/**
 * Art Deco streamliner (20th Century Limited spirit). Local frame: nose at z = 0, consist extends toward +z,
 * floor at y = 0 (platform height), rail top at y = RAIL.topY, roof 4.4 m above the rail.
 * Everything is merged per material and skinned onto one bone per vehicle (articulation): 8 draw calls per train.
 */
export const LOCO_LENGTH = 24;
export const CAR_LENGTH = 25;
export const CAR_COUNT = 5;
export const GAP = 1;
export const TRAIN_LENGTH = LOCO_LENGTH + CAR_COUNT * CAR_LENGTH + CAR_COUNT * GAP; // 154
export const LIVERY_COUNT = 3;
const LIVERY_COLORS = [0x0a0a0c, 0x0b2a1d, 0x0b1430];
export const LIVERY_NAMES = ['black-gold', 'deep-green-gold', 'midnight-blue-gold'] as const;

const W = 1.6; // half width
const ROOF = RAIL.topY + 4.4; // 3.3
const KEEL = -0.6;
const WHEEL_X = RAIL.gauge / 2;

// ------------------------------------------------------------------------------------------------ locomotive
const NOSE_LEN = 8;
const NOSE_Z0 = 0.35;
const SQ = 3.2;
const bullet = (s: number): number => Math.pow(1 - Math.pow(1 - Math.min(1, Math.max(0, s)), 2.4), 0.6);
const sgnPow = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), e);

function locoSection(z: number): { w: number; h: number; cy: number } {
  const f = bullet(z / NOSE_LEN);
  const h = ((ROOF - KEEL) / 2) * f;
  return { w: W * f, h, cy: (ROOF + KEEL) / 2 - 0.35 * (1 - f) };
}
/** Half-width of the shroud surface at height y (0 when outside the section). */
function locoX(z: number, y: number): number {
  const { w, h, cy } = locoSection(z);
  const r = Math.abs((y - cy) / h);
  return r >= 1 ? 0 : w * Math.pow(1 - Math.pow(r, SQ), 1 / SQ);
}
const locoTop = (z: number): number => {
  const s = locoSection(z);
  return s.cy + s.h;
};

function locoRing(z: number, n = 56): number[] {
  const { w, h, cy } = locoSection(z);
  const r: number[] = [];
  for (let j = 0; j < n; j++) {
    const a = -Math.PI / 2 + (j / n) * Math.PI * 2;
    r.push(w * sgnPow(Math.cos(a), 2 / SQ), cy + h * sgnPow(Math.sin(a), 2 / SQ), z);
  }
  return r;
}

/** Quad grid that hugs the loco flank (right side), uv mapped into atlas cell `cell` (of 4). */
function flankPatch(z0: number, z1: number, y0: number, y1: number, off: number, cell: number, nz = 8, ny = 3): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nz; i++) {
    for (let j = 0; j <= ny; j++) {
      const z = z0 + ((z1 - z0) * i) / nz;
      const y = y0 + ((y1 - y0) * j) / ny;
      pos.push(locoX(z, y) + off, y, z);
      uv.push((cell + i / nz) / 4, j / ny);
    }
  }
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < ny; j++) {
      const a = i * (ny + 1) + j;
      const b = a + 1;
      const c = a + ny + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Thin gold ribbon along the flank at constant height, converging with the nose. */
function speedLine(y: number, thick: number): THREE.BufferGeometry {
  const zs: number[] = [];
  for (let i = 0; i <= 14; i++) zs.push(0.5 + 1.8 * Math.pow(i / 14, 1.4) * 2);
  for (let z = 5.6; z < 23.6; z += 1.5) zs.push(z);
  zs.push(23.6);
  const pos: number[] = [];
  const idx: number[] = [];
  zs.forEach((z, k) => {
    for (const dy of [-thick / 2, thick / 2]) pos.push(locoX(z, y + dy) + 0.022, y + dy, z);
    if (k > 0) {
      const a = (k - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function bandPoly(p0: V2, p1: V2, w: number): V2[] {
  const dz = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const l = Math.hypot(dz, dy);
  const nz = (-dy / l) * (w / 2);
  const ny = (dz / l) * (w / 2);
  return [
    [p0[0] + nz, p0[1] + ny],
    [p1[0] + nz, p1[1] + ny],
    [p1[0] - nz, p1[1] - ny],
    [p0[0] - nz, p0[1] - ny],
  ];
}

interface Parts {
  paint: THREE.BufferGeometry[];
  gold: THREE.BufferGeometry[];
  iron: THREE.BufferGeometry[];
  bellows: THREE.BufferGeometry[];
  windows: THREE.BufferGeometry[];
  letters: THREE.BufferGeometry[];
  glow: THREE.BufferGeometry[];
}

function buildLoco(p: Parts): void {
  const rings: number[][] = [];
  for (let i = 0; i <= 22; i++) rings.push(locoRing(NOSE_Z0 + (NOSE_LEN - NOSE_Z0) * Math.pow(i / 22, 1.8)));
  for (const z of [10.5, 13, 16, 19, 21.5, 24]) rings.push(locoRing(z));
  p.paint.push(loft(rings), cap(rings[0]!, false), cap(rings[rings.length - 1]!, true));

  // Central crest fin: lofted side silhouette, gold edge and nested chevrons.
  const zsFin: number[] = [];
  for (let i = 0; i <= 28; i++) zsFin.push(2 + (16 * i) / 28);
  const fh = (z: number): number => 0.64 * Math.pow(Math.max(0, Math.sin((Math.PI * (z - 2)) / 16)), 0.8);
  const topPts: V2[] = zsFin.map((z): V2 => [z, locoTop(z) + fh(z)]);
  const botPts: V2[] = zsFin.map((z): V2 => [z, locoTop(z) - 0.25]).reverse();
  p.paint.push(sideShape([...topPts, ...botPts], 0.07));
  const edgeIn: V2[] = [...topPts].reverse().map(([z, y]) => [z, y - 0.045] as V2);
  p.gold.push(sideShape([...topPts, ...edgeIn], 0.09));
  for (const zc of [5.0, 7.3, 9.6]) {
    const ya = locoTop(zc) + 0.19;
    p.gold.push(sideShape(bandPoly([zc, ya], [zc + 0.75, ya + 0.17], 0.07), 0.085));
    p.gold.push(sideShape(bandPoly([zc, ya], [zc + 0.75, ya - 0.17], 0.07), 0.085));
  }

  // Headlight: gold bezel + glowing lens set in the truncated nose.
  const bezel = new THREE.TorusGeometry(0.4, 0.07, 10, 36);
  bezel.translate(0, locoSection(NOSE_Z0).cy, NOSE_Z0 - 0.02);
  p.gold.push(bezel);
  const lens = new THREE.SphereGeometry(0.37, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  lens.rotateX(-Math.PI / 2);
  lens.scale(1, 1, 0.45);
  lens.translate(0, locoSection(NOSE_Z0).cy, NOSE_Z0 + 0.02);
  const lu = lens.getAttribute('uv');
  for (let i = 0; i < lu.count; i++) lu.setXY(i, 0.75, 0.5);
  p.glow.push(lens);

  // Gold speed lines wrapping the flank (both sides).
  for (const y of [0.78, 1.04, 1.3]) {
    const r = speedLine(y, 0.045);
    p.gold.push(r, mirrorX(r));
  }
  // Cab windows (dark glass with a warm glow), flank-conforming.
  for (const [a, b] of [[14.8, 17.3], [17.8, 20.3]] as const) {
    const w = flankPatch(a, b, 1.75, 2.55, 0.02, 2);
    const wu = w.getAttribute('uv');
    for (let i = 0; i < wu.count; i++) wu.setXY(i, (2 + 0.2 + (wu.getX(i) * 4 - 2) * 0.55) / 4, 0.62 + wu.getY(i) * 0.3);
    p.windows.push(w, mirrorX(w));
  }

  // Driving wheels (partly hidden by the shroud), coupling rods, leading bogie.
  for (const s of [-1, 1]) {
    const x = s * WHEEL_X;
    for (const z of [13.5, 17, 20.5]) {
      p.iron.push(xCyl(0.95, 0.12, x, RAIL.topY + 0.95, z, 40));
      p.gold.push(xCyl(0.2, 0.2, x + s * 0.02, RAIL.topY + 0.95, z, 16));
    }
    p.gold.push(box(x + s * 0.1 - 0.03, x + s * 0.1 + 0.03, RAIL.topY + 0.95 - 0.52, RAIL.topY + 0.95 - 0.42, 13.5, 20.5));
    for (const z of [3.4, 5.1]) p.iron.push(xCyl(0.5, 0.11, x, RAIL.topY + 0.5, z, 28));
  }
  p.iron.push(xCyl(0.05, 1.5, 0, RAIL.topY + 0.5, 3.4, 8), xCyl(0.05, 1.5, 0, RAIL.topY + 0.5, 5.1, 8));
  for (const z of [13.5, 17, 20.5]) p.iron.push(xCyl(0.07, 1.5, 0, RAIL.topY + 0.95, z, 8));
  p.iron.push(box(-0.8, 0.8, -0.72, -0.62, 2.8, 5.7));
}

// -------------------------------------------------------------------------------------------------- carriages
/** Half section from bottom centre to top centre; duplicate points are creases. */
function halfProfile(): V2[] {
  const h: V2[] = [[0, KEEL], [1.25, KEEL], [1.25, KEEL], [1.42, -0.55], [1.54, -0.4], [1.6, -0.18], [1.6, 0.1], [1.6, 2.3]];
  for (let i = 1; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    h.push([1.6 * Math.cos(a), 2.3 + (ROOF - 2.3) * Math.sin(a)]);
  }
  return h;
}
const HALF = halfProfile();
const CAR_CY = (ROOF + KEEL) / 2;

function carRing(z: number, scale = 1): number[] {
  const r: number[] = [];
  const put = (x: number, y: number): void => {
    r.push(x * scale, CAR_CY + (y - CAR_CY) * scale, z);
  };
  for (const [x, y] of HALF) put(x, y);
  for (let i = HALF.length - 2; i >= 1; i--) put(-HALF[i]![0], HALF[i]![1]);
  return r;
}

function pleatedBellows(z0: number, z1: number): THREE.BufferGeometry {
  const rings: number[][] = [];
  const n = 40;
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const z = z0 - 0.06 + ((z1 - z0 + 0.12) * i) / steps;
    const s = i === 0 || i === steps ? 1 : i % 2 ? 0.93 : 1;
    const r: number[] = [];
    for (let j = 0; j < n; j++) {
      const a = -Math.PI / 2 + (j / n) * Math.PI * 2;
      r.push(1.18 * s * sgnPow(Math.cos(a), 0.5), 1.15 + 1.5 * s * sgnPow(Math.sin(a), 0.5), z);
    }
    rings.push(r);
  }
  return loft(rings);
}

function windowQuad(side: number, zc: number, cell: number, wd = 1.4, ht = 1.18, yc = 1.52): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(wd, ht);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 4);
  g.rotateY((side * Math.PI) / 2);
  g.translate(side * (W + 0.012), yc, zc);
  return g;
}

function buildCar(p: Parts, z0: number, tail: boolean, index: number): void {
  const L = CAR_LENGTH;
  const g: Parts = { paint: [], gold: [], iron: [], bellows: [], windows: [], letters: [], glow: [], };
  const rings: number[][] = [carRing(0), carRing(tail ? 20.5 : L)];
  if (tail) {
    for (let i = 1; i <= 8; i++) {
      const s = (i / 8) * 0.85;
      rings.push(carRing(20.5 + 4.5 * (s / 0.85), Math.pow(1 - Math.pow(s, 2.2), 0.55)));
    }
  }
  g.paint.push(loft(rings), cap(rings[0]!, false), cap(rings[rings.length - 1]!, true));
  const zEnd = tail ? 20.4 : 24.8;
  const windowCount = tail ? 8 : 9;

  for (const s of [-1, 1]) {
    const gx = (a: number, b: number): [number, number] => (s < 0 ? [-b, -a] : [a, b]);
    // belt lines + roofline
    g.gold.push(box(...gx(W - 0.02, W + 0.03), 0.4, 0.47, 0.2, zEnd));
    g.gold.push(box(...gx(W - 0.02, W + 0.025), 0.5, 0.53, 0.2, zEnd));
    g.gold.push(box(...gx(W - 0.02, W + 0.025), 0.9, 0.93, 0.2, zEnd)); // sill line
    g.gold.push(box(...gx(W - 0.02, W + 0.025), 2.14, 2.17, 0.2, zEnd));
    // windows with gold surrounds
    for (let i = 0; i < windowCount; i++) {
      const zc = 2.9 + i * 2.35;
      const cell = (i * 3 + index * 5 + (s > 0 ? 0 : 1)) % 4;
      g.windows.push(windowQuad(s, zc, cell));
      const y0 = 0.93;
      const y1 = 2.11;
      const t = 0.055;
      const zl = zc - 0.7;
      const zr = zc + 0.7;
      g.gold.push(box(...gx(W - 0.01, W + 0.03), y0 - t, y0, zl - t, zr + t));
      g.gold.push(box(...gx(W - 0.01, W + 0.03), y1, y1 + t, zl - t, zr + t));
      g.gold.push(box(...gx(W - 0.01, W + 0.03), y0, y1, zl - t, zl));
      g.gold.push(box(...gx(W - 0.01, W + 0.03), y0, y1, zr, zr + t));
    }
    // vestibule doors: gold outline + recessed panel hairlines, centre split, handles, narrow window.
    // Door centres come from PLATFORM_SAFETY (shared with the platform edge doors).
    const half = PLATFORM_SAFETY.carDoorWidth / 2;
    const doorCs = tail ? [PLATFORM_SAFETY.carDoorLocalZ[0]] : PLATFORM_SAFETY.carDoorLocalZ;
    for (const c of doorCs) {
      const a = c - half;
      const b = c + half;
      g.gold.push(box(...gx(W - 0.01, W + 0.025), 0.05, 0.09, a, b));
      g.gold.push(box(...gx(W - 0.01, W + 0.025), 2.1, 2.14, a, b));
      g.gold.push(box(...gx(W - 0.01, W + 0.025), 0.05, 2.14, a, a + 0.04));
      g.gold.push(box(...gx(W - 0.01, W + 0.025), 0.05, 2.14, b - 0.04, b));
      // centre split of the double leaf
      g.gold.push(box(...gx(W - 0.01, W + 0.02), 0.09, 2.1, c - 0.012, c + 0.012));
      // recessed panel hairlines (lower kick panel, upper frame around the window)
      const hl = (y0: number, y1: number, z0: number, z1: number): void => {
        const t = 0.011;
        g.gold.push(box(...gx(W - 0.01, W + 0.017), y0, y0 + t, z0, z1));
        g.gold.push(box(...gx(W - 0.01, W + 0.017), y1 - t, y1, z0, z1));
        g.gold.push(box(...gx(W - 0.01, W + 0.017), y0, y1, z0, z0 + t));
        g.gold.push(box(...gx(W - 0.01, W + 0.017), y0, y1, z1 - t, z1));
      };
      for (const [z0, z1] of [[a + 0.1, c - 0.05], [c + 0.05, b - 0.1]] as const) {
        hl(0.16, 0.36, z0, z1);
        hl(0.6, 0.86, z0, z1);
        // narrow door window (dark glass) with a gold surround
        g.windows.push(windowQuad(s, (z0 + z1) / 2, (index + (s > 0 ? 0 : 1)) % 4, z1 - z0 - 0.04, 0.9, 1.55));
        hl(1.08, 2.02, z0, z1);
      }
      // small brass handles beside the split
      for (const sz of [-1, 1]) {
        g.gold.push(box(...gx(W + 0.01, W + 0.05), 1.0, 1.16, c + sz * 0.09 - 0.012, c + sz * 0.09 + 0.012));
      }
    }
    // lettering
    const lw = 7.4;
    const lq = new THREE.PlaneGeometry(lw, lw * (96 / 2048));
    lq.rotateY((s * Math.PI) / 2);
    lq.translate(s * (W + 0.012), 0.715, tail ? 10.2 : 12.5);
    g.letters.push(lq);
  }

  // bogies
  const bz: [number, number][] = tail ? [[3.6, 5.0], [15.2, 16.6]] : [[3.6, 5.0], [20.0, 21.4]];
  for (const pair of bz) {
    for (const s of [-1, 1]) for (const z of pair) g.iron.push(xCyl(0.46, 0.12, s * WHEEL_X, RAIL.topY + 0.46, z, 24));
    for (const z of pair) g.iron.push(xCyl(0.05, 1.5, 0, RAIL.topY + 0.46, z, 8));
    g.iron.push(box(-0.95, 0.95, -0.76, -0.64, pair[0] - 0.2, pair[1] + 0.2));
    g.iron.push(box(-0.9, -0.82, -0.86, -0.6, pair[0], pair[1]), box(0.82, 0.9, -0.86, -0.6, pair[0], pair[1]));
  }

  if (tail) {
    const cy = CAR_CY;
    const zT = 25.0;
    const dh = new THREE.CircleGeometry(0.46, 40);
    const u = dh.getAttribute('uv');
    for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * 0.5);
    dh.translate(0, cy + 0.05, zT + 0.12);
    g.glow.push(dh);
    const rim = new THREE.TorusGeometry(0.48, 0.045, 8, 40);
    rim.translate(0, cy + 0.05, zT + 0.1);
    g.gold.push(rim);
    g.gold.push(box(-0.03, 0.03, cy - 0.5, cy - 0.4, zT - 0.1, zT + 0.12));
    // observation platform rail
    g.gold.push(box(-0.82, 0.82, 0.52, 0.56, zT - 0.05, zT + 0.45));
    g.gold.push(box(-0.82, -0.78, 0.0, 0.56, zT + 0.4, zT + 0.45), box(0.78, 0.82, 0.0, 0.56, zT + 0.4, zT + 0.45));
    g.gold.push(box(-0.82, 0.82, 0.52, 0.56, zT + 0.4, zT + 0.45));
  }

  for (const k of Object.keys(g) as (keyof Parts)[]) {
    for (const geo of g[k]) {
      geo.translate(0, 0, z0);
      p[k].push(geo);
    }
  }
}


// ------------------------------------------------------------------------------------------------ articulation rig
/** One entry per vehicle (loco + cars): model-z start / centre and the two bogie centres (model z = distance from the nose). */
export const VEHICLES: { start: number; end: number; centre: number; bogieA: number; bogieB: number }[] = (() => {
  const v = [{ start: 0, end: LOCO_LENGTH, centre: LOCO_LENGTH / 2, bogieA: 4.25, bogieB: 17 }];
  for (let i = 0; i < CAR_COUNT; i++) {
    const s0 = LOCO_LENGTH + GAP + i * (CAR_LENGTH + GAP);
    const tail = i === CAR_COUNT - 1;
    v.push({ start: s0, end: s0 + CAR_LENGTH, centre: s0 + CAR_LENGTH / 2, bogieA: s0 + 4.3, bogieB: tail ? s0 + 15.9 : s0 + 20.7 });
  }
  return v;
})();
const NBONES = VEHICLES.length;

/** Rigid skinning by model z: each vehicle's vertices follow its bone; the 1 m gaps (bellows, shadow strip) blend linearly. */
function addSkin(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position');
  const idx = new Uint16Array(pos.count * 4);
  const wgt = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    let b0 = 0;
    let b1 = 0;
    let w1 = 0;
    // vehicle containing z (tail cars overhang slightly: use start..start + CAR_LENGTH + GAP/2)
    let found = -1;
    for (let k = 0; k < NBONES; k++) {
      const v = VEHICLES[k]!;
      if (z >= v.start - 1e-6 && z <= v.end + 1e-6) {
        found = k;
        break;
      }
    }
    if (found >= 0) b0 = found;
    else if (z < 0) b0 = 0;
    else if (z > VEHICLES[NBONES - 1]!.end) b0 = NBONES - 1;
    else {
      for (let k = 0; k + 1 < NBONES; k++) {
        const a = VEHICLES[k]!;
        const c = VEHICLES[k + 1]!;
        if (z > a.end && z < c.start) {
          b0 = k;
          b1 = k + 1;
          w1 = (z - a.end) / (c.start - a.end);
          break;
        }
      }
    }
    idx[i * 4] = b0;
    idx[i * 4 + 1] = b1;
    wgt[i * 4] = 1 - w1;
    wgt[i * 4 + 1] = w1;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));
}

export interface RigPoint {
  x: number;
  y: number;
  z: number;
}
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _off = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Pose every vehicle from its two bogie points on the track. `sample(d, out)` writes the rail-top point of the track at
 * distance d from the NOSE (world). Vehicle position = bogie midpoint-consistent, yaw / pitch from the bogie chord.
 */
export function poseTrain(g: THREE.Group, sample: (d: number, out: RigPoint) => void): void {
  const bones = g.userData.bones as THREE.Bone[];
  const pa: RigPoint = { x: 0, y: 0, z: 0 };
  const pb: RigPoint = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < NBONES; k++) {
    const v = VEHICLES[k]!;
    sample(v.bogieA, pa);
    sample(v.bogieB, pb);
    _a.set(pa.x, pa.y, pa.z);
    _b.set(pb.x, pb.y, pb.z);
    _b.sub(_a);
    const len = _b.length();
    if (len < 1e-6) continue;
    _b.divideScalar(len);
    const yaw = Math.atan2(_b.x, _b.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, _b.y)));
    _e.set(-pitch, yaw, 0);
    _q.setFromEuler(_e);
    // world pos of bone origin such that model point (0, topY, bogieA) lands on pa
    _off.set(0, RAIL.topY, v.bogieA - v.centre).applyQuaternion(_q);
    const bone = bones[k]!;
    bone.position.set(pa.x - _off.x, pa.y - _off.y, pa.z - _off.z);
    bone.quaternion.copy(_q);
  }
}

// ------------------------------------------------------------------------------------------------ kit / model
interface Kit {
  geos: Record<keyof Parts | 'shadow', THREE.BufferGeometry>;
  paint: THREE.MeshPhysicalMaterial[];
  gold: THREE.Material;
  iron: THREE.Material;
  bellows: THREE.Material;
  windows: THREE.Material;
  letters: THREE.Material;
  glow: THREE.Material;
  shadow: THREE.Material;
}
let kitCache: Kit | null = null;

function getKit(ctx: BuildContext): Kit {
  if (kitCache) return kitCache;
  const p: Parts = { paint: [], gold: [], iron: [], bellows: [], windows: [], letters: [], glow: [] };
  buildLoco(p);
  p.bellows.push(pleatedBellows(LOCO_LENGTH, LOCO_LENGTH + GAP));
  for (let i = 0; i < CAR_COUNT; i++) {
    const z0 = LOCO_LENGTH + GAP + i * (CAR_LENGTH + GAP);
    buildCar(p, z0, i === CAR_COUNT - 1, i);
    if (i < CAR_COUNT - 1) p.bellows.push(pleatedBellows(z0 + CAR_LENGTH, z0 + CAR_LENGTH + GAP));
  }
  const shadowQuad = new THREE.PlaneGeometry(4.9, TRAIN_LENGTH + 4, 1, TRAIN_LENGTH + 4);
  shadowQuad.rotateX(-Math.PI / 2);
  shadowQuad.translate(0, RAIL.topY + 0.05, TRAIN_LENGTH / 2);
  const geos = {
    paint: merge(p.paint),
    gold: merge(p.gold),
    iron: merge(p.iron),
    bellows: merge(p.bellows),
    windows: merge(p.windows),
    letters: merge(p.letters),
    glow: merge(p.glow),
    shadow: shadowQuad,
  };

  for (const g of Object.values(geos)) addSkin(g);

  const M = ctx.materials;
  const base = M.get('trainPaint') as THREE.MeshPhysicalMaterial;
  const paint = LIVERY_COLORS.map((c, i) => {
    const m = base.clone();
    m.name = `trainPaint-${LIVERY_NAMES[i]}`;
    m.color.set(c);
    return m;
  });
  const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;
  const windowTex = windowAtlas();
  const windows = new THREE.MeshStandardMaterial({
    name: 'trainWindows',
    color: 0x0a0604,
    roughness: 0.25,
    metalness: 0,
    emissive: 0xffffff,
    emissiveMap: windowTex,
    emissiveIntensity: 1.55,
    ...decal,
  });
  const letterTex = lettersTexture('GRAND MERIDIAN LIMITED');
  const letters = new THREE.MeshStandardMaterial({
    name: 'trainLetters',
    map: letterTex,
    transparent: true,
    depthWrite: false,
    metalness: 0.6,
    roughness: 0.35,
    ...decal,
    polygonOffsetFactor: -4,
  });
  const glowTex = glowAtlas();
  const glow = new THREE.MeshStandardMaterial({ name: 'trainGlow', color: 0x050403, emissive: 0xffffff, emissiveMap: glowTex, emissiveIntensity: 2.6 });
  const shadow = new THREE.MeshBasicMaterial({ name: 'trainContactShadow', map: contactShadowTexture(), color: 0x000000, transparent: true, depthWrite: false, opacity: 1 });
  kitCache = {
    geos,
    paint,
    gold: M.get('trainGold'),
    iron: new THREE.MeshStandardMaterial({ name: 'trainIron', color: 0x1b1a19, metalness: 0.75, roughness: 0.5 }),
    bellows: new THREE.MeshStandardMaterial({ name: 'trainBellows', color: 0x181513, roughness: 0.92, metalness: 0 }),
    windows,
    letters,
    glow,
    shadow,
  };
  return kitCache;
}

/** Build one train: 8 SkinnedMeshes sharing one 6-bone skeleton (one bone per vehicle). Keep the group at the world origin. */
export function buildTrainModel(ctx: BuildContext, livery = 0): THREE.Group {
  const kit = getKit(ctx);
  const g = new THREE.Group();
  g.name = 'trainModel';
  const bones: THREE.Bone[] = [];
  for (let k = 0; k < NBONES; k++) {
    const b = new THREE.Bone();
    b.name = `vehicle${k}`;
    g.add(b);
    bones.push(b);
  }
  const inverses = VEHICLES.map((v) => new THREE.Matrix4().makeTranslation(0, 0, -v.centre));
  const skeleton = new THREE.Skeleton(bones, inverses);
  const add = (key: keyof Kit['geos'], mat: THREE.Material, order = 0): THREE.SkinnedMesh => {
    const m = new THREE.SkinnedMesh(kit.geos[key], mat);
    m.bind(skeleton, new THREE.Matrix4());
    m.frustumCulled = false; // the rest-pose bounds are meaningless; the scheduler culls per train
    m.castShadow = false; // trains never bake into the static sun map
    m.userData.noShadow = true; // lighting.finalize's catch-all would otherwise flip castShadow on
    m.receiveShadow = key !== 'shadow';
    m.renderOrder = order;
    g.add(m);
    return m;
  };
  const paintMesh = add('paint', kit.paint[livery % LIVERY_COUNT]!);
  add('gold', kit.gold);
  add('iron', kit.iron);
  add('bellows', kit.bellows);
  add('windows', kit.windows);
  add('glow', kit.glow);
  add('letters', kit.letters, 1);
  add('shadow', kit.shadow, 0);
  g.userData.paintMesh = paintMesh;
  g.userData.kit = kit;
  g.userData.bones = bones;
  return g;
}

export function setLivery(g: THREE.Group, i: number): void {
  const kit = g.userData.kit as Kit;
  (g.userData.paintMesh as THREE.Mesh).material = kit.paint[((i % LIVERY_COUNT) + LIVERY_COUNT) % LIVERY_COUNT]!;
}
