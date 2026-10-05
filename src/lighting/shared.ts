import * as THREE from 'three';
import { SUN_DIRECTION } from '../layout';

/**
 * Cross-module look state for the golden-hour rig. Lighting, sky, atmosphere (dust) and the post-processing
 * god-ray pass all agree on these numbers. main.ts constructs PostFX before any module is built and the
 * BuildContext does not carry it, so the PostFX god-ray pass finds the sun shadow map through `lookShared`.
 */

/** Unit vector pointing TOWARD the sun. */
export const SUN_DIR = new THREE.Vector3(...SUN_DIRECTION).normalize();

/** Warm golden sun colour (about 3200 K), linear. Intensity lives in lighting.ts. */
export const SUN_COLOR = new THREE.Color(1.0, 0.72, 0.42);

/**
 * Linear HDR haze colour. The fog colour, the sky horizon band and the far-platform haze are ONE colour so the
 * platforms dissolve into the sky without a seam. Components may exceed 1 (over-exposed golden sky).
 */
export const HAZE_COLOR = new THREE.Color(0.95, 0.56, 0.27);

export const lookShared: {
  /** The one shadow-casting sun. Set by buildLighting. */
  sun: THREE.DirectionalLight | null;
  /** True once lighting.finalize has rendered the static shadow map. */
  shadowReady: boolean;
} = { sun: null, shadowReady: false };

/** Linear depth-compare shadow texture of the sun (hardware PCF `sampler2DShadow`), or null before finalize. */
export function sunShadowTexture(): THREE.DepthTexture | null {
  const s = lookShared.sun;
  return lookShared.shadowReady && s?.shadow.map ? (s.shadow.map.depthTexture ?? null) : null;
}
