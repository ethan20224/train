import * as THREE from 'three';
import { FOOTBRIDGE } from '../../layout';
import { beam, box } from '../shed/common';
import { ball, beamYZ, disc, post, rod } from '../gates/geo';
import { BRIDGE_PIERS, PIER_DX } from './data';

export interface BridgeParts {
  iron: THREE.BufferGeometry[];
  brass: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
  /** Lamp globes: world centre + radius. */
  lamps: { p: THREE.Vector3; r: number }[];
  glass: THREE.BufferGeometry[];
}

const F = FOOTBRIDGE;
const X0 = -31.0;
const X1 = 31.0;
const ZS = F.zMin + 0.1; // south girder centre line
const ZN = F.zMax - 0.1;
const Y_BOT = 6.3;
const Y_TOP = 8.25;
const DECK = F.deckTopY;
const GAPS = F.stairCentersX.map((c) => [c - 1.62, c + 1.62] as const);

// canopy arch (YZ): springing at the parapet top, semicircle-ish
const SPRING_Y = 8.3;
const HALF = (F.zMax - F.zMin) / 2 - 0.1;
const RISE = 1.75;
const ARC_R = (HALF * HALF + RISE * RISE) / (2 * RISE);
const ARC_CY = SPRING_Y + RISE - ARC_R;
const archY = (dz: number): number => ARC_CY + Math.sqrt(Math.max(0, ARC_R * ARC_R - dz * dz));

/** Lattice girder band between x=a..b, z centre zc, y0..y1: chords, posts, X lattice, rosettes. */
function girderBand(p: BridgeParts, a: number, b: number, zc: number, y0: number, y1: number, pitch = 1.3): void {
  const n = Math.max(1, Math.round((b - a) / pitch));
  const pw = (b - a) / n;
  p.iron.push(box(a, b, y0, y0 + 0.17, zc - 0.075, zc + 0.075));
  p.iron.push(box(a, b, y1 - 0.15, y1, zc - 0.075, zc + 0.075));
  p.iron.push(box(a, b, y0 + 0.17, y0 + 0.2, zc - 0.095, zc + 0.095));
  p.iron.push(box(a, b, y1 - 0.18, y1 - 0.15, zc - 0.095, zc + 0.095));
  const yl = y0 + 0.17;
  const yh = y1 - 0.15;
  const ym = (yl + yh) / 2;
  for (let i = 0; i <= n; i++) {
    const x = a + i * pw;
    p.iron.push(box(x - 0.04, x + 0.04, y0, y1, zc - 0.06, zc + 0.06));
    if (i < n) {
      p.iron.push(beam([x, yl], [x + pw, yh], 0.06, 0.09, zc, 0.0));
      p.iron.push(beam([x, yh], [x + pw, yl], 0.06, 0.09, zc, 0.0));
      p.iron.push(disc(x + pw / 2, ym, zc, 0.12, 0.16, 14));
      for (const sz of [-1, 1]) p.brass.push(disc(x + pw / 2, ym, zc + sz * 0.088, 0.05, 0.012, 12));
    }
  }
}

function archRib(p: BridgeParts, x: number): void {
  const seg = 14;
  const th0 = Math.asin(HALF / ARC_R);
  const pt = (th: number, r: number): [number, number] => [ARC_CY + r * Math.cos(th), r * Math.sin(th)];
  const prev: Record<number, [number, number]> = {};
  const prevIn: Record<number, [number, number]> = {};
  for (let i = 0; i <= seg; i++) {
    const th = -th0 + (2 * th0 * i) / seg;
    const o = pt(th, ARC_R + 0.1);
    const inn = pt(th, ARC_R - 0.0);
    if (i > 0) {
      p.iron.push(beamYZ(ZC + prev[i - 1]![1], prev[i - 1]![0], ZC + o[1], o[0], 0.07, 0.1, x));
      p.iron.push(beamYZ(ZC + prevIn[i - 1]![1], prevIn[i - 1]![0], ZC + inn[1], inn[0], 0.05, 0.07, x));
    }
    if (i % 2 === 1 && i > 0 && i < seg) p.iron.push(beamYZ(ZC + inn[1], inn[0], ZC + o[1], o[0], 0.04, 0.05, x));
    prev[i] = o;
    prevIn[i] = inn;
  }
  // zig-zag between inner and outer boom
  for (let i = 0; i < seg; i++) {
    const th = -th0 + (2 * th0 * i) / seg;
    const th2 = -th0 + (2 * th0 * (i + 1)) / seg;
    const a = i % 2 === 0 ? pt(th, ARC_R) : pt(th, ARC_R + 0.1);
    const b = i % 2 === 0 ? pt(th2, ARC_R + 0.1) : pt(th2, ARC_R);
    p.iron.push(beamYZ(ZC + a[1], a[0], ZC + b[1], b[0], 0.025, 0.04, x));
  }
  // springing roundels + crown finial
  for (const s of [-1, 1]) {
    p.iron.push(disc(x, SPRING_Y + 0.22, ZC + s * (HALF - 0.02), 0.09, 0.06, 12).rotateY(0));
  }
  p.iron.push(post(x, archY(0) + 0.1, archY(0) + 0.26, ZC, 0.03, 8));
  p.brass.push(ball(x, archY(0) + 0.3, ZC, 0.045, 10));
}

const ZC = F.centerZ;

/** Concave spandrel bracket in the XY plane, tip at the column face (x=0,y=0), reaching +x * side and rising to y = drop. */
export function bracketGeometry(side: 1 | -1, reach = 1.0, drop = 0.9): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(side * reach, drop);
  s.lineTo(0, drop);
  s.closePath();
  // concave hypotenuse: replace the straight edge with a curve
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.quadraticCurveTo(side * reach * 0.12, drop * 0.55, side * reach, drop);
  sh.lineTo(0, drop);
  sh.closePath();
  const hole = (u: number, v: number, r: number): void => {
    const h = new THREE.Path();
    h.absarc(side * u, v, r, 0, Math.PI * 2, true);
    sh.holes.push(h);
  };
  hole(reach * 0.22, drop * 0.7, drop * 0.14);
  hole(reach * 0.5, drop * 0.9 - 0.02, drop * 0.05);
  hole(reach * 0.1, drop * 0.38, drop * 0.045);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, -drop, -0.05);
  return g;
}

function columnGeometry(): THREE.BufferGeometry {
  const pts = [
    [0.001, 0], [0.34, 0], [0.34, 0.12], [0.26, 0.2], [0.22, 0.3], [0.2, 0.5], [0.2, 5.5], [0.23, 5.62], [0.23, 5.7], [0.2, 5.78], [0.2, 5.95],
    [0.3, 6.1], [0.32, 6.3], [0.001, 6.3],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 18);
}

function stair(p: BridgeParts, c: number): void {
  const N = 40;
  const rise = DECK / N;
  const z0s = F.stairBottomZ;
  const hw = F.stairHalfWidth;
  const sx = hw + 0.06; // stringer / balustrade line
  for (let k = 0; k < N; k++) {
    const z0 = z0s + 0.3 * k;
    const top = rise * (k + 0.5);
    p.wood.push(box(c - hw - 0.02, c + hw + 0.02, top - 0.05, top, z0 - 0.035, z0 + 0.3));
    p.wood.push(box(c - hw - 0.02, c + hw + 0.02, top - rise, top - 0.05, z0, z0 + 0.025));
    p.brass.push(box(c - hw + 0.04, c + hw - 0.04, top - 0.004, top + 0.004, z0 - 0.034, z0 + 0.01));
  }
  // stringers (iron plates with a moulded top edge)
  for (const s of [-1, 1]) {
    const x = c + s * sx;
    p.iron.push(beamYZ(z0s - 0.1, -0.12, F.stairTopZ + 0.15, DECK - 0.12 + 0.15 * (7 / 12), 0.42, 0.09, x));
    p.iron.push(beamYZ(z0s - 0.1, 0.1, F.stairTopZ + 0.15, DECK + 0.1 + 0.15 * (7 / 12), 0.05, 0.13, x));
  }
  // balustrades: posts every 3 treads, brass rail, X lattice, lower rail
  const slope = DECK / (F.stairTopZ - z0s);
  const yLine = (z: number): number => (z - z0s) * slope;
  for (const s of [-1, 1]) {
    const x = c + s * sx;
    const H = 0.95;
    const zs: number[] = [];
    for (let k = 0; k <= N; k += 3) zs.push(z0s + 0.3 * k);
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i]!;
      p.iron.push(box(x - 0.025, x + 0.025, yLine(z) + 0.1, yLine(z) + H, z - 0.025, z + 0.025));
      p.brass.push(ball(x, yLine(z) + H + 0.025, z, 0.032, 8));
      if (i < zs.length - 1) {
        const z1 = zs[i + 1]!;
        const lo = 0.2;
        const hi = H - 0.06;
        p.iron.push(beamYZ(z, yLine(z) + lo, z1, yLine(z1) + hi, 0.018, 0.03, x));
        p.iron.push(beamYZ(z, yLine(z) + hi, z1, yLine(z1) + lo, 0.018, 0.03, x));
        p.iron.push(beamYZ(z, yLine(z) + 0.1, z1, yLine(z1) + 0.1, 0.03, 0.04, x));
        p.iron.push(beamYZ(z, yLine(z) + H - 0.03, z1, yLine(z1) + H - 0.03, 0.03, 0.04, x));
      }
    }
    p.brass.push(rod([x, yLine(z0s) + H + 0.05, z0s], [x, yLine(F.stairTopZ) + H + 0.05, F.stairTopZ], 0.032, 10));
    // handrail returns to the newels
    // newels at foot and head with lamp
    for (const [nz, ny] of [
      [z0s - 0.1, 0],
      [F.stairTopZ - 0.05, DECK],
    ] as const) {
      p.iron.push(box(x - 0.08, x + 0.08, ny, ny + 0.2, nz - 0.08, nz + 0.08));
      p.iron.push(box(x - 0.055, x + 0.055, ny + 0.2, ny + 1.22, nz - 0.055, nz + 0.055));
      p.brass.push(box(x - 0.075, x + 0.075, ny + 1.22, ny + 1.26, nz - 0.075, nz + 0.075));
      p.brass.push(post(x, ny + 1.26, ny + 1.33, nz, 0.045, 10));
      p.lamps.push({ p: new THREE.Vector3(x, ny + 1.45, nz), r: 0.115 });
      p.brass.push(post(x, ny + 1.57, ny + 1.6, nz, 0.06, 10));
      p.brass.push(ball(x, ny + 1.64, nz, 0.03, 8));
    }
    // under-stair lattice flank
    const bx = x;
    const cell = 0.6;
    const nz = Math.round((F.stairTopZ - z0s) / cell);
    const bottom = 0.14;
    p.iron.push(box(bx - 0.04, bx + 0.04, 0, bottom, z0s - 0.05, F.stairTopZ));
    for (let i = 0; i <= nz; i++) {
      const z = z0s + i * cell;
      const top = Math.max(bottom + 0.05, yLine(z) - 0.38);
      p.iron.push(box(bx - 0.035, bx + 0.035, bottom, top, z - 0.04, z + 0.04));
      if (i < nz) {
        const z1 = z + cell;
        const top1 = Math.max(bottom + 0.05, yLine(z1) - 0.38);
        const hmin = Math.min(top, top1);
        p.iron.push(beamYZ(z, bottom, z1, hmin, 0.045, 0.06, bx));
        p.iron.push(beamYZ(z, hmin, z1, bottom, 0.045, 0.06, bx));
        if (top1 > hmin + 0.15) p.iron.push(beamYZ(z, hmin, z1, top1, 0.045, 0.06, bx));
        if (top > hmin + 0.15) p.iron.push(beamYZ(z, top, z1, hmin, 0.045, 0.06, bx));
        // rail along the sloping top
        p.iron.push(beamYZ(z, top, z1, top1, 0.06, 0.07, bx));
      }
    }
  }
  // back portal under the stair head (closes the volume between the stair columns)
  const bz = F.stairTopZ + 0.1;
  const px0 = c - sx;
  const px1 = c + sx;
  p.iron.push(box(px0 - 0.04, px1 + 0.04, 0, 0.18, bz - 0.06, bz + 0.06));
  for (const yy of [1.8, 3.6, 5.3]) p.iron.push(box(px0 - 0.04, px1 + 0.04, yy, yy + 0.1, bz - 0.06, bz + 0.06));
  for (let yi = 0; yi < 4; yi++) {
    const ya = yi === 0 ? 0.18 : [1.8, 3.6, 5.3][yi - 1]! + 0.1;
    const yb = [1.8, 3.6, 5.3, Y_BOT][yi]!;
    p.iron.push(beam([px0, ya], [px1, yb], 0.07, 0.1, bz, 0));
    p.iron.push(beam([px0, yb], [px1, ya], 0.07, 0.1, bz, 0));
    p.iron.push(box(c - 0.04, c + 0.04, ya, yb, bz - 0.05, bz + 0.05));
    p.brass.push(disc(c, (ya + yb) / 2, bz - 0.07, 0.11, 0.02, 16));
  }
  // brass threshold at the deck
  p.brass.push(box(c - hw - 0.02, c + hw + 0.02, DECK, DECK + 0.007, F.stairTopZ, F.stairTopZ + 0.2));
}

/** Collapsible lattice gate across the deck at |x| = 21.8 (reads as the end of the open section). */
function endGate(p: BridgeParts, x: number): void {
  const z0 = F.zMin + 0.2;
  const z1 = F.zMax - 0.2;
  const cell = 0.4;
  const n = Math.round((z1 - z0) / cell);
  const w = (z1 - z0) / n;
  for (let i = 0; i <= n; i++) p.iron.push(box(x - 0.02, x + 0.02, DECK, DECK + 2.2, z0 + i * w - 0.02, z0 + i * w + 0.02));
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const ya = DECK + 0.1 + r * 0.42;
    const yb = ya + 0.42;
    for (let i = 0; i < n; i++) {
      const za = z0 + i * w;
      const zb = za + w;
      if (archY(((za + zb) / 2) - ZC) - 0.12 < yb) continue;
      p.iron.push(beamYZ(za, ya, zb, yb, 0.025, 0.035, x));
      p.iron.push(beamYZ(za, yb, zb, ya, 0.025, 0.035, x));
    }
  }
  p.brass.push(box(x - 0.045, x + 0.045, DECK, DECK + 0.12, z0 - 0.06, z1 + 0.06));
  p.brass.push(box(x - 0.045, x + 0.045, DECK + 2.1, DECK + 2.18, z0 - 0.04, z1 + 0.04));
  p.brass.push(disc(x, DECK + 1.0, ZC, 0.09, 0.14, 16));
}

export function buildBridgeParts(): BridgeParts {
  const p: BridgeParts = { iron: [], brass: [], wood: [], lamps: [], glass: [] };

  // --- girders: north continuous, south split by stair gaps (lower band continues) ---
  girderBand(p, X0, X1, ZN, Y_BOT, Y_TOP);
  const gaps = GAPS;
  const segs: [number, number][] = [];
  let cur = X0;
  for (const [a, b] of gaps) {
    segs.push([cur, a]);
    cur = b;
  }
  segs.push([cur, X1]);
  for (const [a, b] of segs) girderBand(p, a, b, ZS, Y_BOT, Y_TOP);
  for (const [a, b] of gaps) {
    girderBand(p, a, b, ZS, Y_BOT, DECK + 0.05, 0.8);
    // end posts of the parapet at the opening
    for (const x of [a, b]) {
      p.iron.push(box(x - 0.06, x + 0.06, DECK, Y_TOP + 0.05, ZS - 0.08, ZS + 0.08));
      p.brass.push(ball(x, Y_TOP + 0.12, ZS, 0.06, 10));
    }
  }
  // handrails (brass) along both parapets, gaps at the stairs on the south side
  const rail = (a: number, b: number, z: number): void => void p.brass.push(rod([a, Y_TOP + 0.07, z], [b, Y_TOP + 0.07, z], 0.034, 10));
  rail(X0, X1, ZN);
  for (const [a, b] of segs) rail(a, b, ZS);
  p.brass.push(box(X0, X1, Y_TOP - 0.01, Y_TOP + 0.01, ZN - 0.1, ZN + 0.1));
  // finials every ~2.6 m on the parapet posts
  for (let x = X0; x <= X1 + 0.01; x += 2.6) {
    p.brass.push(ball(x, Y_TOP + 0.1, ZN, 0.04, 8));
  }

  // --- deck: timber over iron cross beams ---
  const dz0 = F.zMin + 0.2;
  const dz1 = F.zMax - 0.2;
  p.wood.push(box(X0, X1, DECK - 0.12, DECK, dz0, dz1));
  for (let x = X0 + 0.65; x < X1; x += 1.3) p.iron.push(box(x - 0.06, x + 0.06, 6.45, DECK - 0.12, dz0, dz1));
  for (const z of [ZC - 0.7, ZC + 0.7]) p.iron.push(box(X0, X1, 6.5, DECK - 0.12, z - 0.07, z + 0.07));
  p.iron.push(box(X0, X1, 6.4, 6.5, dz0, dz1));
  // brass plank seams
  for (let x = X0 + 1.3; x < X1; x += 1.3) p.brass.push(box(x - 0.012, x + 0.012, DECK, DECK + 0.004, dz0, dz1));
  p.brass.push(box(X0, X1, DECK, DECK + 0.004, ZC - 0.015, ZC + 0.015));

  // --- canopy ribs every 2.6 m (aligned with panels), purlins ---
  for (let x = X0 + 0.65; x < X1; x += 2.6) archRib(p, x);
  for (const dz of [0, -1.0, 1.0]) {
    const y = archY(dz) + 0.1;
    p.iron.push(box(X0, X1, y - 0.04, y + 0.04, ZC + dz - 0.04, ZC + dz + 0.04));
  }
  // glass: one long arch sheet
  const glassGeo = arcSheetZ();
  p.glass.push(glassGeo);

  // --- parapet lamps on brass arms ---
  for (const x of [-28, -24, -12, -4, 4, 12, 24, 28]) {
    for (const [zc, s] of [
      [ZS, 1],
      [ZN, -1],
    ] as const) {
      p.brass.push(rod([x, Y_TOP - 0.08, zc + s * 0.09], [x, Y_TOP + 0.38, zc + s * 0.5], 0.022, 8));
      p.brass.push(rod([x, Y_TOP + 0.38, zc + s * 0.5], [x, Y_TOP + 0.5, zc + s * 0.55], 0.016, 8));
      p.lamps.push({ p: new THREE.Vector3(x, Y_TOP + 0.5, zc + s * 0.58), r: 0.085 });
      p.brass.push(post(x, Y_TOP + 0.6, Y_TOP + 0.65, zc + s * 0.58, 0.05, 10));
    }
  }

  // --- piers + brackets ---
  const col = columnGeometry();
  for (const pr of BRIDGE_PIERS) {
    p.iron.push(col.clone().translate(pr.x, 0, pr.z));
    for (const s of [-1, 1] as const) {
      p.iron.push(bracketGeometry(s).translate(pr.x, Y_BOT, pr.z < ZC ? ZS : ZN));
    }
  }
  // abutment brackets at the shed walls
  for (const sx of [-1, 1]) {
    for (const zc of [ZS, ZN]) {
      p.iron.push(bracketGeometry(-sx as 1 | -1, 1.5, 1.35).translate(sx * 30.95, Y_BOT, zc));
    }
    p.iron.push(box(sx * 31.0 - 0.18, sx * 31.0 + 0.18, 5.4, 7.0, F.zMin + 0.2, F.zMax - 0.2));
    p.brass.push(box(sx * 31.0 - 0.2, sx * 31.0 + 0.2, 7.0, 7.03, F.zMin + 0.2, F.zMax - 0.2));
    p.brass.push(disc(sx * 30.8, 6.2, ZC, 0.2, 0.06, 18).rotateY(0));
  }
  void PIER_DX;

  // --- stairs + end gates ---
  for (const c of F.stairCentersX) stair(p, c);
  for (const s of [-1, 1]) endGate(p, s * (F.walkXMax + 0.4));
  return p;
}

function arcSheetZ(): THREE.BufferGeometry {
  const segs = 24;
  const th0 = Math.asin(HALF / ARC_R);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const th = -th0 + (2 * th0 * i) / segs;
    const dz = ARC_R * Math.sin(th);
    const y = ARC_CY + ARC_R * Math.cos(th);
    const nz = Math.sin(th);
    const ny = Math.cos(th);
    pos.push(X0, y, ZC + dz, X1, y, ZC + dz);
    nor.push(0, ny, nz, 0, ny, nz);
    uv.push(0, i / segs, 1, i / segs);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
