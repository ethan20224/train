// STUB — owned by Phase 4 (4C — brass-and-glass ticket gates)
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';

export async function buildGates(_ctx: BuildContext): Promise<WorldModule> {
  const object = new THREE.Group();
  object.name = 'gates';
  return { name: 'gates', object };
}
