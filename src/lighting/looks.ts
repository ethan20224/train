import * as THREE from 'three';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import type { PostFX } from '../core/postfx';
import { Airlock, lookFactor, sunWeights, type Zone } from '../core/zones';
import { DEEP_LOOK, DEEP_SUN } from '../layoutMetro';
import { setSunMode } from './lighting';

interface Look {
  fog: THREE.Color; fogDensity: number; background: THREE.Color; exposure: number; bloom: number; threshold: number;
  split: number; contrast: number; saturation: number; shadowTint: THREE.Color; highlightTint: THREE.Color;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemi: number; probe: number;
}
export interface DepthLookDeps {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; postfx: PostFX;
  /** Every module root except lighting and metro. */
  surfaceRoots: THREE.Object3D[];
  metroRoot: THREE.Object3D;
}
const col = (c: readonly [number, number, number]) => new THREE.Color(c[0], c[1], c[2]);
const req = <T extends THREE.Object3D>(root: THREE.Object3D, name: string): T => {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`DepthLook: missing "${name}"`);
  return o as T;
};
const hasLight = (o: THREE.Object3D): boolean => {
  let found = false;
  o.traverse((c) => { if ((c as THREE.Light).isLight) found = true; });
  return found;
};

/**
 * Depth-driven look (spec §5.1–5.3): blends surface <-> deep look by camera height, runs the airlock (which world is
 * drawn), swaps the single sun's duty at the airlock, and fades practical lights. Surface values are read from the live
 * objects at construction, so today's look (and any ?exp/&bloom look-dev overrides) is preserved exactly.
 */
export class DepthLook {
  readonly airlock: Airlock;
  factor = 0;
  private readonly d: DepthLookDeps;
  private readonly surface: Look;
  private readonly deep: Look;
  private readonly sun: THREE.DirectionalLight;
  private readonly sunSurface: number;
  private readonly fill: THREE.HemisphereLight;
  private readonly probe: THREE.LightProbe;
  private readonly surfaceSH: THREE.SphericalHarmonics3;
  private deepSH: THREE.SphericalHarmonics3 | null = null;
  private readonly dimmable: Array<{ light: THREE.Light; base: number }> = [];
  private readonly toggles: THREE.Object3D[] = [];
  private readonly voidCasters: THREE.Mesh[] = [];
  private readonly deepGroup: THREE.Object3D;
  private readonly deepImpostor: THREE.Object3D;
  private readonly surfaceImpostor: THREE.Object3D;
  private readonly godRaysAllowed: boolean;
  private readonly godRayBase: number;

  constructor(d: DepthLookDeps) {
    this.d = d;
    const { scene, postfx, metroRoot } = d;
    this.sun = req<THREE.DirectionalLight>(scene, 'sun');
    this.sunSurface = this.sun.intensity;
    this.fill = req<THREE.HemisphereLight>(scene, 'skyFill');
    this.probe = req<THREE.LightProbe>(scene, 'giProbe');
    this.surfaceSH = this.probe.sh.clone();
    const fog = scene.fog as THREE.FogExp2;
    const g = postfx.grade;
    this.surface = {
      fog: fog.color.clone(), fogDensity: fog.density, background: (scene.background as THREE.Color).clone(),
      exposure: postfx.exposure.exposure, bloom: postfx.bloom.intensity, threshold: postfx.bloom.luminanceMaterial.threshold,
      split: g.u<number>('uSplit').value, contrast: g.u<number>('uContrast').value, saturation: g.u<number>('uSaturation').value,
      shadowTint: g.u<THREE.Color>('uShadowTint').value.clone(), highlightTint: g.u<THREE.Color>('uHighlightTint').value.clone(),
      hemiSky: this.fill.color.clone(), hemiGround: this.fill.groundColor.clone(), hemi: this.fill.intensity, probe: this.probe.intensity,
    };
    const L = DEEP_LOOK;
    this.deep = {
      fog: col(L.fog), fogDensity: L.fogDensity, background: col(L.background), exposure: L.exposure, bloom: L.bloom,
      threshold: L.bloomThreshold, split: L.split, contrast: L.contrast, saturation: L.saturation,
      shadowTint: col(L.shadowTint), highlightTint: col(L.highlightTint), hemiSky: col(L.hemiSky), hemiGround: col(L.hemiGround),
      hemi: L.hemi, probe: L.probe,
    };
    // Practical lights of the surface fade out with depth.
    const lightingRoot = req(scene, 'lighting');
    for (const root of [lightingRoot, ...d.surfaceRoots]) {
      root.traverse((o) => {
        const l = o as THREE.Light;
        if ((l as THREE.PointLight).isPointLight || (l as THREE.SpotLight).isSpotLight) this.dimmable.push({ light: l, base: l.intensity });
      });
    }
    // Hide renderables only, never lights (hiding a light changes the light count => every program recompiles).
    for (const root of d.surfaceRoots) {
      if (!hasLight(root)) { this.toggles.push(root); continue; }
      for (const c of root.children) {
        if ((c as THREE.Light).isLight) continue;
        if (hasLight(c)) throw new Error(`DepthLook: ${root.name}/${c.name} mixes lights and geometry`);
        this.toggles.push(c);
      }
    }
    req(metroRoot, 'metroVoid').traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).castShadow) this.voidCasters.push(o as THREE.Mesh); });
    this.deepGroup = req(metroRoot, 'metroDeep');
    this.deepImpostor = req(metroRoot, 'metroDeepImpostor');
    this.surfaceImpostor = req(metroRoot, 'metroSurfaceImpostor');
    for (const o of [this.deepGroup, this.deepImpostor, this.surfaceImpostor]) {
      if (hasLight(o)) throw new Error(`DepthLook: ${o.name} contains a light (toggling visibility would change the light count)`);
    }
    this.godRaysAllowed = postfx.godRays.enabled;
    this.godRayBase = postfx.godRays.intensity;
    this.airlock = new Airlock(d.camera.position.y);
    this.applyZone(this.airlock.zone);
  }

  /** Per displayed frame, after the camera moved. */
  update(camY: number): void {
    if (this.airlock.update(camY)) this.applyZone(this.airlock.zone);
    this.factor = lookFactor(camY);
    this.blend(this.factor);
    const w = sunWeights(camY);
    this.sun.intensity = this.airlock.zone === 'surface' ? this.sunSurface * w.surface : DEEP_SUN.intensity * w.deep;
    this.d.postfx.godRays.intensity = this.godRayBase * w.surface;
    for (const { light, base } of this.dimmable) light.intensity = base * (1 - this.factor);
  }

  private applyZone(z: Zone): void {
    const deep = z === 'deep';
    for (const o of this.toggles) o.visible = !deep;
    this.deepGroup.visible = deep;
    this.deepImpostor.visible = !deep;
    this.surfaceImpostor.visible = deep;
    for (const m of this.voidCasters) m.castShadow = !deep; // the deep sun is emitted at the sky plane: nothing above it casts
    setSunMode(this.sun, z);
    this.d.renderer.shadowMap.needsUpdate = true;
    this.d.postfx.setGodRaysEnabled(this.godRaysAllowed && !deep);
  }

  private blend(f: number): void {
    const { scene, postfx } = this.d;
    const a = this.surface;
    const b = this.deep;
    const fog = scene.fog as THREE.FogExp2;
    fog.color.lerpColors(a.fog, b.fog, f);
    fog.density = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, f);
    (scene.background as THREE.Color).lerpColors(a.background, b.background, f);
    postfx.exposure.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, f);
    postfx.bloom.intensity = THREE.MathUtils.lerp(a.bloom, b.bloom, f);
    postfx.bloom.luminanceMaterial.threshold = THREE.MathUtils.lerp(a.threshold, b.threshold, f);
    const g = postfx.grade;
    g.u<number>('uSplit').value = THREE.MathUtils.lerp(a.split, b.split, f);
    g.u<number>('uContrast').value = THREE.MathUtils.lerp(a.contrast, b.contrast, f);
    g.u<number>('uSaturation').value = THREE.MathUtils.lerp(a.saturation, b.saturation, f);
    g.u<THREE.Color>('uShadowTint').value.lerpColors(a.shadowTint, b.shadowTint, f);
    g.u<THREE.Color>('uHighlightTint').value.lerpColors(a.highlightTint, b.highlightTint, f);
    this.fill.color.lerpColors(a.hemiSky, b.hemiSky, f);
    this.fill.groundColor.lerpColors(a.hemiGround, b.hemiGround, f);
    this.fill.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, f);
    this.probe.intensity = THREE.MathUtils.lerp(a.probe, b.probe, f);
    if (this.deepSH) {
      const s = this.probe.sh.coefficients;
      for (let i = 0; i < 9; i++) s[i]!.lerpVectors(this.surfaceSH.coefficients[i]!, this.deepSH.coefficients[i]!, f);
    }
  }

  /** One-time deep environment: deep state, deep sun shadow, two-bounce cube capture -> metro materials + SH. */
  async captureDeep(): Promise<void> {
    const { renderer, scene, camera, metroRoot } = this.d;
    const mats = (metroRoot.userData.deepMaterials ?? []) as THREE.MeshStandardMaterial[];
    const saved = this.airlock.zone;
    const hidden: THREE.Object3D[] = [];
    let rt: THREE.WebGLCubeRenderTarget | null = null;
    let cube: THREE.CubeCamera | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    try {
      this.applyZone('deep');
      this.blend(1);
      this.sun.intensity = DEEP_SUN.intensity;
      // Surface practicals must not bleed into the deep env / SH.
      for (const { light } of this.dimmable) light.intensity = 0;
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      scene.traverse((o) => { if (o.userData.noCapture && o.visible) { o.visible = false; hidden.push(o); } });
      rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.LinearFilter });
      cube = new THREE.CubeCamera(0.2, 800, rt);
      cube.position.set(...DEEP_LOOK.capture);
      scene.add(cube);
      cube.updateMatrixWorld(true);
      pmrem = new THREE.PMREMGenerator(renderer);
      let env: THREE.WebGLRenderTarget | null = null;
      for (let pass = 0; pass < 2; pass++) {
        cube.update(renderer, scene);
        env?.dispose();
        env = pmrem.fromCubemap(rt.texture);
        for (const m of mats) { m.envMap = env.texture; m.needsUpdate = true; }
      }
      try {
        this.deepSH = (await LightProbeGenerator.fromCubeRenderTarget(renderer, rt)).sh.clone();
      } catch (e) {
        console.warn('deep light probe generation failed', e);
      }
    } finally {
      if (cube) scene.remove(cube);
      pmrem?.dispose();
      rt?.dispose();
      for (const o of hidden) o.visible = true;
      this.applyZone(saved);
      this.update(camera.position.y);
    }
  }
}
