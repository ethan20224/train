import * as THREE from 'three';
import type { BuildContext, FrameInfo, WorldModule } from '../core/types';
import { disc } from '../metro/disc';
import { buildGreybox } from './metro/greybox';
import { createMetroMaterials } from './metro/materials';
import { buildOculus } from './metro/oculus';
import { buildVoidShell } from './metro/void';

/** Meridian Deep (spec: docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md). Phase 2: greybox escalators and deep, the finished oculus and the void shell. */
export async function buildMetro(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'metro';
  const gb = buildGreybox();
  const kit = createMetroMaterials(ctx.renderer, ctx.materials);
  const oculus = buildOculus(ctx.materials, kit, disc.gateOpen('top'));
  gb.voidGroup.add(oculus.group, buildVoidShell(ctx.materials, kit).group);
  root.add(gb.voidGroup, gb.deepGroup, gb.deepImpostor, gb.surfaceImpostor);
  root.userData.deepMaterials = gb.deepMaterials;
  return {
    name: 'metro',
    object: root,
    update(f: FrameInfo): void {
      gb.disc.position.y = disc.y;
      oculus.update(f.dt, disc.gateOpen('top'));
    },
  };
}
