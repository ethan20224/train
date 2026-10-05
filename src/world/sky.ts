import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { HAZE_COLOR, SUN_COLOR, SUN_DIR } from '../lighting/shared';

/**
 * Over-exposed golden sky seen through the windows and the open shed. No city, no clouds: a gradient dome
 * (white-gold horizon -> apricot -> muted blue-violet zenith) with a broad warm glow and a small, very hot sun disc
 * in the exact sun direction (HDR >> 1, so it blooms through the glass).
 * The horizon band IS the fog colour (HAZE_COLOR) and everything below the horizon is that same colour, so
 * the platforms dissolve into the sky with no seam. The dome ignores fog itself (fog: false) and follows the camera.
 */
export async function buildSky(_ctx: BuildContext): Promise<WorldModule> {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      horizon: { value: HAZE_COLOR.clone() },
      apricot: { value: new THREE.Color(1.0, 0.5, 0.26) },
      zenith: { value: new THREE.Color(0.2, 0.23, 0.42) },
      sunDir: { value: SUN_DIR.clone() },
      sunColor: { value: SUN_COLOR.clone().lerp(new THREE.Color(1, 0.9, 0.7), 0.45) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w; // pinned to the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 horizon; uniform vec3 apricot; uniform vec3 zenith;
      uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        float s = clamp(dot(d, normalize(sunDir)), 0.0, 1.0);

        // Vertical gradient: white-gold horizon -> apricot -> blue-violet zenith.
        vec3 col = mix(horizon, apricot, smoothstep(0.0, 0.22, h));
        // Below the horizon: the same haze, a touch deeper, matching the fogged ground the eye meets there.
        col *= mix(1.0, 0.9, smoothstep(0.0, 0.05, -d.y));
        col = mix(col, zenith, pow(smoothstep(0.08, 0.95, h), 0.85));
        // Sun-side horizon swells brighter and whiter; the anti-solar side stays on the fog colour.
        float side = pow(0.5 + 0.5 * dot(normalize(d.xz + 1e-5), normalize(sunDir.xz)), 3.0);
        col += horizon * 0.55 * side * (1.0 - smoothstep(0.0, 0.5, h));

        // Broad glow, tight glow, disc (all HDR so the sun blooms).
        col += sunColor * (0.55 * pow(s, 6.0) + 2.4 * pow(s, 40.0) + 9.0 * pow(s, 400.0));
        float disc = smoothstep(0.99985, 0.99996, s);
        col += sunColor * 70.0 * disc;

        col += (hash(gl_FragCoord.xy) - 0.5) / 255.0; // anti-banding
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 24), mat);
  dome.name = 'skyDome';
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.userData.noShadow = true;
  const group = new THREE.Group();
  group.name = 'sky';
  group.add(dome);
  return {
    name: 'sky',
    object: group,
    update: (f) => dome.position.copy(f.camera.position), // infinitely far
  };
}
