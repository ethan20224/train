// Node simulation of the traffic director over the real network (no rendering). Run: npx tsx scripts/traffic-sim.ts [minutes] [seed]
import assert from 'node:assert/strict';
import { Traffic, TRAIN_L, type TrackStateOut } from '../src/trains/traffic';
import { THROAT_Z0, THROAT_Z1 } from '../src/tracks/topology';
import { TRACKS } from '../src/layout';

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const minutes = Number(process.argv[2] ?? 30);
const seed = Number(process.argv[3] ?? 7);
const tf = new Traffic(mulberry(seed));
tf.stable('Y2', 30);
tf.stable('Y4', 55);
const dt = 0.05;
let fails = 0;
const fail = (m: string) => {
  if (fails++ < 25) console.log('FAIL', m);
};
const platformsSeen = new Set<number>();
let maxThroatV = 0;
let maxActive = 0;
let stopErr = 0;
let stops = 0;
let maxAcc = 0;
const lastV = new Map<number, number>();
const states: TrackStateOut[] = TRACKS.map((_, i) => ({ track: i, phase: null, t: 0, dwell: 0, nose: 0, speed: 0, held: false, moving: null }));
for (let step = 0; step < (minutes * 60) / dt; step++) {
  tf.update(dt);
  maxActive = Math.max(maxActive, tf.activeCount());
  for (const tr of tf.trains) {
    if (!tr.active || !tr.route) {
      lastV.delete(tr.id);
      continue;
    }
    if (!Number.isFinite(tr.u) || !Number.isFinite(tr.v)) fail(`NaN train ${tr.id}`);
    const rear = Math.max(0, tr.u - TRAIN_L);
    if (tr.kind !== 'stabled') {
      for (const pc of tr.route.pieces) {
        if (pc.u1 > rear + 0.01 && pc.u0 < tr.u - 0.01) {
          if (tf.il.edgeOwner[pc.edge] !== tr.id) fail(`t=${tf.time.toFixed(1)} train ${tr.id} (${tr.kind}) occupies edge ${pc.edge} owned by ${tf.il.edgeOwner[pc.edge]}`);
        }
        if (pc.nodeEnd >= 0 && pc.u1 > rear + 0.01 && pc.u1 <= tr.u + 0.01) {
          if (tf.il.nodeOwner[pc.nodeEnd] !== tr.id) fail(`train ${tr.id} on node ${pc.nodeEnd} owned by ${tf.il.nodeOwner[pc.nodeEnd]}`);
          if (!tr.waiting && pc.state >= 0 && tf.il.pointState(pc.nodeEnd).pos !== pc.state) fail(`t=${tf.time.toFixed(1)} train ${tr.id} ${tr.kind} ${tr.routeName} wait=${tr.waiting} u=${tr.u.toFixed(1)} u1=${pc.u1.toFixed(1)} on node ${pc.nodeEnd} points ${tf.il.pointState(pc.nodeEnd).pos} need ${pc.state}`);
        }
      }
    }
    const nz = tf.noseZ(tr);
    if (tr.v > 0.01 && nz > THROAT_Z0 && nz < THROAT_Z1 - 5 && tr.kind !== 'stabled') maxThroatV = Math.max(maxThroatV, tr.v);
    if (tr.kind === 'dwell') {
      stops++;
      stopErr = Math.max(stopErr, Math.abs(nz - 111));
      if (tr.platform !== null) platformsSeen.add(tr.platform);
    }
    const pv = lastV.get(tr.id);
    if (pv !== undefined) maxAcc = Math.max(maxAcc, Math.abs((tr.v - pv) / dt));
    lastV.set(tr.id, tr.v);
  }
  tf.trackStates(states);
}
console.log(JSON.stringify({ ...tf.stats, maxActive, maxThroatV: +maxThroatV.toFixed(2), stopErr: stopErr.toExponential(2), stops, platforms: [...platformsSeen].sort(), maxAcc: +maxAcc.toFixed(2) }));
assert.ok(maxThroatV <= 11.5, `throat speed ${maxThroatV}`);
assert.ok(stopErr <= 0.05, `stop error ${stopErr}`);
console.log(fails === 0 ? 'TRAFFIC SIM PASS' : `TRAFFIC SIM FAIL ${fails}`);
process.exit(fails ? 1 : 0);
