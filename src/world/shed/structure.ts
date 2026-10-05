import * as THREE from 'three';
import type { BuildContext } from '../../core/types';
import { SHED } from '../../layout';
import { TRUSS_ZS } from './layoutData';
import { arcSheet, beam, box, finish, instanced, ironPaint, mesh, T, tinted, zCylinder } from './common';

/** Roof arc: single circular arc through (+-32, 10) and (0, 34). */
const HALF = (SHED.xMax - SHED.xMin) / 2;
const RISE = SHED.crownY - SHED.springlineY;
export const ARC_R = (HALF * HALF + RISE * RISE) / (2 * RISE);
export const ARC_CY = SHED.crownY - ARC_R;
const TH0 = Math.asin(HALF / ARC_R);
const LANTERN_HALF = 2.6;
const COLX = 31.65;
const Z0 = SHED.zMin;
const Z1 = SHED.zMax;
const BAR_PITCH = 1.5;

const pt = (r: number, th: number): [number, number] => [r * Math.sin(th), ARC_CY + r * Math.cos(th)];

function trussGeometry(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const N = 30;
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const th = -TH0 + (2 * TH0 * i) / N;
    const depth = 0.8 + 1.6 * Math.cos((th / TH0) * (Math.PI / 2));
    top.push(pt(ARC_R, th));
    bot.push(pt(ARC_R - depth, th));
  }
  for (let i = 0; i < N; i++) {
    parts.push(beam(top[i]!, top[i + 1]!, 0.3, 0.5));
    parts.push(beam(bot[i]!, bot[i + 1]!, 0.24, 0.42));
    // Warren lacing, alternating diagonals, with a vertical at every node.
    if (i % 2 === 0) parts.push(beam(bot[i]!, top[i + 1]!, 0.13, 0.22));
    else parts.push(beam(top[i]!, bot[i + 1]!, 0.13, 0.22));
  }
  for (let i = 1; i < N; i++) {
    parts.push(beam(bot[i]!, top[i]!, 0.15, 0.24));
    // Rosettes on the lower chord near the springing (decorative cast roundels).
    if (i <= 7 || i >= N - 7) parts.push(zCylinder(0.22, 0.14, bot[i]![0], bot[i]![1], 0));
  }
  // Foot shoes and spandrel brackets landing on the arcade columns.
  for (const s of [-1, 1]) {
    const e = s < 0 ? bot[0]! : bot[N]!;
    parts.push(box(s * COLX - 0.34, s * COLX + 0.34, 9.05, e[1] + 0.25, -0.3, 0.3));
    // Quarter-round spandrel scroll under the foot (flat roundels on a curved web).
    for (let k = 0; k < 4; k++) {
      const a = (k / 3) * (Math.PI / 2.6);
      parts.push(zCylinder(0.12 + 0.04 * (3 - k), 0.12, s * (COLX - 0.9 - 0.62 * Math.sin(a) * 1.6), 9.0 - 0.7 * (1 - Math.cos(a)) * 1.2 + 0.0, 0));
    }
  }
  // Lantern portal: posts and rafters carried on the crown.
  const base = ARC_CY + Math.sqrt(ARC_R * ARC_R - LANTERN_HALF * LANTERN_HALF) - 0.5;
  for (const s of [-1, 1]) {
    parts.push(box(s * LANTERN_HALF - 0.08, s * LANTERN_HALF + 0.08, base, 36.35, -0.13, 0.13));
    parts.push(beam([s * 2.9, 36.3], [0, 37.5], 0.14, 0.2));
    parts.push(beam([s * LANTERN_HALF, 35.4], [0, 36.8], 0.07, 0.12));
  }
  parts.push(beam([-LANTERN_HALF, 36.3], [LANTERN_HALF, 36.3], 0.12, 0.2));
  parts.push(box(-0.1, 0.1, 36.3, 37.4, -0.1, 0.1));
  return parts;
}

function barGeometry(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const Rb = ARC_R + 0.36;
  const thL = Math.asin(LANTERN_HALF / Rb);
  const segs = 14;
  for (const s of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const a = thL + ((TH0 - thL) * i) / segs;
      const b = thL + ((TH0 - thL) * (i + 1)) / segs;
      parts.push(beam(pt(Rb, s * a), pt(Rb, s * b), 0.07, 0.07, 0, 0.02));
    }
    // Lantern wall mullion and rafter.
    const yb = ARC_CY + Math.sqrt(ARC_R * ARC_R - LANTERN_HALF * LANTERN_HALF) - 0.3;
    parts.push(box(s * LANTERN_HALF - 0.035, s * LANTERN_HALF + 0.035, yb, 36.32, -0.035, 0.035));
    parts.push(beam([s * 2.95, 36.3], [0, 37.55], 0.06, 0.07, 0, 0.02));
  }
  return parts;
}

function longitudinalGeometry(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const Rp = ARC_R + 0.2;
  const thL = Math.asin(LANTERN_HALF / Rp);
  const n = 13;
  for (const s of [-1, 1]) {
    for (let i = 0; i <= n; i++) {
      const th = thL + ((TH0 - thL) * i) / n;
      const p = pt(Rp, s * th);
      parts.push(box(p[0] - 0.09, p[0] + 0.09, p[1] - 0.12, p[1] + 0.12, Z0, Z1));
    }
    parts.push(box(s * LANTERN_HALF - 0.1, s * LANTERN_HALF + 0.1, 36.2, 36.4, Z0, Z1)); // lantern eaves
    parts.push(box(s * LANTERN_HALF - 0.08, s * LANTERN_HALF + 0.08, 34.1, 34.3, Z0, Z1));
    parts.push(box(s * 3.0 - 0.06, s * 3.0 + 0.06, 36.25, 36.45, Z0, Z1));
    // eave gutter beam above the arcade
    parts.push(box(s * COLX - 0.55, s * COLX + 0.35, 9.2, 10.05, Z0, Z1));
    parts.push(box(s * (COLX + 0.45) - 0.12, s * (COLX + 0.45) + 0.12, 9.1, 10.25, Z0, Z1));
  }
  parts.push(box(-0.14, 0.14, 37.35, 37.65, Z0, Z1)); // ridge
  return parts;
}

function columnGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    [0.001, 0], [0.46, 0], [0.46, 0.18], [0.36, 0.26], [0.27, 0.34], [0.23, 0.5], [0.23, 4.9],
    [0.27, 5.0], [0.27, 5.1], [0.23, 5.18], [0.24, 5.5], [0.34, 5.78], [0.4, 6.0], [0.46, 6.1], [0.46, 6.3], [0.001, 6.3],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 20);
  g.translate(0, SHED.plinthHeight, 0);
  return g;
}

function arcadeBayGeometry(): THREE.BufferGeometry {
  // Local (u along the wall, v up). Segmental arch 11 m span, rise 2.1, solid spandrel with roundels above it.
  const spanHalf = 5.45;
  const rise = 2.1;
  const sp = 6.5;
  const R = (spanHalf * spanHalf + rise * rise) / (2 * rise);
  const yc = sp + rise - R;
  const top = 9.2;
  const s = new THREE.Shape();
  const arcY = (u: number): number => yc + Math.sqrt(R * R - u * u);
  s.moveTo(-spanHalf - 0.3, sp - 0.35);
  s.lineTo(-spanHalf, sp - 0.35);
  s.lineTo(-spanHalf, sp);
  const n = 24;
  for (let i = 1; i <= n; i++) {
    const u = -spanHalf + (2 * spanHalf * i) / n;
    s.lineTo(u, arcY(u));
  }
  s.lineTo(spanHalf, sp - 0.35);
  s.lineTo(spanHalf + 0.3, sp - 0.35);
  s.lineTo(spanHalf + 0.3, top);
  s.lineTo(-spanHalf - 0.3, top);
  s.closePath();
  const hole = (u: number, v: number, r: number): void => {
    const h = new THREE.Path();
    h.absarc(u, v, r, 0, Math.PI * 2, true);
    s.holes.push(h);
  };
  for (const sg of [-1, 1]) {
    hole(sg * 4.75, 8.15, 0.5);
    hole(sg * 3.5, 8.62, 0.27);
    hole(sg * 5.2, 7.2, 0.2);
    hole(sg * 2.35, 8.9, 0.14);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -0.15);
  g.rotateY(Math.PI / 2);
  return g;
}

function glassGeometry(): THREE.BufferGeometry {
  const Rg = ARC_R + 0.33;
  const thL = Math.asin(LANTERN_HALF / Rg);
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(arcSheet(ARC_CY, Rg, s * thL, s * TH0, 24, Z0, Z1));
    // lantern wall + roof (one flat sheet each)
    const yb = ARC_CY + Math.sqrt(Rg * Rg - LANTERN_HALF * LANTERN_HALF) - 0.3;
    const wall = new THREE.PlaneGeometry(Z1 - Z0, 36.3 - yb);
    wall.rotateY(-Math.PI / 2 * s);
    wall.translate(s * LANTERN_HALF, (36.3 + yb) / 2, (Z0 + Z1) / 2);
    parts.push(wall);
    const dx = 2.95;
    const dy = 37.55 - 36.3;
    const len = Math.hypot(dx, dy);
    const roof = new THREE.PlaneGeometry(len, Z1 - Z0);
    roof.rotateX(-Math.PI / 2); // lie flat facing +y, width along z, depth along x
    roof.rotateZ(s * Math.atan2(dy, dx) * -1);
    roof.translate(s * dx / 2, 36.3 + dy / 2, (Z0 + Z1) / 2);
    parts.push(roof);
  }
  const m = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const out = new THREE.BufferGeometry();
  const total = m.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const P = new Float32Array(total * 3);
  const Nn = new Float32Array(total * 3);
  const U = new Float32Array(total * 2);
  let o = 0;
  for (const g of m) {
    const c = g.getAttribute('position').count;
    P.set(g.getAttribute('position').array as Float32Array, o * 3);
    Nn.set(g.getAttribute('normal').array as Float32Array, o * 3);
    U.set(g.getAttribute('uv').array as Float32Array, o * 2);
    o += c;
  }
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.computeBoundingSphere();
  return out;
}

export function buildStructure(ctx: BuildContext): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'shedStructure';
  const iron = ironPaint(ctx);
  const trussMats = [102.6, ...TRUSS_ZS].map((z) => T(0, 0, z));

  root.add(instanced(finish(ctx, trussGeometry(), 'castIron'), iron, trussMats, true));
  root.add(instanced(finish(ctx, barGeometry(), 'castIron'), iron, Array.from({ length: Math.floor((Z1 - Z0) / BAR_PITCH) + 1 }, (_, i) => T(0, 0, Z0 + i * BAR_PITCH)), true));
  root.add(mesh(finish(ctx, longitudinalGeometry(), 'castIron'), iron, true));

  const colMats: THREE.Matrix4[] = [];
  const bayMats: THREE.Matrix4[] = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < TRUSS_ZS.length; k++) {
      colMats.push(T(s * COLX, 0, TRUSS_ZS[k]!));
      if (k < TRUSS_ZS.length - 1) bayMats.push(T(s * COLX, SHED.plinthHeight - 0.0, TRUSS_ZS[k]! + SHED.trussSpacing / 2));
    }
  }
  root.add(instanced(finish(ctx, [columnGeometry()], 'castIron'), iron, colMats, true));
  root.add(instanced(finish(ctx, [arcadeBayGeometry()], 'castIron'), iron, bayMats, true));

  // Glazing: warm, slightly hazy; never casts into the sun map.
  const glass = ctx.materials.get('glass').clone();
  glass.name = 'shedGlass';
  glass.color.set(0xf4e3c0);
  glass.opacity = 0.3;
  glass.roughness = 0.12;
  glass.side = THREE.DoubleSide;
  const glassMesh = mesh(glassGeometry(), glass, false, false);
  glassMesh.renderOrder = 2;
  root.add(glassMesh);

  // Side walls: dark marble base course + pale ashlar plinth, capped by a moulded string course.
  const stone = tinted(ctx, 'wallStone', 0xe9d6b4);
  const dark = ctx.materials.get('darkMarble');
  const plinth: THREE.BufferGeometry[] = [];
  const base: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const x = (a: number, b: number): [number, number] => (s < 0 ? [-b, -a] : [a, b]);
    base.push(box(...x(31.1, 32.35), -1.5, 0.9, Z0, Z1));
    plinth.push(box(...x(31.2, 32.2), 0.9, 2.9, Z0, Z1));
    plinth.push(box(...x(31.0, 32.4), 2.9, 3.02, Z0, Z1));
    plinth.push(box(...x(31.05, 32.3), 3.02, 3.14, Z0, Z1));
    for (const z of TRUSS_ZS) plinth.push(box(...x(31.05, 32.3), 0.9, 3.14, z - 0.7, z + 0.7));
  }
  root.add(mesh(finish(ctx, plinth, 'wallStone'), stone, true));
  root.add(mesh(finish(ctx, base, 'darkMarble'), dark, true));

  // End infill beside the concourse wall (x 30..32.3): stone panel up to the roof arc, at z 102..102.7.
  const fill: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(s * 30, -1.5);
    sh.lineTo(s * 32.35, -1.5);
    const rr = ARC_R + 0.45;
    for (let i = 0; i <= 12; i++) {
      const th = Math.asin(32.35 / rr) - ((Math.asin(32.35 / rr) - Math.asin(30 / rr)) * i) / 12;
      const p = pt(rr, th);
      sh.lineTo(s * p[0], p[1]);
    }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false });
    g.translate(0, 0, Z0);
    fill.push(g);
  }
  root.add(mesh(finish(ctx, fill, 'wallStone'), stone, true));
  return root;
}
