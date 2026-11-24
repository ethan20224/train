import { BOARDWALK, VESPER } from '../../layoutMetro';
import { forestGroundY } from '../../metro/forestGround';
import { boardwalkPlan, type RailKind, type WalkPath, type WalkPlanPad, type WalkRun } from '../../metro/walks';
import {
  WalkBags, addRail, deckRun, metalBeam, metalDisc, metalRod, padRails, padSlab, pathPrism, pointAt, runRails, stairRun, timberDisc,
  type RailLine, type V3,
} from './walkKit';

/**
 * The forest boardwalks (plan: src/metro/walks.ts boardwalkPlan, coordinates: layoutMetro BOARDWALK), one per side. Elevated parts
 * (floor stair, landings, footbridge over the Vesper track, descent stair) are oak on stainless stringers with slim round columns
 * to the floor, balustraded with 1.1 m glass or - wherever a train is within BOARDWALK.nearTrack - the full-height laminated
 * screen. The ground part is a 1.8 m oak ribbon that follows the spline, 0.4-0.8 m above the mounded forest floor on slim stainless
 * posts with timber kerbs, ending in a round belvedere pad.
 */

const FLOOR = VESPER.floor;
/** Crossing floor under the footbridge landing and stair (either Vesper floor edge), the trench between has no ground, forest elsewhere. */
const groundFor = (x: number, z: number): number | null => {
  if (z >= FLOOR.zMin && z <= FLOOR.zMax) return VESPER.topY;
  if (z > 60.85 && z < FLOOR.zMin) return null;
  if (z > FLOOR.zMax && z < 87.15) return null;
  return forestGroundY(x, z) - 0.12;
};

function column(bags: WalkBags, x: number, z: number, yTop: number, r = 0.04): void {
  const g = groundFor(x, z);
  if (g === null || yTop - g < 0.3) return;
  metalRod(bags, [x, g - 0.02, z], [x, yTop, z], r, 8);
  metalDisc(bags, [x, g + 0.006, z], r * 2.6, 0.012, 10);
}

function elevatedPad(bags: WalkBags, p: WalkPlanPad): void {
  padSlab(bags, p, { slabT: 0.05, beamH: 0.3 });
  for (const line of padRails(p)) addRail(bags, line);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) column(bags, p.x + sx * (p.hx - 0.12), p.z + sz * (p.hz - 0.12), p.y - 0.35);
}

function elevatedRun(bags: WalkBags, r: WalkRun): void {
  if (r.kind === 'stair') {
    stairRun(bags, r);
    // columns under both stringers every ~3 m (not at the first 0.3 m above the floor)
    const len = Math.abs(r.to - r.from), dir = Math.sign(r.to - r.from) || 1;
    const n = Math.max(1, Math.round(len / 3.0));
    for (let k = 0; k <= n; k++) {
      const c = r.from + (dir * len * k) / n;
      for (const s of [-1, 1]) {
        const p = pointAt(r, c, s * (r.halfWidth - 0.03));
        column(bags, p[0], p[2], p[1] - 0.36);
      }
    }
  } else {
    deckRun(bags, r, { slabT: 0.05, beamH: 0.3, beamW: 0.025, ribPitch: 1.6 });
  }
  for (const line of runRails(r)) addRail(bags, line);
}

/** The spline ribbon: deck, kerbs, stringers, posts, rails and the round end pad. */
function buildPath(bags: WalkBags, path: WalkPath): void {
  const st = path.stations, hw = path.halfWidth, T = 0.05, K = BOARDWALK.kerbH;
  const last = st.length - 1;
  pathPrism(bags.timber, st, 0, last, -hw, hw, -T, 0, { ou: bags.rnd(), ov: bags.rnd() });
  pathPrism(bags.timber, st, 0, last, hw - 0.07, hw, 0, K, { ou: bags.rnd(), ov: bags.rnd() });
  pathPrism(bags.timber, st, 0, last, -hw, -hw + 0.07, 0, K, { ou: bags.rnd(), ov: bags.rnd() });
  for (const s of [-1, 1]) pathPrism(bags.metal, st, 0, last, s * (hw - 0.3) - 0.015, s * (hw - 0.3) + 0.015, -T - 0.09, -T);
  // posts every ~2.4 m under both stringers
  for (let i = 0; i <= last; i += 4) {
    const q = st[i]!;
    for (const s of [-1, 1]) {
      const o = s * (hw - 0.3);
      column(bags, q.x - q.tz * o, q.z + q.tx * o, q.y - T - 0.09, 0.028);
    }
  }
  // rails: runs of equal kind in 1.2 m chords, left (+normal) and right (-normal) side
  for (let side = 0; side < 2; side++) {
    const sg = side === 0 ? 1 : -1;
    let i = 0;
    while (i < last) {
      const kind: RailKind = path.rails[i]![side]!;
      if (kind === 'none') { i++; continue; }
      let j = i;
      while (j < last && path.rails[j]![side] === kind) j++;
      for (let k = i; k < j; k += 2) {
        const e = Math.min(j, k + 2);
        const pt = (n: number): V3 => {
          const q = st[n]!;
          return [q.x - q.tz * sg * hw, q.y, q.z + q.tx * sg * hw];
        };
        const m = st[k]!;
        const line: RailLine = { a: pt(k), b: pt(e), inward: [m.tz * sg, -m.tx * sg], kind };
        addRail(bags, line);
      }
      i = j;
    }
  }
  // round belvedere pad: disc, kerb ring open toward the path, posts
  const e = path.endPad;
  timberDisc(bags, e.x, e.y, e.z, e.r, T);
  const q = st[last]!;
  const mouth = Math.atan2(-q.tz, -q.tx); // direction from the pad centre back along the path
  const half = Math.asin(Math.min(0.99, hw / e.r)) + 0.04;
  const ring: Array<{ x: number; z: number; y: number; tx: number; tz: number }> = [];
  const n = 40;
  for (let k = 0; k <= n; k++) {
    const a = mouth + half + ((Math.PI * 2 - 2 * half) * k) / n;
    ring.push({ x: e.x + Math.cos(a) * (e.r - 0.035), z: e.z + Math.sin(a) * (e.r - 0.035), y: e.y, tx: -Math.sin(a), tz: Math.cos(a) });
  }
  pathPrism(bags.timber, ring, 0, n, -0.035, 0.035, 0, K, { ou: bags.rnd(), ov: bags.rnd() });
  metalBeam(bags, [e.x - e.r + 0.1, e.y - T - 0.05, e.z], [e.x + e.r - 0.1, e.y - T - 0.05, e.z], 0.04, 0.09);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.6;
    column(bags, e.x + Math.cos(a) * (e.r - 0.3), e.z + Math.sin(a) * (e.r - 0.3), e.y - T - 0.09, 0.028);
  }
}
export function buildBoardwalk(bags: WalkBags, side: 1 | -1): void {
  const plan = boardwalkPlan(side);
  for (const r of plan.runs) elevatedRun(bags, r);
  for (const p of plan.pads) elevatedPad(bags, p);
  if (plan.path) buildPath(bags, plan.path);
}
