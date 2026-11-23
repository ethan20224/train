import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import {
  ESCALATOR_BANDS, FUNICULAR, LANDINGS, LIFTS, OCULUS, ONYX_BAND, SKY, THRESHOLD, VOID, VOID_DETAIL as D, VOID_RING_FIRST_Y, lightRingYs, voidRadiusAt,
  type Landing,
} from '../../layoutMetro';
import { excludeDirectionalLight } from '../../lighting/sunMask';
import { GeoBag, boxMM, rng, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import { hdrFromKelvin, type MetroMaterials } from './materials';
import { createStrata, type StrataPocket } from './strata';
import { installVoidLight, setSharedVoidLight, type RingSource, type StripSource } from './voidLight';

/**
 * The void shell (spec §2.2, §4; Phase 2 task P2-3). Everything is built once, in world coordinates, merged per material:
 *  - stone era (y -1.5 to -10): rusticated ashlar coursing with V-joints on the dome and drum, eight pilasters, string course;
 *  - strata era (-10 to -22): a displaced height-field of dipping sedimentary beds, machined flat at every light ring;
 *  - polished era (-22 to -30): honed limestone panels on a 1.5 x 3.0 m grid with 12 mm shadow gaps, backlit onyx band;
 *  - light rings every 2.5 m (stainless bezel, emissive slot), colour by era;
 *  - landings L1, L2 and the Threshold: terrazzo deck, pale steel soffit with warm cove strips, glass balustrades, brass nosing.
 * The void has no real lights: the rings and cove strips are emissive, and `installVoidLight` adds their analytic wash.
 */

const { cx: CX, cz: CZ } = OCULUS;
const R0 = VOID.rWide;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
/** Strata height-field resolution (azimuth x height): keeps the whole metroVoid group (oculus included) under 400k triangles. */
const STRATA_GRID = { thetaSegs: 320, ySegs: 150 } as const;
/** Linear albedo multiplier for the strata clone: the source rock texture is near-black, so it is lifted above 1 to read under ring light only. */
const STRATA_ALBEDO = 5.6;

export interface VoidBuild {
  group: THREE.Group;
  /** Meshes in `group` (draw calls the shell adds). */
  meshCount: number;
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
/** Meridian of the bell at y: position radius, inward normal components (radial, up) and the unit meridian tangent (down). */
function meridian(y: number): { r: number; nR: number; nUp: number } {
  const e = 0.05;
  const dr = (voidRadiusAt(y - e) - voidRadiusAt(y + e)) / (2 * e);
  const L = Math.hypot(dr, 1);
  return { r: voidRadiusAt(y), nR: -1 / L, nUp: -dr / L };
}

/** Profiles must run counter-clockwise in (a, b) so `sweep` faces point out of the solid. */
const ccw = (p: readonly P2[]): P2[] => {
  let area = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i]!, b = p[(i + 1) % p.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  return area < 0 ? [...p].reverse() : [...p];
};

const withColor = (g: THREE.BufferGeometry, r = 1, gg = 1, b = 1): THREE.BufferGeometry => {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
};

/** Triangle soup with per-vertex colour and uv; every triangle is wound so its normal agrees with `ref`. */
class Soup {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly uv: number[] = [];
  tri(p: readonly THREE.Vector3[], c: ReadonlyArray<readonly [number, number, number]>, t: readonly P2[], ref: THREE.Vector3): void {
    const a = p[0]!, b = p[1]!, d = p[2]!;
    const n = b.clone().sub(a).cross(d.clone().sub(a));
    const o = n.dot(ref) >= 0 ? [0, 1, 2] : [0, 2, 1];
    for (const k of o) {
      const q = p[k]!, cc = c[k]!, tt = t[k]!;
      this.pos.push(q.x, q.y, q.z); this.col.push(cc[0], cc[1], cc[2]); this.uv.push(tt[0], tt[1]);
    }
  }
  quad(p: readonly THREE.Vector3[], c: ReadonlyArray<readonly [number, number, number]>, t: readonly P2[], ref: THREE.Vector3): void {
    this.tri([p[0]!, p[1]!, p[2]!], [c[0]!, c[1]!, c[2]!], [t[0]!, t[1]!, t[2]!], ref);
    this.tri([p[0]!, p[2]!, p[3]!], [c[0]!, c[2]!, c[3]!], [t[0]!, t[2]!, t[3]!], ref);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals(); // non-indexed: flat per triangle
    return g;
  }
}

/** Emissive geometry with a constant HDR colour per part (vertex colours; one draw call). */
class LightBag {
  private readonly parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, c: THREE.Color): void {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(geo);
  }
  /** A quad facing `dir`. */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, dir: THREE.Vector3, col: THREE.Color): void {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const g = new THREE.BufferGeometry();
    const order = n.dot(dir) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    g.setAttribute('position', new THREE.Float32BufferAttribute(order.flatMap((p) => [p.x, p.y, p.z]), 3));
    this.add(g, col);
  }
  merge(): THREE.BufferGeometry | null {
    if (this.parts.length === 0) return null;
    return mergeGeometries(this.parts, false);
  }
}

/** Planar polygon (x, z) as a slab: top at yTop, thickness t. */
function slabGeo(pts: ReadonlyArray<readonly [number, number]>, holes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, yTop: number, t: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes = holes.map((h) => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-HALF_PI);
  g.translate(0, yTop - t, 0);
  return g;
}

/** A box along the horizontal segment (x0,z0)-(x1,z1): thickness `th` across, y from y0 to y1, `ext` longer at both ends. */
function segBox(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, th: number, ext = 0): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, z1 - z0) + 2 * ext;
  const g = new THREE.BoxGeometry(len, y1 - y0, th);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

const subtract = (range: readonly [number, number], cuts: ReadonlyArray<readonly [number, number]>): Array<[number, number]> => {
  let out: Array<[number, number]> = [[range[0], range[1]]];
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) { next.push([a, b]); continue; }
      if (c0 > a) next.push([a, c0]);
      if (c1 < b) next.push([c1, b]);
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a > 0.05);
};

const eraOf = (y: number): 'stone' | 'strata' | 'polished' => (y > VOID.eras[0].yBottom ? 'stone' : y > VOID.eras[1].yBottom ? 'strata' : 'polished');

// ---------------------------------------------------------------------------------------------
// builder
// ---------------------------------------------------------------------------------------------
export function buildVoidShell(lib: MaterialLibrary, kit: MetroMaterials): VoidBuild {
  const group = new THREE.Group();
  group.name = 'metroVoidShell';
  const rnd = rng(2035);

  const stainless = new GeoBag(lib, 'castIron', kit.metersPerTile.stainless);
  const brass = new GeoBag(lib, 'brass', kit.metersPerTile.brass);
  const glass = new GeoBag(lib, 'glass', 1);
  const terrazzo = new GeoBag(lib, 'darkMarble', 0.9);
  const limestone = new GeoBag(lib, 'wallStone', kit.metersPerTile.honedLimestone);
  const onyx = new GeoBag(lib, 'floorMarble', kit.metersPerTile.onyx);
  const stoneBag = new GeoBag(lib, 'wallStone', kit.metersPerTile.carvedStone);
  const lights = new LightBag();
  const ringSrc: RingSource[] = [];
  const rimSrc: RingSource[] = [];
  const stripSrc: StripSource[] = [];

  // era light colours (HDR). The strips themselves are bright; the wash sources are scaled down.
  const K = D.lightK;
  const stripCol = { stone: hdrFromKelvin(K.stone, D.stripPeak), strata: hdrFromKelvin(K.strata, D.stripPeak), polished: hdrFromKelvin(K.polished, D.stripPeak), cove: hdrFromKelvin(K.cove, D.stripPeak * 1.1) };
  const WASH = { ring: 0.55, cove: 0.9 };
  const washCol = (c: THREE.Color, k: number): THREE.Color => c.clone().multiplyScalar(k / D.stripPeak);

  // ---- light channel on the wall --------------------------------------------------------------
  const RW = D.ring;
  const BEZEL: P2[] = [
    [-RW.halfWidth, 0], [-RW.halfWidth, RW.proud], [-RW.slotHalf, RW.proud], [-RW.slotHalf, RW.proud - 0.02],
    [RW.slotHalf, RW.proud - 0.02], [RW.slotHalf, RW.proud], [RW.halfWidth, RW.proud], [RW.halfWidth, 0],
  ];
  const STRIP: P2[] = [[RW.stripHalf, RW.proud - 0.012], [-RW.stripHalf, RW.proud - 0.012]];
  const ringFrames = (y: number, r: number, nR: number, nUp: number, n: number, a0 = 0, a1 = TAU): Frame[] => {
    const out: Frame[] = [];
    for (let i = 0; i <= n; i++) {
      const phi = a0 + ((a1 - a0) * i) / n;
      const rad = v3(Math.cos(phi), 0, Math.sin(phi));
      const b = rad.clone().multiplyScalar(nR).add(v3(0, nUp, 0)).normalize();
      const a = rad.clone().multiplyScalar(-nUp).add(v3(0, nR, 0)).normalize();
      out.push({ o: v3(CX + r * rad.x, y, CZ + r * rad.z), a, b });
    }
    return out;
  };
  const funPortalHalfAng = Math.asin((FUNICULAR.topStation.zMax - CZ) / R0); // +-10.95 deg around +x (z 70.2..77.8)
  const funPortalTopY = THRESHOLD.y + FUNICULAR.topStation.portalHeight; // -27.0
  /** Stainless bezel and emissive slot at height y on the surface of radius r (normal components nR, nUp). */
  const channel = (y: number, r: number, nR: number, nUp: number, era: keyof typeof stripCol, wash = true): void => {
    const cutPortal = r > R0 - 0.5 && y <= funPortalTopY + 0.1;
    const fr = cutPortal
      ? ringFrames(y, r, nR, nUp, RW.segments, funPortalHalfAng, TAU - funPortalHalfAng)
      : ringFrames(y, r, nR, nUp, RW.segments);
    stainless.add(sweep(ccw(BEZEL), fr, { closed: true, caps: cutPortal }));
    lights.add(sweep(STRIP, fr), stripCol[era]);
    if (wash) ringSrc.push({ y: y + nUp * (RW.proud - 0.012), r: r + nR * (RW.proud - 0.012), color: washCol(stripCol[era], WASH.ring) });
  };

  const ringYs = lightRingYs();
  for (const y of ringYs) {
    const m = meridian(y);
    channel(y, m.r, m.nR, m.nUp, eraOf(y));
  }

  // ---- stone era: ashlar ----------------------------------------------------------------------
  const A = D.ashlar;
  const stoneTop = OCULUS.slabUnderY, stoneBottom = VOID.eras[0].yBottom;
  // arclength table down the meridian
  const ST = 0.01;
  const arc: number[] = [0];
  for (let y = stoneTop; y > stoneBottom + 1e-9; y -= ST) {
    const r0 = voidRadiusAt(y), r1 = voidRadiusAt(y - ST);
    arc.push(arc[arc.length - 1]! + Math.hypot(r1 - r0, ST));
  }
  const arcAt = (y: number): number => {
    const f = Math.min(arc.length - 1, Math.max(0, (stoneTop - y) / ST));
    const i = Math.min(arc.length - 2, Math.floor(f));
    return arc[i]! + (arc[i + 1]! - arc[i]!) * (f - i);
  };
  const yAtArc = (s: number): number => {
    let lo = 0, hi = arc.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid]! <= s) lo = mid; else hi = mid; }
    const f = (s - arc[lo]!) / Math.max(1e-9, arc[hi]! - arc[lo]!);
    return stoneTop - (lo + f) * ST;
  };
  const anchors = [stoneTop, ...ringYs.filter((y) => y > stoneBottom), stoneBottom];
  const boundaries: number[] = [];
  for (let i = 0; i + 1 < anchors.length; i++) {
    const s0 = arcAt(anchors[i]!), s1 = arcAt(anchors[i + 1]!);
    const n = Math.max(1, Math.round((s1 - s0) / A.courseH));
    for (let k = 0; k < n; k++) boundaries.push(yAtArc(s0 + ((s1 - s0) * k) / n));
  }
  boundaries.push(stoneBottom);

  const soup = new Soup();
  const dome = D.pilasters.topY;
  for (let c = 0; c + 1 < boundaries.length; c++) {
    const y0 = boundaries[c]!, y1 = boundaries[c + 1]!;
    const ym = (y0 + y1) / 2;
    const mm = meridian(ym);
    const rm = mm.r;
    const band = A.bandEvery > 0 && c % A.bandEvery === A.bandEvery - 1 && y1 <= dome;
    const N = Math.max(8, 2 * Math.round((TAU * rm) / A.blockW / 2));
    const dth = TAU / N;
    const off = (c % 2) * dth * 0.5;
    const chTh = A.chamfer / rm;
    const dyCh = A.chamfer * Math.abs(mm.nR);
    const ys = [y0, y0 - dyCh, y1 + dyCh, y1];
    for (let k = 0; k < N; k++) {
      const t0 = off + k * dth;
      const ths = [t0, t0 + chTh, t0 + dth - chTh, t0 + dth];
      const tone = 0.8 + 0.3 * rnd();
      const warm = 0.96 + 0.08 * rnd();
      const jitter = (rnd() - 0.5) * 0.012;
      const grid: THREE.Vector3[] = [];
      const cols: Array<readonly [number, number, number]> = [];
      const uvs: P2[] = [];
      for (let iv = 0; iv < 4; iv++) {
        const y = ys[iv]!;
        const m = meridian(y);
        for (let iu = 0; iu < 4; iu++) {
          const th = ths[iu]!;
          const joint = iu === 0 || iu === 3 || iv === 0 || iv === 3;
          const proud = joint ? -A.jointDepth : jitter + (band ? A.bandProject : 0);
          const rr = m.r + m.nR * proud;
          grid.push(v3(CX + rr * Math.cos(th), y + m.nUp * proud, CZ + rr * Math.sin(th)));
          const dk = joint ? 0.5 : 1;
          cols.push([tone * warm * dk, tone * dk, tone * (2 - warm) * dk]);
          uvs.push([(th / TAU) * 21, arcAt(y) / 6]);
        }
      }
      for (let iv = 0; iv < 3; iv++) {
        for (let iu = 0; iu < 3; iu++) {
          const ids = [iv * 4 + iu, iv * 4 + iu + 1, (iv + 1) * 4 + iu + 1, (iv + 1) * 4 + iu];
          const thMid = (ths[iu]! + ths[iu + 1]!) / 2;
          const ref = v3(Math.cos(thMid) * mm.nR, mm.nUp, Math.sin(thMid) * mm.nR);
          soup.quad(ids.map((q) => grid[q]!), ids.map((q) => cols[q]!), ids.map((q) => uvs[q]!), ref);
        }
      }
    }
  }

  // continuous backing a hair behind the joints: the running bond leaves hairline gaps between courses (different tick sets)
  {
    const nTh = 128;
    const dark: [number, number, number] = [0.22, 0.2, 0.18];
    const rowsY: number[] = [];
    for (let y = stoneTop; y > stoneBottom + 1e-6; y -= 0.5) rowsY.push(y);
    rowsY.push(stoneBottom);
    for (let j = 0; j + 1 < rowsY.length; j++) {
      const yA = rowsY[j]!, yB = rowsY[j + 1]!;
      const mA = meridian(yA), mB = meridian(yB), mM = meridian((yA + yB) / 2);
      const pt = (th: number, y: number, m: { r: number; nR: number; nUp: number }): THREE.Vector3 => {
        const rr = m.r + m.nR * -0.05;
        return v3(CX + rr * Math.cos(th), y + m.nUp * -0.05, CZ + rr * Math.sin(th));
      };
      for (let i = 0; i < nTh; i++) {
        const t0 = (i / nTh) * TAU, t1 = ((i + 1) / nTh) * TAU, tm = (t0 + t1) / 2;
        soup.quad([pt(t0, yA, mA), pt(t1, yA, mA), pt(t1, yB, mB), pt(t0, yB, mB)], [dark, dark, dark, dark], [[0, 0], [1, 0], [1, 1], [0, 1]], v3(Math.cos(tm) * mM.nR, mM.nUp, Math.sin(tm) * mM.nR));
      }
    }
  }

  // pilasters on the drum (a recessed field between two stiles), base and capital mouldings
  {
    const Pn = D.pilasters;
    const hw = Pn.width / 2, pr = Pn.project;
    const SHAFT: P2[] = [[-hw, 0], [-hw, pr], [-hw + 0.2, pr], [-hw + 0.2, pr - 0.05], [hw - 0.2, pr - 0.05], [hw - 0.2, pr], [hw, pr], [hw, 0]];
    const yTopP = Pn.topY - 0.32, yBotP = D.stringCourseY + 0.5;
    for (let k = 0; k < Pn.count; k++) {
      const phi = (k / Pn.count) * TAU;
      const rad = v3(Math.cos(phi), 0, Math.sin(phi)), tan = v3(-Math.sin(phi), 0, Math.cos(phi)), inward = rad.clone().negate();
      const fr = (y: number): Frame => ({ o: v3(CX + R0 * rad.x, y, CZ + R0 * rad.z), a: tan.clone(), b: inward.clone() });
      stoneBag.add(sweep(ccw(SHAFT), [fr(yTopP), fr(yBotP)], { closed: true, caps: true }));
      const block = (w: number, proj: number, ya: number, yb: number): void => {
        const prof: P2[] = [[-w / 2, 0], [-w / 2, proj], [w / 2, proj], [w / 2, 0]];
        stoneBag.add(sweep(ccw(prof), [fr(ya), fr(yb)], { closed: true, caps: true }));
      };
      // capital: abacus over echinus
      block(Pn.width + 0.16, pr + 0.08, Pn.topY - 0.32, Pn.topY - 0.2);
      block(Pn.width + 0.26, pr + 0.14, Pn.topY - 0.2, Pn.topY - 0.08);
      block(Pn.width + 0.36, pr + 0.2, Pn.topY - 0.08, Pn.topY);
      // base: plinth with step
      block(Pn.width + 0.14, pr + 0.07, yBotP, yBotP - 0.14);
      block(Pn.width + 0.26, pr + 0.14, yBotP - 0.14, yBotP - 0.3);
    }
  }

  // string course between the stone and strata eras
  {
    const SC: P2[] = [[-0.4, 0], [-0.4, 0.04], [-0.34, 0.08], [-0.26, 0.14], [-0.2, 0.24], [-0.14, 0.29], [0, 0.3], [0.1, 0.3], [0.14, 0.24], [0.14, 0.14], [0.28, 0.14], [0.28, 0]];
    const fr: Frame[] = [];
    const n = 192;
    for (let i = 0; i <= n; i++) {
      const phi = (i / n) * TAU;
      const rad = v3(Math.cos(phi), 0, Math.sin(phi));
      fr.push({ o: v3(CX + R0 * rad.x, D.stringCourseY, CZ + R0 * rad.z), a: v3(0, -1, 0), b: rad.clone().negate() });
    }
    stoneBag.add(sweep(ccw(SC), fr, { closed: true }));
  }

  // ---- strata era: displaced height field ---------------------------------------------------
  const strataTop = VOID.eras[1].yTop, strataBottom = VOID.eras[1].yBottom;
  const pocketsFor = (L: Landing): StrataPocket[] => {
    const a0 = Math.asin((L.zMin - CZ) / R0), a1 = Math.asin((L.zMax - CZ) / R0);
    return [
      { phi0: a0, phi1: a1, y: L.y - D.deck.depth / 2 },
      { phi0: Math.PI - a1, phi1: Math.PI - a0, y: L.y - D.deck.depth / 2 },
    ];
  };
  const rock = createStrata({
    R0, seed: D.strata.seed, cutHalf: D.strata.cutHalf, cutBlend: D.strata.cutBlend, maxProtrude: D.strata.maxProtrude,
    cutYs: [strataTop, strataBottom, ...ringYs.filter((y) => y < strataTop && y > strataBottom)],
    pockets: [...pocketsFor(LANDINGS.L1), ...pocketsFor(LANDINGS.L2)],
  });
  const strataGeo = (() => {
    const nT = STRATA_GRID.thetaSegs, nY = STRATA_GRID.ySegs;
    const P: THREE.Vector3[] = [];
    const C: number[] = [];
    const U: number[] = [];
    const sampled: Array<{ p: number; col: [number, number, number] }> = [];
    for (let j = 0; j <= nY; j++) {
      const y = strataTop + (strataBottom - strataTop) * (j / nY);
      for (let i = 0; i < nT; i++) sampled.push(rock((i / nT) * TAU, y));
    }
    const at = (i: number, j: number): THREE.Vector3 => P[j * (nT + 1) + (((i % nT) + nT) % nT)]!;
    for (let j = 0; j <= nY; j++) {
      const y = strataTop + (strataBottom - strataTop) * (j / nY);
      for (let i = 0; i <= nT; i++) {
        const s = sampled[j * nT + (i % nT)]!;
        const th = (i / nT) * TAU;
        const r = R0 - s.p;
        P.push(v3(CX + r * Math.cos(th), y, CZ + r * Math.sin(th)));
        C.push(s.col[0], s.col[1], s.col[2]);
        U.push((i / nT) * 105, y / 1.2);
      }
    }
    // one vertex strip per row of quads, so a ledge is a crisp crease while the rock stays smooth along the azimuth
    const stripV = nT + 1;
    const pos = new Float32Array(nY * stripV * 2 * 3), nor = new Float32Array(nY * stripV * 2 * 3);
    const col = new Float32Array(nY * stripV * 2 * 3), uv = new Float32Array(nY * stripV * 2 * 2);
    const idx: number[] = [];
    for (let j = 0; j < nY; j++) {
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i <= nT; i++) {
          const k = (j * 2 + r) * stripV + i;
          const src = (j + r) * stripV + i;
          const p = P[src]!;
          pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
          const dT = at(i + 1, j + r).clone().sub(at(i - 1 + nT, j + r));
          const dY = at(i, j + 1).clone().sub(at(i, j));
          // dT runs with the azimuth and dY downward: dT x dY points out of the rock, so negate it (toward the axis)
          const nrm = dT.cross(dY).normalize().negate();
          nor[k * 3] = nrm.x; nor[k * 3 + 1] = nrm.y; nor[k * 3 + 2] = nrm.z;
          col[k * 3] = C[src * 3]!; col[k * 3 + 1] = C[src * 3 + 1]!; col[k * 3 + 2] = C[src * 3 + 2]!;
          uv[k * 2] = U[src * 2]!; uv[k * 2 + 1] = U[src * 2 + 1]!;
        }
      }
      const top = j * 2 * stripV, bot = (j * 2 + 1) * stripV;
      // winding: the first quad's normal vs the (inward) vertex normal
      for (let i = 0; i < nT; i++) {
        const a = P[j * stripV + i]!, b = P[j * stripV + i + 1]!, c = P[(j + 1) * stripV + i + 1]!;
        const n0 = v3(nor[(top + i) * 3]!, nor[(top + i) * 3 + 1]!, nor[(top + i) * 3 + 2]!);
        const flip = b.clone().sub(a).cross(c.clone().sub(a)).dot(n0) < 0;
        const q = [top + i, top + i + 1, bot + i + 1, bot + i] as const;
        if (flip) idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
        else idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  })();

  // ---- polished era: panels --------------------------------------------------------------------
  const PO = D.polished;
  const limeSoup = new Soup();
  const panelBand = (R: number, rows: ReadonlyArray<readonly [number, number]>, tint: readonly [number, number, number], sink: Soup, cutEastPortal = false): void => {
    const N = Math.round((TAU * R) / PO.panelW);
    const gTh = PO.gap / 2 / R;
    const back = R + PO.panelThickness;
    const pLo = funPortalHalfAng;
    const pHi = TAU - funPortalHalfAng;
    for (const [yTop, yBot] of rows) {
      const portalRow = cutEastPortal && yBot < funPortalTopY - 0.05;
      for (let k = 0; k < N; k++) {
        let t0 = (k / N) * TAU, t1 = ((k + 1) / N) * TAU;
        if (portalRow) {
          if (t1 <= pLo + 1e-4 || t0 >= pHi - 1e-4) continue;
          t0 = Math.max(t0, pLo);
          t1 = Math.min(t1, pHi);
          if (t1 - t0 < gTh * 3) continue;
        }
        const a = t0 + gTh, b = t1 - gTh;
        const ya = yTop - PO.gap / 2, yb = yBot + PO.gap / 2;
        const tone = 0.95 + 0.07 * rnd();
        const col: [number, number, number] = [tint[0] * tone, tint[1] * tone, tint[2] * tone];
        const edge: [number, number, number] = [col[0] * 0.68, col[1] * 0.68, col[2] * 0.68];
        const pt = (th: number, y: number, r: number): THREE.Vector3 => v3(CX + r * Math.cos(th), y, CZ + r * Math.sin(th));
        const tm = (t0 + t1) / 2;
        const inward = v3(-Math.cos(tm), 0, -Math.sin(tm));
        const uv = (th: number, y: number): P2 => [(th * R) / 6, y / 6];
        // 3 x 3 grid: the outer ring is the eased arris (darker), the centre is the honed face
        const bw = Math.min(0.035, (b - a) * R * 0.2) / R, bh = Math.min(0.035, (ya - yb) * 0.2);
        const ths = [a, a + bw, b - bw, b], yy = [ya, ya - bh, yb + bh, yb];
        for (let iy = 0; iy < 3; iy++) {
          for (let ix = 0; ix < 3; ix++) {
            const corner = (cx2: number, cy2: number): { p: THREE.Vector3; c: [number, number, number]; t: P2 } => {
              const onEdge = cx2 === 0 || cx2 === 3 || cy2 === 0 || cy2 === 3;
              return { p: pt(ths[cx2]!, yy[cy2]!, R), c: onEdge ? edge : col, t: uv(ths[cx2]!, yy[cy2]!) };
            };
            const q = [corner(ix, iy), corner(ix + 1, iy), corner(ix + 1, iy + 1), corner(ix, iy + 1)];
            sink.quad(q.map((v) => v.p), q.map((v) => v.c), q.map((v) => v.t), inward);
          }
        }
        const dark: [number, number, number] = [0.22, 0.22, 0.24];
        sink.quad([pt(t0, yTop, back), pt(t1, yTop, back), pt(t1, yBot, back), pt(t0, yBot, back)], [dark, dark, dark, dark], [[0, 0], [1, 0], [1, 1], [0, 1]], inward);
      }
    }
  };
  const polTop = VOID.eras[2].yTop, polBottom = VOID.eras[2].yBottom;
  const onyxHi = ONYX_BAND.y + ONYX_BAND.height / 2, onyxLo = ONYX_BAND.y - ONYX_BAND.height / 2;
  panelBand(R0, [[polTop, onyxHi], [onyxLo, onyxLo - PO.panelH], [onyxLo - PO.panelH, polBottom]], [0.93, 0.955, 1.0], limeSoup, true);

  // onyx band: flush ring with stainless reveals; the emissive veins are the backlight
  {
    const n = 192;
    const fr: Frame[] = [];
    for (let i = 0; i <= n; i++) {
      const phi = (i / n) * TAU;
      const rad = v3(Math.cos(phi), 0, Math.sin(phi));
      fr.push({ o: v3(CX + (R0 - 0.004) * rad.x, ONYX_BAND.y, CZ + (R0 - 0.004) * rad.z), a: v3(0, -1, 0), b: rad.clone().negate() });
    }
    const h = ONYX_BAND.height / 2 - 0.012;
    const g = sweep([[h, 0], [-h, 0]], fr);
    // sweep uv: u = path length (m), v = profile length (m): scale to onyx tiles
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.1, uv.getY(i) / 1.1);
    onyx.add(g, undefined, 'keep');
    const TRIM: P2[] = [[-0.006, 0], [-0.006, 0.03], [0.006, 0.03], [0.006, 0]];
    for (const s of [-1, 1]) {
      const frs = fr.map((f) => ({ o: f.o.clone().addScaledVector(f.a, s * (ONYX_BAND.height / 2 - 0.006)), a: f.a.clone(), b: f.b.clone() }));
      stainless.add(sweep(ccw(TRIM), frs, { closed: true }));
    }
    ringSrc.push({ y: ONYX_BAND.y, r: R0 - 0.02, color: washCol(stripCol.polished, WASH.ring * 1.6) });
  }

  // ---------------------------------------------------------------------------------------------
  // balustrades
  // ---------------------------------------------------------------------------------------------
  const BA = D.balustrade;
  /** Glass balustrade along a polyline at deck height y0 (posts at the ends and every <= postPitch). */
  const railRun = (pts: ReadonlyArray<readonly [number, number]>, y0: number): void => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, z0] = pts[i]!, [x1, z1] = pts[i + 1]!;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.ceil(len / BA.postPitch));
      const at = (k: number): [number, number] => [x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n];
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const [px, pz] = at(k);
        stainless.add(boxMM(px - 0.025, y0, pz - 0.025, px + 0.025, y0 + BA.height, pz + 0.025));
      }
      for (let k = 0; k < n; k++) {
        const [ax, az] = at(k), [bx, bz] = at(k + 1);
        stainless.add(segBox(ax, az, bx, bz, y0 + BA.height - 0.045, y0 + BA.height, 0.05, 0.025));
        stainless.add(segBox(ax, az, bx, bz, y0, y0 + BA.glassBottom, 0.06));
        const gl = Math.hypot(bx - ax, bz - az);
        const gx = (bx - ax) / gl, gz = (bz - az) / gl;
        glass.add(segBox(ax + gx * 0.035, az + gz * 0.035, bx - gx * 0.035, bz - gz * 0.035, y0 + BA.glassBottom, y0 + BA.glassTop, 0.012));
      }
    }
  };

  // ---------------------------------------------------------------------------------------------
  // landings
  // ---------------------------------------------------------------------------------------------
  const DK = D.deck;
  const outerBands = ESCALATOR_BANDS.outer.flatMap(([a, b]) => [[a, b] as const]);
  const innerBands = ESCALATOR_BANDS.inner;
  const mouthsAll: Array<readonly [number, number]> = [...outerBands, ...innerBands];

  const deckPoly = (zMin: number, zMax: number, Rc: number): Array<[number, number]> => {
    const a0 = Math.asin((zMin - CZ) / Rc), a1 = Math.asin((zMax - CZ) / Rc);
    const pts: Array<[number, number]> = [];
    for (let k = 0; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6; pts.push([CX + Rc * Math.cos(a), CZ + Rc * Math.sin(a)]); }
    for (let k = 0; k <= 6; k++) { const a = Math.PI - a1 + ((a1 - a0) * k) / 6; pts.push([CX + Rc * Math.cos(a), CZ + Rc * Math.sin(a)]); }
    return pts;
  };

  const covePair = (xHalf: number, y: number, zA: number, zB: number, facing: THREE.Vector3): void => {
    // emissive strip + stainless bezel, and the wash source
    const zc = (zA + zB) / 2;
    lights.quad(v3(-xHalf, y, zA), v3(xHalf, y, zA), v3(xHalf, y, zB), v3(-xHalf, y, zB), facing, stripCol.cove);
    stainless.add(boxMM(-xHalf, y, zA - 0.018, xHalf, y + 0.03, zA));
    stainless.add(boxMM(-xHalf, y, zB, xHalf, y + 0.03, zB + 0.018));
    stripSrc.push({ a: v3(-xHalf, y, zc), b: v3(xHalf, y, zc), dir: facing.clone(), color: washCol(stripCol.cove, WASH.cove) });
  };

  const buildLanding = (L: Landing, mouthsSouth: boolean, mouthsNorth: boolean): void => {
    const y = L.y;
    const Rc = voidRadiusAt(y) + DK.wallOverlap;
    const xAt = (z: number): number => Math.sqrt(Rc * Rc - (z - CZ) * (z - CZ));
    const ySoff = y - DK.depth - 0.04;
    terrazzo.add(slabGeo(deckPoly(L.zMin, L.zMax, Rc), [], y, DK.topT));
    limestone.add(slabGeo(deckPoly(L.zMin + DK.girderT, L.zMax - DK.girderT, Rc), [], y - DK.depth, 0.04));
    // fascia girders along the long edges
    limestone.add(boxMM(-xAt(L.zMin), ySoff, L.zMin, xAt(L.zMin), y - DK.topT, L.zMin + DK.girderT));
    limestone.add(boxMM(-xAt(L.zMax), ySoff, L.zMax - DK.girderT, xAt(L.zMax), y - DK.topT, L.zMax));
    // brass nosing, flush with the deck top
    brass.add(boxMM(-xAt(L.zMin), y - 0.002, L.zMin, xAt(L.zMin), y + 0.003, L.zMin + 0.05));
    brass.add(boxMM(-xAt(L.zMax), y - 0.002, L.zMax - 0.05, xAt(L.zMax), y + 0.003, L.zMax));
    // warm cove strips tucked into the soffit along both long edges, and the stainless ribs between them
    const down = v3(0, -1, 0);
    covePair(xAt(L.zMin) - 0.4, ySoff - 0.002, L.zMin + DK.coveInset, L.zMin + DK.coveInset + DK.coveWidth, down);
    covePair(xAt(L.zMax) - 0.4, ySoff - 0.002, L.zMax - DK.coveInset - DK.coveWidth, L.zMax - DK.coveInset, down);
    const xr = Math.min(xAt(L.zMin), xAt(L.zMax)) - 0.6;
    for (let k = -Math.floor(xr / DK.ribPitch); k <= Math.floor(xr / DK.ribPitch); k++) {
      const x = k * DK.ribPitch;
      stainless.add(boxMM(x - 0.025, ySoff - DK.ribDepth, L.zMin + DK.coveInset + DK.coveWidth + 0.12, x + 0.025, ySoff, L.zMax - DK.coveInset - DK.coveWidth - 0.12));
    }
    // glass: south and north edges (openings at the escalator mouths), and the end screens at the walkable limit
    const south = L.zMin + 0.07, north = L.zMax - 0.07;
    for (const [a, b] of subtract([-L.halfX, L.halfX], mouthsSouth ? mouthsAll : [])) railRun([[a, south], [b, south]], y);
    for (const [a, b] of subtract([-L.halfX, L.halfX], mouthsNorth ? mouthsAll : [])) railRun([[a, north], [b, north]], y);
    for (const s of [-1, 1]) railRun([[s * (L.halfX - 0.05), south], [s * (L.halfX - 0.05), north]], y);
  };
  buildLanding(LANDINGS.L1, true, false);
  buildLanding(LANDINGS.L2, false, true);

  // ---------------------------------------------------------------------------------------------
  // Threshold
  // ---------------------------------------------------------------------------------------------
  {
    const y = THRESHOLD.y;
    const Rc = R0 + DK.wallOverlap;
    const rH = THRESHOLD.rInner;
    const zChord = LANDINGS.thresholdBridge.zMin;
    const zNorth = LANDINGS.thresholdBridge.zMax;
    const phiC = Math.asin((zChord - CZ) / rH); // chord meets the hole circle here (east)
    // terrazzo top: the deck is the annulus plus the bridge; the sky hole is the circle south of the chord
    const outer: Array<[number, number]> = [];
    for (let i = 0; i < 128; i++) { const a = (i / 128) * TAU; outer.push([CX + Rc * Math.cos(a), CZ + Rc * Math.sin(a)]); }
    const hole: Array<[number, number]> = [];
    const nA = 96;
    for (let i = 0; i <= nA; i++) { const a = phiC - ((Math.PI + 2 * phiC) * i) / nA; hole.push([CX + rH * Math.cos(a), CZ + rH * Math.sin(a)]); }
    const liftCutouts = LIFTS.positions.map(([lx, lz]) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU;
        pts.push([lx + LIFTS.tubeR * Math.cos(a), lz + LIFTS.tubeR * Math.sin(a)]);
      }
      return pts;
    });
    terrazzo.add(slabGeo(outer, [hole, ...liftCutouts], y, DK.topT));
    // bridge body under the top: south girder, soffit, cove, ribs
    const xB = rH + 0.2;
    const ySoff = y - DK.depth - 0.04;
    limestone.add(boxMM(-xB, ySoff, zChord, xB, y - DK.topT, zChord + DK.girderT));
    limestone.add(slabGeo([[-xB, zChord + DK.girderT], [xB, zChord + DK.girderT], [xB, zNorth + 0.25], [-xB, zNorth + 0.25]], [], y - DK.depth, 0.04));
    const xChord = Math.sqrt(rH * rH - (zChord - CZ) * (zChord - CZ));
    covePair(xChord - 0.3, ySoff - 0.002, zChord + DK.coveInset, zChord + DK.coveInset + DK.coveWidth, v3(0, -1, 0));
    for (let k = -3; k <= 3; k++) stainless.add(boxMM(k * DK.ribPitch - 0.025, ySoff - DK.ribDepth, zChord + DK.coveInset + DK.coveWidth + 0.12, k * DK.ribPitch + 0.025, ySoff, zChord + 2.2));
    // brass nosing along the chord (the arc gets the stainless lip)
    brass.add(boxMM(-xChord, y - 0.002, zChord, xChord, y + 0.003, zChord + 0.05));

    // fascia of the sky hole: honed panels between the lip and the cove channel, a plinth below it
    const faSoup = limeSoup;
    const lipB = y - D.rim.lipDepth;
    panelBand(rH, [[lipB - 0.04, D.rim.coveY + 0.13], [D.rim.coveY - 0.13, D.rim.fasciaBottom]], [0.93, 0.955, 1.0], faSoup);
    // stainless lip hanging 0.3 m below the deck top, all round the hole
    {
      const LIP: P2[] = [[0, 0], [D.rim.lipDepth, 0], [D.rim.lipDepth, 0.035], [0.03, 0.035], [0, 0.02]];
      const fr: Frame[] = [];
      const n = 192;
      for (let i = 0; i <= n; i++) {
        const phi = (i / n) * TAU;
        const rad = v3(Math.cos(phi), 0, Math.sin(phi));
        fr.push({ o: v3(CX + rH * rad.x, y, CZ + rH * rad.z), a: v3(0, -1, 0), b: rad.clone().negate() });
      }
      stainless.add(sweep(ccw(LIP), fr, { closed: true }));
    }
    // Bottom stainless aperture lip sealing the 10 cm offset between fasciaBottom (-31.9) and SKY.y (-32.0):
    // clean machined ring with zero coplanar overlap against the flat sky plane.
    {
      const BOT_LIP: P2[] = [[0, 0], [0.11, 0], [0.11, -0.05], [0.02, -0.05], [0, -0.03]];
      const fr: Frame[] = [];
      const n = 192;
      for (let i = 0; i <= n; i++) {
        const phi = (i / n) * TAU;
        const rad = v3(Math.cos(phi), 0, Math.sin(phi));
        fr.push({ o: v3(CX + rH * rad.x, D.rim.fasciaBottom, CZ + rH * rad.z), a: v3(0, -1, 0), b: rad.clone().negate() });
      }
      stainless.add(sweep(ccw(BOT_LIP), fr, { closed: true }));
    }
    // rim cove: a warm slot around the hole, glowing against the sky seen from below
    channel(D.rim.coveY, rH, -1, 0, 'cove', false);
    rimSrc.push({ y: D.rim.coveY, r: rH - 0.03, color: washCol(stripCol.cove, WASH.cove * 1.2) });

    // balustrades on the walkable edges: the arc south of the chord (the east/west arcs north of z = cz lie under F3's
    // footprint, which navigation holes out), and the chord with openings at the F4 mouths
    const rB = rH + 0.07;
    const arcPts: Array<[number, number]> = [];
    const nS = 24;
    for (let i = 0; i <= nS; i++) { const a = -0.01 - ((Math.PI - 0.02) * i) / nS; arcPts.push([CX + rB * Math.cos(a), CZ + rB * Math.sin(a)]); }
    railRun(arcPts, y);
    const cz = zChord + 0.07;
    for (const [a, b] of subtract([-xChord, xChord], ESCALATOR_BANDS.inner)) railRun([[a, cz], [b, cz]], y);
  }

  // ---------------------------------------------------------------------------------------------
  // materials and meshes
  // ---------------------------------------------------------------------------------------------
  ringSrc.sort((p, q) => q.y - p.y); // wall rings, descending at VOID.lightRingPitch from VOID_RING_FIRST_Y
  const light = {
    cx: CX, cz: CZ, rings: ringSrc, y0: VOID_RING_FIRST_Y, pitch: VOID.lightRingPitch, extraRings: rimSrc, strips: stripSrc,
    wrap: 0.35, softness: 0.2, gain: 1, bounce: 0.1,
    // the eclipse below is the brightest thing in the void: cool daylight from the sky hole
    sky: { pos: v3(CX, SKY.y, CZ), color: new THREE.Color(0.7, 0.92, 1.5), falloff: 0.004 },
  };
  setSharedVoidLight(light); // escalator materials (world/metro/escalators.ts) pick the same ring light up at first compile
  // the kit's void-set materials are shared with the oculus and Phase 3: the shell works on clones only
  const terrazzoMat = kit.terrazzo.clone(); terrazzoMat.color.setScalar(0.62); terrazzoMat.envMapIntensity = 0.45;
  const stainlessMat = kit.stainless.clone(); stainlessMat.color.set(0xdfe6ec); stainlessMat.envMapIntensity = 0.65;
  const brassMat = kit.brass.clone();
  // The polished-era band reads as a calm backlit alabaster light line, not a busy gold vein pattern.
  const onyxMat = kit.onyx.clone(); onyxMat.roughness = 0.3;
  onyxMat.map = null; onyxMat.emissiveMap = null; onyxMat.color.set(0xf3ede3); onyxMat.emissive.setRGB(1.0, 0.9, 0.76); onyxMat.emissiveIntensity = 0.55;
  const wallStone = kit.carvedStone.clone();
  wallStone.name = 'metroVoidAshlar'; wallStone.vertexColors = true;
  const strataMat = kit.strata.clone();
  strataMat.name = 'metroVoidStrata'; strataMat.vertexColors = true; strataMat.color.setScalar(STRATA_ALBEDO); strataMat.normalScale.set(0.7, 0.7);
  // a height field has no ledge tops where a bed overhangs: draw both sides so a steep step is never a hole
  strataMat.side = THREE.DoubleSide;
  const limeMat = kit.honedLimestone.clone();
  limeMat.name = 'metroVoidLimestone'; limeMat.vertexColors = true;
  // the source texture is a uniformly brown rock: keep its relief and cracks, drop most of its hue (the beds carry the colour)
  const strataPrev = strataMat.onBeforeCompile.bind(strataMat);
  strataMat.onBeforeCompile = (shader, renderer) => {
    strataPrev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, 0.2);');
  };
  const strataKey = strataMat.customProgramCacheKey.bind(strataMat);
  strataMat.customProgramCacheKey = () => `${strataKey()}|desat`;
  for (const m of [wallStone, strataMat, limeMat]) { installVoidLight(m, light, 'shell'); excludeDirectionalLight(m); }
  for (const m of [terrazzoMat, stainlessMat, brassMat, onyxMat]) { if (m !== onyxMat) installVoidLight(m, light, 'shell'); excludeDirectionalLight(m); }
  const stripMat = new THREE.MeshBasicMaterial({ name: 'metroVoidLight', vertexColors: true });

  let meshCount = 0;
  const mk = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, order = 0): void => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.renderOrder = order;
    m.userData.noShadow = true; // lit only by rings; the static sun shadow map must not carry the shell
    group.add(m);
    meshCount++;
  };
  const plain = (bag: GeoBag): THREE.BufferGeometry | null => bag.merge();
  const colored = (a: THREE.BufferGeometry, bag: GeoBag): THREE.BufferGeometry => {
    const b = bag.merge();
    const parts = [a.index ? a.toNonIndexed() : a];
    if (b) parts.push(withColor(b));
    return mergeGeometries(parts, false)!;
  };
  mk(colored(soup.build(), stoneBag), wallStone, 'metroVoidStone');
  mk(strataGeo, strataMat, 'metroVoidStrata');
  mk(colored(limeSoup.build(), limestone), limeMat, 'metroVoidLimestone');
  mk(plain(onyx), onyxMat, 'metroVoidOnyx');
  mk(plain(terrazzo), terrazzoMat, 'metroVoidDecks');
  mk(plain(stainless), stainlessMat, 'metroVoidStainless');
  mk(plain(brass), brassMat, 'metroVoidBrass');
  mk(lights.merge(), stripMat, 'metroVoidLights');
  mk(plain(glass), kit.glass, 'metroVoidGlass', 2);
  return { group, meshCount };
}
