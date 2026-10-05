import * as THREE from 'three';
import { VAULT } from '../../layout';
import { GeoBag, latheMeters, v3, type P2 } from './geo';
import { SIDE_WALLS, PILASTER_Z, uOfZ } from './frames';
import { TORCHERES } from '../props/layout';

export interface LampBags {
  brass: GeoBag;
  /** large opal-glass globes */
  opal: GeoBag;
  /** small hot bulbs */
  bulb: GeoBag;
}

const TAU = Math.PI * 2;

function lathe(pts: P2[], seg = 24): THREE.BufferGeometry {
  return latheMeters(pts, seg, 1, 1);
}

/** Torus ring (axis Y) at height y. */
function ring(R: number, r: number, y: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(R, r, 8, 48);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Chandelier (origin = ceiling attachment point; hangs down along -y)
// ---------------------------------------------------------------------------------------------
function addChandelier(L: LampBags, x: number, y: number, z: number): void {
  const m = new THREE.Matrix4().makeTranslation(x, y, z);
  const B = (g: THREE.BufferGeometry): void => void L.brass.add(g, m);
  const drop = 15.5;

  // canopy at the ceiling
  B(lathe([[0.05, 0.25], [0.5, 0.25], [0.62, 0.12], [0.55, 0.0], [0.3, -0.2], [0.18, -0.5], [0.12, -0.8], [0.05, -0.8]], 28));
  // suspension rod with collars
  const rod = new THREE.CylinderGeometry(0.05, 0.05, drop, 8);
  rod.translate(0, -drop / 2 - 0.5, 0);
  B(rod);
  for (const t of [0.25, 0.5, 0.75]) {
    B(lathe([[0.05, -0.2], [0.16, -0.1], [0.2, 0], [0.16, 0.1], [0.05, 0.2]], 16).translate(0, -0.5 - drop * t, 0));
  }
  // central hub (vase) hanging at -drop
  const hy = -0.5 - drop;
  B(lathe([
    [0.05, 0.4], [0.22, 0.34], [0.34, 0.2], [0.28, 0.05], [0.4, -0.15], [0.62, -0.32], [0.7, -0.6], [0.6, -0.95], [0.35, -1.25],
    [0.22, -1.6], [0.3, -1.8], [0.2, -2.0], [0.05, -2.1],
  ], 32).translate(0, hy, 0));
  // two hoops + decorative collars
  const R1 = 3.1;
  const R2 = 1.9;
  const yh1 = hy - 1.15;
  const yh2 = hy - 0.15;
  B(ring(R1, 0.07, yh1));
  B(ring(R1 - 0.22, 0.04, yh1 - 0.12));
  B(ring(R2, 0.055, yh2));
  // arms: 12 lower (to R1), 8 upper (to R2)
  const arm = (r0: number, y0: number, r1: number, y1: number, ang: number, bulbs: boolean, bigR: number): void => {
    const d = v3(Math.cos(ang), 0, Math.sin(ang));
    const pts = [
      d.clone().multiplyScalar(r0).setY(y0),
      d.clone().multiplyScalar(r0 + (r1 - r0) * 0.4).setY(y0 - 0.5),
      d.clone().multiplyScalar(r1 - 0.05).setY(y1 - 0.15),
      d.clone().multiplyScalar(r1).setY(y1 + 0.05),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    B(new THREE.TubeGeometry(curve, 10, 0.045, 5, false));
    // cup + candle + bulb
    const base = d.clone().multiplyScalar(r1).setY(y1);
    const cup = lathe([[0.03, 0], [0.12, 0.02], [0.15, 0.09], [0.1, 0.17], [0.07, 0.24], [0.07, 0.3], [0.1, 0.34]], 14);
    cup.translate(base.x, base.y, base.z);
    B(cup);
    if (bulbs) {
      const bulb = new THREE.SphereGeometry(0.13, 8, 6);
      bulb.scale(1, 1.5, 1);
      bulb.translate(base.x, base.y + 0.48, base.z);
      L.bulb.add(bulb, m, 'keep');
    }
    void bigR;
  };
  for (let i = 0; i < 12; i++) arm(0.55, hy - 0.7, R1, yh1, (i / 12) * TAU, true, R1);
  for (let i = 0; i < 8; i++) arm(0.4, hy - 0.05, R2, yh2, ((i + 0.5) / 8) * TAU, true, R2);
  // lower pendant opal globe + brass collar
  const globe = new THREE.SphereGeometry(0.62, 20, 14);
  globe.translate(0, hy - 2.7, 0);
  L.opal.add(globe, m, 'keep');
  B(lathe([[0.05, 0], [0.3, -0.05], [0.4, -0.2], [0.35, -0.35]], 16).translate(0, hy - 2.1, 0));
  B(lathe([[0.3, 0], [0.12, -0.1], [0.05, -0.35]], 16).translate(0, hy - 3.3, 0));
  // upper glass corona: ring of opal tulips around the hoop
  for (let i = 0; i < 16; i++) {
    const a = ((i + 0.25) / 16) * TAU;
    const tul = new THREE.SphereGeometry(0.2, 8, 6);
    tul.scale(1, 1.25, 1);
    tul.translate(Math.cos(a) * (R2 + 0.0), yh2 + 0.3, Math.sin(a) * R2);
    L.opal.add(tul, m, 'keep');
  }
}

export function buildChandeliers(L: LampBags): void {
  const yTop = VAULT.crownY - 0.9;
  for (const z of [14, 26, 38, 50, 62, 74, 86]) addChandelier(L, 0, yTop, z);
}

// ---------------------------------------------------------------------------------------------
// Wall sconces (between bays, y = 5.3, on the pilasters)
// ---------------------------------------------------------------------------------------------
export function buildSconces(L: LampBags): void {
  for (const wall of SIDE_WALLS) {
    for (const z of PILASTER_Z) {
      const m = wall.m.clone().multiply(new THREE.Matrix4().makeTranslation(uOfZ(wall, z), 5.4, 0.42));
      // back plate (w axis out of wall)
      const plate = new THREE.CylinderGeometry(0.2, 0.22, 0.05, 20).rotateX(Math.PI / 2).translate(0, 0, 0.03);
      L.brass.add(plate, m, 'keep');
      const boss = lathe([[0.04, 0], [0.1, 0.03], [0.07, 0.12], [0.05, 0.3]], 12).rotateX(Math.PI / 2).translate(0, 0, 0.05);
      L.brass.add(boss, m, 'keep');
      // curved arm sweeping out and up
      const curve = new THREE.CatmullRomCurve3([v3(0, 0, 0.1), v3(0, -0.05, 0.3), v3(0, 0.05, 0.5), v3(0, 0.25, 0.6)]);
      L.brass.add(new THREE.TubeGeometry(curve, 12, 0.035, 6, false), m, 'keep');
      const cup = lathe([[0.03, 0], [0.13, 0.03], [0.1, 0.12], [0.06, 0.18]], 14).translate(0, 0.25, 0.6);
      L.brass.add(cup, m, 'keep');
      const shade = new THREE.SphereGeometry(0.18, 16, 12);
      shade.scale(0.9, 1.35, 0.9);
      shade.translate(0, 0.55, 0.6);
      L.opal.add(shade, m, 'keep');
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Brass torchere lamp standards at the foot of the stair
// ---------------------------------------------------------------------------------------------

export function buildTorcheres(L: LampBags): void {
  for (const [x, z] of TORCHERES) {
    const m = new THREE.Matrix4().makeTranslation(x, 0, z);
    const B = (g: THREE.BufferGeometry): void => void L.brass.add(g, m, 'keep');
    // base: stepped plinth
    B(lathe([[0.0, 0], [0.48, 0], [0.5, 0.04], [0.5, 0.1], [0.42, 0.16], [0.34, 0.22], [0.26, 0.3], [0.18, 0.4], [0.12, 0.5], [0.1, 0.8]], 32));
    // stem: ringed
    const stem: P2[] = [[0.1, 0.8], [0.07, 0.9], [0.07, 1.4], [0.1, 1.45], [0.14, 1.5], [0.1, 1.55], [0.065, 1.6], [0.065, 2.4], [0.11, 2.46], [0.13, 2.5], [0.09, 2.58], [0.06, 2.65], [0.06, 3.0]];
    B(lathe(stem, 16));
    // crown collar
    B(lathe([[0.06, 3.0], [0.2, 3.04], [0.26, 3.12], [0.22, 3.22], [0.1, 3.3], [0.05, 3.5]], 20));
    // three curved arms with small globes + central big globe
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 6;
      const d = v3(Math.cos(a), 0, Math.sin(a));
      const curve = new THREE.CatmullRomCurve3([
        d.clone().multiplyScalar(0.12).setY(3.1),
        d.clone().multiplyScalar(0.4).setY(3.0),
        d.clone().multiplyScalar(0.62).setY(3.25),
        d.clone().multiplyScalar(0.66).setY(3.5),
      ]);
      B(new THREE.TubeGeometry(curve, 14, 0.032, 6, false));
      const cup = lathe([[0.02, 0], [0.1, 0.02], [0.08, 0.1], [0.06, 0.15]], 12);
      cup.translate(d.x * 0.66, 3.5, d.z * 0.66);
      B(cup);
      const g = new THREE.SphereGeometry(0.2, 16, 12);
      g.translate(d.x * 0.66, 3.78, d.z * 0.66);
      L.opal.add(g, m, 'keep');
    }
    B(lathe([[0.06, 3.5], [0.16, 3.54], [0.24, 3.62], [0.12, 3.7]], 16));
    const globe = new THREE.SphereGeometry(0.34, 24, 18);
    globe.translate(0, 4.04, 0);
    L.opal.add(globe, m, 'keep');
    B(lathe([[0.2, 4.35], [0.1, 4.45], [0.05, 4.6]], 14));
    const fin = new THREE.SphereGeometry(0.07, 10, 8);
    fin.translate(0, 4.68, 0);
    B(fin);
  }
}
