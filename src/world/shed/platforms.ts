import * as THREE from 'three';
import type { BuildContext } from '../../core/types';
import { CROSS_PLATFORM, ISLANDS, RAIL, SHED, TRACKS } from '../../layout';
import { box, finish, instanced, mesh, T, tinted } from './common';

const BED_TOP = -1.36;
const FACE_BOTTOM = -1.5;
const COPING = 0.6;
const LINE_W = 0.12;
const RAIL_BASE = RAIL.topY - 0.15;
const TRACK_START = CROSS_PLATFORM.zMax + 6.4; // 108.4: rails start at the buffer stops
/** The old straight tracks end here; src/world/tracks.ts (the throat network) continues from this z. */
const TRACK_END = 392;

/** Platforms, ground, ballast, rails, sleepers, buffer stops. */
export function buildPlatforms(ctx: BuildContext): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'shedPlatforms';
  const X0 = SHED.xMin;
  const X1 = SHED.xMax;

  const face: THREE.BufferGeometry[] = [];
  const top: THREE.BufferGeometry[] = [];
  const coping: THREE.BufferGeometry[] = [];
  const line: THREE.BufferGeometry[] = [];

  // Cross platform (z 102..108), widened to the shed walls.
  face.push(box(X0, X1, FACE_BOTTOM, -0.05, CROSS_PLATFORM.zMin, CROSS_PLATFORM.zMax));
  const edgeZ = CROSS_PLATFORM.zMax;
  top.push(box(X0, X1, -0.1, 0, CROSS_PLATFORM.zMin, edgeZ - 0.72));
  const gaps: [number, number][] = [];
  let cursor: number = X0;
  for (const i of ISLANDS) {
    gaps.push([cursor, i.xMin]);
    cursor = i.xMax;
    top.push(box(i.xMin, i.xMax, -0.1, 0, edgeZ - 0.72, edgeZ));
  }
  gaps.push([cursor, X1]);
  for (const [a, b] of gaps) {
    line.push(box(a, b, -0.1, 0, edgeZ - 0.72, edgeZ - 0.6));
    coping.push(box(a, b, -0.25, 0, edgeZ - COPING, edgeZ + 0.04));
  }

  // Islands.
  for (const isl of ISLANDS) {
    const { xMin, xMax, zMin, zMax } = isl;
    face.push(box(xMin, xMax, FACE_BOTTOM, -0.05, zMin, zMax));
    top.push(box(xMin + COPING + LINE_W, xMax - COPING - LINE_W, -0.1, 0, zMin, zMax - COPING - LINE_W));
    for (const s of [-1, 1]) {
      const [a, b] = s < 0 ? [xMin - 0.04, xMin + COPING] : [xMax - COPING, xMax + 0.04];
      coping.push(box(a, b, -0.25, 0, zMin, zMax + 0.04));
      const la = s < 0 ? xMin + COPING : xMax - COPING - LINE_W;
      line.push(box(la, la + LINE_W, -0.1, 0, zMin, zMax - COPING));
    }
    // End coping + line across the northern end.
    coping.push(box(xMin - 0.04, xMax + 0.04, -0.25, 0, zMax - COPING, zMax + 0.04));
    line.push(box(xMin + COPING + LINE_W, xMax - COPING - LINE_W, -0.1, 0, zMax - COPING - LINE_W, zMax - COPING));
  }
  const faceMat = tinted(ctx, 'wallStone', 0xc9b08a);
  root.add(mesh(finish(ctx, face, 'wallStone'), faceMat, false));
  root.add(mesh(finish(ctx, top, 'platformStone'), ctx.materials.get('platformStone'), false));
  root.add(mesh(finish(ctx, coping, 'darkMarble'), ctx.materials.get('darkMarble'), false));
  const lineMat = tinted(ctx, 'platformStone', 0xf2dc8a, { roughness: 0.85 });
  root.add(mesh(finish(ctx, line, 'platformStone'), lineMat, false));

  // Ballast beds per track group (z 108 .. endZ).
  const spans: [number, number][] = [];
  const edges = [X0, ...ISLANDS.flatMap((i) => [i.xMin, i.xMax]), X1];
  for (let k = 0; k < edges.length; k += 2) spans.push([edges[k]!, edges[k + 1]!]);
  const bed = spans.map(([a, b]) => box(a, b, -1.62, BED_TOP, CROSS_PLATFORM.zMax, TRACK_END));
  // Ground under everything (gravel to the horizon) so no void shows through the arcade or past the beds.
  bed.push(box(-1600, 1600, -1.9, -1.62, CROSS_PLATFORM.zMax, RAIL.endZ + 160));
  const ballast = mesh(finish(ctx, bed, 'trackBallast'), ctx.materials.get('trackBallast'), false);
  root.add(ballast);

  // Rails: extruded real profile.
  const prof = new THREE.Shape();
  const pts: [number, number][] = [
    [-0.075, 0], [0.075, 0], [0.075, 0.022], [0.012, 0.04], [0.012, 0.105], [0.035, 0.115], [0.035, 0.15],
    [-0.035, 0.15], [-0.035, 0.115], [-0.012, 0.105], [-0.012, 0.04], [-0.075, 0.022],
  ];
  pts.forEach(([x, y], i) => (i === 0 ? prof.moveTo(x, y) : prof.lineTo(x, y)));
  prof.closePath();
  const railLen = TRACK_END - TRACK_START;
  const railGeo = new THREE.ExtrudeGeometry(prof, { depth: railLen, bevelEnabled: false });
  const railG = finish(ctx, [railGeo], 'railSteel');
  const railMat = tinted(ctx, 'railSteel', 0x7a7e86, { roughness: 0.75 });
  const railMats: THREE.Matrix4[] = [];
  for (const t of TRACKS) for (const s of [-1, 1]) railMats.push(T(t.centerX + (s * RAIL.gauge) / 2, RAIL_BASE, TRACK_START));
  root.add(instanced(railG, railMat, railMats, false));

  // Sleepers (instanced) out to z = 900; beyond that the haze swallows them.
  const sleeperGeo = finish(ctx, [box(-1.3, 1.3, -0.15, 0, -0.13, 0.13)], 'sleeperWood');
  const sMats: THREE.Matrix4[] = [];
  for (const t of TRACKS) for (let z = TRACK_START + 0.3; z < TRACK_END; z += 0.65) sMats.push(T(t.centerX, RAIL_BASE - 0.0, z));
  root.add(instanced(sleeperGeo, ctx.materials.get('sleeperWood'), sMats, false));

  return root;
}
