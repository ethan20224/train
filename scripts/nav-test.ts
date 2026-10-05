// Node self-test for src/player/navigation.ts. Run: npm run nav-test  (tsx)
import { Vector3 } from 'three';
import assert from 'node:assert/strict';
import { heightAt, resolve } from '../src/player/navigation';
import { COLONNADE, ISLANDS, KIOSK, PLAYER, START_POSE, TRACKS } from '../src/layout';

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
const v = (x: number, z: number) => new Vector3(x, heightAt(x, z) ?? 0, z);

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
    [0, 3], [0, 22], [10, 40], [10, 70], [0, 96], [0, 101], [0, 104], [0, 112], [0, 370],
  ];
  let p = v(...(waypoints[0] as [number, number]));
  for (const [x, z] of waypoints.slice(1)) {
    p = walk(p, new Vector3(x, 0, z));
    near(p.x, x, 0.15, `reached x of waypoint ${x},${z}`);
    near(p.z, z, 0.15, `reached z of waypoint ${x},${z}`);
  }
  near(p.y, 0, 1e-6, 'ends at platform level');
  const end = walk(p, new Vector3(0, 0, 500));
  near(end.z, 379.5, 1e-3, 'island B ends at z = 379.5');
});

test('fuzz: 200k random moves never leave the walkable set (incl. big single moves)', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let p = v(...([0, 3] as [number, number]));
  for (let i = 0; i < 200000; i++) {
    const ang = rnd() * Math.PI * 2;
    const len = rnd() < 0.05 ? rnd() * 20 : rnd() * 0.4;
    const n = new Vector3(p.x + Math.cos(ang) * len, 0, p.z + Math.sin(ang) * len);
    p = resolve(p, n);
    assert.notEqual(heightAt(p.x, p.z), null, `left walkable set at (${p.x}, ${p.z}) on iteration ${i}`);
  }
});

console.log(`\n${passed} tests passed`);
