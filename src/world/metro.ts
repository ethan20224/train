import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { disc } from '../metro/disc';
import { buildGreybox } from './metro/greybox';

/** Meridian Deep (spec: docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md). Phase 1: greybox. */
export async function buildMetro(_ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'metro';
  const gb = buildGreybox();
  root.add(gb.voidGroup, gb.deepGroup, gb.deepImpostor, gb.surfaceImpostor);
  root.userData.deepMaterials = gb.deepMaterials;
  return {
    name: 'metro',
    object: root,
    update(): void {
      gb.disc.position.y = disc.y;
    },
  };
}
