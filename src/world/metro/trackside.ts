import * as THREE from 'three';
import { PORTAL, TRACK_DETAIL as TD } from '../../layoutMetro';
import type { MetroTrack } from '../../metro/tracks';
import { sweep, v3, type Frame, type P2 } from '../concourse/geo';

/**
 * Trackside equipment of the detailed slab track (user brief 2026-11-23): covered third rail, cable trays, drainage grating,
 * balises, axle counters, marker lights, platform-end signal masts, bore cabinets and walkway edge. Every part is a real piece
 * of 2035 driverless-metro track equipment at true scale; stainless / graphite / cream composite, small status LEDs only.
 *
 * Geometry is written in track-local coordinates (a = lateral along the right-hand normal (-dz, dx), y = metres relative to
 * rail-head height, s = metres along the travel direction) into per-material `Sink`s that become one merged vertex-coloured mesh
 * each. A colour channel above 1.2 renders as an unlit HDR emitter (see glow.ts `vertexGlow`).
 */

export type RGB = readonly [number, number, number];

/** Micro-detail (metres, local y relative to rail head). Cross-module dimensions live in layoutMetro TRACK_DETAIL. */
const EQ = {
  // covered third rail (outboard side, below the train floor line)
  powerLat: 1.2, conductorHalfW: 0.035, conductorY: [0.0, 0.07] as const, coverSection: 3.0, coverGap: 0.012, bracketPitch: 3.0,
  plinthOuterLat: TD.halfGauge + 0.27, plinthTop: -0.2,
  // cable trays
  trayOutLat: [1.38, 1.52] as const, trayOutBaseY: -0.26, trayPlatBaseY: -0.32, trayPitch: 3.0, trayCableR: 0.014,
  // drainage grating over the central slot
  gratingHalfW: 0.15, gratingY: -0.338, gratingPanel: 4.8,
  // signal mast
  mastTop: 2.05, headH: 0.44, headW: 0.15, headD: 0.16, lensR: 0.05,
  // bore
  boreD0: 0.5, markerPitch: 10,
} as const;

const C = {
  head: [0.95, 0.96, 0.98] as RGB, railDark: [0.3, 0.32, 0.36] as RGB,
  stainless: [0.8, 0.82, 0.84] as RGB, stainlessDk: [0.52, 0.54, 0.57] as RGB, conductor: [0.46, 0.48, 0.52] as RGB,
  graphite: [0.05, 0.055, 0.065] as RGB, graphite2: [0.1, 0.105, 0.12] as RGB,
  cableBlack: [0.018, 0.018, 0.022] as RGB, cableGrey: [0.07, 0.075, 0.085] as RGB,
  cover: [0.5, 0.48, 0.42] as RGB, insulator: [0.52, 0.5, 0.44] as RGB, balise: [0.2, 0.215, 0.24] as RGB, baliseTop: [0.34, 0.36, 0.4] as RGB,
  ledWhite: [2.4, 2.7, 3.0] as RGB, ledGreen: [0.25, 2.3, 0.7] as RGB, ledAmber: [3.0, 1.45, 0.15] as RGB,
  lensRed: [0.17, 0.02, 0.02] as RGB,
};
export const TRACK_COLORS = C;

export const ccw2 = (pts: readonly P2[]): P2[] => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...pts].reverse() : [...pts];
};

/** Collects flat-shaded boxes and swept prisms in track-local coordinates into one vertex-coloured geometry. */
export class Sink {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];
  private readonly uv: number[] = [];
  private readonly ox: number; private readonly oz: number;
  private readonly dx: number; private readonly dz: number;
  private readonly px: number; private readonly pz: number;
  private readonly ry: number;

  constructor(track: MetroTrack) {
    [this.ox, this.oz] = track.origin;
    [this.dx, this.dz] = track.dir;
    this.px = -this.dz; this.pz = this.dx;
    this.ry = track.railY;
  }

  get triangles(): number { return this.pos.length / 9; }
  wx(a: number, s: number): number { return this.ox + this.dx * s + this.px * a; }
  wz(a: number, s: number): number { return this.oz + this.dz * s + this.pz * a; }
  wy(y: number): number { return this.ry + y; }

  private tri(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
    nx: number, ny: number, nz: number, rgb: RGB,
  ): void {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const crx = e1y * e2z - e1z * e2y, cry = e1z * e2x - e1x * e2z, crz = e1x * e2y - e1y * e2x;
    if (crx * nx + cry * ny + crz * nz < 0) { [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; [bz, cz] = [cz, bz]; }
    const ux = Math.abs(nx), uy = Math.abs(ny), uz = Math.abs(nz);
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] as const) {
      this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.col.push(rgb[0], rgb[1], rgb[2]);
      if (uy >= ux && uy >= uz) this.uv.push(x, z); else if (ux >= uz) this.uv.push(z, y); else this.uv.push(x, y);
    }
  }

  private quad(c: readonly number[], nx: number, ny: number, nz: number, rgb: RGB): void {
    this.tri(c[0]!, c[1]!, c[2]!, c[3]!, c[4]!, c[5]!, c[6]!, c[7]!, c[8]!, nx, ny, nz, rgb);
    this.tri(c[0]!, c[1]!, c[2]!, c[6]!, c[7]!, c[8]!, c[9]!, c[10]!, c[11]!, nx, ny, nz, rgb);
  }

  /** Axis-aligned (in the track frame) box; bounds in any order. */
  box(a0: number, a1: number, y0: number, y1: number, s0: number, s1: number, rgb: RGB, bottom = true): this {
    const A0 = Math.min(a0, a1), A1 = Math.max(a0, a1), Y0 = Math.min(y0, y1), Y1 = Math.max(y0, y1);
    const S0 = Math.min(s0, s1), S1 = Math.max(s0, s1);
    const P = (a: number, y: number, s: number): number[] => [this.wx(a, s), this.wy(y), this.wz(a, s)];
    const f = (pts: number[][], nx: number, ny: number, nz: number): void => { this.quad(pts.flat(), nx, ny, nz, rgb); };
    f([P(A1, Y0, S0), P(A1, Y1, S0), P(A1, Y1, S1), P(A1, Y0, S1)], this.px, 0, this.pz);
    f([P(A0, Y0, S0), P(A0, Y1, S0), P(A0, Y1, S1), P(A0, Y0, S1)], -this.px, 0, -this.pz);
    f([P(A0, Y1, S0), P(A1, Y1, S0), P(A1, Y1, S1), P(A0, Y1, S1)], 0, 1, 0);
    if (bottom) f([P(A0, Y0, S0), P(A1, Y0, S0), P(A1, Y0, S1), P(A0, Y0, S1)], 0, -1, 0);
    f([P(A0, Y0, S1), P(A1, Y0, S1), P(A1, Y1, S1), P(A0, Y1, S1)], this.dx, 0, this.dz);
    f([P(A0, Y0, S0), P(A1, Y0, S0), P(A1, Y1, S0), P(A0, Y1, S0)], -this.dx, 0, -this.dz);
    return this;
  }

  /** Appends a world-space, non-indexed geometry (position + normal). */
  private addWorld(g: THREE.BufferGeometry, rgb: RGB): void {
    const src = g.index ? g.toNonIndexed() : g;
    const p = src.getAttribute('position') as THREE.BufferAttribute;
    const n = src.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.col.push(rgb[0], rgb[1], rgb[2]);
      const ux = Math.abs(nx), uy = Math.abs(ny), uz = Math.abs(nz);
      if (uy >= ux && uy >= uz) this.uv.push(x, z); else if (ux >= uz) this.uv.push(z, y); else this.uv.push(x, y);
    }
    src.dispose();
    if (src !== g) g.dispose();
  }

  /** Extrudes a profile given in (a, y) along s0..s1. */
  prism(profile: readonly P2[], s0: number, s1: number, rgb: RGB, smooth = 35): this {
    const perp = v3(this.px, 0, this.pz), up = v3(0, 1, 0);
    const fr = (s: number): Frame => ({ o: v3(this.wx(0, s), this.ry, this.wz(0, s)), a: perp, b: up });
    this.addWorld(sweep(ccw2(profile), [fr(s0), fr(s1)], { closed: true, caps: true, smooth }), rgb);
    return this;
  }

  /** Extrudes a profile given in (a, s) upward from y0 to y1 (chamfered housings, posts). */
  prismY(profile: readonly P2[], y0: number, y1: number, rgb: RGB): this {
    const perp = v3(this.px, 0, this.pz), dir = v3(this.dx, 0, this.dz);
    const fr = (y: number): Frame => ({ o: v3(this.wx(0, 0), this.wy(y), this.wz(0, 0)), a: perp, b: dir });
    this.addWorld(sweep(ccw2(profile), [fr(y0), fr(y1)], { closed: true, caps: true, smooth: 30 }), rgb);
    return this;
  }

  /** Round bar / cable / lens between two local points. */
  tube(a0: number, y0: number, s0: number, a1: number, y1: number, s1: number, r: number, n: number, rgb: RGB): this {
    const p0 = v3(this.wx(a0, s0), this.wy(y0), this.wz(a0, s0));
    const p1 = v3(this.wx(a1, s1), this.wy(y1), this.wz(a1, s1));
    const t = p1.clone().sub(p0).normalize();
    const u = Math.abs(t.y) > 0.99 ? v3(1, 0, 0) : v3(0, 1, 0).cross(t).normalize();
    const w = t.clone().cross(u).normalize();
    const prof: P2[] = Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * Math.PI * 2), r * Math.sin((i / n) * Math.PI * 2)] as P2);
    this.addWorld(sweep(prof, [{ o: p0, a: u, b: w }, { o: p1, a: u, b: w }], { closed: true, caps: true, smooth: 50 }), rgb);
    return this;
  }

  toGeometry(): THREE.BufferGeometry | null {
    if (this.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

export interface TracksideInput {
  track: MetroTrack;
  sMin: number;
  sMax: number;
  steel: Sink;
  matte: Sink;
}

/** Clamp a closed s interval to [lo, hi]; null when shorter than minLen. */
const clip = (s0: number, s1: number, lo: number, hi: number, minLen = 0.3): [number, number] | null => {
  const a = Math.max(s0, lo), b = Math.min(s1, hi);
  return b - a >= minLen ? [a, b] : null;
};

/** Builds all trackside equipment of one track into the steel / matte sinks. */
export function buildTrackside(inp: TracksideInput): void {
  const { track, sMin, sMax, steel, matte } = inp;
  const site = TD.sites[track.line];
  const pS = site.platformSide;
  const oS = -pS;
  const O = (m: number): number => oS * m; // lateral of a magnitude measured toward the outboard side
  const P = (m: number): number => pS * m; // ... toward the platform
  const pHL = site.platformHalfLen;
  const inRange = (s: number, pad = 0): boolean => s >= sMin + pad && s <= sMax - pad;

  // ---------------------------------------------------------------------------------------------------------------
  // 1. Covered third rail on the outboard side: steel conductor on cream insulator posts, cream composite cover in 3 m
  //    sections, stainless cantilever arms bolted to the outboard plinth face (every 1.5 m).
  // ---------------------------------------------------------------------------------------------------------------
  {
    const c = EQ.powerLat, hw = EQ.conductorHalfW;
    const [cy0, cy1] = EQ.conductorY;
    steel.box(O(c - hw), O(c + hw), cy0, cy1, sMin, sMax, C.conductor);
    const coverProf: P2[] = ([
      [-0.072, 0.1], [0.064, 0.1], [0.076, 0.088], [0.076, -0.025], [0.06, -0.025], [0.06, 0.083], [-0.056, 0.083], [-0.056, 0.062], [-0.072, 0.062],
    ] as const).map(([m, y]) => [O(c + m), y] as P2);
    const k0 = Math.ceil((sMin + 1.5) / EQ.coverSection) - 1, k1 = Math.floor((sMax - 1.5) / EQ.coverSection) + 1;
    for (let k = k0; k <= k1; k++) {
      const seg = clip(k * EQ.coverSection - EQ.coverSection / 2 + EQ.coverGap / 2, k * EQ.coverSection + EQ.coverSection / 2 - EQ.coverGap / 2, sMin, sMax, 0.4);
      if (seg) matte.prism(coverProf, seg[0], seg[1], C.cover, 20);
    }
    const b0 = Math.ceil(sMin / EQ.bracketPitch), b1 = Math.floor(sMax / EQ.bracketPitch);
    for (let i = b0; i <= b1; i++) {
      const s = i * EQ.bracketPitch + 0.75;
      if (!inRange(s, 0.1)) continue;
      steel.box(O(EQ.plinthOuterLat - 0.012), O(c + 0.035), -0.235, -0.205, s - 0.045, s + 0.045, C.stainless);        // arm
      steel.box(O(EQ.plinthOuterLat - 0.012), O(EQ.plinthOuterLat + 0.004), -0.3, -0.18, s - 0.045, s + 0.045, C.stainless); // backplate
      matte.box(O(c - 0.027), O(c + 0.027), -0.205, cy0 + 0.002, s - 0.027, s + 0.027, C.insulator);                     // insulator post
    }
    // cover end caps
    for (const s of [sMin, sMax]) matte.box(O(c - 0.072), O(c + 0.076), -0.025, 0.1, s - 0.004, s + 0.004, C.cover);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 2. Cable trays: outboard ladder tray on floor stands (full length) and a wall tray under the platform lip.
  // ---------------------------------------------------------------------------------------------------------------
  const tray = (lat0: number, lat1: number, baseY: number, s0: number, s1: number, mount: 'stands' | 'wall'): void => {
    const [m0, m1] = lat0 < lat1 ? [lat0, lat1] : [lat1, lat0];
    // base plate and two side rails (stainless), cables bundled inside
    steel.box(m0, m1, baseY, baseY + 0.005, s0, s1, C.stainlessDk);
    steel.box(m0, m0 + 0.012, baseY, baseY + 0.07, s0, s1, C.stainless);
    steel.box(m1 - 0.012, m1, baseY, baseY + 0.07, s0, s1, C.stainless);
    const w = m1 - m0, r = EQ.trayCableR;
    const cy = baseY + 0.005 + r;
    const cols = [C.cableBlack, C.cableGrey, C.cableBlack];
    for (let i = 0; i < 3; i++) {
      const a = m0 + 0.012 + r + 0.003 + i * (2 * r + 0.004) + (w - 0.024 - 3 * (2 * r + 0.004)) / 2;
      steel.tube(a, cy, s0, a, cy, s1, r, 8, cols[i]!);
    }
    steel.tube((m0 + m1) / 2, cy + 2 * r - 0.003, s0, (m0 + m1) / 2, cy + 2 * r - 0.003, s1, r, 8, C.cableGrey);
    // supports every 1.5 m
    const i0 = Math.ceil(s0 / EQ.trayPitch), i1 = Math.floor(s1 / EQ.trayPitch);
    for (let i = i0; i <= i1; i++) {
      const s = i * EQ.trayPitch;
      if (s < s0 || s > s1) continue;
      steel.box(m0 - 0.004, m1 + 0.004, baseY - 0.016, baseY, s - 0.02, s + 0.02, C.stainless);
      if (mount === 'wall') {
        const wv = Math.abs(m1) > Math.abs(m0) ? m1 : m0, sg = Math.sign(wv);
        steel.box(wv, wv + sg * 0.03, baseY - 0.03, baseY, s - 0.02, s + 0.02, C.stainless);
      }
      if (mount === 'stands') {
        const floorY = site.outboardFloorY;
        const a = (m0 + m1) / 2;
        steel.box(a - 0.016, a + 0.016, floorY, baseY - 0.016, s - 0.016, s + 0.016, C.stainless, false);
        steel.box(a - 0.04, a + 0.04, floorY, floorY + 0.008, s - 0.04, s + 0.04, C.stainlessDk, false);
      }
    }
  };
  const outTray: [number, number] = [O(EQ.trayOutLat[0]), O(EQ.trayOutLat[1])];
  tray(outTray[0], outTray[1], EQ.trayOutBaseY, sMin + 0.2, sMax - 0.2, 'stands');
  const wallLat = site.platformWallLat;
  const platTray: [number, number] = [P(wallLat - 0.16), P(wallLat - 0.02)];
  tray(platTray[0], platTray[1], EQ.trayPlatBaseY, -pHL + 0.7, pHL - 0.7, 'wall');
  // wall brackets of the platform tray sit against the wall face; stainless junction boxes terminate the run
  for (const e of [-1, 1] as const) {
    const s = e * (pHL - 0.4);
    steel.box(P(wallLat - 0.2), P(wallLat), EQ.trayPlatBaseY - 0.1, EQ.trayPlatBaseY + 0.17, s - 0.14, s + 0.14, C.stainless);
    steel.box(P(wallLat - 0.205), P(wallLat - 0.2), EQ.trayPlatBaseY + 0.12, EQ.trayPlatBaseY + 0.145, s - 0.02, s + 0.02, C.ledGreen);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 3. Marker lights every 10 m: stainless bezel + 4000 K LED on the inner face of each tray (real fixtures, tiny).
  // ---------------------------------------------------------------------------------------------------------------
  {
    const outInner = EQ.trayOutLat[0];
    const k0 = Math.ceil((sMin + 1) / EQ.markerPitch), k1 = Math.floor((sMax - 1) / EQ.markerPitch);
    for (let k = k0; k <= k1; k++) {
      const s = k * EQ.markerPitch;
      const y = EQ.trayOutBaseY + 0.03;
      steel.box(O(outInner - 0.02), O(outInner), y - 0.014, y + 0.014, s - 0.04, s + 0.04, C.stainless);
      steel.box(O(outInner - 0.026), O(outInner - 0.02), y - 0.008, y + 0.008, s - 0.026, s + 0.026, C.ledWhite);
      const sp = s + EQ.markerPitch / 2;
      if (Math.abs(sp) < pHL - 1.5) {
        const inner = wallLat - 0.16, yp = EQ.trayPlatBaseY + 0.03;
        steel.box(P(inner - 0.02), P(inner), yp - 0.014, yp + 0.014, sp - 0.04, sp + 0.04, C.stainless);
        steel.box(P(inner - 0.026), P(inner - 0.02), yp - 0.008, yp + 0.008, sp - 0.026, sp + 0.026, C.ledWhite);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 4. Central drainage slot grating (flush, stainless frame + slats over the 0.24 m slot in the slab).
  // ---------------------------------------------------------------------------------------------------------------
  const balises: number[] = [];
  for (const e of [-1, 1] as const) balises.push(e * 38.5, e * (pHL + 6), e * (pHL + 7.2));
  {
    const hw = EQ.gratingHalfW, y0 = EQ.gratingY, y1 = EQ.gratingY + 0.014;
    const L = EQ.gratingPanel;
    const k0 = Math.floor((sMin + L / 2) / L), k1 = Math.floor((sMax + L / 2) / L);
    for (let k = k0; k <= k1; k++) {
      const seg = clip(k * L - L / 2 + 0.01, k * L + L / 2 - 0.01, sMin, sMax, 0.5);
      if (!seg) continue;
      if (balises.some((b) => b + 0.4 > seg[0] && b - 0.4 < seg[1])) continue; // balise sits here
      const [s0, s1] = seg;
      steel.box(-hw, -hw + 0.014, y0, y1, s0, s1, C.stainless, false);
      steel.box(hw - 0.014, hw, y0, y1, s0, s1, C.stainless, false);
      steel.box(-hw, hw, y0, y1, s0, s0 + 0.03, C.stainless, false);
      steel.box(-hw, hw, y0, y1, s1 - 0.03, s1, C.stainless, false);
      for (let i = -2; i <= 2; i++) steel.box(i * 0.052 - 0.007, i * 0.052 + 0.007, y0 + 0.002, y1 - 0.002, s0 + 0.03, s1 - 0.03, C.stainlessDk, false);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 5. Balises (between the rails, on a bridging plate across the slot) and axle-counter heads (on the rail web).
  // ---------------------------------------------------------------------------------------------------------------
  for (const s of balises) {
    if (!inRange(s, 0.4)) continue;
    matte.box(-0.2, 0.2, -0.276, -0.264, s - 0.27, s + 0.27, C.graphite);
    for (const sg of [-1, 1] as const) steel.box(sg * 0.2 - 0.016, sg * 0.2 + 0.016, -0.34, -0.276, s - 0.2, s + 0.2, C.stainlessDk);
    matte.prismY([[-0.105, -0.25], [0.105, -0.25], [0.105, 0.25], [-0.105, 0.25]], -0.264, -0.185, C.balise);
    matte.box(-0.075, 0.075, -0.186, -0.182, s - 0.2, s + 0.2, C.baliseTop);
  }
  // axle counters sit midway between two fastening positions (fastenings every 0.6 m from 0.3 m into each 4.8 m slab)
  const midFastening = (s: number): number => {
    const local = (((s + 2.4) % 4.8) + 4.8) % 4.8;
    return s - local + 0.6 + 0.6 * Math.round((local - 0.6) / 0.6);
  };
  const axle: number[] = [];
  for (const e of [-1, 1] as const) axle.push(midFastening(e * (pHL + 4.5)), midFastening(e * 20));
  for (const s of axle) {
    if (!inRange(s, 0.4)) continue;
    for (const sg of [-1, 1] as const) {
      const web = sg * (TD.halfGauge + 0.0083);
      matte.box(web, web + sg * 0.042, -0.142, -0.056, s - 0.065, s + 0.065, C.graphite2);
      steel.box(web + sg * 0.042, web + sg * 0.05, -0.136, -0.062, s - 0.05, s + 0.05, C.stainlessDk);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 6. Platform-end signal masts (compact LED heads facing back toward the train) with ATC junction boxes at their feet.
  // ---------------------------------------------------------------------------------------------------------------
  const mast = (s: number): void => {
    const base = site.mastBaseY, aM = O(TD.mastLat);
    steel.box(aM - 0.08, aM + 0.08, base, base + 0.012, s - 0.08, s + 0.08, C.stainlessDk);
    steel.box(aM - 0.03, aM + 0.03, base + 0.012, EQ.mastTop, s - 0.03, s + 0.03, C.stainless);
    const hw = EQ.headW / 2, hd = EQ.headD / 2, ch = 0.028;
    const prof: P2[] = [[-hw + ch, -hd], [hw - ch, -hd], [hw, -hd + ch], [hw, hd - ch], [hw - ch, hd], [-hw + ch, hd], [-hw, hd - ch], [-hw, -hd + ch]];
    matte.prismY(prof.map(([a, ss]) => [aM + a, s + ss] as P2), EQ.mastTop, EQ.mastTop + EQ.headH, C.graphite);
    const front = s - hd; // faces -dir: the train that approaches this signal
    const lens = [
      { y: EQ.mastTop + EQ.headH * 0.72, rgb: C.lensRed }, { y: EQ.mastTop + EQ.headH * 0.28, rgb: C.ledGreen },
    ];
    for (const l of lens) {
      steel.tube(aM, l.y, front + 0.004, aM, l.y, front - 0.01, EQ.lensR, 16, l.rgb);
      matte.box(aM - 0.062, aM + 0.062, l.y + EQ.lensR + 0.002, l.y + EQ.lensR + 0.014, front - 0.05, front + 0.01, C.graphite2);
    }
    // ATC / interlocking junction box at the mast foot, status LEDs on the track-facing side
    const sb = s + 0.5, bx0 = TD.mastLat - 0.085, bx1 = TD.mastLat + 0.07;
    steel.box(O(bx0), O(bx1), base + 0.015, base + 0.36, sb - 0.2, sb + 0.2, C.stainless);
    steel.box(O(bx0 - 0.004), O(bx0), base + 0.03, base + 0.345, sb - 0.19, sb + 0.19, C.stainlessDk);
    steel.box(O(bx0 - 0.01), O(bx0 - 0.004), base + 0.3, base + 0.314, sb + 0.1, sb + 0.116, C.ledGreen);
    steel.box(O(bx0 - 0.01), O(bx0 - 0.004), base + 0.3, base + 0.314, sb + 0.13, sb + 0.146, C.ledAmber);
  };
  mast(pHL + 2);
  mast(-(pHL + 2));

  // ---------------------------------------------------------------------------------------------------------------
  // 7. Tunnel-mouth equipment, per bore: stainless vented cabinets on the inspection benches, cable trays on the
  //    walls entering the bore, and the emergency-walkway edge nosing with low marker LEDs.
  // ---------------------------------------------------------------------------------------------------------------
  const benchOuter = PORTAL.w / 2;                       // bore wall
  const benchInner = benchOuter - TD.boreBench.width;    // walkway edge
  const benchTop = TD.boreBench.height - PORTAL.bedBelowRail;
  const cabinet = (sideSign: 1 | -1, s: number, wide: number, tall: number, units: number): void => {
    const A = (m: number): number => sideSign * m;
    const front = benchOuter - 0.31, back = benchOuter - 0.03, y0 = benchTop, hw = wide / 2;
    matte.box(A(front + 0.03), A(back), y0, y0 + 0.07, s - hw + 0.02, s + hw - 0.02, C.graphite);                     // recessed plinth
    steel.box(A(front + 0.02), A(back), y0 + 0.07, y0 + tall, s - hw, s + hw, C.stainlessDk);                          // carcass
    const dw = (wide - 0.02) / units;
    for (let i = 0; i < units; i++) {
      const sa = s - hw + 0.01 + i * dw + 0.004, sb = s - hw + 0.01 + (i + 1) * dw - 0.004;
      steel.box(A(front), A(front + 0.02), y0 + 0.09, y0 + tall - 0.02, sa, sb, C.stainless);                           // door
      steel.box(A(front - 0.006), A(front), y0 + tall * 0.45, y0 + tall * 0.45 + 0.17, sb - 0.045, sb - 0.033, C.stainless); // handle
      // vent slots near the top of every door
      for (let v = 0; v < 4; v++) {
        const yv = y0 + tall - 0.16 - v * 0.03;
        matte.box(A(front - 0.002), A(front), yv, yv + 0.012, sa + 0.07, sb - 0.07, C.graphite);
      }
    }
    // status LEDs (2 green, 1 amber) on the first door
    const ls = s - hw + 0.06;
    for (let k = 0; k < 3; k++) {
      steel.box(A(front - 0.004), A(front), y0 + tall - 0.28, y0 + tall - 0.264, ls + k * 0.04, ls + k * 0.04 + 0.016, k === 2 ? C.ledAmber : C.ledGreen);
    }
    matte.box(A(front - 0.002), A(front), y0 + tall - 0.36, y0 + tall - 0.31, s + hw - 0.2, s + hw - 0.04, C.graphite2);  // label plate
  };

  for (const e of [-1, 1] as const) {
    const portal = e < 0 ? track.portalIn : track.portalOut;
    const mouthS = e * portal;
    const dMax = e < 0 ? mouthS - sMin : sMax - mouthS;
    if (dMax < 3) continue;
    const sAt = (d: number): number => mouthS + e * d;
    const dEnd = Math.min(dMax - 0.3, 60);
    // cabinets on the benches (staggered, doors face the track)
    const cabs: Array<[1 | -1, number, number, number, number]> = [
      [1, 2.7, 0.8, 1.05, 2], [-1, 5.2, 0.8, 1.05, 2], [1, 13.5, 0.5, 0.62, 1], [-1, 17.5, 0.8, 1.05, 2], [1, 21.5, 0.8, 1.05, 2],
    ];
    for (const [sg, d, w, h, u] of cabs) if (d + w / 2 <= dEnd) cabinet(sg, sAt(d), w, h, u);
    // wall trays with cable bundles (above the cabinets, below the light ribs), entering through a stainless wall box
    for (const sg of [-1, 1] as const) {
      const sa = sAt(EQ.boreD0 + 0.3), sb = sAt(dEnd);
      const [s0, s1] = sa < sb ? [sa, sb] : [sb, sa];
      tray(sg * (benchOuter - 0.17), sg * (benchOuter - 0.01), 1.13, s0, s1, 'wall');
      steel.box(sg * (benchOuter - 0.24), sg * benchOuter, 1.04, 1.3, sAt(EQ.boreD0) - e * 0.14, sAt(EQ.boreD0) + e * 0.14, C.stainless);
      steel.box(sg * (benchOuter - 0.245), sg * (benchOuter - 0.24), 1.15, 1.175, sAt(EQ.boreD0) - 0.02, sAt(EQ.boreD0) + 0.02, C.ledGreen);
      // emergency-walkway edge: stainless nosing along the bench, low cool-white markers every 5 m between the cabinets
      const n0 = sAt(EQ.boreD0 - 0.05), n1 = sAt(dEnd);
      steel.box(sg * benchInner, sg * (benchInner + 0.055), benchTop, benchTop + 0.012, Math.min(n0, n1), Math.max(n0, n1), C.stainless);
      for (let d = 8; d <= dEnd; d += 10) {
        const s = sAt(d);
        steel.box(sg * (benchInner + 0.012), sg * (benchInner + 0.042), benchTop + 0.012, benchTop + 0.02, s - 0.05, s + 0.05, C.ledWhite);
      }
    }
  }
}
