import * as THREE from 'three';
import type { BuildContext, FrameInfo, WorldModule } from '../core/types';
import { ISLANDS, PLATFORM_SAFETY as PS, RAIL, SHED, TRACKS } from '../layout';
import { LOCO_LENGTH, CAR_LENGTH, CAR_COUNT, GAP } from '../trains/trainModel';
import { trainControl } from '../trains/scheduler';
import { finish, mesh, tinted } from './shed/common';
import { buildLeaf, buildRun, emptyParts, LEAF_HALF, type RunParts } from './safety/parts';
import { buildEdgeLight } from './safety/edgeLight';

/**
 * Phase 4D: half-height platform edge doors (brass + bevelled glass, matching the ticket gates) on both long
 * edges of every island, plus a glowing edge line that pulses amber when a train approaches / leaves.
 * Draw calls: 4 static (dark/wood/brass/glass) + 3 leaf instanced (brass/dark/glass) + 1 edge-light = 8.
 */
const LEAF_OFFSET = 0.115; // leaves run on the track side of the posts, hidden behind the fixed bays
const SOUND_RANGE = 45;
const ease = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function place(parts: RunParts, into: RunParts, m: THREE.Matrix4): void {
  for (const k of ['dark', 'wood', 'brass', 'glass'] as const) for (const g of parts[k]) into[k].push(g.applyMatrix4(m));
}

export async function buildSafety(ctx: BuildContext): Promise<WorldModule> {
  if (LOCO_LENGTH !== PS.consist.locoLength || CAR_LENGTH !== PS.consist.carLength || CAR_COUNT !== PS.consist.carCount || GAP !== PS.consist.gap) {
    throw new Error('safety: PLATFORM_SAFETY.consist is out of sync with trains/trainModel.ts');
  }
  const root = new THREE.Group();
  root.name = 'safety';

  // ---------------------------------------------------------------- door z centres (world)
  const doorZ = PS.doorOffsets.map((o) => RAIL.trainStopNoseZ + o).filter((z) => z - PS.openingWidth / 2 > PS.zMin + 0.4 && z + PS.openingWidth / 2 < PS.zMax - 0.4);
  const nDoors = doorZ.length;

  // ---------------------------------------------------------------- static geometry
  const all = emptyParts();
  const edgeX: number[] = [];
  const edgeDir: number[] = [];
  TRACKS.forEach((tr) => {
    const isl = ISLANDS.find((i) => i.id === tr.island)!;
    const west = tr.side === 'west';
    const x = west ? isl.xMin + PS.barrierInset : isl.xMax - PS.barrierInset;
    edgeX.push(x);
    edgeDir.push(west ? -1 : 1);
    place(buildRun(PS.zMin, PS.zMax, doorZ), all, new THREE.Matrix4().makeTranslation(x, 0, 0));
  });
  // Cross-platform north edge facing the buffer stops: fixed panels only (run rotated to lie along x).
  const crossSegs: [number, number][] = [
    [SHED.xMin + 0.3, ISLANDS[0]!.xMin + PS.barrierInset],
    ...[0, 1].map((i): [number, number] => [ISLANDS[i]!.xMax - PS.barrierInset, ISLANDS[i + 1]!.xMin + PS.barrierInset]),
    [ISLANDS[2]!.xMax - PS.barrierInset, SHED.xMax - 0.3],
  ];
  const crossM = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  for (const [x0, x1] of crossSegs) {
    const m = new THREE.Matrix4().makeTranslation(0, 0, PS.zMin).multiply(crossM);
    place(buildRun(x0, x1, []), all, m);
  }

  // ---------------------------------------------------------------- materials (same family as the gates)
  const brassMat = ctx.materials.get('brass');
  const dark = tinted(ctx, 'darkMarble', 0xffffff, { roughness: 0.3 });
  const wood = tinted(ctx, 'wood', 0x9a6a4a, { roughness: 0.45 });
  const glass = ctx.materials.get('glass').clone();
  glass.name = 'safetyGlass';
  glass.side = THREE.DoubleSide;
  glass.color.set(0xeaf2ee);
  glass.opacity = 0.2;

  const sDark = mesh(finish(ctx, all.dark, 'darkMarble'), dark, true);
  const sWood = mesh(finish(ctx, all.wood, 'wood'), wood, true);
  const sBrass = mesh(finish(ctx, all.brass, 'brass'), brassMat, true);
  const sGlass = mesh(finish(ctx, all.glass, 'glass'), glass, false);
  sGlass.renderOrder = 2;
  root.add(sDark, sWood, sBrass, sGlass);

  // ---------------------------------------------------------------- door leaves (instanced; one shared matrix buffer)
  const leaf = buildLeaf();
  const count = TRACKS.length * nDoors * 2;
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, cast: boolean, shared?: THREE.InstancedMesh): THREE.InstancedMesh => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    if (shared) m.instanceMatrix = shared.instanceMatrix;
    m.castShadow = cast;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    return m;
  };
  const lBrass = mk(finish(ctx, leaf.brass, 'brass'), brassMat, true);
  const lDark = mk(finish(ctx, leaf.dark, 'darkMarble'), dark, true, lBrass);
  const lGlass = mk(finish(ctx, leaf.glass, 'glass'), glass, false, lBrass);
  lGlass.renderOrder = 2;
  root.add(lBrass, lDark, lGlass);

  const mx = new THREE.Matrix4();
  const setLeaves = (k: number, o: number): void => {
    const e = ease(o);
    const slide = e * PS.openingWidth * 0.5;
    const x = edgeX[k]! + edgeDir[k]! * LEAF_OFFSET;
    for (let j = 0; j < nDoors; j++) {
      const base = (k * nDoors + j) * 2;
      const d = doorZ[j]!;
      lBrass.setMatrixAt(base, mx.makeTranslation(x, 0, d - LEAF_HALF - slide));
      lBrass.setMatrixAt(base + 1, mx.makeTranslation(x, 0, d + LEAF_HALF + slide));
    }
  };
  for (let k = 0; k < TRACKS.length; k++) setLeaves(k, 0);
  lBrass.instanceMatrix.needsUpdate = true;

  // ---------------------------------------------------------------- glowing edge line
  const edge = buildEdgeLight();
  root.add(edge.mesh);

  // ---------------------------------------------------------------- behaviour
  const open = new Float32Array(TRACKS.length); // linear 0..1
  const wantOpen = new Uint8Array(TRACKS.length);
  const level = new Float32Array(TRACKS.length); // edge-light activity 0..1
  const soundPos = new THREE.Vector3();
  const IDLE = { r: 1.0, g: 0.52, b: 0.16, i: 0.32, h: 0.25 };
  const AMBER = { r: 1.0, g: 0.4, b: 0.03, i: 1.5, h: 1.0 };

  const update = (f: FrameInfo): void => {
    const states = trainControl.trackStates();
    const cam = f.camera.position;
    let soundDist = 1e9;
    let soundOpen = false;
    let leavesDirty = false;
    const pulse = 0.5 + 0.5 * Math.sin(f.time * Math.PI * 2); // 1 Hz, smooth
    for (let k = 0; k < TRACKS.length; k++) {
      const st = states[k];
      const phase = st ? st.phase : null;
      // --- doors
      const tgt = phase === 'dwell' && st!.t >= PS.openDelay && st!.t < st!.dwell - PS.closedBeforeDeparture - PS.slideTime ? 1 : 0;
      if (tgt !== wantOpen[k]) {
        wantOpen[k] = tgt;
        // one soft sound for the door group nearest the camera
        const ex = edgeX[k]!;
        let bj = 0;
        let bd = 1e9;
        for (let j = 0; j < nDoors; j++) {
          const dd = Math.hypot(cam.x - ex, cam.z - doorZ[j]!);
          if (dd < bd) {
            bd = dd;
            bj = j;
          }
        }
        if (bd < SOUND_RANGE && bd < soundDist) {
          soundDist = bd;
          soundOpen = tgt === 1;
          soundPos.set(ex, 0.8, doorZ[bj]!);
        }
      }
      const prev = open[k]!;
      const next = clamp01(prev + ((tgt ? 1 : -1) * f.dt) / PS.slideTime);
      if (next !== prev) {
        open[k] = next;
        setLeaves(k, next);
        leavesDirty = true;
      }
      // --- edge light
      let active = false;
      if (st && phase) {
        if (phase === 'brake') active = true;
        else if (phase === 'cruiseIn') active = st.nose < RAIL.trainStopNoseZ + 600;
        else if (phase === 'accel' || phase === 'cruiseOut') active = st.nose < PS.zMax + 1;
      }
      const L0 = level[k]!;
      const L = L0 + ((active ? 1 : 0) - L0) * (1 - Math.exp(-f.dt / 0.7));
      level[k] = L;
      const p = ease(pulse);
      const c = edge.uCol[k]!;
      const lv = ease(clamp01(L));
      const intensity = IDLE.i + (AMBER.i * (0.55 + 0.75 * p) - IDLE.i) * lv;
      c.set(
        (IDLE.r + (AMBER.r - IDLE.r) * lv) * intensity,
        (IDLE.g + (AMBER.g - IDLE.g) * lv) * intensity,
        (IDLE.b + (AMBER.b - IDLE.b) * lv) * intensity,
        IDLE.h + (AMBER.h - IDLE.h) * lv,
      );
    }
    if (leavesDirty) lBrass.instanceMatrix.needsUpdate = true;
    if (soundDist < 1e9) ctx.audio.gate(soundPos, soundOpen);
  };

  // Debug / test hook (read-only snapshot).
  const w = window as unknown as { __meridian?: Record<string, unknown> };
  if (w.__meridian) w.__meridian.safety = () => ({ open: Array.from(open), level: Array.from(level), edgeI: edge.uCol.map((c) => c.x) });

  void LEAF_OFFSET;
  return { name: 'safety', object: root, update };
}
