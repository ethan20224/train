import * as THREE from 'three';
import { KIOSK } from '../../layout';
import { GeoBag, boxMM, latheMeters, type P2 } from '../concourse/geo';

export interface KioskBags {
  dark: GeoBag;
  col: GeoBag;
  wood: GeoBag;
  brass: GeoBag;
}

const TAU = Math.PI * 2;

/** Lettered fascia band texture: gold capitals on black enamel. */
export function makeFasciaTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  // one quarter of the band (4.7 m x 0.4 m), repeated 4x around the drum
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 174;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.fillStyle = '#0e0c0a';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#c9a24e';
  g.lineWidth = 3;
  g.strokeRect(0, 8, c.width, c.height - 16);
  g.fillStyle = '#d9b25f';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 100px "Didot", "Bodoni 72", "Georgia", serif';
  g.fillText('I N F O R M A T I O N', c.width / 2, c.height / 2 + 5);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

export function fasciaGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(3.0, 3.0, 0.4, 96, 1, true);
  return g;
}

/** Everything static for the kiosk (translated to the kiosk centre). */
export function buildKioskStatic(b: KioskBags): void {
  const [kx, kz] = KIOSK.center;
  const T = new THREE.Matrix4().makeTranslation(kx, 0, kz);
  const lathe = (bag: GeoBag, pts: P2[], seg: number, tile: number, rep: number): void => {
    bag.add(latheMeters(pts, seg, tile, rep), T, 'keep');
  };
  const addAt = (bag: GeoBag, g: THREE.BufferGeometry): void => void bag.add(g, T);

  // --- plinth drum (dark marble) -----------------------------------------------------------------
  lathe(b.dark, [[0, 0], [3.5, 0], [3.5, 0.1], [3.42, 0.16], [3.3, 0.2], [3.3, 0.92], [3.38, 0.95], [3.44, 1.0], [3.44, 1.08], [3.36, 1.12], [0, 1.12]], 96, 2.37, 9);
  // brass kick ring + fillets between 12 panels
  const kick = new THREE.TorusGeometry(3.31, 0.025, 6, 96);
  kick.rotateX(Math.PI / 2);
  kick.translate(0, 0.24, 0);
  addAt(b.brass, kick);
  const kick2 = kick.clone().translate(0, 0.66, 0);
  addAt(b.brass, kick2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const strip = boxMM(-0.03, 0.2, 3.28, 0.03, 0.95, 3.34);
    strip.rotateY(a);
    addAt(b.brass, strip);
  }
  // --- counter ring (cream marble) -----------------------------------------------------------------
  lathe(b.col, [[2.5, 1.12], [3.42, 1.12], [3.5, 1.15], [3.52, 1.2], [3.46, 1.25], [3.3, 1.26], [2.5, 1.26]], 96, 2.0, 8);

  // --- booth: inner walnut wall, 12 piers, brass grilles, rails ---------------------------------------
  lathe(b.wood, [[2.45, 1.26], [2.45, 3.3]], 64, 2.0, 5);
  const bays = 12;
  for (let i = 0; i < bays; i++) {
    const a = ((i + 0.0) / bays) * TAU;
    const aMid = ((i + 0.5) / bays) * TAU;
    // pier (walnut) with brass base and cap, radial orientation
    const pier = boxMM(-0.13, 1.26, 2.62, 0.13, 3.28, 2.96);
    pier.rotateY(a);
    addAt(b.wood, pier);
    const pb = boxMM(-0.17, 1.26, 2.58, 0.17, 1.46, 3.0);
    pb.rotateY(a);
    addAt(b.brass, pb);
    const pc = boxMM(-0.17, 3.1, 2.58, 0.17, 3.3, 3.0);
    pc.rotateY(a);
    addAt(b.brass, pc);
    // grille bars between this pier and the next
    const half = Math.sin(Math.PI / bays) * 2.8 - 0.14;
    const nBars = 9;
    for (let k = 0; k < nBars; k++) {
      const x = -half + (2 * half * (k + 0.5)) / nBars;
      const bar = new THREE.CylinderGeometry(0.011, 0.011, 1.5, 6);
      bar.translate(x, 2.26, 2.7);
      bar.rotateY(aMid);
      addAt(b.brass, bar);
    }
    for (const y of [1.52, 3.02]) {
      const rail = boxMM(-half, y - 0.03, 2.67, half, y + 0.03, 2.73);
      rail.rotateY(aMid);
      addAt(b.brass, rail);
    }
  }
  // --- cornice & roof ---------------------------------------------------------------------------------
  lathe(b.wood, [[2.92, 3.3], [2.95, 3.3], [2.95, 3.72], [3.06, 3.74], [3.16, 3.8], [3.2, 3.86], [3.12, 3.94], [3.0, 3.98]], 96, 2.0, 9);
  // brass dome with ribs, dark marble drum under it
  lathe(b.brass, [[3.0, 3.98], [2.9, 4.1], [2.62, 4.3], [2.1, 4.52], [1.5, 4.68], [0.9, 4.8], [0.55, 4.88], [0.5, 4.96]], 96, 1.0, 3);
  // pedestal (brass, fluted look via rings)
  lathe(b.brass, [
    [0.55, 4.9], [0.5, 5.0], [0.42, 5.06], [0.34, 5.14], [0.34, 5.3], [0.24, 5.38], [0.2, 5.46], [0.2, 6.4], [0.24, 6.46],
    [0.3, 6.52], [0.34, 6.58], [0.5, 6.66], [0.58, 6.72], [0.58, 6.78],
  ], 40, 1.0, 3);
  // clock case (brass) : box + mouldings + corner colonnettes
  const half = 0.74;
  addAt(b.brass, boxMM(-half, 6.78, -half, half, 8.22, half));
  for (const [y0, y1, ext] of [[6.78, 6.86, 0.1], [6.86, 6.94, 0.05], [8.12, 8.2, 0.05], [8.2, 8.3, 0.12], [8.3, 8.36, 0.06]] as const) {
    addAt(b.brass, boxMM(-half - ext, y0, -half - ext, half + ext, y1, half + ext));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const col = new THREE.CylinderGeometry(0.045, 0.045, 1.4, 10);
      col.translate(sx * (half + 0.02), 7.5, sz * (half + 0.02));
      addAt(b.brass, col);
    }
  }
  // roof: pyramid-dome and finial
  const roof = latheMeters([[0.96, 8.36], [0.9, 8.42], [0.66, 8.58], [0.4, 8.8], [0.2, 9.0], [0.12, 9.1], [0.1, 9.3], [0.04, 9.42]], 4, 1.0, 1);
  roof.rotateY(Math.PI / 4);
  b.brass.add(roof, T, 'keep');
  const ball = new THREE.SphereGeometry(0.09, 12, 10);
  ball.translate(0, 9.2, 0);
  addAt(b.brass, ball);
}
