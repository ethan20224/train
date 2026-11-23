// Cloud forest placement invariants (src/metro/forestLayout.ts). Run: node_modules/.bin/tsx scripts/metro-forest-test.ts
import { FOREST, MERIDIAN, VESPER } from '../src/layoutMetro';
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

console.log(`${passed} forest checks passed | trees ${plan.trees.length} (umbrella ${plan.trees.filter((t) => t.kind === 'umbrella').length}) | tree ferns ${plan.treeFerns.length} | ferns ${plan.ferns.length} | boulders ${plan.boulders.length}`);
