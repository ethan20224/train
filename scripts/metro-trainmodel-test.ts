// Metro train model invariants (P4-2). Run: node_modules/.bin/tsx scripts/metro-trainmodel-test.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { doorOffsets } from '../src/metro/tracks';
import { createSharedMaterials, createTrainRig, getTrainGeometry, LINE_COLORS } from '../src/metro/trainModel';
import { createTrainsView } from '../src/world/metro/trainsView';
import type { TrainState } from '../src/metro/timetable';

let passed = 0;
const test = (name: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${name}`); };
const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

test('door centres of the geometry match doorOffsets() within 1 cm', () => {
  const geo = getTrainGeometry(), want = doorOffsets();
  assert.equal(geo.doorCentres.length, want.length);
  want.forEach((w, i) => assert.ok(Math.abs(geo.doorCentres[i]! - w) < 0.01, `door ${i}: ${geo.doorCentres[i]} vs ${w}`));
});

test('doors open symmetrically (leaf slide attribute is balanced) and outward faces agree with normals', () => {
  const geo = getTrainGeometry();
  const a = geo.doorGlass.getAttribute('aSlide');
  let neg = 0, pos = 0;
  for (let i = 0; i < a.count; i++) { if (a.getX(i) < 0) neg++; else if (a.getX(i) > 0) pos++; }
  assert.equal(neg, pos);
  for (const [name, g] of Object.entries(geo)) {
    if (!(g instanceof THREE.BufferGeometry)) continue;
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), ix = g.index!;
    let bad = 0;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
    for (let t = 0; t < ix.count; t += 3) {
      const i0 = ix.getX(t), i1 = ix.getX(t + 1), i2 = ix.getX(t + 2);
      A.fromBufferAttribute(p, i0); B.fromBufferAttribute(p, i1); C.fromBufferAttribute(p, i2);
      N.crossVectors(B.sub(A), C.sub(A));
      if (N.lengthSq() < 1e-14) continue;
      if (N.dot(new THREE.Vector3(n.getX(i0), n.getY(i0), n.getZ(i0))) < 0) bad++;
    }
    assert.equal(bad, 0, `${name}: ${bad} triangles wound against their normals`);
  }
});

test('<= 10 draw calls and <= 60k triangles per train (near and far LOD)', () => {
  const rig = createTrainRig(createSharedMaterials(), 'vesper');
  for (const near of [true, false]) {
    rig.setInteriorDetail(near);
    const used = new Set<THREE.Material>(); let calls = 0, t = 0;
    rig.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible) { calls++; used.add(m.material as THREE.Material); t += tris(m.geometry); } });
    console.log(`     ${near ? 'near' : 'far '}: ${calls} calls, ${used.size} materials, ${t} tris`);
    assert.ok(calls <= 10 && used.size <= 10);
    assert.ok(t <= 60000);
  }
});

test('line colours are defined for all three lines', () => {
  for (const l of ['meridian', 'vesper', 'halcyon'] as const) assert.equal(LINE_COLORS[l].length, 3);
});

test('view pool never exceeds 4 and reuses meshes', () => {
  const view = createTrainsView(null, {});
  const mk = (id: number, track: 0 | 1, line: 'meridian' | 'vesper' | 'halcyon', s: number): TrainState => ({ id, line, track, s, v: 10, phase: 'approaching', doors01: 0, eta: 5 });
  const cam = new THREE.Vector3(0, -60, 70);
  const visible = (): number => view.object.children.filter((c) => c.visible).length;
  view.update([mk(1, 0, 'vesper', -200), mk(2, 1, 'vesper', -200), mk(3, 0, 'meridian', -200), mk(4, 1, 'meridian', -200)], cam);
  assert.equal(view.object.children.length, 4); assert.equal(visible(), 4);
  const ids = view.object.children.slice();
  view.update([mk(5, 0, 'halcyon', -300), mk(6, 1, 'halcyon', -300), mk(7, 0, 'vesper', -300), mk(8, 1, 'vesper', -300), mk(9, 0, 'meridian', -300)], cam);
  assert.equal(view.object.children.length, 4); assert.ok(visible() <= 4);
  view.update([], cam);
  assert.equal(visible(), 0);
  assert.deepEqual(view.object.children, ids);
});

console.log(`\n${passed} passed`);
