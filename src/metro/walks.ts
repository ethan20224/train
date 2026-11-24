/**
 * Canopy walk + forest boardwalk plans (pure, no three.js so Node tests, navigation, the forest planner and the geometry
 * builders all read the SAME numbers). Raw coordinates live in layoutMetro.ts (CANOPY_WALK, BOARDWALK); this module derives the
 * axis-aligned runs/pads, the spline boardwalk (stations with deck heights from the mounded forest floor), the rail kind of every
 * side (full-height screen near trains), the walkable regions and the keep-out samples the forest planner uses.
 */
import { PLAYER } from '../layout';
import { BOARDWALK, CANOPY_WALK, MERIDIAN, VESPER, type WalkPad, type WalkSeg } from '../layoutMetro';
import { boundsOf, circleShape, obbShape, rectShape, type Region, type Shape } from '../player/regions';
import { forestGroundY } from './forestGround';

const C = PLAYER.wallClearance;
export type Side = 'n' | 's' | 'e' | 'w';
/** none = open edge (kerb only), low = 1.1 m glass balustrade, high = full-height laminated screen. */
export type RailKind = 'none' | 'low' | 'high';

export interface WalkRun {
  readonly id: string;
  readonly group: 'canopy' | 'boardwalk';
  readonly kind: WalkSeg['kind'];
  readonly axis: 'x' | 'z';
  readonly across: number;
  readonly from: number;
  readonly to: number;
  readonly yFrom: number;
  readonly yTo: number;
  readonly halfWidth: number;
  /** Rail kind on the low-across / high-across side. */
  readonly rails: readonly [RailKind, RailKind];
  /** How far the walkable region extends past `from` / `to` (into a neighbouring pad, a floor or another run). */
  readonly ext0: number;
  readonly ext1: number;
}
export interface WalkPlanPad extends WalkPad {
  readonly group: 'canopy' | 'boardwalk';
  readonly railKinds: Readonly<Partial<Record<Side, 'low' | 'high'>>>;
}
export interface PathStation { readonly x: number; readonly z: number; readonly y: number; readonly tx: number; readonly tz: number }
/** The spline boardwalk: stations every stationPitch; rails[i] = [left(+normal), right(-normal)] for the segment i -> i+1. normal = (-tz, tx). */
export interface WalkPath {
  readonly stations: readonly PathStation[];
  readonly halfWidth: number;
  readonly rails: ReadonlyArray<readonly [RailKind, RailKind]>;
  readonly endPad: { readonly x: number; readonly z: number; readonly y: number; readonly r: number };
}
export interface WalkPlan { readonly runs: readonly WalkRun[]; readonly pads: readonly WalkPlanPad[]; readonly path: WalkPath | null }

const PAD_REACH = C + 0.05;

// ---- train proximity --------------------------------------------------------------------------------------------------------

/** Horizontal distance from (x, z) to the nearest train centre line that shares the level of y (+-6 m); Infinity if none. */
export function trackDistance(x: number, z: number, y: number): number {
  let d = Infinity;
  if (Math.abs(y - MERIDIAN.railY) < 6 && z > 19 && z < 129) d = Math.min(d, ...MERIDIAN.trackX.map((tx) => Math.abs(x - tx)));
  if (Math.abs(y - VESPER.railY) < 6 && Math.abs(x) < 61) d = Math.min(d, ...VESPER.trackZ.map((tz) => Math.abs(z - tz)));
  return d;
}
function lineKind(pts: ReadonlyArray<readonly [number, number, number]>): 'low' | 'high' {
  for (const [x, y, z] of pts) if (trackDistance(x, z, y) < BOARDWALK.nearTrack) return 'high';
  return 'low';
}
const sampleLine = (a: readonly [number, number, number], b: readonly [number, number, number], n = 6): Array<[number, number, number]> =>
  Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, a[2] + ((b[2] - a[2]) * i) / n]);

// ---- helpers ----------------------------------------------------------------------------------------------------------------

function padEdgeTouch(pads: ReadonlyArray<Pick<WalkPad, 'x' | 'z' | 'hx' | 'hz'>>, axis: 'x' | 'z', across: number, coord: number): boolean {
  for (const p of pads) {
    const [pa, pc, ha, hc] = axis === 'x' ? [p.x, p.z, p.hx, p.hz] : [p.z, p.x, p.hz, p.hx];
    if (Math.abs(across - pc) <= hc + 1e-6 && (Math.abs(coord - (pa - ha)) < 1e-6 || Math.abs(coord - (pa + ha)) < 1e-6)) return true;
  }
  return false;
}

function runPointAt(axis: 'x' | 'z', across: number, c: number, y: number, off: number): [number, number, number] {
  return axis === 'x' ? [c, y, across + off] : [across + off, y, c];
}

function mkRun(pads: readonly WalkPad[], s: WalkSeg, group: WalkRun['group'], halfWidth: number, over?: { ext0?: number; ext1?: number }): WalkRun {
  const reach = (coord: number): number => (padEdgeTouch(pads, s.axis, s.across, coord) ? PAD_REACH : 0.02);
  const kindOf = (sgn: -1 | 1): RailKind => lineKind(sampleLine(runPointAt(s.axis, s.across, s.from, s.yFrom, sgn * halfWidth), runPointAt(s.axis, s.across, s.to, s.yTo, sgn * halfWidth)));
  return {
    id: s.id, group, kind: s.kind, axis: s.axis, across: s.across, from: s.from, to: s.to, yFrom: s.yFrom, yTo: s.yTo, halfWidth,
    rails: [kindOf(-1), kindOf(1)],
    ext0: over?.ext0 ?? reach(s.from), ext1: over?.ext1 ?? reach(s.to),
  };
}

function sideLine(p: WalkPad, side: Side): Array<[number, number, number]> {
  switch (side) {
    case 'n': return sampleLine([p.x - p.hx, p.y, p.z + p.hz], [p.x + p.hx, p.y, p.z + p.hz]);
    case 's': return sampleLine([p.x - p.hx, p.y, p.z - p.hz], [p.x + p.hx, p.y, p.z - p.hz]);
    case 'e': return sampleLine([p.x + p.hx, p.y, p.z - p.hz], [p.x + p.hx, p.y, p.z + p.hz]);
    case 'w': return sampleLine([p.x - p.hx, p.y, p.z - p.hz], [p.x - p.hx, p.y, p.z + p.hz]);
  }
}
/** Elevated pad: every side that is not wholly a run mouth carries a balustrade (kind by train distance). */
function mkPad(group: WalkPlanPad['group'], pad: WalkPad): WalkPlanPad {
  const railKinds: Partial<Record<Side, 'low' | 'high'>> = {};
  for (const sd of ['n', 's', 'e', 'w'] as const) {
    const len = sd === 'n' || sd === 's' ? pad.hx : pad.hz;
    if (pad.open.some((o) => o.side === sd && o.half >= len - 1e-6)) continue;
    railKinds[sd] = lineKind(sideLine(pad, sd));
  }
  return { ...pad, group, railKinds };
}
/** A pad whose open sides face the given neighbour points (axis-aligned runs join at its edge centres). */
function padToward(id: string, x: number, z: number, hx: number, hz: number, y: number, towards: ReadonlyArray<readonly [number, number]>): WalkPad {
  const open: Array<WalkPad['open'][number]> = towards.map(([px, pz]) => {
    const dx = px - x, dz = pz - z;
    return Math.abs(dx) > Math.abs(dz) ? { side: dx > 0 ? 'e' : 'w', c: z, half: hz } : { side: dz > 0 ? 'n' : 's', c: x, half: hx };
  });
  return { id, x, z, hx, hz, y, open };
}

// ---- canopy -----------------------------------------------------------------------------------------------------------------

let canopyCache: WalkPlan | null = null;
export function canopyPlan(): WalkPlan {
  if (canopyCache) return canopyCache;
  const pads = CANOPY_WALK.pads;
  const runs = CANOPY_WALK.segs.map((s) => mkRun(pads, s, 'canopy', CANOPY_WALK.halfWidth, s.id === 'exit' ? { ext0: PAD_REACH } : undefined));
  canopyCache = { runs, pads: pads.map((p) => mkPad('canopy', p)), path: null };
  return canopyCache;
}

// ---- boardwalk --------------------------------------------------------------------------------------------------------------

const B = BOARDWALK;

/** Catmull-Rom through the control points, resampled every `pitch` m of arc length. Returns points with unit tangents. */
function resampleSpline(ctrl: ReadonlyArray<readonly [number, number]>, pitch: number): Array<{ x: number; z: number; tx: number; tz: number }> {
  const P = (i: number): readonly [number, number] => ctrl[Math.min(ctrl.length - 1, Math.max(0, i))]!;
  const dense: Array<[number, number]> = [];
  for (let i = 0; i + 1 < ctrl.length; i++) {
    for (let k = 0; k < 40; k++) {
      const t = k / 40, t2 = t * t, t3 = t2 * t;
      const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
      dense.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  dense.push([ctrl[ctrl.length - 1]![0], ctrl[ctrl.length - 1]![1]]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1]! + Math.hypot(dense[i]![0] - dense[i - 1]![0], dense[i]![1] - dense[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  const n = Math.max(2, Math.round(total / pitch));
  const pts: Array<[number, number]> = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n;
    while (j + 2 < cum.length && cum[j + 1]! < s) j++;
    const f = (s - cum[j]!) / Math.max(1e-9, cum[j + 1]! - cum[j]!);
    pts.push([dense[j]![0] + (dense[j + 1]![0] - dense[j]![0]) * f, dense[j]![1] + (dense[j + 1]![1] - dense[j]![1]) * f]);
  }
  return pts.map(([x, z], i) => {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x, z, tx: (b[0] - a[0]) / l, tz: (b[1] - a[1]) / l };
  });
}

/** Smallest radius of curvature (m) along a station list (tests). */
export function minPathRadius(st: ReadonlyArray<{ x: number; z: number }>): number {
  let r = Infinity;
  for (let i = 1; i + 1 < st.length; i += 1) {
    const a = st[i - 1]!, b = st[i]!, c = st[i + 1]!;
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
    const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    if (cross > 1e-9) r = Math.min(r, (ab * bc * ca) / (2 * cross));
  }
  return r;
}

function mkBoardwalk(side: 1 | -1): WalkPlan {
  const tx = (x: number): number => side * x;
  const tz = (z: number): number => (side > 0 ? z : B.zMirror - z);
  const hw = B.halfWidth, hs = B.stairHalfWidth;

  // --- stations along the spline
  const raw = resampleSpline(B.curve.map(([x, z]) => [tx(x), tz(z)] as const), B.stationPitch);
  const nodes = raw.map((p) => {
    // deck must clear the floor under its whole footprint (centre, both edges, 0.4 m fore/aft)
    let m = -Infinity;
    for (const o of [-hw, 0, hw]) for (const l of [-0.4, 0, 0.4]) m = Math.max(m, forestGroundY(p.x - p.tz * o + p.tx * l, p.z + p.tx * o + p.tz * l));
    return { ...p, y: m + B.clearance };
  });
  for (let iter = 0; iter < 600; iter++) {
    let moved = false;
    for (let i = 0; i + 1 < nodes.length; i++) {
      const p = nodes[i]!, q = nodes[i + 1]!;
      const lim = B.slopeMax * Math.hypot(q.x - p.x, q.z - p.z);
      if (p.y < q.y - lim - 1e-9) { p.y = q.y - lim; moved = true; }
      if (q.y < p.y - lim - 1e-9) { q.y = p.y - lim; moved = true; }
    }
    if (!moved) break;
  }
  const foot = nodes[0]!;

  // --- elevated entry: floor stair -> landing A -> bridge over the Vesper track -> landing B -> descent stair
  const fs = B.floorStair, br = B.bridge, ds = B.descent;
  const padA = padToward('bwLandingA', tx(br.x), tz(fs.z), hs, hs, B.bridgeY, [[tx(fs.xFoot), tz(fs.z)], [tx(br.x), tz(br.zForest)]]);
  const padB = padToward('bwLandingB', tx(br.x), tz(ds.z), hs, hs, B.bridgeY, [[tx(br.x), tz(fs.z)], [tx(ds.xFoot), tz(ds.z)]]);
  const elevated = [padA, padB];
  const segs: WalkSeg[] = [
    { id: 'bwFloorStair', kind: 'stair', axis: 'x', across: tz(fs.z), from: tx(fs.xFoot), to: tx(fs.xTop), yFrom: -70, yTo: B.bridgeY },
    { id: 'bwBridge', kind: 'bridge', axis: 'z', across: tx(br.x), from: tz(br.zFloor), to: tz(br.zForest), yFrom: B.bridgeY, yTo: B.bridgeY },
    { id: 'bwDescent', kind: 'stair', axis: 'x', across: tz(ds.z), from: tx(ds.xTop), to: tx(ds.xFoot), yFrom: B.bridgeY, yTo: foot.y },
  ];
  const runs = segs.map((s) => mkRun(elevated, s, 'boardwalk', hs, s.id === 'bwFloorStair' ? { ext0: 0.15 } : s.id === 'bwDescent' ? { ext1: 0.02 } : undefined));
  const pads = elevated.map((p) => mkPad('boardwalk', p));

  // --- rails along the spline: full-height screen near a train, balustrade where the floor drops away, otherwise kerbs only
  const rails: Array<readonly [RailKind, RailKind]> = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i]!, b = nodes[i + 1]!;
    const kinds = [1, -1].map((sg): RailKind => {
      const pts: Array<[number, number, number]> = [];
      let drop = false;
      for (let t = 0; t <= 1.0001; t += 0.5) {
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
        const nx = -(a.tz + (b.tz - a.tz) * t), nz = a.tx + (b.tx - a.tx) * t;
        const px = x + sg * nx * hw, pz = z + sg * nz * hw;
        pts.push([px, y, pz]);
        if (y - forestGroundY(px, pz) > B.dropRail) drop = true;
      }
      return lineKind(pts) === 'high' ? 'high' : drop ? 'low' : 'none';
    });
    rails.push([kinds[0]!, kinds[1]!]);
  }
  const last = nodes[nodes.length - 1]!;
  const path: WalkPath = {
    stations: nodes.map((n) => ({ x: n.x, z: n.z, y: n.y, tx: n.tx, tz: n.tz })),
    halfWidth: hw,
    rails,
    endPad: { x: last.x, z: last.z, y: last.y, r: B.endPadR },
  };
  return { runs, pads, path };
}

const bwCache = new Map<number, WalkPlan>();
export function boardwalkPlan(side: 1 | -1): WalkPlan {
  let p = bwCache.get(side);
  if (!p) { p = mkBoardwalk(side); bwCache.set(side, p); }
  return p;
}

/** Every plan: canopy walk, then both boardwalks. */
export function allWalkPlans(): readonly WalkPlan[] {
  return [canopyPlan(), boardwalkPlan(1), boardwalkPlan(-1)];
}

// ---- navigation -----------------------------------------------------------------------------------------------------------

/** Walkable regions of every run, pad and spline segment (rail line minus the player clearance). */
export function walkRegions(): Region[] {
  const out: Region[] = [];
  for (const plan of allWalkPlans()) {
    for (const r of plan.runs) {
      const hn = r.halfWidth - C;
      const lo = Math.min(r.from, r.to) - (r.from < r.to ? r.ext0 : r.ext1);
      const hi = Math.max(r.from, r.to) + (r.from < r.to ? r.ext1 : r.ext0);
      const rect = r.axis === 'x'
        ? { xMin: lo, xMax: hi, zMin: r.across - hn, zMax: r.across + hn }
        : { xMin: r.across - hn, xMax: r.across + hn, zMin: lo, zMax: hi };
      const sloped = r.from !== r.to && Math.abs(r.yFrom - r.yTo) > 1e-9;
      out.push({
        ...rect, y: r.yTo,
        ...(sloped ? { ramp: { axis: r.axis, from: r.from, to: r.to, yFrom: r.yFrom, yTo: r.yTo } } : {}),
      });
    }
    for (const p of plan.pads) out.push({ xMin: p.x - p.hx + C, xMax: p.x + p.hx - C, zMin: p.z - p.hz + C, zMax: p.z + p.hz - C, y: p.y });
    if (plan.path) {
      const st = plan.path.stations, hn = plan.path.halfWidth - C;
      for (let i = 0; i + 1 < st.length; i++) {
        const a = st[i]!, b = st[i + 1]!;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
        const obb = obbShape((a.x + b.x) / 2, (a.z + b.z) / 2, ux, uz, len / 2 + 0.08, hn);
        out.push({ ...boundsOf(obb), y: (a.y + b.y) / 2, obb });
      }
      const e = plan.path.endPad;
      const circ = circleShape(e.x, e.z, e.r - C);
      out.push({ ...boundsOf(circ), y: e.y, circle: circ });
    }
  }
  return out;
}

/** Crossing-floor holes under each boardwalk's stair, landing and bridge mouth (the floor below is not walkable there). */
export function walkFloorHoles(): Shape[] {
  const h = B.floorHole;
  return [rectShape(h.xMin, h.xMax, h.zMin, h.zMax), rectShape(-h.xMax, -h.xMin, B.zMirror - h.zMax, B.zMirror - h.zMin)];
}

// ---- keep-out samples for the forest planner ------------------------------------------------------------------------------

export interface WalkSample { readonly x: number; readonly z: number; readonly y: number }

function sampleRun(r: WalkRun, step: number, out: WalkSample[]): void {
  const len = Math.abs(r.to - r.from);
  const n = Math.max(1, Math.ceil(len / step));
  for (let k = 0; k <= n; k++) {
    const t = k / n, c = r.from + (r.to - r.from) * t, y = r.yFrom + (r.yTo - r.yFrom) * t;
    out.push(r.axis === 'x' ? { x: c, z: r.across, y } : { x: r.across, z: c, y });
  }
}
function samplePad(p: WalkPad, step: number, out: WalkSample[]): void {
  const nx = Math.max(1, Math.ceil((2 * p.hx) / step)), nz = Math.max(1, Math.ceil((2 * p.hz) / step));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) out.push({ x: p.x - p.hx + (2 * p.hx * i) / nx, z: p.z - p.hz + (2 * p.hz * j) / nz, y: p.y });
}

let samples: { ground: WalkSample[]; air: WalkSample[] } | null = null;
/**
 * Centre-line samples: `ground` = everything that stands on or near the forest floor (boardwalk spline, stairs, bridge, landings),
 * `air` = the canopy walk (hung from the sky, passing through the crowns).
 */
export function walkSamples(): { ground: readonly WalkSample[]; air: readonly WalkSample[] } {
  if (samples) return samples;
  const ground: WalkSample[] = [], air: WalkSample[] = [];
  for (const plan of allWalkPlans()) {
    const dst = plan.runs[0]!.group === 'canopy' ? air : ground;
    for (const r of plan.runs) sampleRun(r, 0.5, dst);
    for (const p of plan.pads) samplePad(p, 0.5, dst);
    if (plan.path) {
      for (const s of plan.path.stations) dst.push({ x: s.x, z: s.z, y: s.y });
      const e = plan.path.endPad;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (Math.hypot(i, j) <= 3) dst.push({ x: e.x + (i * e.r) / 3, z: e.z + (j * e.r) / 3, y: e.y });
    }
  }
  samples = { ground, air };
  return samples;
}
