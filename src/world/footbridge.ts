// STUB — owned by Phase 4 (4C — ornate iron footbridge)
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';

export async function buildFootbridge(_ctx: BuildContext): Promise<WorldModule> {
  const object = new THREE.Group();
  object.name = 'footbridge';
  return { name: 'footbridge', object };
}
