// STUB — owned by Phase 2
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { FOG, SUN_DIRECTION } from '../layout';

/** Placeholder sky: vertical gradient dome with a hot sun glow (HDR > 1 so it blooms). Ignores fog. */
export async function buildSky(_ctx: BuildContext): Promise<WorldModule> {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x6f8fb0) },
      horizon: { value: new THREE.Color(FOG.color).multiplyScalar(1.6) },
      sunDir: { value: new THREE.Vector3(...SUN_DIRECTION) },
      sunColor: { value: new THREE.Color(0xffe0a8).multiplyScalar(14) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.45));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 600.0) + 0.12 * pow(s, 14.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), mat);
  dome.name = 'skyDome';
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'sky';
  group.add(dome);
  return {
    name: 'sky',
    object: group,
    update: (f) => dome.position.copy(f.camera.position), // dome follows the camera: infinitely far
  };
}
