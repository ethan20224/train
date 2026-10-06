import * as THREE from 'three';
import type { MaterialLibrary } from '../../core/types';
import { excludeDirectionalLight } from '../../lighting/sunMask';

/**
 * Meridian Deep material kit (spec §4, Monolith & Machine). Upstairs = Beaux-Arts carved stone, bronze, brass;
 * from the polished band down = honed limestone, white onyx, dark terrazzo, brushed stainless, champagne aluminium,
 * ultra-clear glass. One shared instance per material.
 *
 * Two sets: the void-side set (returned fields) ignores every DirectionalLight (`excludeDirectionalLight`: the void
 * never receives either sun), and `deep` is a separate set of instances for Phase 3 that DOES receive the deep sun.
 * Both sets share textures. Emissive strips are unlit basic materials, shared by both sets.
 * Consumers register `deepList` in `metro.userData.deepMaterials`.
 *
 * UVs: none of these assume a mesh UV layout. Use `lib.applyWorldUVs(geometry, kit.metersPerTile.<name>)` on flat
 * geometry so one texture repeat covers `metersPerTile` metres.
 */

export interface MetroMaterialSet {
  /** Beaux-Arts foundations: wallStone, warmer and darker than the hall. */
  carvedStone: THREE.MeshStandardMaterial;
  /** Raw stratified rock (Poly Haven dark_rock_02), tinted cool grey-brown. */
  strata: THREE.MeshStandardMaterial;
  /** Pale, almost white, matte (roughness 0.55). Joint grid comes from geometry. */
  honedLimestone: THREE.MeshStandardMaterial;
  /** White onyx, backlit: emissive vein texture scaled by `emissiveIntensity`. */
  onyx: THREE.MeshStandardMaterial;
  /** Dark polished terrazzo (near-black matrix; white/grey/brass chips). Deck tops. */
  terrazzo: THREE.MeshStandardMaterial;
  /** Brushed stainless: stretched-noise roughness map. */
  stainless: THREE.MeshStandardMaterial;
  /** Anodised aluminium, warm champagne. */
  champagne: THREE.MeshStandardMaterial;
  /** Ultra-clear balustrade glass with a faint green edge. Render after opaque (renderOrder in userData). */
  glass: THREE.MeshPhysicalMaterial;
  /** Dark Beaux-Arts bronze (hall side). */
  bronze: THREE.MeshStandardMaterial;
  /** Library brass. */
  brass: THREE.MeshStandardMaterial;
  /** HDR light strips: warm-white 3500 K strip (~3.0) and cool-white 4000 K ring (~3.2). */
  emissive: { warmStrip: THREE.MeshBasicMaterial; coolRing: THREE.MeshBasicMaterial };
}

export type MetroMaterialName = Exclude<keyof MetroMaterialSet, 'emissive'>;

export interface MetroMaterials extends MetroMaterialSet {
  /** Separate instances for the deep world (receive the deep sun); shared textures. */
  deep: MetroMaterialSet;
  /** Every deep-side material (flat), ready for `metro.userData.deepMaterials`. */
  deepList: THREE.Material[];
  /** Real-world size of one texture repeat, per material (pass to `applyWorldUVs`). */
  metersPerTile: Record<MetroMaterialName, number>;
  /** Estimated GPU memory of the procedural canvas textures created here (MB, with mipmaps). */
  proceduralTextureMB: number;
}

const METERS_PER_TILE: Record<MetroMaterialName, number> = {
  carvedStone: 6.0, strata: 2.0, honedLimestone: 6.0, onyx: 2.0, terrazzo: 1.5,
  stainless: 1.0, champagne: 1.0, glass: 1.0, bronze: 1.0, brass: 1.0,
};

// --- procedural canvases ------------------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  return [c, g];
}

function finish(c: HTMLCanvasElement, renderer: THREE.WebGLRenderer, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Tileable value noise on an integer lattice with period (px, py) cells. */
function periodicNoise(seed: number) {
  const hash = (x: number, y: number): number => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const sm = (t: number): number => t * t * (3 - 2 * t);
  return (x: number, y: number, px: number, py: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = sm(x - xi), fy = sm(y - yi);
    const w = (v: number, p: number): number => ((v % p) + p) % p;
    const a = hash(w(xi, px), w(yi, py)), b = hash(w(xi + 1, px), w(yi, py));
    const c = hash(w(xi, px), w(yi + 1, py)), d = hash(w(xi + 1, px), w(yi + 1, py));
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Warm-white vein network on a dim warm base; used as both `emissiveMap` and `map` of the onyx. */
function makeOnyxVeins(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = makeCanvas(S, S);
  const img = g.createImageData(S, S);
  const n = periodicNoise(11), warp = periodicNoise(23);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // domain-warped ridged noise: thin bright veins where the warped field crosses 0.5
      const wx = (warp(u * 4, v * 4, 4, 4) - 0.5) * 1.6, wy = (warp(u * 4 + 7, v * 4 + 3, 4, 4) - 0.5) * 1.6;
      let ridge = 0, amp = 0.55, p = 3;
      for (let o = 0; o < 4; o++) {
        const r = 1 - Math.abs(2 * n((u + wx * 0.25) * p, (v + wy * 0.25) * p, p, p) - 1);
        ridge += amp * Math.pow(r, 6);
        amp *= 0.55;
        p *= 2;
      }
      const cloud = n(u * 3, v * 3, 3, 3);
      const k = Math.min(1, 0.32 + 0.3 * cloud + 1.1 * ridge);
      const i = (y * S + x) * 4;
      img.data[i] = Math.round(255 * k);
      img.data[i + 1] = Math.round(255 * k * 0.93);
      img.data[i + 2] = Math.round(255 * k * 0.8);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return finish(c, renderer, true);
}

/** Dark terrazzo: near-black matrix with scattered white/grey/brass chips (wrapped so it tiles). */
function makeTerrazzo(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 1024;
  const [c, g] = makeCanvas(S, S);
  const r = mulberry32(5);
  g.fillStyle = '#101113';
  g.fillRect(0, 0, S, S);
  const palette = ['#e8e6e0', '#d6d4ce', '#9a9a98', '#6c6e70', '#b8955a', '#e8e6e0', '#c9c7c0'];
  for (let i = 0; i < 2600; i++) {
    const cx = r() * S, cy = r() * S;
    const size = 5 + Math.pow(r(), 2.2) * 18;
    const col = palette[Math.floor(r() * palette.length)]!;
    const sides = 5 + Math.floor(r() * 3);
    const rot = r() * Math.PI * 2;
    const pts: Array<[number, number]> = [];
    for (let s = 0; s < sides; s++) {
      const a = rot + (s / sides) * Math.PI * 2;
      const rad = size * (0.55 + r() * 0.45);
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad * (0.6 + r() * 0.4)]);
    }
    g.fillStyle = col;
    for (const ox of cx < size ? [0, S] : cx > S - size ? [0, -S] : [0]) {
      for (const oy of cy < size ? [0, S] : cy > S - size ? [0, -S] : [0]) {
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(cx + ox + px, cy + oy + py) : g.moveTo(cx + ox + px, cy + oy + py)));
        g.closePath();
        g.fill();
      }
    }
  }
  return finish(c, renderer, true);
}

/** Brushed-metal roughness map (G channel): fine streaks stretched along U. */
function makeBrushedRoughness(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = makeCanvas(S, S);
  const img = g.createImageData(S, S);
  const n = periodicNoise(41);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // very low frequency along u (long streaks), very high along v (fine lines), plus a faint broad mottle
      const streak = 0.6 * n(u * 3, v * 256, 3, 256) + 0.4 * n(u * 8, v * 96, 8, 96);
      const mottle = n(u * 4, v * 4, 4, 4);
      const rough = 0.28 + 0.26 * streak + 0.08 * mottle; // 0.28..0.62
      const i = (y * S + x) * 4;
      const b = Math.round(255 * rough);
      img.data[i] = b; img.data[i + 1] = b; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return finish(c, renderer, false);
}

// --- light colour ------------------------------------------------------------------------------------------------

/** Linear-sRGB-ish colour of a blackbody (Tanner Helland fit), normalised so the brightest channel is `peak`. */
function hdrFromKelvin(kelvin: number, peak: number): THREE.Color {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const gg = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const cl = (v: number): number => Math.min(255, Math.max(0, v)) / 255;
  const c = new THREE.Color().setRGB(cl(r), cl(gg), cl(b), THREE.SRGBColorSpace);
  const m = Math.max(c.r, c.g, c.b);
  return c.multiplyScalar(peak / m);
}

// --- glass -------------------------------------------------------------------------------------------------------

/** Faint green, slightly more opaque at grazing angles (the glass edge). */
function glassEdge(m: THREE.MeshPhysicalMaterial): void {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float edgeF = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.0);
       outgoingLight = mix(outgoingLight, vec3(0.30, 0.62, 0.50), edgeF * 0.45);
       diffuseColor.a = mix(diffuseColor.a, 0.6, edgeF);
       #include <opaque_fragment>`,
    );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|glassEdge`;
}

// --- kit ---------------------------------------------------------------------------------------------------------

export function createMetroMaterials(renderer: THREE.WebGLRenderer, lib: MaterialLibrary): MetroMaterials {
  const veins = makeOnyxVeins(renderer);
  const terrazzoMap = makeTerrazzo(renderer);
  const brushed = makeBrushedRoughness(renderer);
  const mip = 4 / 3 / (1024 * 1024);
  const proceduralTextureMB = (512 * 512 * 4 + 1024 * 1024 * 4 + 512 * 512 * 4) * mip;

  const emissive = {
    warmStrip: new THREE.MeshBasicMaterial({ name: 'metroWarmStrip', color: hdrFromKelvin(3500, 3.0) }),
    coolRing: new THREE.MeshBasicMaterial({ name: 'metroCoolRing', color: hdrFromKelvin(4000, 3.2) }),
  };

  const build = (): MetroMaterialSet => {
    const stoneBase = lib.get('wallStone') as THREE.MeshStandardMaterial;
    const carvedStone = stoneBase.clone();
    carvedStone.name = 'metroCarvedStone';
    carvedStone.color.set(0xc9ae86); // warmer, darker than the hall's 0xf3dfbf

    const strata = (lib.get('strata') as THREE.MeshStandardMaterial).clone();
    strata.name = 'metroStrata';
    // dark_rock_02 is near-black: lift albedo above 1.0 (linear) with a cool grey-brown cast
    strata.color.setRGB(2.3, 2.2, 2.1);

    const honedLimestone = stoneBase.clone();
    honedLimestone.name = 'metroHonedLimestone';
    honedLimestone.color.set(0xfdfaf3); // near-white: the map is already pale
    honedLimestone.roughness = 0.55;
    honedLimestone.normalScale.set(0.25, 0.25); // honed: nearly flat

    const onyx = new THREE.MeshStandardMaterial({
      name: 'metroOnyx', color: 0xf2ece0, map: veins, roughness: 0.22, metalness: 0,
      emissive: 0xffffff, emissiveMap: veins, emissiveIntensity: 1.2,
    });

    const terrazzo = new THREE.MeshStandardMaterial({ name: 'metroTerrazzo', color: 0xffffff, map: terrazzoMap, roughness: 0.18, metalness: 0 });

    const stainless = new THREE.MeshStandardMaterial({
      name: 'metroStainless', color: 0xcdd2d5, metalness: 1, roughness: 1, roughnessMap: brushed,
    });

    const champagne = new THREE.MeshStandardMaterial({ name: 'metroChampagne', color: 0xcdbb98, metalness: 1, roughness: 0.3 });

    const glass = new THREE.MeshPhysicalMaterial({
      name: 'metroGlass', color: 0xe4f2ee, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.1,
      depthWrite: false, envMapIntensity: 1.6, ior: 1.5, specularIntensity: 1,
    });
    glass.userData.renderOrder = 2; // draw after opaque and after other transparents: assign to meshes using it
    glassEdge(glass);

    const bronze = new THREE.MeshStandardMaterial({ name: 'metroBronze', color: 0x4d3722, metalness: 0.9, roughness: 0.42 });

    const brass = (lib.get('brass') as THREE.MeshStandardMaterial).clone();
    brass.name = 'metroBrass';

    return { carvedStone, strata, honedLimestone, onyx, terrazzo, stainless, champagne, glass, bronze, brass, emissive };
  };

  const lit = (s: MetroMaterialSet): THREE.Material[] => [
    s.carvedStone, s.strata, s.honedLimestone, s.onyx, s.terrazzo, s.stainless, s.champagne, s.glass, s.bronze, s.brass,
  ];

  const voidSet = build();
  for (const m of lit(voidSet)) excludeDirectionalLight(m);
  const deepSet = build();
  for (const m of lit(deepSet)) m.name = m.name.replace('metro', 'metroDeep');
  deepSet.emissive = emissive; // unlit: nothing to exclude, safe to share
  voidSet.emissive = emissive;

  return {
    ...voidSet,
    deep: deepSet,
    deepList: [...lit(deepSet), emissive.warmStrip, emissive.coolRing],
    metersPerTile: METERS_PER_TILE,
    proceduralTextureMB,
  };
}
