// STUB — owned by Phase 2
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { CONCOURSE, SHED, SUN_DIRECTION } from '../layout';

/**
 * Placeholder lighting: a directional sun from the spec direction (static shadow map rendered once via
 * the finalize mechanism, see core/types.ts) + hemisphere fill. Phase 2 replaces this with the 4096^2 fitted
 * shadow, CubeCamera -> PMREM environment, LightProbe and bounce lights.
 */
export async function buildLighting(_ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'lighting';

  const sun = new THREE.DirectionalLight(0xffd9a0, 4.0);
  const centre = new THREE.Vector3(0, 10, (CONCOURSE.zMin + SHED.zMax) / 2);
  sun.target.position.copy(centre);
  sun.position.copy(centre).addScaledVector(new THREE.Vector3(...SUN_DIRECTION), 250);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -150;
  cam.right = 150;
  cam.bottom = -150;
  cam.top = 150;
  cam.near = 1;
  cam.far = 600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  root.add(sun, sun.target);

  root.add(new THREE.HemisphereLight(0xffe2b8, 0x6b4a2a, 0.9));

  return {
    name: 'lighting',
    object: root,
    finalize(c: BuildContext): void {
      // One-time static shadow render (renderer.shadowMap.autoUpdate is false; the sun never moves).
      c.renderer.shadowMap.needsUpdate = true;
    },
  };
}
