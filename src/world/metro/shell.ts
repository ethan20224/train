import * as THREE from 'three';
import type { MaterialLibrary } from '../../core/types';
import {
  CAVERN, CROSS_OUTLINE, DISC, MAP_WALL, MERIDIAN, OCULUS, PORTAL, SHELL, SKY, VESPER, WATER_WALL,
} from '../../layoutMetro';
import { GeoBag, rng, v3, type P2 } from '../concourse/geo';
import { installSensingHalo } from './halo';
import type { MetroMaterials } from './materials';

/**
 * Monolith cavern shell and base floor (spec §2.5, §4; Phase 3 task P3-1).
 *
 * Builds the 16-segment cross-plan perimeter (12 walls + 4 chamfered re-entrant corners) standing on the base floor
 * (y = -72.5) up to the sky reveal (y = -32.0). Honed pale limestone panels sit on a calm stack-bond grid (3.0 m wide
 * x 1.525 m high = 26 uniform courses aligned across every corner), with 12 mm physical shadow gaps over a dark backing,
 * a 0.45 m recessed plinth, a 0.4 m cool-lit sky reveal so the sky floats, vertical 0.12 m flush light slots at 12 m
 * pitch on the long walls, 30 mm shadow-gap reveals + 4 m dark liners behind all 8 cavern bores, a black polished
 * granite west wall (water-wall zone), and a dark terrazzo base floor with flush brushed-stainless 3 m division strips.
 *
 * Budget: 6 draw calls total (limestone, granite, terrazzo, stainless, cool lights, portal liners).
 */

const SHELL_DETAIL = {
  /** Eased arris width and step-back on every limestone panel face (reads crisp without long-range shimmer). */
  bevelW: 0.024,
  bevelD: 0.010,
  /** Flush recessed channel depth and diffuser width inside each 0.12 m vertical light slot (visible at oblique angles). */
  slotDepth: 0.022,
  slotStripW: 0.092,
  slotStripDepth: 0.016,
  /** Continuous cool light strip tucked inside the 0.4 m sky reveal (both upper back wall and downward-facing soffit). */
  revealStripY0: SKY.y - SHELL.reveal + 0.12,
  revealStripY1: SKY.y - 0.02,
  revealStripSoffitD0: 0.045,
  revealStripBackD: SHELL.revealSetback - 0.015,
  /** Base floor apron tucked beneath the 0.30 m recessed plinth so no corner ever leaks light. */
  apronOut: SHELL.plinthRecess + 0.05,
  /** Terrazzo pit floor under the Sinking Floor disc well at (0, 74). */
  discPitR: DISC.wellR + 0.3,
  /** Subtle Ando stone tone variation and vertex shading for recessed joints/plinths. */
  panelToneMin: 0.93,
  panelToneSpan: 0.09,
  bevelShade: 0.93,
  returnShade: 0.45,
  backingShade: 0.6,
  plinthShade: 0.72,
  revealWallShade: 0.38,
  /** Map-wall architectural recess depth on the south end wall. */
  mapRecessDepth: 0.18,
} as const;

export interface CavernShellOpts {
  /** P3-7 replaces the east end wall onyx zone (y = -72.5..-34.0) with backlit book-matched onyx. */
  omitOnyxZone?: boolean;
  /** P3-6 replaces the 4 m temporary dark liners with full horseshoe tunnels. */
  omitPortalLiners?: boolean;
}

export interface CavernShellBuild {
  group: THREE.Group;
  /** Custom deep materials owned by the shell (to register alongside kit.deepList in metro.userData.deepMaterials). */
  deepMaterials: THREE.Material[];
}

interface WallOpening {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  kind: 'bore' | 'map' | 'slot';
}

interface WallSeg {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Length in metres. */
  len: number;
  /** Unit tangent along the wall (x, z). */
  tx: number;
  tz: number;
  /** Unit inward normal pointing into the cavern (x, z). */
  nx: number;
  nz: number;
  /** Outward normal = -inward. */
  ox: number;
  oz: number;
  isChamfer: boolean;
  role: 'arm' | 'chamfer' | 'south' | 'north' | 'west' | 'east';
  /** Mitered vertex offsets at u = 0 and u = len for any outward distance d. */
  miter0: (d: number) => [number, number];
  miter1: (d: number) => [number, number];
}

// ---------------------------------------------------------------------------------------------
// geometry soup with vertex colours + world-scale UVs
// ---------------------------------------------------------------------------------------------
class ColorSoup {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly uv: number[] = [];

  tri(
    p: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3],
    c: readonly [number, number, number],
    t: readonly [P2, P2, P2],
    ref: THREE.Vector3,
  ): void {
    const a = p[0], b = p[1], d = p[2];
    const n = b.clone().sub(a).cross(d.clone().sub(a));
    const o: readonly [number, number, number] = n.dot(ref) >= 0 ? [0, 1, 2] : [0, 2, 1];
    for (const k of o) {
      const q = p[k]!, tt = t[k]!;
      this.pos.push(q.x, q.y, q.z);
      this.col.push(c[0], c[1], c[2]);
      this.uv.push(tt[0], tt[1]);
    }
  }

  quad(
    p: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
    c: readonly [number, number, number],
    t: readonly [P2, P2, P2, P2],
    ref: THREE.Vector3,
  ): void {
    this.tri([p[0], p[1], p[2]], c, [t[0], t[1], t[2]], ref);
    this.tri([p[0], p[2], p[3]], c, [t[0], t[2], t[3]], ref);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

/** Plain quad helper for GeoBag (position only; GeoBag computes normals and world UVs). */
function quadGeo(
  a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ref: THREE.Vector3,
): THREE.BufferGeometry {
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const pts = n.dot(ref) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// 2D rectangle subtraction: subtract `cuts` from rect [u0, u1] x [y0, y1]
// ---------------------------------------------------------------------------------------------
interface Rect2D { u0: number; u1: number; y0: number; y1: number }

function subtractRects(base: Rect2D, cuts: readonly Rect2D[]): Rect2D[] {
  let rects: Rect2D[] = [base];
  const EPS = 1e-4;
  for (const c of cuts) {
    const next: Rect2D[] = [];
    for (const r of rects) {
      if (c.u1 <= r.u0 + EPS || c.u0 >= r.u1 - EPS || c.y1 <= r.y0 + EPS || c.y0 >= r.y1 - EPS) {
        next.push(r);
        continue;
      }
      const cu0 = Math.max(r.u0, c.u0), cu1 = Math.min(r.u1, c.u1);
      const cy0 = Math.max(r.y0, c.y0), cy1 = Math.min(r.y1, c.y1);
      if (cu0 > r.u0 + EPS) next.push({ u0: r.u0, u1: cu0, y0: r.y0, y1: r.y1 });
      if (cu1 < r.u1 - EPS) next.push({ u0: cu1, u1: r.u1, y0: r.y0, y1: r.y1 });
      if (cy0 > r.y0 + EPS) next.push({ u0: cu0, u1: cu1, y0: r.y0, y1: cy0 });
      if (cy1 < r.y1 - EPS) next.push({ u0: cu0, u1: cu1, y0: cy1, y1: r.y1 });
    }
    rects = next;
  }
  return rects.filter((r) => r.u1 - r.u0 > 0.01 && r.y1 - r.y0 > 0.01);
}

// ---------------------------------------------------------------------------------------------
// cross outline with 45-degree re-entrant chamfers & exact mitered offsets
// ---------------------------------------------------------------------------------------------
function buildWallSegments(): WallSeg[] {
  const nRaw = CROSS_OUTLINE.length;
  const verts: Array<{ x: number; z: number; fromChamfer: boolean }> = [];
  for (let i = 0; i < nRaw; i++) {
    const prev = CROSS_OUTLINE[(i - 1 + nRaw) % nRaw]!;
    const cur = CROSS_OUTLINE[i]!;
    const next = CROSS_OUTLINE[(i + 1) % nRaw]!;
    const pLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const nLen = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const px = (cur[0] - prev[0]) / pLen, pz = (cur[1] - prev[1]) / pLen;
    const nx = (next[0] - cur[0]) / nLen, nz = (next[1] - cur[1]) / nLen;
    // With inward = (-tz, tx), a right turn (cross < 0) is a re-entrant 270-degree corner.
    const cross = px * nz - pz * nx;
    if (cross < -0.5) {
      verts.push({ x: cur[0] - px * SHELL.chamfer, z: cur[1] - pz * SHELL.chamfer, fromChamfer: true });
      verts.push({ x: cur[0] + nx * SHELL.chamfer, z: cur[1] + nz * SHELL.chamfer, fromChamfer: false });
    } else {
      verts.push({ x: cur[0], z: cur[1], fromChamfer: false });
    }
  }

  const m = verts.length;
  const outNormals: Array<[number, number]> = [];
  for (let i = 0; i < m; i++) {
    const a = verts[i]!, b = verts[(i + 1) % m]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
    // inward = (-tz, tx) => outward = (tz, -tx)
    outNormals.push([tz, -tx]);
  }
  const miterAt = (idx: number): ((d: number) => [number, number]) => {
    const v = verts[idx]!;
    const [n0x, n0z] = outNormals[(idx - 1 + m) % m]!;
    const [n1x, n1z] = outNormals[idx]!;
    const denom = 1 + n0x * n1x + n0z * n1z;
    const sx = (n0x + n1x) / denom, sz = (n0z + n1z) / denom;
    return (d: number): [number, number] => [v.x + d * sx, v.z + d * sz];
  };

  const segs: WallSeg[] = [];
  for (let i = 0; i < m; i++) {
    const a = verts[i]!, b = verts[(i + 1) % m]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
    const nx = -tz, nz = tx;
    const isChamfer = Math.abs(tx) > 0.1 && Math.abs(tz) > 0.1;
    let role: WallSeg['role'] = 'arm';
    if (isChamfer) role = 'chamfer';
    else if (Math.abs(a.z - CAVERN.nave.zMin) < 0.01 && Math.abs(b.z - CAVERN.nave.zMin) < 0.01) role = 'south';
    else if (Math.abs(a.z - CAVERN.nave.zMax) < 0.01 && Math.abs(b.z - CAVERN.nave.zMax) < 0.01) role = 'north';
    else if (Math.abs(a.x - CAVERN.transept.xMin) < 0.01 && Math.abs(b.x - CAVERN.transept.xMin) < 0.01) role = 'west';
    else if (Math.abs(a.x - CAVERN.transept.xMax) < 0.01 && Math.abs(b.x - CAVERN.transept.xMax) < 0.01) role = 'east';
    segs.push({
      x0: a.x, z0: a.z, x1: b.x, z1: b.z, len, tx, tz, nx, nz, ox: -nx, oz: -nz,
      isChamfer, role, miter0: miterAt(i), miter1: miterAt((i + 1) % m),
    });
  }
  return segs;
}

/** Centred vertical joint positions along [0, len], ensuring equal end panels >= panelW/2, snapped off opening edges. */
function computeVerticalJoints(len: number, openings: readonly WallOpening[]): number[] {
  const pw = SHELL.panelW;
  const half = len / 2;
  if (len <= pw + 0.01) return [0, len];
  // Prefer centre-as-joint if the remainder end panel is >= pw/2; otherwise centre-as-panel-middle.
  const kJoint = Math.floor((half - 1e-4) / pw);
  const remJoint = half - kJoint * pw;
  const useCentreJoint = remJoint >= pw * 0.5 - 1e-4;
  const raw: number[] = [];
  if (useCentreJoint) {
    for (let k = -kJoint; k <= kJoint; k++) raw.push(half + k * pw);
  } else {
    const kMid = Math.floor((half - pw * 0.5 - 1e-4) / pw);
    for (let k = -kMid; k <= kMid + 1; k++) {
      const u = half + (k - 0.5) * pw;
      if (u > 0.01 && u < len - 0.01) raw.push(u);
    }
  }
  // No vertical joint may fall within minOpeningJointClear (0.3 m) of an opening edge: snap to that edge.
  const snapped = raw.map((u) => {
    for (const op of openings) {
      if (op.kind === 'slot') continue;
      if (Math.abs(u - op.u0) > 1e-4 && Math.abs(u - op.u0) < SHELL.minOpeningJointClear) return op.u0;
      if (Math.abs(u - op.u1) > 1e-4 && Math.abs(u - op.u1) < SHELL.minOpeningJointClear) return op.u1;
    }
    return u;
  });
  const all = [0, ...snapped.filter((u) => u > 0.01 && u < len - 0.01), len].sort((a, b) => a - b);
  const dedup: number[] = [];
  for (const u of all) if (dedup.length === 0 || u - dedup[dedup.length - 1]! > 0.01) dedup.push(u);
  return dedup;
}

/** Vertical light slot centres along the long arm walls only (Ruling 38: no slots on the four 40 m end walls). */
function computeLightSlots(seg: WallSeg, openings: readonly WallOpening[]): number[] {
  if (seg.role !== 'arm' || seg.len < SHELL.slotMinWallLen) return [];
  const half = seg.len / 2;
  const pitch = SHELL.panelW * SHELL.slotJointStride; // 12 m
  const kMax = Math.floor((half - SHELL.minSlotOpeningClear) / pitch);
  const out: number[] = [];
  for (let k = -kMax; k <= kMax; k++) {
    const u = half + k * pitch;
    if (u < SHELL.minSlotOpeningClear || seg.len - u < SHELL.minSlotOpeningClear) continue;
    const blocked = openings.some((op) => u > op.u0 - SHELL.minSlotOpeningClear && u < op.u1 + SHELL.minSlotOpeningClear);
    if (!blocked) out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// main builder
// ---------------------------------------------------------------------------------------------
export function buildCavernShell(lib: MaterialLibrary, kit: MetroMaterials, opts: CavernShellOpts = {}): CavernShellBuild {
  const group = new THREE.Group();
  group.name = 'metroCavernShell';
  const rnd = rng(3101);

  const yBase = CAVERN.baseFloorY; // -72.5
  const yPlinthTop = yBase + SHELL.plinthH; // -72.05
  const yRevealBot = SKY.y - SHELL.reveal; // -32.4
  const yRevealTop = SKY.y; // -32.0
  const tileLime = kit.metersPerTile.honedLimestone; // 6.0

  // Horizontal course boundaries (26 uniform courses of 1.525 m, aligned around every corner).
  const courseYs: number[] = [];
  for (let c = 0; c <= SHELL.courses; c++) courseYs.push(yPlinthTop + c * SHELL.courseH);
  courseYs[courseYs.length - 1] = yRevealBot;

  const limeSoup = new ColorSoup();
  const graniteBag = new GeoBag(lib, 'darkMarble', 2.0);
  const terrazzoBag = new GeoBag(lib, 'darkMarble', kit.metersPerTile.terrazzo);
  const stainlessBag = new GeoBag(lib, 'castIron', kit.metersPerTile.stainless);
  const lightsBag = new GeoBag(lib, 'wallStone', 1);
  const linerBag = new GeoBag(lib, 'darkMarble', 2.0);

  const segs = buildWallSegments();

  // ---- Helper: world point on wall segment at (u, y, outward depth d) ----
  const ptOn = (seg: WallSeg, u: number, y: number, d: number): THREE.Vector3 =>
    v3(seg.x0 + seg.tx * u + seg.ox * d, y, seg.z0 + seg.tz * u + seg.oz * d);

  // ---- Helper: add one proud bevelled limestone panel ----
  const addPanel = (
    seg: WallSeg,
    u0: number, u1: number, y0: number, y1: number,
    mLeft: number, mRight: number, mBot: number, mTop: number,
  ): void => {
    const a0 = u0 + mLeft, a1 = u1 - mRight;
    const b0 = y0 + mBot, b1 = y1 - mTop;
    const w = a1 - a0, h = b1 - b0;
    if (w < 0.02 || h < 0.02) return;

    const bw = Math.min(SHELL_DETAIL.bevelW, w * 0.25);
    const bh = Math.min(SHELL_DETAIL.bevelW, h * 0.25);
    const d0 = 0;
    const d1 = SHELL_DETAIL.bevelD;
    const d2 = SHELL.proud;
    const inward = v3(seg.nx, 0, seg.nz);
    const tan = v3(seg.tx, 0, seg.tz);
    const up = v3(0, 1, 0);

    const tone = SHELL_DETAIL.panelToneMin + SHELL_DETAIL.panelToneSpan * rnd();
    const faceCol: [number, number, number] = [tone, tone, tone];
    const bevCol: [number, number, number] = [tone * SHELL_DETAIL.bevelShade, tone * SHELL_DETAIL.bevelShade, tone * SHELL_DETAIL.bevelShade];
    const retCol: [number, number, number] = [tone * SHELL_DETAIL.returnShade, tone * SHELL_DETAIL.returnShade, tone * SHELL_DETAIL.returnShade];
    const uv = (u: number, y: number): P2 => [u / tileLime, y / tileLime];

    const ia0 = a0 + bw, ia1 = a1 - bw, ib0 = b0 + bh, ib1 = b1 - bh;
    // Inner flat honed face
    limeSoup.quad(
      [ptOn(seg, ia0, ib0, d0), ptOn(seg, ia1, ib0, d0), ptOn(seg, ia1, ib1, d0), ptOn(seg, ia0, ib1, d0)],
      faceCol,
      [uv(ia0, ib0), uv(ia1, ib0), uv(ia1, ib1), uv(ia0, ib1)],
      inward,
    );
    // 4 eased arris bevels
    limeSoup.quad(
      [ptOn(seg, a0, b0, d1), ptOn(seg, a1, b0, d1), ptOn(seg, ia1, ib0, d0), ptOn(seg, ia0, ib0, d0)],
      bevCol, [uv(a0, b0), uv(a1, b0), uv(ia1, ib0), uv(ia0, ib0)], inward.clone().addScaledVector(up, -0.4).normalize(),
    );
    limeSoup.quad(
      [ptOn(seg, ia0, ib1, d0), ptOn(seg, ia1, ib1, d0), ptOn(seg, a1, b1, d1), ptOn(seg, a0, b1, d1)],
      bevCol, [uv(ia0, ib1), uv(ia1, ib1), uv(a1, b1), uv(a0, b1)], inward.clone().addScaledVector(up, 0.4).normalize(),
    );
    limeSoup.quad(
      [ptOn(seg, a0, b0, d1), ptOn(seg, ia0, ib0, d0), ptOn(seg, ia0, ib1, d0), ptOn(seg, a0, b1, d1)],
      bevCol, [uv(a0, b0), uv(ia0, ib0), uv(ia0, ib1), uv(a0, b1)], inward.clone().addScaledVector(tan, -0.4).normalize(),
    );
    limeSoup.quad(
      [ptOn(seg, ia1, ib0, d0), ptOn(seg, a1, b0, d1), ptOn(seg, a1, b1, d1), ptOn(seg, ia1, ib1, d0)],
      bevCol, [uv(ia1, ib0), uv(a1, b0), uv(a1, b1), uv(ia1, ib1)], inward.clone().addScaledVector(tan, 0.4).normalize(),
    );
    // 4 shadow-gap returns back to backing plane (d2 = 0.05 m)
    limeSoup.quad(
      [ptOn(seg, a0, b0, d2), ptOn(seg, a1, b0, d2), ptOn(seg, a1, b0, d1), ptOn(seg, a0, b0, d1)],
      retCol, [uv(a0, b0), uv(a1, b0), uv(a1, b0 + 0.04), uv(a0, b0 + 0.04)], v3(0, -1, 0),
    );
    limeSoup.quad(
      [ptOn(seg, a0, b1, d1), ptOn(seg, a1, b1, d1), ptOn(seg, a1, b1, d2), ptOn(seg, a0, b1, d2)],
      retCol, [uv(a0, b1), uv(a1, b1), uv(a1, b1 + 0.04), uv(a0, b1 + 0.04)], up,
    );
    limeSoup.quad(
      [ptOn(seg, a0, b0, d2), ptOn(seg, a0, b0, d1), ptOn(seg, a0, b1, d1), ptOn(seg, a0, b1, d2)],
      retCol, [uv(a0, b0), uv(a0 + 0.04, b0), uv(a0 + 0.04, b1), uv(a0, b1)], tan.clone().negate(),
    );
    limeSoup.quad(
      [ptOn(seg, a1, b0, d1), ptOn(seg, a1, b0, d2), ptOn(seg, a1, b1, d2), ptOn(seg, a1, b1, d1)],
      retCol, [uv(a1, b0), uv(a1 + 0.04, b0), uv(a1 + 0.04, b1), uv(a1, b1)], tan,
    );
  };

  // ---- Build every wall segment ----
  for (const seg of segs) {
    const inward = v3(seg.nx, 0, seg.nz);
    const tan = v3(seg.tx, 0, seg.tz);
    const up = v3(0, 1, 0);
    const down = v3(0, -1, 0);

    // 1. Collect openings on this wall (bores + map wall recess).
    const openings: WallOpening[] = [];
    const addBore = (centerU: number, railY: number): void => {
      const y0 = railY - PORTAL.bedBelowRail;
      const y1 = y0 + PORTAL.h;
      openings.push({ u0: centerU - PORTAL.w / 2, u1: centerU + PORTAL.w / 2, y0, y1, kind: 'bore' });
    };
    if (seg.role === 'south') {
      // u = x + 20
      for (const tx of MERIDIAN.trackX) addBore(tx + 20, MERIDIAN.railY);
      openings.push({ u0: 0, u1: seg.len, y0: MAP_WALL.yMin, y1: MAP_WALL.yMax, kind: 'map' });
    } else if (seg.role === 'north') {
      // u = 20 - x
      for (const tx of MERIDIAN.trackX) addBore(20 - tx, MERIDIAN.railY);
    } else if (seg.role === 'west') {
      // u = 94 - z
      for (const tz of VESPER.trackZ) addBore(CAVERN.transept.zMax - tz, VESPER.railY);
    } else if (seg.role === 'east') {
      // u = z - 54
      for (const tz of VESPER.trackZ) addBore(tz - CAVERN.transept.zMin, VESPER.railY);
    }

    // 2. Vertical light slots (every 4th joint from centre, walls >= 30 m, clear of openings/corners).
    const slotCentres = computeLightSlots(seg, openings);
    const allOpenings: WallOpening[] = [
      ...openings,
      ...slotCentres.map((su): WallOpening => ({
        u0: su - SHELL.slotW / 2, u1: su + SHELL.slotW / 2, y0: yPlinthTop, y1: yRevealBot, kind: 'slot',
      })),
    ];

    // 3. Sky reveal band (y = -32.4 .. -32.0, mitered watertight at every corner, set back 0.30 m).
    {
      const [m0x, m0z] = seg.miter0(SHELL.revealSetback);
      const [m1x, m1z] = seg.miter1(SHELL.revealSetback);
      const [f0x, f0z] = seg.miter0(0);
      const [f1x, f1z] = seg.miter1(0);
      const revCol: [number, number, number] = [SHELL_DETAIL.revealWallShade, SHELL_DETAIL.revealWallShade, SHELL_DETAIL.revealWallShade];
      const ledgeCol: [number, number, number] = [0.85, 0.85, 0.86];
      const rLen = Math.hypot(m1x - m0x, m1z - m0z);
      // Horizontal wall-top ledge at yRevealBot (-32.4), facing up
      limeSoup.quad(
        [v3(f0x, yRevealBot, f0z), v3(f1x, yRevealBot, f1z), v3(m1x, yRevealBot, m1z), v3(m0x, yRevealBot, m0z)],
        ledgeCol, [[0, 0], [seg.len / tileLime, 0], [rLen / tileLime, 0.05], [0, 0.05]], up,
      );
      // Recessed vertical back wall of the reveal (-32.4 .. -32.0)
      limeSoup.quad(
        [v3(m0x, yRevealBot, m0z), v3(m1x, yRevealBot, m1z), v3(m1x, yRevealTop, m1z), v3(m0x, yRevealTop, m0z)],
        revCol, [[0, yRevealBot / tileLime], [rLen / tileLime, yRevealBot / tileLime], [rLen / tileLime, yRevealTop / tileLime], [0, yRevealTop / tileLime]], inward,
      );
      // Top closure soffit at yRevealTop (-32.0) sealing reveal back to outline edge (never coplanar inside cross)
      limeSoup.quad(
        [v3(m0x, yRevealTop, m0z), v3(m1x, yRevealTop, m1z), v3(f1x, yRevealTop, f1z), v3(f0x, yRevealTop, f0z)],
        revCol, [[0, 0], [rLen / tileLime, 0], [seg.len / tileLime, 0.05], [0, 0.05]], down,
      );
      // Continuous cool emissive strip inside the reveal: both the recessed vertical back AND the downward soffit so
      // upward sightlines from the Crossing floor see a clean luminous band floating the sky off the walls.
      const [s0x, s0z] = seg.miter0(SHELL_DETAIL.revealStripBackD);
      const [s1x, s1z] = seg.miter1(SHELL_DETAIL.revealStripBackD);
      const [e0x, e0z] = seg.miter0(SHELL_DETAIL.revealStripSoffitD0);
      const [e1x, e1z] = seg.miter1(SHELL_DETAIL.revealStripSoffitD0);
      lightsBag.add(quadGeo(
        v3(s0x, SHELL_DETAIL.revealStripY0, s0z), v3(s1x, SHELL_DETAIL.revealStripY0, s1z),
        v3(s1x, SHELL_DETAIL.revealStripY1, s1z), v3(s0x, SHELL_DETAIL.revealStripY1, s0z), inward,
      ));
      lightsBag.add(quadGeo(
        v3(s0x, SHELL_DETAIL.revealStripY1, s0z), v3(s1x, SHELL_DETAIL.revealStripY1, s1z),
        v3(e1x, SHELL_DETAIL.revealStripY1, e1z), v3(e0x, SHELL_DETAIL.revealStripY1, e0z), down,
      ));
    }

    // 4. Recessed plinth (y = -72.5 .. -72.05) on all walls except West (granite runs straight to -72.5) and East onyx zone when omitted.
    const fullHeightFeature = seg.role === 'west' || (seg.role === 'east' && opts.omitOnyxZone);
    if (!fullHeightFeature) {
      const [p0x, p0z] = seg.miter0(SHELL.plinthRecess);
      const [p1x, p1z] = seg.miter1(SHELL.plinthRecess);
      const [f0x, f0z] = seg.miter0(0);
      const [f1x, f1z] = seg.miter1(0);
      const plCol: [number, number, number] = [SHELL_DETAIL.plinthShade, SHELL_DETAIL.plinthShade, SHELL_DETAIL.plinthShade];
      const pLen = Math.hypot(p1x - p0x, p1z - p0z);
      // Vertical plinth face
      limeSoup.quad(
        [v3(p0x, yBase, p0z), v3(p1x, yBase, p1z), v3(p1x, yPlinthTop, p1z), v3(p0x, yPlinthTop, p0z)],
        plCol, [[0, yBase / tileLime], [pLen / tileLime, yBase / tileLime], [pLen / tileLime, yPlinthTop / tileLime], [0, yPlinthTop / tileLime]], inward,
      );
      // Horizontal overhang soffit at yPlinthTop (-72.05), facing down
      limeSoup.quad(
        [v3(f0x, yPlinthTop, f0z), v3(f1x, yPlinthTop, f1z), v3(p1x, yPlinthTop, p1z), v3(p0x, yPlinthTop, p0z)],
        [SHELL_DETAIL.returnShade, SHELL_DETAIL.returnShade, SHELL_DETAIL.returnShade],
        [[0, 0], [seg.len / tileLime, 0], [pLen / tileLime, 0.05], [0, 0.05]], down,
      );
    }

    // 5. West end wall: polished black granite for the water-wall zone (y = -72.5 .. -34.0), limestone frieze above (-34.0 .. -32.4).
    const panelYMin = seg.role === 'west' || (seg.role === 'east' && opts.omitOnyxZone) ? WATER_WALL.yMax : yPlinthTop;
    if (seg.role === 'west') {
      const boreRects = openings.map((o) => ({ u0: o.u0, u1: o.u1, y0: o.y0, y1: o.y1 }));
      const granitePieces = subtractRects({ u0: 0, u1: seg.len, y0: yBase, y1: WATER_WALL.yMax }, boreRects);
      for (const r of granitePieces) {
        graniteBag.add(quadGeo(
          ptOn(seg, r.u0, r.y0, 0), ptOn(seg, r.u1, r.y0, 0),
          ptOn(seg, r.u1, r.y1, 0), ptOn(seg, r.u0, r.y1, 0), inward,
        ));
      }
      // Clean horizontal shadow-gap soffit where the top limestone frieze meets the black granite at y = -34.0
      limeSoup.quad(
        [ptOn(seg, 0, WATER_WALL.yMax, 0), ptOn(seg, seg.len, WATER_WALL.yMax, 0),
          ptOn(seg, seg.len, WATER_WALL.yMax, SHELL.proud), ptOn(seg, 0, WATER_WALL.yMax, SHELL.proud)],
        [SHELL_DETAIL.returnShade, SHELL_DETAIL.returnShade, SHELL_DETAIL.returnShade],
        [[0, 0], [seg.len / tileLime, 0], [seg.len / tileLime, 0.02], [0, 0.02]], down,
      );
    }

    // 6. Dark recessed shadow-gap backing plane behind limestone panels (mitered at corners so corners never leak).
    {
      const [b0x, b0z] = seg.miter0(SHELL.proud);
      const [b1x, b1z] = seg.miter1(SHELL.proud);
      // Extend u range slightly into the mitered corner wings for watertight 12 mm corner joints
      const uStart = (b0x - seg.x0) * seg.tx + (b0z - seg.z0) * seg.tz;
      const uEnd = (b1x - seg.x0) * seg.tx + (b1z - seg.z0) * seg.tz;
      const backingCuts = openings.map((o) => ({ u0: o.u0, u1: o.u1, y0: o.y0, y1: o.y1 }));
      const backPieces = subtractRects({ u0: uStart, u1: uEnd, y0: panelYMin, y1: yRevealBot }, backingCuts);
      const bkCol: [number, number, number] = [SHELL_DETAIL.backingShade, SHELL_DETAIL.backingShade, SHELL_DETAIL.backingShade];
      for (const r of backPieces) {
        limeSoup.quad(
          [ptOn(seg, r.u0, r.y0, SHELL.proud), ptOn(seg, r.u1, r.y0, SHELL.proud),
            ptOn(seg, r.u1, r.y1, SHELL.proud), ptOn(seg, r.u0, r.y1, SHELL.proud)],
          bkCol, [[r.u0 / tileLime, r.y0 / tileLime], [r.u1 / tileLime, r.y0 / tileLime], [r.u1 / tileLime, r.y1 / tileLime], [r.u0 / tileLime, r.y1 / tileLime]],
          inward,
        );
      }
    }

    // 7. Honed limestone stack-bond panels (3.0 m x 1.525 m courses).
    {
      const vJoints = computeVerticalJoints(seg.len, openings);
      // Skip any course line within 0.35 m of the -34.0 frieze datum (WATER_WALL / MAP_WALL top) so no 7.5 cm sliver forms.
      const hasFrieze = seg.role === 'west' || seg.role === 'south' || (seg.role === 'east' && opts.omitOnyxZone);
      const hBounds = panelYMin > yPlinthTop + 0.01
        ? [panelYMin, ...courseYs.filter((y) => y > panelYMin + 0.35)]
        : hasFrieze
          ? courseYs.filter((y) => Math.abs(y - MAP_WALL.yMax) >= 0.35 || Math.abs(y - yRevealBot) < 0.01)
          : courseYs;
      const cuts = allOpenings.map((o) => ({ u0: o.u0, u1: o.u1, y0: o.y0, y1: o.y1 }));
      const halfGap = SHELL.gap / 2;
      const revGap = SHELL.openingRevealGap;
      const EPS = 0.015;
      // Check if an edge sits against an opening (bore/map gets 30 mm shadow-gap reveal; slot gets 0 extra since slot is exact 0.12 m).
      const isOpeningEdgeU = (u: number, yMid: number): boolean =>
        openings.some((o) => (Math.abs(u - o.u0) < EPS || Math.abs(u - o.u1) < EPS) && yMid >= o.y0 - EPS && yMid <= o.y1 + EPS);
      const isOpeningEdgeY = (y: number, uMid: number): boolean =>
        openings.some((o) => (Math.abs(y - o.y0) < EPS || Math.abs(y - o.y1) < EPS) && uMid >= o.u0 - EPS && uMid <= o.u1 + EPS);
      const isSlotEdgeU = (u: number): boolean =>
        slotCentres.some((su) => Math.abs(u - (su - SHELL.slotW / 2)) < EPS || Math.abs(u - (su + SHELL.slotW / 2)) < EPS);

      for (let iy = 0; iy + 1 < hBounds.length; iy++) {
        const cy0 = hBounds[iy]!, cy1 = hBounds[iy + 1]!;
        for (let ix = 0; ix + 1 < vJoints.length; ix++) {
          const cu0 = vJoints[ix]!, cu1 = vJoints[ix + 1]!;
          const subRects = subtractRects({ u0: cu0, u1: cu1, y0: cy0, y1: cy1 }, cuts);
          for (const r of subRects) {
            const uMid = (r.u0 + r.u1) / 2, yMid = (r.y0 + r.y1) / 2;
            const mL = isSlotEdgeU(r.u0) ? 0 : isOpeningEdgeU(r.u0, yMid) ? revGap : halfGap;
            const mR = isSlotEdgeU(r.u1) ? 0 : isOpeningEdgeU(r.u1, yMid) ? revGap : halfGap;
            const mB = isOpeningEdgeY(r.y0, uMid) ? revGap : r.y0 <= panelYMin + 0.005 ? 0 : halfGap;
            const mT = isOpeningEdgeY(r.y1, uMid) ? revGap : r.y1 >= yRevealBot - 0.005 ? 0 : halfGap;
            addPanel(seg, r.u0, r.u1, r.y0, r.y1, mL, mR, mB, mT);
          }
        }
      }
    }

    // 8. Vertical recessed light slots (slim stainless channel bezels + flush cool 4000 K emissive diffuser).
    for (const su of slotCentres) {
      const u0 = su - SHELL.slotW / 2, u1 = su + SHELL.slotW / 2;
      const d = SHELL_DETAIL.slotDepth;
      const sd = SHELL_DETAIL.slotStripDepth;
      const hw = SHELL_DETAIL.slotStripW / 2;
      // Stainless channel sides & narrow 14 mm bezel shoulders
      stainlessBag.add(quadGeo(ptOn(seg, u0, yPlinthTop, d), ptOn(seg, u0, yPlinthTop, 0), ptOn(seg, u0, yRevealBot, 0), ptOn(seg, u0, yRevealBot, d), tan));
      stainlessBag.add(quadGeo(ptOn(seg, u1, yPlinthTop, 0), ptOn(seg, u1, yPlinthTop, d), ptOn(seg, u1, yRevealBot, d), ptOn(seg, u1, yRevealBot, 0), tan.clone().negate()));
      stainlessBag.add(quadGeo(ptOn(seg, u0, yPlinthTop, sd), ptOn(seg, su - hw, yPlinthTop, sd), ptOn(seg, su - hw, yRevealBot, sd), ptOn(seg, u0, yRevealBot, sd), inward));
      stainlessBag.add(quadGeo(ptOn(seg, su + hw, yPlinthTop, sd), ptOn(seg, u1, yPlinthTop, sd), ptOn(seg, u1, yRevealBot, sd), ptOn(seg, su + hw, yRevealBot, sd), inward));
      // Cool 4000 K emissive diffuser recessed 16 mm (clean fixture at both head-on and oblique angles)
      lightsBag.add(quadGeo(
        ptOn(seg, su - hw, yPlinthTop, sd), ptOn(seg, su + hw, yPlinthTop, sd),
        ptOn(seg, su + hw, yRevealBot, sd), ptOn(seg, su - hw, yRevealBot, sd), inward,
      ));
    }

    // 9. Openings: 4 m dark portal liners (until P3-6) and map-wall dark architectural recess (until P4-5).
    for (const op of openings) {
      if (op.kind === 'map') {
        const md = SHELL_DETAIL.mapRecessDepth;
        // Dark backing behind MAP_WALL + top/bottom recessed returns
        linerBag.add(quadGeo(ptOn(seg, op.u0, op.y0, md), ptOn(seg, op.u1, op.y0, md), ptOn(seg, op.u1, op.y1, md), ptOn(seg, op.u0, op.y1, md), inward));
        linerBag.add(quadGeo(ptOn(seg, op.u0, op.y0, 0), ptOn(seg, op.u1, op.y0, 0), ptOn(seg, op.u1, op.y0, md), ptOn(seg, op.u0, op.y0, md), up));
        linerBag.add(quadGeo(ptOn(seg, op.u0, op.y1, md), ptOn(seg, op.u1, op.y1, md), ptOn(seg, op.u1, op.y1, 0), ptOn(seg, op.u0, op.y1, 0), down));
      } else if (op.kind === 'bore' && !opts.omitPortalLiners) {
        const ld = SHELL.portalLiner;
        // 4 tunnel liner walls + back cap behind the clear 5.0 x 5.5 m bore
        linerBag.add(quadGeo(ptOn(seg, op.u0, op.y0, 0), ptOn(seg, op.u1, op.y0, 0), ptOn(seg, op.u1, op.y0, ld), ptOn(seg, op.u0, op.y0, ld), up));
        linerBag.add(quadGeo(ptOn(seg, op.u0, op.y1, ld), ptOn(seg, op.u1, op.y1, ld), ptOn(seg, op.u1, op.y1, 0), ptOn(seg, op.u0, op.y1, 0), down));
        linerBag.add(quadGeo(ptOn(seg, op.u0, op.y0, ld), ptOn(seg, op.u0, op.y0, 0), ptOn(seg, op.u0, op.y1, 0), ptOn(seg, op.u0, op.y1, ld), tan));
        linerBag.add(quadGeo(ptOn(seg, op.u1, op.y0, 0), ptOn(seg, op.u1, op.y0, ld), ptOn(seg, op.u1, op.y1, ld), ptOn(seg, op.u1, op.y1, 0), tan.clone().negate()));
        linerBag.add(quadGeo(ptOn(seg, op.u0, op.y0, ld), ptOn(seg, op.u1, op.y0, ld), ptOn(seg, op.u1, op.y1, ld), ptOn(seg, op.u0, op.y1, ld), inward));
      }
    }
  }

  // ---- Base floor field (y = -72.5): dark terrazzo with FLUSH 3 m brushed-stainless division strips ----
  // Partitioned into 6 strictly disjoint rectangles outside VESPER.floor [-58,58] x [64,84] so Glass Floor, F6 & lifts stay clear.
  {
    const ap = SHELL_DETAIL.apronOut;
    const fl = VESPER.floor;
    const tr = CAVERN.transept;
    const nv = CAVERN.nave;
    const rects: ReadonlyArray<readonly [number, number, number, number]> = [
      [nv.xMin - ap, nv.xMax + ap, nv.zMin - ap, tr.zMin - ap], // South nave
      [nv.xMin - ap, nv.xMax + ap, tr.zMax + ap, nv.zMax + ap], // North nave
      [tr.xMin - ap, tr.xMax + ap, tr.zMin - ap, fl.zMin],      // South transept (incl. under south Vesper track)
      [tr.xMin - ap, tr.xMax + ap, fl.zMax, tr.zMax + ap],      // North transept (incl. under north Vesper track)
      [tr.xMin - ap, fl.xMin, fl.zMin, fl.zMax],                // West 2 m water-trough strip
      [fl.xMax, tr.xMax + ap, fl.zMin, fl.zMax],                // East 2 m onyx-reveal strip
    ];
    const pitch = SHELL.floorGrid;
    const halfS = SHELL.stripW / 2;
    const cx = OCULUS.cx, cz = OCULUS.cz;
    const up = v3(0, 1, 0);
    const flatQuad = (bag: GeoBag, x0: number, x1: number, z0: number, z1: number): void => {
      if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
      bag.add(quadGeo(v3(x0, yBase, z0), v3(x0, yBase, z1), v3(x1, yBase, z1), v3(x1, yBase, z0), up));
    };

    /** Splits [a, b] into alternating { start, end, isStrip } spans aligned to grid origin + k * pitch. */
    const splitAxis = (a: number, b: number, origin: number): Array<{ a: number; b: number; strip: boolean }> => {
      const spans: Array<{ a: number; b: number; strip: boolean }> = [];
      const k0 = Math.floor((a - origin) / pitch) - 1;
      const k1 = Math.ceil((b - origin) / pitch) + 1;
      let cursor = a;
      for (let k = k0; k <= k1; k++) {
        const g = origin + k * pitch;
        const s0 = Math.max(a, g - halfS), s1 = Math.min(b, g + halfS);
        if (s1 <= cursor + 1e-5) continue;
        if (s0 > cursor + 1e-5) spans.push({ a: cursor, b: s0, strip: false });
        if (s1 > Math.max(cursor, s0) + 1e-5) spans.push({ a: Math.max(cursor, s0), b: s1, strip: true });
        cursor = s1;
        if (cursor >= b - 1e-5) break;
      }
      if (cursor < b - 1e-5) spans.push({ a: cursor, b, strip: false });
      return spans;
    };

    for (const [rx0, rx1, rz0, rz1] of rects) {
      const xs = splitAxis(rx0, rx1, cx);
      const zs = splitAxis(rz0, rz1, cz);
      for (const sx of xs) {
        for (const sz of zs) {
          flatQuad(sx.strip || sz.strip ? stainlessBag : terrazzoBag, sx.a, sx.b, sz.a, sz.b);
        }
      }
    }

    // Finished terrazzo pit floor directly beneath the Sinking Floor disc well at (0, 74).
    const pitN = 48;
    const pitR = SHELL_DETAIL.discPitR;
    const pitTopY = VESPER.topY - VESPER.slabThickness;
    const pit = new THREE.CircleGeometry(pitR, pitN);
    pit.rotateX(-Math.PI / 2);
    pit.translate(cx, yBase, cz);
    terrazzoBag.add(pit);
    // Inward-facing dark cylindrical pit liner from base floor (-72.5) up to the Crossing slab underside (-71.5).
    for (let i = 0; i < pitN; i++) {
      const a0 = (i / pitN) * Math.PI * 2, a1 = ((i + 1) / pitN) * Math.PI * 2, am = (a0 + a1) / 2;
      const x0 = cx + pitR * Math.cos(a0), z0 = cz + pitR * Math.sin(a0);
      const x1 = cx + pitR * Math.cos(a1), z1 = cz + pitR * Math.sin(a1);
      linerBag.add(quadGeo(v3(x0, yBase, z0), v3(x1, yBase, z1), v3(x1, pitTopY, z1), v3(x0, pitTopY, z0), v3(-Math.cos(am), 0, -Math.sin(am))));
    }
  }

  // ---- Materials (deep set, receives deep sun, never sun-masked) ----
  const limeMat = kit.deep.honedLimestone.clone();
  limeMat.name = 'metroDeepShellLimestone';
  limeMat.vertexColors = true;
  installSensingHalo(limeMat);

  const graniteMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepBlackGranite',
    color: 0x16181c,
    roughness: 0.13,
    metalness: 0.04,
    normalMap: kit.deep.honedLimestone.normalMap,
    normalScale: new THREE.Vector2(0.08, 0.08),
    envMapIntensity: 1.4,
  });

  const linerMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepPortalLiner',
    color: 0x08090b,
    roughness: 0.92,
    metalness: 0,
  });

  // Plain satin stainless for crisp 6 cm floor division strips & slot channels (avoids streaky grain at grazing angles).
  const shellStainlessMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepShellStainless',
    color: 0xcdd2d5,
    metalness: 1.0,
    roughness: 0.28,
    envMapIntensity: 1.1,
  });

  // ---- Meshes (6 draw calls max) ----
  const addMesh = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, noShadow = false): void => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (noShadow) m.userData.noShadow = true;
    group.add(m);
  };

  addMesh(limeSoup.build(), limeMat, 'cavernWallsLimestone', false);
  addMesh(graniteBag.merge(), graniteMat, 'cavernWallGranite', false);
  addMesh(terrazzoBag.merge(), kit.deep.terrazzo, 'cavernBaseTerrazzo', false);
  addMesh(stainlessBag.merge(), shellStainlessMat, 'cavernShellStainless', false);
  addMesh(lightsBag.merge(), kit.deep.emissive.coolRing, 'cavernShellLights', true);
  addMesh(linerBag.merge(), linerMat, 'cavernPortalLiners', true);

  return {
    group,
    deepMaterials: [limeMat, graniteMat, linerMat, shellStainlessMat],
  };
}
