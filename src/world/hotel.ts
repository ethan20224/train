// STUB — owned by Phase 4 (4B — first-class lounge, booking office, concierge, hall restyle)
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';

export async function buildHotel(_ctx: BuildContext): Promise<WorldModule> {
  const object = new THREE.Group();
  object.name = 'hotel';
  return { name: 'hotel', object };
}
