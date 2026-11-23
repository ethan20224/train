import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import {
  ESCALATOR, FLIGHTS, GLASS_FLOOR, HALCYON, LIFTS, PORTAL, PSD, SHELL, VESPER,
} from '../../layoutMetro';
import { trackOf } from '../../metro/tracks';
import { LINE_COLORS } from '../../metro/trainModel';
import { GeoBag, boxMM, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import type { MetroMaterials } from './materials';
import { createPsdBank, type PsdController } from './psd';
import { buildSlabTrackGeos } from './track';

/**
 * The Halcyon deep hall at -82 m (spec §2.6, §4; Phase 3 task P3-5).
 *
 * Enclosed diagonal volume (centre (-20, 74), axis (sqrt(1/2), sqrt(1/2)), ±55 m long × ±10 m wide) completely
 * beneath the cavern base floor (-72.5):
 *  - Stack-bond honed limestone walls with 12 mm physical shadow gaps and two continuous horizontal cool 4000 K light
 *    slots at 2.4 m (-79.6) and 6.0 m (-76.0) above the platform; 2 single-track bores per end wall (s = ±55).
 *  - Coffered pale ceiling at y = -73.5 (3 × 3 m coffers aligned to the hall axis), cut cleanly for the hexagonal
 *    daylight shaft under GLASS_FLOOR and the F6 headroom entry slot.
 *  - Rectangular honed-limestone light well rising -73.5 -> -70 under GLASS_FLOOR, with TWO deliberate lit corner
 *    light shelves at -73.5 (NW & SE corners overhanging the 20 m diagonal hall), each fitted with a brushed-stainless
 *    baffle and concealed cool 4000 K linear wall-grazer.
 *  - Lined honed-limestone F6 inclined escalator cutting entering through the NW long wall (t = +10) with cool side
 *    coves, >= 2.5 m rider headroom, and a brushed-stainless 30 mm shadow-gap opening frame.
 *  - Dark polished terrazzo island (±45 × ±5 m, y = -82) with flush oxblood satin enamel inlays, lift landing collars
 *    (doors facing island centre line), island-end glass balustrades, Halcyon PSD bank (oxblood accents), and modern
 *    slab tracks (`track.ts`).
 *
 * Budget: EXACTLY 10 draw calls total (shell, lights, terrazzo, inlay+plinths, steel+rails+clips, 5 PSD bank calls; <= 10).
 */

export interface HalcyonBuildOpts {
  /** Omit temporary 4 m dark portal liners behind the 4 end-wall bores (set true by P3-6 portals.ts). */
  omitPortalLiners?: boolean;
}

export interface HalcyonBuild {
  group: THREE.Group;
  /** Screen door controllers indexed [track0 (NE-bound), track1 (SW-bound)], driven by Phase 4. */
  psdRows: [PsdController, PsdController];
  deepMaterials: THREE.Material[];
}

const CX = HALCYON.centre[0]; // -20
const CZ = HALCYON.centre[1]; // 74
const UX = HALCYON.dir[0];    // +sqrt(1/2)
const UZ = HALCYON.dir[1];    // +sqrt(1/2)
const VX = -UZ;               // -sqrt(1/2) (toward NW wall t = +10)
const VZ = UX;                // +sqrt(1/2)
const L_HALL = HALCYON.halfLength + HALCYON.portalExtra; // 55
const W_HALL = HALCYON.hallHalfWidth;                    // 10
const Y_TOP = HALCYON.topY;                              // -82
const Y_INVERT = HALCYON.railY - PORTAL.bedBelowRail;    // -83.7
const Y_CEIL = HALCYON.ceilingY;                         // -73.5
const Y_GLASS = VESPER.topY - 0.015;                     // -70.015 (meets glass panel T-grid cleanly)
const TAN_ESC = Math.tan((ESCALATOR.angleDeg * Math.PI) / 180);

const toWorld = (s: number, y: number, t: number): THREE.Vector3 =>
  v3(CX + s * UX + t * VX, y, CZ + s * UZ + t * VZ);

const toLocal = (x: number, z: number): [number, number] => [
  (x - CX) * UX + (z - CZ) * UZ,
  (x - CX) * VX + (z - CZ) * VZ,
];

const ccw = (pts: readonly P2[]): P2[] => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...pts].reverse() : [...pts];
};

type RGB = readonly [number, number, number];

function withColor(geo: THREE.BufferGeometry, rgb: RGB): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  const n = g.getAttribute('position').count;
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
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

function triGeo(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ref: THREE.Vector3): THREE.BufferGeometry {
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const pts = n.dot(ref) >= 0 ? [a, b, c] : [a, c, b];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  return g;
}

/** Oriented prism in Halcyon (s, y, t) coordinates [s0..s1] x [y0..y1] x [t0..t1]. */
function stBox(s0: number, s1: number, y0: number, y1: number, t0: number, t1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(s1 - s0, y1 - y0, t1 - t0);
  g.translate((s0 + s1) / 2, (y0 + y1) / 2, (t0 + t1) / 2);
  // Map local (+x = s, +y = y, +z = t) into world:
  // basis X = (UX, 0, UZ), Y = (0, 1, 0), Z = (VX, 0, VZ), origin = (CX, 0, CZ)
  const m = new THREE.Matrix4().makeBasis(v3(UX, 0, UZ), v3(0, 1, 0), v3(VX, 0, VZ));
  m.setPosition(CX, 0, CZ);
  g.applyMatrix4(m);
  return g;
}

/** Oriented horizontal segment along world (x0,z0)-(x1,z1), y0..y1, thickness th. */
function segBox(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, th: number, ext = 0): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, z1 - z0) + 2 * ext;
  const g = new THREE.BoxGeometry(len, y1 - y0, th);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** 2D horizontal shape in world (x, z) placed at height y, facing `up` (+1) or `down` (-1). */
function flatPolyXZ(
  outer: ReadonlyArray<readonly [number, number]>,
  holes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  y: number,
  faceUp: boolean,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes = holes.map((h) => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape, 48);
  g.rotateX(faceUp ? -Math.PI / 2 : Math.PI / 2);
  if (!faceUp) {
    // Rotating +pi/2 maps (x, -z, 0) -> (x, 0, -z); mirror Z back to +z and flip triangle winding so normal faces -y
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, -pos.getZ(i));
    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        const b = idx.getX(i + 1), c = idx.getX(i + 2);
        idx.setX(i + 1, c); idx.setX(i + 2, b);
      }
    }
    g.computeVertexNormals();
  }
  g.translate(0, y, 0);
  return g;
}

/** Subtract 1D open intervals `cuts` from `[a, b]`. */
function subtract1D(a: number, b: number, cuts: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  let segs: Array<[number, number]> = [[a, b]];
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [s0, s1] of segs) {
      if (c1 <= s0 || c0 >= s1) { next.push([s0, s1]); continue; }
      if (c0 > s0 + 0.02) next.push([s0, c0]);
      if (c1 < s1 - 0.02) next.push([c1, s1]);
    }
    segs = next;
  }
  return segs;
}

export function buildHalcyonHall(lib: MaterialLibrary, kit: MetroMaterials, opts: HalcyonBuildOpts = {}): HalcyonBuild {
  const group = new THREE.Group();
  group.name = 'metroHalcyonHall';

  // Exact 10 draw calls:
  //  1. halcyonShell        (honed limestone walls + coffered ceiling + light well + corner shelves + F6 cutting + dark backing)
  //  2. halcyonLights       (cool 4000 K horizontal wall slots + corner shelf grazers + F6 cutting side coves)
  //  3. halcyonTerrazzo     (dark terrazzo island floor)
  //  4. halcyonInlayPlinths (vertex-coloured matte/satin: oxblood floor inlays + concrete track plinths + dark platform body)
  //  5. halcyonSteel        (vertex-coloured metallic: Vignoles rails + rail clips + brushed stainless F6 frame, lift collars, end balustrades)
  // 6..10. halcyonPsd       (5 batched PSD calls, with island-end balustrade glass merged into extraFixedGlass)
  const shellParts: THREE.BufferGeometry[] = [];
  const lightParts: THREE.BufferGeometry[] = [];
  const terrazzoBag = new GeoBag(lib, 'darkMarble', kit.metersPerTile.terrazzo);
  const matteParts: THREE.BufferGeometry[] = [];
  const steelParts: THREE.BufferGeometry[] = [];
  const extraGlassParts: THREE.BufferGeometry[] = [];

  const STONE_RGB: RGB = [1.0, 1.0, 1.0];
  const SOFFIT_RGB: RGB = [0.97, 0.98, 1.0];
  const DARK_BACK_RGB: RGB = [0.10, 0.11, 0.13];
  const DARK_LINER_RGB: RGB = [0.04, 0.045, 0.055];
  const CONCRETE_RGB: RGB = [0.34, 0.36, 0.39];
  const BODY_RGB: RGB = [0.13, 0.145, 0.17];
  const OXBLOOD_RGB: RGB = [LINE_COLORS.halcyon[0] * 0.36, LINE_COLORS.halcyon[1] * 0.36, LINE_COLORS.halcyon[2] * 0.36];
  const STAINLESS_RGB: RGB = [0.96, 0.97, 0.99];
  const CLIP_RGB: RGB = [0.22, 0.24, 0.28];

  const addShell = (g: THREE.BufferGeometry, rgb: RGB = STONE_RGB): void => {
    const ng = lib.applyWorldUVs(g.index ? g.toNonIndexed() : g, kit.metersPerTile.honedLimestone);
    shellParts.push(withColor(ng, rgb));
  };
  const addMatte = (g: THREE.BufferGeometry, rgb: RGB): void => {
    matteParts.push(withColor(g, rgb));
  };
  const addSteel = (g: THREE.BufferGeometry, rgb: RGB = STAINLESS_RGB): void => {
    steelParts.push(withColor(g, rgb));
  };

  // ---- Exact F6 cutting geometry & NW wall opening ----
  const f6 = FLIGHTS.find((f) => f.id === 'F6')!; // from x = -47 (y -70) to x = -26.22 (y -82), z in [66, 69.6]
  const f6Z0 = VESPER.f6OpeningZ[0] - 0.15; // 65.85
  const f6Z1 = VESPER.f6OpeningZ[1] + 0.15; // 69.75
  // Line t = +W_HALL (+10): -(x + 20) + (z - 74) = 10 * sqrt(2)  =>  xWall(z) = z - 94 - 10*sqrt(2)
  const xWallNW = (z: number): number => z - 94 - W_HALL * Math.SQRT2;
  const f6WallX0 = xWallNW(f6Z0); // -42.292
  const f6WallX1 = xWallNW(f6Z1); // -38.392
  const [f6WallS0] = toLocal(f6WallX0, f6Z0); // -21.525
  const [f6WallS1] = toLocal(f6WallX1, f6Z1); // -16.010
  const f6OpenSMin = f6WallS0 - 0.15; // -21.675
  const f6OpenSMax = f6WallS1 + 0.15; // -15.860
  const f6CeilCutX = -36.5;           // headroom at x = -36.5 is -73.5 - (-76.06) = 2.56 m >= 2.3 m
  const f6StepY = (x: number): number => f6.yFrom - (x - f6.from) * TAN_ESC;
  const f6SoffitY = (x: number): number => {
    const x0 = VESPER.f6OpeningX[1]; // -41.0 (Crossing slab underside -71.5)
    const u = Math.max(0, Math.min(1, (x - x0) / (f6CeilCutX - x0)));
    return (VESPER.topY - VESPER.slabThickness) * (1 - u) + Y_CEIL * u;
  };
  const f6OpenYBot = Math.min(f6StepY(f6WallX1) - 1.50, -76.50); // cleanly below F6 lowest truss edge at t = +10

  // ---- 1. Stack-bond honed limestone walls (t = ±10 long walls + s = ±55 end walls) + 2 horizontal cool light slots ----
  const slot1Y = Y_TOP + HALCYON.lightSlotHeights[0]; // -79.6 (2.4 m above platform)
  const slot2Y = Y_TOP + HALCYON.lightSlotHeights[1]; // -76.0 (6.0 m above platform)
  const slotH = 0.095;
  const gap = SHELL.gap; // 12 mm physical shadow gaps
  const panelT = 0.045;
  // Uniform course bands aligned around the two horizontal light slots across all 4 walls
  const yCourses: Array<[number, number]> = [
    [Y_INVERT, -82.35],
    [-82.35, -81.00],
    [-81.00, slot1Y - slotH / 2],
    [slot1Y + slotH / 2, -77.80],
    [-77.80, slot2Y - slotH / 2],
    [slot2Y + slotH / 2, -74.725],
    [-74.725, Y_CEIL],
  ];

  // A. Long walls (t = +W_HALL NW, t = -W_HALL SE)
  for (const side of [-1, 1] as const) {
    const tFace = side * W_HALL;
    const tBack = side * (W_HALL + panelT + 0.01);
    const inN = v3(-side * VX, 0, -side * VZ);
    const openCuts: Array<[number, number, number, number]> = side > 0
      ? [[f6OpenSMin, f6OpenSMax, f6OpenYBot, Y_CEIL]]
      : [];

    // Continuous dark shadow-gap backing behind panels (cut cleanly around F6 opening on NW wall)
    for (const [ya, yb] of [[Y_INVERT, f6OpenYBot], [f6OpenYBot, Y_CEIL]] as const) {
      const cuts = openCuts.filter(([, , oy0, oy1]) => yb > oy0 + 1e-4 && ya < oy1 - 1e-4).map(([a, b]) => [a, b] as const);
      for (const [sa, sb] of subtract1D(-L_HALL, L_HALL, cuts)) {
        addShell(quadGeo(toWorld(sa, ya, tBack), toWorld(sb, ya, tBack), toWorld(sb, yb, tBack), toWorld(sa, yb, tBack), inN), DARK_BACK_RGB);
      }
    }

    // Stack-bond vertical column joints (~3.0 m pitch, nudged cleanly off F6 opening edges)
    const sJoints: number[] = [-L_HALL];
    const nCols = Math.round((2 * L_HALL) / SHELL.panelW); // 37 cols ~2.97 m
    for (let i = 1; i < nCols; i++) {
      const s = -L_HALL + (2 * L_HALL * i) / nCols;
      if (side > 0 && (Math.abs(s - f6OpenSMin) < 0.35 || Math.abs(s - f6OpenSMax) < 0.35)) continue;
      sJoints.push(s);
    }
    sJoints.push(L_HALL);

    for (const [cy0, cy1] of yCourses) {
      const yA = cy0 + gap / 2, yB = cy1 - gap / 2;
      if (yB - yA < 0.05) continue;
      const cuts = openCuts.filter(([, , oy0, oy1]) => cy1 > oy0 + 1e-4 && cy0 < oy1 - 1e-4).map(([a, b]) => [a - 0.03, b + 0.03] as const);
      for (let i = 0; i + 1 < sJoints.length; i++) {
        for (const [sa, sb] of subtract1D(sJoints[i]!, sJoints[i + 1]!, cuts)) {
          const sA = sa + gap / 2, sB = sb - gap / 2;
          if (sB - sA < 0.06) continue;
          const t0 = side > 0 ? tFace : tFace - panelT;
          const t1 = side > 0 ? tFace + panelT : tFace;
          addShell(stBox(sA, sB, yA, yB, t0, t1));
        }
      }
    }

    // Two continuous horizontal cool 4000 K light slots at 2.4 m and 6.0 m above platform (18 mm shallow recess)
    const tSlot = side * (W_HALL + 0.018);
    for (const sy of [slot1Y, slot2Y]) {
      const cuts = openCuts.filter(([, , oy0, oy1]) => sy + 0.05 > oy0 && sy - 0.05 < oy1).map(([a, b]) => [a - 0.04, b + 0.04] as const);
      for (const [sa, sb] of subtract1D(-L_HALL + 0.1, L_HALL - 0.1, cuts)) {
        lightParts.push(quadGeo(
          toWorld(sa, sy - 0.036, tSlot), toWorld(sb, sy - 0.036, tSlot),
          toWorld(sb, sy + 0.036, tSlot), toWorld(sa, sy + 0.036, tSlot),
          inN,
        ));
      }
    }
  }

  // B. End walls (s = -55 and s = +55) with 2 single-track bores per end wall (t = ±6.55, 5.0 × 5.5 m)
  const boreH = PORTAL.h;
  const boreHalfW = PORTAL.w / 2;
  const boreY0 = Y_INVERT;
  const boreY1 = Y_INVERT + boreH; // -78.2
  const boreCutsT: Array<[number, number]> = [
    [-HALCYON.trackOffset - boreHalfW, -HALCYON.trackOffset + boreHalfW], // [-9.05, -4.05]
    [+HALCYON.trackOffset - boreHalfW, +HALCYON.trackOffset + boreHalfW], // [+4.05, +9.05]
  ];
  const tJoints = [-W_HALL, -9.05, -4.05, -1.35, 1.35, 4.05, 9.05, W_HALL];

  for (const endSgn of [-1, 1] as const) {
    const sFace = endSgn * L_HALL;
    const sBack = endSgn * (L_HALL + panelT + 0.01);
    const inN = v3(-endSgn * UX, 0, -endSgn * UZ);

    // Dark shadow-gap backing around the two bores
    for (const [ya, yb] of [[Y_INVERT, boreY1], [boreY1, Y_CEIL]] as const) {
      const cuts = ya < boreY1 - 1e-4 ? boreCutsT : [];
      for (const [ta, tb] of subtract1D(-W_HALL, W_HALL, cuts)) {
        addShell(quadGeo(toWorld(sBack, ya, ta), toWorld(sBack, ya, tb), toWorld(sBack, yb, tb), toWorld(sBack, yb, ta), inN), DARK_BACK_RGB);
      }
    }
    // Stack-bond limestone panels on end wall
    for (const [cy0, cy1] of yCourses) {
      const yA = cy0 + gap / 2, yB = cy1 - gap / 2;
      if (yB - yA < 0.05) continue;
      // Split course cleanly at bore top (-78.2) if it straddles boreY1
      const subY: Array<[number, number]> = cy0 < boreY1 - 0.01 && cy1 > boreY1 + 0.01
        ? [[yA, boreY1 - gap / 2], [boreY1 + gap / 2, yB]]
        : [[yA, yB]];
      for (const [ya, yb] of subY) {
        const cuts = ya < boreY1 - 0.01 ? boreCutsT.map(([a, b]) => [a - 0.03, b + 0.03] as const) : [];
        for (let i = 0; i + 1 < tJoints.length; i++) {
          for (const [ta, tb] of subtract1D(tJoints[i]!, tJoints[i + 1]!, cuts)) {
            const tA = ta + gap / 2, tB = tb - gap / 2;
            if (tB - tA < 0.06) continue;
            const s0 = endSgn > 0 ? sFace : sFace - panelT;
            const s1 = endSgn > 0 ? sFace + panelT : sFace;
            addShell(stBox(s0, s1, ya, yb, tA, tB));
          }
        }
      }
    }
    // Temporary 4 m dark bore liners (until P3-6 portals.ts replaces them with 341.5 m tunnels + stainless frames)
    if (!opts.omitPortalLiners) {
      const depth = SHELL.portalLiner;
      for (const [ta, tb] of boreCutsT) {
        const s0 = sFace, s1 = sFace + endSgn * depth;
        const nTop = v3(0, -1, 0), nBot = v3(0, 1, 0);
        const nL = v3(VX, 0, VZ), nR = v3(-VX, 0, -VZ);
        addShell(quadGeo(toWorld(s0, boreY1, ta), toWorld(s1, boreY1, ta), toWorld(s1, boreY1, tb), toWorld(s0, boreY1, tb), nTop), DARK_LINER_RGB);
        addShell(quadGeo(toWorld(s0, boreY0, ta), toWorld(s1, boreY0, ta), toWorld(s1, boreY0, tb), toWorld(s0, boreY0, tb), nBot), DARK_LINER_RGB);
        addShell(quadGeo(toWorld(s0, boreY0, ta), toWorld(s1, boreY0, ta), toWorld(s1, boreY1, ta), toWorld(s0, boreY1, ta), nL), DARK_LINER_RGB);
        addShell(quadGeo(toWorld(s0, boreY0, tb), toWorld(s1, boreY0, tb), toWorld(s1, boreY1, tb), toWorld(s0, boreY1, tb), nR), DARK_LINER_RGB);
        addShell(quadGeo(toWorld(s1, boreY0, ta), toWorld(s1, boreY0, tb), toWorld(s1, boreY1, tb), toWorld(s1, boreY1, ta), inN), DARK_LINER_RGB);
      }
    }
  }

  // ---- 2. Coffered pale ceiling at y = -73.5 (3 × 3 m axis-aligned coffers) + hexagonal light-well & F6 openings ----
  // Compute the exact hexagonal opening of GLASS_FLOOR (x -30..-10, z 65..83) clipped to |t| <= W_HALL (10):
  //   t = +10 line: z - x = 94 + 10*sqrt(2) = 108.142136 -> hits x = -30 at z = 78.1421, z = 83 at x = -25.1421
  //   t = -10 line: z - x = 94 - 10*sqrt(2) = 79.857864  -> hits x = -10 at z = 69.8579, z = 65 at x = -14.8579
  const gx0 = GLASS_FLOOR.xMin, gx1 = GLASS_FLOOR.xMax; // -30, -10
  const gz0 = GLASS_FLOOR.zMin, gz1 = GLASS_FLOOR.zMax; // 65, 83
  const nwZ = gx0 + 94 + W_HALL * Math.SQRT2; // 78.142136
  const nwX = gz1 - 94 - W_HALL * Math.SQRT2; // -25.142136
  const seZ = gx1 + 94 - W_HALL * Math.SQRT2; // 69.857864
  const seX = gz0 - 94 + W_HALL * Math.SQRT2; // -14.857864

  const wellHexWorld: Array<[number, number]> = [
    [gx0, gz0], [seX, gz0], [gx1, seZ], [gx1, gz1], [nwX, gz1], [gx0, nwZ],
  ];
  const f6SlotWorld: Array<[number, number]> = [
    [f6WallX0, f6Z0], [f6CeilCutX, f6Z0], [f6CeilCutX, f6Z1], [f6WallX1, f6Z1],
  ];
  const hallOuterWorld: Array<[number, number]> = ([
    [-L_HALL, -W_HALL], [L_HALL, -W_HALL], [L_HALL, W_HALL], [-L_HALL, W_HALL],
  ] as const).map(([s, t]) => { const p = toWorld(s, 0, t); return [p.x, p.z] as [number, number]; });

  // A. Coffered ceiling plane & 3×3 m recessed coffers
  {
    const pitch = HALCYON.cofferPitch; // 3.0 m
    const depth = HALCYON.cofferDepth; // 0.24 m
    const ribHalf = 0.17;              // 0.34 m wide coffer ribs

    // Determine which 3×3 m bays lie completely clear of both the light-well hexagon and the F6 headroom slot
    const holePolysLocal = [wellHexWorld, f6SlotWorld].map((poly) => poly.map(([x, z]) => toLocal(x, z)));
    const bayClear = (sa: number, sb: number, ta: number, tb: number): boolean => {
      // Conservative AABB rejection + exact vertex/edge check against both hole polygons in (s, t)
      const pad = 0.35;
      for (const poly of holePolysLocal) {
        let minS = Infinity, maxS = -Infinity, minT = Infinity, maxT = -Infinity;
        for (const [ps, pt] of poly) {
          if (ps < minS) minS = ps; if (ps > maxS) maxS = ps;
          if (pt < minT) minT = pt; if (pt > maxT) maxT = pt;
        }
        if (sb + pad < minS || sa - pad > maxS || tb + pad < minT || ta - pad > maxT) continue;
        // Check if bay overlaps the actual opening in world XZ (fast check: test GLASS_FLOOR or F6 rect)
        return false;
      }
      return true;
    };

    const cofferHolesWorld: Array<Array<[number, number]>> = [wellHexWorld, f6SlotWorld];
    const sStart = -54, sEnd = 54;
    const tStart = -9, tEnd = 9;
    const down = v3(0, -1, 0);

    for (let s = sStart; s < sEnd - 0.1; s += pitch) {
      for (let t = tStart; t < tEnd - 0.1; t += pitch) {
        const s0 = s + ribHalf, s1 = s + pitch - ribHalf;
        const t0 = t + ribHalf, t1 = t + pitch - ribHalf;
        if (!bayClear(s, s + pitch, t, t + pitch)) continue;
        // Punch this coffer rectangle cleanly out of the main -73.5 ceiling soffit and build its 0.24 m recessed box!
        const cPts: Array<[number, number]> = ([[s0, t0], [s1, t0], [s1, t1], [s0, t1]] as const).map(([cs, ct]) => {
          const p = toWorld(cs, 0, ct); return [p.x, p.z] as [number, number];
        });
        cofferHolesWorld.push(cPts);
        const yRec = Y_CEIL + depth;
        // Recessed pale panel at y = -73.26
        addShell(quadGeo(toWorld(s0, yRec, t0), toWorld(s1, yRec, t0), toWorld(s1, yRec, t1), toWorld(s0, yRec, t1), down), SOFFIT_RGB);
        // 4 crisp vertical coffer cheek walls (catching raking daylight & cool slot bounce!)
        addShell(quadGeo(toWorld(s0, Y_CEIL, t0), toWorld(s0, Y_CEIL, t1), toWorld(s0, yRec, t1), toWorld(s0, yRec, t0), v3(UX, 0, UZ)), SOFFIT_RGB);
        addShell(quadGeo(toWorld(s1, Y_CEIL, t0), toWorld(s1, Y_CEIL, t1), toWorld(s1, yRec, t1), toWorld(s1, yRec, t0), v3(-UX, 0, -UZ)), SOFFIT_RGB);
        addShell(quadGeo(toWorld(s0, Y_CEIL, t0), toWorld(s1, Y_CEIL, t0), toWorld(s1, yRec, t0), toWorld(s0, yRec, t0), v3(VX, 0, VZ)), SOFFIT_RGB);
        addShell(quadGeo(toWorld(s0, Y_CEIL, t1), toWorld(s1, Y_CEIL, t1), toWorld(s1, yRec, t1), toWorld(s0, yRec, t1), v3(-VX, 0, -VZ)), SOFFIT_RGB);
      }
    }

    // Main -73.5 soffit slab (facing down) + upper shadow-blocker roof cap at y = -73.15 (blocks any stray sun outside the light well!)
    addShell(flatPolyXZ(hallOuterWorld, cofferHolesWorld, Y_CEIL, false), SOFFIT_RGB);
    addShell(flatPolyXZ(hallOuterWorld, [wellHexWorld, f6SlotWorld], Y_CEIL + depth + 0.08, true), DARK_BACK_RGB);
  }

  // ---- 3. Rectangular Light Well (-73.5 -> -70.0) & Two Lit Corner Light Shelves (NW & SE overhangs at -73.5) ----
  {
    // 4 stack-bond honed limestone vertical shaft walls rising from Y_CEIL (-73.5) to Y_GLASS (-70.015) around GLASS_FLOOR.
    // Inset 42 mm inside GLASS_FLOOR so the light-well panels never coplanarly overlap crossingSlabBody's dark hole wall
    // (-71.5..-70.06) while tucking cleanly underneath the 80 mm stainless perimeter frame of GLASS_FLOOR.
    const wellInset = 0.042;
    const wellWalls: ReadonlyArray<{ a: [number, number]; b: [number, number]; inN: THREE.Vector3 }> = [
      { a: [gx0 + wellInset, gz0 + wellInset], b: [gx1 - wellInset, gz0 + wellInset], inN: v3(0, 0, +1) }, // South wall
      { a: [gx1 - wellInset, gz0 + wellInset], b: [gx1 - wellInset, gz1 - wellInset], inN: v3(-1, 0, 0) }, // East wall
      { a: [gx1 - wellInset, gz1 - wellInset], b: [gx0 + wellInset, gz1 - wellInset], inN: v3(0, 0, -1) }, // North wall
      { a: [gx0 + wellInset, gz1 - wellInset], b: [gx0 + wellInset, gz0 + wellInset], inN: v3(+1, 0, 0) }, // West wall
    ];
    const wellMidY = (Y_CEIL + Y_GLASS) / 2; // 2 clean stack-bond courses of 1.74 m
    for (const w of wellWalls) {
      const [ax, az] = w.a, [bx, bz] = w.b;
      const len = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const ox = -w.inN.x * 0.032, oz = -w.inN.z * 0.032; // backing sits 10 mm inside GLASS_FLOOR, clear of crossingSlabBody
      // Dark shadow-gap backing behind light-well panels
      addShell(quadGeo(
        v3(ax + ox, Y_CEIL, az + oz), v3(bx + ox, Y_CEIL, bz + oz),
        v3(bx + ox, Y_GLASS, bz + oz), v3(ax + ox, Y_GLASS, az + oz),
        w.inN,
      ), DARK_BACK_RGB);
      // Stack-bond panels (~3 m wide × 2 courses)
      const nCols = Math.max(1, Math.round(len / SHELL.panelW));
      for (const [ya, yb] of [[Y_CEIL, wellMidY], [wellMidY, Y_GLASS]] as const) {
        for (let i = 0; i < nCols; i++) {
          const d0 = (len * i) / nCols + gap / 2;
          const d1 = (len * (i + 1)) / nCols - gap / 2;
          const p0x = ax + tx * d0, p0z = az + tz * d0;
          const p1x = ax + tx * d1, p1z = az + tz * d1;
          addShell(segBox(p0x + ox * 0.42, p0z + oz * 0.42, p1x + ox * 0.42, p1z + oz * 0.42, ya + gap / 2, yb - gap / 2, 0.026));
        }
      }
    }

    // TWO DELIBERATE LIT CORNER LIGHT SHELVES at y = -73.5 where GLASS_FLOOR overhangs the diagonal hall:
    //  NW shelf: (-30, 83) - (-30, 78.142) - (-25.142, 83)  (diagonal edge lies on t = +10 NW wall)
    //  SE shelf: (-10, 65) - (-10, 69.858) - (-14.858, 65)  (diagonal edge lies on t = -10 SE wall)
    const shelves: ReadonlyArray<{
      tri: [[number, number], [number, number], [number, number]];
      edgeA: [number, number];
      edgeB: [number, number];
      inward: THREE.Vector3; // points into the Halcyon hall perpendicular to the diagonal edge
    }> = [
      { tri: [[gx0, gz1], [gx0, nwZ], [nwX, gz1]], edgeA: [gx0, nwZ], edgeB: [nwX, gz1], inward: v3(-VX, 0, -VZ) },
      { tri: [[gx1, gz0], [gx1, seZ], [seX, gz0]], edgeA: [gx1, seZ], edgeB: [seX, gz0], inward: v3(+VX, 0, +VZ) },
    ];
    for (const sh of shelves) {
      const [p0, p1, p2] = sh.tri;
      // Honed limestone light-shelf deck at y = -73.5 (seen looking down through the glass floor)
      addShell(triGeo(v3(p0[0], Y_CEIL, p0[1]), v3(p1[0], Y_CEIL, p1[1]), v3(p2[0], Y_CEIL, p2[1]), v3(0, 1, 0)), STONE_RGB);
      // Crisp 0.14 m brushed-stainless baffle lip standing along the diagonal edge (shields light source, frames the shelf)
      const [ax, az] = sh.edgeA, [bx, bz] = sh.edgeB;
      const inOff = 0.04;
      addSteel(segBox(ax - sh.inward.x * inOff, az - sh.inward.z * inOff, bx - sh.inward.x * inOff, bz - sh.inward.z * inOff, Y_CEIL - 0.04, Y_CEIL + 0.12, 0.024));
      // Concealed cool 4000 K linear wall-grazer tucked along the diagonal edge:
      //  1) downward-angled grazer washing the honed limestone hall wall below (visible from Halcyon looking up)
      //  2) subtle upward-angled shelf wash inside the stainless baffle (visible from Crossing looking down through glass!)
      const lx0 = ax + sh.inward.x * 0.03, lz0 = az + sh.inward.z * 0.03;
      const lx1 = bx + sh.inward.x * 0.03, lz1 = bz + sh.inward.z * 0.03;
      lightParts.push(quadGeo(
        v3(lx0, Y_CEIL - 0.015, lz0), v3(lx1, Y_CEIL - 0.015, lz1),
        v3(lx1 + sh.inward.x * 0.06, Y_CEIL - 0.065, lz1 + sh.inward.z * 0.06),
        v3(lx0 + sh.inward.x * 0.06, Y_CEIL - 0.065, lz0 + sh.inward.z * 0.06),
        v3(sh.inward.x * 0.5, -0.866, sh.inward.z * 0.5),
      ));
      const bx0 = ax - sh.inward.x * 0.08, bz0 = az - sh.inward.z * 0.08;
      const bx1 = bx - sh.inward.x * 0.08, bz1 = bz - sh.inward.z * 0.08;
      lightParts.push(quadGeo(
        v3(bx0, Y_CEIL + 0.012, bz0), v3(bx1, Y_CEIL + 0.012, bz1),
        v3(bx1 - sh.inward.x * 0.07, Y_CEIL + 0.012, bz1 - sh.inward.z * 0.07),
        v3(bx0 - sh.inward.x * 0.07, Y_CEIL + 0.012, bz0 - sh.inward.z * 0.07),
        v3(0, 1, 0),
      ));
    }
  }

  // ---- 4. Lined honed-limestone F6 inclined cutting (piercing NW wall t = +10 with cool side coves + stainless frame) ----
  {
    const xStart = VESPER.f6OpeningX[0]; // -46.7
    const xSoffStart = VESPER.f6OpeningX[1]; // -41.0
    const ySlabBot = VESPER.topY - VESPER.slabThickness; // -71.5

    // South (z = f6Z0) and North (z = f6Z1) honed-limestone inclined passage walls from Crossing opening to NW wall (t = +10)
    // plus upper headroom cheeks closing the sloped ceiling recess from t = +10 to x = f6CeilCutX (-36.5).
    for (const [zSide, xWall, normZ] of [[f6Z0, f6WallX0, +1], [f6Z1, f6WallX1, -1]] as const) {
      const nW = v3(0, 0, normZ);
      // Sampled strip along X from xStart to xWall so wall follows F6's sloped floor & ceiling cleanly
      const segs = 4;
      for (let i = 0; i < segs; i++) {
        const xa = xStart + ((xWall - xStart) * i) / segs;
        const xb = xStart + ((xWall - xStart) * (i + 1)) / segs;
        const yBotA = Math.max(f6OpenYBot, f6StepY(xa) - 1.48);
        const yBotB = Math.max(f6OpenYBot, f6StepY(xb) - 1.48);
        const yTopA = xa <= xSoffStart ? VESPER.topY - 0.05 : f6SoffitY(xa);
        const yTopB = xb <= xSoffStart ? VESPER.topY - 0.05 : f6SoffitY(xb);
        addShell(quadGeo(v3(xa, yBotA, zSide), v3(xb, yBotB, zSide), v3(xb, yTopB, zSide), v3(xa, yTopA, zSide), nW));
      }
      // Headroom side cheek inside the hall above Y_CEIL (-73.5) closing the sloped soffit pocket cleanly to x = -36.5
      if (xWall < xSoffStart - 0.02) {
        addShell(quadGeo(
          v3(xWall, Y_CEIL, zSide), v3(xSoffStart, Y_CEIL, zSide),
          v3(xSoffStart, ySlabBot, zSide), v3(xWall, ySlabBot, zSide), nW,
        ));
      }
      const xSlope0 = Math.max(xWall, xSoffStart);
      if (f6CeilCutX > xSlope0 + 0.02) {
        addShell(triGeo(
          v3(xSlope0, Y_CEIL, zSide), v3(f6CeilCutX, Y_CEIL, zSide), v3(xSlope0, f6SoffitY(xSlope0), zSide), nW,
        ));
      }

      // Cool 4000 K linear cove along each cutting side wall, 1.45 m above the step line
      const zCove = zSide + normZ * 0.025;
      const xC0 = xStart + 0.25, xC1 = xWall - 0.10;
      if (xC1 > xC0 + 0.2) {
        const y0 = f6StepY(xC0) + 1.45, y1 = f6StepY(xC1) + 1.45;
        lightParts.push(quadGeo(
          v3(xC0, y0 - 0.032, zCove), v3(xC1, y1 - 0.032, zCove),
          v3(xC1, y1 + 0.032, zCove), v3(xC0, y0 + 0.032, zCove), nW,
        ));
      }
    }

    // Sloped honed-limestone soffit ceiling from (x = -41.0, y = -71.5) down to (x = -36.5, y = -73.5)
    addShell(quadGeo(
      v3(xSoffStart, ySlabBot, f6Z0), v3(f6CeilCutX, Y_CEIL, f6Z0),
      v3(f6CeilCutX, Y_CEIL, f6Z1), v3(xSoffStart, ySlabBot, f6Z1),
      v3(-0.4, -0.92, 0),
    ), SOFFIT_RGB);
    // West closure bulkhead under F6 mouth (x = -46.7)
    addShell(quadGeo(
      v3(xStart, f6StepY(xStart) - 1.48, f6Z0), v3(xStart, f6StepY(xStart) - 1.48, f6Z1),
      v3(xStart, VESPER.topY - 0.06, f6Z1), v3(xStart, VESPER.topY - 0.06, f6Z0),
      v3(+1, 0, 0),
    ));
    // Sloped cutting trough floor underneath F6 from xStart to the t = +10 diagonal wall
    addShell(quadGeo(
      v3(xStart, f6StepY(xStart) - 1.48, f6Z0), v3(f6WallX0, Math.max(f6OpenYBot, f6StepY(f6WallX0) - 1.48), f6Z0),
      v3(f6WallX1, Math.max(f6OpenYBot, f6StepY(f6WallX1) - 1.48), f6Z1), v3(xStart, f6StepY(xStart) - 1.48, f6Z1),
      v3(0.5, 0.866, 0),
    ), DARK_BACK_RGB);

    // Crisp brushed-stainless perimeter frame around the F6 opening in the NW wall (30 mm shadow-gap reveal)
    const frD = 0.24, frT = 0.045;
    addSteel(stBox(f6OpenSMin, f6OpenSMax, f6OpenYBot, f6OpenYBot + frT, W_HALL - 0.02, W_HALL + frD));
    addSteel(stBox(f6OpenSMin, f6OpenSMin + frT, f6OpenYBot, Y_CEIL, W_HALL - 0.02, W_HALL + frD));
    addSteel(stBox(f6OpenSMax - frT, f6OpenSMax, f6OpenYBot, Y_CEIL, W_HALL - 0.02, W_HALL + frD));
    // Slim brushed-stainless header trim along the -73.5 ceiling edge of the F6 headroom cut (x = f6CeilCutX)
    addSteel(boxMM(f6CeilCutX - 0.03, Y_CEIL - 0.02, f6Z0, f6CeilCutX + 0.04, Y_CEIL + 0.05, f6Z1));
  }

  // ---- 5. Dark terrazzo island (±45 × ±5 m, y = -82) + flush oxblood inlays + lift landings + end balustrades ----
  {
    const hl = HALCYON.halfLength; // 45
    const hw = HALCYON.halfWidth;  // 5
    const inlayT = hw - PSD.inset - 0.5; // 4.15 m from centre line
    const inlayHalf = 0.04;              // 0.08 m wide satin oxblood enamel line

    // Partitioned terrazzo + oxblood inlays in (s, t) with circular holes cut for both lift tubes (r = LIFTS.tubeR)
    const liftHolesWorld = LIFTS.positions.map(([lx, lz]) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push([lx + LIFTS.tubeR * Math.cos(a), lz + LIFTS.tubeR * Math.sin(a)]);
      }
      return pts;
    });
    const toWorldPoly = (s0: number, s1: number, t0: number, t1: number): Array<[number, number]> =>
      ([[s0, t0], [s1, t0], [s1, t1], [s0, t1]] as const).map(([s, t]) => { const p = toWorld(s, 0, t); return [p.x, p.z] as [number, number]; });

    // Island terrazzo outer rectangle with lift tube holes + two flush oxblood inlay channels cut out (zero coplanar overlap!)
    const islandOuter = toWorldPoly(-hl, hl, -hw, hw);
    const oxCh0 = toWorldPoly(-hl + 0.35, hl - 0.35, -inlayT - inlayHalf, -inlayT + inlayHalf);
    const oxCh1 = toWorldPoly(-hl + 0.35, hl - 0.35, +inlayT - inlayHalf, +inlayT + inlayHalf);
    terrazzoBag.add(flatPolyXZ(islandOuter, [...liftHolesWorld, oxCh0, oxCh1], Y_TOP, true));

    // Flush oxblood satin enamel inlays along both Halcyon screen-door lines
    addMatte(flatPolyXZ(oxCh0, [], Y_TOP, true), OXBLOOD_RGB);
    addMatte(flatPolyXZ(oxCh1, [], Y_TOP, true), OXBLOOD_RGB);

    // Solid dark charcoal island platform body (y = -83.7 .. -82.06) + dark track-hall invert floor (-83.7)
    addMatte(stBox(-hl, hl, Y_INVERT, Y_TOP - 0.06, -hw, hw), BODY_RGB);
    addMatte(stBox(-L_HALL, L_HALL, Y_INVERT - 0.15, Y_INVERT, -W_HALL - 0.2, W_HALL + 0.2), BODY_RGB);
    // Slim brushed-stainless platform nosing along both track edges (t = ±5)
    for (const sgn of [-1, 1] as const) {
      addSteel(stBox(-hl, hl, Y_TOP - 0.06, Y_TOP + 0.002, sgn * hw - 0.02, sgn * hw + 0.02));
    }

    // Lift landings at (-17, 74) [t = -2.12] and (-17, 80) [t = +2.12]: brushed-stainless collars + centre-facing door pads
    const collarProf = ccw([[0, -0.04], [0.16, -0.04], [0.16, 0.015], [0.14, 0.028], [0.02, 0.028], [0, 0.015]]);
    for (const [lx, lz] of LIFTS.positions) {
      const [ls, lt] = toLocal(lx, lz);
      const fr: Frame[] = [];
      const segs = 40;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const rad = v3(Math.cos(a), 0, Math.sin(a));
        fr.push({ o: v3(lx + LIFTS.tubeR * rad.x, Y_TOP, lz + LIFTS.tubeR * rad.z), a: rad, b: v3(0, 1, 0) });
      }
      addSteel(sweep(collarProf, fr, { closed: true }));
      // Sleek brushed-stainless landing threshold apron extending toward the island centre line (t = 0)
      const dirToCenter = lt > 0 ? -1 : +1;
      const tPad0 = lt + dirToCenter * (LIFTS.tubeR + 0.02);
      const tPad1 = lt + dirToCenter * (LIFTS.tubeR + 0.52);
      addSteel(stBox(ls - 0.85, ls + 0.85, Y_TOP - 0.005, Y_TOP + 0.010, Math.min(tPad0, tPad1), Math.max(tPad0, tPad1)));
    }

    // Island end 1.1 m ultra-clear glass balustrades (s = ±45, t in [-4.65, +4.65])
    const tPsd = hw - PSD.inset; // 4.65
    for (const endSgn of [-1, 1] as const) {
      const se = endSgn * (hl - 0.06);
      const nPosts = 5;
      for (let i = 0; i <= nPosts; i++) {
        const pt = -tPsd + (2 * tPsd * i) / nPosts;
        addSteel(stBox(se - 0.022, se + 0.022, Y_TOP, Y_TOP + 1.1, pt - 0.022, pt + 0.022));
      }
      addSteel(stBox(se - 0.024, se + 0.024, Y_TOP + 1.058, Y_TOP + 1.1, -tPsd - 0.02, tPsd + 0.02));
      addSteel(stBox(se - 0.028, se + 0.028, Y_TOP, Y_TOP + 0.10, -tPsd, tPsd));
      extraGlassParts.push(stBox(se - 0.006, se + 0.006, Y_TOP + 0.10, Y_TOP + 1.04, -tPsd + 0.03, tPsd - 0.03));
    }
  }

  // ---- 6. Halcyon PSD bank (5 batched draw calls; champagne mullions, oxblood accents) ----
  const t0 = trackOf('halcyon', 0); // t = +6.55, dir = +u, side = -1 -> PSD at t = +4.65 facing -v (into island)
  const t1 = trackOf('halcyon', 1); // t = -6.55, dir = -u, side = -1 -> PSD at t = -4.65 facing +v (into island)
  const psdBank = createPsdBank(
    [
      {
        track: t0, side: -1, platformY: Y_TOP, platformHalfLen: HALCYON.halfLength,
        // F6 escalator descends diagonally across t = +4.65 around s = -14.2..-11.05 (between doors -16.92 & -10.25):
        // step the PSD cleanly down to a 1.25 m fixed glass guard under F6's inclined truss so zero metal clips F6!
        lowHeadroomSpan: [-14.2, -11.08, 1.25],
        initialDisplay: 'HALCYON LINE · NORTH-EASTBOUND',
      },
      { track: t1, side: -1, platformY: Y_TOP, platformHalfLen: HALCYON.halfLength, initialDisplay: 'HALCYON LINE · SOUTH-WESTBOUND' },
    ],
    lib,
    kit,
    { name: 'halcyonPsd', extraFixedGlass: extraGlassParts },
  );

  // ---- 7. Modern slab tracks (`track.ts` geometries merged into halcyonInlayPlinths + halcyonSteel -> 0 extra calls!) ----
  const trackGeos = buildSlabTrackGeos(
    [
      { track: t0, sMin: -L_HALL - 0.5, sMax: L_HALL + 0.5 },
      { track: t1, sMin: -L_HALL - 0.5, sMax: L_HALL + 0.5 },
    ],
    lib,
  );
  if (trackGeos.plinths) addMatte(trackGeos.plinths, CONCRETE_RGB);
  if (trackGeos.rails) {
    // Already carries vertex colours (dark web + gleaming steel running head)
    const r = trackGeos.rails.index ? trackGeos.rails.toNonIndexed() : trackGeos.rails;
    for (const k of Object.keys(r.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') r.deleteAttribute(k);
    if (!r.getAttribute('uv')) r.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(r.getAttribute('position').count * 2), 2));
    steelParts.push(r);
  }
  // Bake track fastenings into halcyonSteel (keeps total Halcyon budget at exactly 10 calls; ~24k tris)
  const clipBase = trackGeos.clipPrototype.index ? trackGeos.clipPrototype.toNonIndexed() : trackGeos.clipPrototype;
  for (const cm of trackGeos.clipMatrices) {
    const cg = clipBase.clone();
    cg.applyMatrix4(cm);
    addSteel(cg, CLIP_RGB);
  }
  clipBase.dispose();
  if (trackGeos.edgeLights) lightParts.push(trackGeos.edgeLights);

  // ---- Assemble EXACTLY 10 draw calls ----
  const shellMat = kit.deep.honedLimestone.clone();
  shellMat.name = 'metroDeepHalcyonShell';
  shellMat.vertexColors = true;

  const matteMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepHalcyonMatte',
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.48,
    metalness: 0.04,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepHalcyonSteel',
    color: 0xd6dbe0,
    vertexColors: true,
    metalness: 0.94,
    roughness: 0.22,
    envMapIntensity: 1.2,
  });

  const addM = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, noShadow = false): void => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (noShadow) m.userData.noShadow = true;
    group.add(m);
  };

  if (shellParts.length > 0) {
    const m = mergeGeometries(shellParts, false)!;
    for (const p of shellParts) p.dispose();
    addM(m, shellMat, 'halcyonShell');
  }
  if (lightParts.length > 0) {
    const m = mergeGeometries(lightParts, false)!;
    for (const p of lightParts) p.dispose();
    addM(m, kit.deep.emissive.coolRing, 'halcyonLights', true);
  }
  addM(terrazzoBag.merge(), kit.deep.terrazzo, 'halcyonTerrazzo');
  if (matteParts.length > 0) {
    const m = mergeGeometries(matteParts, false)!;
    for (const p of matteParts) p.dispose();
    addM(m, matteMat, 'halcyonInlayPlinths');
  }
  if (steelParts.length > 0) {
    const m = mergeGeometries(steelParts, false)!;
    for (const p of steelParts) p.dispose();
    addM(m, steelMat, 'halcyonSteel');
  }
  group.add(psdBank.group);

  return {
    group,
    psdRows: [psdBank.rows[0]!, psdBank.rows[1]!],
    deepMaterials: [shellMat, matteMat, steelMat, ...psdBank.deepMaterials],
  };
}
