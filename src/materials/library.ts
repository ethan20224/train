import * as THREE from 'three';
import type { MaterialLibrary, MaterialName, PBRMaterial } from '../core/types';
import manifest from './textureManifest.json';

/**
 * Named shared PBR materials. Downloaded sets (public/textures/<name>/{diff,nor,arm}.jpg, CC0 Poly Haven,
 * see public/textures/CREDITS.md) feed `map`, `normalMap` and the packed ARM texture
 * (R = ambient occlusion, G = roughness, B = metalness -> aoMap / roughnessMap / metalnessMap).
 *
 * Colour spaces: diffuse = sRGB, normal/ARM = linear (NoColorSpace). All RepeatWrapping,
 * anisotropy = min(8, GPU max). UVs are expected in "tiles": use `applyWorldUVs(geometry, tileSize(name))`.
 */

type TexturedName = keyof typeof manifest.textures;

interface Tuning {
  /** Multiplies the diffuse map (tints toward the palette; e.g. warm cream, near-black iron). */
  color?: number;
  /** Multiplier on the roughness read from ARM.G (material.roughness scales the map). */
  roughness?: number;
  /** 0 for dielectrics (ARM.B ignored), 1 to use ARM.B as-is. */
  metalness?: number;
  /** Normal map strength. */
  normalScale?: number;
  envMapIntensity?: number;
}

const TUNING: Record<TexturedName, Tuning> = {
  // Polished honey marble: low roughness so the golden-hour environment shows in the floor.
  floorMarble: { color: 0xffffff, roughness: 0.55, metalness: 0, normalScale: 0.6 },
  // Pale ashlar: tint warm cream so it sits in the honey/cream palette.
  wallStone: { color: 0xf3dfbf, roughness: 1.0, metalness: 0, normalScale: 1.0 },
  columnMarble: { color: 0xfff1da, roughness: 0.7, metalness: 0, normalScale: 0.35 },
  // Black marble with copper/gold veins; polished.
  darkMarble: { color: 0xffffff, roughness: 0.6, metalness: 0, normalScale: 0.4 },
  // Painted green-grey worn iron darkened to near black; paint is dielectric, wear comes from ARM.
  castIron: { color: 0x2a2a2a, roughness: 1.0, metalness: 1, normalScale: 0.8 },
  wood: { color: 0xffffff, roughness: 0.9, metalness: 0, normalScale: 0.6 },
  platformStone: { color: 0xffffff, roughness: 1.0, metalness: 0, normalScale: 1.0 },
  trackBallast: { color: 0xffffff, roughness: 1.0, metalness: 0, normalScale: 1.2 },
  sleeperWood: { color: 0xb8b0a6, roughness: 1.0, metalness: 0, normalScale: 1.0 },
  // Rusted steel darkened toward polished-dark rail; rust remains in the diffuse.
  railSteel: { color: 0x9a8f86, roughness: 0.9, metalness: 1, normalScale: 0.8 },
};

/** Tile size (meters) for the procedural materials (no manifest entry). */
const PROCEDURAL_TILE: Record<'brass' | 'trainPaint' | 'trainGold' | 'glass', number> = {
  brass: 1.0,
  trainPaint: 1.0,
  trainGold: 1.0,
  glass: 1.0,
};

/** Deterministic fbm value-noise canvas used as a subtle grunge roughness map for aged brass. */
function makeGrungeTexture(size: number, seed: number): THREE.CanvasTexture {
  const hash = (x: number, y: number): number => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number, period: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const w = (v: number) => ((v % period) + period) % period; // tileable
    const a = hash(w(xi), w(yi));
    const b = hash(w(xi + 1), w(yi));
    const c = hash(w(xi), w(yi + 1));
    const d = hash(w(xi + 1), w(yi + 1));
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for grunge texture');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let period = 4;
      for (let o = 0; o < 5; o++) {
        v += amp * noise((x / size) * period, (y / size) * period, period);
        amp *= 0.5;
        period *= 2;
      }
      // Map to a narrow roughness band (0.55..1.0 of the material scalar): worn but still clearly polished brass.
      const g = Math.round(255 * (0.55 + 0.45 * Math.min(1, Math.max(0, v * 1.15))));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function createMaterialLibrary(renderer: THREE.WebGLRenderer): MaterialLibrary {
  const loader = new THREE.TextureLoader(THREE.DefaultLoadingManager);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const materials = new Map<MaterialName, PBRMaterial>();
  const pending: Promise<unknown>[] = [];
  const loaded: THREE.Texture[] = [];

  const loadTexture = (url: string, srgb: boolean): THREE.Texture => {
    let resolveLoaded!: () => void;
    let rejectLoaded!: (e: unknown) => void;
    pending.push(
      new Promise<void>((res, rej) => {
        resolveLoaded = res;
        rejectLoaded = rej;
      }),
    );
    const tex = loader.load(
      url,
      (t) => {
        loaded.push(t);
        resolveLoaded();
      },
      undefined,
      (e) => rejectLoaded(new Error(`Failed to load texture ${url}: ${String(e)}`)),
    );
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = anisotropy;
    return tex;
  };

  const makeTextured = (name: TexturedName): THREE.MeshStandardMaterial => {
    const t = TUNING[name];
    const base = `${import.meta.env.BASE_URL}textures/${name}`;
    const arm = loadTexture(`${base}/arm.jpg`, false);
    const m = new THREE.MeshStandardMaterial({
      name,
      color: new THREE.Color(t.color ?? 0xffffff),
      map: loadTexture(`${base}/diff.jpg`, true),
      normalMap: loadTexture(`${base}/nor.jpg`, false),
      normalScale: new THREE.Vector2(t.normalScale ?? 1, t.normalScale ?? 1),
      aoMap: arm,
      roughnessMap: arm,
      roughness: t.roughness ?? 1,
      metalness: t.metalness ?? 0,
      envMapIntensity: t.envMapIntensity ?? 1,
    });
    if ((t.metalness ?? 0) > 0) m.metalnessMap = arm;
    return m;
  };

  for (const name of Object.keys(manifest.textures) as TexturedName[]) materials.set(name, makeTextured(name));

  // --- procedural materials -------------------------------------------------
  const grunge = makeGrungeTexture(256, 7);
  materials.set(
    'brass',
    new THREE.MeshStandardMaterial({
      name: 'brass',
      color: 0xc4953f, // aged brass: warm, slightly desaturated gold
      metalness: 1,
      roughness: 0.42,
      roughnessMap: grunge,
    }),
  );
  materials.set(
    'trainPaint',
    new THREE.MeshPhysicalMaterial({
      name: 'trainPaint',
      color: 0x0a0a0c,
      metalness: 0.15,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    }),
  );
  materials.set(
    'trainGold',
    new THREE.MeshStandardMaterial({
      name: 'trainGold',
      color: 0xd9a93a,
      metalness: 1,
      roughness: 0.24,
    }),
  );
  // Glass: transmission is too expensive; a faint tinted transparent surface that reads mostly through
  // environment reflections. Does not write depth (so AO / beams behind it stay correct).
  materials.set(
    'glass',
    new THREE.MeshPhysicalMaterial({
      name: 'glass',
      color: 0xdfeaea,
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      envMapIntensity: 1.6,
      ior: 1.5,
      specularIntensity: 1,
    }),
  );

  const get = (name: MaterialName): PBRMaterial => {
    const m = materials.get(name);
    if (!m) throw new Error(`Unknown material "${name}"`);
    return m;
  };

  const tileSize = (name: MaterialName): number => {
    const e = (manifest.textures as Record<string, { metersPerTile: number }>)[name];
    return e ? e.metersPerTile : PROCEDURAL_TILE[name as keyof typeof PROCEDURAL_TILE];
  };

  return {
    get,
    tileSize,
    applyWorldUVs: applyWorldUVs,
    ready: Promise.all(pending).then(() => undefined),
    estimatedTextureMB: () => {
      let bytes = 0;
      for (const t of loaded) {
        const img = t.image as { width?: number; height?: number } | null;
        if (img?.width && img.height) bytes += img.width * img.height * 4 * (4 / 3);
      }
      return bytes / (1024 * 1024);
    },
  };
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * World-scale box projection by face normal. See MaterialLibrary.applyWorldUVs.
 * Projection per triangle: |n.y| dominant -> (x, z); |n.x| dominant -> (z, y); else (x, y).
 */
export function applyWorldUVs(
  geometry: THREE.BufferGeometry,
  metersPerTile: number,
  matrix?: THREE.Matrix4,
): THREE.BufferGeometry {
  if (!(metersPerTile > 0)) throw new Error('applyWorldUVs: metersPerTile must be > 0');
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = geo.getAttribute('position');
  if (!pos) throw new Error('applyWorldUVs: geometry has no position attribute');
  const uvAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  const inv = 1 / metersPerTile;

  for (let i = 0; i + 2 < pos.count; i += 3) {
    _a.fromBufferAttribute(pos, i);
    _b.fromBufferAttribute(pos, i + 1);
    _c.fromBufferAttribute(pos, i + 2);
    if (matrix) {
      _a.applyMatrix4(matrix);
      _b.applyMatrix4(matrix);
      _c.applyMatrix4(matrix);
    }
    _n.subVectors(_c, _b).cross(_d.subVectors(_b, _a)); // face normal (unnormalised; only the dominant axis matters)
    const ax = Math.abs(_n.x);
    const ay = Math.abs(_n.y);
    const az = Math.abs(_n.z);
    const set = (idx: number, p: THREE.Vector3): void => {
      if (ay >= ax && ay >= az) uvAttr.setXY(idx, p.x * inv, p.z * inv);
      else if (ax >= az) uvAttr.setXY(idx, p.z * inv, p.y * inv);
      else uvAttr.setXY(idx, p.x * inv, p.y * inv);
    };
    set(i, _a);
    set(i + 1, _b);
    set(i + 2, _c);
  }
  geo.setAttribute('uv', uvAttr);
  return geo;
}
