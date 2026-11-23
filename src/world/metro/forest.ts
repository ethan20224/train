import * as THREE from 'three';
import { CAVERN, FOREST, VESPER, TRENCH } from '../../layoutMetro';
import { crownBottomLimit, crownTopLimit, planForest, type ForestTree } from '../../metro/forestLayout';
import { dayNight } from '../../metro/dayNight';

/**
 * The cloud forest (user ruling 2026-11-23, docs/meridian-deep-handoff/CLOUD-FOREST-PLAN.md): buttressed canopy trees draped
 * in hanging moss, tree ferns, a fern carpet and mossy boulders on a soft forest floor, planted in the base floor field of
 * the nave arms and transept strips (placement: src/metro/forestLayout.ts). Ground mist is a height fog evaluated per fragment
 * in every forest material (no transparent layers), drifting in REAL time; foliage sways in the vertex shader.
 *
 * Budget: 3 draw calls (bark, forest floor, foliage atlas) + their static shadow casts. All procedural (canvas textures).
 */

const Y0 = CAVERN.baseFloorY;
const TAU = Math.PI * 2;

/** Micro-detail of the forest builder (metres unless noted). Placement and clearances live in FOREST / forestLayout.ts. */
const FD = {
  trunkRadial: 14, trunkRings: 16, branchRadial: 6, branchRings: 6,
  /** Buttress roots: height fraction of the trunk they climb, flare and lobe count. */
  buttressS: 0.16, buttressFlare: 2.3, buttressLobes: 5,
  /** Leaf clumps: card size range and density per m² of crown footprint. */
  clumpSize: [1.7, 2.7] as const, clumpDensity: 1.25,
  /** Hanging moss strands per branch, length and width ranges. */
  mossPerBranch: 3, mossLen: [1.2, 3.6] as const, mossW: [0.32, 0.6] as const,
  treeFernFronds: 11, treeFernFrondLen: [1.9, 2.8] as const, frondW: 0.72, frondSegs: 6,
  fernFronds: 7, fernSegs: 4,
  /** Wind sway amplitude (m) at full weight. */
  wind: 0.075,
  /** Bark and ground texture repeat (m per tile). */
  barkTileU: 1.1, barkTileV: 1.6, groundTile: 2.6,
} as const;

// ---- deterministic helpers ----------------------------------------------------------------------------------------

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
function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

interface GroundRect { xMin: number; xMax: number; zMin: number; zMax: number }
/** Forest floor patches, wall to wall (the transept strips exclude the nave arms; the west/east ends stop clear of the waterfall pool and onyx reveal). */
const zS = VESPER.trackZ[0] - TRENCH.halfWidth - 0.3, zN = VESPER.trackZ[1] + TRENCH.halfWidth + 0.3;
const GROUND: readonly GroundRect[] = [
  { xMin: CAVERN.nave.xMin, xMax: CAVERN.nave.xMax, zMin: CAVERN.nave.zMin, zMax: zS },
  { xMin: CAVERN.nave.xMin, xMax: CAVERN.nave.xMax, zMin: zN, zMax: CAVERN.nave.zMax },
  { xMin: -58.0, xMax: CAVERN.nave.xMin, zMin: CAVERN.transept.zMin, zMax: zS },
  { xMin: CAVERN.nave.xMax, xMax: 58.0, zMin: CAVERN.transept.zMin, zMax: zS },
  { xMin: -58.0, xMax: CAVERN.nave.xMin, zMin: zN, zMax: CAVERN.transept.zMax },
  { xMin: CAVERN.nave.xMax, xMax: 58.0, zMin: zN, zMax: CAVERN.transept.zMax },
];

/** Forest floor height at (x, z): soft mounds, low against the walls and the track plinths. */
export function forestGroundY(x: number, z: number): number {
  const n = vnoise(x * 0.11 + 17, z * 0.11 - 5) * 0.7 + vnoise(x * 0.31 - 3, z * 0.31 + 9) * 0.3;
  let edge = 1;
  for (const r of GROUND) {
    if (x < r.xMin - 0.01 || x > r.xMax + 0.01 || z < r.zMin - 0.01 || z > r.zMax + 0.01) continue;
    const d = Math.min(x - r.xMin, r.xMax - x, z - r.zMin, r.zMax - z);
    edge = Math.min(1, Math.max(0, d / 3.0));
  }
  return Y0 + 0.06 + FOREST.groundRise * n * (0.25 + 0.75 * edge);
}

// ---- geometry accumulator -----------------------------------------------------------------------------------------

export class Mesher {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; wind: number[] = []; idx: number[] = [];
  vert(p: THREE.Vector3, u: number, v: number, c: readonly [number, number, number], n?: THREE.Vector3, w = 0, ph = 0): number {
    this.pos.push(p.x, p.y, p.z);
    if (n) this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.wind.push(w, ph);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, a, c, d); }
  build(withNormals: boolean, withWind: boolean): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (withWind) g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 2));
    g.setIndex(this.idx);
    if (withNormals) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    else g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3();

/** A tube along `spine` with per-ring radius `rAt(s, theta)`; parallel-transported frames so it never twists. */
function tube(
  m: Mesher, spine: readonly THREE.Vector3[], radial: number, rAt: (s: number, th: number) => number,
  colAt: (s: number, th: number) => readonly [number, number, number], vOffset: number,
): void {
  const n = spine.length;
  let len = 0;
  const lens = [0];
  for (let i = 1; i < n; i++) { len += spine[i]!.distanceTo(spine[i - 1]!); lens.push(len); }
  let normal = new THREE.Vector3();
  const tan0 = spine[1]!.clone().sub(spine[0]!).normalize();
  normal.set(0, 0, 1).cross(tan0);
  if (normal.lengthSq() < 1e-4) normal.set(1, 0, 0).cross(tan0);
  normal.normalize();
  const rings: number[] = [];
  for (let i = 0; i < n; i++) {
    const tan = (i < n - 1 ? spine[i + 1]!.clone().sub(spine[i]!) : spine[i]!.clone().sub(spine[i - 1]!)).normalize();
    normal = normal.sub(_t.copy(tan).multiplyScalar(normal.dot(tan))).normalize();
    const bin = _b.copy(tan).cross(normal).normalize();
    const s = lens[i]! / len;
    rings.push(m.pos.length / 3);
    const circ = TAU * Math.max(0.05, rAt(s, 0));
    const uRep = Math.max(1, Math.round(circ / FD.barkTileU));
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * TAU;
      const r = rAt(s, th);
      _a.copy(normal).multiplyScalar(Math.cos(th) * r).addScaledVector(bin, Math.sin(th) * r).add(spine[i]!);
      m.vert(_a, (k / radial) * uRep, vOffset + lens[i]! / FD.barkTileV, colAt(s, th));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = rings[i]! + k, b = rings[i]! + k + 1, c = rings[i + 1]! + k + 1, d = rings[i + 1]! + k;
      m.quad(a, d, c, b);
    }
  }
}

/** Quadratic Bézier samples. */
function bezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(new THREE.Vector3(
      u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z,
    ));
  }
  return out;
}

// Atlas cells (u0, v0, u1, v1) in the 2048² foliage atlas (canvas y down; CanvasTexture flipY maps canvas top to v = 1).
export const CELL = {
  leafA: [0, 0.5, 0.5, 1], leafB: [0.5, 0.5, 1, 1],
  frondA: [0, 0, 0.25, 0.5], frondB: [0.25, 0, 0.5, 0.5],
  mossA: [0.5, 0, 0.75, 0.5], mossB: [0.75, 0, 1, 0.5],
} as const;
export type Cell = readonly [number, number, number, number];

/** One foliage card: centre c, axes a (width/2) and b (height/2), cell uv; normal per corner supplied by `nrm`. */
export function card(
  m: Mesher, c: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, cell: Cell, tint: readonly [number, number, number],
  nrm: (p: THREE.Vector3) => THREE.Vector3, w0: number, w1: number, ph: number,
): void {
  const [u0, v0, u1, v1] = cell;
  const p00 = c.clone().sub(a).sub(b), p10 = c.clone().add(a).sub(b), p11 = c.clone().add(a).add(b), p01 = c.clone().sub(a).add(b);
  const i0 = m.vert(p00, u0, v0, tint, nrm(p00), w0, ph);
  const i1 = m.vert(p10, u1, v0, tint, nrm(p10), w0, ph);
  const i2 = m.vert(p11, u1, v1, tint, nrm(p11), w1, ph);
  const i3 = m.vert(p01, u0, v1, tint, nrm(p01), w1, ph);
  m.quad(i0, i1, i2, i3);
}

/** A bending strip (fern frond): starts at `base`, azimuth `az`, elevation eased from e0 to e1 (rad), `len` long. */
export function frond(
  m: Mesher, base: THREE.Vector3, az: number, e0: number, e1: number, len: number, width: number, segs: number, cell: Cell,
  tint: readonly [number, number, number], wBase: number, ph: number,
): void {
  const [u0, v0, u1, v1] = cell;
  const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
  const p = base.clone();
  let prevL = -1, prevR = -1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const e = e0 + (e1 - e0) * t * t;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e));
    if (i > 0) p.addScaledVector(dir, len / segs);
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    if (up.y < 0) up.negate();
    const nrm = up.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.2, 0)).normalize();
    const hw = (width / 2) * (0.35 + 0.65 * Math.sin(Math.PI * (0.12 + 0.88 * t)));
    const v = v0 + (v1 - v0) * t;
    const w = wBase * (0.15 + 0.85 * t);
    const l = m.vert(p.clone().addScaledVector(side, -hw), u0, v, tint, nrm, w, ph);
    const r = m.vert(p.clone().addScaledVector(side, hw), u1, v, tint, nrm, w, ph);
    if (i > 0) m.quad(prevL, prevR, r, l);
    prevL = l; prevR = r;
  }
}

// ---- canvas textures ------------------------------------------------------------------------------------------------

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  return [c, g];
}

function paintLeafClump(g: CanvasRenderingContext2D, ox: number, oy: number, S: number, rnd: () => number, hueShift: number): void {
  const cx = ox + S / 2, cy = oy + S / 2;
  // twigs first, then ~300 leaves back to front, denser and darker toward the middle
  g.strokeStyle = 'rgba(70,52,34,1)';
  g.lineWidth = 5;
  for (let k = 0; k < 9; k++) {
    const a = rnd() * TAU, r = S * (0.25 + rnd() * 0.2);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
  }
  for (let k = 0; k < 320; k++) {
    const a = rnd() * TAU;
    const rr = S * 0.44 * Math.sqrt(rnd());
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const L = S * (0.05 + rnd() * 0.045), W = L * (0.36 + rnd() * 0.14);
    const ang = a + (rnd() - 0.5) * 1.2;
    const depth = rr / (S * 0.44);
    const light = 0.62 + depth * 0.32 + (rnd() - 0.5) * 0.18;
    const r = Math.round((40 + hueShift * 18 + rnd() * 18) * light), gg = Math.round((92 + rnd() * 40) * light), b = Math.round((30 + rnd() * 16) * light);
    g.save();
    g.translate(x, y); g.rotate(ang);
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.beginPath(); g.ellipse(0, 0, L, W, 0, 0, TAU); g.fill();
    g.strokeStyle = `rgba(${Math.round(r * 0.6)},${Math.round(gg * 0.7)},${Math.round(b * 0.6)},0.9)`;
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-L * 0.9, 0); g.lineTo(L * 0.9, 0); g.stroke();
    g.fillStyle = 'rgba(255,255,230,0.10)';
    g.beginPath(); g.ellipse(-L * 0.15, -W * 0.3, L * 0.55, W * 0.35, 0, 0, TAU); g.fill();
    g.restore();
  }
}

function paintFrond(g: CanvasRenderingContext2D, ox: number, oy: number, W: number, H: number, rnd: () => number, lush: number): void {
  const cx = ox + W / 2;
  const base = oy + H - 8, tip = oy + 10;
  g.strokeStyle = 'rgb(74,92,40)';
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(cx, base); g.quadraticCurveTo(cx + 6, (base + tip) / 2, cx, tip); g.stroke();
  const pinnae = 34;
  for (let i = 1; i < pinnae; i++) {
    const t = i / pinnae;
    const y = base - (base - tip) * t;
    const len = (W * 0.46) * Math.sin(Math.PI * (0.08 + 0.92 * t)) * (1 - 0.35 * t) * lush;
    for (const s of [-1, 1]) {
      const lean = 0.42 + rnd() * 0.12; // pinnae sweep toward the tip
      const ex = cx + s * len, ey = y - len * lean;
      const pinnules = Math.max(3, Math.round(len / 9));
      for (let k = 0; k < pinnules; k++) {
        const f = (k + 0.5) / pinnules;
        const px = cx + (ex - cx) * f, py = y + (ey - y) * f;
        const pl = 9 * (1 - f * 0.6) + 3, pw = pl * 0.55;
        const light = 0.75 + rnd() * 0.3;
        g.fillStyle = `rgb(${Math.round((58 + rnd() * 20) * light)},${Math.round((118 + rnd() * 30) * light)},${Math.round((38 + rnd() * 14) * light)})`;
        g.beginPath(); g.ellipse(px, py - pl * 0.2, pw, pl, s * 0.5, 0, TAU); g.fill();
      }
      g.strokeStyle = 'rgba(66,96,36,1)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, y); g.lineTo(ex, ey); g.stroke();
    }
  }
}

function paintMoss(g: CanvasRenderingContext2D, ox: number, oy: number, W: number, H: number, rnd: () => number): void {
  for (let k = 0; k < 150; k++) {
    let x = ox + W * (0.08 + 0.84 * rnd());
    let y = oy + rnd() * H * 0.08;
    const len = H * (0.35 + rnd() * 0.62) * (1 - Math.abs(x - (ox + W / 2)) / W);
    const light = 0.75 + rnd() * 0.35;
    g.strokeStyle = `rgba(${Math.round(150 * light)},${Math.round(166 * light)},${Math.round(122 * light)},1)`;
    g.lineWidth = 1.5 + rnd() * 2.5;
    g.beginPath(); g.moveTo(x, y);
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      x += (rnd() - 0.5) * 7; y += len / steps;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

function makeFoliageAtlas(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 2048;
  const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  const rnd = mulberry32(911);
  paintLeafClump(g, 0, 0, 1024, rnd, 0);
  paintLeafClump(g, 1024, 0, 1024, rnd, 1);
  paintFrond(g, 0, 1024, 512, 1024, rnd, 1);
  paintFrond(g, 512, 1024, 512, 1024, rnd, 0.82);
  paintMoss(g, 1024, 1024, 512, 1024, rnd);
  paintMoss(g, 1536, 1024, 512, 1024, rnd);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

let _atlas: THREE.CanvasTexture | null = null;
/** The foliage atlas is painted once and shared by the forest and the Root Wall (src/world/metro/rootWall.ts). */
export function sharedFoliageAtlas(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  return (_atlas ??= makeFoliageAtlas(renderer));
}

/** Tileable greyscale detail (bark furrows or forest-floor litter); colour comes from vertex colours. */
function makeDetail(renderer: THREE.WebGLRenderer, kind: 'bark' | 'ground'): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const P = 16;
  const pn = (x: number, y: number, p: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const w = (v: number): number => ((v % p) + p) % p;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash2(w(xi), w(yi)), b = hash2(w(xi + 1), w(yi)), cc = hash2(w(xi), w(yi + 1)), d = hash2(w(xi + 1), w(yi + 1));
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * P, v = (y / S) * P;
      let val: number;
      if (kind === 'bark') {
        const furrow = Math.abs(Math.sin((u * 1.6 + pn(u * 0.5, v * 0.15, P) * 3.0) * Math.PI));
        val = 0.42 + 0.42 * Math.pow(furrow, 0.6) + 0.16 * pn(u * 4, v * 4, P * 4) - 0.1;
      } else {
        val = 0.5 + 0.28 * (pn(u * 2, v * 2, P * 2) - 0.5) * 2 + 0.22 * (pn(u * 7, v * 7, P * 7) - 0.5) * 2;
      }
      const o = (y * S + x) * 4, b = Math.max(0, Math.min(255, Math.round(val * 255)));
      img.data[o] = b; img.data[o + 1] = b; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

// ---- shader patches -------------------------------------------------------------------------------------------------

const uTime = { value: 0 };
/** Day/night (src/metro/dayNight.ts): night weight, and the mist colour already scaled to the light level. */
const uNight = { value: 0 };
const uMistCol = { value: new THREE.Vector3(...FOREST.mist.color).multiplyScalar(0.9) };
const MIST_GLSL = `
uniform float uForestTime;
uniform float uForestNight;
uniform vec3 uForestMist;
varying vec3 vForestWorld;
float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), f.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

/** Ground mist (height fog with drifting noise) + optional wind sway and two-sided foliage normals, chained onto `mat`. */
export function patchForest(mat: THREE.MeshStandardMaterial, key: string, opts: { wind?: boolean; foliage?: boolean; glow?: boolean }): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uForestTime = uTime;
    sh.uniforms.uForestNight = uNight;
    sh.uniforms.uForestMist = uMistCol;
    let vs = sh.vertexShader.replace('#include <common>', `#include <common>\nuniform float uForestTime;\nvarying vec3 vForestWorld;${opts.wind ? '\nattribute vec2 aWind;' : ''}`);
    if (opts.wind) {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    float wt = aWind.x, ph = aWind.y;
    float gust = 0.65 + 0.35 * sin(uForestTime * 0.23 + position.x * 0.05);
    transformed.x += (sin(uForestTime * 0.9 + ph) * 0.65 + sin(uForestTime * 2.3 + ph * 1.7) * 0.25) * ${FD.wind.toFixed(3)} * wt * gust;
    transformed.z += (cos(uForestTime * 0.7 + ph * 1.3) * 0.6 + sin(uForestTime * 1.9 + ph) * 0.2) * ${FD.wind.toFixed(3)} * wt * gust;
    transformed.y += sin(uForestTime * 1.3 + ph * 2.1) * ${(FD.wind * 0.35).toFixed(3)} * wt;
  }`);
    }
    vs = vs.replace('#include <project_vertex>', '#include <project_vertex>\n  vForestWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.vertexShader = vs;
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>\n${MIST_GLSL}`);
    if (opts.glow) {
      // Night: bioluminescent fungi and moss patches low on roots, trunks and boulders (blue-green, cold light).
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uForestNight > 0.01) {
    vec3 gp = vForestWorld;
    float low = 1.0 - smoothstep(${(Y0 + 1.5).toFixed(2)}, ${(Y0 + 6.0).toFixed(2)}, gp.y);
    // tiny caps and specks (5-15 cm), clustered in a few colonies; no large painted areas
    float colony = smoothstep(0.58, 0.75, fNoise(gp.xz * 0.17 + gp.y * 0.11));
    float spots = smoothstep(0.86, 0.93, fNoise(gp.xz * 9.0 + gp.y * 7.0)) * colony;
    float sheen = smoothstep(0.7, 0.95, fNoise(gp.xz * 1.3 + gp.y * 0.9)) * colony * 0.04;
    float pulse = 0.8 + 0.2 * sin(uForestTime * 0.7 + gp.x * 0.3 + gp.z * 0.2);
    totalEmissiveRadiance += vec3(0.12, 0.9, 0.7) * (spots * 1.2 + sheen) * low * pulse * uForestNight;
  }`);
    }
    if (opts.foliage) {
      // Crown-sphere normals are authored for both faces: never flip them on back faces. A faint translucency keeps undersides alive.
      fs = fs.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vec3(0.05, 0.065, 0.03);');
    }
    fs = fs.replace('#include <fog_fragment>', `#include <fog_fragment>
  {
    float hF = smoothstep(${FOREST.mist.yTop.toFixed(2)}, ${(FOREST.mist.yBottom + 0.8).toFixed(2)}, vForestWorld.y);
    vec2 q = vForestWorld.xz;
    float n = fNoise(q * 0.055 + vec2(uForestTime * 0.011, uForestTime * 0.006)) * 0.62 + fNoise(q * 0.16 - vec2(uForestTime * 0.019, -uForestTime * 0.013)) * 0.38;
    float dF = 1.0 - exp(-length(vForestWorld - cameraPosition) * 0.03);
    float mist = clamp(${FOREST.mist.strength.toFixed(3)} * hF * (0.35 + 0.85 * n) * dF, 0.0, 0.6);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uForestMist, mist);
  }`);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `forest|${key}`;
}

// ---- builders -----------------------------------------------------------------------------------------------------

export type RGB = readonly [number, number, number];
const BARK: RGB = [0.30, 0.24, 0.19];
export const MOSS: RGB = [0.16, 0.27, 0.07];
export const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function buildTree(t: ForestTree, bark: Mesher, fol: Mesher): void {
  const rnd = mulberry32(t.seed);
  const gy = forestGroundY(t.x, t.z);
  const base = new THREE.Vector3(t.x, gy - 0.25, t.z);
  const crownC = new THREE.Vector3(t.crownX, t.crownY, t.crownZ);
  const top = new THREE.Vector3(t.crownX, t.crownY + t.crownRV * 0.25, t.crownZ);
  const ctrl = new THREE.Vector3(t.x + (rnd() - 0.5) * 0.8, gy + (top.y - gy) * 0.62, t.z + (rnd() - 0.5) * 0.8);
  const spine = bezier(base, ctrl, top, FD.trunkRings);
  const trunkR = Math.max(t.trunkR, 0.2 + 0.014 * (top.y - gy));
  const phase0 = rnd() * TAU;
  const mossSide = rnd() * TAU;
  tube(bark, spine, FD.trunkRadial, (s, th) => {
    let r = trunkR * (1.05 - 0.62 * s);
    if (s < FD.buttressS) {
      const f = 1 - s / FD.buttressS;
      const lobe = Math.pow(Math.max(0, Math.cos(FD.buttressLobes * th + phase0)), 3);
      r *= 1 + FD.buttressFlare * f * f * (0.25 + 0.75 * lobe);
    }
    return r;
  }, (s, th) => {
    const moss = Math.min(1, Math.max(0, 0.35 + 0.45 * Math.cos(th - mossSide) + 0.35 * vnoise(th * 2, s * 9) - s * 0.25));
    return mixc(BARK, MOSS, moss);
  }, 0);

  // Branches out to the crown edge, each with two sub-branches; leaf clumps at their ends and through the crown shell.
  const nb = t.kind === 'umbrella' ? 7 + Math.floor(rnd() * 3) : 4 + Math.floor(rnd() * 3);
  const tips: THREE.Vector3[] = [];
  const mossPts: THREE.Vector3[] = [];
  for (let i = 0; i < nb; i++) {
    const s0 = (t.kind === 'umbrella' ? 0.62 : 0.5) + rnd() * 0.3;
    const p0 = spine[Math.min(spine.length - 1, Math.round(s0 * (spine.length - 1)))]!.clone();
    const az = (i / nb) * TAU + (rnd() - 0.5) * 0.7;
    const el = (t.kind === 'umbrella' ? 0.2 : 0.45) + rnd() * 0.4;
    const L = t.crownRH * (0.72 + rnd() * 0.3);
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const end = p0.clone().addScaledVector(dir, L);
    end.y = Math.min(end.y, t.crownY + t.crownRV * 0.6);
    const mid = p0.clone().lerp(end, 0.5).add(new THREE.Vector3(0, L * 0.12, 0));
    const pts = bezier(p0, mid, end, FD.branchRings);
    const r0 = trunkR * (0.4 + rnd() * 0.12);
    tube(bark, pts, FD.branchRadial, (s) => r0 * (1 - 0.8 * s) + 0.02, (s) => mixc(BARK, MOSS, 0.55 + 0.3 * (1 - s)), 0);
    tips.push(end);
    for (let k = 0; k < FD.mossPerBranch; k++) mossPts.push(pts[1 + Math.floor(rnd() * (pts.length - 2))]!.clone());
    for (let j = 0; j < 2; j++) {
      const f = 0.45 + rnd() * 0.35;
      const q0 = pts[Math.round(f * (pts.length - 1))]!.clone();
      const az2 = az + (rnd() - 0.5) * 1.6;
      const d2 = new THREE.Vector3(Math.cos(az2) * 0.6, 0.55 + rnd() * 0.4, Math.sin(az2) * 0.6).normalize();
      const q1 = q0.clone().addScaledVector(d2, L * (0.35 + rnd() * 0.2));
      q1.y = Math.min(q1.y, t.crownY + t.crownRV * 0.8);
      tube(bark, [q0, q0.clone().lerp(q1, 0.5), q1], 5, (s) => r0 * 0.45 * (1 - 0.8 * s) + 0.015, () => mixc(BARK, MOSS, 0.6), 0);
      tips.push(q1);
    }
  }

  // Canopy trees also carry a few lower limbs (35-55 % up) with their own clumps and moss, so tall trunks never read as poles.
  const lowTips: THREE.Vector3[] = [];
  if (t.kind === 'canopy') {
    const floorY = crownFloor(t);
    for (let i = 0; i < 3; i++) {
      const s0 = 0.36 + rnd() * 0.2;
      const p0 = spine[Math.round(s0 * (spine.length - 1))]!.clone();
      const az = rnd() * TAU, L = 1.6 + rnd() * 1.8;
      const end = p0.clone().add(new THREE.Vector3(Math.cos(az) * L, L * (0.35 + rnd() * 0.3), Math.sin(az) * L));
      if (!crownFitsPoint(end, 1.4) || end.y - 1.2 < floorY) continue;
      const pts = [p0, p0.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.25, 0)), end];
      tube(bark, pts, 5, (s) => trunkR * 0.3 * (1 - 0.75 * s) + 0.015, () => mixc(BARK, MOSS, 0.65), 0);
      lowTips.push(end);
      mossPts.push(pts[1]!.clone());
    }
  }
  const nrm = (p: THREE.Vector3): THREE.Vector3 => {
    const d = p.clone().sub(crownC);
    d.y *= t.crownRH / Math.max(0.5, t.crownRV);
    return d.normalize().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.25, 0)).normalize();
  };
  const leafCell = (): Cell => (rnd() < 0.5 ? CELL.leafA : CELL.leafB);
  const placeClump = (c: THREE.Vector3): void => {
    const size = FD.clumpSize[0] + rnd() * (FD.clumpSize[1] - FD.clumpSize[0]) * (t.kind === 'umbrella' ? 1.15 : 1);
    const lift = (c.y - (t.crownY - t.crownRV)) / Math.max(1, 2 * t.crownRV);
    const tone = 0.82 + rnd() * 0.3;
    const tint: RGB = [tone * (0.95 + lift * 0.12), tone * (1.0 + lift * 0.06), tone * 0.92];
    const ph = rnd() * TAU;
    for (let q = 0; q < 2; q++) {
      const yaw = rnd() * TAU, pitch = (rnd() - 0.5) * 1.2;
      const a = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(size / 2);
      const b = new THREE.Vector3(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)).multiplyScalar(size / 2);
      if (q === 1) { b.set(0, 0, 0).add(new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(size / 2)); b.y = size * 0.12; }
      card(fol, c, a, b, leafCell(), tint, nrm, 0.6, 1.0, ph);
    }
  };
  for (const tip of tips) placeClump(tip);
  for (const tip of lowTips) { placeClump(tip); placeClump(tip.clone().add(new THREE.Vector3(0.6, 0.4, -0.5))); }
  const fill = Math.round(Math.PI * t.crownRH * t.crownRH * FD.clumpDensity);
  for (let k = 0; k < fill; k++) {
    const u = rnd() * TAU, v = Math.acos(1 - 2 * Math.pow(rnd(), 0.8)) * 0.85, rr = 0.55 + 0.45 * Math.sqrt(rnd());
    const c = new THREE.Vector3(
      t.crownX + Math.cos(u) * Math.sin(v) * t.crownRH * rr,
      t.crownY + Math.cos(v) * t.crownRV * rr,
      t.crownZ + Math.sin(u) * Math.sin(v) * t.crownRH * rr,
    );
    placeClump(c);
  }

  // Hanging moss ("old man's beard"): crossed vertical cards under the branches.
  for (const p of mossPts) {
    const len = FD.mossLen[0] + rnd() * (FD.mossLen[1] - FD.mossLen[0]);
    const w = FD.mossW[0] + rnd() * (FD.mossW[1] - FD.mossW[0]);
    if (p.y - len < crownFloor(t)) continue;
    const yaw = rnd() * TAU, ph = rnd() * TAU;
    const c = p.clone().add(new THREE.Vector3(0, -len / 2 - 0.05, 0));
    const cell: Cell = rnd() < 0.5 ? CELL.mossA : CELL.mossB;
    const tint: RGB = [0.95 + rnd() * 0.1, 0.95 + rnd() * 0.1, 0.9];
    for (const off of [0, Math.PI / 2]) {
      const a = new THREE.Vector3(Math.cos(yaw + off), 0, Math.sin(yaw + off)).multiplyScalar(w / 2);
      const b = new THREE.Vector3(0, len / 2, 0);
      const n = new THREE.Vector3(Math.cos(yaw + off + Math.PI / 2), 0.4, Math.sin(yaw + off + Math.PI / 2)).normalize();
      card(fol, c, a, b, cell, tint, () => n, 1.4, 0.15, ph);
    }
  }
}

/** A low-limb clump at p (radius r) stays inside the cavern and clear of every clearance volume. */
function crownFitsPoint(p: THREE.Vector3, r: number): boolean {
  return p.y + r <= crownTopLimit(p.x, p.z, r) && p.y - r >= crownBottomLimit(p.z, r);
}

/** Lowest point hanging foliage may reach for a tree (clear of the Vesper envelope it overhangs). */
function crownFloor(t: ForestTree): number {
  for (const tz of VESPER.trackZ) if (Math.abs(t.crownZ - tz) - t.crownRH < FOREST.vesperEnvelopeHalfZ) return FOREST.vesperEnvelopeTopY + 0.2;
  return Y0 + 2.5;
}

/**
 * Living walls: tall vertical gardens on the cavern walls that face the forest beds, centred between the 12 m light slots
 * (slots sit at wall centre + k * 12 m, so bands centre at +-6 and +-18 m), each a dark moss backing panel plus dense leaf
 * and frond cards standing proud of it. Merged into the forest floor and foliage meshes: no extra draw calls.
 */
const LIVING_WALLS: ReadonlyArray<{ along: 'x' | 'z'; at: number; n: 1 | -1; from: number; to: number }> = [
  { along: 'x', at: CAVERN.transept.zMin, n: 1, from: CAVERN.transept.xMin, to: CAVERN.nave.xMin },
  { along: 'x', at: CAVERN.transept.zMin, n: 1, from: CAVERN.nave.xMax, to: CAVERN.transept.xMax },
  { along: 'x', at: CAVERN.transept.zMax, n: -1, from: CAVERN.transept.xMin, to: CAVERN.nave.xMin },
  { along: 'x', at: CAVERN.transept.zMax, n: -1, from: CAVERN.nave.xMax, to: CAVERN.transept.xMax },
  { along: 'z', at: CAVERN.nave.xMin, n: 1, from: CAVERN.nave.zMin, to: CAVERN.transept.zMin },
  { along: 'z', at: CAVERN.nave.xMax, n: -1, from: CAVERN.nave.zMin, to: CAVERN.transept.zMin },
  { along: 'z', at: CAVERN.nave.xMin, n: 1, from: CAVERN.transept.zMax, to: CAVERN.nave.zMax },
  { along: 'z', at: CAVERN.nave.xMax, n: -1, from: CAVERN.transept.zMax, to: CAVERN.nave.zMax },
];
const LW = { bandW: 8.0, endClear: 2.6, yBase: CAVERN.baseFloorY + 0.45, height: [15, 29] as const, density: 4.2, proud: 0.05 } as const;

function buildLivingWalls(fol: Mesher, ground: Mesher, rnd: () => number): void {
  for (const w of LIVING_WALLS) {
    const mid = (w.from + w.to) / 2;
    const P = (u: number, y: number, off: number): THREE.Vector3 => w.along === 'x'
      ? new THREE.Vector3(u, y, w.at + w.n * (LW.proud + off))
      : new THREE.Vector3(w.at + w.n * (LW.proud + off), y, u);
    const N = w.along === 'x' ? new THREE.Vector3(0, 0, w.n) : new THREE.Vector3(w.n, 0, 0);
    const T = w.along === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    for (const c of [-18, -6, 6, 18]) {
      const u0 = Math.max(w.from + LW.endClear, mid + c - LW.bandW / 2), u1 = Math.min(w.to - LW.endClear, mid + c + LW.bandW / 2);
      if (u1 - u0 < 4) continue;
      const H = LW.height[0] + rnd() * (LW.height[1] - LW.height[0]);
      const y0 = LW.yBase, y1 = y0 + H;
      // backing: dark moss panel
      const moss: RGB = [0.07, 0.11, 0.035];
      const b0 = ground.vert(P(u0, y0, 0.02), u0 / 2, y0 / 2, moss), b1 = ground.vert(P(u1, y0, 0.02), u1 / 2, y0 / 2, moss);
      const b2 = ground.vert(P(u1, y1 - 1.2, 0.02), u1 / 2, y1 / 2, moss), b3 = ground.vert(P(u0, y1 - 1.2, 0.02), u0 / 2, y1 / 2, moss);
      // CCW seen from the cavern side: (T x up) is +z for walls along x and -x for walls along z
      if (w.n * (w.along === 'x' ? 1 : -1) > 0) ground.quad(b0, b1, b2, b3); else ground.quad(b0, b3, b2, b1);
      const count = Math.round((u1 - u0) * H * LW.density);
      for (let k = 0; k < count; k++) {
        const u = u0 + rnd() * (u1 - u0);
        // ragged top: density thins over the last 2.5 m, trailing fronds hang below it
        const yy = y0 + Math.pow(rnd(), 0.85) * H;
        if (yy > y1 - 2.5 && rnd() < (yy - (y1 - 2.5)) / 2.5) continue;
        const frondy = rnd() < 0.32;
        const size = frondy ? 0.9 + rnd() * 0.7 : 0.55 + rnd() * 0.5;
        const off = 0.12 + rnd() * 0.4;
        const c3 = P(u, yy, off);
        const tilt = 0.5 + rnd() * 0.7; // card leans out from the wall
        const roll = (rnd() - 0.5) * 1.6;
        const a = T.clone().multiplyScalar(Math.cos(roll)).add(new THREE.Vector3(0, Math.sin(roll), 0)).multiplyScalar(size / 2);
        const b = new THREE.Vector3(0, Math.cos(tilt), 0).addScaledVector(N, Math.sin(tilt)).multiplyScalar(size / 2);
        if (frondy) b.y = -Math.abs(b.y); // fronds droop
        const tone = 0.75 + rnd() * 0.35;
        const tint: RGB = [tone * 0.92, tone, tone * 0.85];
        const nrm = N.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, 0.45, 0)).normalize();
        const cell: Cell = frondy ? (rnd() < 0.5 ? CELL.frondA : CELL.frondB) : (rnd() < 0.5 ? CELL.leafA : CELL.leafB);
        card(fol, c3, a, b, cell, tint, () => nrm, 0.05, 0.25, rnd() * TAU);
      }
    }
  }
}

/** Night fireflies: soft additive points drifting low through the forest beds, each pulsing on its own rhythm. 1 draw call, hidden by day. */
function buildFireflies(count: number): THREE.Points {
  const rnd = mulberry32(FOREST.seed + 31);
  const pos = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const b = FOREST.beds[Math.floor(rnd() * FOREST.beds.length)]!;
    const x = b.xMin + rnd() * (b.xMax - b.xMin), z = b.zMin + rnd() * (b.zMax - b.zMin);
    pos[i * 3] = x; pos[i * 3 + 1] = forestGroundY(x, z) + 0.4 + Math.pow(rnd(), 1.6) * 7.5; pos[i * 3 + 2] = z;
    ph[i] = rnd() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  g.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    name: 'metroForestFireflies', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uForestTime: uTime, uForestNight: uNight, uScale: { value: 380 } },
    vertexShader: /* glsl */ `
      uniform float uForestTime; uniform float uScale;
      attribute float aPhase; varying float vGlow;
      void main() {
        vec3 p = position;
        float t = uForestTime * 0.35 + aPhase;
        p += vec3(sin(t * 1.3) * 0.9 + sin(t * 0.37) * 1.6, sin(t * 0.9) * 0.45, cos(t * 1.1) * 0.9 + cos(t * 0.29) * 1.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float blink = pow(max(0.0, sin(uForestTime * (0.9 + fract(aPhase) * 1.4) + aPhase * 7.0)), 6.0);
        vGlow = blink;
        gl_PointSize = (0.09 + 0.14 * blink) * uScale / max(1.0, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uForestNight; varying float vGlow;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.42) * (0.4 + 3.2 * vGlow) * a * uForestNight, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.name = 'forestFireflies';
  pts.frustumCulled = false;
  pts.userData.noShadow = true;
  pts.visible = false;
  pts.renderOrder = 4;
  return pts;
}

export interface ForestBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  /** REAL time (s): wind and mist drift. */
  update(realTimeSec: number): void;
  stats: { calls: number; triangles: number };
}

export function buildForest(renderer: THREE.WebGLRenderer): ForestBuild {
  const group = new THREE.Group();
  group.name = 'metroForest';
  const plan = planForest();
  const bark = new Mesher(), fol = new Mesher(), ground = new Mesher();

  for (const t of plan.trees) buildTree(t, bark, fol);
  buildLivingWalls(fol, ground, mulberry32(FOREST.seed + 7));

  for (const f of plan.treeFerns) {
    const rnd = mulberry32(f.seed);
    const gy = forestGroundY(f.x, f.z);
    const topP = new THREE.Vector3(f.x + (rnd() - 0.5) * 0.5, gy + f.height, f.z + (rnd() - 0.5) * 0.5);
    const spine = bezier(new THREE.Vector3(f.x, gy - 0.2, f.z), new THREE.Vector3(f.x, gy + f.height * 0.5, f.z), topP, 6);
    // fibrous trunk tapering into a closed, rounded crown knuckle (never a cut post end)
    tube(bark, spine, 8, (s) => (s > 0.9 ? 0.16 * Math.sqrt(Math.max(0, 1 - (s - 0.9) / 0.1)) + 0.004 : 0.24 - 0.08 * s), (s) => mixc([0.15, 0.10, 0.07], MOSS, 0.3 * (1 - s)), 0);
    const ph = rnd() * TAU;
    for (let k = 0; k < FD.treeFernFronds; k++) {
      const az = (k / FD.treeFernFronds) * TAU + (rnd() - 0.5) * 0.4;
      const len = FD.treeFernFrondLen[0] + rnd() * (FD.treeFernFrondLen[1] - FD.treeFernFrondLen[0]);
      const tone = 0.85 + rnd() * 0.25;
      frond(fol, topP, az, 0.75 + rnd() * 0.3, -0.45 - rnd() * 0.35, len, FD.frondW, FD.frondSegs, rnd() < 0.5 ? CELL.frondA : CELL.frondB, [tone, tone, tone * 0.95], 0.7, ph + k);
    }
  }

  for (const f of plan.ferns) {
    const rnd = mulberry32(f.seed);
    const gy = forestGroundY(f.x, f.z);
    const base = new THREE.Vector3(f.x, gy - 0.02, f.z);
    const ph = rnd() * TAU;
    const tone = 0.8 + rnd() * 0.3;
    for (let k = 0; k < FD.fernFronds; k++) {
      const az = (k / FD.fernFronds) * TAU + rnd() * 0.6;
      frond(fol, base, az, 1.0 + rnd() * 0.3, 0.05 - rnd() * 0.25, f.size * (0.75 + rnd() * 0.4), f.size * 0.42, FD.fernSegs,
        rnd() < 0.5 ? CELL.frondA : CELL.frondB, [tone * 0.95, tone, tone * 0.85], 0.35, ph + k * 0.7);
    }
  }

  // Forest floor: one grid per patch, vertex-coloured moss / dark litter, plus mossy boulders.
  for (const r of GROUND) {
    const nx = Math.max(2, Math.round((r.xMax - r.xMin) / FOREST.groundPitch));
    const nz = Math.max(2, Math.round((r.zMax - r.zMin) / FOREST.groundPitch));
    const start = ground.pos.length / 3;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = r.xMin + ((r.xMax - r.xMin) * i) / nx, z = r.zMin + ((r.zMax - r.zMin) * j) / nz;
        const y = forestGroundY(x, z);
        const moss = Math.min(1, Math.max(0, 0.45 + 0.7 * (vnoise(x * 0.23, z * 0.23) - 0.5) + (y - Y0) * 0.35));
        const c = mixc([0.10, 0.075, 0.05], [0.13, 0.25, 0.05], moss);
        ground.vert(new THREE.Vector3(x, y, z), x / FD.groundTile, z / FD.groundTile, c);
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = start + j * (nx + 1) + i;
        ground.quad(a, a + nx + 1, a + nx + 2, a + 1);
      }
    }
  }
  for (const b of plan.boulders) {
    const rnd = mulberry32(b.seed);
    const ico = new THREE.IcosahedronGeometry(1, 2);
    const p = ico.getAttribute('position');
    const start = ground.pos.length / 3;
    const gy = forestGroundY(b.x, b.z);
    const squash = 0.55 + rnd() * 0.3;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const d = 1 + 0.22 * (vnoise(v.x * 2.1 + b.seed % 97, v.z * 2.1 + v.y * 1.7) - 0.5) * 2;
      v.multiplyScalar(b.r * d);
      v.y *= squash;
      const top = Math.max(0, v.y / (b.r * squash));
      const c = mixc([0.24, 0.24, 0.23], MOSS, Math.min(1, top * 1.4 + 0.15));
      ground.vert(new THREE.Vector3(b.x + v.x, gy + v.y - b.r * squash * 0.25, b.z + v.z), (b.x + v.x) / 1.2, (v.y + b.z) / 1.2, c);
    }
    const ix = ico.getIndex();
    if (ix) for (let i = 0; i < ix.count; i += 3) ground.tri(start + ix.getX(i), start + ix.getX(i + 1), start + ix.getX(i + 2));
    else for (let i = 0; i < p.count; i += 3) ground.tri(start + i, start + i + 1, start + i + 2);
    ico.dispose();
  }

  const barkTex = makeDetail(renderer, 'bark');
  const groundTex = makeDetail(renderer, 'ground');
  const atlas = sharedFoliageAtlas(renderer);

  const barkMat = new THREE.MeshStandardMaterial({ name: 'metroForestBark', map: barkTex, vertexColors: true, roughness: 0.92, metalness: 0 });
  const groundMat = new THREE.MeshStandardMaterial({ name: 'metroForestFloor', map: groundTex, vertexColors: true, roughness: 0.96, metalness: 0 });
  const folMat = new THREE.MeshStandardMaterial({
    name: 'metroForestFoliage', map: atlas, vertexColors: true, roughness: 0.62, metalness: 0, alphaTest: 0.42, side: THREE.DoubleSide,
  });
  patchForest(barkMat, 'bark', { glow: true });
  patchForest(groundMat, 'ground', { glow: true });
  patchForest(folMat, 'foliage', { wind: true, foliage: true });

  const barkGeo = bark.build(false, false);
  const groundGeo = ground.build(false, false);
  const folGeo = fol.build(true, true);
  const meshes = [new THREE.Mesh(barkGeo, barkMat), new THREE.Mesh(groundGeo, groundMat), new THREE.Mesh(folGeo, folMat)];
  meshes[0]!.name = 'forestBark'; meshes[1]!.name = 'forestFloor'; meshes[2]!.name = 'forestFoliage';
  for (const m of meshes) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = true;
    group.add(m);
  }
  const fireflies = buildFireflies(plan.trees.length * 26);
  group.add(fireflies);
  const tris = (barkGeo.index!.count + groundGeo.index!.count + folGeo.index!.count) / 3;
  return {
    group,
    deepMaterials: [barkMat, groundMat, folMat],
    update(realTimeSec: number): void {
      uTime.value = realTimeSec;
      const dn = dayNight.state;
      uNight.value = dn.night;
      // Mist follows the light: full at noon, warm at golden hour, a faint cold veil at night.
      const k = 0.9 * (1 - 0.9 * dn.night);
      const [mr, mg, mb] = FOREST.mist.color;
      uMistCol.value.set(mr * k * (1 + 0.25 * dn.golden), mg * k * (1 + 0.02 * dn.golden), mb * k * (1 - 0.2 * dn.golden));
      fireflies.visible = dn.night > 0.01;
    },
    stats: { calls: meshes.length + 1, triangles: tris },
  };
}
