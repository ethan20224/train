// Generic region features of navigation (Task 2). Run: npm run nav-regions-test
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { carryAt, conveyorAt, heightAt, resolve, setDynamicRegions } from '../src/player/navigation';
import { boundsOf, circleShape, obbShape, rectShape, type Region } from '../src/player/regions';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };
const near = (a: number, b: number, e: number, m: string) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`);
const walk = (from: Vector3, to: Vector3, step = 0.08): Vector3 => {
  let p = from.clone();
  for (let i = 0; i < 20000; i++) {
    const d = new Vector3(to.x - p.x, 0, to.z - p.z); const len = d.length(); if (len < 1e-3) break;
    const r = resolve(p, p.clone().addScaledVector(d, Math.min(step, len) / len));
    if (Math.hypot(r.x - p.x, r.z - p.z) < 1e-7) break; p = r;
  }
  return p;
};

let open = false;
const carry = { x: 0, y: 0, z: 0 };
const floor: Region = { xMin: 500, xMax: 520, zMin: 0, zMax: 20, y: 0, holes: [circleShape(510, 10, 2)] };
const xRamp: Region = { xMin: 520, xMax: 530, zMin: 9.5, zMax: 10.5, y: 0, ramp: { axis: 'x', from: 520, to: 530, yFrom: 0, yTo: -5 } };
const lower: Region = { xMin: 530, xMax: 540, zMin: 0, zMax: 20, y: -5 };
const disc: Region = { ...boundsOf(circleShape(550, 10, 3)), y: 0, circle: circleShape(550, 10, 3), carry };
const door: Region = { xMin: 520, xMax: 547.5, zMin: 2.5, zMax: 3.5, y: 0, when: () => open };
const belt: Region = { xMin: 500, xMax: 520, zMin: 30, zMax: 31, y: 0, conveyor: { axis: 'z', speed: () => -0.65 } };
const diag: Region = { ...boundsOf(obbShape(600, 0, Math.SQRT1_2, Math.SQRT1_2, 10, 2)), y: 0, obb: obbShape(600, 0, Math.SQRT1_2, Math.SQRT1_2, 10, 2) };
setDynamicRegions(() => [floor, xRamp, lower, disc, door, belt, diag]);

test('region-scoped hole excludes only its own region', () => {
  assert.equal(heightAt(510, 10, 0), null, 'inside the hole');
  near(heightAt(507.5, 10, 0)!, 0, 1e-9, 'outside the hole');
});
test('x-axis ramp interpolates along x and connects two levels', () => {
  near(heightAt(525, 10, -2.5)!, -2.5, 1e-9, 'mid ramp');
  const p = walk(new Vector3(519, 0, 10), new Vector3(535, 0, 10));
  near(p.x, 535, 0.01, 'reached the lower level'); near(p.y, -5, 1e-9, 'at y -5');
});
test('circle and obb regions refine their bounding rectangles', () => {
  assert.notEqual(heightAt(550, 10, 0), null, 'disc centre'); assert.equal(heightAt(552.8, 12.8, 0), null, 'disc bbox corner');
  assert.notEqual(heightAt(607, 7, 0), null, 'obb along its axis'); assert.equal(heightAt(607, -7, 0), null, 'obb bbox corner');
});
test('connector is walkable only while `when()` is true, and never traps a player standing in it', () => {
  open = false; assert.equal(heightAt(530, 3, 0), null, 'closed door');
  open = true; const inDoor = walk(new Vector3(519, 0, 3), new Vector3(530, 0, 3)); near(inDoor.x, 530, 0.01, 'walked in');
  open = false; const out = walk(inDoor, new Vector3(519, 0, 3)); near(out.x, 519, 0.01, 'walked back out after it closed');
});
test('carryAt returns the mover delta for a rider at the previous height', () => {
  carry.y = -0.05; (disc as { y: number }).y = -0.05;
  assert.deepEqual(carryAt(550, 10, 0), carry, 'rider at old y is carried');
  assert.equal(carryAt(560, 10, 0), null, 'off the disc');
  carry.y = 0; (disc as { y: number }).y = 0;
});
test('conveyorAt reports the belt velocity and nothing elsewhere', () => {
  assert.deepEqual(conveyorAt(510, 30.5, 0), { x: 0, z: -0.65 });
  assert.deepEqual(conveyorAt(505, 10, 0), { x: 0, z: 0 });
});
setDynamicRegions(() => []);
console.log(`\n${passed} region checks passed`);
