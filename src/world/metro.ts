import * as THREE from 'three';
import type { BuildContext, FrameInfo, WorldModule } from '../core/types';
import { VESPER } from '../layoutMetro';
import { disc } from '../metro/disc';
import { onMetroFrame } from '../metro/runtime';
import { buildGreybox } from './metro/greybox';
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

/** Meridian Deep (spec: docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md). Phase 3: replacing deep greybox with Monolith & Machine. */
export async function buildMetro(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'metro';
  const gb = buildGreybox();
  const kit = createMetroMaterials(ctx.renderer, ctx.materials);
  const oculus = buildOculus(ctx.materials, kit, disc.gateOpen('top'));
  gb.voidGroup.add(oculus.group, buildVoidShell(ctx.materials, kit).group);
  const esc = buildEscalators(kit);
  gb.voidGroup.add(esc.voidGroup);
  gb.deepGroup.add(esc.deepGroup);
  const shell = buildCavernShell(ctx.materials, kit, { omitPortalLiners: true, omitOnyxZone: true });
  const sky = buildBuriedSky(ctx.materials, kit);
  const meridian = buildMeridianBridge(ctx.materials, kit);
  const crossing = buildCrossing(ctx.materials, kit, ctx.renderer);
  const halcyon = buildHalcyonHall(ctx.materials, kit, { omitPortalLiners: true });
  const portals = buildPortals(ctx.materials, kit);
  const waterWall = buildWaterWall(ctx.materials, kit);
  const onyxWall = buildOnyxWall(ctx.materials, kit);
  gb.deepGroup.add(shell.group, sky.group, meridian.group, crossing.group, halcyon.group, portals.group, waterWall.group, onyxWall.group);
  void meridian.psdRows; // driven by timetable in Phase 4 (P4-3)
  void crossing.psdRows; // driven by timetable in Phase 4 (P4-3)
  void halcyon.psdRows;  // driven by timetable in Phase 4 (P4-3)
  const sinking = buildDisc(ctx.materials, kit, VESPER.topY);
  sinking.group.position.y = disc.y;
  gb.voidGroup.add(sinking.group);
  gb.deepGroup.add(sinking.wellGate);
  const fixtures = buildThresholdFixtures(ctx.materials, kit);
  gb.voidGroup.add(fixtures.group);
  // Real-time visuals: they follow the runtime every displayed frame, also at ?timescale=0 (the module update below only runs with simulation time).
  let realClock = 0;
  onMetroFrame((dt, feet) => {
    realClock += dt;
    sinking.update(disc.y, disc.gateOpen('bottom'));
    oculus.update(disc.gateOpen('top'));
    fixtures.update(dt, feet);
    portals.updateIdle(realClock);
    waterWall.update(realClock);
  });
  root.add(gb.voidGroup, gb.deepGroup, gb.deepImpostor, gb.surfaceImpostor);
  root.userData.deepMaterials = [
    ...kit.deepList, ...shell.deepMaterials, ...sky.deepMaterials, ...meridian.deepMaterials,
    ...crossing.deepMaterials, ...halcyon.deepMaterials, ...portals.deepMaterials,
    ...waterWall.deepMaterials, ...onyxWall.deepMaterials,
    ...sinking.wellDeepMaterials, ...gb.deepMaterials, ...esc.deepMaterials,
  ];
  const voidMats = new Set<THREE.MeshStandardMaterial>();
  gb.voidGroup.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) voidMats.add(m as THREE.MeshStandardMaterial);
  });
  for (const m of root.userData.deepMaterials as THREE.Material[]) voidMats.delete(m as THREE.MeshStandardMaterial);
  root.userData.voidMaterials = [...voidMats];
  return {
    name: 'metro',
    object: root,
    update(_f: FrameInfo): void {
      // nothing: every metro visual is driven in real time by onMetroFrame
    },
  };
}
