// Cloud forest placement invariants (src/metro/forestLayout.ts). Run: node_modules/.bin/tsx scripts/metro-forest-test.ts
import { FOREST, MERIDIAN, VESPER } from '../src/layoutMetro';
import { walkSamples } from '../src/metro/walks';
import { crownFits, crownTopLimit, planForest } from '../src/metro/forestLayout';

let passed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) {
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
    process.exit(1);
  }
  console.log(`ok   ${name}`);
  passed++;
}

const plan = planForest();
const again = planForest();
check('deterministic', JSON.stringify(plan) === JSON.stringify(again));
check(`tree count in range (${plan.trees.length})`, plan.trees.length >= 30 && plan.trees.length <= 90);
check(`tree ferns (${plan.treeFerns.length}), ferns (${plan.ferns.length}), boulders (${plan.boulders.length})`,
  plan.treeFerns.length >= 40 && plan.ferns.length >= 600 && plan.ferns.length <= 4000 && plan.boulders.length >= 20);

const inBed = (x: number, z: number): boolean => FOREST.beds.some((b) => x >= b.xMin && x <= b.xMax && z >= b.zMin && z <= b.zMax);
check('every trunk, tree fern, fern and boulder stands in a bed',
  [...plan.trees, ...plan.treeFerns, ...plan.ferns, ...plan.boulders].every((p) => inBed(p.x, p.z)));
check('every crown fits the clearance volumes', plan.trees.every(crownFits));
check('no crown top above the absolute cap', plan.trees.every((t) => t.crownY + t.crownRV <= FOREST.capY));

// Independent re-derivation of the two clearances that matter most (trains), not via crownFits.
const bridgeOk = plan.trees.every((t) => {
  const reach = Math.abs(t.crownX) - t.crownRH;
  return reach >= FOREST.bridgeHalfX || t.crownY + t.crownRV <= MERIDIAN.railY - 2.4;
});
check('Meridian trains and rail deck never touch a crown', bridgeOk);
const vesperOk = plan.trees.every((t) => VESPER.trackZ.every((tz) =>
  Math.abs(t.crownZ - tz) - t.crownRH >= FOREST.vesperEnvelopeHalfZ || t.crownY - t.crownRV >= VESPER.railY + 4.6));
check('Vesper trains pass under every overhanging crown', vesperOk);
check('crownTopLimit rejects a footprint through the cavern wall', !isFinite(crownTopLimit(19.5, 40, 3)));
check('canopy trees reach real height (tallest > 22 m)', Math.max(...plan.trees.map((t) => t.crownY + t.crownRV + 72.5)) > 22);

// Walks: no trunk base within its flared radius + the rail line + 0.4 m of the boardwalk; canopy-walk trunks/branches clear of the deck.
const ws = walkSamples();
check('no trunk base within reach of a boardwalk, stair or landing', plan.trees.every((t) => ws.ground.every((q) => Math.hypot(q.x - t.x, q.z - t.z) >= t.trunkR * 3.3 + 0.9 + 0.4)));
check('no fern or boulder on the boardwalk deck', plan.ferns.every((f) => ws.ground.every((q) => Math.hypot(q.x - f.x, q.z - f.z) >= 1.1))
  && plan.boulders.every((b) => ws.ground.every((q) => Math.hypot(q.x - b.x, q.z - b.z) >= b.r + 0.9)));
check('canopy walk: no trunk through the deck, crowns trimmed clear of its centre line', plan.trees.every((t) => ws.air.every((q) => {
  if (q.y - 0.6 >= t.crownY + t.crownRV) return true;
  const f = Math.min(1, Math.max(0, (q.y - (-72.0)) / (t.crownY + t.crownRV + 72.0)));
  const trunk = Math.hypot(t.x + (t.crownX - t.x) * f - q.x, t.z + (t.crownZ - t.z) * f - q.z) >= 1.0 + t.trunkR;
  const crownTouches = q.y + 2.3 >= t.crownY - t.crownRV - 0.3 && q.y - 0.8 < t.crownY + t.crownRV;
  return trunk && (!crownTouches || Math.hypot(t.crownX - q.x, t.crownZ - q.z) >= t.crownRH * 0.8 + 1.0 - 1e-6);
})));

console.log(`${passed} forest checks passed | trees ${plan.trees.length} (umbrella ${plan.trees.filter((t) => t.kind === 'umbrella').length}) | tree ferns ${plan.treeFerns.length} | ferns ${plan.ferns.length} | boulders ${plan.boulders.length}`);
