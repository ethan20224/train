// Root Wall invariants (src/metro/rootWallLayout.ts). Run: node_modules/.bin/tsx scripts/metro-rootwall-test.ts
import { DROPLETS, FUNICULAR, OCULUS, PORTAL, ROOT_WALL as RW, VESPER, funicularRailTopAt, funicularRailUndersideAt } from '../src/layoutMetro';
import { BORES, boreDist, reliefDepth, rootMinXAt, rootWallPlan } from '../src/metro/rootWallLayout';

let passed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) {
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
    process.exit(1);
  }
  console.log(`ok   ${name}`);
  passed++;
}

const plan = rootWallPlan();
const F = RW.faceX;

// ---- plan sanity ---------------------------------------------------------------------------------------------------------
check('deterministic', JSON.stringify(plan.curves.slice(0, 3)) === JSON.stringify(rootWallPlan().curves.slice(0, 3)) && reliefDepth(74.3, -50.2) === reliefDepth(74.3, -50.2));
const big = plan.curves.length, thin = plan.thin.length;
check(`root counts (${big} fused roots, ${thin} thin roots)`, big >= 25 && big <= 60 && thin >= 25);
const allR = [...plan.curves.flatMap((c) => c.r), ...plan.thin.flatMap((t) => t.r)];
check(`radii span thin strands to buttress trunks (${Math.min(...allR).toFixed(2)}..${Math.max(...allR).toFixed(2)} m)`, Math.min(...allR) < 0.1 && Math.max(...allR) > 1.2 && Math.max(...allR) < 2.2);
check('every portal opening is the 5.0 x 5.5 m bore at the east wall', BORES.length === 2 && BORES.every((b, i) => Math.abs(b.z1 - b.z0 - PORTAL.w) < 1e-9 && Math.abs((b.y1 - b.y0) - PORTAL.h) < 1e-9 && Math.abs((b.z0 + b.z1) / 2 - VESPER.trackZ[i]!) < 1e-9));

// ---- roots never enter the openings (+ margin), so never a train envelope ----------------------------------------------------
const margin = RW.boreMargin - 1e-6;
const curveBad = plan.curves.filter((c) => c.z.some((z, i) => boreDist(z, c.y[i]!) < c.r[i]! + margin));
check('fused root curves keep r + 0.15 m from both portal openings', curveBad.length === 0, `${curveBad.length} curves`);
const thinBad = plan.thin.filter((t) => t.z.some((z, i) => boreDist(z, t.y[i]!) < t.r[i]! + margin));
check('thin roots keep r + 0.15 m from both portal openings', thinBad.length === 0, `${thinBad.length} roots`);

// train envelopes (z +-1.6 around each track, y -71.2..-67.0, x >= 57) lie inside the openings; sample the relief over them with 0.15 m margin
let envMax = 0, openMax = 0;
for (const tz of VESPER.trackZ) {
  for (let z = tz - 2.65; z <= tz + 2.65; z += 0.05) {
    for (let y = -71.85; y <= -66.05; y += 0.05) {
      const d = reliefDepth(z, y);
      if (boreDist(z, y) < RW.boreMargin) openMax = Math.max(openMax, d);
      if (Math.abs(z - tz) <= 1.6 && y >= -71.2 && y <= -67.0) envMax = Math.max(envMax, d);
    }
  }
}
check('relief is exactly zero inside the openings + 0.15 m margin (train envelopes included)', openMax === 0 && envMax === 0, `open ${openMax}, env ${envMax}`);

// ---- relief field: depth caps and the 57.0 m limit ------------------------------------------------------------------------
let minX = Infinity, minXLow = Infinity, maxD = 0, nz = 0;
for (let z = RW.zMin; z <= RW.zMax; z += 0.1) {
  for (let y = RW.yFloor; y <= RW.yTop; y += 0.1) {
    const d = reliefDepth(z, y);
    maxD = Math.max(maxD, d);
    minX = Math.min(minX, F - d);
    if (y < RW.lowY) minXLow = Math.min(minXLow, F - d);
    if (F - d < rootMinXAt(y) - 1e-6) nz++;
  }
}
check(`relief never passes x = 57.0 below y = -60 (min x there ${minXLow.toFixed(2)})`, minXLow >= RW.minXBelow);
check(`roots stay within 58.6 <= x below y = -58 (relief cap, max depth there <= ${RW.depthCapLow + 0.06})`, (() => {
  let m = Infinity;
  for (let z = RW.zMin; z <= RW.zMax; z += 0.1) for (let y = RW.yFloor; y <= RW.capRampY[0]; y += 0.1) m = Math.min(m, F - reliefDepth(z, y));
  return m >= RW.rootMinX - 0.01;
})());
check(`trunk mass stays behind x = 57.0 everywhere (min x ${minX.toFixed(2)}, max depth ${maxD.toFixed(2)} m)`, minX >= RW.minXBelow && nz === 0);

// thin roots as the builder places them: x = max(rootMinXAt(y) + r, F - d - 0.2 r); surface x - r
let thinMin = Infinity;
for (const t of plan.thin) for (let i = 0; i < t.z.length; i++) {
  const r = t.r[i]!, y = t.y[i]!;
  const x = Math.max(rootMinXAt(y) + r, F - reliefDepth(t.z[i]!, y) - 0.2 * r);
  thinMin = Math.min(thinMin, y < RW.lowY ? x - r : Infinity);
}
check(`thin roots below y = -60 hug the wall (surface x >= ${thinMin.toFixed(2)})`, thinMin >= RW.rootMinX - 1e-6);

// ---- crown, limbs and aerial strands vs funicular, droplets, sky, wall -----------------------------------------------------------
interface P { x: number; y: number; z: number; rad: number; what: string }
const pts: P[] = [];
for (const c of plan.clumps) pts.push({ x: c.x, y: c.y, z: c.z, rad: c.size * 0.6, what: 'clump' });
for (const l of plan.limbs) l.pts.forEach((p, i) => pts.push({ x: p[0], y: p[1], z: p[2], rad: l.r[i]!, what: 'limb' }));
for (const a of plan.aerials) for (const p of a.pts) pts.push({ x: p[0], y: p[1], z: p[2], rad: a.r, what: 'aerial' });
for (const m of plan.moss) pts.push({ x: m.x, y: m.y - m.len, z: m.z, rad: m.w / 2, what: 'moss' });

const funi = (x: number, y: number, z: number, rad: number): boolean => {
  if (x < FUNICULAR.top[0] - rad || x > FUNICULAR.bottom[0] + FUNICULAR.cabinLength + 0.3 + rad) return false;
  if (Math.abs(z - FUNICULAR.z) > FUNICULAR.trackHalfWidth + 0.5 + rad) return false;
  const xx = Math.min(FUNICULAR.bottom[0] + FUNICULAR.cabinLength, Math.max(FUNICULAR.top[0], x));
  const lo = funicularRailUndersideAt(xx) - 0.5 - rad, hi = funicularRailTopAt(xx) + FUNICULAR.floorThickness + FUNICULAR.cabinHeight + 0.5 + rad;
  return y > lo && y < hi;
};
const hit = pts.filter((p) => funi(p.x, p.y, p.z, p.rad));
check('crown, limbs, moss and aerial strands clear the funicular swept volume (0.5 m)', hit.length === 0, hit[0] ? `${hit[0].what} at ${hit[0].x.toFixed(1)},${hit[0].y.toFixed(1)},${hit[0].z.toFixed(1)}` : '');
let reliefHit = 0;
for (let z = FUNICULAR.z - 3; z <= FUNICULAR.z + 3; z += 0.1) for (let y = RW.yFloor; y <= RW.yTop; y += 0.1) { if (funi(F - reliefDepth(z, y), y, z, 0)) reliefHit++; }
check('relief clears the funicular swept volume', reliefHit === 0, `${reliefHit} samples`);

const slotHit = pts.filter((p) => p.x - p.rad < FUNICULAR.skySlot.xMax + 0.5 && Math.abs(p.z - FUNICULAR.z) < FUNICULAR.skySlot.halfZ + 0.5 + p.rad && p.y + p.rad > -34);
check('nothing enters the funicular sky slot', slotHit.length === 0);

const dropHit = pts.filter((p) => {
  if (p.y - p.rad > DROPLETS.yTop + RW.crown.dropletClear || p.y + p.rad < DROPLETS.yBottomMin - RW.crown.dropletClear) return false;
  const r = Math.hypot(p.x - OCULUS.cx, p.z - OCULUS.cz);
  return r + p.rad > DROPLETS.rInner - RW.crown.dropletClear && r - p.rad < DROPLETS.rOuter + RW.crown.dropletClear;
});
check('crown stays >= 0.5 m from the droplet ring', dropHit.length === 0, `${dropHit.length}`);
check(`crown x >= ${RW.crown.xMin} (nearest foliage/limb ${Math.min(...pts.filter((p) => p.what !== 'aerial' && p.what !== 'moss').map((p) => p.x - (p.what === 'clump' ? p.rad : 0))).toFixed(1)})`,
  pts.filter((p) => p.what === 'clump').every((p) => p.x - p.rad >= RW.crown.xMin - 1e-6) && plan.limbs.every((l) => l.pts.every((p) => p[0] >= RW.crown.xMin)));
const skyTop = Math.max(...pts.filter((p) => p.what === 'clump').map((p) => p.y + p.rad));
check(`foliage stays below the sky plane (top ${skyTop.toFixed(2)} <= ${RW.crown.topCapY})`, skyTop <= RW.crown.topCapY + 1e-6 && plan.limbs.every((l) => l.pts.every((p) => p[1] + 0.2 < -33)));
check('foliage clumps stay in front of the wall face', plan.clumps.every((c) => c.x + c.size * 0.6 <= F + 1e-6 && c.z - c.size * 0.5 >= RW.zMin - 1e-6 && c.z + c.size * 0.5 <= RW.zMax + 1e-6));
check('nothing of the crown or strands passes x < 57.0 below y = -60', pts.every((p) => !(p.y - p.rad < RW.lowY && p.x - p.rad < RW.minXBelow)));
const lens = plan.aerials.map((a) => a.pts[0]![1] - a.pts[a.pts.length - 1]![1]);
check(`aerial strands hang ${RW.aerial.lenMin / 2}..${RW.aerial.lenMax} m (${plan.aerials.length} strands, longest ${Math.max(...lens).toFixed(1)} m)`, plan.aerials.length >= 40 && Math.max(...lens) >= 10 && Math.max(...lens) <= RW.aerial.lenMax + 1e-6 && plan.aerials.every((a) => a.pts[a.pts.length - 1]![1] >= RW.aerial.yMin - 1e-6));
check(`clump count sane for the budget (${plan.clumps.length} clumps)`, plan.clumps.length >= 250 && plan.clumps.length <= 900);

console.log(`${passed} root wall checks passed | fused ${big} | thin ${thin} | limbs ${plan.limbs.length} | clumps ${plan.clumps.length} | aerials ${plan.aerials.length} | moss ${plan.moss.length}`);
