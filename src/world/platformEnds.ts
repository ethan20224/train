// STUB — owned by Phase 5A — platform ends (ramps, gates, signals, mirrors, signal box) + platform luggage
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';

export async function buildPlatformEnds(_ctx: BuildContext): Promise<WorldModule> {
  const object = new THREE.Group();
  object.name = 'platformEnds';
  return { name: 'platformEnds', object };
}
