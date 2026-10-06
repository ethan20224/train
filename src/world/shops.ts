// STUB — owned by Phase 5B — concourse arcade shops + cross-platform kiosk
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';

export async function buildShops(_ctx: BuildContext): Promise<WorldModule> {
  const object = new THREE.Group();
  object.name = 'shops';
  return { name: 'shops', object };
}
