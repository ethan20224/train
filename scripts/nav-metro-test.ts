// Metro walkability (Task 3). Disc connectors are dynamic (Task 4), so this test covers static geometry + escalators.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { heightAt, resolve } from '../src/player/navigation';
import { FLIGHTS, HALCYON, LANDINGS, MERIDIAN, OCULUS, PLAYER, THRESHOLD, VESPER, escalatorUnits } from '../src/layout';
import { SPEED_GATES, speedGateCabinets, speedGateLanes } from '../src/layoutMetro';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };
const near = (a: number, b: number, e: number, m: string) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`);
const walk = (from: Vector3, to: Vector3, step = 0.08): Vector3 => {
  let p = from.clone();
  for (let i = 0; i < 40000; i++) {
    const d = new Vector3(to.x - p.x, 0, to.z - p.z); const len = d.length(); if (len < 1e-3) break;
    const r = resolve(p, p.clone().addScaledVector(d, Math.min(step, len) / len));
    if (Math.hypot(r.x - p.x, r.z - p.z) < 1e-7) break; p = r;
  }
  return p;
};
const at = (x: number, z: number, y: number) => new Vector3(x, heightAt(x, z, y) ?? NaN, z);
const unit = (flight: string, dir: 'down' | 'up', side: 1 | -1) =>
  escalatorUnits().find((u) => u.flight === flight && u.dir === dir && Math.sign(u.across) === side)!;

test('every up unit can be ridden from its lower landing to its upper landing', () => {
  for (const f of FLIGHTS) for (const side of [1, -1] as const) {
    const u = f.axis === 'z' ? unit(f.id, 'up', side) : escalatorUnits().find((e) => e.flight === f.id && e.dir === 'up')!;
    if (f.axis === 'z' && !u) continue;
    const dl = Math.sign(u.from - u.to) || 1; // from the lower end towards the upper end
    const pt = (a: number, y: number) => (u.axis === 'z' ? at(u.across, a, y) : at(a, u.across, y));
    const to = (a: number) => (u.axis === 'z' ? new Vector3(u.across, 0, a) : new Vector3(a, 0, u.across));
    const start = pt(u.to - dl * 0.4, u.yTo);
    const p = walk(start, to(u.from + dl * 0.4));
    near(p.y, u.yFrom, 0.05, `${u.id} up unit: start y ${start.y}, ended at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
    if (f.axis === 'x') break;
  }
});

test('hall: cannot step into the oculus or a throat; floor around them is walkable', () => {
  assert.equal(heightAt(0, OCULUS.cz, 0), null, 'oculus centre');
  assert.equal(heightAt(OCULUS.curbOuterR, OCULUS.cz, 0), null, 'curb');
  assert.equal(heightAt(10.2, 66, 0), null, 'throat');
  assert.equal(heightAt(0, 70, 0), null, 'gangway is closed without the disc runtime');
  near(heightAt(0, 60, 0)!, 0, 1e-9, 'floor south of the oculus');
  const p = walk(at(-15, 74, 0), new Vector3(15, 0, 74));
  assert.ok(p.x <= -(OCULUS.curbOuterR + PLAYER.wallClearance) + 1e-6, `blocked at the curb, x=${p.x}`);
});

const laneZ = speedGateLanes().find((l) => l.side === 1 && l.index === SPEED_GATES.lanes - 1)!.z;

test('escalator route down: hall -> F1 -> L1 -> F2 -> L2 -> F3 -> Threshold -> F4 -> Meridian -> F5 -> Crossing floor', () => {
  const dn = (id: string) => unit(id, 'down', 1).across; // F1/F3 outer down unit x 9.2, F2/F4/F5 inner down unit x 5.0
  // [x, z, expected y on arrival (optional)]. On the Meridian island the route skirts the F4 footprint, the disc well and
  // the F5 deck opening, and boards F5 from its north (upper) end.
  const route: Array<[number, number, number?]> = [
    [dn('F1'), 61.5, 0], [dn('F1'), LANDINGS.L1.zMax - 0.6, -10],
    [dn('F2'), LANDINGS.L1.zMax - 0.6], [dn('F2'), LANDINGS.L2.zMin + 0.6, -20],
    // off F3 onto the Threshold bridge, west through the third speed-gate lane (the cabinets are obstacles, the lanes pass), onto F4
    [dn('F3'), LANDINGS.L2.zMin + 0.6], [dn('F3'), LANDINGS.thresholdBridge.zMax - 0.6, -30],
    [dn('F3'), laneZ], [dn('F4'), laneZ], [dn('F4'), 50.5, MERIDIAN.topY],
    [2.0, 50.5], [2.0, 60], [6.5, 66], [6.5, 100], [1.0, 106], [1.0, 115], [dn('F5'), 115, MERIDIAN.topY],
    [dn('F5'), 70.6, VESPER.topY],
  ];
  let p = at(route[0]![0], route[0]![1], 0);
  for (const [x, z, y] of route.slice(1)) {
    p = walk(p, new Vector3(x, 0, z));
    near(p.x, x, 0.05, `x at (${x}, ${z})`); near(p.z, z, 0.05, `z at (${x}, ${z})`);
    if (y !== undefined) near(p.y, y, 1e-6, `y at (${x}, ${z})`);
  }
});

test('speed gates: every lane centre is walkable at -30, every cabinet centre is not, and each lane can be walked through', () => {
  for (const l of speedGateLanes()) {
    assert.notEqual(heightAt(l.x, l.z, THRESHOLD.y), null, `lane ${l.side}/${l.index} centre`);
    const p = walk(at(l.x + l.side * 2.5, l.z, THRESHOLD.y), new Vector3(l.x - l.side * 2.5, 0, l.z));
    near(p.x, l.x - l.side * 2.5, 0.05, `lane ${l.side}/${l.index} walked through (stopped at x=${p.x.toFixed(2)})`);
  }
  for (const c of speedGateCabinets()) {
    assert.equal(heightAt(c.x, c.z, THRESHOLD.y), null, `cabinet ${c.side}/${c.index} centre`);
    const p = walk(at(c.x + c.side * 2.5, c.z, THRESHOLD.y), new Vector3(c.x - c.side * 2.5, 0, c.z));
    assert.ok(Math.abs(p.x - c.x) > 0.5, `cabinet ${c.side}/${c.index} is solid (reached x=${p.x.toFixed(2)})`);
  }
});

test('F6: Crossing floor -> Halcyon island, and back up on the up unit', () => {
  const d = unit('F6', 'down', 1);
  let p = walk(at(-50, d.across, VESPER.topY), new Vector3(-50, 0, d.across));
  p = walk(p, new Vector3(-25.0, 0, d.across));
  near(p.y, HALCYON.topY, 1e-6, 'down to Halcyon');
  const up = unit('F6', 'up', 1);
  p = walk(p, new Vector3(-24.5, 0, up.across)); p = walk(p, new Vector3(-50, 0, up.across));
  near(p.y, VESPER.topY, 1e-6, 'back on the floor');
});

test('edges hold: void, Meridian island, Crossing floor tracks, Halcyon island, wells', () => {
  const big = (from: Vector3, to: Vector3) => resolve(from, to);
  assert.ok(big(at(0, 82, -10), new Vector3(0, 0, 90)).z <= LANDINGS.L1.zMax, 'L1 north edge');
  assert.equal(heightAt(MERIDIAN.trackX[1], 90, MERIDIAN.topY), null, 'Meridian track');
  assert.equal(heightAt(0, OCULUS.cz, MERIDIAN.topY), null, 'Meridian well');
  assert.equal(heightAt(0, VESPER.trackZ[0], VESPER.topY), null, 'Vesper track');
  assert.equal(heightAt(0, OCULUS.cz, VESPER.topY), null, 'Crossing well');
  assert.equal(heightAt(-20 + 8 * Math.SQRT1_2, 74 - 8 * Math.SQRT1_2, HALCYON.topY), null, 'Halcyon track side');
  assert.equal(heightAt(0, OCULUS.cz, THRESHOLD.y), null, 'sky hole at the Threshold');
  assert.notEqual(heightAt(0, 81.8, THRESHOLD.y), null, 'Threshold bridge across the hole');
});

test('fuzz: 100k random moves on every metro level never leave the walkable set', () => {
  const starts = [at(0, 81.8, -10), at(0, 60.5, -20), at(15, 74, -30), at(0, 40, MERIDIAN.topY), at(20, 74, VESPER.topY), at(-20, 74, HALCYON.topY)];
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const s of starts) {
    let p = s.clone();
    for (let i = 0; i < 100000 / starts.length; i++) {
      const a = rnd() * Math.PI * 2; const len = rnd() < 0.05 ? rnd() * 20 : rnd() * 0.4;
      p = resolve(p, new Vector3(p.x + Math.cos(a) * len, 0, p.z + Math.sin(a) * len));
      assert.notEqual(heightAt(p.x, p.z, p.y), null, `left the walkable set at (${p.x}, ${p.y}, ${p.z})`);
    }
  }
});
console.log(`\n${passed} metro nav checks passed (flights: ${FLIGHTS.length})`);
