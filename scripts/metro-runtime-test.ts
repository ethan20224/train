// Escalator sensing, disc rides, conveyor walking (Task 4). Run: npm run metro-runtime-test
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { DISC, ESCALATOR, OCULUS, VESPER, escalatorUnits } from '../src/layout';
import { carryAt, heightAt, setDynamicRegions } from '../src/player/navigation';
import { walkStep } from '../src/player/walk';
import { disc } from '../src/metro/disc';
import { escalators } from '../src/metro/escalators';
import { metroDynamicRegions, updateMetroRuntime } from '../src/metro/runtime';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };
const near = (a: number, b: number, e: number, m: string) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`);
setDynamicRegions(metroDynamicRegions);
const DT = 1 / 60;
/** One frame exactly like the app: runtime, then carry, then walking toward `target` (or standing). */
function frame(feet: Vector3, vel: { x: number; z: number }, target: Vector3 | null, dt = DT): void {
  updateMetroRuntime(dt, feet);
  const c = carryAt(feet.x, feet.z, feet.y);
  if (c) { feet.x += c.x; feet.y += c.y; feet.z += c.z; }
  const d = target ? new Vector3(target.x - feet.x, 0, target.z - feet.z) : new Vector3();
  const len = d.length();
  const desired = len > 0.05 ? { x: (d.x / len) * 3.2, z: (d.z / len) * 3.2 } : { x: 0, z: 0 };
  walkStep(feet, vel, desired, dt);
}
const run = (feet: Vector3, vel: { x: number; z: number }, target: Vector3 | null, seconds: number, dt = DT) => {
  for (let t = 0; t < seconds; t += dt) frame(feet, vel, target, dt);
};

test('escalators idle at 0.2 m/s and ramp to 0.65 when the player is near', () => {
  const u = escalatorUnits().find((q) => q.flight === 'F1' && q.dir === 'down')!;
  const far = new Vector3(0, 6, 3);
  for (let i = 0; i < 300; i++) escalators.update(DT, far);
  near(escalators.speed(u.id), ESCALATOR.idleSpeed, 1e-9, 'idle');
  const close = new Vector3(u.across, 0, 60);
  for (let i = 0; i < 300; i++) escalators.update(DT, close);
  near(escalators.speed(u.id), ESCALATOR.activeSpeed, 1e-9, 'active');
});

test('standing still on a down escalator carries the player from the hall to L1', () => {
  const u = escalatorUnits().find((q) => q.flight === 'F1' && q.dir === 'down' && q.across > 0)!;
  const feet = new Vector3(u.across, 0, 63.0); const vel = { x: 0, z: 0 };
  run(feet, vel, null, 40);
  near(feet.y, -10, 1e-6, 'arrived on L1'); assert.ok(feet.z > u.to, 'pushed onto the landing');
});

test('standing at the end of a conveyor: stable position, no runaway velocity', () => {
  const u = escalatorUnits().find((q) => q.flight === 'F1' && q.dir === 'down' && q.across > 0)!;
  const feet = new Vector3(u.across, -10, u.to + 0.2); const vel = { x: 0, z: 0 };
  run(feet, vel, null, 5);
  const z0 = feet.z; run(feet, vel, null, 5);
  near(feet.z, z0, 0.01, 'stable'); assert.ok(Math.hypot(vel.x, vel.z) < 0.05, `own velocity ${vel.x},${vel.z}`);
});

test('disc: step on, wait 2 s, ride to the Crossing floor, step off south', () => {
  const feet = new Vector3(0, 0, 60); const vel = { x: 0, z: 0 };
  assert.equal(disc.docked, 'top');
  run(feet, vel, new Vector3(0, 0, OCULUS.cz), 6);
  run(feet, vel, null, 40);
  assert.equal(disc.docked, 'bottom'); near(feet.y, DISC.bottomY, 1e-6, 'rider arrived');
  run(feet, vel, new Vector3(0, 0, 66), 6);
  near(feet.y, VESPER.topY, 1e-6, 'on the floor'); assert.ok(feet.z < 68, 'walked off');
});

test('disc comes to a player waiting at the other end; gangway closed while away', () => {
  const feet = new Vector3(0, 0, 60); const vel = { x: 0, z: 0 };
  assert.equal(disc.docked, 'bottom'); assert.equal(heightAt(0, 68, 0), null, 'top gangway closed');
  run(feet, vel, null, 40);
  assert.equal(disc.docked, 'top'); assert.notEqual(heightAt(0, 68, 0), null, 'top gangway open');
});

test('gangway never traps: a player on the gangway when the disc is called away can walk back', () => {
  const feet = new Vector3(0, 0, 68); const vel = { x: 0, z: 0 };
  run(feet, vel, null, 0.5);
  const caller = new Vector3(0, VESPER.topY, 66); // far end
  for (let t = 0; t < 1; t += DT) { disc.update(DT, caller); }
  assert.equal(disc.docked, null, 'disc left to fetch the far caller');
  run(feet, vel, new Vector3(0, 0, 60), 4);
  near(feet.z, 60, 0.2, 'walked back off the gangway'); near(feet.y, 0, 1e-6, 'still on the hall floor');
  for (let t = 0; t < 40; t += DT) disc.update(DT, caller);
});

test('large dt spikes while riding keep the rider on the disc', () => {
  for (let t = 0; t < 40; t += DT) disc.update(DT, new Vector3(0, 0, 66)); // bring it to the top
  assert.equal(disc.docked, 'top');
  const feet = new Vector3(0, 0, OCULUS.cz); const vel = { x: 0, z: 0 };
  run(feet, vel, null, 2.2);
  run(feet, vel, null, 40, 0.05);
  assert.equal(disc.docked, 'bottom'); near(feet.y, DISC.bottomY, 1e-6, 'rider still on the disc');
});
console.log(`\n${passed} metro runtime checks passed`);
