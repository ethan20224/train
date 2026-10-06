import * as THREE from 'three';
import { Frame, rng } from './frame';
import type { ShopAtlas } from './atlas';
import { xf } from '../hotel/kit';

/** Reusable stocked props: china, pastries, flowers, jars, till, espresso machine, chairs, tables, buckets. */

const P = Math.PI;
type Pt = ReadonlyArray<readonly [number, number]>;

// ---------------------------------------------------------------------------------------------------------------------
// china
// ---------------------------------------------------------------------------------------------------------------------
const CUP: Pt = [[0.001, 0], [0.022, 0], [0.03, 0.012], [0.04, 0.05], [0.038, 0.055], [0.034, 0.05], [0.001, 0.05]];
const SAUCER: Pt = [[0.001, 0], [0.05, 0], [0.07, 0.012], [0.072, 0.016], [0.066, 0.014], [0.001, 0.008]];

/** Cup of black coffee on a saucer, set out. */
export function cup(f: Frame, x: number, y: number, z: number, yaw = 0, full = true): void {
  const c = f.at(x, y, z, yaw);
  c.lathe('goods', SAUCER, 0, 0, 0, 18, '#f4efe3');
  c.lathe('goods', CUP, 0, 0.012, 0, 16, '#f7f2e7');
  if (full) c.cyl('goods', 0, 0.058, 0, 0.034, 0.002, 14, '#2c1a10');
  const h = new THREE.TorusGeometry(0.018, 0.004, 5, 8, P * 1.2).rotateZ(-P * 0.6);
  c.add('goods', h, '#f7f2e7', xf(0.042, 0.038, 0));
}

export function plate(f: Frame, x: number, y: number, z: number, r = 0.11, color = '#f3eee2'): void {
  f.lathe('goods', [[0.001, 0], [r * 0.7, 0], [r, 0.016], [r * 0.95, 0.017], [r * 0.7, 0.006], [0.001, 0.006]], x, y, z, 20, color);
}

// ---------------------------------------------------------------------------------------------------------------------
// pastries
// ---------------------------------------------------------------------------------------------------------------------
export function pastry(f: Frame, kind: number, x: number, y: number, z: number, yaw = 0): void {
  const c = f.at(x, y, z, yaw);
  switch (kind % 5) {
    case 0: {
      // fruit tart
      c.cyl('goods', 0, 0, 0, 0.04, 0.022, 14, '#c9923f');
      c.cyl('goods', 0, 0.022, 0, 0.034, 0.008, 14, '#f0dd9a');
      for (let i = 0; i < 5; i++) c.ball('goods', Math.cos((i / 5) * P * 2) * 0.018, 0.034, Math.sin((i / 5) * P * 2) * 0.018, 0.011, i % 2 ? '#a3182a' : '#c0212f', 1, 1, 1, 6, 4);
      break;
    }
    case 1: {
      // éclair
      c.cylX('goods', 0, 0.022, 0, 0.022, 0.1, 10, '#c68a3c');
      c.rbox('goods', -0.05, 0.036, -0.021, 0.05, 0.046, 0.021, 0.004, '#3a2013');
      break;
    }
    case 2: {
      // croissant
      const g = new THREE.TorusGeometry(0.036, 0.016, 6, 9, P * 1.15).rotateX(-P / 2).rotateY(-P * 0.15);
      g.scale(1, 0.8, 1);
      c.add('goods', g, '#cf9640', xf(0, 0.018, 0));
      break;
    }
    case 3: {
      // iced cake slice (pie wedge)
      const w = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10, 1, false, 0, 0.75);
      c.add('goods', w, '#e7c78a', xf(0, 0.015, 0));
      c.add('goods', new THREE.CylinderGeometry(0.075, 0.075, 0.012, 10, 1, false, 0, 0.75), '#d97aa0', xf(0, 0.036, 0));
      c.ball('goods', 0.03, 0.05, 0.02, 0.012, '#8a1d2a', 1, 1, 1, 6, 4);
      break;
    }
    default: {
      // iced bun
      c.ball('goods', 0, 0.026, 0, 0.04, '#c58a3a', 1, 0.7, 1, 10, 6);
      c.ball('goods', 0, 0.04, 0, 0.03, '#f3ead5', 1, 0.45, 1, 10, 5);
    }
  }
}

/** Cake stand under a glass cloche, stocked. */
export function clocheStand(f: Frame, x: number, y: number, z: number, seed: number, cloche = true): void {
  const c = f.at(x, y, z);
  c.lathe('silver', [[0.001, 0], [0.07, 0], [0.075, 0.012], [0.02, 0.03], [0.014, 0.08], [0.02, 0.1], [0.1, 0.112], [0.17, 0.12], [0.17, 0.128], [0.001, 0.128]], 0, 0, 0, 22);
  c.lathe('goods', [[0.001, 0.128], [0.155, 0.128], [0.155, 0.132], [0.001, 0.132]], 0, 0, 0, 20, '#f4efe3');
  const R = rng(seed);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * P * 2 + R() * 0.4;
    pastry(c, i + seed, Math.cos(a) * 0.09, 0.132, Math.sin(a) * 0.09, a + P / 2);
  }
  pastry(c, seed + 7, 0, 0.132, 0, R() * 3);
  if (cloche) {
    c.lathe('glass', [[0.172, 0.132], [0.172, 0.17], [0.16, 0.26], [0.12, 0.33], [0.06, 0.37], [0.024, 0.382], [0.001, 0.384]], 0, 0, 0, 22);
    c.ball('brass', 0, 0.395, 0, 0.018, undefined, 1, 1, 1, 8, 6);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// flowers
// ---------------------------------------------------------------------------------------------------------------------
const ROSE = ['#b3122a', '#d4476a', '#f3d9cf', '#e8a0a8', '#c92b3f'];
const LILY = ['#faf6ee', '#f6e9ef', '#fbd4a0'];
const CARN = ['#f08aa5', '#f6f0f0', '#d62d52', '#f2a4b8'];

type Bloom = 'rose' | 'lily' | 'carnation';

function bloom(c: Frame, kind: Bloom, x: number, y: number, z: number, R: () => number, tilt: number): void {
  const m = c.at(x, y, z);
  if (kind === 'rose') {
    const col = ROSE[Math.floor(R() * ROSE.length)]!;
    m.ball('goods', 0, 0.014, 0, 0.034, col, 1, 0.9, 1, 7, 5);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * P * 2 + R();
      m.ball('goods', Math.cos(a) * 0.03, 0.02, Math.sin(a) * 0.03, 0.028, col, 1, 0.8, 0.6, 5, 4);
    }
  } else if (kind === 'lily') {
    const col = LILY[Math.floor(R() * LILY.length)]!;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * P * 2;
      const g = new THREE.ConeGeometry(0.02, 0.115, 4).rotateX(P / 2).translate(0, 0, 0.057);
      const rot = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationX(-0.55 - tilt * 0.2));
      m.add('goods', g, col, rot);
    }
    m.tube('goods', 0, 0, 0, 0.012, 0.06, 0.012, 0.003, 4, '#d9921e');
  } else {
    const col = CARN[Math.floor(R() * CARN.length)]!;
    const g = new THREE.IcosahedronGeometry(0.04, 1);
    g.scale(1, 0.75, 1);
    m.add('goods', g, col, xf(0, 0.014, 0));
    m.cyl('goods', 0, -0.012, 0, 0.012, 0.02, 6, '#4d7a3a');
  }
}

/** A bunch of stems fanning out of a vessel mouth at (x, y, z); `len` = stem length. */
export function bunch(f: Frame, kind: Bloom, x: number, y: number, z: number, n: number, len: number, spread: number, seed: number, lean = 0): void {
  const R = rng(seed);
  const c = f.at(x, y, z);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * P * 2 + R() * 0.8;
    const s = spread * (0.35 + R() * 0.65);
    const l = len * (0.78 + R() * 0.3);
    const tx = Math.cos(a) * s * l + lean * 0.12;
    const tz = Math.sin(a) * s * l;
    const ty = Math.sqrt(Math.max(0.01, l * l - tx * tx - tz * tz));
    c.tube('goods', 0, 0, 0, tx, ty, tz, 0.004, 4, '#3f6f35');
    if (R() < 0.6) {
      const lx = tx * 0.5;
      const lz = tz * 0.5;
      c.ball('goods', lx, ty * 0.5, lz, 0.04, '#4d8040', 0.35, 0.05, 1, 5, 3);
    }
    bloom(c, kind, tx, ty, tz, R, s);
  }
}

/** Galvanised bucket (open top, rim, bail handle), optionally stocked with flowers. */
export function bucket(f: Frame, x: number, z: number, kind: Bloom | null, seed: number, y = 0): void {
  const c = f.at(x, y, z);
  c.lathe('silver', [[0.001, 0], [0.135, 0], [0.145, 0.012], [0.2, 0.34], [0.206, 0.348], [0.2, 0.352], [0.192, 0.34], [0.14, 0.03], [0.001, 0.022]], 0, 0, 0, 18);
  c.add('silver', new THREE.TorusGeometry(0.2, 0.006, 5, 18).rotateX(P / 2), undefined, xf(0, 0.348, 0));
  c.add('silver', new THREE.TorusGeometry(0.2, 0.004, 4, 12, P).rotateY(P / 2), undefined, xf(0, 0.35, 0));
  if (kind) {
    c.cyl('goods', 0, 0.28, 0, 0.18, 0.003, 12, '#5a7a8c'); // water
    bunch(c, kind, 0, 0.3, 0, kind === 'carnation' ? 20 : kind === 'lily' ? 12 : 22, kind === 'lily' ? 0.62 : 0.52, 0.45, seed);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// sweets, chocolates, tins
// ---------------------------------------------------------------------------------------------------------------------
const CANDY = ['#d82e3a', '#f5efe0', '#e9a823', '#3a8f4a', '#d96aa4', '#2f78c4', '#f08a2a'];

/** Tall glass sweet jar with brass lid. */
export function sweetJar(f: Frame, x: number, y: number, z: number, h: number, r: number, seed: number): void {
  const c = f.at(x, y, z);
  const R = rng(seed);
  c.lathe('glass', [[r * 0.8, 0], [r, 0.012], [r, h * 0.8], [r * 0.7, h * 0.88], [r * 0.5, h * 0.92], [r * 0.5, h]], 0, 0, 0, 16);
  const layers = 5;
  const a = CANDY[Math.floor(R() * CANDY.length)]!;
  const b = CANDY[Math.floor(R() * CANDY.length)]!;
  for (let i = 0; i < layers; i++) c.cyl('goods', 0, 0.015 + i * ((h * 0.72) / layers), 0, r * 0.9, (h * 0.72) / layers - 0.004, 12, i % 2 ? a : b);
  for (let i = 0; i < 7; i++) c.ball('goods', (R() - 0.5) * r * 1.2, h * 0.74 + R() * 0.012, (R() - 0.5) * r * 1.2, 0.012, CANDY[Math.floor(R() * CANDY.length)]!, 1, 0.8, 1, 5, 3);
  c.cyl('brass', 0, h, 0, r * 0.58, 0.016, 14);
  c.ball('brass', 0, h + 0.03, 0, 0.016, undefined, 1, 1, 1, 8, 6);
}

/** Boxed chocolates with a ribbon. lid: 0..3 atlas lids. */
export function chocBox(f: Frame, atlas: ShopAtlas, x: number, y: number, z: number, lid: number, yaw = 0, w = 0.24, d = 0.17): void {
  const c = f.at(x, y, z, yaw);
  c.rbox('goods', -w / 2, 0, -d / 2, w / 2, 0.045, d / 2, 0.004, '#f2e4bd');
  const r = atlas.cell[`lid${lid % 4}`]!;
  c.top(r, 0, 0.0465, 0, w * 0.96, d * 0.96);
  const rib = ['#c8223a', '#e8c25a', '#1e3a66', '#f0d9e0'][lid % 4]!;
  c.box('goods', -0.012, 0.046, -d / 2 - 0.001, 0.012, 0.0475, d / 2 + 0.001, rib);
  c.ball('goods', 0.0, 0.056, 0, 0.018, rib, 1.5, 0.6, 1, 6, 4);
}

/** Pyramid of cylindrical tobacco tins (rows 4,3,2,1). */
export function tinPyramid(f: Frame, atlas: ShopAtlas, x: number, y: number, z: number, rows = 4): void {
  const c = f.at(x, y, z);
  const r = 0.042;
  const h = 0.085;
  for (let row = 0; row < rows; row++) {
    const n = rows - row;
    for (let i = 0; i < n; i++) {
      const px = (i - (n - 1) / 2) * (r * 2.1);
      const col = ['#8a1d1a', '#1d3a2a', '#c8a03e', '#1b2b4a'][(i + row) % 4]!;
      c.cyl('goods', px, row * h, 0, r, h, 12, col);
      c.cyl('brass', px, row * h + h, 0, r * 0.98, 0.004, 12);
    }
  }
  // label card behind
  c.plane(atlas.cell.tin0!, 0, rows * h * 0.5, -0.07, 0.16, 0.16);
}

// ---------------------------------------------------------------------------------------------------------------------
// till
// ---------------------------------------------------------------------------------------------------------------------
export function till(f: Frame, x: number, y: number, z: number, yaw = 0): void {
  const c = f.at(x, y, z, yaw);
  c.rbox('brass', -0.2, 0, -0.17, 0.2, 0.17, 0.17, 0.012);
  // sloped keyboard
  c.add('brass', new THREE.BoxGeometry(0.36, 0.05, 0.2), undefined, xf(0, 0.2, 0.03).multiply(new THREE.Matrix4().makeRotationX(-0.35)));
  for (let ix = 0; ix < 7; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      const kx = -0.14 + ix * 0.047;
      const kz = -0.01 + iz * 0.05;
      c.add('goods', new THREE.CylinderGeometry(0.012, 0.012, 0.012, 8), '#f1e8d2', xf(kx, 0.235 + iz * 0.014 * 1.2 - 0.0, kz));
    }
  }
  // tower with indicator tablet
  c.rbox('brass', -0.17, 0.2, -0.16, 0.17, 0.4, -0.04, 0.01);
  c.box('goods', -0.07, 0.29, -0.036, 0.07, 0.37, -0.03, '#f6edd4');
  c.box('brass', -0.09, 0.4, -0.15, 0.09, 0.43, -0.05);
  // crank and drawer ajar
  c.tube('brass', 0.2, 0.1, 0.0, 0.27, 0.14, 0.0, 0.007, 6);
  c.ball('wood', 0.28, 0.145, 0, 0.016, '#2a1608');
  c.rbox('dark', -0.18, 0.02, 0.17, 0.18, 0.07, 0.3, 0.006);
  c.box('goods', -0.15, 0.07, 0.19, -0.02, 0.074, 0.28, '#7a9a6c');
}

// ---------------------------------------------------------------------------------------------------------------------
// espresso machine (twin-boiler Deco: horizontal boiler, domed ends, eagle finial, four groups)
// ---------------------------------------------------------------------------------------------------------------------
export function espressoMachine(f: Frame, x: number, y: number, z: number, yaw = 0): void {
  const c = f.at(x, y, z, yaw);
  const len = 1.0;
  // base + drip tray with grille
  c.rbox('brass', -len / 2 - 0.08, 0, -0.24, len / 2 + 0.08, 0.06, 0.24, 0.015);
  c.rbox('silver', -len / 2, 0.06, 0.02, len / 2, 0.075, 0.23, 0.004);
  for (let i = 0; i < 14; i++) c.box('dark', -len / 2 + 0.03 + (i * (len - 0.06)) / 13, 0.075, 0.04, -len / 2 + 0.036 + (i * (len - 0.06)) / 13, 0.08, 0.22);
  // legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    c.cyl('brass', sx * (len / 2 - 0.05), 0.06, sz * 0.12, 0.022, 0.32, 10);
    c.ball('brass', sx * (len / 2 - 0.05), 0.06, sz * 0.12, 0.03, undefined, 1, 0.7, 1, 8, 5);
  }
  // main boiler: horizontal drum with end caps, raised bands
  const by = 0.52;
  c.cylX('brass', 0, by, -0.02, 0.17, len, 24);
  for (const sx of [-1, 1]) {
    c.ball('brass', sx * (len / 2), by, -0.02, 0.17, undefined, 0.5, 1, 1, 16, 10);
    c.cylX('brass', sx * (len / 2 - 0.12), by, -0.02, 0.18, 0.04, 24);
    c.cylX('brass', sx * (len / 2 - 0.3), by, -0.02, 0.18, 0.025, 24);
  }
  // dome + eagle finial
  c.lathe('brass', [[0.001, 0.0], [0.1, 0.0], [0.11, 0.03], [0.09, 0.07], [0.055, 0.1], [0.03, 0.12], [0.03, 0.14], [0.001, 0.16]], 0, by + 0.15, -0.02, 20);
  const e = c.at(0, by + 0.31, -0.02);
  e.ball('brass', 0, 0.02, 0, 0.03, undefined, 0.8, 1.2, 1, 8, 6);
  e.ball('brass', 0, 0.075, 0.012, 0.018, undefined, 1, 1, 1, 8, 6);
  e.add('brass', new THREE.ConeGeometry(0.008, 0.03, 4).rotateX(P / 2), undefined, xf(0, 0.075, 0.04));
  for (const sx of [-1, 1]) {
    e.add('brass', new THREE.BoxGeometry(0.085, 0.006, 0.05), undefined, xf(sx * 0.07, 0.04, -0.005).multiply(new THREE.Matrix4().makeRotationZ(sx * 0.4)));
    e.add('brass', new THREE.BoxGeometry(0.06, 0.005, 0.04), undefined, xf(sx * 0.12, 0.02, -0.005).multiply(new THREE.Matrix4().makeRotationZ(sx * 0.7)));
  }
  // gauges
  for (const gx of [-0.32, 0.32]) {
    c.add('goods', new THREE.CircleGeometry(0.04, 18), '#f4ecd4', xf(gx, by + 0.02, 0.153));
    c.add('brass', new THREE.TorusGeometry(0.042, 0.007, 6, 18), undefined, xf(gx, by + 0.02, 0.153));
    c.tube('goods', gx, by + 0.02, 0.155, gx + 0.02, by + 0.045, 0.155, 0.0015, 3, '#8a1d1a');
  }
  // four group heads with portafilters
  for (let i = 0; i < 4; i++) {
    const gx = -0.3 + i * 0.2;
    c.cyl('brass', gx, by - 0.2, 0.04, 0.045, 0.1, 12);
    c.cyl('silver', gx, by - 0.24, 0.04, 0.05, 0.04, 12);
    c.tube('wood', gx, by - 0.22, 0.04, gx + (i % 2 ? 0.04 : -0.04), by - 0.215, 0.2, 0.012, 6, '#3a2312');
    c.cyl('goods', gx, 0.08, 0.13, 0.035, 0.01, 8, '#f3eee2');
  }
  // steam wands
  for (const sx of [-1, 1]) {
    c.tube('silver', sx * (len / 2 - 0.06), by - 0.08, 0.13, sx * (len / 2 - 0.06), by - 0.3, 0.17, 0.009, 6);
    c.tube('silver', sx * (len / 2 - 0.06), by - 0.3, 0.17, sx * (len / 2 - 0.1), by - 0.38, 0.2, 0.007, 6);
    c.ball('brass', sx * (len / 2 - 0.06), by - 0.08, 0.13, 0.02, undefined, 1, 1, 1, 8, 5);
  }
  // cup rail on top (brass bars), warm cups stacked on it
  c.tube('brass', -0.35, by + 0.18, 0.08, 0.35, by + 0.18, 0.08, 0.008, 6);
  c.tube('brass', -0.35, by + 0.18, 0.08, -0.35, by + 0.15, -0.02, 0.006, 6);
  c.tube('brass', 0.35, by + 0.18, 0.08, 0.35, by + 0.15, -0.02, 0.006, 6);
}

// ---------------------------------------------------------------------------------------------------------------------
// bentwood chair + marble bistro table
// ---------------------------------------------------------------------------------------------------------------------
export function bentwoodChair(f: Frame, x: number, z: number, yaw: number): void {
  const c = f.at(x, 0, z, yaw);
  const w = '#3a2312';
  c.cyl('wood', 0, 0.44, 0, 0.19, 0.03, 18, undefined, 0.185);
  c.add('wood', new THREE.TorusGeometry(0.17, 0.01, 5, 18).rotateX(P / 2), undefined, xf(0, 0.45, 0));
  void w;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * P * 2 + P / 4;
    const bx = Math.cos(a) * 0.15;
    const bz = Math.sin(a) * 0.15;
    c.tube('wood', bx * 1.3, 0, bz * 1.3, bx, 0.45, bz, 0.012, 6);
  }
  c.add('wood', new THREE.TorusGeometry(0.15, 0.007, 5, 14).rotateX(P / 2), undefined, xf(0, 0.18, 0));
  // back: two rear posts curving up into a hoop
  for (const s of [-1, 1]) c.tube('wood', s * 0.13, 0.45, -0.12, s * 0.12, 0.9, -0.15, 0.011, 6);
  c.add('wood', new THREE.TorusGeometry(0.13, 0.009, 5, 14, P).rotateZ(0), undefined, xf(0, 0.88, -0.15));
  c.add('wood', new THREE.TorusGeometry(0.11, 0.006, 5, 12, P * 0.9).rotateZ(P * 1.05), undefined, xf(0, 0.64, -0.14));
  c.box('wood', -0.085, 0.56, -0.155, 0.085, 0.58, -0.145);
}

export function bistroTable(f: Frame, x: number, z: number): void {
  const c = f.at(x, 0, z);
  c.cyl('marble', 0, 0.7, 0, 0.36, 0.03, 28);
  c.cyl('brass', 0, 0.695, 0, 0.375, 0.012, 28);
  c.cyl('dark', 0, 0.06, 0, 0.03, 0.64, 10);
  c.lathe('dark', [[0.001, 0], [0.19, 0], [0.2, 0.012], [0.12, 0.04], [0.04, 0.07], [0.001, 0.07]], 0, 0, 0, 20);
  c.ball('dark', 0, 0.7, 0, 0.05, undefined, 1, 0.6, 1, 10, 5);
}

/** Domed brass pendant globe (glowing bulb in a brass cap) hanging from y=top. */
export function pendant(f: Frame, x: number, top: number, z: number, drop: number): void {
  f.tube('brass', x, top, z, x, top - drop, z, 0.006, 5);
  f.lathe('brass', [[0.001, top - drop + 0.02], [0.04, top - drop + 0.02], [0.05, top - drop + 0.06], [0.001, top - drop + 0.07]], x, 0, z, 12);
  f.ball('glow', x, top - drop, z, 0.095, undefined, 1, 1, 1, 12, 8);
}
