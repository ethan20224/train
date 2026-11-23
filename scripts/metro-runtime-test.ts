// Escalator sensing, disc rides, conveyor walking (Task 4). Run: npm run metro-runtime-test
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { DISC, ESCALATOR, HALCYON, LIFTS, OCULUS, THRESHOLD, VESPER, escalatorUnits } from '../src/layout';
import { carryAt, heightAt, setDynamicRegions } from '../src/player/navigation';
import { walkStep } from '../src/player/walk';
import { disc } from '../src/metro/disc';
import { escalators } from '../src/metro/escalators';
import {
  LIFT_STOPS, createLifts, liftCallButtonPos, liftDoorDir, liftFloorButtonPos, lifts,
} from '../src/metro/lifts';
import { metroDynamicRegions, updateMetroRuntime } from '../src/metro/runtime';
import { findTarget } from '../src/core/interaction';

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

// ---- Capsule lifts (P3-8a) ------------------------------------------------------------------------

test('lifts: no door ever opens onto a moving or absent cabin', () => {
  const lc = createLifts({ seed: 11, initialStops: [0, 1] }); // cabin 0 at -30, cabin 1 at -70
  const far = new Vector3(30, VESPER.topY, 74);
  // Check at boot: no connectors open, all landing doors 0
  for (const li of [0, 1]) {
    for (const s of [0, 1, 2] as const) {
      assert.equal(lc.landingDoorOpen01(li, s), 0, `boot door ${li}/${s} closed`);
      assert.equal(lc.connectorOpen(li, s), false, `boot connector ${li}/${s} closed`);
    }
  }
  // Call cabin 0 from -30 to -82; sample every step while moving until Halcyon opens
  assert.equal(lc.call(0, 2), true);
  let sawMoving = false;
  for (let t = 0; t < 35; t += DT) {
    lc.update(DT, far);
    const snap = lc.cabin(0);
    if (snap.state === 'moving') {
      sawMoving = true;
      for (const s of [0, 1, 2] as const) {
        assert.equal(lc.landingDoorOpen01(0, s), 0, `moving door ${s} stays 0`);
        assert.equal(lc.connectorOpen(0, s), false, `moving connector ${s} stays closed`);
      }
    } else if (snap.docked !== null) {
      for (const s of [0, 1, 2] as const) {
        if (s !== snap.docked) {
          assert.equal(lc.landingDoorOpen01(0, s), 0, `absent stop ${s} door stays 0`);
          assert.equal(lc.connectorOpen(0, s), false, `absent stop ${s} connector closed`);
        }
      }
      if (snap.docked === 2 && lc.connectorOpen(0, 2)) break;
    }
  }
  assert.ok(sawMoving, 'cabin 0 travelled');
  assert.equal(lc.cabin(0).docked, 2, 'cabin 0 docked at Halcyon');
  assert.equal(lc.connectorOpen(0, 2), true, 'cabin 0 connector open at Halcyon');
  assert.equal(lc.connectorOpen(0, 0), false, 'cabin 0 Threshold connector still closed');
  assert.equal(lc.connectorOpen(0, 1), false, 'cabin 0 Crossing connector still closed');
});

test('lifts: call, board, ride -70 -> -82 -> -70 -> -30 smoothly and exit onto each level', () => {
  const [lx, lz] = LIFTS.positions[1]!;
  const d70 = liftDoorDir(1, 1);
  const feet = new Vector3(lx + d70.x * 2.4, VESPER.topY, lz + d70.z * 2.4);
  const vel = { x: 0, z: 0 };
  // Closed doorway blocks walking into shaft
  assert.equal(heightAt(lx + d70.x * 1.4, lz + d70.z * 1.4, VESPER.topY), null, 'closed Crossing shaft door blocks');
  // Call lift 1 to Crossing (-70) -> travels if away and opens doors
  assert.equal(lifts.call(1, 1), true);
  for (let t = 0; t < 35 && !lifts.connectorOpen(1, 1); t += DT) frame(feet, vel, null, DT);
  assert.equal(lifts.connectorOpen(1, 1), true, 'Crossing door opened');
  // Walk into cabin 1
  run(feet, vel, new Vector3(lx, VESPER.topY, lz), 2.5);
  assert.ok(Math.hypot(feet.x - lx, feet.z - lz) < 0.25, `boarded cabin 1 (${feet.x.toFixed(2)}, ${feet.z.toFixed(2)})`);
  // Current floor button does nothing
  assert.equal(lifts.sendTo(1, 1), false, 'current floor is a no-op');
  // Send to Halcyon (-82)
  assert.equal(lifts.sendTo(1, 2), true);
  run(feet, vel, null, 14);
  assert.equal(lifts.cabin(1).docked, 2, 'arrived at Halcyon');
  near(feet.y, HALCYON.topY, 1e-5, 'rider arrived at -82');
  assert.equal(lifts.connectorOpen(1, 2), true, 'Halcyon door open');
  // Step out onto Halcyon island centre line along Halcyon door direction
  const d82 = liftDoorDir(1, 2);
  run(feet, vel, new Vector3(lx + d82.x * 2.5, HALCYON.topY, lz + d82.z * 2.5), 2.5);
  near(feet.y, HALCYON.topY, 1e-5, 'standing on Halcyon island');
  assert.ok(Math.hypot(feet.x - lx, feet.z - lz) > 2.1, 'stepped out onto Halcyon');
  // Walk back in and ride back to Crossing (-70), then up to Threshold (-30)
  run(feet, vel, new Vector3(lx, HALCYON.topY, lz), 2.5);
  assert.equal(lifts.sendTo(1, 1), true);
  run(feet, vel, null, 14);
  near(feet.y, VESPER.topY, 1e-5, 'returned to -70');
  assert.equal(lifts.sendTo(1, 0), true);
  run(feet, vel, null, 25);
  near(feet.y, THRESHOLD.y, 1e-5, 'rode up to Threshold -30');
  const d30 = liftDoorDir(1, 0);
  run(feet, vel, new Vector3(lx + d30.x * 2.5, THRESHOLD.y, lz + d30.z * 2.5), 2.5);
  near(feet.y, THRESHOLD.y, 1e-5, 'exited onto Threshold deck');
  assert.ok(Math.hypot(feet.x - lx, feet.z - lz) > 2.1, 'stepped out onto Threshold');
});

test('lifts: ghost run never starts with player inside or at the door; triggers deterministically when > 6 m away', () => {
  const [lx, lz] = LIFTS.positions[0]!;
  const d30 = liftDoorDir(0, 0);
  // Player standing inside cabin 0 for 120 s: cabin 0 must never ghost-run
  const lcInside = createLifts({ seed: 3, initialStops: [0, 1] });
  const pInside = new Vector3(lx, THRESHOLD.y, lz);
  for (let t = 0; t < 120; t += 0.1) lcInside.update(0.1, pInside);
  assert.equal(lcInside.cabin(0).docked, 0, 'no ghost run while player inside');
  assert.equal(lcInside.cabin(0).state, 'idle', 'stays idle while player inside');

  // Player standing right outside cabin 0 door (2.2 m away < 6 m) for 120 s: must never ghost-run
  const lcAtDoor = createLifts({ seed: 3, initialStops: [0, 1] });
  const pAtDoor = new Vector3(lx + d30.x * 2.2, THRESHOLD.y, lz + d30.z * 2.2);
  for (let t = 0; t < 120; t += 0.1) lcAtDoor.update(0.1, pAtDoor);
  assert.equal(lcAtDoor.cabin(0).docked, 0, 'no ghost run while player within 6 m of door');

  // Player far away (on Crossing floor east end, x = 25, y = -70): cabin 0 starts ghost run in 40..70 s
  const lcFar = createLifts({ seed: 3, initialStops: [0, 1] });
  const pFar = new Vector3(25, VESPER.topY, 74);
  let departedAt = -1;
  for (let t = 0; t < 75; t += 0.1) {
    lcFar.update(0.1, pFar);
    if (departedAt < 0 && lcFar.cabin(0).state === 'moving') departedAt = t;
  }
  assert.ok(departedAt >= 39.9 && departedAt <= 70.2, `ghost run departed in 40..70 s (at ${departedAt.toFixed(1)} s)`);
  // Determinism check: identical seed produces identical departure time and destination
  const lcDup = createLifts({ seed: 3, initialStops: [0, 1] });
  let departedDup = -1;
  for (let t = 0; t < 75; t += 0.1) {
    lcDup.update(0.1, pFar);
    if (departedDup < 0 && lcDup.cabin(0).state === 'moving') departedDup = t;
  }
  near(departedAt, departedDup, 1e-9, 'seeded ghost run is deterministic');
});

test('lifts: large dt spikes while riding keep the rider aboard', () => {
  const [lx, lz] = LIFTS.positions[0]!;
  // Bring lift 0 to Threshold (-30) and put rider inside
  const far = new Vector3(30, VESPER.topY, 74);
  lifts.call(0, 0);
  for (let t = 0; t < 40 && !lifts.connectorOpen(0, 0); t += DT) lifts.update(DT, far);
  assert.equal(lifts.cabin(0).docked, 0);
  const feet = new Vector3(lx, THRESHOLD.y, lz);
  const vel = { x: 0, z: 0 };
  assert.equal(lifts.sendTo(0, 2), true); // -30 -> -82 (52 m drop)
  // Step with 0.05 s and even 0.25 s dt spikes!
  run(feet, vel, null, 5, 0.05);
  run(feet, vel, null, 25, 0.25);
  assert.equal(lifts.cabin(0).docked, 2, 'cabin arrived at Halcyon under dt spikes');
  near(feet.y, HALCYON.topY, 1e-5, 'rider stayed aboard through dt spikes');
  assert.ok(Math.hypot(feet.x - lx, feet.z - lz) <= LIFTS.cabinR - 0.35, 'rider still inside cabin');
});

test('lifts: a player in a closing doorway is never trapped', () => {
  const [lx, lz] = LIFTS.positions[1]!;
  const far = new Vector3(30, VESPER.topY, 74);
  // Bring lift 1 to Crossing (-70) and open doors
  lifts.call(1, 1);
  for (let t = 0; t < 40 && !lifts.connectorOpen(1, 1); t += DT) lifts.update(DT, far);
  assert.equal(lifts.connectorOpen(1, 1), true);
  // Stand right in the doorway threshold (r = 1.35 m from cabin centre)
  const d70 = liftDoorDir(1, 1);
  const feet = new Vector3(lx + d70.x * 1.35, VESPER.topY, lz + d70.z * 1.35);
  const vel = { x: 0, z: 0 };
  // Someone remotely calls lift 1 away to Threshold (-30): doors close and cabin departs
  assert.equal(lifts.call(1, 0), true);
  for (let t = 0; t < 2.0; t += DT) lifts.update(DT, far);
  assert.equal(lifts.connectorOpen(1, 1), false, 'Crossing doorway closed');
  // Player standing in the closed doorway walks back out onto the Crossing floor without getting trapped
  run(feet, vel, new Vector3(lx + d70.x * 3.0, VESPER.topY, lz + d70.z * 3.0), 3.0);
  near(feet.y, VESPER.topY, 1e-5, 'stayed on Crossing floor');
  assert.ok(feet.x > lx + 2.4, `walked freely back out of closing doorway (x=${feet.x.toFixed(2)})`);
});

test('lifts: interaction targeting returns liftCall outside closed door, liftFloor inside cabin, null elsewhere in metro', () => {
  const lc = createLifts({ seed: 5, initialStops: [0, 1] });
  const snap = lc.snapshots();
  // Outside Lift 0 at Crossing (-70) where cabin 0 is absent (at -30)
  const btn = liftCallButtonPos(0, 1);
  const feetOut = { x: btn.x + 1.2, y: VESPER.topY, z: btn.z };
  const eyeOut = { x: feetOut.x, y: feetOut.y + 1.65, z: feetOut.z };
  const dirOut = new Vector3(btn.x - eyeOut.x, btn.y - eyeOut.y, btn.z - eyeOut.z).normalize();
  const tCall = findTarget(feetOut, eyeOut, dirOut, false, true, snap);
  assert.deepEqual(tCall, { kind: 'liftCall', lift: 0, stop: 1 }, 'call target outside closed door');

  // Inside Lift 1 docked at Crossing (-70): aim at each of the 3 buttons
  const c1 = snap[1]!;
  const feetIn = { x: c1.x, y: c1.y, z: c1.z };
  const eyeIn = { x: c1.x, y: c1.y + 1.65, z: c1.z };
  for (const s of [0, 1, 2] as const) {
    const fb = liftFloorButtonPos(1, s, c1.y, c1.doorAngle);
    const dirIn = new Vector3(fb.x - eyeIn.x, fb.y - eyeIn.y, fb.z - eyeIn.z).normalize();
    const tFloor = findTarget(feetIn, eyeIn, dirIn, false, true, snap);
    assert.deepEqual(tFloor, { kind: 'liftFloor', lift: 1, stop: s, current: s === 1 }, `floor button ${LIFT_STOPS[s]}`);
  }

  // Far away at Threshold north edge: null
  assert.equal(findTarget({ x: 0, y: -30, z: 93 }, { x: 0, y: -28.35, z: 93 }, { x: 0, y: 0, z: 1 }, false, true, snap), null);
});
console.log(`\n${passed} metro runtime checks passed`);
