import * as THREE from 'three';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import type { BuildContext, WorldModule } from '../core/types';
import { BAYS, CAVERN, CONCOURSE, CROSS_OUTLINE, DEEP_SUN, LOUNGE_ROOM, SHED, SKY, VAULT } from '../layout';
import { SUN_COLOR, SUN_DIR, lookShared } from './shared';

/**
 * Golden-hour rig: one static shadow-casting sun, one-time environment capture (reflections + diffuse bounce),
 * a handful of non-shadowing bounce lights where the sun pools land, and a cool sky fill for the shade.
 * Everything is real-time; nothing here runs per frame (the sun never moves).
 */

const SUN_INTENSITY = 8.5;
const ENV_INTENSITY = 1.1;
const PROBE_INTENSITY = 0.9;
const CAPTURE_SIZE = 256;
/** Total shadow texels (4096^2); the aspect of the light-space box decides the split. */
const SHADOW_TEXELS = 4096 * 4096;

// z reaches the first-class lounge behind the south wall (and its terrace), so the low sun is shadow-mapped there too
const SURFACE_MIN = new THREE.Vector3(CONCOURSE.xMin - 3, -3, LOUNGE_ROOM.zMin - LOUNGE_ROOM.wallThickness - 1.2);
const SURFACE_MAX = new THREE.Vector3(SHED.xMax + 3, VAULT.crownY + 2, SHED.zMax + 2);
// Tight 24-vertex cross prism (cavern walls + floor down to Halcyon -84): ~3.08 cm/texel on the fixed 4096^2 map.
const DEEP_POINTS: readonly THREE.Vector3[] = CROSS_OUTLINE.flatMap(([x, z]) => [
  new THREE.Vector3(x, CAVERN.yBottom, z),
  new THREE.Vector3(x, SKY.y, z),
]);
const DEEP_DIR = new THREE.Vector3(...DEEP_SUN.direction).normalize();
const DEEP_COLOR = new THREE.Color(...DEEP_SUN.color);

function floorPow2(n: number): number {
  return 2 ** Math.floor(Math.log2(n));
}

/**
 * Fit the sun's orthographic shadow frustum tightly (in light space) around a set of world points.
 * Returns the light-space extents so the map resolution (or texel density check) can read them.
 */
function fitSunShadowPoints(sun: THREE.DirectionalLight, dir: THREE.Vector3, pts: readonly THREE.Vector3[]): { w: number; h: number } {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const q of pts) { min.min(q); max.max(q); }
  const centre = min.add(max).multiplyScalar(0.5);

  const zAxis = dir.clone(); // light looks along -z (camera convention): from the sun toward the centre
  const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
  const yAxis = zAxis.clone().cross(xAxis).normalize();

  let lx0 = Infinity, lx1 = -Infinity, ly0 = Infinity, ly1 = -Infinity, lz0 = Infinity, lz1 = -Infinity;
  const p = new THREE.Vector3();
  for (const q of pts) {
    p.copy(q).sub(centre);
    const x = p.dot(xAxis), y = p.dot(yAxis), z = p.dot(zAxis);
    lx0 = Math.min(lx0, x); lx1 = Math.max(lx1, x);
    ly0 = Math.min(ly0, y); ly1 = Math.max(ly1, y);
    lz0 = Math.min(lz0, z); lz1 = Math.max(lz1, z);
  }
  const dist = lz1 + 20; // eye sits beyond the nearest corner toward the sun
  sun.target.position.copy(centre);
  sun.position.copy(centre).addScaledVector(zAxis, dist);
  sun.target.updateMatrixWorld(true);
  sun.updateMatrixWorld(true);

  const cam = sun.shadow.camera;
  cam.left = lx0;
  cam.right = lx1;
  cam.bottom = ly0;
  cam.top = ly1;
  cam.near = 1; // eye is lz1+20 above the nearest corner
  cam.far = dist - lz0 + 20;
  cam.updateProjectionMatrix();
  return { w: lx1 - lx0, h: ly1 - ly0 };
}

function fitSunShadow(sun: THREE.DirectionalLight, dir: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): { w: number; h: number } {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z));
  return fitSunShadowPoints(sun, dir, pts);
}

export type SunMode = 'surface' | 'deep';
/** Re-aims the single sun and refits its static shadow camera. Caller sets renderer.shadowMap.needsUpdate. */
export function setSunMode(sun: THREE.DirectionalLight, mode: SunMode): void {
  if (mode === 'surface') {
    sun.color.copy(SUN_COLOR);
    fitSunShadow(sun, SUN_DIR, SURFACE_MIN, SURFACE_MAX);
  } else {
    sun.color.copy(DEEP_COLOR);
    fitSunShadowPoints(sun, DEEP_DIR, DEEP_POINTS);
  }
}

/** Day/night: re-aim the deep light (sun or moon) toward unit direction `dir` and refit its static shadow camera. Caller sets
 *  renderer.shadowMap.needsUpdate. */
export function setDeepSunDirection(sun: THREE.DirectionalLight, dir: THREE.Vector3): void {
  fitSunShadowPoints(sun, dir, DEEP_POINTS);
}

/** Floor-level upward spots that fake the warm bounce of the sun pools onto vault, walls and column undersides. */
function addBounceLights(root: THREE.Object3D): void {
  const d = SUN_DIR.clone().negate(); // direction the light travels
  const yMid = 11; // beam centre height at the window plane
  const t = yMid / -d.y; // path length from the window to the floor
  const poolX = CONCOURSE.xMin + d.x * t;
  for (const z0 of BAYS.windowCentersZ) {
    const poolZ = z0 + d.z * t;
    const s = new THREE.SpotLight(0xffb866, 520, 60, 1.38, 1, 2);
    s.position.set(poolX, 0.25, poolZ);
    s.target.position.set(poolX, 30, poolZ);
    s.castShadow = false;
    s.name = `bounce-pool-${z0}`;
    root.add(s, s.target);
  }
}

export async function buildLighting(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'lighting';

  ctx.renderer.shadowMap.enabled = true;
  // r186: PCFSoftShadowMap is deprecated (falls back to PCF). PCFShadowMap = hardware depth-compare + 5-tap Vogel
  // disc, which keeps window-grid patterns crisp-ish. VSM needs 2 extra RG16F targets at this size and bleeds.
  ctx.renderer.shadowMap.type = THREE.PCFShadowMap;
  ctx.renderer.shadowMap.autoUpdate = false;

  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.name = 'sun';
  sun.castShadow = true;
  const { w, h } = fitSunShadow(sun, SUN_DIR, SURFACE_MIN, SURFACE_MAX);
  // 4096^2 worth of texels, split to follow the light-space aspect (the world is long and low).
  const texW = Math.min(16384, floorPow2(Math.sqrt((SHADOW_TEXELS * w) / h)));
  const texH = Math.max(1024, Math.min(8192, floorPow2(SHADOW_TEXELS / texW)));
  sun.shadow.mapSize.set(texW, texH);
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.6; // soft far shadows (sun disc penumbra ~ distance x 0.009)
  root.add(sun, sun.target);
  lookShared.sun = sun;

  // Cool sky fill: shade reads slightly bluer than the gold light (split-tone contrast).
  const fill = new THREE.HemisphereLight(0x9fb8ec, 0x7a5a3c, 0.85);
  fill.name = 'skyFill';
  root.add(fill);

  addBounceLights(root);

  const probe = new THREE.LightProbe();
  probe.intensity = PROBE_INTENSITY;
  probe.name = 'giProbe';
  root.add(probe);

  const finalize = async (c: BuildContext): Promise<void> => {
    const { renderer, scene } = c;
    const fogHold = scene.fog;
    // 1. Static shadow map first, so the capture sees real sun pools.
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, c.camera);
    lookShared.shadowReady = true;

    // Safety net: modules that forgot to opt in still cast / receive (opaque standard materials only).
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.noShadow) return;
      const mat = m.material as THREE.Material | THREE.Material[];
      const first = Array.isArray(mat) ? mat[0] : mat;
      if (!first || !(first as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
      if (!first.transparent) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, c.camera);

    // 2. Two-bounce capture: first without env, second including the first bounce.
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData.noCapture && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });
    const rt = new THREE.WebGLCubeRenderTarget(CAPTURE_SIZE, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
    });
    const cubeCam = new THREE.CubeCamera(0.2, 2800, rt);
    cubeCam.position.set(0, 6, 96);
    scene.add(cubeCam);
    cubeCam.updateMatrixWorld(true);
    const pmrem = new THREE.PMREMGenerator(renderer);

    scene.environment = null;
    cubeCam.update(renderer, scene);
    let envRT = pmrem.fromCubemap(rt.texture);
    scene.environment = envRT.texture;
    scene.environmentIntensity = ENV_INTENSITY;
    cubeCam.update(renderer, scene);
    envRT.dispose();
    envRT = pmrem.fromCubemap(rt.texture);
    scene.environment = envRT.texture;

    // 3. Diffuse bounce probe from the final capture (dim: the PMREM environment already carries diffuse).
    try {
      const gen = await LightProbeGenerator.fromCubeRenderTarget(renderer, rt);
      probe.sh.copy(gen.sh);
    } catch (e) {
      console.warn('light probe generation failed', e);
    }

    // 3b. Lounge-specific environment: capture from the room's centre (windows, sun-lit floor, panelled walls) so its
    // polished walnut / brass / leather / glass reflect the room instead of the hall. Two passes = one bounce.
    const lounge = scene.getObjectByName('lounge');
    const loungeMats = (lounge?.userData.loungeMaterials ?? []) as THREE.MeshStandardMaterial[];
    let loungeRT: THREE.WebGLRenderTarget | null = null;
    if (lounge && loungeMats.length) {
      const lrt = new THREE.WebGLCubeRenderTarget(CAPTURE_SIZE, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.LinearFilter,
      });
      const lcam = new THREE.CubeCamera(0.1, 2800, lrt);
      lcam.position.set(0, LOUNGE_ROOM.floorY + 2.4, (LOUNGE_ROOM.zMin + LOUNGE_ROOM.zMax) / 2);
      scene.add(lcam);
      lcam.updateMatrixWorld(true);
      for (let pass = 0; pass < 2; pass++) {
        lcam.update(renderer, scene);
        loungeRT?.dispose();
        loungeRT = pmrem.fromCubemap(lrt.texture);
        for (const m of loungeMats) {
          m.envMap = loungeRT.texture;
          m.needsUpdate = true;
        }
      }
      scene.remove(lcam);
      lrt.dispose();
    }

    scene.remove(cubeCam);
    pmrem.dispose();
    rt.dispose();
    for (const o of hidden) o.visible = true;
    scene.fog = fogHold;
    renderer.shadowMap.needsUpdate = true;
  };

  return { name: 'lighting', object: root, finalize };
}
