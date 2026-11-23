import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import {
  CAVERN, CROSSING, DISC, GLASS_FLOOR, LIFTS, OCULUS, PSD, TRENCH, VESPER,
} from '../../layoutMetro';
import { trackOf } from '../../metro/tracks';
import { LINE_COLORS } from '../../metro/trainModel';
import { GeoBag, boxMM, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import type { MetroMaterials } from './materials';
import { createPsdBank, type PsdController } from './psd';
import { buildSlabTracks } from './track';

/**
 * The Crossing floor at -70 m (spec §2.6, §4; Phase 3 task P3-4).
 *
 * Builds:
 *  - 116 m × 20 m dark terrazzo floor (x ±58, z 64..84, y -70) with flush 1.5 m brushed-stainless division grid
 *    (zero coplanar overlap, zero brass in cavern — Ruling 27) and flush satin enamel wayfinding inlays (jade along
 *    both Vesper PSDs, ink-blue from F5 foot, oxblood to F6 opening & glass panel — non-emissive per Ruling 8).
 *  - Full-height Vesper PSD bank (champagne mullions, jade accents) over x ±45 plus fixed full-height glass screens
 *    continuing to the x ±58 floor ends (`psd.ts`).
 *  - Vesper north/south rail trenches with dark charcoal lining, modern slab tracks (`track.ts`), and cool 4000 K
 *    trench-edge light lines.
 *  - Walkable laminated structural glass panel (x -30..-10, z 65..83) on a 1.5 m brushed-stainless T-grid with 0.10 m
 *    ceramic frit pane borders, lift-tube collars, `depthWrite: false` and explicit `renderOrder: 3`.
 *  - 1.1 m ultra-clear glass balustrades with brushed-stainless caps around the -70 disc well ring (325° open at south
 *    for the curved sliding glass well gate in disc.ts), F6 opening, and east/west floor ends (open at funicular).
 *  - Three groups of honed-limestone cantilevered monolith benches (2.4 × 0.5 × 0.45 m) with warm 3200 K under-lights.
 *
 * Budget: 16 draw calls here + 2 curved leaf calls in disc.ts = 18 calls total (budget <= 18).
 */

const CROSSING_DETAIL = {
  terrazzoT: 0.06,
  balH: 1.1,
  balGlassBot: 0.10,
  balGlassTop: 1.04,
  balPostPitch: 2.2,
  trenchInvertY: VESPER.railY - 0.58, // -71.68 (matches track.ts slabDepth)
  trenchCurbTopY: -71.55,
} as const;

export interface CrossingBuild {
  group: THREE.Group;
  /** Screen door controllers indexed [track0 (eastbound), track1 (westbound)], driven by Phase 4. */
  psdRows: [PsdController, PsdController];
  deepMaterials: THREE.Material[];
}

interface Rect2 { x0: number; z0: number; x1: number; z1: number }
interface InlayRect extends Rect2 { rgb: readonly [number, number, number] }

const ccw = (pts: readonly P2[]): P2[] => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...pts].reverse() : [...pts];
};

function circlePts(cx: number, cz: number, r: number, n = 64): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cz - r * Math.sin(a)] as [number, number];
  });
}

function rectPts(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  return [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
}

function slabGeo(
  outer: ReadonlyArray<readonly [number, number]>,
  holes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  yTop: number,
  t: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes = holes.map((h) => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, yTop - t, 0);
  return g;
}

function segBox(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, th: number, ext = 0): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, z1 - z0) + 2 * ext;
  const g = new THREE.BoxGeometry(len, y1 - y0, th);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

function flatQuadXZ(x0: number, z0: number, x1: number, z1: number, y: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    x0, y, z0, x0, y, z1, x1, y, z1,
    x0, y, z0, x1, y, z1, x1, y, z0,
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0,
  ], 2));
  return g;
}

function quadGeo(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ref: THREE.Vector3): THREE.BufferGeometry {
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const pts = n.dot(ref) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  return g;
}

function withVertexColor(geo: THREE.BufferGeometry, rgb: readonly [number, number, number]): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Clips an axis-aligned rectangle [x0,x1] x [z0,z1] outside a circle (cx, cz, r), returning a flat XZ geometry at y.
 * Assumes the circle does not strictly contain all 4 corners and that at least part of the rect lies outside the circle.
 */
function rectMinusCircleXZ(x0: number, z0: number, x1: number, z1: number, cx: number, cz: number, r: number, y: number): THREE.BufferGeometry | null {
  const r2 = r * r;
  const inside = (x: number, z: number): boolean => (x - cx) ** 2 + (z - cz) ** 2 < r2 - 1e-7;
  // Quick reject: all 4 corners inside (circle is convex => entire rect inside)
  if (inside(x0, z0) && inside(x1, z0) && inside(x1, z1) && inside(x0, z1)) return null;
  // Quick accept: closest point on rect to (cx, cz) is outside circle
  const clX = Math.max(x0, Math.min(cx, x1));
  const clZ = Math.max(z0, Math.min(cz, z1));
  if ((clX - cx) ** 2 + (clZ - cz) ** 2 >= r2 - 1e-6) return flatQuadXZ(x0, z0, x1, z1, y);

  // Exact boundary walk in (x, z) CCW (normal +y in Three.js XZ means: bottom-left -> top-left -> top-right -> bottom-right in z-down,
  // i.e. (x0,z0) -> (x0,z1) -> (x1,z1) -> (x1,z0) which is CCW in shape coords (x, -z)!).
  // Use shape coordinates (sx = x, sy = -z) where CCW has positive signed area.
  const scx = cx, scy = -cz;
  const edges: Array<[[number, number], [number, number]]> = [
    [[x0, -z0], [x1, -z0]], // south edge (+x)
    [[x1, -z0], [x1, -z1]], // east edge (-z = -sy? Wait: z0 < z1 => -z0 > -z1, so CCW in (x, -z) goes (x0,-z1)->(x1,-z1)->(x1,-z0)->(x0,-z0))
  ];
  void edges;
  const sy0 = -z1, sy1 = -z0; // sy0 < sy1
  const polyEdges: Array<[[number, number], [number, number]]> = [
    [[x0, sy0], [x1, sy0]],
    [[x1, sy0], [x1, sy1]],
    [[x1, sy1], [x0, sy1]],
    [[x0, sy1], [x0, sy0]],
  ];

  const out: Array<[number, number]> = [];
  const pushPt = (px: number, py: number): void => {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev[0] - px, prev[1] - py) < 1e-5) return;
    out.push([px, py]);
  };
  let arcExit: [number, number] | null = null;
  let pendingEntry: [number, number] | null = null;

  const appendArc = (from: [number, number], to: [number, number]): void => {
    // Follow the circle clockwise in (x, sy) so the circle interior stays to our right (hole carved out of CCW rect)
    const a0 = Math.atan2(from[1] - scy, from[0] - scx);
    const a1 = Math.atan2(to[1] - scy, to[0] - scx);
    let d = a1 - a0;
    while (d > 0) d -= Math.PI * 2;
    if (d < -Math.PI * 1.999) d = 0;
    const steps = Math.max(2, Math.ceil((Math.abs(d) / (Math.PI * 2)) * 64));
    for (let s = 1; s <= steps; s++) {
      const a = a0 + (d * s) / steps;
      pushPt(scx + r * Math.cos(a), scy + r * Math.sin(a));
    }
  };

  for (const [[ax, ay], [bx, by]] of polyEdges) {
    const dx = bx - ax, dy = by - ay;
    const fx = ax - scx, fy = ay - scy;
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - r2;
    const disc = B * B - 4 * A * C;
    const aOut = C >= -1e-7;
    if (disc <= 1e-9) {
      if (aOut) {
        if (arcExit) { appendArc(arcExit, [ax, ay]); arcExit = null; }
        pushPt(ax, ay);
      }
      continue;
    }
    const sd = Math.sqrt(disc);
    const t1 = (-B - sd) / (2 * A);
    const t2 = (-B + sd) / (2 * A);
    const atT = (t: number): [number, number] => [ax + dx * t, ay + dy * t];

    if (aOut) {
      if (arcExit) { appendArc(arcExit, [ax, ay]); arcExit = null; }
      pushPt(ax, ay);
      if (t1 > 1e-7 && t1 < 1 - 1e-7) {
        const p1 = atT(t1);
        pushPt(p1[0], p1[1]);
        if (t2 > 1e-7 && t2 < 1 - 1e-7) {
          // Enters and exits circle on the same edge
          appendArc(p1, atT(t2));
        } else {
          arcExit = p1;
        }
      }
    } else {
      // Starting inside circle
      if (t2 > 1e-7 && t2 < 1 - 1e-7) {
        const p2 = atT(t2);
        if (arcExit) { appendArc(arcExit, p2); arcExit = null; }
        else pendingEntry = p2;
        pushPt(p2[0], p2[1]);
      }
    }
  }
  if (arcExit && pendingEntry) appendArc(arcExit, pendingEntry);
  if (out.length >= 2 && Math.hypot(out[0]![0] - out[out.length - 1]![0], out[0]![1] - out[out.length - 1]![1]) < 1e-5) out.pop();
  if (out.length < 3) return null;

  const shape = new THREE.Shape(out.map(([px, py]) => new THREE.Vector2(px, py)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/**
 * Procedural 256x256 tileable ceramic frit texture for one laminated structural glass pane:
 * 0.10 m frosted dot-matrix frit border around all 4 edges (walkable visual safety cue), crystal-clear centre.
 */
function makeGlassFritTextures(renderer?: THREE.WebGLRenderer): { map: THREE.CanvasTexture; alphaMap: THREE.CanvasTexture } {
  const S = 256;
  const cCol = document.createElement('canvas'); cCol.width = S; cCol.height = S;
  const gCol = cCol.getContext('2d')!;
  const cAlp = document.createElement('canvas'); cAlp.width = S; cAlp.height = S;
  const gAlp = cAlp.getContext('2d')!;

  const fritPx = Math.round((CROSSING.glassFritWidth / 1.5) * S); // ~17 px border
  const imgC = gCol.createImageData(S, S);
  const imgA = gAlp.createImageData(S, S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const edgeDist = Math.min(x, S - 1 - x, y, S - 1 - y);
      // Outer 4 px solid hairline seal + 13 px architectural ceramic dot-matrix frit fading smoothly inward
      let frit = 0;
      if (edgeDist < 4) {
        frit = 0.85;
      } else if (edgeDist < fritPx) {
        const fade = 1 - (edgeDist - 4) / (fritPx - 4);
        // Subtle fine 4 px dot matrix inside the frit band
        const dx = ((x % 4) - 1.5) / 1.8, dy = ((y % 4) - 1.5) / 1.8;
        const dot = dx * dx + dy * dy < 0.85 ? 1.0 : 0.45;
        frit = (0.28 + 0.50 * fade) * dot;
      }
      // Clear centre: alpha 0.065 (crystal-clear view 12 m down into Halcyon); frit border: alpha up to 0.52
      const alpha = Math.min(1, 0.065 + frit * 0.48);
      // Restrained low-iron glass tint in centre (avoids milky glare at grazing angles), crisp cool ceramic white on frit
      const r = Math.round((152 + 88 * frit));
      const g = Math.round((178 + 68 * frit));
      const b = Math.round((176 + 70 * frit));
      const i = (y * S + x) * 4;
      imgC.data[i] = r; imgC.data[i + 1] = g; imgC.data[i + 2] = b; imgC.data[i + 3] = 255;
      const ab = Math.round(alpha * 255);
      imgA.data[i] = ab; imgA.data[i + 1] = ab; imgA.data[i + 2] = ab; imgA.data[i + 3] = 255;
    }
  }
  gCol.putImageData(imgC, 0, 0);
  gAlp.putImageData(imgA, 0, 0);

  const cfg = (c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 8;
    t.needsUpdate = true;
    return t;
  };
  return { map: cfg(cCol, true), alphaMap: cfg(cAlp, false) };
}

export function buildCrossing(lib: MaterialLibrary, kit: MetroMaterials, renderer?: THREE.WebGLRenderer): CrossingBuild {
  const group = new THREE.Group();
  group.name = 'metroCrossing';

  const { cx, cz } = OCULUS;
  const fl = VESPER.floor;
  const yTop = VESPER.topY; // -70.0
  const yUnder = yTop - VESPER.slabThickness; // -71.5
  const yBase = CAVERN.baseFloorY; // -72.5

  const terrazzoBag = new GeoBag(lib, 'darkMarble', kit.metersPerTile.terrazzo);
  const stainlessBag = new GeoBag(lib, 'castIron', kit.metersPerTile.stainless);
  const inlayParts: THREE.BufferGeometry[] = [];
  const slabBodyBag = new GeoBag(lib, 'wallStone', 3.0);
  const balGlassGeos: THREE.BufferGeometry[] = [];
  const benchStoneBag = new GeoBag(lib, 'wallStone', kit.metersPerTile.honedLimestone);
  const benchGlowParts: THREE.BufferGeometry[] = [];

  // ---- 1. Partitioned Crossing terrazzo floor + flush 1.5 m brushed-stainless strips + satin enamel inlays ----
  // Zero coplanar overlap: exact 1D grid breakpoint partitioning + exact circle clip around the r = 4.0 disc well.
  {
    const sw = CROSSING.stripW;
    const hw = CROSSING.inlayWidth / 2;
    // Calibrated for direct 7.0 DEEP_SUN on a horizontal floor so each satin enamel path reads as deep architectural
    // forest-jade, Prussian ink-blue, and burgundy oxblood inlaid in dark terrazzo (never bright neon paint).
    const jadeCol: [number, number, number] = [LINE_COLORS.vesper[0] * 0.36, LINE_COLORS.vesper[1] * 0.36, LINE_COLORS.vesper[2] * 0.36];
    const blueCol: [number, number, number] = [LINE_COLORS.meridian[0] * 0.36, LINE_COLORS.meridian[1] * 0.36, LINE_COLORS.meridian[2] * 0.36];
    const oxCol: [number, number, number] = [LINE_COLORS.halcyon[0] * 0.34, LINE_COLORS.halcyon[1] * 0.34, LINE_COLORS.halcyon[2] * 0.34];

    const zJadeN = fl.zMin + PSD.inset + CROSSING.inlayOffset; // 64.85
    const zJadeS = fl.zMax - PSD.inset - CROSSING.inlayOffset; // 83.15

    const inlays: InlayRect[] = [
      // Jade along both Vesper PSD lines (boarding zone x ±45, 0.5 m inside PSD line, outside GLASS_FLOOR z 65..83)
      { x0: VESPER.platformXMin, z0: zJadeN - hw, x1: VESPER.platformXMax, z1: zJadeN + hw, rgb: jadeCol },
      { x0: VESPER.platformXMin, z0: zJadeS - hw, x1: VESPER.platformXMax, z1: zJadeS + hw, rgb: jadeCol },
      // Ink-blue path from both F5 escalator feet (x = ±6.0, z = 72.03) connecting south to the Crossing spine (z = 67.5)
      { x0: -6.0 - hw, z0: 67.5 - hw, x1: -6.0 + hw, z1: 71.8, rgb: blueCol },
      { x0: +6.0 - hw, z0: 67.5 - hw, x1: +6.0 + hw, z1: 71.8, rgb: blueCol },
      { x0: -8.5, z0: 67.5 - hw, x1: +12.0, z1: 67.5 + hw, rgb: blueCol },
      // Oxblood path leading from the central axis to the glass panel (x = -10) and west from the glass panel to F6 mouth (x = -47)
      { x0: GLASS_FLOOR.xMax, z0: 74.0 - hw, x1: -4.4, z1: 74.0 + hw, rgb: oxCol },
      { x0: -48.5 - hw, z0: 71.2 - hw, x1: GLASS_FLOOR.xMin, z1: 71.2 + hw, rgb: oxCol },
      { x0: -48.5 - hw, z0: 67.8 - hw, x1: -48.5 + hw, z1: 71.2 + hw, rgb: oxCol },
      { x0: -48.5 - hw, z0: 67.8 - hw, x1: -47.15, z1: 67.8 + hw, rgb: oxCol },
    ];

    const rectHoles: Rect2[] = [
      { x0: GLASS_FLOOR.xMin, z0: GLASS_FLOOR.zMin, x1: GLASS_FLOOR.xMax, z1: GLASS_FLOOR.zMax },
      { x0: VESPER.f6OpeningX[0], z0: VESPER.f6OpeningZ[0], x1: VESPER.f6OpeningX[1], z1: VESPER.f6OpeningZ[1] },
    ];

    // Stainless 1.5 m grid lines aligned to x = 0 ± 1.5k and z = 74 ± 1.5k (so z = 65 & 83 align seamlessly with GLASS_FLOOR!)
    const xStrips: Array<[number, number]> = [];
    for (let gx = -57.0; gx <= 57.0 + 1e-6; gx += CROSSING.floorGrid) xStrips.push([gx - sw / 2, gx + sw / 2]);
    const zStrips: Array<[number, number]> = [];
    for (let gz = cz - 6 * CROSSING.floorGrid; gz <= cz + 6 * CROSSING.floorGrid + 1e-6; gz += CROSSING.floorGrid) {
      if (gz > fl.zMin + 0.1 && gz < fl.zMax - 0.1) zStrips.push([gz - sw / 2, gz + sw / 2]);
    }

    const xsRaw: number[] = [fl.xMin, fl.xMax];
    const zsRaw: number[] = [fl.zMin, fl.zMax];
    for (const h of rectHoles) { xsRaw.push(h.x0, h.x1); zsRaw.push(h.z0, h.z1); }
    for (const r of inlays) { xsRaw.push(r.x0, r.x1); zsRaw.push(r.z0, r.z1); }
    for (const [a, b] of xStrips) xsRaw.push(a, b);
    for (const [a, b] of zStrips) zsRaw.push(a, b);

    const dedup = (vals: number[], lo: number, hi: number): number[] => {
      vals.sort((a, b) => a - b);
      const out: number[] = [];
      for (const v of vals) {
        if (v < lo - 1e-6 || v > hi + 1e-6) continue;
        const c = Math.max(lo, Math.min(hi, v));
        if (out.length === 0 || c - out[out.length - 1]! > 1e-4) out.push(c);
      }
      return out;
    };
    const xs = dedup(xsRaw, fl.xMin, fl.xMax);
    const zs = dedup(zsRaw, fl.zMin, fl.zMax);

    const inAny = (mx: number, mz: number, list: readonly Rect2[]): boolean =>
      list.some((r) => mx > r.x0 && mx < r.x1 && mz > r.z0 && mz < r.z1);
    const findInlay = (mx: number, mz: number): InlayRect | undefined =>
      inlays.find((r) => mx > r.x0 && mx < r.x1 && mz > r.z0 && mz < r.z1);
    const inBand = (v: number, bands: ReadonlyArray<readonly [number, number]>): boolean =>
      bands.some(([a, b]) => v > a && v < b);

    for (let ix = 0; ix + 1 < xs.length; ix++) {
      const x0 = xs[ix]!, x1 = xs[ix + 1]!;
      const mx = (x0 + x1) / 2;
      const isXStrip = inBand(mx, xStrips);
      for (let iz = 0; iz + 1 < zs.length; iz++) {
        const z0 = zs[iz]!, z1 = zs[iz + 1]!;
        const mz = (z0 + z1) / 2;
        if (inAny(mx, mz, rectHoles)) continue;
        const geo = rectMinusCircleXZ(x0, z0, x1, z1, cx, cz, DISC.wellR, yTop);
        if (!geo) continue;

        const inl = findInlay(mx, mz);
        if (inl) {
          inlayParts.push(withVertexColor(geo, inl.rgb));
        } else if (isXStrip || inBand(mz, zStrips)) {
          stainlessBag.add(geo);
        } else {
          terrazzoBag.add(geo);
        }
      }
    }
  }

  // ---- 2. Crossing slab body/fascia + Vesper dark charcoal trenches + well liner ----
  {
    const D = CROSSING_DETAIL;
    const wellHoles = [
      circlePts(cx, cz, DISC.wellR, 64),
      rectPts(GLASS_FLOOR.xMin, GLASS_FLOOR.zMin, GLASS_FLOOR.xMax, GLASS_FLOOR.zMax),
      rectPts(VESPER.f6OpeningX[0], VESPER.f6OpeningZ[0], VESPER.f6OpeningX[1], VESPER.f6OpeningZ[1]),
    ];
    // Solid architectural floor slab below the top terrazzo finish (60 mm below yTop so zero grazing-angle z-fighting)
    slabBodyBag.add(slabGeo(rectPts(fl.xMin, fl.zMin, fl.xMax, fl.zMax), wellHoles, yTop - D.terrazzoT, VESPER.slabThickness - D.terrazzoT));

    // Disc well vertical dark monolith liner continuing from slab underside (-71.5) down to pit base floor (-72.5)
    const wellLiner = new THREE.CylinderGeometry(DISC.wellR, DISC.wellR, yUnder - yBase + 0.05, 64, 1, true);
    wellLiner.scale(-1, 1, 1); // inward-facing wall
    wellLiner.translate(cx, (yUnder + yBase) / 2, cz);
    slabBodyBag.add(wellLiner);

    // Slim brushed-stainless coping edges framing the Crossing slab perimeter (x = ±58, z = 64/84) and disc well rim
    stainlessBag.add(boxMM(fl.xMin - 0.015, yTop - 0.06, fl.zMin, fl.xMin + 0.015, yTop + 0.002, fl.zMax));
    stainlessBag.add(boxMM(fl.xMax - 0.015, yTop - 0.06, fl.zMin, fl.xMax + 0.015, yTop + 0.002, fl.zMax));
    stainlessBag.add(boxMM(fl.xMin, yTop - 0.06, fl.zMin - 0.015, fl.xMax, yTop + 0.002, fl.zMin + 0.015));
    stainlessBag.add(boxMM(fl.xMin, yTop - 0.06, fl.zMax - 0.015, fl.xMax, yTop + 0.002, fl.zMax + 0.015));

    // Vesper north (z = 62.45) and south (z = 85.55) trenches: dark charcoal floor bed, retaining walls, outer coping
    const xT0 = CAVERN.transept.xMin;
    const xT1 = CAVERN.transept.xMax;
    for (const [idx, tz] of VESPER.trackZ.entries()) {
      const zLo = tz - TRENCH.halfWidth; // 60.85 / 83.95
      const zHi = tz + TRENCH.halfWidth; // 64.05 / 87.15
      // Dark charcoal trench invert slab supporting the concrete track plinths (y = -72.5 .. -71.68)
      slabBodyBag.add(boxMM(xT0, yBase, zLo, xT1, D.trenchInvertY, zHi));
      // Platform-side retaining wall down to base floor (x = ±58 under Crossing slab)
      const zPlat = idx === 0 ? fl.zMin : fl.zMax;
      slabBodyBag.add(boxMM(fl.xMin, yBase, zPlat - 0.08, fl.xMax, yUnder + 0.02, zPlat + 0.08));
      // Outer trench low retaining kerb separating the dark trench from the pale terrazzo base floor
      const zOut = idx === 0 ? zLo : zHi;
      slabBodyBag.add(boxMM(xT0, yBase, zOut - 0.14, xT1, D.trenchCurbTopY, zOut + 0.14));
      stainlessBag.add(boxMM(xT0, D.trenchCurbTopY - 0.015, zOut - 0.15, xT1, D.trenchCurbTopY + 0.01, zOut + 0.15));
    }
  }

  // ---- 3. Walkable laminated structural glass panel (x -30..-10, z 65..83) + 1.5 m stainless T-grid + lift collars ----
  let glassPanelMat: THREE.MeshStandardMaterial;
  {
    const gx0 = GLASS_FLOOR.xMin, gx1 = GLASS_FLOOR.xMax;
    const gz0 = GLASS_FLOOR.zMin, gz1 = GLASS_FLOOR.zMax;
    const nx = CROSSING.glassPanesX, nz = CROSSING.glassPanesZ;
    const paneW = (gx1 - gx0) / nx; // 1.5385 m
    const paneD = (gz1 - gz0) / nz; // 1.5000 m

    // Structural perimeter frame around the glass panel recess
    const pW = 0.08, pH = 0.16;
    stainlessBag.add(boxMM(gx0 - pW, yTop - pH, gz0 - pW, gx1 + pW, yTop + 0.002, gz0 + 0.03));
    stainlessBag.add(boxMM(gx0 - pW, yTop - pH, gz1 - 0.03, gx1 + pW, yTop + 0.002, gz1 + pW));
    stainlessBag.add(boxMM(gx0 - pW, yTop - pH, gz0, gx0 + 0.03, yTop + 0.002, gz1));
    stainlessBag.add(boxMM(gx1 - 0.03, yTop - pH, gz0, gx1 + pW, yTop + 0.002, gz1));

    // Helper: split a 1D interval [a, b] along a beam line to cleanly exclude both lift tube circles (r = tubeR + 0.06)
    const rEx = LIFTS.tubeR + 0.06;
    const splitLiftTube = (fixed: number, a: number, b: number, alongZ: boolean): Array<[number, number]> => {
      let segs: Array<[number, number]> = [[a, b]];
      for (const [lx, lz] of LIFTS.positions) {
        const dPerp = alongZ ? fixed - lx : fixed - lz;
        if (Math.abs(dPerp) >= rEx) continue;
        const half = Math.sqrt(rEx * rEx - dPerp * dPerp);
        const c = alongZ ? lz : lx;
        const lo = c - half, hi = c + half;
        const next: Array<[number, number]> = [];
        for (const [s0, s1] of segs) {
          if (hi <= s0 || lo >= s1) { next.push([s0, s1]); continue; }
          if (lo > s0 + 0.03) next.push([s0, lo]);
          if (hi < s1 - 0.03) next.push([hi, s1]);
        }
        segs = next;
      }
      return segs;
    };

    // Internal stainless T-grid (50 mm flush top flange + 120 mm deep structural web)
    for (let i = 1; i < nx; i++) {
      const bx = gx0 + i * paneW;
      for (const [s0, s1] of splitLiftTube(bx, gz0, gz1, true)) {
        stainlessBag.add(boxMM(bx - 0.025, yTop - 0.032, s0, bx + 0.025, yTop + 0.001, s1));
        stainlessBag.add(boxMM(bx - 0.012, yTop - 0.145, s0, bx + 0.012, yTop - 0.032, s1));
      }
    }
    for (let j = 1; j < nz; j++) {
      const bz = gz0 + j * paneD;
      for (const [s0, s1] of splitLiftTube(bz, gx0, gx1, false)) {
        stainlessBag.add(boxMM(s0, yTop - 0.032, bz - 0.025, s1, yTop + 0.001, bz + 0.025));
        stainlessBag.add(boxMM(s0, yTop - 0.145, bz - 0.012, s1, yTop - 0.032, bz + 0.012));
      }
    }

    // Brushed stainless collars where the two lift tubes pass cleanly through the glass panel
    const collarProf = ccw([
      [0, -0.15], [0.16, -0.15], [0.16, 0.018], [0.14, 0.032], [0.02, 0.032], [0, 0.018],
    ]);
    for (const [lx, lz] of LIFTS.positions) {
      const fr: Frame[] = [];
      const segs = 48;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const rad = v3(Math.cos(a), 0, Math.sin(a));
        fr.push({ o: v3(lx + LIFTS.tubeR * rad.x, yTop, lz + LIFTS.tubeR * rad.z), a: rad, b: v3(0, 1, 0) });
      }
      stainlessBag.add(sweep(collarProf, fr, { closed: true }));
    }

    // Single-surface laminated structural glass pane sheet (DoubleSide -> zero self-overdraw, exact pane-grid UVs for 0.1 m frit)
    const shape = new THREE.Shape(rectPts(gx0, gz0, gx1, gz1).map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.holes = LIFTS.positions.map(([lx, lz]) => new THREE.Path(circlePts(lx, lz, LIFTS.tubeR + 0.04, 48).map(([x, z]) => new THREE.Vector2(x, -z))));
    const panelGeo = new THREE.ShapeGeometry(shape, 48);
    panelGeo.rotateX(-Math.PI / 2);
    panelGeo.translate(0, yTop - 0.005, 0);
    // Assign exact per-pane UVs [0..nx] x [0..nz] so every 1.54 x 1.50 m pane gets a crisp 0.10 m ceramic frit border
    const pos = panelGeo.getAttribute('position') as THREE.BufferAttribute;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = (pos.getX(i) - gx0) / paneW;
      uvs[i * 2 + 1] = (pos.getZ(i) - gz0) / paneD;
    }
    panelGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    const frit = makeGlassFritTextures(renderer);
    glassPanelMat = new THREE.MeshStandardMaterial({
      name: 'metroDeepGlassFloorPanel',
      color: 0xffffff,
      map: frit.map,
      alphaMap: frit.alphaMap,
      transparent: true,
      depthWrite: false,
      roughness: 0.06,
      metalness: 0.05,
      envMapIntensity: 1.45,
      side: THREE.DoubleSide,
    });
    const panelMesh = new THREE.Mesh(panelGeo, glassPanelMat);
    panelMesh.name = 'crossingGlassPanel';
    panelMesh.renderOrder = 3;
    panelMesh.userData.noShadow = true;
    group.add(panelMesh);
  }

  // ---- 4. Ultra-clear 1.1 m glass balustrades (disc well 325° ring, F6 opening, east/west floor ends) ----
  {
    const B = CROSSING_DETAIL;
    const addGlassRun = (pts: ReadonlyArray<readonly [number, number]>, postEnd0 = true, postEnd1 = true): void => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, z0] = pts[i]!, [x1, z1] = pts[i + 1]!;
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.ceil(len / B.balPostPitch));
        const at = (k: number): [number, number] => [x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n];
        for (let k = i === 0 ? 0 : 1; k <= n; k++) {
          if (i === 0 && k === 0 && !postEnd0) continue;
          if (i === pts.length - 2 && k === n && !postEnd1) continue;
          const [px, pz] = at(k);
          stainlessBag.add(boxMM(px - 0.022, yTop, pz - 0.022, px + 0.022, yTop + B.balH, pz + 0.022));
        }
        for (let k = 0; k < n; k++) {
          const [ax, az] = at(k), [bx, bz] = at(k + 1);
          stainlessBag.add(segBox(ax, az, bx, bz, yTop + B.balH - 0.042, yTop + B.balH, 0.048, 0.022));
          stainlessBag.add(segBox(ax, az, bx, bz, yTop, yTop + B.balGlassBot, 0.056));
          const gl = Math.hypot(bx - ax, bz - az);
          if (gl > 0.09) {
            const gx = (bx - ax) / gl, gz = (bz - az) / gl;
            balGlassGeos.push(segBox(
              ax + gx * 0.028, az + gz * 0.028, bx - gx * 0.028, bz - gz * 0.028,
              yTop + B.balGlassBot, yTop + B.balGlassTop, 0.012,
            ));
          }
        }
      }
    };

    // A. Crossing-floor -70 disc well ring (r = 4.06, 325° continuous glass balustrade open at SOUTH ±17.5° for sliding leaves)
    const rRing = DISC.wellR + 0.06;
    const south = -Math.PI / 2;
    const gap = CROSSING.wellGateHalfAngle;
    const aStart = south + gap;
    const aEnd = south + Math.PI * 2 - gap;
    const segs = 26;
    const ringPts: Array<[number, number]> = [];
    for (let i = 0; i <= segs; i++) {
      const a = aStart + ((aEnd - aStart) * i) / segs;
      ringPts.push([cx + rRing * Math.cos(a), cz + rRing * Math.sin(a)]);
    }
    // Curved brushed-stainless top cap & base shoe + slim radial posts every 2nd segment + curved glass panes
    const capProf = ccw([[-0.024, B.balH - 0.042], [0.024, B.balH - 0.042], [0.024, B.balH], [-0.024, B.balH]]);
    const shoeProf = ccw([[-0.028, 0], [0.028, 0], [0.028, B.balGlassBot], [-0.028, B.balGlassBot]]);
    const glassProf = ccw([[-0.006, B.balGlassBot], [0.006, B.balGlassBot], [0.006, B.balGlassTop], [-0.006, B.balGlassTop]]);
    const arcFrames: Frame[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = aStart + ((aEnd - aStart) * i) / segs;
      const rad = v3(Math.cos(a), 0, Math.sin(a));
      arcFrames.push({ o: v3(cx + rRing * rad.x, yTop, cz + rRing * rad.z), a: rad, b: v3(0, 1, 0) });
      // Slim vertical stainless posts at gate jambs and every 2nd arc segment
      if (i === 0 || i === segs || i % 2 === 0) {
        const w = i === 0 || i === segs ? 0.032 : 0.020; // crisp slim stainless jamb posts framing the sliding leaves
        const px = cx + rRing * rad.x, pz = cz + rRing * rad.z;
        stainlessBag.add(boxMM(px - w, yTop, pz - w, px + w, yTop + B.balH, pz + w));
      }
    }
    stainlessBag.add(sweep(capProf, arcFrames, { closed: true, caps: true }));
    stainlessBag.add(sweep(shoeProf, arcFrames, { closed: true, caps: true }));
    balGlassGeos.push(sweep(glassProf, arcFrames, { closed: true, caps: true }));
    // Flush brushed-stainless threshold arc across the south gangway opening
    const thrFrames: Frame[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = south - gap + ((2 * gap) * i) / 10;
      const rad = v3(Math.cos(a), 0, Math.sin(a));
      thrFrames.push({ o: v3(cx + (DISC.wellR + 0.04) * rad.x, yTop, cz + (DISC.wellR + 0.04) * rad.z), a: rad, b: v3(0, 1, 0) });
    }
    stainlessBag.add(sweep(ccw([[-0.06, -0.005], [0.06, -0.005], [0.06, 0.010], [-0.06, 0.010]]), thrFrames, { closed: true, caps: true }));
    void ringPts;

    // B. F6 escalator opening (x in [-46.7, -41.0], z in [66.0, 69.6]): open at WEST mouth (x = -46.7), guarded N/E/S
    const [fx0, fx1] = VESPER.f6OpeningX;
    const [fz0, fz1] = VESPER.f6OpeningZ;
    addGlassRun([[fx0, fz0 - 0.05], [fx1 + 0.05, fz0 - 0.05], [fx1 + 0.05, fz1 + 0.05], [fx0, fz1 + 0.05]]);

    // C. West floor end (x = -57.94, guarding the 2.5 m drop into the water-wall trough)
    const zPsdN = fl.zMin + PSD.inset; // 64.35
    const zPsdS = fl.zMax - PSD.inset; // 83.65
    addGlassRun([[fl.xMin + 0.06, zPsdN + 0.06], [fl.xMin + 0.06, zPsdS - 0.06]]);

    // D. East floor end (x = +57.94, guarding the onyx reveal, leaving the funicular station gap z 71.8..76.2)
    const [fg0, fg1] = CROSSING.funicularEdgeGapZ;
    addGlassRun([[fl.xMax - 0.06, zPsdN + 0.06], [fl.xMax - 0.06, fg0]]);
    addGlassRun([[fl.xMax - 0.06, fg1], [fl.xMax - 0.06, zPsdS - 0.06]]);
  }

  // ---- 5. Three groups of Monolith honed-limestone cantilevered benches with warm 3200 K under-lights ----
  {
    const { length: L, depth: D, height: H } = CROSSING.bench;
    const seatBot = 0.27;  // 18 cm thick cantilevered monolith limestone seat
    const pedL = 1.56, pedD = 0.26;
    const ch = 0.012;      // subtle 12 mm top chamfer

    for (const b of CROSSING.benches) {
      const sx = b.axis === 'x' ? L : D;
      const sz = b.axis === 'x' ? D : L;
      const px = b.axis === 'x' ? pedL : pedD;
      const pz = b.axis === 'x' ? pedD : pedL;

      // Recessed central pedestal base (y = 0 .. 0.27)
      benchStoneBag.add(boxMM(b.x - px / 2, yTop, b.z - pz / 2, b.x + px / 2, yTop + seatBot, b.z + pz / 2));
      // Cantilevered monolith seat slab (lower body + subtly chamfered top cap)
      benchStoneBag.add(boxMM(b.x - sx / 2, yTop + seatBot, b.z - sz / 2, b.x + sx / 2, yTop + H - ch, b.z + sz / 2));
      benchStoneBag.add(boxMM(b.x - sx / 2 + ch, yTop + H - ch, b.z - sz / 2 + ch, b.x + sx / 2 - ch, yTop + H, b.z + sz / 2 - ch));

      // Hidden warm 3200 K linear under-light tucked cleanly under the cantilevered seat (downward strip + recessed 14 mm groove glow)
      const gy = yTop + seatBot - 0.005;
      const inset = 0.055;
      const bandW = 0.055;
      if (b.axis === 'x') {
        for (const sgn of [-1, 1] as const) {
          const zA = b.z + sgn * (sz / 2 - inset - bandW);
          const zB = b.z + sgn * (sz / 2 - inset);
          benchGlowParts.push(quadGeo(
            v3(b.x - sx / 2 + 0.08, gy, Math.min(zA, zB)), v3(b.x + sx / 2 - 0.08, gy, Math.min(zA, zB)),
            v3(b.x + sx / 2 - 0.08, gy, Math.max(zA, zB)), v3(b.x - sx / 2 + 0.08, gy, Math.max(zA, zB)),
            v3(0, -1, 0),
          ));
          const zFace = b.z + sgn * (pz / 2 + 0.004);
          benchGlowParts.push(quadGeo(
            v3(b.x - px / 2 + 0.03, yTop + seatBot - 0.016, zFace), v3(b.x + px / 2 - 0.03, yTop + seatBot - 0.016, zFace),
            v3(b.x + px / 2 - 0.03, yTop + seatBot - 0.002, zFace), v3(b.x - px / 2 + 0.03, yTop + seatBot - 0.002, zFace),
            v3(0, 0, sgn),
          ));
        }
      } else {
        for (const sgn of [-1, 1] as const) {
          const xA = b.x + sgn * (sx / 2 - inset - bandW);
          const xB = b.x + sgn * (sx / 2 - inset);
          benchGlowParts.push(quadGeo(
            v3(Math.min(xA, xB), gy, b.z - sz / 2 + 0.08), v3(Math.max(xA, xB), gy, b.z - sz / 2 + 0.08),
            v3(Math.max(xA, xB), gy, b.z + sz / 2 - 0.08), v3(Math.min(xA, xB), gy, b.z + sz / 2 - 0.08),
            v3(0, -1, 0),
          ));
          const xFace = b.x + sgn * (px / 2 + 0.004);
          benchGlowParts.push(quadGeo(
            v3(xFace, yTop + seatBot - 0.016, b.z - pz / 2 + 0.03), v3(xFace, yTop + seatBot - 0.016, b.z + pz / 2 - 0.03),
            v3(xFace, yTop + seatBot - 0.002, b.z + pz / 2 - 0.03), v3(xFace, yTop + seatBot - 0.002, b.z - pz / 2 + 0.03),
            v3(sgn, 0, 0),
          ));
        }
      }
    }
  }

  // ---- 6. Vesper platform screen doors (x ±45) + fixed full-height glass screens continuing to x ±58 (5 calls) ----
  const t0 = trackOf('vesper', 0); // z = 62.45, dir = [+1, 0], side = +1 -> psd at z = 64.35 facing +z
  const t1 = trackOf('vesper', 1); // z = 85.55, dir = [-1, 0], side = +1 -> psd at z = 83.65 facing -z
  const psdBank = createPsdBank(
    [
      {
        track: t0, side: +1, platformY: yTop, platformHalfLen: VESPER.platformXMax,
        extendSMin: fl.xMin, extendSMax: fl.xMax, initialDisplay: 'VESPER LINE · EASTBOUND',
      },
      {
        track: t1, side: +1, platformY: yTop, platformHalfLen: VESPER.platformXMax,
        extendSMin: fl.xMin, extendSMax: fl.xMax, initialDisplay: 'VESPER LINE · WESTBOUND',
      },
    ],
    lib,
    kit,
    { name: 'vesperPsd', extraFixedGlass: balGlassGeos },
  );

  // ---- 7. Vesper modern slab tracks + thin cool 4000 K trench-edge light lines (4 calls) ----
  const tracks = buildSlabTracks(
    [
      {
        track: t0, sMin: CAVERN.transept.xMin - 0.5, sMax: CAVERN.transept.xMax + 0.5,
        edgeLights: [
          // Under the north Crossing platform overhang (z = 64.0) facing into the trench
          { perpOffset: +1.53, y: yTop - 0.16, facing: [0, -0.35, -0.94], sMin: fl.xMin, sMax: fl.xMax },
          // Along the outer trench coping (z = 60.88) angled up-inward so visible from Crossing through PSDs
          { perpOffset: -1.56, y: CROSSING_DETAIL.trenchCurbTopY - 0.03, facing: [0, 0.5, 0.866], sMin: fl.xMin, sMax: fl.xMax },
        ],
      },
      {
        track: t1, sMin: CAVERN.transept.xMin - 0.5, sMax: CAVERN.transept.xMax + 0.5,
        edgeLights: [
          // Under the south Crossing platform overhang (z = 84.0) facing into the trench
          { perpOffset: +1.53, y: yTop - 0.16, facing: [0, -0.35, +0.94], sMin: fl.xMin, sMax: fl.xMax },
          // Along the outer trench coping (z = 87.12) angled up-inward
          { perpOffset: -1.56, y: CROSSING_DETAIL.trenchCurbTopY - 0.03, facing: [0, 0.5, -0.866], sMin: fl.xMin, sMax: fl.xMax },
        ],
      },
    ],
    lib,
    kit,
    'vesperTracks',
  );

  // ---- Assemble meshes (16 draw calls here + 2 curved leaf calls in disc.ts = 18 total) ----
  const stainlessMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepCrossingStainless',
    color: 0xcfd5db,
    metalness: 1.0,
    roughness: 0.24,
    envMapIntensity: 1.2,
  });
  const inlayMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepCrossingInlay',
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.32,
    metalness: 0.08,
  });
  const slabBodyMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepCrossingSlabBody',
    color: 0x1a1d22,
    roughness: 0.80,
    metalness: 0.04,
  });

  const addM = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, noShadow = false): void => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (noShadow) m.userData.noShadow = true;
    group.add(m);
  };

  addM(terrazzoBag.merge(), kit.deep.terrazzo, 'crossingTerrazzo');
  addM(stainlessBag.merge(), stainlessMat, 'crossingStainless');
  if (inlayParts.length > 0) {
    const mergedInlay = mergeGeometries(inlayParts, false)!;
    for (const p of inlayParts) p.dispose();
    addM(mergedInlay, inlayMat, 'crossingInlay', true);
  }
  addM(slabBodyBag.merge(), slabBodyMat, 'crossingSlabBody');
  addM(benchStoneBag.merge(), kit.deep.honedLimestone, 'crossingBenches');
  if (benchGlowParts.length > 0) {
    const mergedGlow = mergeGeometries(benchGlowParts, false)!;
    for (const p of benchGlowParts) p.dispose();
    addM(mergedGlow, kit.deep.emissive.coveStrip, 'crossingBenchGlow', true);
  }
  group.add(psdBank.group, tracks.group);

  return {
    group,
    psdRows: [psdBank.rows[0]!, psdBank.rows[1]!],
    deepMaterials: [stainlessMat, inlayMat, slabBodyMat, glassPanelMat, ...psdBank.deepMaterials, ...tracks.deepMaterials],
  };
}
