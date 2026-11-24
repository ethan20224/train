import { CANOPY_WALK, SKY } from '../../layoutMetro';
import { canopyPlan, type WalkRun } from '../../metro/walks';
import { WalkBags, addRail, deckRun, metalBeam, metalBox, metalDisc, metalRod, padRails, padSlab, pointAt, runRails, stairRun, type V3 } from './walkKit';

/**
 * The canopy walk (plan: src/metro/walks.ts canopyPlan, coordinates: layoutMetro CANOPY_WALK): a 2.0 m oiled-oak deck on slim
 * stainless edge beams with a 1.1 m glass balustrade, timber handrail and a warm LED line under it, hung from the buried sky on
 * hairline 24 mm stainless rods (same language as the Meridian hangers) every ~4.6 m, with cast brackets at the deck edge and
 * flush rosettes in the sky plane. Nothing touches the ground or a train.
 */

const SKY_Y = SKY.y - 0.03;

/** One hairline hanger at (x, z): clevis bracket reaching from the deck fascia (fx, fz) out to the rod, rod up to the sky rosette. */
function hanger(bags: WalkBags, fx: number, fz: number, x: number, z: number, yDeck: number): void {
  const yB = yDeck - 0.1;
  if (Math.hypot(x - fx, z - fz) > 0.01) metalBeam(bags, [fx, yB, fz], [x, yB, z], 0.03, 0.03);
  metalBox(bags, x - 0.03, yB - 0.07, z - 0.03, x + 0.03, yB + 0.07, z + 0.03);
  metalRod(bags, [x, yB + 0.07, z], [x, SKY_Y - 0.1, z], 0.012, 6);
  metalRod(bags, [x, SKY_Y - 0.5, z], [x, SKY_Y - 0.1, z], 0.02, 8);
  metalDisc(bags, [x, SKY_Y - 0.01, z], 0.11, 0.02);
}

function runHangers(bags: WalkBags, r: WalkRun): void {
  const len = Math.abs(r.to - r.from), dir = Math.sign(r.to - r.from) || 1;
  const n = Math.max(1, Math.round(len / CANOPY_WALK.rodPitch));
  for (let k = 0; k < n; k++) {
    const c = r.from + (dir * len * (k + 0.5)) / n;
    for (const s of [-1, 1]) {
      const f: V3 = pointAt(r, c, s * (r.halfWidth - 0.01));
      const o: V3 = pointAt(r, c, s * (r.halfWidth + CANOPY_WALK.rodOffset));
      hanger(bags, f[0], f[2], o[0], o[2], f[1]);
    }
  }
}

export function buildCanopyWalk(bags: WalkBags): void {
  const plan = canopyPlan();
  for (const r of plan.runs) {
    if (r.kind === 'stair') stairRun(bags, r);
    else deckRun(bags, r, { slabT: 0.05, beamH: r.kind === 'bridge' ? 0.2 : 0.16, beamW: 0.02, ribPitch: 1.5 });
    for (const line of runRails(r)) addRail(bags, line);
    runHangers(bags, r);
  }
  for (const p of plan.pads) {
    padSlab(bags, p, { slabT: 0.05, beamH: 0.16 });
    for (const line of padRails(p)) addRail(bags, line);
    // rods at the pad corners that carry a balustrade on either adjacent side
    for (const sx of [-1, 1] as const) for (const sz of [-1, 1] as const) {
      const sideX = sx > 0 ? 'e' : 'w', sideZ = sz > 0 ? 'n' : 's';
      if (!p.railKinds[sideX] && !p.railKinds[sideZ]) continue;
      hanger(bags, p.x + sx * (p.hx - 0.01), p.z + sz * (p.hz - 0.01), p.x + sx * (p.hx + CANOPY_WALK.rodOffset), p.z + sz * (p.hz + CANOPY_WALK.rodOffset), p.y);
    }
  }
}
