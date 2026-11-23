import * as THREE from 'three';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import type { PostFX } from '../core/postfx';
import { Airlock, lookFactor, sunWeights, type Zone } from '../core/zones';
import { DEEP_LOOK, DEEP_SUN, VOID_LOOK } from '../layoutMetro';
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
  private deepEnvTex: THREE.Texture | null = null;
  private voidEnvTex: THREE.Texture | null = null;
  private bothMats: THREE.MeshStandardMaterial[] = [];
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
    this.update(d.camera.position.y);
  }

  /** Per displayed frame, after the camera moved. */
  update(camY: number): void {
    if (this.airlock.update(camY)) this.applyZone(this.airlock.zone);
    this.factor = lookFactor(camY);
    this.blend(this.factor);
    const w = sunWeights(camY);
    this.sun.intensity = this.airlock.zone === 'surface' ? this.sunSurface * w.surface : DEEP_SUN.intensity * w.deep;
    this.d.postfx.godRays.intensity = this.godRayBase * w.surface;
    this.d.postfx.setGodRaysEnabled(this.godRaysAllowed && this.airlock.zone === 'surface' && w.surface > 0);
    for (const { light, base } of this.dimmable) light.intensity = base * (1 - this.factor);
  }

  private applyBothZoneEnv(z: Zone, markNeedsUpdate: boolean): void {
    const tex = z === 'deep' ? this.deepEnvTex : this.voidEnvTex;
    if (!tex || this.bothMats.length === 0) return;
    for (const m of this.bothMats) {
      if (m.envMap !== tex) {
        m.envMap = tex;
        if (markNeedsUpdate) m.needsUpdate = true;
      }
    }
  }

  private applyZone(z: Zone): void {
    const deep = z === 'deep';
    for (const o of this.toggles) o.visible = !deep;
    this.deepGroup.visible = deep;
    this.deepImpostor.visible = !deep;
    this.surfaceImpostor.visible = deep;
    for (const m of this.voidCasters) m.castShadow = !deep; // the deep sun is emitted at the sky plane: nothing above it casts
    this.applyBothZoneEnv(z, false);
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

  /**
   * One-time metro environments, each a 256 cube captured with a full try/finally (no leaked state):
   * deep (deep state + deep sun, two bounces) -> deep materials + SH; void (surface state, from the void) -> void materials.
   * Then compiles every metro program up front for PostFX's linear HDR input buffer so no first-use shader compile hitches mid-descent.
   */
  async captureMetro(): Promise<void> {
    const { renderer, scene, camera, metroRoot } = this.d;
    // Materials shared with the hall (library instances such as floorMarble) must never take a metro env map.
    const hallMats = new Set<THREE.Material>();
    const collectHallMats = (o: THREE.Object3D): void => {
      if (o === metroRoot) return;
      const mat = (o as { material?: THREE.Material | THREE.Material[] }).material;
      if (mat) {
        for (const m of Array.isArray(mat) ? mat : [mat]) if (m) hallMats.add(m);
      }
      for (const c of o.children) collectHallMats(c);
    };
    collectHallMats(scene);
    const pick = (key: string, optional = false): THREE.MeshStandardMaterial[] => {
      const all = (metroRoot.userData[key] ?? []) as THREE.Material[];
      const seen = new Set<THREE.MeshStandardMaterial>();
      for (const m of all) {
        if ((m as THREE.MeshStandardMaterial | null | undefined)?.isMeshStandardMaterial === true && !hallMats.has(m)) {
          seen.add(m as THREE.MeshStandardMaterial);
        }
      }
      const kept = [...seen];
      if (!optional && kept.length === 0) console.warn(`DepthLook: ${key} is empty after excluding hall-shared materials (${all.length} listed)`);
      return kept;
    };
    const deepMats = pick('deepMaterials');
    const voidMats = pick('voidMaterials');
    const bothMats = pick('bothZoneMaterials', true);
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      const deepRes = await this.captureEnv('deep', DEEP_LOOK.capture, deepMats, true, bothMats.length > 0, pmrem);
      this.deepEnvTex = deepRes.envTex;
      if (deepRes.sh) {
        this.deepSH = deepRes.sh;
        this.update(camera.position.y);
      }
      const voidRes = await this.captureEnv('surface', VOID_LOOK.capture, voidMats, false, bothMats.length > 0, pmrem);
      this.voidEnvTex = voidRes.envTex;
    } finally {
      pmrem.dispose();
    }
    this.bothMats = bothMats;
    // Assign active-zone PMREM envMap once BEFORE precompile() so both-zone materials compile with USE_ENVMAP active;
    // subsequent airlock swaps between two identically-formatted PMREM textures hit Three.js's program cache (0 compiles).
    this.applyBothZoneEnv(this.airlock.zone, true);
    await this.precompile();
  }

  private async captureEnv(
    zone: Zone, at: readonly [number, number, number], mats: THREE.MeshStandardMaterial[], wantSH: boolean, wantEnv: boolean, pmrem: THREE.PMREMGenerator,
  ): Promise<{ sh: THREE.SphericalHarmonics3 | null; envTex: THREE.Texture | null }> {
    const needPmrem = mats.length > 0 || wantEnv;
    if (!needPmrem && !wantSH) return { sh: null, envTex: null };
    const { renderer, scene, camera } = this.d;
    const saved = this.airlock.zone;
    const savedEnv = scene.environment;
    const savedRT = renderer.getRenderTarget();
    const savedFace = renderer.getActiveCubeFace();
    const savedMip = renderer.getActiveMipmapLevel();
    const savedAutoClear = renderer.autoClear;
    const savedXr = renderer.xr.enabled;
    const prevEnv = mats.map((m) => m.envMap);
    const hidden: THREE.Object3D[] = [];
    let rt: THREE.WebGLCubeRenderTarget | null = null;
    let cube: THREE.CubeCamera | null = null;
    let env: THREE.WebGLRenderTarget | null = null;
    let sh: THREE.SphericalHarmonics3 | null = null;
    let committed = false;
    try {
      this.applyZone(zone);
      if (zone === 'deep') {
        this.blend(1);
        this.sun.intensity = DEEP_SUN.intensity;
        // Surface indirects and practicals must not bleed into the deep env / SH.
        scene.environment = null;
        this.probe.intensity = 0;
        for (const { light } of this.dimmable) light.intensity = 0;
      } else {
        this.blend(0);
        this.sun.intensity = this.sunSurface;
        for (const { light, base } of this.dimmable) light.intensity = base;
      }
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      scene.traverse((o) => { if (o.userData.noCapture && o.visible) { o.visible = false; hidden.push(o); } });
      rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.LinearFilter });
      cube = new THREE.CubeCamera(0.2, 800, rt);
      cube.position.set(...at);
      scene.add(cube);
      cube.updateMatrixWorld(true);
      const passes = mats.length > 0 ? 2 : 1;
      for (let pass = 0; pass < passes; pass++) {
        cube.update(renderer, scene);
        if (needPmrem) {
          const next = pmrem.fromCubemap(rt.texture);
          for (const m of mats) { m.envMap = next.texture; m.needsUpdate = true; }
          env?.dispose();
          env = next;
        }
      }
      if (wantSH) {
        try {
          sh = (await LightProbeGenerator.fromCubeRenderTarget(renderer, rt)).sh.clone();
        } catch (e) {
          console.warn(`${zone} light probe generation failed`, e);
        }
      }
      committed = true;
    } finally {
      if (!committed) {
        for (let i = 0; i < mats.length; i++) {
          mats[i]!.envMap = prevEnv[i] ?? null;
          mats[i]!.needsUpdate = true;
        }
        env?.dispose();
      }
      if (cube) scene.remove(cube);
      rt?.dispose();
      scene.environment = savedEnv;
      renderer.setRenderTarget(savedRT, savedFace, savedMip);
      renderer.autoClear = savedAutoClear;
      renderer.xr.enabled = savedXr;
      for (const o of hidden) o.visible = true;
      this.applyZone(saved);
      this.update(camera.position.y);
    }
    return { sh, envTex: committed ? (env?.texture ?? null) : null };
  }

  /**
   * Compiles every program AND warms Metal GPU pipeline state objects (beauty + N8AO + shadow map)
   * for BOTH zones up front at boot (while the intro covers the canvas), so crossing the -16 airlock
   * in either direction incurs zero shader or PSO stalls.
   */
  private async precompile(): Promise<void> {
    const { renderer, scene, camera, postfx } = this.d;
    const savedRT = renderer.getRenderTarget();
    const savedFace = renderer.getActiveCubeFace();
    const savedMip = renderer.getActiveMipmapLevel();
    const savedZone = this.airlock.zone;
    const savedPos = camera.position.clone();
    const savedQuat = camera.quaternion.clone();
    const savedAutoClear = renderer.autoClear;
    const savedCulled: Array<{ o: THREE.Object3D; c: boolean }> = [];
    const savedVisible: Array<{ o: THREE.Object3D; v: boolean }> = [];
    try {
      scene.traverse((o) => {
        if (o.userData.warmupVisible && !o.visible) {
          savedVisible.push({ o, v: o.visible });
          o.visible = true;
        }
      });
      renderer.setRenderTarget(postfx.composer.inputBuffer);
      await renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(savedRT, savedFace, savedMip);
      // Warm actual Metal PSOs across both zones (disable frustum culling for 1 warmup draw so every mesh's PSO compiles now)
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.frustumCulled) {
          savedCulled.push({ o, c: true });
          o.frustumCulled = false;
        }
      });
      const otherZone: Zone = savedZone === 'surface' ? 'deep' : 'surface';
      this.applyZone(otherZone);
      if (otherZone === 'deep') {
        this.blend(1);
        this.sun.intensity = DEEP_SUN.intensity;
        camera.position.set(0, -55, 74);
        camera.lookAt(0, -68, 74);
        camera.updateMatrixWorld(true);
      } else {
        this.blend(0);
        this.sun.intensity = this.sunSurface;
        camera.position.set(0, 6, 3);
        camera.lookAt(0, 6, 60);
        camera.updateMatrixWorld(true);
      }
      renderer.shadowMap.needsUpdate = true;
      postfx.render(0);
      // Warm savedZone as well while frustumCulled is off so off-camera meshes in the starting zone warm their PSOs too
      this.applyZone(savedZone);
      camera.position.copy(savedPos);
      camera.quaternion.copy(savedQuat);
      camera.updateMatrixWorld(true);
      this.update(camera.position.y);
      renderer.shadowMap.needsUpdate = true;
      postfx.render(0);
    } finally {
      for (const { o, c } of savedCulled) o.frustumCulled = c;
      for (const { o, v } of savedVisible) o.visible = v;
      camera.position.copy(savedPos);
      camera.quaternion.copy(savedQuat);
      camera.updateMatrixWorld(true);
      renderer.setRenderTarget(savedRT, savedFace, savedMip);
      renderer.autoClear = savedAutoClear;
      this.applyZone(savedZone);
      this.update(camera.position.y);
    }
  }
}
