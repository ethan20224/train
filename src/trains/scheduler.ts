import * as THREE from 'three';
import type { BuildContext, FrameInfo, TrainVoice, WorldModule } from '../core/types';
import { RAIL, TRACKS } from '../layout';
import { interlocking, network } from '../tracks/network';
import { buildTrainModel, poseTrain, setLivery, LIVERY_COUNT, VEHICLES } from './trainModel';
import { Traffic, TRAIN_L, type Train, type TrackStateOut, type TPhase } from './traffic';

/**
 * Three.js glue for the traffic simulation (src/trains/traffic.ts): pooled articulated train models, voices,
 * culling, the TrainControl API used by the ticket ritual / platform safety, and the debug handles.
 * Trains follow routes through the interlocked throat; each vehicle is posed from its two bogie points.
 */
const POOL = 7;
const VOICE_ANCHOR_Z = 18; // roughly the cab / locomotive (model z)

export interface TrainControl {
  /** Tracks with no train present (arriving, dwelling or departing) and no reservation. */
  freeTracks(): number[];
  /** Tracks whose train is stopped or braking (a fallback when no slot is free for a new train). */
  occupiedTracks(): number[];
  /** True if a free pool slot exists to spawn a train. */
  hasFreeSlot(): boolean;
  /** Reserve the track: extend its dwelling train, or spawn one that arrives promptly. Returns false if impossible. */
  requestTrain(track: number): boolean;
  /** Currently reserved track indices. */
  reservedTracks(): number[];
  /** Read-only per-track state, one entry per TRACKS index (reused buffer, no allocation). */
  trackStates(): TrackState[];
}
export const trainControl: TrainControl = {
  freeTracks: () => [],
  occupiedTracks: () => [],
  hasFreeSlot: () => false,
  requestTrain: () => false,
  reservedTracks: () => [],
  trackStates: () => [],
};

/** Read-only per-track train state (index = TRACKS index). The returned array and its entries are reused; do not retain. */
export interface TrackState {
  track: number;
  /** null when no train is on this track. */
  phase: Phase | null;
  /** Seconds elapsed in the current phase. */
  t: number;
  /** Total dwell duration of the current train (s). Extended while the departure route is blocked. */
  dwell: number;
  /** World z of the nose. */
  nose: number;
  speed: number;
  /** True while the departure is held (route blocked): doors stay shut, dwell keeps extending. */
  held: boolean;
  /** What the train on this track is doing. */
  moving: 'arriving' | 'dwelling' | 'departing' | null;
}

export type Phase = TPhase;

interface Slot {
  holder: THREE.Group;
  model: THREE.Group;
  meshes: THREE.Mesh[];
  anchor: THREE.Object3D;
  voice: TrainVoice | null;
}

const seedRandom = (): (() => number) => Math.random;

export async function buildTrains(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'trains';
  const screenshotMode = new URLSearchParams(window.location.search).has('cam');

  const stats = { voicesCreated: 0, voicesDisposed: 0 };
  let livery = 0;
  const slots: Slot[] = [];
  for (let i = 0; i < POOL; i++) {
    const model = buildTrainModel(ctx, i % LIVERY_COUNT);
    const holder = new THREE.Group();
    holder.name = `train-${i}`;
    holder.add(model);
    const anchor = new THREE.Object3D();
    anchor.name = 'voiceAnchor';
    const bones = model.userData.bones as THREE.Bone[];
    anchor.position.set(0, 1, VOICE_ANCHOR_Z - VEHICLES[0]!.centre);
    bones[0]!.add(anchor);
    root.add(holder);
    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    slots.push({ holder, model, meshes, anchor, voice: null });
  }

  const traffic = new Traffic(seedRandom(), {
    onSpawn(t) {
      const s = slots[t.id]!;
      setLivery(s.model, livery++);
      s.holder.visible = true;
      s.voice = ctx.audio.createTrainVoice(s.anchor);
      stats.voicesCreated++;
    },
    onDespawn(t) {
      const s = slots[t.id]!;
      if (s.voice) stats.voicesDisposed++;
      s.voice?.dispose();
      s.voice = null;
      s.holder.visible = false;
    },
    onBrake(t) {
      slots[t.id]!.voice?.brake();
    },
    onDepart(t) {
      slots[t.id]!.voice?.depart();
    },
  }, interlocking);

  // Yard stock: two stabled sets visible in the sidings from the start.
  traffic.stable('Y2', 30);
  traffic.stable('Y4', 60);

  if (screenshotMode) {
    // platform 3 dwelling (long), platform 5 braking, a third set snaking through the hub centre crossover
    const idx = (id: string): number => TRACKS.findIndex((t) => t.id === id);
    const a = traffic.spawnArrival(idx('T3'), { far: 'T4', dwell: 150, force: true });
    if (a && a.profile) {
      a.t = a.profile.duration - 0.001;
      a.u = a.profile.uEnd;
      a.v = 0;
      a.waiting = false;
      traffic.update(0.01); // arrives: releases its route, keeps platform 3
    }
    for (const far of ['T4', 'T4b', 'T3']) if (traffic.spawnArrival(idx('T2'), { far, noseZ: 520, dwell: 120, force: true })) break;
    traffic.spawnArrival(idx('T5'), { far: 'T5', noseZ: 235, dwell: 120, force: true });
    traffic.setNextArrival(70);
  }

  // ----------------------------------------------------------------------------------------- API
  const stateBuf: TrackStateOut[] = TRACKS.map((_, i) => ({ track: i, phase: null, t: 0, dwell: 0, nose: 0, speed: 0, held: false, moving: null }));
  trainControl.freeTracks = () => traffic.freePlatforms().filter((k) => !traffic.trains.some((x) => x.active && x.reserved && x.platform === k));
  trainControl.occupiedTracks = () =>
    traffic.trains.filter((x) => x.active && x.platform !== null && (x.kind === 'dwell' || x.kind === 'arrival' || x.kind === 'shuntOut')).map((x) => x.platform!);
  trainControl.hasFreeSlot = () => traffic.trains.some((x) => !x.active);
  trainControl.trackStates = () => traffic.trackStates(stateBuf) as TrackState[];
  trainControl.reservedTracks = () => traffic.trains.filter((x) => x.active && x.reserved && x.platform !== null).map((x) => x.platform!);
  trainControl.requestTrain = (k: number) => traffic.requestTrain(k);

  const w = window as unknown as { __meridian: Record<string, unknown> };
  w.__meridian.trains = () => ({
    ...traffic.stats,
    voicesCreated: stats.voicesCreated,
    voicesDisposed: stats.voicesDisposed,
    reserved: trainControl.reservedTracks().map((i) => TRACKS[i]?.id),
    trains: traffic.trains.map((t, i) => ({
      slot: i,
      active: t.active,
      track: t.platform !== null ? TRACKS[t.platform]!.id : null,
      kind: t.active ? t.kind : null,
      route: t.active ? t.routeName : null,
      phase: t.kind === 'stabled' ? 'stabled' : traffic.phaseOf(t),
      noseZ: t.active ? traffic.noseZ(t) : 0,
      leaderU: t.u,
      speed: t.v,
      visible: slots[i]!.holder.visible,
      reserved: t.reserved,
      held: t.held,
      waiting: t.waiting,
    })),
  });
  w.__meridian.traffic = traffic;

  /** Test hook: for every active train, the distance (m) of each rendered bogie point to the route path. */
  const bogieDeviation = (): { max: number; points: number } => {
    let max = 0;
    let points = 0;
    const p = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (const t of traffic.trains) {
      if (!t.active || !t.route) continue;
      const slot = slots[t.id]!;
      slot.holder.updateMatrixWorld(true);
      const bones = slot.model.userData.bones as THREE.Bone[];
      VEHICLES.forEach((v, k) => {
        m.copy(bones[k]!.matrixWorld);
        for (const bz of [v.bogieA, v.bogieB]) {
          p.set(0, RAIL.topY, bz - v.centre).applyMatrix4(m);
          // nearest point on any piece's path (independent of the sampling used to place the vehicle)
          let best = Infinity;
          for (const pc of t.route!.pieces) {
            const path = network.graph.paths[pc.pathIdx]!.path;
            const lo = Math.min(pc.sFrom, pc.sTo) - 200;
            const hi = Math.max(pc.sFrom, pc.sTo) + 200;
            const r = path.project(p.x, p.z, Math.max(0, lo), Math.min(path.length, hi));
            if (r.d < best) best = r.d;
          }
          max = Math.max(max, best);
          points++;
        }
      });
    }
    return { max, points };
  };
  w.__meridian.bogieDeviation = bogieDeviation;

  /** Test hook: reservation conflicts between trains right now (shared edge / node), plus the max speed with any end of a train in the throat zone. */
  const routeCheck = (): { conflicts: string[]; throatMaxV: number; nan: boolean } => {
    const owner = new Map<string, number>();
    const conflicts: string[] = [];
    let throatMaxV = 0;
    let nan = false;
    for (const t of traffic.trains) {
      if (!t.active || !t.route) continue;
      if (!Number.isFinite(t.u) || !Number.isFinite(t.v)) nan = true;
      const rear = Math.max(0, t.u - TRAIN_L);
      const claim = (key: string): void => {
        const o = owner.get(key);
        if (o !== undefined && o !== t.id) conflicts.push(`${key} train ${o} & ${t.id}`);
        owner.set(key, t.id);
      };
      if (t.kind === 'stabled') claim(`e${t.route.pieces[0]!.edge}`);
      else {
        for (const pc of t.route.pieces) {
          if (pc.u1 > rear + 0.01 && pc.u0 < t.u - 0.01) claim(`e${pc.edge}`);
          if (pc.nodeEnd >= 0 && pc.u1 > rear + 0.01 && pc.u1 <= t.u + 0.01) claim(`n${pc.nodeEnd}`);
        }
        const zs = [traffic.noseZ(t), t.route.outwardPose(t.orient > 0 ? t.u - TRAIN_L : t.u).z];
        if (!t.waiting && t.v > 0.01 && zs.some((z) => z > 392 && z < 870)) throatMaxV = Math.max(throatMaxV, t.v);
      }
    }
    return { conflicts, throatMaxV, nan };
  };
  w.__meridian.routeCheck = routeCheck;

  // ----------------------------------------------------------------------------------------- frame
  const pose = { x: 0, z: 0, h: 0 };
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const sphere = new THREE.Sphere();

  const poseOne = (t: Train, s: Slot): void => {
    const route = t.route!;
    const orient = t.orient;
    const u = t.u;
    poseTrain(s.model, (d, out) => {
      const ud = orient > 0 ? u - d : u - TRAIN_L + d;
      route.outwardPose(ud, pose);
      out.x = pose.x;
      out.z = pose.z;
      out.y = route.yAt(ud);
    });
  };

  const update = (f: FrameInfo): void => {
    traffic.update(f.dt);
    pv.multiplyMatrices(f.camera.projectionMatrix, f.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    for (const t of traffic.trains) {
      const s = slots[t.id]!;
      if (!t.active || !t.route) continue;
      poseOne(t, s);
      s.voice?.setSpeed(t.v);
      // per-train frustum culling (the skinned meshes themselves are never culled)
      const un = t.orient > 0 ? t.u - TRAIN_L / 2 : t.u - TRAIN_L / 2;
      t.route.outwardPose(un, pose);
      sphere.center.set(pose.x, 2, pose.z);
      sphere.radius = TRAIN_L / 2 + 6;
      const vis = frustum.intersectsSphere(sphere);
      for (const m of s.meshes) m.visible = vis;
    }
  };

  return {
    name: 'trains',
    object: root,
    finalize(c) {
      // Upload geometry, bone textures and programs once (all trains visible, posed on their routes or parked far off).
      for (const [i, s] of slots.entries()) {
        const t = traffic.trains[i]!;
        s.holder.visible = true;
        for (const m of s.meshes) m.visible = true;
        if (t.active && t.route) poseOne(t, s);
        else
          poseTrain(s.model, (d, out) => {
            out.x = 0;
            out.y = RAIL.topY;
            out.z = 5000 + d;
          });
      }
      const mini = new THREE.Scene();
      const parent = root.parent;
      mini.add(root);
      const cam = new THREE.PerspectiveCamera(60, 1, 1, 20000);
      cam.position.set(0, 20, 4800);
      cam.lookAt(0, 0, 5100);
      void c;
      c.renderer.render(mini, cam);
      if (parent) parent.add(root);
      for (const [i, s] of slots.entries()) {
        if (!traffic.trains[i]!.active) s.holder.visible = false;
      }
    },
    update,
  };
}
