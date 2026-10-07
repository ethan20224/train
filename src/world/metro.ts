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

/** Meridian Deep (spec: docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md). Phase 2: greybox escalators and deep, the finished oculus and the void shell. */
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
  const sinking = buildDisc(ctx.materials, kit, VESPER.topY);
  sinking.group.position.y = disc.y;
  gb.voidGroup.add(sinking.group);
  gb.deepGroup.add(sinking.wellGate);
  const fixtures = buildThresholdFixtures(ctx.materials, kit);
  gb.voidGroup.add(fixtures.group);
  // Real-time visuals: they follow the runtime every displayed frame, also at ?timescale=0 (the module update below only runs with simulation time).
  onMetroFrame((dt, feet) => {
    sinking.update(disc.y, disc.gateOpen('bottom'));
    oculus.update(disc.gateOpen('top'));
    fixtures.update(dt, feet);
  });
  root.add(gb.voidGroup, gb.deepGroup, gb.deepImpostor, gb.surfaceImpostor);
  root.userData.deepMaterials = [...gb.deepMaterials, ...esc.deepMaterials];
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
