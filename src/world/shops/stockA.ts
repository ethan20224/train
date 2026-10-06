import * as THREE from 'three';
import { Frame, rng } from './frame';
import type { ShopAtlas } from './atlas';
import { counter, shelf } from './counter';
import { bucket, bunch, chocBox, sweetJar, till, tinPyramid } from './goods';
import { xf } from '../hotel/kit';

const P = Math.PI;

/** Rows of propped magazine covers on a stepped riser; (x0..x1) at depth z, base height y. */
function coverRow(f: Frame, atlas: ShopAtlas, x0: number, x1: number, y: number, z: number, seed: number, pitch = -0.2, w = 0.2, h = 0.28): void {
  const R = rng(seed);
  const n = Math.floor((x1 - x0) / (w + 0.015));
  const gap = (x1 - x0 - n * w) / (n + 1);
  for (let i = 0; i < n; i++) {
    const x = x0 + gap * (i + 1) + w * (i + 0.5);
    const k = Math.floor(R() * 12);
    f.plane(atlas.cell[`cover${k}`]!, x, y + h / 2 * Math.cos(pitch), z, w, h, (R() - 0.5) * 0.06, pitch);
  }
}

/** Newsagent & Tobacconist (x_l: window -4.28..2.84, door 3.35). */
export function stockNewsstand(f: Frame, atlas: ShopAtlas): void {
  // --- back wall: periodical pigeonholes, three tiers of covers ----------------------------------------------------
  for (const y of [1.15, 1.7, 2.25]) shelf(f, -4.2, 1.15, y, 0.05, 0.22);
  for (let t = 0; t < 3; t++) coverRow(f, atlas, -4.15, 1.1, 1.15 + t * 0.55 + 0.01, 0.2, 10 + t, -0.1, 0.2, 0.4);
  // upright dividers
  for (let i = 0; i <= 5; i++) f.box('wood', -4.2 + i * 1.07, 1.0, 0.05, -4.18 + i * 1.07, 2.5, 0.24);

  // --- tobacco wall behind the counter (right): tins, cigar boxes, pipes -------------------------------------------------
  for (const y of [1.25, 1.75, 2.25]) shelf(f, 1.3, 4.2, y, 0.05, 0.28);
  tinPyramid(f, atlas, 2.0, 1.25, 0.18, 4);
  tinPyramid(f, atlas, 3.15, 1.75, 0.18, 3);
  tinPyramid(f, atlas, 2.1, 2.25, 0.18, 3);
  for (let i = 0; i < 4; i++) {
    f.rbox('wood', 3.3 + i * 0.22 - 0.05, 1.25, 0.1, 3.3 + i * 0.22 + 0.12, 1.4, 0.3, 0.006, ['#7a3a1c', '#5a2a12', '#8a4a22', '#3a1f10'][i]);
    f.box('goods', 3.3 + i * 0.22 - 0.02, 1.4, 0.12, 3.3 + i * 0.22 + 0.09, 1.405, 0.28, '#d9b25c');
  }
  for (let i = 0; i < 5; i++) {
    const px = 1.5 + i * 0.3;
    f.tube('wood', px, 1.78, 0.2, px + 0.09, 1.78, 0.2, 0.011, 6, '#2a170b');
    f.ball('wood', px - 0.01, 1.82, 0.2, 0.026, '#2a170b', 1, 1.1, 1, 8, 6);
    f.tube('wood', px + 0.09, 1.78, 0.2, px + 0.17, 1.76, 0.2, 0.006, 5, '#111');
  }
  // tobacco tins in rows on the top tier
  for (let i = 0; i < 9; i++) f.cyl('goods', 2.8 + i * 0.1, 2.25, 0.2, 0.04, 0.07, 10, ['#8a1d1a', '#c8a03e', '#1d3a2a'][i % 3]);

  // --- counter with brass till ---------------------------------------------------------------------------------------------
  counter(f, 1.2, 4.2, 0.62, 1.2, { fluted: true });
  till(f, 3.4, 1.0, 0.9, -0.15);
  // tied bundle of today's papers + a loose copy, the open ledger, pencil
  f.box('goods', 1.55, 1.0, 0.72, 2.0, 1.1, 1.05, '#dccfab');
  f.top(atlas.cell.paper2!, 1.775, 1.101, 0.885, 0.45, 0.33, 0.12);
  f.box('goods', 1.75, 1.04, 0.7, 1.77, 1.06, 1.07, '#6a5030');
  f.top(atlas.cell.paper0!, 2.5, 1.002, 1.0, 0.38, 0.3, -0.5);
  f.box('goods', 2.6, 1.0, 0.7, 2.95, 1.014, 0.98, '#e8dfc4');
  f.tube('wood', 2.7, 1.02, 0.8, 2.82, 1.02, 0.9, 0.004, 5, '#c9a032');
  // postcard spinner: brass stem, four tiers of cards
  const sx = -1.7;
  f.cyl('brass', sx, 0, 1.5, 0.12, 0.03, 16);
  f.cyl('brass', sx, 0.03, 1.5, 0.012, 1.45, 8);
  for (let t = 0; t < 4; t++) {
    const y = 0.82 + t * 0.27;
    f.cyl('brass', sx, y - 0.02, 1.5, 0.04, 0.02, 10);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * P * 2;
      f.plane(atlas.cell[`card${(k + t) % 4}`]!, sx + Math.sin(a) * 0.15, y + 0.1, 1.5 + Math.cos(a) * 0.15, 0.1, 0.07, a, -0.12, true);
    }
  }
  f.ball('brass', sx, 2.28, 1.5, 0.03);

  // --- newspaper rack: leaning papers on a slanted board, left of the door -------------------------------------------------
  f.add('wood', new THREE.BoxGeometry(1.8, 0.05, 0.6), undefined, xf(1.6, 0.0, 1.35).multiply(new THREE.Matrix4().makeTranslation(0, 0.95, 0)).multiply(new THREE.Matrix4().makeRotationX(-0.5)));
  for (const lx of [0.8, 2.4]) f.tube('wood', lx, 0, 1.55, lx, 0.8, 1.55, 0.03, 6);
  for (let i = 0; i < 6; i++) f.plane(atlas.cell[`paper${i}`]!, 0.9 + i * 0.3, 1.14, 1.34, 0.28, 0.4, 0, -0.5 - 0.02);

  // --- window: stepped riser carrying covers and papers ---------------------------------------------------------------------
  const wz = [2.55, 2.28, 2.0];
  const wy = [SILL + 0.0, SILL + 0.22, SILL + 0.44];
  for (let t = 0; t < 3; t++) {
    f.box('wood', -4.12, wy[t]!, wz[t]! - 0.13, 2.7, wy[t]! + 0.03, wz[t]! + 0.13);
    f.box('wood', -4.12, SILL, wz[t]! - 0.13, 2.7, wy[t]!, wz[t]! - 0.1);
    f.box('brass', -4.12, wy[t]! + 0.03, wz[t]! + 0.125, 2.7, wy[t]! + 0.036, wz[t]! + 0.135);
  }
  for (let t = 0; t < 3; t++) coverRow(f, atlas, -4.1, 2.68, wy[t]! + 0.04, wz[t]! + 0.04, 40 + t, -0.28, 0.2, 0.27);
  // fanned broadsheets on the top step, tilted
  for (let i = 0; i < 5; i++) f.plane(atlas.cell[`paper${i}`]!, -2.2 + i * 0.12, 1.55, 1.6, 0.34, 0.44, 0.0, -0.18 - i * 0.015);
  // tall headline board in the window
  f.box('wood', -0.36, SILL + 0.66, 1.52, 0.76, 2.08, 1.56);
  f.plane(atlas.cell.paper4!, 0.2, 1.8, 1.565, 0.92, 1.1);
  f.frame('brass', -0.28, 1.25, 0.68, 2.35, 1.56, 1.575, 0.02);
  // --- outside: tied bundle of papers by the door, A-board with the day's headline ------------------------------------------
  f.box('goods', 3.25, 0, 3.22, 3.75, 0.3, 3.58, '#dccfab');
  for (let i = 1; i < 6; i++) f.box('goods', 3.25, i * 0.05 - 0.004, 3.215, 3.75, i * 0.05, 3.585, '#b9aa84');
  f.top(atlas.cell.paper5!, 3.5, 0.301, 3.4, 0.48, 0.34, 0.15);
  f.box('goods', 3.46, 0.0, 3.21, 3.48, 0.31, 3.59, '#3a2a1a');
  f.box('goods', 3.24, 0.17, 3.2, 3.76, 0.19, 3.6, '#3a2a1a');
  const ab = f.at(-3.1, 0, 3.45);
  ab.add('wood', new THREE.BoxGeometry(0.6, 0.95, 0.025), undefined, xf(0, 0.475, -0.13).multiply(new THREE.Matrix4().makeRotationX(0.2)));
  ab.add('wood', new THREE.BoxGeometry(0.6, 0.95, 0.025), undefined, xf(0, 0.475, 0.13).multiply(new THREE.Matrix4().makeRotationX(-0.2)));
  ab.plane(atlas.cell.paper3!, 0, 0.5, 0.13 + 0.02, 0.5, 0.6, 0, -0.2);
  ab.frame('brass', -0.26, 0.2, 0.26, 0.82, 0.145, 0.155, 0.012);
  ab.tube('brass', -0.28, 0.93, 0, 0.28, 0.93, 0, 0.008, 5);
}

const SILL = 0.86;

/** Florist & Confectioner. Door at x_l 0. West half flowers, east half sweets. */
export function stockFlorist(f: Frame, atlas: ShopAtlas): void {
  const R = rng(77);
  // === WEST: flowers ==========================================================================================
  // back wall: vase shelves
  for (const y of [1.2, 1.8]) shelf(f, -4.2, -0.6, y, 0.05, 0.3);
  for (let i = 0; i < 6; i++) {
    const vx = -3.9 + i * 0.58;
    const kinds = ['rose', 'lily', 'carnation'] as const;
    for (const [row, y] of [[0, 1.2], [1, 1.8]] as const) {
      f.lathe('goods', [[0.001, 0], [0.05, 0], [0.065, 0.1], [0.04, 0.2], [0.05, 0.24], [0.045, 0.24], [0.03, 0.18], [0.001, 0.01]], vx, y, 0.22, 14, ['#5a7aa0', '#d9c89a', '#7a8a62'][(i + row) % 3]);
      bunch(f, kinds[(i + row * 2) % 3]!, vx, y + 0.22, 0.22, 5 + (i % 3), 0.38, 0.4, 100 + i * 7 + row * 13);
    }
  }
  // wrapping table
  counter(f, -3.7, -0.9, 0.7, 1.35, { top: 'marble', h: 0.95 });
  // brown paper roll, ribbons, shears, a half-wrapped bouquet
  f.cylZ('goods', -3.5, 1.05, 1.0, 0.06, 0.5, 10, '#b88a52');
  for (let i = 0; i < 4; i++) f.cyl('goods', -3.0 + i * 0.11, 0.95, 0.95, 0.04, 0.03, 10, ['#c8223a', '#e8c25a', '#1e3a66', '#f0d9e0'][i]);
  f.box('goods', -2.0, 0.95, 0.85, -1.2, 0.962, 1.15, '#c9a97a');
  bunch(f, 'rose', -1.6, 0.97, 1.0, 9, 0.35, 0.55, 301, 1);
  // floor buckets inside
  const kinds2 = ['lily', 'rose', 'carnation', 'lily'] as const;
  for (let i = 0; i < 4; i++) bucket(f, -4.0 + i * 0.52 + (i > 1 ? 0.0 : 0), 1.95 + (i % 2) * 0.12, kinds2[i]!, 400 + i, 0.0);
  // window display (west): stepped riser with vases
  for (const [i, z] of [2.55, 2.25, 1.95].entries()) {
    f.box('wood', -4.1, SILL + i * 0.22, z - 0.14, -0.62, SILL + i * 0.22 + 0.03, z + 0.14);
    f.box('wood', -4.1, SILL, z - 0.14, -0.62, SILL + i * 0.22, z - 0.11);
  }
  const kk = ['rose', 'lily', 'carnation'] as const;
  for (let i = 0; i < 4; i++) for (let t = 0; t < 3; t++) {
    const vx = -3.8 + i * 0.85 + t * 0.12;
    const z = [2.5, 2.2, 1.9][t]!;
    const y = SILL + t * 0.22 + 0.03;
    f.lathe('silver', [[0.001, 0], [0.06, 0], [0.075, 0.12], [0.05, 0.2], [0.001, 0.2]], vx, y, z, 12);
    bunch(f, kk[(i + t) % 3]!, vx, y + 0.2, z, 7, 0.34, 0.45, 500 + i * 11 + t);
  }

  // === EAST: confectioner =========================================================================================
  for (const y of [1.1, 1.62, 2.14]) shelf(f, 0.6, 4.2, y, 0.05, 0.3);
  let jc = 0;
  for (const [row, y] of [[0, 1.1], [1, 1.62], [2, 2.14]] as const) {
    for (let i = 0; i < 6; i++) {
      const tall = row === 2 ? 0.32 : 0.36;
      sweetJar(f, 0.95 + i * 0.58, y, 0.22, tall, 0.095, 600 + jc++);
    }
  }
  // glass-fronted counter: marble top with boxed chocolates
  counter(f, 1.0, 4.0, 0.62, 1.2, { top: 'marble' });
  for (let i = 0; i < 6; i++) chocBox(f, atlas, 1.3 + i * 0.4, 1.0, 0.95 + (i % 2) * 0.05, i, (R() - 0.5) * 0.3);
  chocBox(f, atlas, 1.55, 1.045, 0.95, 2, 0.1, 0.2, 0.14);
  // brass balance scale
  const sc = f.at(3.5, 1.0, 0.92);
  sc.cyl('brass', 0, 0, 0, 0.07, 0.025, 14);
  sc.cyl('brass', 0, 0.025, 0, 0.012, 0.38, 8);
  sc.tube('brass', -0.2, 0.4, 0, 0.2, 0.4, 0, 0.007, 6);
  for (const s of [-1, 1]) {
    sc.tube('brass', s * 0.2, 0.4, 0, s * 0.2, 0.2, 0, 0.002, 3);
    sc.lathe('brass', [[0.001, 0.19], [0.08, 0.2], [0.09, 0.215], [0.08, 0.2]], s * 0.2, 0, 0, 14);
  }
  sc.ball('goods', -0.2, 0.22, 0, 0.03, '#4a2a18', 1, 0.7, 1, 8, 5);
  // window display (east): pyramids of boxes and tall jars
  for (const [i, z] of [2.55, 2.25, 1.95].entries()) {
    f.box('wood', 0.62, SILL + i * 0.22, z - 0.14, 4.1, SILL + i * 0.22 + 0.03, z + 0.14);
    f.box('wood', 0.62, SILL, z - 0.14, 4.1, SILL + i * 0.22, z - 0.11);
  }
  for (let t = 0; t < 3; t++) for (let i = 0; i < 5 - t; i++) {
    const bx = 1.2 + i * 0.58 + t * 0.29 - 0.0;
    chocBox(f, atlas, bx, SILL + 0.03 + t * 0.22 - 0.0, [2.5, 2.2, 1.9][t]!, i + t, (R() - 0.5) * 0.25, 0.3, 0.21);
  }
  for (const x of [0.95, 3.85]) sweetJar(f, x, SILL + 0.03, 2.3, 0.5, 0.14, 700 + x);
  // ribbons draped on the sill
  f.box('goods', 0.7, SILL + 0.032, 2.6, 4.0, SILL + 0.036, 2.64, '#8a1d2a');

  // === OUTSIDE: buckets of flowers each side of the door, a tiered stand ==================================================
  const order = ['rose', 'lily', 'carnation', 'rose', 'lily', 'carnation'] as const;
  [-4.0, -3.35, -2.7, 2.7, 3.35, 4.0].forEach((lx, i) => bucket(f, lx, 3.3, order[i]!, 800 + i));
}
