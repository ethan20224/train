import * as THREE from 'three';
import { arcFrames, rotatedBoxZ, sweep, v3, type P2 } from './geo';
import { SIDE_WALLS, WALLS } from './frames';
import { LUNETTE_BASE_Y, LUNETTE_OPEN_R, sideWindows, type Bags, type Opening } from './shell';

/** Depth (local w) of the glazing plane in the deep reveal. */
const GLASS_W = -1.95;

function bar(w: number, h: number, d: number, cx: number, cy: number): THREE.BufferGeometry {
  return rotatedBoxZ(w, h, d, cx, cy, GLASS_W, 0);
}

function rectProfile(t: number, d: number): P2[] {
  return [[-t / 2, -d / 2], [t / 2, -d / 2], [t / 2, d / 2], [-t / 2, d / 2]];
}

/** Iron grid for one giant arched window, centred at u = 0 (local), sill at v0. */
function windowGrid(o: Opening): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const { v0, spring } = o;
  const half = o.w / 2;
  const R = half - 0.07;
  const wd = 0.26;
  const thin = 0.1;
  // outer frame
  out.push(bar(0.14, spring - v0, wd, -R, (v0 + spring) / 2));
  out.push(bar(0.14, spring - v0, wd, R, (v0 + spring) / 2));
  out.push(bar(o.w - 0.1, 0.16, wd, 0, v0 + 0.08));
  // vertical mullions: major at 0, +-2.5 ; minor at +-1.25, +-3.75
  for (const x of [-2.5, 0, 2.5]) out.push(bar(0.13, spring - v0, wd, x, (v0 + spring) / 2));
  for (const x of [-3.75, -1.25, 1.25, 3.75]) out.push(bar(0.055, spring - v0, thin, x, (v0 + spring) / 2));
  // transoms: impost (heavy), two major, three minor
  out.push(bar(o.w - 0.1, 0.22, wd + 0.04, 0, spring));
  const rows = 6;
  const step = (spring - v0) / rows;
  for (let i = 1; i < rows; i++) {
    const y = v0 + step * i;
    if (i % 2 === 0) out.push(bar(o.w - 0.1, 0.12, wd, 0, y));
    else out.push(bar(o.w - 0.1, 0.05, thin, 0, y));
  }
  // arch head: outer ring, two inner rings, radiating spokes
  const arcAt = (r: number, t: number, d: number): THREE.BufferGeometry =>
    sweep(rectProfile(t, d), arcFrames(v3(0, spring, GLASS_W), v3(1, 0, 0), v3(0, 1, 0), r, 0, Math.PI, 64, v3(0, 0, 1), 1), { caps: true });
  out.push(arcAt(R, 0.14, wd));
  out.push(arcAt(3.55, 0.07, wd - 0.04));
  out.push(arcAt(2.1, 0.06, thin));
  out.push(arcAt(0.85, 0.09, wd - 0.04));
  for (let i = 1; i < 12; i++) {
    const ang = (i * Math.PI) / 12;
    const major = i % 2 === 0;
    const r0 = 0.85;
    const len = R - r0;
    const mid = r0 + len / 2;
    const t = major ? 0.1 : 0.05;
    out.push(rotatedBoxZ(len, t, major ? wd - 0.04 : thin, Math.cos(ang) * mid, spring + Math.sin(ang) * mid, GLASS_W, ang));
  }
  return out;
}

function glassOutline(o: Opening): THREE.BufferGeometry {
  const half = o.w / 2;
  const s = new THREE.Shape();
  s.moveTo(-half, o.v0);
  s.lineTo(-half, o.spring);
  s.absarc(0, o.spring, half, Math.PI, 0, true);
  s.lineTo(half, o.v0);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 40);
  g.translate(0, 0, GLASS_W);
  return g;
}

export function buildWindows(bags: Bags): void {
  for (const wall of SIDE_WALLS) {
    for (const o of sideWindows(wall)) {
      const m = wall.m.clone().multiply(new THREE.Matrix4().makeTranslation(o.cu, 0, 0));
      const local: Opening = { ...o, cu: 0 };
      for (const g of windowGrid(local)) bags.iron.add(g, m);
      bags.glass.add(glassOutline(local), m);
    }
  }
  buildLunetteGrid(bags);
}

/** South lunette: radiating sunburst mullions. Centre (0, LUNETTE_BASE_Y), radius LUNETTE_OPEN_R. */
function buildLunetteGrid(bags: Bags): void {
  const m = WALLS.south.m;
  const w = -1.1;
  const R = LUNETTE_OPEN_R - 0.12;
  const cy = LUNETTE_BASE_Y;
  const items: THREE.BufferGeometry[] = [];
  const box = (len: number, t: number, d: number, cx: number, cy2: number, ang: number): void => {
    items.push(rotatedBoxZ(len, t, d, cx, cy2, w, ang));
  };
  // spokes: heavy every 15 deg, light between
  const hubR = 4.0;
  for (let i = 1; i < 24; i++) {
    const ang = (i * Math.PI) / 24;
    const heavy = i % 2 === 0;
    const quarter = i % 6 === 0;
    const r0 = heavy ? hubR : 7.5;
    const len = R - r0;
    const mid = r0 + len / 2;
    const t = quarter ? 0.3 : heavy ? 0.2 : 0.1;
    box(len, t, quarter ? 0.5 : heavy ? 0.36 : 0.2, Math.cos(ang) * mid, cy + Math.sin(ang) * mid, ang);
  }
  // base bar (sill)
  box(2 * R, 0.3, 0.4, 0, cy + 0.15, 0);
  const ring = (r: number, t: number, d: number): void => {
    items.push(sweep(rectProfile(t, d), arcFrames(v3(0, cy, w), v3(1, 0, 0), v3(0, 1, 0), r, 0, Math.PI, 96, v3(0, 0, 1), 1), { caps: true }));
  };
  ring(R, 0.34, 0.5);
  ring(hubR, 0.34, 0.4);
  ring(9.0, 0.16, 0.26);
  ring(14.5, 0.22, 0.3);
  ring(20.0, 0.16, 0.26);
  ring(25.0, 0.22, 0.3);
  for (const g of items) bags.iron.add(g, m);

  // glass half-disc
  const s = new THREE.Shape();
  s.moveTo(-LUNETTE_OPEN_R, cy);
  s.absarc(0, cy, LUNETTE_OPEN_R, Math.PI, 0, true);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 96);
  g.translate(0, 0, -1.0);
  bags.glass.add(g, m);

  // brass sun disc at the hub
  const sun = new THREE.CylinderGeometry(hubR - 0.2, hubR - 0.2, 0.1, 64, 1, false, 0, Math.PI).rotateX(Math.PI / 2);
  void sun;
}
