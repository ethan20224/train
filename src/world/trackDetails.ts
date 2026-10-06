import * as THREE from 'three';
import type { BuildContext, FrameInfo, WorldModule } from '../core/types';
import { RAIL } from '../layout';
import { interlocking, network } from '../tracks/network';
import { GeoAcc } from './tracks/sweep';

/**
 * Phase 6B trackside dressing (all driven by the data API in src/tracks/graph.ts): point machines + rodding, red/white marker
 * posts, numbered switch plates, signal gantries with route signals (aspects from the interlocking), catch points and buffer
 * stops at siding / spur ends. Draw calls: static vertex-coloured mesh + switch plates + gantry lenses = 3.
 */
const NEAR = 560; // only dress what can be seen: distance from the platform end (0, 392)
const WHITE: [number, number, number] = [0.8, 0.78, 0.7];
const RED: [number, number, number] = [0.62, 0.08, 0.06];
const GREY: [number, number, number] = [0.16, 0.17, 0.17];
const DARK: [number, number, number] = [0.07, 0.07, 0.075];
const IRON: [number, number, number] = [0.1, 0.12, 0.11];
const BRASS: [number, number, number] = [0.55, 0.4, 0.15];
const GAUGE = RAIL.gauge;

export async function buildTrackDetails(ctx: BuildContext): Promise<WorldModule> {
  void ctx;
  const root = new THREE.Group();
  root.name = 'trackDetails';
  const g = network.graph;
  const A = new GeoAcc();
  A.useColor = true;
  const c = (col: [number, number, number]): void => {
    A.color = col;
  };
  const near = (x: number, z: number): boolean => Math.hypot(x, z - 392) < NEAR;

  // ---- plates atlas (numbers 101..) -------------------------------------------------------------------------
  const nums = network.turnouts.map((t) => t.number);
  const cols = 8;
  const cell = 64;
  const rows = Math.ceil(nums.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * cell;
  cv.height = rows * cell;
  const cg = cv.getContext('2d')!;
  nums.forEach((n, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    cg.fillStyle = '#e8e0c8';
    cg.fillRect(x, y, cell, cell);
    cg.strokeStyle = '#1a1a18';
    cg.lineWidth = 4;
    cg.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
    cg.fillStyle = '#1a1a18';
    cg.font = 'bold 30px sans-serif';
    cg.textAlign = 'center';
    cg.textBaseline = 'middle';
    cg.fillText(String(n), x + cell / 2, y + cell / 2 + 2);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plates: number[] = [];
  const plateUv: number[] = [];
  const plateIdx: number[] = [];
  const plateNor: number[] = [];

  // ---- turnouts: machine, rodding, marker post, plate -------------------------------------------------------
  network.turnouts.forEach((t, i) => {
    if (!near(t.x, t.z)) return;
    const f = t.facing;
    const fx = Math.sin(f);
    const fz = Math.cos(f);
    const rx = Math.cos(f);
    const rz = -Math.sin(f);
    const side = -t.side; // cess side opposite the diverging branch
    const lat = side * (GAUGE / 2 + 1.25);
    const y = t.y;
    const mx = t.x + rx * lat + fx * 2.2;
    const mz = t.z + rz * lat + fz * 2.2;
    c(GREY);
    A.box(mx, y - 0.1, mz, 0.22, 0.22, 0.3, f);
    c(DARK);
    A.box(mx, y + 0.14, mz, 0.24, 0.03, 0.32, f);
    // rodding to the toe (two thin bars across the track)
    c(IRON);
    A.box(t.x + fx * 1.0 + rx * (lat / 2 + side * 0.2), y - 0.14, t.z + fz * 1.0 + rz * (lat / 2 + side * 0.2), Math.abs(lat) / 2 - 0.2, 0.02, 0.02, f);
    A.box(t.x + fx * 2.2 + rx * (lat / 2 + side * 0.2), y - 0.14, t.z + fz * 2.2 + rz * (lat / 2 + side * 0.2), Math.abs(lat) / 2 - 0.2, 0.02, 0.02, f);
    // marker post (white with red band) on the cess side, with the numbered plate above the machine
    const px = t.x + rx * side * (GAUGE / 2 + 2.1) - fx * 1.5;
    const pz = t.z + rz * side * (GAUGE / 2 + 2.1) - fz * 1.5;
    c(WHITE);
    A.box(px, y + 0.55, pz, 0.05, 0.65, 0.05, f);
    c(RED);
    A.box(px, y + 0.9, pz, 0.055, 0.1, 0.055, f);
    // plate: small quad on a short stake facing the facing direction's back (toward approaching trains)
    c(IRON);
    A.box(mx, y + 0.45, mz, 0.025, 0.3, 0.025, f);
    const pw = 0.3;
    const cxp = mx;
    const czp = mz;
    const base = plates.length / 3;
    // plate faces -facing (toward the toe's approach) and +facing: single double-sided quad
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const col = i % cols;
    const row = Math.floor(i / cols);
    for (const [a, b] of corners) {
      plates.push(cxp + rx * a * pw, y + 0.75 + b * 0.15, czp + rz * a * pw);
      plateNor.push(-fx, 0, -fz);
      plateUv.push((col + (a + 1) / 2) / cols, 1 - (row + (b + 1) / 2) / rows);
    }
    plateIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  // ---- crossings: small marker plate posts -------------------------------------------------------------------
  // ---- catch points -------------------------------------------------------------------------------------------
  for (const cp of network.catchPoints) {
    if (!near(cp.x, cp.z)) continue;
    c(IRON);
    A.box(cp.x + Math.cos(cp.heading) * 0.55, -1.2, cp.z - Math.sin(cp.heading) * 0.55, 0.04, 0.06, 1.4, cp.heading);
    c(RED);
    A.box(cp.x + Math.cos(cp.heading) * 1.9, -1.0, cp.z - Math.sin(cp.heading) * 1.9, 0.12, 0.2, 0.1, cp.heading);
    c(GREY);
    A.box(cp.x - Math.cos(cp.heading) * 1.4, -1.15, cp.z + Math.sin(cp.heading) * 1.4, 0.2, 0.12, 0.25, cp.heading);
  }

  // ---- buffer stops at siding / spur ends ---------------------------------------------------------------------
  for (const e of network.sidingEnds) {
    if (e.kind === 'platform' || !near(e.x, e.z)) continue;
    const h = e.heading + Math.PI; // buffers face the approaching train; model +z points to the dead end
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const y = -1.1;
    c(IRON);
    A.box(e.x + fx * 0.15, y + 0.5, e.z + fz * 0.15, 1.3, 0.1, 0.12, h); // beam
    A.box(e.x + rx * 1.1 + fx * 0.5, y + 0.15, e.z + rz * 1.1 + fz * 0.5, 0.08, 0.15, 0.6, h);
    A.box(e.x - rx * 1.1 + fx * 0.5, y + 0.15, e.z - rz * 1.1 + fz * 0.5, 0.08, 0.15, 0.6, h);
    c(BRASS);
    for (const s of [-1, 1]) A.box(e.x + rx * s * 0.7 - fx * 0.3, y + 0.5, e.z + rz * s * 0.7 - fz * 0.3, 0.14, 0.14, 0.3, h);
    c(RED);
    A.box(e.x + fx * 0.15, y + 1.0, e.z + fz * 0.15, 0.1, 0.1, 0.1, h);
  }

  // ---- gantries ---------------------------------------------------------------------------------------------------
  const heads: { x: number; y: number; z: number; sig: number }[] = [];
  for (const gr of network.gantries.slice(0, 3)) {
    const top = 7.4;
    c(IRON);
    for (const x of [gr.xMin, gr.xMax]) A.box(x, (top - 1.6) / 2, gr.z, 0.22, (top + 1.6) / 2, 0.22, 0);
    A.box((gr.xMin + gr.xMax) / 2, top, gr.z, (gr.xMax - gr.xMin) / 2, 0.12, 0.14, 0);
    A.box((gr.xMin + gr.xMax) / 2, top - 0.9, gr.z, (gr.xMax - gr.xMin) / 2, 0.08, 0.1, 0);
    const n = Math.round(gr.xMax - gr.xMin);
    for (let k = 0; k < n; k += 2) A.box(gr.xMin + k + 0.5, top - 0.45, gr.z, 0.04, 0.45, 0.04, 0);
    for (const sp of gr.spans) {
      const sig = gr.signals.find((s) => s.edge === sp.edge && s.dir === 1);
      if (!sig) continue;
      c(IRON);
      A.box(sp.x, top - 0.9 - 0.7, gr.z, 0.04, 0.7, 0.04, 0);
      c(DARK);
      A.box(sp.x, top - 2.2, gr.z - 0.1, 0.22, 0.42, 0.1, 0);
      heads.push({ x: sp.x, y: top - 2.2, z: gr.z - 0.2, sig: sig.id });
    }
  }
  const geo = A.toGeometry();
  const uv0 = new Float32Array((geo.getAttribute('position').count) * 2);
  geo.setAttribute('uv', new THREE.BufferAttribute(uv0, 2));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.35 });
  const body = new THREE.Mesh(geo, mat);
  body.matrixAutoUpdate = false;
  body.userData.noShadow = true;
  body.castShadow = false;
  body.receiveShadow = true;
  root.add(body);

  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(plates, 3));
  pg.setAttribute('normal', new THREE.Float32BufferAttribute(plateNor, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(plateUv, 2));
  pg.setIndex(plateIdx);
  const plateMesh = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
  plateMesh.userData.noShadow = true;
  plateMesh.matrixAutoUpdate = false;
  root.add(plateMesh);

  // ---- signal lenses (instanced, colour = aspect) -----------------------------------------------------------------
  const lensGeo = new THREE.CircleGeometry(0.1, 14);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
  const lens = new THREE.InstancedMesh(lensGeo, lensMat, Math.max(1, heads.length * 2));
  lens.frustumCulled = false;
  lens.userData.noShadow = true;
  const m4 = new THREE.Matrix4();
  heads.forEach((h, i) => {
    m4.makeTranslation(h.x, h.y + 0.14, h.z - 0.05);
    lens.setMatrixAt(i * 2, m4);
    m4.makeTranslation(h.x, h.y - 0.14, h.z - 0.05);
    lens.setMatrixAt(i * 2 + 1, m4);
  });
  const last: string[] = heads.map(() => '');
  const col = new THREE.Color();
  const dim = new THREE.Color(0.06, 0.05, 0.05);
  const setAspects = (): void => {
    let dirty = false;
    heads.forEach((h, i) => {
      const sg = network.signals[h.sig]!;
      const a = interlocking.signalAspect(sg.edge, sg.dir);
      if (last[i] === a) return;
      last[i] = a;
      dirty = true;
      lens.setColorAt(i * 2, a === 'red' ? col.setRGB(3, 0.1, 0.05) : dim);
      lens.setColorAt(i * 2 + 1, a === 'green' ? col.setRGB(0.2, 2.6, 0.9) : a === 'yellow' ? col.setRGB(3, 1.6, 0.1) : dim);
    });
    if (dirty && lens.instanceColor) lens.instanceColor.needsUpdate = true;
  };
  setAspects();
  lens.instanceMatrix.needsUpdate = true;
  root.add(lens);
  void g;
  let acc = 0;
  const update = (f: FrameInfo): void => {
    acc += f.dt;
    if (acc < 0.2) return;
    acc = 0;
    setAspects();
  };
  return { name: 'trackDetails', object: root, update };
}
