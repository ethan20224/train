import * as THREE from 'three';
import { ARCHES, BALCONY, KIOSK, OCULUS, THROAT } from '../../layout';
import { Soup, at, boxMM, v3 } from './geo';
import type { Bags } from './shell';

const N = 96;

/** Rectangle-with-holes floor piece in the XZ plane at height y (shape y = -z). */
function planarShape(outer: [number, number, number, number], holes: Array<Array<[number, number]>>, y: number): THREE.BufferGeometry {
  const [x0, z0, x1, z1] = outer;
  const s = new THREE.Shape();
  s.moveTo(x0, -z0); s.lineTo(x1, -z0); s.lineTo(x1, -z1); s.lineTo(x0, -z1); s.closePath();
  s.holes = holes.map((h) => {
    const p = new THREE.Path();
    h.forEach(([x, z], i) => (i === 0 ? p.moveTo(x, -z) : p.lineTo(x, -z)));
    p.closePath();
    return p;
  });
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function rectPts(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

type Ring = { r0: number; r1: number; kind: 'dark' | 'floor' | 'brass' | 'star' | 'check' };

const RINGS: Ring[] = [
  { r0: 0, r1: 3.6, kind: 'dark' },
  { r0: 3.6, r1: 3.68, kind: 'brass' },
  { r0: 3.68, r1: 5.6, kind: 'star' },
  { r0: 5.6, r1: 5.66, kind: 'brass' },
  { r0: 5.66, r1: 6.5, kind: 'floor' },
  { r0: 6.5, r1: 6.56, kind: 'brass' },
  { r0: 6.56, r1: 8.2, kind: 'check' },
  { r0: 8.2, r1: 8.26, kind: 'brass' },
  { r0: 8.26, r1: 9.4, kind: 'dark' },
  { r0: 9.4, r1: 9.46, kind: 'brass' },
];
export const MEDALLION_R = 9.46;

function medallion(bags: Bags, y: number, cx: number, cz: number): void {
  const up = v3(0, 1, 0);
  const P = (r: number, i: number): THREE.Vector3 => {
    const a = (i / N) * Math.PI * 2;
    return v3(cx + r * Math.cos(a), y, cz + r * Math.sin(a));
  };
  const centre = v3(cx, y, cz);
  const soups = { dark: new Soup(), floor: new Soup(), brass: new Soup() };
  const tri = (s: Soup, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => s.tri(a, b, c, up, up, up);
  for (const ring of RINGS) {
    const { r0, r1 } = ring;
    if (ring.kind === 'dark' || ring.kind === 'floor' || ring.kind === 'brass') {
      const s = soups[ring.kind];
      for (let i = 0; i < N; i++) {
        if (r0 === 0) tri(s, centre, P(r1, i), P(r1, i + 1));
        else {
          tri(s, P(r0, i), P(r1, i), P(r1, i + 1));
          tri(s, P(r0, i), P(r1, i + 1), P(r0, i + 1));
        }
      }
    } else if (ring.kind === 'check') {
      for (let i = 0; i < N; i++) {
        const s = Math.floor(i / 2) % 2 === 0 ? soups.dark : soups.floor;
        tri(s, P(r0, i), P(r1, i), P(r1, i + 1));
        tri(s, P(r0, i), P(r1, i + 1), P(r0, i + 1));
      }
    } else {
      // star: 16 tips, each spans 6 vertices; dark tip with apex at outer ring middle vertex
      const per = N / 16;
      for (let t = 0; t < 16; t++) {
        const i0 = t * per;
        const apex = P(r1, i0 + per / 2);
        for (let k = 0; k < per; k++) tri(soups.dark, P(r0, i0 + k), apex, P(r0, i0 + k + 1));
        // light left: (r0,i0) (r1,i0..i0+per/2)
        for (let k = 0; k < per / 2; k++) tri(soups.floor, P(r0, i0), P(r1, i0 + k), P(r1, i0 + k + 1));
        // light right
        for (let k = per / 2; k < per; k++) tri(soups.floor, P(r0, i0 + per), P(r1, i0 + k), P(r1, i0 + k + 1));
      }
    }
  }
  bags.dark.add(soups.dark.build());
  bags.floor.add(soups.floor.build());
  bags.brass.add(soups.brass.build());
}

export function buildFloor(bags: Bags): void {
  // ---- concourse floor (y = 0), x[-30,30] z[8,100] --------------------------------------------
  const [kx, kz] = KIOSK.center;
  const hole: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    hole.push([kx + MEDALLION_R * Math.cos(a), kz + MEDALLION_R * Math.sin(a)]);
  }
  const zS = BALCONY.zMax; // 8
  const zN = 100;
  // border band (dark), 1.0 m
  bags.dark.add(planarShape([-30, zS, 30, zN], [rectPts(-29, zS + 1, 29, zN - 1)], 0));
  // brass inline between border and field
  bags.brass.add(planarShape([-29, zS + 1, 29, zN - 1], [rectPts(-28.94, zS + 1.06, 28.94, zN - 1.06)], 0));
  const oculus: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    oculus.push([OCULUS.cx + OCULUS.curbOuterR * Math.cos(a), OCULUS.cz + OCULUS.curbOuterR * Math.sin(a)]);
  }
  const throats = THROAT.bands.map(([a, b]) => rectPts(a, THROAT.zMin, b, THROAT.zMax));
  // field with the medallion, oculus and throat holes (non-overlapping: checked by metro-layout-test)
  bags.floor.add(planarShape([-28.94, zS + 1.06, 28.94, zN - 1.06], [hole, oculus, ...throats], 0));
  medallion(bags, 0, kx, kz);
  // (the arcade recess floor strips were removed: the under-balcony frontages are now sealed walls, Phase 4 hotel)

  // ---- arch thresholds (z 100 -> 102) -----------------------------------------------------------
  for (const cx of ARCHES.centersX) {
    bags.dark.add(planarShape([cx - ARCHES.width / 2, ARCHES.zMin, cx + ARCHES.width / 2, ARCHES.zMax], [], 0));
  }
  // ---- balcony deck (y = BALCONY.topY) ----------------------------------------------------------
  const y = BALCONY.topY;
  bags.col.add(planarShape([-30, 0, 30, 8], [rectPts(-29.3, 0.7, 29.3, 7.3)], y));
  bags.brass.add(planarShape([-29.3, 0.7, 29.3, 7.3], [rectPts(-29.24, 0.76, 29.24, 7.24)], y));
  bags.floor.add(planarShape([-29.24, 0.76, 29.24, 7.24], [], y));
  void at;
  void boxMM;
}
