// Node self-test for src/player/navigation.ts. Run: npm run nav-test  (tsx)
import { Vector3 } from 'three';
import assert from 'node:assert/strict';
import { heightAt, resolve, setRequireTicketOverride } from '../src/player/navigation';
import { COLONNADE, FOOTBRIDGE, GATES, ISLANDS, KIOSK, LOUNGE_ROOM, PLAYER, START_POSE, TRACKS, gateLaneCentersX } from '../src/layout';
import { tickets, type Ticket } from '../src/core/ticket';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`ok   ${name}`);
}
const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

/** Walk like a player: small steps toward a target, through resolve(). Returns final position. */
function walk(from: Vector3, to: Vector3, step = 0.08): Vector3 {
  let p = from.clone();
  for (let i = 0; i < 20000; i++) {
    const d = new Vector3(to.x - p.x, 0, to.z - p.z);
    const len = d.length();
    if (len < 1e-3) break;
    const n = p.clone().addScaledVector(d, Math.min(step, len) / len);
    const r = resolve(p, n);
    if (Math.hypot(r.x - p.x, r.z - p.z) < 1e-7) break; // blocked
    p = r;
  }
  return p;
}
const v = (x: number, z: number, y?: number) => new Vector3(x, heightAt(x, z, y) ?? 0, z);
const TICKET: Ticket = { destination: 'HOLLOW BAY', platform: 4, track: 3, departs: '6:52', car: 2, seat: 11, serial: 'GM-004718' };
tickets.set(null);
setRequireTicketOverride(true); // gated behaviour under test; the shipped switch GATES.requireTicket may be off

test('start pose is walkable at y = 6', () => {
  const [x, y, z] = START_POSE.position;
  assert.equal(heightAt(x, z), y);
  assert.equal(heightAt(x, z), 6);
});

test('mid-stair height is ~3 (ramp 6 -> 0 over z 8..20)', () => {
  near(heightAt(0, 14)!, 3, 0.01, 'stair mid');
  near(heightAt(5, 8)!, 6, 0.01, 'stair top');
  near(heightAt(5, 20)!, 0, 0.01, 'stair foot');
});

test('cannot walk into track T3 from island B (even with a huge single move)', () => {
  const t3 = TRACKS.find((t) => t.id === 'T3')!;
  assert.equal(heightAt(t3.centerX, 200), null, 'T3 centre must not be walkable');
  const p = walk(v(0, 200), new Vector3(t3.centerX, 0, 200));
  const islandB = ISLANDS.find((i) => i.id === 'B')!;
  assert.ok(p.x >= islandB.xMin + PLAYER.platformEdgeInset - 1e-6, `stopped at island edge, got x=${p.x}`);
  const jump = resolve(v(0, 200), new Vector3(t3.centerX - 5, 0, 200)); // 12.5 m teleport attempt
  assert.ok(jump.x >= islandB.xMin + PLAYER.platformEdgeInset - 1e-6, `no tunnelling, got x=${jump.x}`);
  const jump2 = resolve(v(0, 200), new Vector3(-20, 0, 200)); // straight onto island A
  assert.ok(jump2.x >= -4.4 - 1e-6, `no tunnelling to island A, got x=${jump2.x}`);
});

test('cannot pass through a column; slides around it', () => {
  const reach = COLONNADE.shaftDiameter / 2 + PLAYER.radius;
  const colZ = COLONNADE.zs[0]; // z = 20
  const colX = COLONNADE.xs[1]; // x = 23
  const p = walk(v(colX, colZ + 4), new Vector3(colX, 0, colZ - 4));
  const d = Math.hypot(p.x - colX, p.z - colZ);
  assert.ok(d >= reach - 1e-3, `column penetration: distance ${d} < ${reach}`);
  const big = resolve(v(colX, colZ + 4), new Vector3(colX, 0, colZ - 4)); // 8 m in one call
  assert.ok(Math.hypot(big.x - colX, big.z - colZ) >= reach - 1e-3, 'no tunnelling through column in one call');
  assert.ok(heightAt(KIOSK.center[0], KIOSK.center[1]) === null, 'kiosk centre blocked');
});

test('cannot step off the balcony edge outside the stair opening; can through it', () => {
  const blocked = walk(v(-20, 4), new Vector3(-20, 0, 12));
  assert.ok(blocked.z <= 8 - PLAYER.wallClearance + 1e-6 && blocked.y === 6, `balcony edge, got z=${blocked.z} y=${blocked.y}`);
  const blockedBig = resolve(v(-20, 7), new Vector3(-20, 0, 15));
  assert.ok(blockedBig.z <= 7.6 + 1e-6, 'no tunnelling off balcony in one call');
  const through = walk(v(0, 4), new Vector3(0, 0, 12));
  near(through.z, 12, 0.01, 'walked through stair opening');
  near(through.y, 4, 0.01, 'height at z=12 is 4');
});

test('full route: balcony -> stair -> concourse -> centre arch -> island B z = 370', () => {
  const waypoints: Array<[number, number]> = [
    [0, 3], [0, 22], [10, 40], [10, 70], [0, 96], [0, 101], [0, 104], [0, 112], [3, 130], [3, 370],
  ];
  tickets.set(TICKET); // the gate lanes are open only with a ticket
  let p = v(...(waypoints[0] as [number, number]));
  for (const [x, z] of waypoints.slice(1)) {
    p = walk(p, new Vector3(x, 0, z));
    near(p.x, x, 0.15, `reached x of waypoint ${x},${z}`);
    near(p.z, z, 0.15, `reached z of waypoint ${x},${z}`);
  }
  near(p.y, 0, 1e-6, 'ends at platform level');
  const end = walk(p, new Vector3(3, 0, 500));
  near(end.z, 379.5, 1e-3, 'island B ends at z = 379.5');
  tickets.set(null);
});

function fuzz(label: string, start: Vector3, n: number, seed0: number, holdTicket: boolean): Set<number> {
  tickets.set(holdTicket ? TICKET : null);
  let seed = seed0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let p = start.clone();
  const levels = new Set<number>();
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2;
    const len = rnd() < 0.05 ? rnd() * 20 : rnd() * 0.4;
    const nx = new Vector3(p.x + Math.cos(ang) * len, 0, p.z + Math.sin(ang) * len);
    p = resolve(p, nx);
    assert.notEqual(heightAt(p.x, p.z, p.y), null, `${label}: left walkable set at (${p.x}, ${p.y}, ${p.z}) on iteration ${i}`);
    levels.add(Math.round(p.y));
  }
  return levels;
}

test('fuzz: 200k random moves from the balcony never leave the walkable set (no ticket, then ticket)', () => {
  fuzz('balcony/no-ticket', v(0, 3), 100000, 12345, false);
  fuzz('balcony/ticket', v(0, 3), 100000, 777, true);
  tickets.set(null);
});

// --------------------------------------------------------------------------------------------------------------------
// Phase 4: levels, footbridge, gates
// --------------------------------------------------------------------------------------------------------------------
const B = FOOTBRIDGE.stairCentersX[1]; // island B stair centre x = 0
const deckY = FOOTBRIDGE.deckTopY;

test('deck over island B resolves to the right level from above and from below', () => {
  near(heightAt(0, 228, deckY)!, deckY, 1e-9, 'deck from above');
  near(heightAt(0, 228, 0)!, 0, 1e-9, 'ground under the deck from below');
  assert.equal(heightAt(0, 228, 3.5), null, 'mid-air between deck and ground is not walkable');
  const above = walk(v(0, 227.5, deckY), new Vector3(3, 0, 228.6));
  near(above.y, deckY, 1e-9, 'stays on the deck');
  const below = walk(v(0, 227.5, 0), new Vector3(3, 0, 228.6));
  near(below.y, 0, 1e-9, 'stays on the ground');
  assert.equal(heightAt(0, 228), 0, 'no nearY = lowest level');
});

test('climb and descend every bridge stair (real stepping through resolve)', () => {
  for (const c of FOOTBRIDGE.stairCentersX) {
    let p = v(c, 200, 0);
    p = walk(p, new Vector3(c, 0, FOOTBRIDGE.stairBottomZ - 0.5));
    near(p.y, 0, 1e-6, `stair ${c}: at the foot`);
    p = walk(p, new Vector3(c, 0, 227.5));
    near(p.z, 227.5, 0.02, `stair ${c}: reached the deck z`);
    near(p.y, deckY, 1e-6, `stair ${c}: arrived on the deck`);
    // monotone climb
    let q = v(c, FOOTBRIDGE.stairBottomZ - 0.5, 0);
    let prevY = q.y;
    for (let z = FOOTBRIDGE.stairBottomZ - 0.5; z < FOOTBRIDGE.stairTopZ + 0.5; z += 0.08) {
      q = resolve(q, new Vector3(c, 0, z + 0.08));
      assert.ok(q.y >= prevY - 1e-9, `stair ${c}: y dropped while climbing at z=${z}`);
      assert.ok(q.y - prevY < 0.06, `stair ${c}: y jumped ${q.y - prevY}`);
      prevY = q.y;
    }
    near(q.y, deckY, 1e-6, `stair ${c}: top`);
    // back down
    const d = walk(p, new Vector3(c, 0, 200));
    near(d.y, 0, 1e-6, `stair ${c}: descended to ground`);
    near(d.z, 200, 0.02, `stair ${c}: descended all the way`);
  }
});

test('cannot cross the deck to another stair top without walking the deck; can cross it end to end', () => {
  let p = v(-20, 227.5, deckY);
  p = walk(p, new Vector3(20, 0, 227.5));
  near(p.x, 20, 0.02, 'crossed the deck');
  near(p.y, deckY, 1e-9, 'still at deck level');
  const down = walk(p, new Vector3(20, 0, 205));
  near(down.y, 0, 1e-6, 'descended the C stair');
});

test('cannot fall off the deck edges (south rail, north rail, ends)', () => {
  const edgeS = walk(v(5, 227.5, deckY), new Vector3(5, 0, 215));
  near(edgeS.y, deckY, 1e-9, 'south: still on the deck');
  assert.ok(edgeS.z >= FOOTBRIDGE.zMin, `south edge z=${edgeS.z}`);
  const edgeN = walk(v(5, 227.5, deckY), new Vector3(5, 0, 240));
  near(edgeN.y, deckY, 1e-9, 'north: still on the deck');
  assert.ok(edgeN.z <= FOOTBRIDGE.zMax, `north edge z=${edgeN.z}`);
  const endE = walk(v(5, 227.5, deckY), new Vector3(40, 0, 227.5));
  near(endE.y, deckY, 1e-9, 'east end: still on the deck');
  assert.ok(endE.x <= FOOTBRIDGE.walkXMax, `east end x=${endE.x}`);
  const endW = walk(v(-5, 227.5, deckY), new Vector3(-40, 0, 227.5));
  assert.ok(endW.x >= FOOTBRIDGE.walkXMin && endW.y === deckY, `west end x=${endW.x}`);
  const big = resolve(v(5, 227.5, deckY), new Vector3(5, 0, 100));
  near(big.y, deckY, 1e-9, 'one big move cannot drop off the deck');
});

test('cannot walk under a stair (either side, or from the north)', () => {
  for (const c of FOOTBRIDGE.stairCentersX) {
    const fromWest = walk(v(c - 3.5, 220, 0), new Vector3(c, 0, 220));
    assert.ok(fromWest.x <= c - FOOTBRIDGE.stairHalfWidth - PLAYER.radius + 1e-6, `stair ${c}: west side x=${fromWest.x}`);
    near(fromWest.y, 0, 1e-9, 'west side stays at ground');
    const fromEast = walk(v(c + 3.5, 220, 0), new Vector3(c, 0, 220));
    assert.ok(fromEast.x >= c + FOOTBRIDGE.stairHalfWidth + PLAYER.radius - 1e-6, `stair ${c}: east side x=${fromEast.x}`);
    const fromNorth = walk(v(c, 228.5, 0), new Vector3(c, 0, 218));
    assert.ok(fromNorth.z >= FOOTBRIDGE.stairTopZ - 1e-6 && fromNorth.y === 0, `stair ${c}: from the north z=${fromNorth.z} y=${fromNorth.y}`);
    // each side of the island is passable beside the stair (route around it)
    const west = walk(v(c - 3.5, 205, 0), new Vector3(c - 3.5, 0, 240));
    near(west.z, 240, 0.02, `stair ${c}: west lane passes the stair`);
    const east = walk(v(c + 3.5, 205, 0), new Vector3(c + 3.5, 0, 240));
    near(east.z, 240, 0.02, `stair ${c}: east lane passes the stair`);
  }
});

test('gate band: blocked without a ticket everywhere; open only through lanes with one', () => {
  tickets.set(null);
  for (const x of [-27, -20, -13.3, -1.4, 0, 4, 14, 20, 28]) {
    const p = walk(v(x, 90), new Vector3(x, 0, 100));
    assert.ok(p.z < GATES.zMin, `no ticket: x=${x} reached z=${p.z}`);
  }
  const big = resolve(v(0, 93), new Vector3(0, 0, 99));
  assert.ok(big.z < GATES.zMin, 'one big move cannot jump the band without a ticket');
  tickets.set(TICKET);
  let passed = 0;
  for (const lx of gateLaneCentersX()) {
    const p = walk(v(lx, 90), new Vector3(lx, 0, 100));
    assert.ok(Math.abs(p.z - 100) < 0.05 + 0.5 && p.z > GATES.zMax, `ticket: lane x=${lx} stopped at z=${p.z}`);
    passed++;
  }
  assert.equal(passed, 21);
  // between lanes (the cabinet) and on the glass screens stays blocked even with a ticket
  for (const x of [-20 + 0.7, 0.7, -27, -10, 10, 28]) {
    const p = walk(v(x, 90), new Vector3(x, 0, 100));
    assert.ok(p.z < GATES.zMin, `ticket but not in a lane: x=${x} reached z=${p.z}`);
  }
  // and back out again (exit through a lane)
  const back = walk(v(0, 98), new Vector3(0, 0, 90));
  assert.ok(back.z < 91, 'exit through a lane while holding a ticket');
  tickets.set(null);
});

test('never trapped: a lane that closes while the player is inside still lets them out', () => {
  tickets.set(TICKET);
  let p = walk(v(0, 90), new Vector3(0, 0, 95));
  near(p.z, 95, 0.1, 'standing in the lane');
  tickets.set(null);
  const out = walk(p, new Vector3(0, 0, 99));
  assert.ok(out.z > 96, `could leave forward, z=${out.z}`);
  tickets.set(TICKET);
  p = walk(v(0, 90), new Vector3(0, 0, 95));
  tickets.set(null);
  const outBack = walk(p, new Vector3(0, 0, 90));
  assert.ok(outBack.z < 92, `could leave backward, z=${outBack.z}`);
  const after = walk(outBack, new Vector3(0, 0, 99));
  assert.ok(after.z < GATES.zMin, 'once out and ticketless, the lane is closed again');
});

test('fuzz on the deck, on island A under the bridge, and through the gates (both ticket states)', () => {
  const lv1 = fuzz('deck/no-ticket', v(0, 227.5, deckY), 100000, 4242, false);
  assert.deepEqual([...lv1].sort((a, b) => a - b).filter((n) => n === 7).length, 1, 'fuzz stayed on the deck level at least');
  const lv2 = fuzz('islandA/ticket', v(-20, 150, 0), 150000, 99, true);
  assert.ok(lv2.has(0) && lv2.has(7), `ticket fuzz visited ground and deck levels: ${[...lv2]}`);
  fuzz('gates/ticket', v(0, 85), 100000, 31337, true);
  fuzz('gates/no-ticket', v(0, 85), 100000, 4, false);
  tickets.set(null);
});

test('switch off: lanes open without a ticket; band still blocked between lanes', () => {
  setRequireTicketOverride(false);
  tickets.set(null);
  const lane = walk(v(0, 90), new Vector3(0, 0, 100));
  assert.ok(lane.z > GATES.zMax, `free passage, z=${lane.z}`);
  const cab = walk(v(0.7, 90), new Vector3(0.7, 0, 100));
  assert.ok(cab.z < GATES.zMin, 'cabinets still solid');
  setRequireTicketOverride(true);
});

// --------------------------------------------------------------------------------------------------------------------
// Phase 4B: the first-class lounge (balcony level, behind the hall's south wall)
// --------------------------------------------------------------------------------------------------------------------
const LR = LOUNGE_ROOM;
const C4 = PLAYER.wallClearance;

test('lounge: start pose -> doorway -> into the room and back, all at y = 6', () => {
  let p = v(0, 3);
  p = walk(p, new Vector3(0, 0, -1));
  near(p.z, -1, 0.05, 'in the doorway');
  assert.equal(p.y, 6);
  p = walk(p, new Vector3(2.6, 0, -4)); // around the entrance table (0, -6.6)
  p = walk(p, new Vector3(2.6, 0, -8.5));
  p = walk(p, new Vector3(0, 0, -8.5));
  near(p.z, -8.5, 0.05, 'inside the room');
  assert.equal(p.y, 6);
  p = walk(p, new Vector3(2.6, 0, -8.5));
  p = walk(p, new Vector3(2.6, 0, -4));
  p = walk(p, new Vector3(0, 0, -1));
  p = walk(p, new Vector3(0, 0, 3));
  near(p.z, 3, 0.05, 'back on the balcony');
  assert.equal(p.y, 6);
});

test('lounge: sealed - cannot leave through the walls, the windows or the hall wall', () => {
  // every wall, from several heights along it (window positions included)
  for (const z of [-4, -9, -13.5, -18, -23]) {
    const w = walk(v(-8, z), new Vector3(-30, 0, z));
    assert.ok(w.x >= LR.xMin + C4 - 1e-6, `west wall (z=${z}): x=${w.x}`);
    const e = walk(v(8, z), new Vector3(30, 0, z));
    assert.ok(e.x <= LR.xMax - C4 + 1e-6, `east wall (z=${z}): x=${e.x}`);
  }
  for (const x of [-9, -4.5, 0, 9, 13]) {
    const s = walk(v(x, -12), new Vector3(x, 0, -40));
    assert.ok(s.z >= LR.zMin + C4 - 1e-6, `south wall/window (x=${x}): z=${s.z}`);
  }
  for (const x of [-12, -6, -3, 3, 6, 12]) {
    const n = walk(v(x, -5), new Vector3(x, 0, 6));
    assert.ok(n.z <= LR.zMax - C4 + 1e-6 || n.z >= 0, `north wall (x=${x}): z=${n.z}`);
    assert.ok(n.z <= LR.zMax - C4 + 1e-6, `north wall stays shut beside the doors (x=${x}): z=${n.z}`);
  }
  const big = resolve(v(0, -10), new Vector3(0, 0, -60));
  assert.ok(big.z >= LR.zMin + C4 - 1e-6, 'one big move cannot leave through the south wall');
  const bigW = resolve(v(-5, -9), new Vector3(-60, 0, -9));
  assert.ok(bigW.x >= LR.xMin + C4 - 1e-6, 'one big move cannot leave through the west wall');
  for (const [x, z] of [[-16, -9], [-9, -25], [0, -25], [16, -10], [5, -2.2], [-3, -1.2], [0, -50]] as const) {
    assert.equal(heightAt(x, z, 6), null, `outside the room is not walkable: (${x}, ${z})`);
  }
  // the hall's south wall (z -2 .. 0) is only passable through the doorway
  assert.equal(heightAt(5, -1, 6), null, 'hall wall beside the doors is solid');
  assert.notEqual(heightAt(0, -1, 6), null, 'doorway is open');
  // from the hall floor the lounge is not reachable (different level, wall in between)
  assert.equal(heightAt(0, -5, 0), null, 'no ground-level access to the lounge');
});

test('lounge: furniture blocks (sofa, desk, fireplace, bookcase) and the room can be crossed', () => {
  for (const [x, z] of [[0, -11.5], [0, -23.5], [14.5, -13.5], [14.8, -9.9]] as const) assert.equal(heightAt(x, z, 6), null, `blocked: (${x}, ${z})`);
  const p = walk(v(2.6, -4), new Vector3(2.6, 0, -9));
  near(p.z, -9, 0.1, 'doors to the middle of the room is free');
  assert.equal(heightAt(0, -6.6, 6), null, 'entrance table blocks');
  const q = walk(v(-13, -4), new Vector3(13, 0, -4));
  assert.ok(q.x > 3, `could walk across the north end, reached x=${q.x}`);
});

test('fuzz: 150k random moves from the balcony through the lounge stay inside the walkable set', () => {
  const lv = fuzz('lounge', v(0, -8), 150000, 2468, false);
  assert.ok(lv.has(6), 'stayed at the lounge level');
});

console.log(`\n${passed} tests passed`);
