import * as THREE from 'three';
import { BALCONY, BOOKING_OFFICE, STAIR } from '../../layout';
import { bookingWindowOutline } from '../hotel/layoutData';
import type { MaterialLibrary } from '../../core/types';
import { GeoBag, boxMM, latheMeters, lineFrames, sweep, v3, type P2 } from './geo';
import { CORNICE_PROFILE, type Bags } from './shell';

/** Booking-office window outline as a THREE.Path (hole in the stone frontage wall). */
function outlinePath(pts: Array<[number, number]>): THREE.Path {
  const p = new THREE.Path();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
}

function arcadeWall(bags: Bags): void {
  const m = new THREE.Matrix4().makeTranslation(0, 0, BALCONY.zMax); // local u = x, v = y, w = +z
  // The two frontages under the balcony are the Phase 4 hotel's (booking office west, concierge east): a plain stone
  // wall at z in [7.4, 8] whose only openings are the booking-office ticket windows. The hotel module builds the
  // facade and the booths behind it (src/world/hotel/*).
  for (const [x0, x1] of [[-30, -10], [10, 30]] as const) {
    const s = new THREE.Shape();
    s.moveTo(x0, -0.5); s.lineTo(x1, -0.5); s.lineTo(x1, 5.0); s.lineTo(x0, 5.0); s.closePath();
    s.holes = x1 < 0 ? BOOKING_OFFICE.windowCentersX.map((cx) => outlinePath(bookingWindowOutline(cx))) : [];
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: false, curveSegments: 40 });
    g.translate(0, 0, -0.6);
    bags.stone.add(g, m);
    // cornice (scaled copy of the wall cornice): flush with the deck at y = 6
    const prof: P2[] = CORNICE_PROFILE.map(([a, b]): P2 => [a * 0.82, 5.0 + (b - 22.6) * (1.0 / 1.4)]);
    bags.stone.add(sweep(prof, lineFrames(v3(x0, 0, BALCONY.zMax), v3(x1, 0, BALCONY.zMax), v3(0, 0, 1), v3(0, 1, 0)), { caps: true }));
  }
  // skirting along the south wall on the deck
  const prof: P2[] = [[0.2, 6.0], [0.2, 6.55], [0.14, 6.62], [0.0, 6.62]];
  bags.dark.add(sweep(prof, lineFrames(v3(-29.8, 0, 0), v3(29.8, 0, 0), v3(0, 0, 1), v3(0, 1, 0)), { caps: true }));
}

// ---------------------------------------------------------------------------------------------
// Balustrade (balcony front) - rails merged, balusters instanced
// ---------------------------------------------------------------------------------------------
const BAL_Z = 7.8;
const BAL_Y0 = BALCONY.topY;

function balusterGeometry(lib: MaterialLibrary): THREE.BufferGeometry {
  const pts: P2[] = [
    [0.07, 0], [0.1, 0.02], [0.1, 0.06], [0.075, 0.1], [0.075, 0.14], [0.115, 0.2], [0.14, 0.27], [0.15, 0.34], [0.14, 0.42],
    [0.1, 0.5], [0.075, 0.56], [0.075, 0.62], [0.1, 0.65], [0.1, 0.68], [0.07, 0.7],
  ];
  const g = latheMeters(pts, 10, 1.5, 1);
  void lib;
  return g;
}

const RAIL_BASE: P2[] = [[0.0, 0.0], [0.26, 0.0], [0.26, 0.12], [0.2, 0.15], [0.2, 0.28], [-0.2, 0.28], [-0.2, 0.15], [-0.26, 0.12], [-0.26, 0.0]];
const RAIL_TOP: P2[] = [
  [-0.18, 0.0], [0.18, 0.0], [0.18, 0.04], [0.26, 0.06], [0.26, 0.12], [0.2, 0.16], [0.16, 0.22], [-0.16, 0.22], [-0.2, 0.16], [-0.26, 0.12], [-0.26, 0.06], [-0.18, 0.04],
];

function pier(bags: Bags, x: number, z: number, y0: number, y1: number, h = 0.3): void {
  bags.col.add(boxMM(x - h - 0.06, y0, z - h - 0.06, x + h + 0.06, y0 + 0.3, z + h + 0.06));
  bags.col.add(boxMM(x - h, y0 + 0.3, z - h, x + h, y1 - 0.22, z + h));
  bags.col.add(boxMM(x - h - 0.1, y1 - 0.22, z - h - 0.1, x + h + 0.1, y1 - 0.08, z + h + 0.1));
  bags.col.add(boxMM(x - h - 0.04, y1 - 0.08, z - h - 0.04, x + h + 0.04, y1, z + h + 0.04));
  const ball = new THREE.SphereGeometry(0.13, 16, 12);
  ball.translate(x, y1 + 0.13, z);
  bags.brass.add(ball);
}

function balustrade(bags: Bags, lib: MaterialLibrary, colMat: THREE.Material): THREE.InstancedMesh {
  const segs: Array<[number, number]> = [[-29.9, -10.25], [10.25, 29.9]];
  const mats: THREE.Matrix4[] = [];
  for (const [x0, x1] of segs) {
    // base rail & top rail (sweeps along x; profile (a = z offset, b = y offset))
    const fr = (y: number) => lineFrames(v3(x0, y, BAL_Z), v3(x1, y, BAL_Z), v3(0, 0, 1), v3(0, 1, 0));
    bags.col.add(sweep(RAIL_BASE, fr(BAL_Y0), { closed: true, caps: true }));
    bags.col.add(sweep(RAIL_TOP, fr(BAL_Y0 + 0.28 + 0.7), { closed: true, caps: true }));
    // balusters
    const pitch = 0.27;
    const n = Math.floor((x1 - x0) / pitch);
    const off = (x1 - x0 - (n - 1) * pitch) / 2;
    for (let i = 0; i < n; i++) {
      mats.push(new THREE.Matrix4().makeTranslation(x0 + off + i * pitch, BAL_Y0 + 0.28, BAL_Z));
    }
    // piers every ~6 m
    const L = x1 - x0;
    const k = Math.round(L / 6.5);
    for (let i = 0; i <= k; i++) pier(bags, x0 + (L * i) / k, BAL_Z, BAL_Y0, BAL_Y0 + 1.42);
  }
  const g = balusterGeometry(lib);
  const mesh = new THREE.InstancedMesh(g, colMat, mats.length);
  mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Grand staircase
// ---------------------------------------------------------------------------------------------
const W_HALF = 9.7;
const slopeY = (z: number): number => STAIR.topY - ((z - STAIR.zMin) / STAIR.treadDepth) * STAIR.riserHeight;

function stairs(bags: Bags): void {
  const treadShape = new THREE.Shape();
  // (z, y) profile: back at 0, front nose at D + 0.04, thickness t, rounded nose
  const D = STAIR.treadDepth;
  const t = 0.07;
  treadShape.moveTo(0, -t);
  treadShape.lineTo(D + 0.04 - 0.035, -t);
  treadShape.quadraticCurveTo(D + 0.04, -t, D + 0.04, -t + 0.035);
  treadShape.lineTo(D + 0.04, -0.035);
  treadShape.quadraticCurveTo(D + 0.04, 0, D + 0.04 - 0.035, 0);
  treadShape.lineTo(0, 0);
  treadShape.closePath();
  const tread = new THREE.ExtrudeGeometry(treadShape, { depth: W_HALF * 2, bevelEnabled: false, curveSegments: 4 });
  // extrude along z -> world x ; shape x -> world z, shape y -> world y
  tread.rotateY(-Math.PI / 2); // (x,y,z) -> (-z?,y,x): shape x -> world +z? verify below
  for (let k = 0; k < STAIR.risers; k++) {
    const z = STAIR.zMin + STAIR.treadDepth * k;
    const top = STAIR.topY - STAIR.riserHeight * (k + 1);
    if (k < STAIR.risers - 1) {
      // tread k
      bags.floor.add(tread, new THREE.Matrix4().makeTranslation(W_HALF, top, z));
    }
    // riser k (face at plane z), from the tread top up to the previous tread's slab
    bags.col.add(boxMM(-W_HALF, top, z - 0.1, W_HALF, top + STAIR.riserHeight - 0.02, z));
  }
}

function flankAndRails(bags: Bags): void {
  const zA = STAIR.zMin;
  const zB = STAIR.zMax;
  const capH = 1.05;
  const yTop = (z: number): number => slopeY(z) + capH;
  for (const sg of [-1, 1]) {
    const x0 = sg < 0 ? -10.0 : 9.7;
    const x1 = sg < 0 ? -9.7 : 10.0;
    // solid flank (shape in (z, y), extruded along x)
    const sh = new THREE.Shape();
    sh.moveTo(zA, 0); sh.lineTo(zB, 0); sh.lineTo(zB, yTop(zB) - 0.2); sh.lineTo(zA, yTop(zA) - 0.2); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    g.translate(x1, 0, 0);
    bags.stone.add(g);
    // cap moulding sweeping along the slope
    const capProf: P2[] = [[-0.26, 0], [0.26, 0], [0.26, 0.06], [0.2, 0.1], [0.2, 0.14], [0.16, 0.2], [-0.16, 0.2], [-0.2, 0.14], [-0.2, 0.1], [-0.26, 0.06]];
    const xc = (x0 + x1) / 2;
    const zs = [zA - 0.1, zB + 0.1];
    const frames = zs.map((z) => ({ o: v3(xc, yTop(z) - 0.2, z), a: v3(1, 0, 0), b: v3(0, 1, 0) }));
    bags.col.add(sweep(capProf, frames, { closed: true, caps: true }));
    // dark marble inset panels on both faces
    for (const face of [-1, 1]) {
      const xf = face > 0 ? x1 : x0;
      const z0 = zA + 0.9;
      const z1 = zB - 1.1;
      const pts: Array<[number, number]> = [[z0, 0.38], [z0, yTop(z0) - 0.2 - 0.55], [z1, yTop(z1) - 0.2 - 0.55], [z1, 0.38]];
      const ps = new THREE.Shape();
      ps.moveTo(pts[0]![0], pts[0]![1]);
      for (const p of pts.slice(1)) ps.lineTo(p[0], p[1]);
      ps.closePath();
      const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.05, bevelEnabled: false });
      pg.rotateY(-Math.PI / 2);
      pg.translate(face > 0 ? x1 + 0.04 : x0 + 0.01, 0, 0);
      void xf;
      bags.dark.add(pg);
    }
    // brass handrail on posts
    const hrOff = 0.30;
    const pa = v3(xc, yTop(zA + 0.2) - 0.2 + hrOff, zA + 0.2);
    const pb = v3(xc, yTop(zB - 0.2) - 0.2 + hrOff, zB - 0.2);
    const dir = pb.clone().sub(pa);
    const len = dir.length();
    const rail = new THREE.CylinderGeometry(0.035, 0.035, len, 12);
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir.clone().normalize());
    const mm = new THREE.Matrix4().compose(pa.clone().add(pb).multiplyScalar(0.5), q, v3(1, 1, 1));
    bags.brass.add(rail, mm, 'keep');
    for (let i = 0; i <= 6; i++) {
      const z = zA + 0.2 + ((zB - zA - 0.4) * i) / 6;
      const post = new THREE.CylinderGeometry(0.022, 0.03, hrOff, 8);
      post.translate(xc, yTop(z) - 0.2 + hrOff / 2 + 0.02, z);
      bags.brass.add(post, undefined, 'keep');
    }
  }
}

function stairPiers(bags: Bags): void {
  for (const sg of [-1, 1]) {
    const x = sg * 10.0;
    pier(bags, x, 8.0, 0, 7.55, 0.22);
    pier(bags, x, 19.75, 0, 1.55, 0.22);
  }
}

export interface BalconyResult {
  balusters: THREE.InstancedMesh;
}

export function buildBalcony(bags: Bags, lib: MaterialLibrary, colMat: THREE.Material): BalconyResult {
  arcadeWall(bags);
  const balusters = balustrade(bags, lib, colMat);
  stairs(bags);
  flankAndRails(bags);
  stairPiers(bags);
  void GeoBag;
  return { balusters };
}
