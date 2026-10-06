import * as THREE from 'three';
import { CONCIERGE } from '../../layout';
import { atlasUV, box, cylX, lathe, rbox, slab, sphere, tube, xf } from './kit';
import { addBankersLamp, type Buckets } from './furniture';
import { FACE_Z, frameBars, pilaster, plate, shopCornice, wainscot } from './facade';
import { rng } from '../concourse/geo';
import type { PaperAtlas } from './textures';

/** Concierge: pigeonhole key wall, reception desk (Deco stepped plan), service bell, ledger, banker's lamp, mirrors. */

function keyWall(b: Buckets): void {
  const x0 = 15;
  const x1 = 25;
  const y0 = 1.2;
  const y1 = 3.5;
  const cols = 26;
  const rows = 8;
  const z0 = FACE_Z;
  const z1 = FACE_Z + 0.36;
  // dark carcass back, walnut trim
  b.dark.add(box(x0 - 0.04, y0 - 0.04, z0, x1 + 0.04, y1 + 0.04, z0 + 0.02));
  frameBars(b.wood, x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1, z0, z1 + 0.02, 0.06);
  const dx = (x1 - x0) / cols;
  const dy = (y1 - y0) / rows;
  for (let i = 1; i < cols; i++) b.wood.add(box(x0 + i * dx - 0.007, y0, z0 + 0.02, x0 + i * dx + 0.007, y1, z1));
  for (let j = 1; j < rows; j++) b.wood.add(box(x0, y0 + j * dy - 0.007, z0 + 0.02, x1, y0 + j * dy + 0.007, z1));
  // brass cornice on top + sill moulding below
  b.brass.add(box(x0 - 0.12, y1 + 0.1, z0, x1 + 0.12, y1 + 0.115, z1 + 0.06));
  b.wood.add(rbox(x0 - 0.12, y1 + 0.115, z0, x1 + 0.12, y1 + 0.17, z1 + 0.06, 0.01, 2));
  b.wood.add(rbox(x0 - 0.12, y0 - 0.17, z0, x1 + 0.12, y0 - 0.1, z1 + 0.05, 0.01, 2));
  // brass room-key fobs hanging in most pigeonholes; some hold letters
  const R = rng(31);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = x0 + (i + 0.5) * dx;
      const top = y0 + (j + 1) * dy;
      const roll = R();
      if (roll < 0.62) {
        const hang = 0.095 + R() * 0.03;
        const zf = z0 + 0.14 + R() * 0.12;
        b.brass.add(tube(new THREE.Vector3(cx, top - 0.014, zf), new THREE.Vector3(cx, top - hang + 0.02, zf), 0.003, 4));
        const fob = new THREE.CylinderGeometry(0.03, 0.03, 0.006, 12).rotateX(Math.PI / 2);
        fob.scale(0.8, 1.25, 1);
        b.brass.add(fob.translate(cx, top - hang - 0.012, zf));
        b.brass.add(new THREE.TorusGeometry(0.009, 0.0025, 4, 8).translate(cx, top - hang + 0.022, zf));
        b.brass.add(box(cx - 0.004, top - hang - 0.095, zf - 0.002, cx + 0.004, top - hang - 0.04, zf + 0.002));
      } else if (roll < 0.76) {
        b.leather.add(box(cx - 0.11, top - dy + 0.015, z0 + 0.1, cx + 0.11, top - dy + 0.19, z0 + 0.105), undefined, 0xe3d6b5);
      }
    }
  }
  // gilt CONCIERGE plate above
}

/** Reception desk with a stepped Deco plan inside x 15..25, z 9.4..10.6. */
function desk(b: Buckets, atlas: PaperAtlas): void {
  const { xMin, xMax, zMin } = CONCIERGE.desk;
  const H = 1.01;
  type Seg = { x0: number; x1: number; zf: number };
  const segs: Seg[] = [
    { x0: xMin, x1: xMin + 0.38, zf: 9.9 },
    { x0: xMin + 0.38, x1: 17.1, zf: 10.2 },
    { x0: 17.1, x1: 22.9, zf: 10.46 },
    { x0: 22.9, x1: xMax - 0.38, zf: 10.2 },
    { x0: xMax - 0.38, x1: xMax, zf: 9.9 },
  ];
  for (const [i, s] of segs.entries()) {
    b.wood.add(rbox(s.x0, 0.12, zMin, s.x1, H, s.zf, 0.008, 2));
    b.dark.add(box(s.x0 - 0.02, 0, zMin - 0.02, s.x1 + 0.02, 0.12, s.zf + 0.035));
    // brass banding
    b.brass.add(box(s.x0, 0.14, s.zf - 0.002, s.x1, 0.158, s.zf + 0.012));
    b.brass.add(box(s.x0, 0.9, s.zf - 0.002, s.x1, 0.918, s.zf + 0.012));
    if (i === 2) {
      // reeded walnut front
      for (let x = s.x0 + 0.06; x < s.x1 - 0.04; x += 0.065) {
        const reed = new THREE.CylinderGeometry(0.0225, 0.0225, 0.72, 6);
        b.wood.add(reed.translate(x, 0.54, s.zf + 0.004));
      }
    } else if (i === 1 || i === 3) {
      // dark marble panels set in the stepped wings
      b.dark.add(box(s.x0 + 0.1, 0.22, s.zf - 0.002, s.x1 - 0.1, 0.84, s.zf + 0.014));
      frameBars(b.brass, s.x0 + 0.08, 0.2, s.x1 - 0.08, 0.86, s.zf, s.zf + 0.018, 0.012);
    } else {
      b.dark.add(box(s.x0 + 0.06, 0.22, s.zf - 0.002, s.x1 - 0.06, 0.84, s.zf + 0.012));
    }
    // marble top, overhanging the front
    b.marble.add(slab((s.x0 + s.x1) / 2, (zMin - 0.05 + s.zf + 0.1) / 2, s.x1 - s.x0 + 0.06, s.zf + 0.1 - (zMin - 0.05), H, 0.04, 0.02, 0.004));
    b.brass.add(box(s.x0 - 0.02, H - 0.012, s.zf + 0.062, s.x1 + 0.02, H + 0.0, s.zf + 0.1));
  }
  // top items --------------------------------------------------------------------------------
  const y = 1.05;
  // service bell at exactly (20, 1.1, 9.6)
  const [bx, by, bz] = CONCIERGE.bell;
  b.brass.add(lathe([[0.001, 0], [0.065, 0], [0.068, 0.008], [0.06, 0.016], [0.001, 0.016]], 20, 0.5), xf(bx, y, bz));
  b.brass.add(lathe([[0.056, 0.014], [0.054, 0.03], [0.044, 0.056], [0.026, 0.078], [0.001, 0.088]], 24, 0.5), xf(bx, y, bz));
  b.brass.add(sphere(bx, by + 0.04, bz, 0.012, 10, 8));
  // guest ledger: open book (two covers, page blocks, ledger page texture), fountain pen
  const lx = 21.7;
  const lz = 10.0;
  const yaw = 0.18;
  const M = xf(lx, y, lz, yaw);
  b.leather.add(rbox(-0.26, 0, -0.17, 0.26, 0.022, 0.17, 0.006), M, 0x5a1519);
  for (const s of [-1, 1]) {
    const pg = box(s < 0 ? -0.245 : 0.005, 0.022, -0.155, s < 0 ? -0.005 : 0.245, 0.034, 0.155);
    const r = atlas.cell.ledger;
    if (r) atlasUV(pg, r);
    b.paper.add(pg, M);
  }
  b.brass.add(box(-0.265, 0.0, -0.172, -0.255, 0.024, 0.172), M);
  b.brass.add(box(0.255, 0.0, -0.172, 0.265, 0.024, 0.172), M);
  // pen lying across the right page
  const pen = tube(new THREE.Vector3(0.02, 0.043, 0.03), new THREE.Vector3(0.2, 0.043, -0.06), 0.0065, 8);
  b.leather.add(pen, M, 0x0e0d0c);
  b.brass.add(tube(new THREE.Vector3(0.2, 0.043, -0.06), new THREE.Vector3(0.226, 0.043, -0.073), 0.004, 6, 0.0012), M);
  b.brass.add(box(0.07, 0.04, 0.0, 0.1, 0.046, 0.002), M);
  // inkwell stand
  b.brass.add(rbox(22.35, y, 9.78, 22.62, y + 0.02, 10.0, 0.005), undefined);
  b.crystal.add(lathe([[0.001, 0], [0.032, 0], [0.036, 0.03], [0.024, 0.046], [0.001, 0.046]], 12, 0.5), xf(22.485, y + 0.02, 9.89));
  // banker's lamp at the west end + a small reservation card stand
  addBankersLamp(b, xf(17.7, y, 9.8, 0.4));
  b.brass.add(rbox(23.7, y, 9.62, 23.98, y + 0.12, 9.64, 0.003), undefined);
  b.brass.add(box(23.76, y, 9.6, 23.92, y + 0.012, 9.7));
}

export function buildConcierge(b: Buckets, atlas: PaperAtlas): void {
  const { xMin, xMax } = CONCIERGE;
  wainscot(b, xMin, xMax);
  shopCornice(b, xMin, xMax);
  for (const px of [14.65, 25.35]) pilaster(b, px);
  pilaster(b, xMin + 0.15, 0.15);
  pilaster(b, xMax - 0.15, 0.15);
  keyWall(b);
  const sign = atlas.cell.concierge;
  if (sign) plate(b, sign, 20, 4.15, 4.2, 0.7);
  desk(b, atlas);
  // brass-framed mirrors in the flanking bays
  for (const mx of [12.75, 27.25]) {
    const w = 1.05;
    const h = 1.95;
    const y0 = 1.3;
    const g = new THREE.PlaneGeometry(w, h);
    b.mirror.add(g.translate(mx, y0 + h / 2, FACE_Z + 0.03));
    frameBars(b.brass, mx - w / 2 - 0.05, y0 - 0.05, mx + w / 2 + 0.05, y0 + h + 0.05, FACE_Z, FACE_Z + 0.05, 0.05);
    b.wood.add(box(mx - w / 2 - 0.09, y0 - 0.09, FACE_Z, mx + w / 2 + 0.09, y0 + h + 0.09, FACE_Z + 0.025));
    // crest on top
    b.brass.add(cylX(mx, y0 + h + 0.12, FACE_Z + 0.04, 0.012, 0.5, 8));
    b.brass.add(sphere(mx, y0 + h + 0.15, FACE_Z + 0.04, 0.035, 10, 8));
  }
}
