import * as THREE from 'three';
import type { PresetName } from '../core/presets';
import type { BuildContext, FrameInfo, WorldModule } from '../core/types';
import { METRO_TRAIN, VESPER } from '../layoutMetro';
import { disc } from '../metro/disc';
import { onMetroFrame } from '../metro/runtime';
import { createTimetable, type TrainState } from '../metro/timetable';
import { TRACKS, trackOf } from '../metro/tracks';
import { alignedPsdDoorOpen, evaluatePortalWaves, formatTransomText, trackIndexOf } from '../metro/choreography';
import { buildMetroImpostors } from './metro/impostors';
import { createMetroMaterials } from './metro/materials';
import { buildEscalators } from './metro/escalators';
import { buildOculus } from './metro/oculus';
import { buildVoidShell } from './metro/void';
import { buildDisc } from './metro/disc';
import { buildThresholdFixtures } from './metro/gates';
import { buildCavernShell } from './metro/shell';
import { buildBuriedSky } from './metro/sky';
import { buildMeridianBridge } from './metro/meridian';
import { buildCrossing } from './metro/crossing';
import { buildHalcyonHall } from './metro/halcyon';
import { buildPortals } from './metro/portals';
import { buildWaterWall } from './metro/waterWall';
import { buildOnyxWall } from './metro/onyxWall';
import { buildLiftsView } from './metro/liftsView';
import { buildFunicularView } from './metro/funicularView';
import { updateSensingHalo } from './metro/halo';
import { createTrainsView } from './metro/trainsView';

/** Meridian Deep (spec: docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md). Monolith & Machine cavern complete. */
export async function buildMetro(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'metro';
  const voidGroup = new THREE.Group();
  voidGroup.name = 'metroVoid';
  const deepGroup = new THREE.Group();
  deepGroup.name = 'metroDeep';
  const impostors = buildMetroImpostors();

  const kit = createMetroMaterials(ctx.renderer, ctx.materials);
  const oculus = buildOculus(ctx.materials, kit, disc.gateOpen('top'));
  voidGroup.add(oculus.group, buildVoidShell(ctx.materials, kit).group);
  const esc = buildEscalators(kit);
  voidGroup.add(esc.voidGroup);
  deepGroup.add(esc.deepGroup);
  const shell = buildCavernShell(ctx.materials, kit, { omitPortalLiners: true, omitOnyxZone: true });
  const sky = buildBuriedSky(ctx.materials, kit);
  const meridian = buildMeridianBridge(ctx.materials, kit);
  const crossing = buildCrossing(ctx.materials, kit, ctx.renderer);
  const halcyon = buildHalcyonHall(ctx.materials, kit, { omitPortalLiners: true });
  const portals = buildPortals(ctx.materials, kit);
  const waterWall = buildWaterWall(ctx.materials, kit);
  const onyxWall = buildOnyxWall(ctx.materials, kit);
  const liftsView = buildLiftsView(ctx.materials, kit, ctx.renderer);
  const funicularView = buildFunicularView(ctx.materials, kit);
  const timetable = createTimetable({ seed: 42 });
  const trainsView = createTrainsView(kit);
  voidGroup.add(liftsView.voidGroup, funicularView.voidGroup);
  deepGroup.add(
    shell.group, sky.group, meridian.group, crossing.group, halcyon.group, portals.group,
    waterWall.group, onyxWall.group, liftsView.deepGroup, funicularView.deepGroup, trainsView.object,
  );
  // 6 PSD row controllers ordered identically to TRACKS [meridian0, meridian1, vesper0, vesper1, halcyon0, halcyon1]
  const psdRows = [
    meridian.psdRows[0], meridian.psdRows[1],
    crossing.psdRows[0], crossing.psdRows[1],
    halcyon.psdRows[0], halcyon.psdRows[1],
  ] as const;
  const hadDoorsOpen: boolean[] = [false, false, false, false, false, false];
  const stoppedByTrack: Array<TrainState | null> = [null, null, null, null, null, null];
  const displayByTrack: Array<TrainState | null> = [null, null, null, null, null, null];
  const waveBuf = new Float32Array(portals.boreCount * portals.segmentCount);
  const HALF_LEN = METRO_TRAIN.length / 2;

  const syncPsds = (trains: readonly TrainState[]): void => {
    for (let i = 0; i < 6; i++) { stoppedByTrack[i] = null; displayByTrack[i] = null; }
    for (let k = 0; k < trains.length; k++) {
      const t = trains[k]!;
      if (t.phase === 'gone') continue;
      const idx = trackIndexOf(t.line, t.track);
      if (t.phase === 'stopped') {
        stoppedByTrack[idx] = t;
        displayByTrack[idx] = t;
      } else if (t.phase === 'departing') {
        const tr = trackOf(t.line, t.track);
        if (!displayByTrack[idx] && t.s - HALF_LEN < tr.portalOut + 15) displayByTrack[idx] = t;
      } else if (t.phase === 'approaching') {
        if (!displayByTrack[idx]) displayByTrack[idx] = t;
      }
    }
    for (let idx = 0; idx < 6; idx++) {
      const tr = TRACKS[idx]!;
      const row = psdRows[idx]!;
      const st = stoppedByTrack[idx]!;
      if (st) {
        if (st.doors01 > 0.01) hadDoorsOpen[idx] = true;
      } else {
        hadDoorsOpen[idx] = false;
      }
      const centres = row.doorCentres;
      for (let d = 0; d < row.doorCount; d++) {
        row.setOpen(d, alignedPsdDoorOpen(centres[d]!, st));
      }
      row.setDisplay(formatTransomText(tr.line, tr.track, displayByTrack[idx]!, hadDoorsOpen[idx]!));
    }
  };

  const syncPortalWaves = (trains: readonly TrainState[], realSec: number): void => {
    const segs = portals.segmentCount;
    evaluatePortalWaves(trains, realSec, segs, waveBuf);
    for (let b = 0; b < portals.boreCount; b++) {
      const base = b * segs;
      for (let s = 0; s < segs; s++) portals.setSegment(b, s, waveBuf[base + s]!);
    }
    portals.commit();
  };

  const sinking = buildDisc(ctx.materials, kit, VESPER.topY);
  sinking.group.position.y = disc.y;
  voidGroup.add(sinking.group);
  deepGroup.add(sinking.wellGate);
  const fixtures = buildThresholdFixtures(ctx.materials, kit);
  voidGroup.add(fixtures.group);

  // Real-time visuals: they follow the runtime every displayed frame, also at ?timescale=0 (the module update below only runs with simulation time).
  let realClock = 0;
  onMetroFrame((dt, feet) => {
    realClock += dt;
    sinking.update(disc.y, disc.gateOpen('bottom'));
    oculus.update(disc.gateOpen('top'));
    fixtures.update(dt, feet);
    liftsView.update();
    funicularView.update();
    syncPortalWaves(timetable.trains(), realClock);
    waterWall.update(realClock);
    updateSensingHalo(dt, feet);
  });

  root.add(voidGroup, deepGroup, impostors.deepImpostor, impostors.surfaceImpostor);
  root.userData.deepMaterials = [
    ...kit.deepList, ...shell.deepMaterials, ...sky.deepMaterials, ...meridian.deepMaterials,
    ...crossing.deepMaterials, ...halcyon.deepMaterials, ...portals.deepMaterials,
    ...waterWall.deepMaterials, ...onyxWall.deepMaterials, ...liftsView.deepMaterials, ...funicularView.deepMaterials,
    ...sinking.wellDeepMaterials, ...esc.deepMaterials, ...trainsView.pbrMaterials,
  ];
  root.userData.bothZoneMaterials = [...liftsView.bothZoneMaterials, ...funicularView.bothZoneMaterials];
  const voidMats = new Set<THREE.MeshStandardMaterial>();
  voidGroup.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) voidMats.add(m as THREE.MeshStandardMaterial);
  });
  for (const m of root.userData.deepMaterials as THREE.Material[]) voidMats.delete(m as THREE.MeshStandardMaterial);
  for (const m of root.userData.bothZoneMaterials as THREE.Material[]) voidMats.delete(m as THREE.MeshStandardMaterial);
  root.userData.voidMaterials = [...voidMats];

  let deepEntered = false;
  root.userData.onEnterDeep = (): void => {
    if (deepEntered) return;
    deepEntered = true;
    timetable.enteredDeep();
  };
  root.userData.getTrains = () => timetable.trains();
  root.userData.getPsdState = () =>
    TRACKS.map((tr, i) => ({
      line: tr.line,
      track: tr.track,
      maxOpen: psdRows[i]!.maxOpen(),
      display: psdRows[i]!.getDisplay(),
    }));
  root.userData.stageTrainsForPreset = (preset: PresetName): void => {
    if (preset !== 'train') return;
    // Fast-forward the real deterministic timetable until a Vesper track-0 train is stopped with doors open.
    for (let i = 0; i < 6000; i++) {
      timetable.update(0.05);
      const ready = timetable.trains().some((t) => t.line === 'vesper' && t.track === 0 && t.phase === 'stopped' && t.doors01 >= 0.999);
      if (ready) break;
    }
    const ts = timetable.trains();
    trainsView.update(ts, ctx.camera.position);
    syncPsds(ts);
    syncPortalWaves(ts, realClock);
  };

  return {
    name: 'metro',
    object: root,
    update(f: FrameInfo): void {
      timetable.update(f.dt);
      const ts = timetable.trains();
      trainsView.update(ts, f.camera.position);
      syncPsds(ts);
    },
  };
}
