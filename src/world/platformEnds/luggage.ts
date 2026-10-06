import * as THREE from 'three';
import { BARROWS, PILES } from './data';
import { at, box, cyl, mul, strut, xcyl, type Bags } from './kit';

const TRUNK_COLORS = [0x5b3a22, 0x2f4a3b, 0x6b2a22, 0x8a6a42, 0x3a3f4a];
const HAT_COLORS = [0xd8c9a4, 0x6f8fa8, 0x7a2e3a, 0xb59a6a];
const SACK = 0xa8987a;
const WOOD = 0x6b4a2e;
const BLACK = 0x15120f;

/** Domed steamer trunk: leather body, half-cylinder lid, brass corners / straps / lock. Origin = centre of base. */
function trunk(b: Bags, m: THREE.Matrix4, w: number, h: number, d: number, colour: number): void {
  const bodyH = h * 0.78;
  b.goods.add(box(-w / 2, w / 2, 0, bodyH, -d / 2, d / 2), colour, m);
  const lid = new THREE.CylinderGeometry(1, 1, d, 14, 1, false, Math.PI / 2, Math.PI);
  lid.rotateX(Math.PI / 2);
  lid.scale(w / 2, (h - bodyH) / 1, 1);
  lid.translate(0, bodyH, 0);
  b.goods.add(lid, colour, m);
  // wooden slats (lighter) across the lid sides
  for (const s of [-1, 1]) b.goods.add(box(s * (w / 2 + 0.004) - 0.004, s * (w / 2 + 0.004) + 0.004, 0.02, bodyH - 0.02, -d / 2 + 0.03, d / 2 - 0.03), 0x7a5a3a, m);
  for (const z of [-d * 0.3, d * 0.3]) {
    b.brass.add(box(-w / 2 - 0.006, w / 2 + 0.006, 0.0, bodyH + 0.004, z - 0.018, z + 0.018), 0xffffff, m);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.brass.add(box(sx * w / 2 - 0.03 * sx - 0.001, sx * w / 2 + 0.008 * sx, 0, 0.06, sz * d / 2 - 0.03 * sz, sz * d / 2 + 0.008 * sz), 0xffffff, m);
  b.brass.add(box(-0.035, 0.035, bodyH - 0.1, bodyH - 0.02, d / 2, d / 2 + 0.012), 0xffffff, m);
}

function hatbox(b: Bags, m: THREE.Matrix4, r: number, h: number, colour: number): void {
  b.goods.add(cyl(r, h * 0.72, 0, 0, 0, 20), colour, m);
  b.goods.add(cyl(r + 0.006, h * 0.28, 0, h * 0.72, 0, 20), colour, m, 0.85);
  b.goods.add(cyl(r + 0.009, 0.012, 0, h * 0.5, 0, 20), 0x2a1c14, m);
  b.brass.add(box(-0.015, 0.015, h - 0.03, h - 0.005, -0.03, 0.03), 0xffffff, m);
}

/** Canvas mail sack, pinched and tied at the neck. */
function sack(b: Bags, m: THREE.Matrix4, s = 1): void {
  const g = new THREE.SphereGeometry(0.5, 14, 10);
  g.scale(0.27 * s, 0.4 * s, 0.2 * s);
  g.translate(0, 0.36 * s, 0);
  b.goods.add(g, SACK, m);
  b.goods.add(cyl(0.085 * s, 0.17 * s, 0, 0.64 * s, 0, 10, 0.06 * s), 0x8a7a5c, m);
  b.goods.add(cyl(0.1 * s, 0.03 * s, 0, 0.62 * s, 0, 10), 0x4a3b28, m);
  b.goods.add(box(-0.09 * s, 0.09 * s, 0.26 * s, 0.4 * s, 0.185 * s, 0.2 * s), 0x8b2d24, m); // postal label
}

/** Brass station barrow, handles toward local +z. */
function barrow(b: Bags, m: THREE.Matrix4): void {
  const WH = 0.36;
  // wheels
  for (const s of [-1, 1]) {
    const wx = s * 0.44;
    const tyre = new THREE.TorusGeometry(WH - 0.03, 0.03, 8, 28);
    tyre.rotateY(Math.PI / 2);
    b.paint.add(tyre, BLACK, mul(m, at(wx, WH, 0.25)));
    b.brass.add(xcyl(0.055, 0.1, wx, WH, 0.25, 12), 0xffffff, m);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.brass.add(strut([wx, WH, 0.25], [wx, WH + Math.cos(a) * (WH - 0.04), 0.25 + Math.sin(a) * (WH - 0.04)], 0.012), 0xffffff, m);
    }
  }
  b.brass.add(xcyl(0.02, 0.9, 0, WH, 0.25, 8), 0xffffff, m);
  // frame: side rails -> handles, cross-bars, deck
  for (const s of [-1, 1]) {
    const x = s * 0.4;
    b.brass.add(strut([x, 0.6, -0.72], [x, 0.6, 0.95], 0.035), 0xffffff, m);
    b.brass.add(strut([x, 0.6, 0.95], [x, 0.84, 1.62], 0.032), 0xffffff, m);
    // front legs and the tall back frame
    b.brass.add(strut([x, 0.0, -0.8], [x, 0.6, -0.68], 0.03), 0xffffff, m);
    b.brass.add(strut([x, 0.6, -0.72], [x, 1.38, -0.72], 0.028), 0xffffff, m);
    b.brass.add(strut([x, 0.66, 0.5], [x * 0.9, 0.62, 0.62], 0.02), 0xffffff, m);
  }
  for (const z of [-0.72, 0.25, 0.95]) b.brass.add(strut([-0.4, 0.6, z], [0.4, 0.6, z], 0.03), 0xffffff, m);
  for (const y of [1.0, 1.38]) b.brass.add(strut([-0.4, y, -0.72], [0.4, y, -0.72], 0.028), 0xffffff, m);
  b.brass.add(strut([-0.4, 0.66, -0.72], [0.4, 1.0, -0.72], 0.015), 0xffffff, m);
  b.brass.add(strut([0.4, 0.66, -0.72], [-0.4, 1.0, -0.72], 0.015), 0xffffff, m);
  b.brass.add(strut([-0.4, 0.84, 1.62], [0.4, 0.84, 1.62], 0.034), 0xffffff, m);
  b.goods.add(box(-0.38, 0.38, 0.6, 0.64, -0.7, 0.93), WOOD, m);
  for (let z = -0.55; z < 0.93; z += 0.3) b.goods.add(box(-0.38, 0.38, 0.636, 0.642, z - 0.005, z + 0.005), 0x3a2814, m);
}

/** Local offset in a parent frame, with its own yaw. */
const L = (parent: THREE.Matrix4, x: number, y: number, z: number, ry = 0): THREE.Matrix4 => mul(parent, at(x, y, z, ry));

export function buildLuggage(b: Bags): void {
  for (const bw of BARROWS) {
    const m = at(bw.x, 0, bw.z, bw.yaw);
    barrow(b, m);
    const deck = 0.64;
    switch (bw.load) {
      case 'tall': {
        trunk(b, L(m, 0, deck, -0.12, 0.05), 0.82, 0.52, 0.52, TRUNK_COLORS[0]!);
        trunk(b, L(m, 0.05, deck + 0.52, -0.1, -0.2), 0.62, 0.4, 0.42, TRUNK_COLORS[1]!);
        hatbox(b, L(m, -0.12, deck + 0.52 + 0.4, -0.1, 0.4), 0.19, 0.2, HAT_COLORS[0]!);
        sack(b, L(m, 0.06, deck, 0.58, 0.5));
        break;
      }
      case 'sacks': {
        sack(b, L(m, -0.18, deck, -0.25, 0.3));
        sack(b, L(m, 0.2, deck, -0.2, -0.2));
        sack(b, L(m, 0.0, deck + 0.36, -0.2, 0.9), 0.95);
        sack(b, L(m, -0.12, deck, 0.4, 0.1));
        sack(b, L(m, 0.2, deck, 0.45, -0.6), 0.9);
        // one slumped sack on the ground by the wheel
        const g = L(m, 0.95, 0, 0.1, 0.8);
        const lying = mul(g, new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.1));
        lying.setPosition(new THREE.Vector3().setFromMatrixPosition(g).add(new THREE.Vector3(0, 0.2, 0)));
        sack(b, lying);
        break;
      }
      case 'trunk': {
        trunk(b, L(m, 0, deck, -0.05, 0), 0.78, 0.5, 0.5, TRUNK_COLORS[3]!);
        hatbox(b, L(m, -0.15, deck + 0.5, -0.05, 0.3), 0.18, 0.2, HAT_COLORS[1]!);
        hatbox(b, L(m, 0.15, deck, 0.58, 0), 0.17, 0.18, HAT_COLORS[2]!);
        break;
      }
      case 'lonely': {
        hatbox(b, L(m, 0.02, deck, 0.0, 0.3), 0.19, 0.2, HAT_COLORS[3]!);
        sack(b, L(m, 0.0, deck, 0.58, 2.2), 0.85);
        break;
      }
    }
  }
  // luggage left on the ground, no barrow
  for (const p of PILES) {
    const m = at(p.x, 0, p.z, p.yaw);
    trunk(b, L(m, -0.3, 0, 0, 0), 0.84, 0.54, 0.54, TRUNK_COLORS[2]!);
    trunk(b, L(m, -0.26, 0.54, 0.02, 0.35), 0.62, 0.4, 0.42, TRUNK_COLORS[4]!);
    hatbox(b, L(m, -0.3, 0.94, 0, 0.7), 0.17, 0.2, HAT_COLORS[1]!);
    trunk(b, L(m, 0.55, 0, 0.15, -0.3), 0.7, 0.46, 0.46, TRUNK_COLORS[0]!);
    sack(b, L(m, 0.15, 0, -0.55, 0.9));
    sack(b, L(m, 0.48, 0, 0.7, -0.4), 0.9);
  }
}
