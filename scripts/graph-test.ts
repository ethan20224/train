// Node unit test of the track graph. Run: npm run graph-test
import assert from 'node:assert/strict';
import { network } from '../src/tracks/network';
import { angleDiff } from '../src/tracks/geom';
import { R_MAIN, R_YARD } from '../src/tracks/topology';

const g = network.graph;
let n = 0;
const ok = (name: string) => console.log(`ok   ${name}`, ++n);
assert.deepEqual(g.problems, [], `graph problems: ${g.problems.join('; ')}`);
ok('no structural problems (kinks, strays, bad degrees, ambiguous crossings, radii)');

// position gap at every node < 1 mm, tangent jump < 0.1 deg
let maxGap = 0;
let maxJump = 0;
for (const nd of g.nodes) {
  const hs: number[] = [];
  for (const eid of nd.edges) {
    const e = g.edges[eid]!;
    const s = e.a === nd.id ? e.s0 : e.s1;
    const p = g.paths[e.pathIdx]!.path.poseAt(s);
    maxGap = Math.max(maxGap, Math.hypot(p.x - nd.x, p.z - nd.z));
    hs.push(g.outHeading(nd, e));
  }
  if (nd.kind === 'plain') maxJump = Math.max(maxJump, Math.abs(angleDiff(hs[0]!, hs[1]! + Math.PI)));
  if (nd.kind === 'turnout') {
    const stemH = g.outHeading(nd, g.edges[nd.stem!]!);
    for (const eid of [nd.straight!, nd.diverging!]) maxJump = Math.max(maxJump, Math.abs(angleDiff(g.outHeading(nd, g.edges[eid]!), stemH + Math.PI)));
  }
  if (nd.kind === 'crossing') {
    for (const [a, b] of nd.pairs!) maxJump = Math.max(maxJump, Math.abs(angleDiff(g.outHeading(nd, g.edges[a]!), g.outHeading(nd, g.edges[b]!) + Math.PI)));
  }
}
console.log(`     max position gap ${(maxGap * 1000).toFixed(3)} mm, max tangent jump ${((maxJump * 180) / Math.PI).toFixed(5)} deg`);
assert.ok(maxGap < 0.001, `node gap ${maxGap}`);
assert.ok(maxJump < (0.1 * Math.PI) / 180, `tangent jump ${maxJump}`);
ok('G1 continuity at every node (gap < 1 mm, tangent jump < 0.1 deg)');

// every turnout's diverging radius >= minimum of its path
let minDiv = Infinity;
for (const t of network.turnouts) {
  const d = g.paths[g.edges[t.divergingEdge]!.pathIdx]!;
  assert.ok(t.divergingRadius >= d.minRadius - 1e-6, `turnout ${t.number}: R=${t.divergingRadius} < ${d.minRadius} (${d.id})`);
  minDiv = Math.min(minDiv, t.divergingRadius);
}
console.log(`     ${network.turnouts.length} turnouts, smallest diverging radius ${minDiv.toFixed(1)} m (main >= ${R_MAIN}, yard >= ${R_YARD})`);
ok('all turnouts respect their minimum diverging radius');

// all arcs of main routes >= 190, fan arcs >= 400
for (const d of g.paths) for (const s of d.path.segs) if (Math.abs(s.k) > 1e-9) assert.ok(1 / Math.abs(s.k) >= d.minRadius - 1e-6, `${d.id} arc R=${1 / Math.abs(s.k)}`);
ok('every arc respects its path minimum radius');

// gradient <= 2.5 %
let maxGrade = 0;
for (const d of g.paths) for (let s = 0; s <= d.path.length; s += 1) maxGrade = Math.max(maxGrade, Math.abs(d.path.slopeAt(s)));
console.log(`     max gradient ${(maxGrade * 100).toFixed(2)} %`);
assert.ok(maxGrade <= 0.025);
ok('gradient <= 2.5 %');

// platform tracks straight through z 392, grade separation clearance
for (const t of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) {
  const p = g.pathById(t).path;
  for (let s = 0; s < 283; s += 5) assert.ok(Math.abs(p.poseAt(s).h) < 1e-12, `${t} not straight at s=${s}`);
}
ok('platform tracks T1..T6 are straight up to z 392');
for (const o of network.overpasses) assert.ok(o.clearance >= 5.5, `overpass clearance ${o.clearance}`);
console.log(`     ${network.overpasses.length} grade-separated crossings, min clearance ${Math.min(...network.overpasses.map((o) => o.clearance)).toFixed(2)} m`);
ok('flyover clearance >= 5.5 m rail-to-rail');

// yard / shed clearance
const sbox = { x0: -40, x1: -33, z0: 388, z1: 397 };
const hut = { x0: 33, x1: 36.5, z0: 386, z1: 390.5 };
for (const d of g.paths) for (let s = 0; s <= d.path.length; s += 1) {
  const p = d.path.poseAt(s);
  for (const b of [sbox, hut]) assert.ok(!(p.x > b.x0 - 2 && p.x < b.x1 + 2 && p.z > b.z0 - 2 && p.z < b.z1 + 2), `${d.id} enters keep-clear footprint at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  if (p.z < 392 && p.z > 108.4) assert.ok(d.role === 'platform', `${d.id} below z 392`);
}
ok('signal box / lamp hut footprints stay clear (2 m margin); only platform tracks below z 392');

// Route coverage. Movements obey point rules (no branch-to-branch, no reversing), so inbound / outbound sets differ.
import { Traffic } from '../src/trains/traffic';
const tf = new Traffic(() => 0.5);
const plat = [0, 1, 2, 3, 4, 5];
const sidings = ['Y0', 'Y1', 'Y2', 'Y3', 'Y4'];
let depOk = 0;
let arrOk = 0;
const arrBy = new Map<string, number>();
const platArr = new Array(6).fill(0);
for (const k of plat) {
  for (const far of network.farPaths) {
    if (far === 'G' && k !== 5) continue; // the goods line leaves platform 6's own lead (z 394): only T6 can use it
    assert.ok(tf.departureRoute(k, far, 0), `no departure route platform ${k + 1} -> ${far}`); // any platform reaches any main line / far end
    depOk++;
    if (tf.arrivalRoute(far, k, 0)) {
      arrOk++;
      arrBy.set(far, (arrBy.get(far) ?? 0) + 1);
      platArr[k]++;
    }
  }
}
for (const k of plat) assert.ok(platArr[k] >= 2, `platform ${k + 1} has only ${platArr[k]} arrival origins`);
for (const far of network.farPaths) assert.ok((arrBy.get(far) ?? 0) >= (far === 'G' ? 1 : 2), `far end ${far} reaches only ${arrBy.get(far) ?? 0} platforms`);
const yardOut = plat.filter((k) => sidings.some((sd) => tf.shuntInRoute(k, sd, 0)));
const yardIn = plat.filter((k) => sidings.some((sd) => tf.shuntOutRoute(sd, k, 0)));
for (const sd of sidings) assert.ok(plat.some((k) => tf.shuntInRoute(k, sd, 0)) && plat.some((k) => tf.shuntOutRoute(sd, k, 0)), `siding ${sd} unreachable`);
console.log(`     departures: all ${depOk} platform->far-end routes exist (goods line G from platform 6 only); arrivals: ${arrOk}/${6 * network.farPaths.length}`);
console.log(`     arrival origins per platform: ${platArr.join(' ')}; yard shunt-in from platforms ${yardOut.map((k) => k + 1).join(',')}, shunt-out to platforms ${yardIn.map((k) => k + 1).join(',')}`);
ok('any platform reaches any main line / far end; every platform and far end has arrival routes; yard connected both ways');

const cross = g.nodes.filter((x) => x.kind === 'crossing').length;
const tOut = g.nodes.filter((x) => x.kind === 'turnout').length;
console.log(`     paths ${g.paths.length}, nodes ${g.nodes.length}, edges ${g.edges.length}, turnouts ${tOut}, flat diamonds ${cross}, overpasses ${network.overpasses.length}, gantries ${network.gantries.length}, signals ${network.signals.length}`);
console.log('GRAPH TEST PASS');
