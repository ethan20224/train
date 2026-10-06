// STUB — owned by Phase 4D (platform edge doors + glowing edge line)
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';

export async function buildSafety(_ctx: BuildContext): Promise<WorldModule> {
  const object = new THREE.Group();
  object.name = 'safety';
  return { name: 'safety', object };
}
