import * as THREE from 'three';
import type { BuildContext, FrameInfo, WorldModule } from '../core/types';
import { RAIL } from '../layout';
import { interlocking, network } from '../tracks/network';
import { TRACK_START_Z } from '../tracks/topology';
import { finish, instanced, mesh, tinted } from './shed/common';
import { GeoAcc, stations } from './tracks/sweep';
import { buildSleepers } from './tracks/sleepers';
import { buildStructures } from './tracks/structure';

/**
 * Renders the whole track network (see src/tracks): rails extruded from the real profile along every edge, timber
 * sleepers (lengthened through pointwork, no interpenetration), ballast beds + throat apron, animated switch blades,
 * frog / crossing noses + check rails, stone embankment / viaduct / iron girders for the goods-line flyover.
 * The shed module draws the six straight platform tracks up to z = CLIP_Z; this module continues from there.
 * Budget: 9 draw calls.
 */
export const CLIP_Z = 392;
const GAUGE = RAIL.gauge;
const BED_TOP = -1.36;
const GROUND_TOP = -1.62;
const RAIL_H = 0.15;
const NEAR_R = 520;
const SLEEPER_R = 640;

const RAIL_PROFILE: [number, number][] = [
  [-0.075, 0], [0.075, 0], [0.075, 0.022], [0.012, 0.04], [0.012, 0.105], [0.035, 0.115], [0.035, 0.15],
  [-0.035, 0.15], [-0.035, 0.115], [-0.012, 0.105], [-0.012, 0.04], [-0.075, 0.022],
];
const RAIL_FAR: [number, number][] = [[-0.075, 0], [0.075, 0], [0.04, 0.15], [-0.04, 0.15]];

export async function buildTracks(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'tracks';
  const g = network.graph;

  const railNear = new GeoAcc();
  const railFar = new GeoAcc();
  const ballast = new GeoAcc();
  const fittings = new GeoAcc();
  const sClipOf = TRACK_START_Z;

  // ------------------------------------------------------------------------------------------ rails + ballast
  for (const e of g.edges) {
    const d = g.paths[e.pathIdx]!;
    let s0 = e.s0;
    const s1 = e.s1;
    if (d.role === 'platform') s0 = Math.max(s0, CLIP_Z - sClipOf);
    if (s1 - s0 < 0.05) continue;
    const mid = d.path.poseAt((s0 + s1) / 2);
    const near = Math.hypot(mid.x, mid.z - CLIP_Z) < NEAR_R;
    const st = stations(d.path, s0, s1, near ? 6 : 30, near ? 2 : 4);
    for (const sd of [-1, 1]) (near ? railNear : railFar).sweep(st, near ? RAIL_PROFILE : RAIL_FAR, (sd * GAUGE) / 2, -RAIL_H, true, near ? new Set<number>() : new Set<number>([0]));
  }
  // ballast: bed ribbon per edge (elevated beds ride on the structure as a thin layer)
  for (const e of g.edges) {
    const d = g.paths[e.pathIdx]!;
    let s0 = e.s0;
    const s1 = e.s1;
    if (d.role === 'platform') s0 = Math.max(s0, CLIP_Z - sClipOf);
    if (s1 - s0 < 0.05) continue;
    const mid = d.path.poseAt((s0 + s1) / 2);
    const near = Math.hypot(mid.x, mid.z - CLIP_Z) < NEAR_R;
    const stb = stations(d.path, s0, s1, near ? 8 : 40, near ? 3 : 6);
    // per-station y lift: ground-level bed follows the rail top; elevated bed is a thin layer on the deck
    const lifted = d.path.ramps.length > 0;
    for (let j = 0; j + 1 < stb.length; j++) {
      const a = stb[j]!;
      const b = stb[j + 1]!;
      const ya = a.y + 1.1;
      const yb = b.y + 1.1;
      const bottomA = lifted && ya > 0.2 ? BED_TOP + ya - 0.04 : GROUND_TOP;
      const bottomB = lifted && yb > 0.2 ? BED_TOP + yb - 0.04 : GROUND_TOP;
      const wA = lifted && ya > 0.2 ? 0 : 0.45;
      const wB = lifted && yb > 0.2 ? 0 : 0.45;
      const P = (s: { x: number; z: number; h: number }, lat: number, y: number): THREE.Vector3 => new THREE.Vector3(s.x + Math.cos(s.h) * lat, y, s.z - Math.sin(s.h) * lat);
      const tA = BED_TOP + ya;
      const tB = BED_TOP + yb;
      const hw = 2.75;
      // top
      ballast.quad(P(a, -hw, tA), P(b, -hw, tB), P(b, hw, tB), P(a, hw, tA));
      if (wA > 0 || wB > 0) {
        // shoulders
        ballast.quad(P(a, hw, tA), P(b, hw, tB), P(b, hw + wB, bottomB), P(a, hw + wA, bottomA));
        ballast.quad(P(a, -hw - wA, bottomA), P(b, -hw - wB, bottomB), P(b, -hw, tB), P(a, -hw, tA));
      }
    }
  }

  // ------------------------------------------------------------------------------------------ fittings (frogs, crossings, check rails)
  const wedge = (x: number, y: number, z: number, yaw: number, len = 1.9): void => {
    // V-nose pointing along -forward (tip at the local origin, widening toward +forward)
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const ang = Math.atan2(0.2, len);
    fittings.box(x + s * (len / 2), y - 0.075, z + c * (len / 2), 0.13, 0.075, len / 2 - 0.05, yaw);
    for (const sg of [-1, 1]) {
      const cx = x + s * (len / 2) + c * sg * 0.1;
      const cz = z + c * (len / 2) - s * sg * 0.1;
      fittings.box(cx, y - 0.075, cz, 0.035, 0.075, len / 2, yaw + sg * ang);
    }
  };
  const bladeLen = 5.5;
  for (const t of network.turnouts) {
    const dv = g.edges[t.divergingEdge]!;
    const sp = g.paths[g.edges[t.straightEdge]!.pathIdx]!.path;
    const dp = g.paths[dv.pathIdx]!.path;
    const node = g.nodes[t.id]!;
    const atStart = dv.a === node.id;
    const sNodeS = (() => {
      const se = g.edges[t.straightEdge]!;
      return se.a === node.id ? se.s0 : se.s1;
    })();
    let frog: { x: number; z: number; sS: number } | null = null;
    for (let u = 3; u < 90; u += 0.4) {
      const q = dp.poseAt(atStart ? dv.s0 + u : dv.s1 - u);
      const pr = sp.project(q.x, q.z, Math.max(0, sNodeS - 100), Math.min(sp.length, sNodeS + 100));
      if (pr.d >= GAUGE) {
        const pp = sp.poseAt(pr.s);
        frog = { x: pp.x, z: pp.z, sS: pr.s };
        break;
      }
    }
    if (!frog) continue;
    if (Math.hypot(frog.x, frog.z - CLIP_Z) > NEAR_R) continue;
    // nose points toward the toe: yaw such that +forward (widening) is the facing direction
    const y = sp.yAt(frog.sS) - 0.0;
    wedge(frog.x - Math.sin(t.facing) * 0.95, y, frog.z - Math.cos(t.facing) * 0.95, t.facing);
    // check rails alongside the straight route
    const pose = sp.poseAt(frog.sS);
    for (const sg of [-1, 1]) {
      const lat = sg * (GAUGE / 2 - 0.095);
      const cx = pose.x + Math.cos(pose.h) * lat;
      const cz = pose.z - Math.sin(pose.h) * lat;
      fittings.box(cx, y - 0.11, cz, 0.035, 0.04, 1.8, pose.h);
    }
    void bladeLen;
  }
  for (const c of network.crossings) {
    if (Math.hypot(c.x, c.z - CLIP_Z) > NEAR_R) continue;
    const n = g.nodes[c.id]!;
    const y = n.y;
    const pa = n.pairs![0];
    const e0 = g.edges[pa[0]]!;
    const h0 = g.paths[e0.pathIdx]!.path.poseAt(e0.a === n.id ? e0.s0 : e0.s1).h;
    const pb = n.pairs![1];
    const e1 = g.edges[pb[0]]!;
    const h1 = g.paths[e1.pathIdx]!.path.poseAt(e1.a === n.id ? e1.s0 : e1.s1).h;
    fittings.box(n.x, y - 0.12, n.z, 0.3, 0.06, 2.6, h0);
    fittings.box(n.x, y - 0.12, n.z, 0.3, 0.06, 2.6, h1);
    // acute noses on the bisector (4 V-noses at the corners of the lattice)
    const half = c.angle / 2;
    const bis = (Math.sin(h0) + Math.sin(h1)) / 2;
    const bisZ = (Math.cos(h0) + Math.cos(h1)) / 2;
    let hb = Math.atan2(bis, bisZ);
    if (Math.abs(Math.sin(h0 - h1)) < 1e-6) hb = h0;
    // the bisector of two lines through the centre: use the direction that is within the acute sector
    const dist = GAUGE / 2 / Math.max(0.12, Math.sin(half)) * 0.9;
    for (const sg of [-1, 1]) wedge(n.x + Math.sin(hb) * sg * (dist - 0.95), y, n.z + Math.cos(hb) * sg * (dist - 0.95), hb + (sg > 0 ? Math.PI : 0), 1.7);
  }

  // ------------------------------------------------------------------------------------------ meshes
  const railMat = tinted(ctx, 'railSteel', 0x7a7e86, { roughness: 0.75 });
  const meshes: THREE.Object3D[] = [];
  const add = (m: THREE.Object3D): void => {
    m.userData.noShadow = true;
    meshes.push(m);
    root.add(m);
  };
  const noCast = (m: THREE.Mesh): THREE.Mesh => {
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  };
  add(noCast(mesh(finish(ctx, [railNear.toGeometry()], 'railSteel'), railMat, false)));
  if (!railFar.empty) add(noCast(mesh(finish(ctx, [railFar.toGeometry()], 'railSteel'), railMat, false)));
  add(noCast(mesh(finish(ctx, [ballast.toGeometry()], 'trackBallast'), ctx.materials.get('trackBallast'), false)));
  if (!fittings.empty) add(noCast(mesh(finish(ctx, [fittings.toGeometry()], 'railSteel'), railMat, false)));

  // sleepers
  const sl = buildSleepers(g, { cx: 0, cz: CLIP_Z, maxDist: SLEEPER_R, zMin: CLIP_Z, spacing: 0.65, halfLen: 1.3, halfWidth: 0.13, yBase: -RAIL_H });
  {
    const sg = new GeoAcc();
    sg.box(0, -0.075, 0, 0.5, 0.075, 0.13, 0);
    const geo = finish(ctx, [sg.toGeometry()], 'sleeperWood');
    const im = instanced(geo, ctx.materials.get('sleeperWood'), sl.matrices, false);
    im.frustumCulled = false;
    add(im);
  }

  // switch blades: two thin rails per turnout, animated with the point state
  const nT = network.turnouts.length;
  const bladeGeo = (() => {
    const b = new GeoAcc();
    b.box(0, 0.075, bladeLen / 2, 0.03, 0.075, bladeLen / 2, 0);
    b.box(0, 0.02, bladeLen / 2, 0.075, 0.02, bladeLen / 2, 0);
    return finish(ctx, [b.toGeometry()], 'railSteel');
  })();
  const bladeMat = tinted(ctx, 'railSteel', 0x8a8f98, { roughness: 0.55 });
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, nT * 2);
  blades.frustumCulled = false;
  blades.castShadow = false;
  blades.receiveShadow = true;
  blades.matrixAutoUpdate = false;
  const lastPos = new Float32Array(nT).fill(-1);
  const mA = new THREE.Matrix4();
  const mB = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const p3 = new THREE.Vector3();
  const setBlades = (i: number, pos: number): void => {
    const t = network.turnouts[i]!;
    const gap = 0.11 / bladeLen;
    // blade on the diverging side is closed for straight (pos 0); the opposite blade is closed for diverging (pos 1)
    const openDiv = pos;
    const openOpp = 1 - pos;
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1; // lateral side of the blade relative to facing
      const open = side === t.side ? openDiv : openOpp;
      const lat = side * (GAUGE / 2 - 0.08);
      q.setFromAxisAngle(up, t.facing);
      p3.set(t.x, t.y - RAIL_H + 0.0, t.z);
      mA.compose(p3, q, one);
      mB.makeTranslation(lat, 0, 0).multiply(new THREE.Matrix4().makeRotationY(-side * open * gap));
      mA.multiply(mB);
      blades.setMatrixAt(i * 2 + k, mA);
    }
  };
  for (let i = 0; i < nT; i++) setBlades(i, 0);
  for (let i = 0; i < nT; i++) lastPos[i] = 0;
  blades.instanceMatrix.needsUpdate = true;
  blades.userData.noShadow = true;
  root.add(blades);

  // structures (flyover embankment / viaduct / girders)
  const st = buildStructures(g);
  if (st.stone) {
    const stoneMat = tinted(ctx, 'wallStone', 0x8c7c68);
    add(noCast(mesh(finish(ctx, [st.stone], 'wallStone'), stoneMat, false)));
  }
  if (st.iron) {
    const ironMat = ctx.materials.get('castIron').clone();
    ironMat.name = 'trackIron';
    ironMat.color.set(0x24342b);
    add(noCast(mesh(finish(ctx, [st.iron], 'castIron'), ironMat, false)));
  }

  // debug / 6B handle
  const w = window as unknown as { __meridian?: Record<string, unknown> };
  if (w.__meridian) {
    w.__meridian.tracks = {
      network,
      interlocking,
      drawCalls: meshes.length + 1,
      pointStates: () => network.turnouts.map((t) => ({ id: t.id, number: t.number, ...interlocking.pointState(t.id) })),
      aspects: () => network.signals.map((s) => ({ id: s.id, aspect: interlocking.signalAspect(s.edge, s.dir) })),
      sleepers: sl.matrices.length,
    };
  }

  const update = (_f: FrameInfo): void => {
    let dirty = false;
    for (let i = 0; i < nT; i++) {
      const pos = interlocking.points[network.turnouts[i]!.id]!.pos;
      if (pos !== lastPos[i]) {
        lastPos[i] = pos;
        setBlades(i, pos);
        dirty = true;
      }
    }
    if (dirty) blades.instanceMatrix.needsUpdate = true;
  };
  return { name: 'tracks', object: root, update };
}
