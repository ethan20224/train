// Geometry invariants of the Meridian Deep layout (spec §2). Run: npm run metro-layout-test
import assert from 'node:assert/strict';
import {
  CAVERN, DISC, ESCALATOR, FLIGHTS, FUNICULAR, HALCYON, LANDINGS, LIFTS, MERIDIAN, METRO_TRAIN, OCULUS, PSD, SKY,
  THRESHOLD, THROAT, VESPER, escalatorUnits, voidRadiusAt,
} from '../src/layoutMetro';
import { GATES, KIOSK } from '../src/layout';

let passed = 0;
const test = (name: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${name}`); };
const TAN30 = Math.tan(Math.PI / 6);
const flight = (id: string) => { const f = FLIGHTS.find((x) => x.id === id); assert.ok(f, id); return f!; };
/** Step height of flight f at axis coordinate c. */
const yAt = (id: string, c: number): number => { const f = flight(id); const t = (c - f.from) / (f.to - f.from); return f.yFrom + (f.yTo - f.yFrom) * t; };
const perpToHalcyon = (x: number, z: number): number => {
  const [cx, cz] = HALCYON.centre; const [ux, uz] = HALCYON.dir;
  return Math.abs(-(x - cx) * uz + (z - cz) * ux);
};
const MEDALLION_EDGE_Z = KIOSK.center[1] + 9.46; // MEDALLION_R in src/world/concourse/floor.ts

test('every flight is a 30° incline', () => {
  for (const f of FLIGHTS) assert.ok(Math.abs(Math.abs(f.yTo - f.yFrom) / Math.abs(f.to - f.from) - TAN30) < 1e-6, f.id);
});

test('flights chain through their landings (spec §2.3)', () => {
  const inZ = (z: number, r: { zMin: number; zMax: number }) => z >= r.zMin - 0.05 && z <= r.zMax + 0.05;
  assert.ok(inZ(flight('F1').to, LANDINGS.L1) && inZ(flight('F2').from, LANDINGS.L1), 'L1');
  assert.ok(inZ(flight('F2').to, LANDINGS.L2) && inZ(flight('F3').from, LANDINGS.L2), 'L2');
  assert.ok(inZ(flight('F3').to, LANDINGS.thresholdBridge) && inZ(flight('F4').from, LANDINGS.thresholdBridge), 'threshold');
  const isl = MERIDIAN.island;
  assert.ok(flight('F4').to > isl.zMin + 2 && flight('F5').from < isl.zMax - 2, 'F4 lands / F5 departs on the Meridian island');
  assert.ok(inZ(flight('F5').to, VESPER.floor), 'F5 lands on the Crossing floor');
  assert.ok(flight('F6').from >= VESPER.floor.xMin + 2, 'F6 starts on the Crossing floor');
  assert.ok(perpToHalcyon(flight('F6').to, 67.8) <= HALCYON.halfWidth - 1, 'F6 lands on the Halcyon island');
  assert.equal(flight('F1').yFrom, 0); assert.equal(flight('F5').yTo, VESPER.topY); assert.equal(flight('F6').yTo, HALCYON.topY);
});

test('22 escalator units with unique ids; inner unit of each z band runs down', () => {
  const u = escalatorUnits();
  assert.equal(u.length, 22);
  assert.equal(new Set(u.map((x) => x.id)).size, 22);
  for (const x of u.filter((q) => q.axis === 'z')) {
    const twin = u.find((q) => q.flight === x.flight && q !== x && Math.sign(q.across) === Math.sign(x.across))!;
    assert.equal(x.dir === 'down', Math.abs(x.across) < Math.abs(twin.across), `${x.id} direction`);
  }
  for (const x of u) {
    const travel = Math.sign(x.to - x.from);
    assert.equal(x.sign, x.dir === 'down' ? travel : -travel, `${x.id} sign`);
  }
});

test('disc column clears every z-axis flight band by >= 0.7 m', () => {
  for (const f of FLIGHTS.filter((q) => q.axis === 'z')) for (const [a, b] of f.bands) {
    assert.ok(Math.min(Math.abs(a), Math.abs(b)) - DISC.r >= 0.7 - 1e-9, `${f.id} band ${a}..${b}`);
  }
});

test('F4 and F5 bands sit >= 0.85 m inside the Meridian screen-door line', () => {
  const doorLine = MERIDIAN.island.xMax - PSD.inset;
  for (const id of ['F4', 'F5']) for (const [a, b] of flight(id).bands) {
    assert.ok(doorLine - Math.max(Math.abs(a), Math.abs(b)) >= 0.85 - 1e-9, `${id}`);
  }
});

test('F5 clears the Vesper north train roof by >= 3.5 m', () => {
  const roof = VESPER.railY + METRO_TRAIN.height;
  assert.ok(yAt('F5', VESPER.trackZ[1]) - roof >= 3.5, `F5 at the north track: ${yAt('F5', VESPER.trackZ[1])}`);
});

test('F4 passes through the sky inside the hole', () => {
  const f = flight('F4');
  const z = f.from + ((SKY.y - f.yFrom) / (f.yTo - f.yFrom)) * (f.to - f.from);
  for (const [a, b] of f.bands) {
    const x = Math.max(Math.abs(a), Math.abs(b));
    assert.ok(Math.hypot(x, z - OCULUS.cz) <= SKY.holeR - 1, `F4 band edge at sky: r=${Math.hypot(x, z - OCULUS.cz)}`);
  }
});

test('hall: oculus fits between the kiosk medallion and the gate approach; throats clear the curb', () => {
  assert.ok(OCULUS.cz - OCULUS.curbOuterR >= MEDALLION_EDGE_Z + 4, 'south of oculus');
  assert.ok(OCULUS.cz + OCULUS.curbOuterR <= GATES.approachZMin - 4, 'north of oculus');
  assert.ok(THROAT.zMin >= MEDALLION_EDGE_Z + 2, 'throat south of medallion');
  for (const [a, b] of THROAT.bands) {
    const x = Math.min(Math.abs(a), Math.abs(b));
    assert.ok(Math.hypot(x, THROAT.zMax - OCULUS.cz) >= OCULUS.curbOuterR, 'throat corner outside the curb');
  }
});

test('F1 rider head clears the slab edge by >= 0.5 m; F1 is inside the bell beyond the dome slot', () => {
  assert.ok(OCULUS.slabUnderY - (yAt('F1', THROAT.zMax) + 1.8) >= 0.5, 'head clearance at the throat end');
  for (let z = THROAT.domeSlotEndZ; z <= flight('F1').to; z += 0.25) {
    const y = yAt('F1', z);
    for (const [a, b] of flight('F1').bands) {
      const x = Math.max(Math.abs(a), Math.abs(b));
      assert.ok(Math.hypot(x, z - OCULUS.cz) <= voidRadiusAt(y) - 0.3, `F1 outside bell at z=${z}`);
    }
  }
});

test('landing bridges never cross the disc column', () => {
  for (const L of [LANDINGS.L1, LANDINGS.L2, LANDINGS.thresholdBridge]) {
    assert.ok(L.zMin >= OCULUS.cz + DISC.r + 0.5 || L.zMax <= OCULUS.cz - DISC.r - 0.5, `${L.zMin}..${L.zMax}`);
  }
});

test('capsule lifts: on the Threshold annulus, outside the sky hole, on the Crossing floor and the Halcyon island', () => {
  for (const [x, z] of LIFTS.positions) {
    const r = Math.hypot(x, z - OCULUS.cz);
    assert.ok(r - LIFTS.tubeR >= THRESHOLD.rInner && r + LIFTS.tubeR <= THRESHOLD.rOuter, `annulus r=${r}`);
    assert.ok(r - LIFTS.tubeR >= SKY.holeR, 'outside hole');
    assert.ok(z - LIFTS.tubeR >= VESPER.floor.zMin && z + LIFTS.tubeR <= VESPER.floor.zMax, 'on the floor');
    assert.ok(perpToHalcyon(x, z) + LIFTS.tubeR <= HALCYON.halfWidth, 'on the Halcyon island');
  }
});

test('funicular: top on the annulus, bottom on the floor, clear of the hole and the Meridian trains', () => {
  const [tx, ty] = FUNICULAR.top; const [bx, by] = FUNICULAR.bottom;
  assert.ok(Math.abs(Math.abs(ty - by) / Math.abs(bx - tx) - 1) < 1e-9, '45°');
  assert.ok(Math.hypot(tx, FUNICULAR.z - OCULUS.cz) >= THRESHOLD.rInner && ty === THRESHOLD.y, 'top on the Threshold');
  assert.ok(bx <= VESPER.floor.xMax && by === VESPER.topY, 'bottom on the floor');
  const xAtSky = tx + (ty - SKY.y);
  assert.ok(Math.hypot(xAtSky, FUNICULAR.z - OCULUS.cz) >= SKY.holeR, 'pierces the sky outside the hole');
  assert.ok(tx - FUNICULAR.cabinWidth / 2 >= MERIDIAN.trackX[1] + METRO_TRAIN.width / 2 + 1, 'clear of Meridian east train');
});

test('levels stack without collisions', () => {
  assert.ok(MERIDIAN.topY - 1.5 >= VESPER.railY + METRO_TRAIN.height + 10, 'bridge deck over Vesper trains');
  assert.ok(HALCYON.railY + METRO_TRAIN.height + 1.5 <= VESPER.railY - 1.4, 'Halcyon trains under the Vesper trench');
  assert.ok(MERIDIAN.island.xMax - PSD.inset + METRO_TRAIN.width / 2 <= MERIDIAN.trackX[1] + 0.1, 'Meridian track offset');
  assert.ok(CAVERN.nave.xMax >= MERIDIAN.trackX[1] + METRO_TRAIN.width / 2 + 2, 'nave wide enough');
});

console.log(`\n${passed} metro layout checks passed`);
