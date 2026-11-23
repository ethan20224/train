// Metro walkability (Task 3). Disc connectors are dynamic (Task 4), so this test covers static geometry + escalators.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { heightAt, resolve } from '../src/player/navigation';
import { FLIGHTS, HALCYON, LANDINGS, MERIDIAN, OCULUS, PLAYER, THRESHOLD, VESPER, escalatorUnits } from '../src/layout';
import { CROSSING, DISC, FUNICULAR, LIFTS, SPEED_GATES, TICKET_HALL, fareLines, speedGateCabinets, speedGateLanes, totemObstacleCircles } from '../src/layoutMetro';
import { liftCallButtonPos, liftDoorDir } from '../src/metro/lifts';

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

const laneZ = speedGateLanes().find((l) => l.line === 'east' && l.index === 2)!.z;

test('escalator route down: hall -> F1 -> L1 -> F2 -> L2 -> F3 -> Threshold -> F4 -> Meridian -> F5 -> Crossing floor', () => {
  const dn = (id: string) => unit(id, 'down', 1).across; // F1/F3 outer down unit x 9.2, F2/F4/F5 inner down unit x 5.0
  // [x, z, expected y on arrival (optional)]. On the Meridian island the route skirts the F4 footprint, the disc well and
  // the F5 deck opening, and boards F5 from its north (upper) end.
  const route: Array<[number, number, number?]> = [
    [dn('F1'), 61.5, 0], [dn('F1'), LANDINGS.L1.zMax - 0.6, -10],
    [dn('F2'), LANDINGS.L1.zMax - 0.6], [dn('F2'), LANDINGS.L2.zMin + 0.6, -20],
    // off F3 onto the Threshold bridge, west through the third lane of the east fare line (the cabinets are obstacles, the lanes pass), onto F4
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

const T0 = THRESHOLD.y;
const lanesAll = speedGateLanes();

test('fare line: every lane is a straight walkable corridor (heightAt samples) and can be walked through; cabinets are solid', () => {
  for (const l of lanesAll) {
    const tag = `${l.line}/${l.index}`;
    for (let x = l.x - 2.5; x <= l.x + 2.5 + 1e-9; x += 0.05) {
      assert.notEqual(heightAt(x, l.z, T0), null, `lane ${tag}: blocked at x=${x.toFixed(2)}`);
    }
    // the corridor is wide enough for a person: +-0.2 m about the lane centre is walkable all along the cabinets
    for (const dz of [-0.2, 0.2]) for (let x = l.x - 1.2; x <= l.x + 1.2; x += 0.1) assert.notEqual(heightAt(x, l.z + dz, T0), null, `lane ${tag}: narrower than 0.4 m at x=${x.toFixed(2)}, dz=${dz}`);
    const from = l.x - l.inward * 2.5, to = l.x + l.inward * 2.5;
    const p = walk(at(from, l.z, T0), new Vector3(to, 0, l.z));
    near(p.x, to, 0.05, `lane ${tag} walked through (stopped at x=${p.x.toFixed(2)})`);
  }
  for (const c of speedGateCabinets()) {
    assert.equal(heightAt(c.x, c.z, T0), null, `cabinet ${c.line}/${c.index} centre`);
    const l = fareLines().find((f) => f.id === c.line)!;
    const p = walk(at(c.x - l.inward * 2.5, c.z, T0), new Vector3(c.x + l.inward * 2.5, 0, c.z));
    assert.ok(Math.abs(p.x - c.x) > 0.5, `cabinet ${c.line}/${c.index} is solid (reached x=${p.x.toFixed(2)})`);
  }
});

test('fare line: fixed glass is solid (walking at it from either side never crosses the line)', () => {
  let tried = 0;
  for (const line of fareLines()) for (const g of line.glass) {
    const a = Math.min(g.t0, g.t1), b = Math.max(g.t0, g.t1);
    for (const f of [0.15, 0.5, 0.85]) {
      const t = a + (b - a) * f;
      for (const side of [-1, 1] as const) {
        const [sx, sz, ex, ez] = g.axis === 'z' ? [g.at - side * 1.2, t, g.at + side * 1.2, t] : [t, g.at - side * 1.2, t, g.at + side * 1.2];
        const hs = heightAt(sx, sz, T0), he = heightAt(ex, ez, T0);
        if (hs === null) continue;
        if (he === null) { tried++; continue; } // the far side is not walkable at all (the wall pocket): sealed by definition
        const p = walk(at(sx, sz, T0), new Vector3(ex, 0, ez));
        const crossed = g.axis === 'z' ? Math.sign(p.x - g.at) === side : Math.sign(p.z - g.at) === side;
        assert.ok(!crossed, `${line.id} glass ${g.axis}=${g.at.toFixed(2)} t=${t.toFixed(2)} crossed from side ${side} to (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
        tried++;
      }
    }
  }
  assert.ok(tried >= 30, `glass barrier probes: ${tried}`);
});

/** 4-connected flood fill at the Threshold level on a 0.1 m grid of heightAt. `masked` cells (the lane corridors) are not passable. */
function flood(seeds: Array<[number, number]>, masked: (x: number, z: number) => boolean): { has: (x: number, z: number) => boolean; count: number; nearest: (x: number, z: number, r: number) => boolean } {
  const X0 = -21.5, Z0 = 52, STEP = 0.1, NX = Math.ceil(48.5 / STEP), NZ = Math.ceil(44 / STEP);
  const seen = new Uint8Array(NX * NZ);
  const ok = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < NX && j < NZ;
  const cell = (x: number, z: number): [number, number] => [Math.round((x - X0) / STEP), Math.round((z - Z0) / STEP)];
  const stack: number[] = [];
  for (const [x, z] of seeds) {
    assert.notEqual(heightAt(x, z, T0), null, `flood seed (${x}, ${z}) must be walkable`);
    const [i, j] = cell(x, z); stack.push(i, j); seen[j * NX + i] = 1;
  }
  let count = 0;
  while (stack.length) {
    const j = stack.pop()!, i = stack.pop()!;
    count++;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di, nj = j + dj;
      if (!ok(ni, nj) || seen[nj * NX + ni]) continue;
      const x = X0 + ni * STEP, z = Z0 + nj * STEP;
      if (masked(x, z) || heightAt(x, z, T0) === null) continue;
      seen[nj * NX + ni] = 1; stack.push(ni, nj);
    }
  }
  return {
    count,
    has: (x, z) => { const [i, j] = cell(x, z); return ok(i, j) && seen[j * NX + i] === 1; },
    nearest: (x, z, r) => { for (let dx = -r; dx <= r + 1e-9; dx += STEP) for (let dz = -r; dz <= r + 1e-9; dz += STEP) if (Math.hypot(dx, dz) <= r) { const [i, j] = cell(x + dx, z + dz); if (ok(i, j) && seen[j * NX + i]) return true; } return false; },
  };
}
const inLaneCorridor = (x: number, z: number): boolean => lanesAll.some((l) => Math.abs(x - l.x) <= SPEED_GATES.cabinetLength / 2 + SPEED_GATES.collidePad + 0.15 && Math.abs(z - l.z) <= l.width / 2 + 0.05);

test('fare line seals: from the F3 landings you reach NO F4 head, NO lift door or call button, NO funicular boarding side without a lane', () => {
  const outer: Array<[number, number]> = [[9.2, 80.8], [11.2, 80.8], [-9.2, 80.8], [-11.2, 80.8]];
  // control: with the lane corridors OPEN the same flood reaches everything, so the seal above is the lanes and not a hole in the test
  const open = flood(outer, () => false);
  assert.ok(open.has(5, 80.0) && open.has(-5, 80.0) && open.has(-15, 82.5) && open.has(22, 71.4) && open.has(22, 76.6) && open.has(0, 88), 'control: through the lanes the F3 landings reach the F4 heads, the lobby, both funicular sides and the north sector');
  const r = flood(outer, inLaneCorridor);
  assert.ok(r.count > 8000, `positive control: the unpaid ring is large (${r.count} cells)`);
  assert.ok(r.has(0, 56) && r.has(15, 66) && r.has(-11, 90) && r.has(19.0, 74), 'positive control: the unpaid ring reaches the south arc, the east arc, the north-west corner and the funicular vestibule');
  for (const x of [-7, -5, 5, 7]) assert.ok(!r.has(x, 80.0), `F4 head x=${x} is unreachable from the F3 landings`);
  assert.ok(!r.has(0, 88) && !r.has(4, 86) && !r.has(-4, 86), 'the paid north sector is unreachable');
  for (let li = 0; li < LIFTS.positions.length; li++) {
    const [lx, lz] = LIFTS.positions[li]!, d = liftDoorDir(li, 0);
    assert.notEqual(heightAt(lx + d.x * 2.1, lz + d.z * 2.1, T0), null, `lift ${li} door front is walkable`);
    assert.ok(!r.has(lx + d.x * 2.1, lz + d.z * 2.1), `lift ${li} door front is unreachable from the F3 landings`);
    const b = liftCallButtonPos(li, 0);
    assert.ok(!r.nearest(b.x, b.z, 1.3), `lift ${li} call button is unreachable from the F3 landings`);
  }
  for (const [x, z] of [[22.0, 71.4], [22.0, 76.6]] as const) assert.ok(!r.has(x, z), `funicular boarding side (${x}, ${z}) is unreachable from the F3 landings`);
  // the lift lobby is sealed: its interior is not part of the ring
  assert.ok(!r.has(-15.0, 82.5) && !r.has(-15.5, 74.0), 'lift lobby interior is sealed');
});

test('fare line: inside each paid zone the F4 heads, lift doors and call buttons, and funicular boarding sides are reachable; and the zones stay sealed from each other', () => {
  const north = flood([[4.0, 86.0], [-4.0, 86.0]], inLaneCorridor);
  for (const x of [-7, -5, 5, 7]) assert.ok(north.has(x, 80.0), `F4 head x=${x} is reachable inside the paid north sector`);
  assert.ok(!north.has(9.2, 80.8) && !north.has(-9.2, 80.8) && !north.has(-15, 82.5) && !north.has(22, 71.4), 'the north sector does not leak to the F3 landings, the lobby or the funicular');
  const lobby = flood([[-15.0, 82.5]], inLaneCorridor);
  for (let li = 0; li < LIFTS.positions.length; li++) {
    const [lx, lz] = LIFTS.positions[li]!, d = liftDoorDir(li, 0);
    assert.ok(lobby.has(lx + d.x * 2.1, lz + d.z * 2.1), `lift ${li} door front is reachable inside the lobby`);
    const b = liftCallButtonPos(li, 0);
    assert.ok(lobby.nearest(b.x, b.z, 1.3), `lift ${li} call button is reachable inside the lobby (button at ${b.x.toFixed(2)}, ${b.z.toFixed(2)})`);
  }
  assert.ok(!lobby.has(-11, 84) && !lobby.has(-9.2, 80.8), 'the lobby does not leak to the unpaid ring');
  // the cabin bay separates the two boarding landings: each is entered by its own lane
  for (const [x, z] of [[22.0, 71.4], [22.0, 76.6]] as const) {
    const fun = flood([[x, z]], inLaneCorridor);
    assert.ok(fun.has(x, z) && fun.count > 100, `funicular boarding side (${x}, ${z}) is reachable inside the station`);
    assert.ok(!fun.has(19.0, 74.0) && !fun.has(9.2, 80.8) && !fun.has(-9.2, 80.8), `the funicular station side (${x}, ${z}) does not leak to the ring`);
  }
});

test('fare line clears its neighbours: escalator exits stay open, funicular cabinets stop short of the cabin, nothing sits inside a lift door corridor', () => {
  for (const x of [-11.2, -9.2, -7.0, -5.0, 5.0, 7.0, 9.2, 11.2]) assert.notEqual(heightAt(x, 80.5, T0), null, `escalator exit at x=${x} is walkable`);
  for (const c of fareLines().find((l) => l.id === 'funicular')!.cabinets) assert.ok(c.x + SPEED_GATES.cabinetLength / 2 <= FUNICULAR.top[0] - 0.1, 'funicular cabinets end clear of the docked cabin');
  for (let li = 0; li < LIFTS.positions.length; li++) {
    const [lx, lz] = LIFTS.positions[li]!, d = liftDoorDir(li, 0);
    for (const r of [1.9, 2.1, 2.4, 2.8]) assert.notEqual(heightAt(lx + d.x * r, lz + d.z * r, T0), null, `lift ${li} door corridor is open at r=${r}`);
  }
});

test('ticket hall: the totems block (centre not walkable) and stand outside every lane corridor', () => {
  const c = totemObstacleCircles();
  assert.ok(c.length >= 6);
  for (const k of c) {
    assert.equal(heightAt(k.x, k.z, T0), null, `totem circle (${k.x.toFixed(2)}, ${k.z.toFixed(2)}) blocks`);
    assert.ok(!inLaneCorridor(k.x, k.z), 'totem is not in a lane corridor');
  }
  assert.ok(TICKET_HALL.totem.x > 9.5, 'totems stand clear of the F3 down-unit exit corridor');
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

test('Crossing floor (P3-4): monolith benches block, well ring blocks all round when closed, Vesper edge screens and floor ends hold', () => {
  // Every bench centre is blocked and walking directly into a bench stops outside it
  for (const b of CROSSING.benches) {
    assert.equal(heightAt(b.x, b.z, VESPER.topY), null, `bench (${b.x}, ${b.z}) centre blocked`);
    const approach = b.axis === 'x' ? at(b.x, b.z - 2.0, VESPER.topY) : at(b.x - 2.0, b.z, VESPER.topY);
    const p = walk(approach, new Vector3(b.x, 0, b.z));
    const dist = Math.hypot(p.x - b.x, p.z - b.z);
    assert.ok(dist > CROSSING.bench.depth / 2 + PLAYER.wallClearance - 0.05, `bench (${b.x}, ${b.z}) stopped player at dist ${dist.toFixed(2)}`);
  }
  // Well ring blocks from every compass angle when disc is docked above (no open gangway)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const start = at(OCULUS.cx + (DISC.wellR + 1.4) * Math.cos(a), OCULUS.cz + (DISC.wellR + 1.4) * Math.sin(a), VESPER.topY);
    if (Number.isNaN(start.y)) continue; // skip angles behind F5 footprint
    const p = walk(start, new Vector3(OCULUS.cx, 0, OCULUS.cz));
    const r = Math.hypot(p.x - OCULUS.cx, p.z - OCULUS.cz);
    assert.ok(r >= DISC.wellR + PLAYER.wallClearance - 0.02, `well ring held at angle ${a.toFixed(2)} (r=${r.toFixed(2)})`);
  }
  // Vesper edge screens beyond the ±45 boarding zone (x = ±50) and east/west floor ends (x = ±58) hold
  for (const x of [-50, 50]) {
    assert.ok(resolve(at(x, 74, VESPER.topY), new Vector3(x, 0, 58)).z >= VESPER.floor.zMin + 0.35, `north edge screen at x=${x}`);
    assert.ok(resolve(at(x, 74, VESPER.topY), new Vector3(x, 0, 90)).z <= VESPER.floor.zMax - 0.35, `south edge screen at x=${x}`);
  }
  assert.ok(resolve(at(-50, 74, VESPER.topY), new Vector3(-70, 0, 74)).x >= VESPER.floor.xMin, 'west floor end holds');
  assert.ok(resolve(at(50, 74, VESPER.topY), new Vector3(70, 0, 74)).x <= VESPER.floor.xMax, 'east floor end holds');
  // Funicular bottom pit and under-incline headroom guard (< 2.3 m) are never walkable on Crossing floor
  assert.equal(heightAt(55.0, FUNICULAR.z, VESPER.topY), null, 'funicular bottom pit unwalkable');
  assert.equal(heightAt(51.2, FUNICULAR.z, VESPER.topY), null, 'funicular under-incline guard unwalkable');
  const pGuard = walk(at(48.0, FUNICULAR.z, VESPER.topY), new Vector3(56.0, 0, FUNICULAR.z));
  assert.ok(pGuard.x <= FUNICULAR.underTrackGuardXMin - PLAYER.wallClearance + 0.02, `under-track guard held at x=${pGuard.x.toFixed(2)}`);
  // Funicular top station side landings at -30 are walkable off Threshold annulus; cabin bay is unwalkable without cabin
  assert.notEqual(heightAt(22.0, 71.4, THRESHOLD.y), null, 'funicular top south landing walkable');
  assert.notEqual(heightAt(22.0, 76.6, THRESHOLD.y), null, 'funicular top north landing walkable');
  assert.equal(heightAt(22.3, FUNICULAR.z, THRESHOLD.y), null, 'funicular top cabin bay unwalkable without cabin');
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
