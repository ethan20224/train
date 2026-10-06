import * as THREE from 'three';
import { Frame, rng } from './frame';
import type { ShopAtlas } from './atlas';
import { counter } from './counter';
import { cup, clocheStand, espressoMachine, pendant, till } from './goods';
import { xf } from '../hotel/kit';

const P = Math.PI;

/**
 * Cross-platform kiosk, authored around its centre (local +z = toward the platforms): walnut body on a dark-marble plinth, two
 * serving bays (newsstand west, coffee east), black-glass fascia, stepped Deco roof and a small four-faced clock.
 * Footprint 5.0 x 2.8 (SHOPS.kiosk), height 4.4 (the hanging concourse clocks start at y 5.9).
 */
export function buildKiosk(f: Frame, atlas: ShopAtlas): void {
  const HX = 2.5;
  const HZ = 1.4;
  const openY1 = 2.38;
  const R = rng(321);
  // plinth + step
  f.rbox('dark', -HX, 0, -HZ, HX, 0.16, HZ, 0.02);
  f.box('brass', -HX + 0.02, 0.16, -HZ + 0.02, HX - 0.02, 0.17, HZ - 0.02);
  // walls: back and ends walnut with panelling; the front is pierced by two bays
  f.box('wood', -HX + 0.1, 0.17, -HZ + 0.1, HX - 0.1, 2.6, -HZ + 0.22);
  for (const s of [-1, 1]) {
    f.box('wood', s * HX - (s > 0 ? 0.22 : -0.1) + (s > 0 ? 0 : 0), 0.17, -HZ + 0.1, s * HX - (s > 0 ? 0.1 : -0.22), 2.6, HZ - 0.1);
    for (let i = 0; i < 3; i++) {
      const z0 = -HZ + 0.25 + i * 0.85;
      const xo = s * (HX - 0.1);
      f.box('brass', xo - 0.002, 0.45, z0, xo + 0.002, 2.25, z0 + 0.012);
      f.box('brass', xo - 0.002, 0.45, z0 + 0.7, xo + 0.002, 2.25, z0 + 0.712);
      f.box('brass', xo - 0.002, 0.45, z0, xo + 0.002, 0.462, z0 + 0.712);
      f.box('brass', xo - 0.002, 2.238, z0, xo + 0.002, 2.25, z0 + 0.712);
    }
  }
  // front piers and lintel
  const pierX = [-HX + 0.1, 0, HX - 0.1];
  for (const px of pierX) {
    const hw = px === 0 ? 0.16 : 0.12;
    f.rbox('wood', px - hw, 0.17, HZ - 0.28, px + hw, 2.62, HZ, 0.012);
    f.box('brass', px - hw - 0.02, 0.17, HZ - 0.03, px + hw + 0.02, 0.2, HZ + 0.02);
    f.box('brass', px - hw - 0.02, openY1, HZ - 0.03, px + hw + 0.02, openY1 + 0.03, HZ + 0.02);
    for (const dx of [-hw / 2, hw / 2]) f.box('brass', px + dx - 0.004, 0.4, HZ, px + dx + 0.004, 2.2, HZ + 0.008);
  }
  // lintel / fascia band across the front with the two signs
  f.box('wood', -HX + 0.1, openY1, HZ - 0.3, HX - 0.1, 2.9, HZ - 0.02);
  f.plane(atlas.cell.kioskNews!, -1.25, 2.64, HZ - 0.015, 2.0, 0.375);
  f.plane(atlas.cell.kioskCoffee!, 1.25, 2.64, HZ - 0.015, 2.0, 0.375);
  f.frame('brass', -2.28, 2.43, -0.24, 2.85, HZ - 0.03, HZ - 0.012, 0.014);
  f.frame('brass', 0.24, 2.43, 2.28, 2.85, HZ - 0.03, HZ - 0.012, 0.014);
  // stepped roof
  f.rbox('dark', -HX - 0.06, 2.9, -HZ - 0.06, HX + 0.06, 3.02, HZ + 0.06, 0.012);
  f.box('brass', -HX - 0.062, 2.99, -HZ - 0.062, HX + 0.062, 3.004, HZ + 0.062);
  f.rbox('wood', -2.0, 3.02, -1.0, 2.0, 3.28, 1.0, 0.012);
  f.box('brass', -2.01, 3.26, -1.01, 2.01, 3.274, 1.01);
  f.rbox('wood', -1.35, 3.28, -0.62, 1.35, 3.5, 0.62, 0.012);
  f.box('brass', -1.36, 3.48, -0.63, 1.36, 3.494, 0.63);
  // clock turret
  f.rbox('wood', -0.3, 3.5, -0.3, 0.3, 3.62, 0.3, 0.01);
  f.rbox('dark', -0.26, 3.62, -0.26, 0.26, 4.0, 0.26, 0.015);
  for (let k = 0; k < 4; k++) {
    const yaw = (k * P) / 2;
    f.plane(atlas.cell.clock!, Math.sin(yaw) * 0.262, 3.81, Math.cos(yaw) * 0.262, 0.4, 0.4, yaw);
    const ring = new THREE.TorusGeometry(0.205, 0.012, 6, 24);
    f.add('brass', ring, undefined, xf(Math.sin(yaw) * 0.262, 3.81, Math.cos(yaw) * 0.262, yaw));
  }
  const cap = new THREE.ConeGeometry(0.4, 0.26, 4).rotateY(P / 4);
  f.add('brass', cap, undefined, xf(0, 4.13, 0));
  f.ball('brass', 0, 4.3, 0, 0.045);

  // ---- interior (warm, lit, unattended) ------------------------------------------------------------------------------------
  f.box('warm', -HX + 0.22, 0.17, -HZ + 0.22, HX - 0.22, 2.38, -HZ + 0.26, '#ecd2a0');
  f.box('warm', -HX + 0.22, 2.36, -HZ + 0.22, HX - 0.22, 2.4, HZ - 0.3, '#f6e3b8');
  f.box('wood', -HX + 0.22, 0.17, -HZ + 0.26, HX - 0.22, 1.0, -HZ + 0.34);
  f.box('wood', -HX + 0.22, 0.17, -HZ + 0.22, HX - 0.22, 0.2, HZ - 0.28); // floor
  f.box('glow', -2.0, 2.33, -0.5, -0.4, 2.36, -0.3, '#9a9a9a');
  f.box('glow', 0.4, 2.33, -0.5, 2.0, 2.36, -0.3, '#9a9a9a');
  pendant(f, -1.25, 2.38, 0.1, 0.32);
  pendant(f, 1.25, 2.38, 0.1, 0.32);

  // front counters (fluted walnut, marble tops) in both bays
  counter(f, -2.3, -0.2, 0.55, 1.22, { fluted: true, h: 1.0 });
  counter(f, 0.2, 2.3, 0.55, 1.22, { fluted: true, h: 1.0 });

  // --- newsstand bay (west) ---------------------------------------------------------------------------------------------------------
  for (let t = 0; t < 3; t++) {
    const y = 1.2 + t * 0.4;
    f.box('wood', -2.2, y - 0.02, -HZ + 0.26, -0.3, y, -HZ + 0.5);
    for (let i = 0; i < 9; i++) {
      const k = Math.floor(R() * 12);
      f.plane(atlas.cell[`cover${k}`]!, -2.1 + i * 0.2, y + 0.18, -HZ + 0.52, 0.18, 0.25, 0, -0.08);
    }
  }
  for (let i = 0; i < 5; i++) f.plane(atlas.cell[`paper${i}`]!, -2.05 + i * 0.36, 1.19, 0.5, 0.3, 0.38, 0, -0.62);
  f.add('wood', new THREE.BoxGeometry(1.9, 0.03, 0.4), undefined, xf(-1.25, 1.12, 0.5).multiply(new THREE.Matrix4().makeRotationX(-0.62)));
  till(f, -0.55, 1.0, 0.8, 0.3);
  f.box('goods', -1.9, 1.0, 0.82, -1.5, 1.1, 1.1, '#dccfab');
  f.top(atlas.cell.paper1!, -1.7, 1.101, 0.96, 0.38, 0.26, 0.3);
  // hanging clips of cards on a rail
  f.tube('brass', -2.2, 2.2, -HZ + 0.3, -0.3, 2.2, -HZ + 0.3, 0.008, 5);
  for (let i = 0; i < 6; i++) f.plane(atlas.cell[`card${i % 4}`]!, -2.0 + i * 0.3, 2.02, -HZ + 0.31, 0.2, 0.14);

  // --- coffee bay (east) -------------------------------------------------------------------------------------------------------------------
  for (const y of [1.55, 2.0]) {
    f.box('wood', 0.3, y - 0.02, -HZ + 0.26, 2.2, y, -HZ + 0.5);
    for (let i = 0; i < 7; i++) {
      f.cyl('goods', 0.45 + i * 0.26, y, -HZ + 0.38, 0.06, 0.12 + (i % 3) * 0.03, 10, ['#7a1f24', '#c9a24a', '#1f3d57', '#2f5a3f'][i % 4]);
      f.cyl('brass', 0.45 + i * 0.26, y + 0.12 + (i % 3) * 0.03, -HZ + 0.38, 0.062, 0.01, 10);
    }
  }
  f.plane(atlas.cell.menu!, 1.25, 1.35, -HZ + 0.27, 0.5, 0.5);
  f.frame('brass', 1.0, 1.1, 1.5, 1.6, -HZ + 0.26, -HZ + 0.285, 0.018);
  espressoMachine(f, 1.5, 1.0, 0.85, 0);
  clocheStand(f, 0.6, 1.0, 0.98, 4);
  for (let i = 0; i < 4; i++) cup(f, 1.0 + i * 0.17, 1.0, 1.15, i, i !== 2);
}
