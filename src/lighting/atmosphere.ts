// STUB — owned by Phase 2
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { FOG } from '../layout';

/** Placeholder atmosphere: warm FogExp2 only. Phase 2 adds god-ray shafts and dust. */
export async function buildAtmosphere(ctx: BuildContext): Promise<WorldModule> {
  ctx.scene.fog = new THREE.FogExp2(FOG.color, FOG.density);
  ctx.scene.background = new THREE.Color(FOG.color);
  return { name: 'atmosphere', object: new THREE.Group() };
}
