import * as THREE from 'three';
import { PORTAL, VESPER, WATER_WALL, WATERFALL } from '../../layoutMetro';

/**
 * Cloud-forest rock face for the west waterfall: a procedural stratified basalt/schist height field in (z, y), displaced
 * from the wall plane x = WATER_WALL.x toward +x. Every stratum leans out to a lip (overhang) and returns through a sloped
 * ledge back into the next stratum, so lips, undercuts and mossy crevices read at distance. Pure function of (z, y):
 * the water ribbons, the mist depth fade and the pool foam all sample the same field.
 */

export interface CutRect { z0: number; z1: number; y0: number; y1: number }

export interface RockField {
  /** Rock protrusion from the wall plane (m, >= 0.02). */
  depth(z: number, y: number): number;
  /** Rect (snapped to the mesh grid) around each Vesper bore where the rock is cut away. */
  cuts: readonly CutRect[];
  /** Index of the stratum containing (z, y), for tone variation. */
  strataAt(z: number, y: number): number;
}

// ---------------------------------------------------------------------------------------------
// CPU noise
// ---------------------------------------------------------------------------------------------
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

function hash2(ix: number, iy: number): number {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm2(x: number, y: number): number {
  return vnoise(x, y) * 0.55 + vnoise(x * 2.03 + 7.1, y * 2.03 + 3.7) * 0.3 + vnoise(x * 4.1 + 1.3, y * 4.1 + 9.2) * 0.15;
}

// ---------------------------------------------------------------------------------------------
// Grid shared by the mesh, the cut rects and the lookup texture
// ---------------------------------------------------------------------------------------------
export const ROCK_GRID = {
  dz: 0.2,
  dy: 0.14,
  z0: WATER_WALL.zMin - 0.2, // 53.8: one cell into the side walls (hidden)
  z1: WATER_WALL.zMax + 0.2,
} as const;

function snapCuts(): CutRect[] {
  const hw = PORTAL.w / 2 + WATERFALL.boreCutMargin;
  const bedY = VESPER.railY - 0.6; // PORTAL.bedBelowRail
  const topY = bedY + PORTAL.h + WATERFALL.boreCutMargin;
  const out: CutRect[] = [];
  for (const tz of VESPER.trackZ) {
    const i0 = Math.floor((tz - hw - ROCK_GRID.z0) / ROCK_GRID.dz + 1e-6);
    const i1 = Math.ceil((tz + hw - ROCK_GRID.z0) / ROCK_GRID.dz - 1e-6);
    const j1 = Math.ceil((topY - WATERFALL.yBase) / ROCK_GRID.dy - 1e-6);
    out.push({
      z0: ROCK_GRID.z0 + i0 * ROCK_GRID.dz,
      z1: ROCK_GRID.z0 + i1 * ROCK_GRID.dz,
      y0: WATERFALL.yBase,
      y1: WATERFALL.yBase + j1 * ROCK_GRID.dy,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Height field
// ---------------------------------------------------------------------------------------------
interface Stratum { bw: number; off: number; shelf: number; lipScale: number; tint: number; tilt: number; skew: number; zone: number }

export function createRockField(): RockField {
  const rnd = mulberry32(7741);
  const yb = WATERFALL.yBase, yt = WATERFALL.yTop;

  const bounds: number[] = [yb];
  for (;;) {
    const th = 2.6 + rnd() * 2.8;
    const last = bounds[bounds.length - 1]!;
    if (yt - (last + th) < 2.8) break;
    bounds.push(last + th);
  }
  bounds.push(yt);
  const K = bounds.length - 1;
  const strata: Stratum[] = [];
  for (let k = 0; k < K; k++) {
    strata.push({ bw: 0.5 + rnd() * rnd() * 4.5 + rnd() * 0.8, off: rnd() * 40, shelf: 0.3 + rnd() * 0.5, lipScale: 0.55 + rnd() * 0.45, tint: rnd(), tilt: (rnd() - 0.5) * 0.24, skew: (rnd() - 0.5) * 1.4, zone: 5 + rnd() * 7 });
  }

  // Boundaries of every stratum at one z: warped, tilted and kept at least 0.9 m apart.
  const boundsAt = (z: number, out: number[]): void => {
    out[0] = yb;
    for (let k = 1; k < K; k++) {
      const st = strata[k]!;
      // Region stagger: each zone of this stratum sits up to +-2 m from its neighbours, with a soft ramp between zones.
      const zq = z / st.zone + st.off;
      const zi = Math.floor(zq);
      const zoneOff = ((hash2(zi, k + 101) + (hash2(zi + 1, k + 101) - hash2(zi, k + 101)) * smoothstep(0.7, 1.0, zq - zi)) - 0.5) * 4.0;
      const raw = bounds[k]! + (vnoise(z * 0.11 + k * 17.3, k * 5.1) - 0.5) * 2.6 + (vnoise(z * 0.55 + k * 3.7, k * 1.9) - 0.5) * 0.9
        + zoneOff + st.tilt * (z - 74);
      out[k] = Math.max(raw, out[k - 1]! + 0.9);
    }
    out[K] = Math.max(yt, out[K - 1]! + 0.5);
    out[K] = yt;
  };
  const bScratch: number[] = new Array<number>(K + 1).fill(0);

  const blocky = (z: number, y: number, k: number): number => {
    const s = strata[k]!;
    const q = (z + y * s.skew) / s.bw + s.off;
    const i = Math.floor(q);
    const f = q - i;
    const t = smoothstep(0.4, 1.0, f);
    const a = hash2(i, k * 31 + 5), b = hash2(i + 1, k * 31 + 5);
    return a + (b - a) * t;
  };

  const cuts = snapCuts();
  const cascades = WATERFALL.cascades;

  const strataAt = (z: number, y: number): number => {
    boundsAt(z, bScratch);
    let k = 0;
    while (k < K - 1 && y >= bScratch[k + 1]!) k++;
    return k;
  };

  const depth = (z: number, y: number): number => {
    const yy = Math.min(yt, Math.max(yb, y));
    boundsAt(z, bScratch);
    let k = 0;
    while (k < K - 1 && yy >= bScratch[k + 1]!) k++;
    const st = strata[k]!;
    const bk = bScratch[k]!, bt = bScratch[k + 1]!;
    const T = bt - bk;
    const u = yy - bk;
    const blk = blocky(z, yy, k);
    // Outward envelope: the pile widens toward the base so cascades always land on the ledge below.
    const env = 0.45 + 0.6 * (1 - (yy - yb) / (yt - yb));
    const bulge = fbm2(z * 0.13 + 10, yy * 0.1);
    let notch = 1;
    for (const c of cascades) {
      const dz = (z - c.z) / (c.w * 0.65 + 0.5);
      notch -= 0.5 * Math.exp(-dz * dz);
    }
    const lipMod = Math.min(1.5, Math.max(0.2, 0.55 + 1.6 * (bulge - 0.42)));
    const lip = env * (0.06 + 0.94 * blk * blk * (3 - 2 * blk)) * st.lipScale * lipMod * Math.max(0.3, notch);
    const sh = Math.min(st.shelf * (0.75 + 0.5 * blk), T * 0.4);
    // Face (leaning out to the lip) and ledge (sloping back) are blended over +-0.4 m so the lip is rounded, not creased.
    const sFace = Math.min(1, Math.max(0, u) / (T - sh));
    const faceV = lip * Math.pow(sFace, 0.62);
    const tL = Math.min(1, Math.max(0, (u - (T - sh)) / sh));
    const shelfV = lip * (1 - tL * tL * (3 - 2 * tL));
    const face = faceV + (shelfV - faceV) * smoothstep(T - sh - 0.4, T - sh + 0.4, u);
    const base = 0.07 + 0.22 * (fbm2(z * 0.22 + 60, yy * 0.17) - 0.25) + 0.75 * (fbm2(z * 0.11 + 80, yy * 0.09) - 0.42);
    const detail =
      0.06 * (vnoise(z * 1.7, yy * 1.3) - 0.5) +
      0.03 * (vnoise(z * 5.3 + 3, yy * 4.1) - 0.5) -
      0.05 * (1 - smoothstep(0.0, 0.07, Math.abs(vnoise(z * 3.1 + 5, yy * 0.22) - 0.5)));
    let d = base + face + detail;
    const topFade = smoothstep(0, 0.35, yt - y);
    d = 0.02 + (d - 0.02) * topFade;
    const soft = WATERFALL.maxDepth - 0.35;
    if (d > soft) d = soft + 0.35 * Math.tanh((d - soft) / 0.35);
    return Math.max(0.02, d);
  };

  return { depth, cuts, strataAt };
}

// ---------------------------------------------------------------------------------------------
// Mesh
// ---------------------------------------------------------------------------------------------
const ROCK_DARK: readonly [number, number, number] = [0.03, 0.034, 0.036];
const ROCK_WARM: readonly [number, number, number] = [0.105, 0.098, 0.088];
const MOSS_DEEP: readonly [number, number, number] = [0.018, 0.058, 0.012];
const MOSS_LIME: readonly [number, number, number] = [0.105, 0.165, 0.022];

export function buildRockGeometry(field: RockField, wetAt: (z: number, y: number) => number): THREE.BufferGeometry {
  const { dz, dy, z0, z1 } = ROCK_GRID;
  const yb = WATERFALL.yBase, yt = WATERFALL.yTop;
  const nzc = Math.round((z1 - z0) / dz);
  const nyc = Math.round((yt - yb) / dy);
  const X0 = WATER_WALL.x;

  const pos: number[] = [], nor: number[] = [], col: number[] = [], mat: number[] = [];
  const idx: number[] = [];

  const surface = (z: number, y: number): { d: number; nx: number; ny: number; nz: number; moss: number; wet: number; c: [number, number, number] } => {
    const h = 0.07;
    const d = field.depth(z, y);
    const dzp = field.depth(z + h, y) - field.depth(z - h, y);
    const dyp = field.depth(z, y + h) - field.depth(z, y - h);
    // F = x - d(z, y): normal ~ (1, -d_y, -d_z)
    let nx = 1, ny = -dyp / (2 * h), nz = -dzp / (2 * h);
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;

    const t = (y - yb) / (yt - yb);
    const wet = wetAt(z, y);
    const avg = (field.depth(z - 0.45, y) + field.depth(z + 0.45, y) + field.depth(z, y - 0.45) + field.depth(z, y + 0.45)) * 0.25;
    const crevice = clamp01((avg - d) / 0.1);
    const up = clamp01((ny - 0.05) / 0.5);
    const hum = 0.3 + 0.7 * Math.pow(1 - t, 0.8);
    const patch = smoothstep(0.34, 0.66, fbm2(z * 0.4 + 40, y * 0.38));
    let moss = (up * 0.95 + crevice * 0.8 + 0.5 * patch) * hum * (0.25 + patch);
    moss *= 1 - 0.6 * smoothstep(0.55, 1.0, wet);
    moss = smoothstep(0.16, 0.6, moss);

    const band = vnoise(z * 0.35 + 3, y * 0.8);
    const warm = clamp01(0.25 + 0.7 * band * vnoise(z * 0.9, y * 1.7 + 8));
    const rock: [number, number, number] = [
      ROCK_DARK[0] + (ROCK_WARM[0] - ROCK_DARK[0]) * warm,
      ROCK_DARK[1] + (ROCK_WARM[1] - ROCK_DARK[1]) * warm,
      ROCK_DARK[2] + (ROCK_WARM[2] - ROCK_DARK[2]) * warm,
    ];
    const mt = vnoise(z * 1.3 + 20, y * 1.1);
    const mossCol: [number, number, number] = [
      MOSS_DEEP[0] + (MOSS_LIME[0] - MOSS_DEEP[0]) * mt,
      MOSS_DEEP[1] + (MOSS_LIME[1] - MOSS_DEEP[1]) * mt,
      MOSS_DEEP[2] + (MOSS_LIME[2] - MOSS_DEEP[2]) * mt,
    ];
    const c: [number, number, number] = [
      rock[0] + (mossCol[0] - rock[0]) * moss,
      rock[1] + (mossCol[1] - rock[1]) * moss,
      rock[2] + (mossCol[2] - rock[2]) * moss,
    ];
    return { d, nx, ny, nz, moss, wet, c };
  };

  // Main grid
  const stride = nzc + 1;
  for (let j = 0; j <= nyc; j++) {
    const y = yb + j * dy;
    for (let i = 0; i <= nzc; i++) {
      const z = z0 + i * dz;
      const s = surface(z, y);
      pos.push(X0 + s.d, y, z);
      nor.push(s.nx, s.ny, s.nz);
      col.push(s.c[0], s.c[1], s.c[2]);
      mat.push(s.wet, s.moss);
    }
  }
  const inCut = (z: number, y: number): boolean => field.cuts.some((r) => z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1);
  for (let j = 0; j < nyc; j++) {
    for (let i = 0; i < nzc; i++) {
      if (inCut(z0 + (i + 0.5) * dz, yb + (j + 0.5) * dy)) continue;
      const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
      // facing +x: (z up-right, y up) -> counter-clockwise seen from +x when z runs "left" in view; verified by normal sign below
      idx.push(a, c, b, b, c, d);
    }
  }

  // Skirts: the rock reads as cut by the bore (vertical sheared faces from the surface back to the wall plane).
  const addSkirt = (ps: Array<[number, number]>, nrm: [number, number, number]): void => {
    const base = pos.length / 3;
    for (const [z, y] of ps) {
      const s = surface(z, y);
      const dark = 0.82;
      pos.push(X0 + s.d, y, z, X0, y, z);
      nor.push(nrm[0], nrm[1], nrm[2], nrm[0], nrm[1], nrm[2]);
      col.push(s.c[0] * dark, s.c[1] * dark, s.c[2] * dark, s.c[0] * dark, s.c[1] * dark, s.c[2] * dark);
      mat.push(Math.max(s.wet, 0.35), s.moss * 0.4, Math.max(s.wet, 0.35), s.moss * 0.4);
    }
    // Winding from geometry: (a, b, c) must face `nrm`
    const ax = pos[base * 3]!, ay = pos[base * 3 + 1]!, az = pos[base * 3 + 2]!;
    const bx = pos[(base + 1) * 3]!, by = pos[(base + 1) * 3 + 1]!, bz = pos[(base + 1) * 3 + 2]!;
    const cx = pos[(base + 2) * 3]!, cy = pos[(base + 2) * 3 + 1]!, cz = pos[(base + 2) * 3 + 2]!;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const dot = (uy * vz - uz * vy) * nrm[0] + (uz * vx - ux * vz) * nrm[1] + (ux * vy - uy * vx) * nrm[2];
    const flip = dot < 0;
    for (let q = 0; q + 1 < ps.length; q++) {
      const a = base + q * 2, b = a + 1, c = a + 2, d = a + 3; // a/c on surface, b/d at wall
      if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, c, b, d);
    }
  };
  for (const r of field.cuts) {
    const rows: Array<[number, number]> = [];
    const nrows = Math.round((r.y1 - r.y0) / dy);
    // left (z = r.z0) faces +z; right (z = r.z1) faces -z; top (y = r.y1) faces -y
    for (let j = 0; j <= nrows; j++) rows.push([r.z0, r.y0 + j * dy]);
    addSkirt(rows, [0, 0, 1]);
    const rowsR: Array<[number, number]> = [];
    for (let j = 0; j <= nrows; j++) rowsR.push([r.z1, r.y0 + j * dy]);
    addSkirt(rowsR, [0, 0, -1]);
    const cols: Array<[number, number]> = [];
    const ncols = Math.round((r.z1 - r.z0) / dz);
    for (let i = 0; i <= ncols; i++) cols.push([r.z0 + i * dz, r.y1]);
    addSkirt(cols, [0, -1, 0]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(mat, 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Lookup texture (8-bit, depth / 1.7 m) over z 54..94, y -72.5..-52.5 for the mist depth fade and pool shoreline
// ---------------------------------------------------------------------------------------------
export const ROCK_TEX = { w: 256, h: 128, yMax: -52.5, scale: 1.7 } as const;

export function createRockTexture(field: RockField): THREE.DataTexture {
  const { w, h, yMax, scale } = ROCK_TEX;
  const data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = WATERFALL.yBase + ((j + 0.5) / h) * (yMax - WATERFALL.yBase);
    for (let i = 0; i < w; i++) {
      const z = WATER_WALL.zMin + ((i + 0.5) / w) * (WATER_WALL.zMax - WATER_WALL.zMin);
      const inCut = field.cuts.some((r) => z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1);
      data[j * w + i] = inCut ? 0 : Math.round(clamp01(field.depth(z, y) / scale) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// GLSL shared by the waterfall materials
// ---------------------------------------------------------------------------------------------
export const WF_GLSL = /* glsl */`
float wfHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float wfNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wfHash(i), wfHash(i + vec2(1.0, 0.0)), u.x),
             mix(wfHash(i + vec2(0.0, 1.0)), wfHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec3 wfPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDirection) {
  vec3 sx = normalize(dFdx(surfPos));
  vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

export interface RockMaterialHandles { material: THREE.MeshStandardMaterial }

export function createRockMaterial(): RockMaterialHandles {
  const material = new THREE.MeshStandardMaterial({
    name: 'metroDeepWaterfallRock',
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.0,
    envMapIntensity: 0.85,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aMat;\nvarying vec2 vMat;\nvarying vec3 vRW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vMat;\nvarying vec3 vRW;\n${WF_GLSL}`)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        float rkStreak = wfNoise(vRW.zy * vec2(2.2, 0.5));
        float rkGrain = wfNoise(vRW.zy * vec2(6.0, 4.3) + 9.0);
        float rkWet = clamp(vMat.x * (0.5 + 0.95 * rkStreak), 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, 0.4, rkWet * (1.0 - 0.6 * vMat.y));
        diffuseColor.rgb *= 0.78 + 0.44 * rkGrain;
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = mix(mix(0.8, 0.96, vMat.y), 0.24, rkWet * (1.0 - 0.7 * vMat.y));
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        #include <normal_fragment_maps>
        {
          float rkH = wfNoise(vRW.zy * vec2(2.0, 1.6)) * 0.7 + wfNoise(vRW.zy * vec2(7.0, 5.0) + 4.0) * 0.3;
          normal = wfPerturb(-vViewPosition, normal, vec2(dFdx(rkH), dFdy(rkH)) * 1.6, faceDirection);
        }
      `);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|waterfallRock`;
  return { material };
}
