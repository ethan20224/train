import * as THREE from 'three';
import { GATES, gateLaneCentersX } from '../../layout';
import { beam, box } from '../shed/common';
import { ball, beamYZ, disc, post } from './geo';

export interface GateParts {
  dark: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
  brass: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  black: THREE.BufferGeometry[];
  /** Lamp ball centres, 4 per lane in lane order (see gateLaneCentersX). */
  lamps: THREE.Vector3[];
  /** Hinge x positions per lane: [left, right]. */
  hinges: [number, number][];
}

const Z = GATES.lineZ;
const HALF_L = 0.6;
const CAB_H = 1.04;

function plan(halfW: number, halfL: number, y0: number, y1: number): THREE.BufferGeometry {
  const t = Math.min(0.06, halfW * 0.6);
  const e = 0.12;
  const s = new THREE.Shape([
    new THREE.Vector2(-halfW, -(halfL - e)),
    new THREE.Vector2(-halfW, halfL - e),
    new THREE.Vector2(-halfW + t, halfL),
    new THREE.Vector2(halfW - t, halfL),
    new THREE.Vector2(halfW, halfL - e),
    new THREE.Vector2(halfW, -(halfL - e)),
    new THREE.Vector2(halfW - t, -halfL),
    new THREE.Vector2(-halfW + t, -halfL),
  ]);
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

function wedge(cx: number, zc: number, dir: 1 | -1): THREE.BufferGeometry {
  const s = new THREE.Shape([new THREE.Vector2(-0.15, 0), new THREE.Vector2(0.15, 0), new THREE.Vector2(0.15, 0.045), new THREE.Vector2(-0.15, 0.13)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-0.125, 0, 0);
  if (dir < 0) g.rotateY(Math.PI);
  g.translate(cx, CAB_H, zc);
  return g;
}

function cabinet(cx: number, p: GateParts, lampLanes: { x: number; zc: number }[]): void {
  const at = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(cx, 0, Z);
  p.dark.push(at(plan(0.15, HALF_L, 0.08, 0.98)));
  p.dark.push(at(plan(0.16, HALF_L, 0, 0.08)));
  p.wood.push(at(plan(0.17, HALF_L + 0.0, 0.98, CAB_H)));
  // brass bands
  for (const y of [0.1, 0.94]) p.brass.push(box(cx - 0.157, cx + 0.157, y, y + 0.014, Z - 0.46, Z + 0.46));
  p.brass.push(box(cx - 0.172, cx + 0.172, CAB_H, CAB_H + 0.008, Z - 0.5, Z + 0.5));
  for (const sx of [-1, 1]) {
    const xf = cx + sx * 0.153;
    // vertical fluting on each side face
    for (let k = -4; k <= 4; k++) {
      p.brass.push(box(xf - 0.007, xf + 0.007, 0.22, 0.82, Z + k * 0.044 - 0.009, Z + k * 0.044 + 0.009));
    }
    // fluting terminals
    for (const y of [0.2, 0.82]) p.brass.push(box(xf - 0.008, xf + 0.008, y, y + 0.025, Z - 0.2, Z + 0.2));
    // nested chevrons near both ends
    for (const zc of [-0.38, 0.38]) {
      for (let n = 0; n < 3; n++) {
        const y0 = 0.3 + n * 0.1;
        p.brass.push(beamYZ(Z + zc - 0.085, y0, Z + zc, y0 + 0.07, 0.014, 0.012, xf));
        p.brass.push(beamYZ(Z + zc, y0 + 0.07, Z + zc + 0.085, y0, 0.014, 0.012, xf));
      }
    }
  }
  // reader plates (south and north), lamp bezels
  for (const dir of [1, -1] as const) {
    const zc = Z + dir * 0.31;
    p.brass.push(wedge(cx, zc, dir));
  }
  for (const l of lampLanes) {
    p.brass.push(post(l.x, CAB_H + 0.08, CAB_H + 0.095, l.zc, 0.034, 14));
  }
}

export function buildGateParts(): GateParts {
  const p: GateParts = { dark: [], wood: [], brass: [], glass: [], black: [], lamps: [], hinges: [] };
  const lanes = gateLaneCentersX();
  // cabinets: 8 per bank
  for (const bx of GATES.bankCentersX) {
    for (let k = 0; k < 8; k++) {
      const cx = bx + (k - 3.5) * GATES.lanePitch;
      const lampLanes: { x: number; zc: number }[] = [];
      for (const dir of [1, -1]) {
        const zc = Z + dir * 0.31;
        if (k >= 1) lampLanes.push({ x: cx - 0.065, zc });
        if (k <= 6) lampLanes.push({ x: cx + 0.065, zc });
      }
      cabinet(cx, p, lampLanes);
    }
  }
  // lamp ball positions grouped by lane: lane l has cabinets k=l (right side lamps, x+0.065) and l+1 (left side lamps, x-0.065)
  lanes.forEach((lc) => {
    for (const cxo of [-0.7, 0.7]) {
      for (const dir of [1, -1]) {
        p.lamps.push(new THREE.Vector3(lc + cxo + (cxo < 0 ? 0.065 : -0.065), CAB_H + 0.1, Z + dir * 0.31));
      }
    }
    p.hinges.push([lc - 0.55 + 0.034, lc + 0.55 - 0.034]);
    for (const hx of [lc - 0.55, lc + 0.55]) {
      p.brass.push(post(hx + (hx < lc ? 0.0 : 0.0), 0.24, 1.0, Z, 0.016, 8));
      p.brass.push(ball(hx, 1.0, Z, 0.022, 8));
    }
  });
  buildScreens(p);
  buildSigns(p);
  return p;
}

function buildScreens(p: GateParts): void {
  const edges: number[] = [];
  const bankHalf = GATES.bankWidth / 2;
  const xs = GATES.bankCentersX;
  const gaps: [number, number][] = [
    [GATES.screenXMin, xs[0] - bankHalf],
    [xs[0] + bankHalf, xs[1] - bankHalf],
    [xs[1] + bankHalf, xs[2] - bankHalf],
    [xs[2] + bankHalf, GATES.screenXMax],
  ];
  void edges;
  const H = GATES.screenHeight;
  for (const [a, b] of gaps) {
    const n = Math.max(1, Math.round((b - a) / 1.9));
    const step = (b - a) / n;
    // continuous wood plinth + brass kick, rail above grille, top rail
    p.wood.push(box(a, b, 0, 0.07, Z - 0.075, Z + 0.075));
    p.brass.push(box(a, b, 0.07, 0.095, Z - 0.062, Z + 0.062));
    p.brass.push(box(a, b, 0.44, 0.5, Z - 0.04, Z + 0.04));
    p.brass.push(box(a, b, 0.455, 0.47, Z - 0.05, Z + 0.05));
    p.brass.push(box(a, b, H - 0.1, H - 0.04, Z - 0.045, Z + 0.045));
    for (let i = 0; i <= n; i++) {
      const x = a + i * step;
      const inner = i > 0 && i < n;
      p.brass.push(box(x - 0.035, x + 0.035, 0.07, H - 0.04, Z - 0.035, Z + 0.035));
      p.brass.push(box(x - 0.05, x + 0.05, 0.07, 0.2, Z - 0.05, Z + 0.05));
      p.brass.push(box(x - 0.05, x + 0.05, H - 0.14, H - 0.04, Z - 0.05, Z + 0.05));
      p.brass.push(ball(x, H - 0.0, Z, inner ? 0.04 : 0.05, 10));
      p.brass.push(post(x, H - 0.04, H - 0.01, Z, 0.022, 8));
    }
    // grille: spindles + zig-zag
    const m = Math.max(2, Math.round((b - a) / 0.1));
    const gs = (b - a) / m;
    for (let i = 1; i < m; i++) {
      const x = a + i * gs;
      p.brass.push(box(x - 0.006, x + 0.006, 0.1, 0.44, Z - 0.007, Z + 0.007));
      const x1 = x + gs;
      if (i < m - 1) {
        const up = i % 2 === 0;
        p.brass.push(beam([x, up ? 0.12 : 0.4], [x1, up ? 0.4 : 0.12], 0.009, 0.012, Z, 0.0));
      }
    }
    // glass panes between posts
    for (let i = 0; i < n; i++) {
      const x0 = a + i * step + 0.035;
      const x1 = a + (i + 1) * step - 0.035;
      const g = new THREE.PlaneGeometry(x1 - x0, H - 0.1 - 0.5 - 0.0);
      g.translate((x0 + x1) / 2, 0.5 + (H - 0.1 - 0.5) / 2, Z);
      p.glass.push(g);
    }
    // thin brass glazing bar mid-height every pane
    for (let i = 0; i < n; i++) {
      const xm = a + (i + 0.5) * step;
      p.brass.push(box(xm - 0.007, xm + 0.007, 0.5, H - 0.1, Z - 0.012, Z + 0.012));
    }
  }
}

export const SIGN = { y0: 3.3, h: 0.62, w: 4.6, postDx: 2.1, depth: 0.1 } as const;

function buildSigns(p: GateParts): void {
  for (const bx of GATES.bankCentersX) {
    for (const s of [-1, 1]) {
      const x = bx + s * SIGN.postDx;
      p.brass.push(post(x, CAB_H, SIGN.y0 + 0.02, Z, 0.028, 10));
      p.brass.push(post(x, CAB_H, CAB_H + 0.1, Z, 0.055, 12));
      p.brass.push(post(x, CAB_H + 0.1, CAB_H + 0.14, Z, 0.04, 12));
      p.brass.push(post(x, SIGN.y0 - 0.05, SIGN.y0 + 0.02, Z, 0.045, 12));
      p.brass.push(ball(x, SIGN.y0 + SIGN.h + 0.06, Z, 0.05, 10));
    }
    const x0 = bx - SIGN.w / 2;
    const x1 = bx + SIGN.w / 2;
    const y0 = SIGN.y0;
    const y1 = SIGN.y0 + SIGN.h;
    p.black.push(box(x0, x1, y0, y1, Z - SIGN.depth / 2, Z + SIGN.depth / 2));
    // brass frame (front & back)
    for (const zs of [-1, 1]) {
      const zf = Z + zs * (SIGN.depth / 2 + 0.004);
      p.brass.push(box(x0 - 0.02, x1 + 0.02, y1 - 0.02, y1 + 0.03, zf - 0.012, zf + 0.012));
      p.brass.push(box(x0 - 0.02, x1 + 0.02, y0 - 0.03, y0 + 0.02, zf - 0.012, zf + 0.012));
      p.brass.push(box(x0 - 0.03, x0 + 0.02, y0 - 0.03, y1 + 0.03, zf - 0.012, zf + 0.012));
      p.brass.push(box(x1 - 0.02, x1 + 0.03, y0 - 0.03, y1 + 0.03, zf - 0.012, zf + 0.012));
    }
    // top cresting
    p.brass.push(disc(bx, y1 + 0.09, Z, 0.07, 0.03, 16));
    p.brass.push(box(bx - 0.5, bx + 0.5, y1 + 0.03, y1 + 0.05, Z - 0.03, Z + 0.03));
    p.brass.push(box(bx - 0.28, bx + 0.28, y1 + 0.05, y1 + 0.07, Z - 0.025, Z + 0.025));
  }
}
