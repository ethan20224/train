import * as THREE from 'three';

/**
 * Barely perceptible warm 3200 K sensing halo (spec §5, P3-9):
 * Injected into the deep-set honed limestone and dark terrazzo materials only.
 * Tracks the player's feet with a ~4 m smooth radial falloff and ~0.5 s smoothing as they move,
 * adding at most ~+0.05 warm 3200 K emissive lift of albedo ("the building noticing you").
 * Strictly invisible above the cavern (feet.y > -28) and in fixed-camera ?cam presets.
 */

const RADIUS = 4.0;
const LIFT = 0.05;
const WARM_3200K = new THREE.Vector3(1.0, 0.84, 0.64);
const SMOOTH_TAU = 0.5; // seconds fade/follow time constant

const uPlayer = { value: new THREE.Vector3(0, -1000, 0) };
const uGain = { value: 0.0 };
let initialized = false;

/** Chained shader hook for deep honed limestone & deep terrazzo (extends customProgramCacheKey). */
export function installSensingHalo(mat: THREE.MeshStandardMaterial): void {
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.uniforms.uPlayer = uPlayer;
    shader.uniforms.uHaloGain = uGain;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHaloWorldPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vHaloWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPlayer;\nuniform float uHaloGain;\nvarying vec3 vHaloWorldPos;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  if (uHaloGain > 0.001) {
    float hDist = length(vHaloWorldPos - uPlayer);
    float hFall = 1.0 - smoothstep(0.0, ${RADIUS.toFixed(1)}, hDist);
    hFall *= hFall;
    totalEmissiveRadiance += diffuseColor.rgb * vec3(${WARM_3200K.x.toFixed(2)}, ${WARM_3200K.y.toFixed(2)}, ${WARM_3200K.z.toFixed(2)}) * (${LIFT.toFixed(3)} * hFall * uHaloGain);
  }`,
      );
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|sensingHalo`;
}

/** Per displayed frame (real time, zero allocations). */
export function updateSensingHalo(dt: number, feet: { x: number; y: number; z: number }): void {
  const inCavern = feet.y < -28.0;
  const targetGain = inCavern ? 1.0 : 0.0;
  const alpha = 1.0 - Math.exp(-Math.max(0, dt) / SMOOTH_TAU);
  uGain.value += (targetGain - uGain.value) * alpha;
  if (inCavern) {
    if (!initialized || uGain.value < 0.01) {
      uPlayer.value.set(feet.x, feet.y, feet.z);
      initialized = true;
    } else {
      uPlayer.value.x += (feet.x - uPlayer.value.x) * alpha;
      uPlayer.value.y += (feet.y - uPlayer.value.y) * alpha;
      uPlayer.value.z += (feet.z - uPlayer.value.z) * alpha;
    }
  }
}
