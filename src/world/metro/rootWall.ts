import * as THREE from 'three';
import { ROOT_WALL as RW } from '../../layoutMetro';
import { baseDepth, boreDist, mulberry32, reliefDepth, rootMinXAt, rootWallPlan, rootsOnly, vnoise, type V3 } from '../../metro/rootWallLayout';
import { CELL, Mesher, MOSS, card, frond, mixc, patchForest, sharedFoliageAtlas, type Cell, type RGB } from './forest';

/**
 * The Root Wall (user ruling 2026-11-23): a colossal strangler fig grows out of the east end wall and pours its roots over
 * it, wrapping both Vesper east bores (Ta Prohm at Angkor, indoors). The big roots are ONE fused relief (smooth-max field,
 * src/metro/rootWallLayout.ts) meshed on a 0.18 m grid with analytic normals: junctions are filleted, nothing is a tube
 * segment. Thin roots drape over it as tubes, the crown (limbs, leaf clumps, hanging moss) spreads under the sky, aerial
 * strands hang from the limbs and sway. Bark carries vertex-colour moss, lichen and cavity darkening; foliage shares the
 * forest atlas and shader (mist, wind). Only the foliage and the aerial strands move.
 *
 * Budget: 3 draw calls (bark + relief + limbs, aerial strands, foliage atlas) + their shadow casts.
 */

const TAU = Math.PI * 2;
const F = RW.faceX;

const BARK_A: RGB = [0.50, 0.43, 0.36];
const BARK_B: RGB = [0.34, 0.29, 0.25];
const ROCK: RGB = [0.07, 0.105, 0.045];
const MOSS_LIT: RGB = [0.19, 0.31, 0.08];
const LICHEN: RGB = [0.36, 0.40, 0.29];
const AERIAL: RGB = [0.34, 0.25, 0.17];

const ss = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Fine fig-bark detail (greyscale, tileable): smooth grey-brown mottling with small horizontal lenticel rings. Sampled triplanar in world space. */
function makeFigBark(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 512, P = 16;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  const img = g.createImageData(S, S);
  const hash = (x: number, y: number): number => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const pn = (x: number, y: number, p: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const w = (v: number): number => ((v % p) + p) % p;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(w(xi), w(yi)), b = hash(w(xi + 1), w(yi)), cc = hash(w(xi), w(yi + 1)), d = hash(w(xi + 1), w(yi + 1));
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * P, v = (y / S) * P;
      const val = 0.8 + 0.2 * (pn(u * 2, v * 2, P * 2) - 0.5) + 0.12 * (pn(u * 6, v * 5, P * 6) - 0.5) + 0.05 * (pn(u * 20, v * 18, P * 20) - 0.5);
      const o = (y * S + x) * 4, b = Math.max(0, Math.min(255, Math.round(val * 255)));
      img.data[o] = b; img.data[o + 1] = b; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // lenticels: short dark horizontal dashes with a faint lit lip, wrapped so the tile repeats seamlessly
  const rnd = mulberry32(4242);
  for (let k = 0; k < 120; k++) {
    const cx = rnd() * S, cy = rnd() * S, w = 6 + rnd() * 16, h = 1.4 + rnd() * 1.8, a = 0.16 + rnd() * 0.2;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.fillStyle = `rgba(255,255,255,${a * 0.45})`;
        g.beginPath(); g.ellipse(cx + ox, cy + oy - h * 0.9, w, h * 0.7, 0, 0, TAU); g.fill();
        g.fillStyle = `rgba(0,0,0,${a * 1.5})`;
        g.beginPath(); g.ellipse(cx + ox, cy + oy, w * 0.85, h, 0, 0, TAU); g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

/** Chain a world-space triplanar sample of the bark map (0.9 m tiles, blended by world normal) onto the forest-patched bark material. */
function triplanarBark(mat: THREE.MeshStandardMaterial, key: string): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vRWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRWN;')
      .replace('#include <map_fragment>', `
        {
          vec3 bw = pow(abs(normalize(vRWN)), vec3(4.0));
          bw /= (bw.x + bw.y + bw.z);
          vec3 wp = vForestWorld / 0.9;
          vec4 tri = texture2D(map, wp.zy) * bw.x + texture2D(map, wp.xz) * bw.y + texture2D(map, wp.xy) * bw.z;
          diffuseColor *= tri;
        }`);
  };
  mat.customProgramCacheKey = () => `forest|${key}|triplanar`;
}

/** Bark/moss/lichen colour for a surface point. `up` is the upward component of the unit normal, `rootness` 0 (rock layer) .. 1 (bark). */
function surfaceColour(z: number, y: number, up: number, rootness: number, cavity: number): RGB {
  const damp = ss(-58, -72, y);
  const grain = 0.55 * vnoise(z * 0.9 + 3, y * 0.9 - 7) + 0.45 * vnoise(z * 0.16 + 40, y * 0.09 - 12);
  const bark = mixc(BARK_B, BARK_A, Math.min(1, grain * 1.15));
  const patch = vnoise(z * 0.31 - 4, y * 0.31 + 8);
  // rock between the roots: wet dark stone with strata streaks, moss tufts in small colonies, damp sheen lower down
  const strata = vnoise(z * 0.22 + 5, y * 1.7 - 2);
  const wet = Math.min(1, Math.max(0, 0.35 + 0.8 * (vnoise(z * 0.4 + 31, y * 0.18) - 0.4) + 0.5 * damp));
  const stone = mixc([0.05, 0.06, 0.05], [0.12, 0.115, 0.095], strata * (1 - 0.7 * wet));
  const tufts = ss(0.58, 0.72, vnoise(z * 1.9 + 2, y * 1.9 - 9) * 0.6 + patch * 0.5);
  const mossRock = mixc(ROCK, MOSS_LIT, Math.min(1, 0.25 + 0.8 * Math.max(0, up)));
  const rock = mixc(mixc(stone, ROCK, 0.45 * (1 - wet)), mossRock, Math.min(1, tufts * 0.85 + 0.18 * ss(0.4, 0.8, patch)));
  let col = mixc(rock, bark, rootness);
  // moss: on upward faces and damp low down, in noisy patches
  const moss = Math.min(1, Math.max(0, 0.12 + 1.1 * Math.max(0, up) + 0.6 * (vnoise(z * 0.55 + 21, y * 0.55) - 0.45) + 0.4 * damp)) * rootness;
  col = mixc(col, MOSS, moss * 0.85);
  // lichen / epiphyte patches and pale specks
  const lich = ss(0.66, 0.8, vnoise(z * 1.25 + 9, y * 1.25 + 4)) * rootness * (1 - 0.6 * moss);
  col = mixc(col, LICHEN, lich * 0.7);
  const ao = Math.max(0.3, 1 - 1.15 * cavity);
  return [col[0] * ao, col[1] * ao, col[2] * ao];
}

interface RelMesh { D: Float32Array; nz: number; ny: number; z0: number; y0: number; pitch: number }

/** The fused relief, meshed (analytic normals from the field, vertex colours, planar bark UVs). */
function buildRelief(m: Mesher): RelMesh {
  const pitch = RW.gridPitch;
  const nz = Math.round((RW.zMax - RW.zMin) / pitch) + 1, ny = Math.round((RW.yTop - RW.yFloor) / pitch) + 1;
  const z0 = RW.zMin, y0 = RW.yFloor;
  const D = new Float32Array(nz * ny), R = new Float32Array(nz * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nz; i++) {
      const z = z0 + i * pitch, y = y0 + j * pitch;
      D[j * nz + i] = reliefDepth(z, y);
      R[j * nz + i] = rootsOnly(z, y);
    }
  }
  const at = (i: number, j: number): number => D[Math.min(ny - 1, Math.max(0, j)) * nz + Math.min(nz - 1, Math.max(0, i))]!;
  const first = m.pos.length / 3;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nz; i++) {
      const z = z0 + i * pitch, y = y0 + j * pitch;
      const d = at(i, j);
      const dz = (at(i + 1, j) - at(i - 1, j)) / (2 * pitch), dy = (at(i, j + 1) - at(i, j - 1)) / (2 * pitch);
      const n = new THREE.Vector3(-1, -dy, -dz).normalize();
      const rootness = ss(0.03, 0.22, R[j * nz + i]! - baseDepth(z, y) * 0.5);
      let around = 0;
      for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2]] as const) around += at(i + a, j + b);
      const cavity = Math.min(0.6, Math.max(0, around / 8 - d) * 2.4);
      const col = surfaceColour(z, y, n.y, rootness, cavity);
      const edge = 0.5 + 0.5 * ss(RW.boreMargin, RW.boreMargin + 0.9, boreDist(z, y));
      m.vert(new THREE.Vector3(F - d, y, z), z / 1.4, y / 1.8, [col[0] * edge, col[1] * edge, col[2] * edge], n);
    }
  }
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nz - 1; i++) {
      if (Math.max(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)) < 0.02) continue;
      const a = first + j * nz + i, b = a + 1, c = a + nz + 1, d = a + nz;
      // CCW seen from -x (the cavern): (z0,y0) -> (z1,y0) -> (z1,y1)
      m.quad(a, b, c, d);
    }
  }
  return { D, nz, ny, z0, y0, pitch };
}

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _o = new THREE.Vector3();

interface SweepOpts {
  radial: number;
  rAt: (i: number, s: number, th: number) => number;
  colAt: (i: number, s: number, th: number, up: number) => RGB;
  tile?: number;
  /** Wind weight per ring (aerial strands). */
  wind?: (s: number) => number;
  phase?: number;
  /** Close the last ring with a rounded tip. */
  tip?: boolean;
}

/** Tube along a 3D spine with parallel-transported frames, smooth radial normals, seamless UVs, outward-facing triangles. */
function sweep(m: Mesher, spine: readonly THREE.Vector3[], o: SweepOpts): void {
  const n = spine.length;
  if (n < 2) return;
  const tile = o.tile ?? 1.2;
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1]! + spine[i]!.distanceTo(spine[i - 1]!));
  const total = lens[n - 1]!;
  _n.set(0, 0, 1).cross(_t.copy(spine[1]!).sub(spine[0]!).normalize());
  if (_n.lengthSq() < 1e-4) _n.set(1, 0, 0);
  _n.normalize();
  const rings: number[] = [];
  for (let i = 0; i < n; i++) {
    _t.copy(i < n - 1 ? spine[i + 1]! : spine[i]!).sub(i < n - 1 ? spine[i]! : spine[i - 1]!).normalize();
    _n.sub(_o.copy(_t).multiplyScalar(_n.dot(_t))).normalize();
    _b.copy(_t).cross(_n).normalize();
    const s = lens[i]! / Math.max(1e-6, total);
    rings.push(m.pos.length / 3);
    const r0 = o.rAt(i, s, 0);
    const uRep = Math.max(1, Math.round((TAU * r0) / tile));
    for (let k = 0; k <= o.radial; k++) {
      const th = (k / o.radial) * TAU;
      const r = o.rAt(i, s, th);
      const nx = Math.cos(th), ny = Math.sin(th);
      _o.copy(_n).multiplyScalar(nx).addScaledVector(_b, ny);
      _p.copy(spine[i]!).addScaledVector(_o, r);
      const w = o.wind ? o.wind(s) : 0;
      m.vert(_p, (k / o.radial) * uRep, lens[i]! / tile, o.colAt(i, s, th, _o.y), _o.clone(), w, o.phase ?? 0);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < o.radial; k++) {
      const a = rings[i]! + k, b = rings[i]! + k + 1, c = rings[i + 1]! + k + 1, d = rings[i + 1]! + k;
      m.quad(a, b, c, d);
    }
  }
  if (o.tip) {
    const last = n - 1;
    _t.copy(spine[last]!).sub(spine[last - 1]!).normalize();
    const apex = spine[last]!.clone().addScaledVector(_t, o.rAt(last, 1, 0) * 0.9);
    const ai = m.vert(apex, 0.5, total / tile, o.colAt(last, 1, 0, 0), _t.clone(), o.wind ? o.wind(1) : 0, o.phase ?? 0);
    for (let k = 0; k < o.radial; k++) m.tri(rings[last]! + k, rings[last]! + k + 1, ai);
  }
}

function buildFoliage(fol: Mesher, rel: RelMesh, rnd: () => number): { clumps: number; wall: number; ferns: number } {
  const plan = rootWallPlan();
  const nrmCrown = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(p.x - 57, (p.y + 39.5) * 0.9, p.z - 74).normalize().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.45, 0.0)).normalize();
  // crown clumps: two crossed cards each, like the forest crowns
  for (const c of plan.clumps) {
    const r = mulberry32(c.seed);
    const lift = Math.min(1, Math.max(0, (c.y - RW.crown.yMin) / (RW.crown.yMax - RW.crown.yMin)));
    const tone = 0.8 + r() * 0.32;
    const tint: RGB = [tone * (0.94 + lift * 0.12), tone * (1.0 + lift * 0.06), tone * 0.9];
    const ph = r() * TAU;
    const cen = new THREE.Vector3(c.x, c.y, c.z);
    for (let q = 0; q < 2; q++) {
      const yaw = r() * TAU, pitch = (r() - 0.5) * 1.2;
      const a = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(c.size / 2);
      const b = new THREE.Vector3(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)).multiplyScalar(c.size / 2);
      if (q === 1) { b.set(-Math.sin(yaw) * c.size / 2, c.size * 0.06, Math.cos(yaw) * c.size / 2); }
      card(fol, cen, a, b, r() < 0.5 ? CELL.leafA : CELL.leafB, tint, nrmCrown, 0.6, 1.0, ph);
    }
  }
  // hanging moss strands under the limbs
  for (const s of plan.moss) {
    const r = mulberry32(s.seed);
    const c = new THREE.Vector3(s.x, s.y - s.len / 2 - 0.05, s.z);
    const ph = r() * TAU, yaw = r() * TAU;
    const cell: Cell = r() < 0.5 ? CELL.mossA : CELL.mossB;
    const tint: RGB = [0.95 + r() * 0.1, 0.95 + r() * 0.1, 0.9];
    for (const off of [0, Math.PI / 2]) {
      const a = new THREE.Vector3(Math.cos(yaw + off), 0, Math.sin(yaw + off)).multiplyScalar(s.w / 2);
      const b = new THREE.Vector3(0, s.len / 2, 0);
      const n = new THREE.Vector3(Math.cos(yaw + off + Math.PI / 2), 0.4, Math.sin(yaw + off + Math.PI / 2)).normalize();
      card(fol, c, a, b, cell, tint, () => n, 1.4, 0.15, ph);
    }
  }
  const depthAt = (z: number, y: number): number => {
    const i = Math.min(rel.nz - 1, Math.max(0, Math.round((z - rel.z0) / rel.pitch))), j = Math.min(rel.ny - 1, Math.max(0, Math.round((y - rel.y0) / rel.pitch)));
    return rel.D[j * rel.nz + i]!;
  };
  // Epiphytes only where a plant could root: crotches between roots, the tops of the big roots, and a few tufts in the rock gaps.
  // Always clusters of fronds standing off the surface (outward and up), never flat cards on the bark.
  const dp = rel.pitch * 3;
  const upAt = (z: number, y: number): number => {
    const dy = (depthAt(z, y + dp) - depthAt(z, y - dp)) / (2 * dp), dz = (depthAt(z + dp, y) - depthAt(z - dp, y)) / (2 * dp);
    return -dy / Math.hypot(1, dy, dz);
  };
  const cluster = (z: number, y: number, kind: 'fern' | 'bromeliad' | 'tuft'): void => {
    const d = depthAt(z, y);
    const base = new THREE.Vector3(F - d + 0.03, y, z);
    const ph = rnd() * TAU, tone = 0.85 + rnd() * 0.25;
    if (kind === 'bromeliad') {
      const size = 0.55 + rnd() * 0.35;
      for (let f = 0; f < 11; f++) {
        const az = (f / 11) * TAU + rnd() * 0.4;
        frond(fol, base, az, 0.95 - (f % 3) * 0.2, 0.15 - rnd() * 0.3, size * (0.7 + rnd() * 0.5), size * 0.3, 4, rnd() < 0.5 ? CELL.frondA : CELL.frondB, [tone * 0.95, tone * 1.05, tone * 0.9], 0.3, ph + f);
      }
      return;
    }
    const size = (kind === 'tuft' ? 0.4 : 0.9) + rnd() * (kind === 'tuft' ? 0.4 : 0.8);
    const n = kind === 'tuft' ? 5 : 6;
    for (let f = 0; f < n; f++) {
      const az = Math.PI + (f / (n - 1) - 0.5) * 2.4 + (rnd() - 0.5) * 0.3;
      frond(fol, base, az, 0.5 + rnd() * 0.5, -0.5 - rnd() * 0.4, size * (0.8 + rnd() * 0.4), size * 0.4, 4, rnd() < 0.5 ? CELL.frondA : CELL.frondB, [tone, tone, tone * 0.95], 0.4, ph + f);
    }
  };
  let ferns = 0, crotch = 0, tops = 0, tufts = 0;
  for (let k = 0; k < 4000 && crotch < 55; k++) {
    const z = RW.zMin + 1 + rnd() * (RW.zMax - RW.zMin - 2), y = -70 + rnd() * 31;
    if (boreDist(z, y) < 0.9) continue;
    const d = depthAt(z, y);
    if (d < 0.35) continue;
    const around = (depthAt(z + dp, y) + depthAt(z - dp, y) + depthAt(z, y + dp) + depthAt(z, y - dp)) / 4;
    if (around - d < 0.1) continue; // only real crotches
    crotch++; cluster(z, y, rnd() < 0.75 ? 'fern' : 'bromeliad');
  }
  for (let k = 0; k < 6000 && tops < 55; k++) {
    const z = RW.zMin + 1 + rnd() * (RW.zMax - RW.zMin - 2), y = -71 + rnd() * 34;
    if (boreDist(z, y) < 0.9) continue;
    const d = depthAt(z, y);
    if (d < 0.55 || upAt(z, y) < 0.5) continue;
    if (ss(0.03, 0.22, rootsOnly(z, y) - baseDepth(z, y) * 0.5) < 0.7) continue;
    tops++; cluster(z, y, rnd() < 0.55 ? 'bromeliad' : 'fern');
  }
  for (let k = 0; k < 4000 && tufts < 60; k++) {
    const z = RW.zMin + 0.6 + rnd() * (RW.zMax - RW.zMin - 1.2), y = RW.yFloor + 0.3 + Math.pow(rnd(), 0.9) * 36;
    if (boreDist(z, y) < 0.9) continue;
    const d = depthAt(z, y);
    if (d < 0.12 || ss(0.03, 0.22, rootsOnly(z, y) - baseDepth(z, y) * 0.5) > 0.25) continue;
    tufts++; cluster(z, y, 'tuft');
  }
  ferns = crotch + tops + tufts;
  const wall = 0;
  return { clumps: plan.clumps.length, wall, ferns };
}

export interface RootWallBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  stats: { calls: number; triangles: number };
}

/** Wind and mist time come from the forest shader's shared uniform (forest.update), so the Root Wall needs no update of its own. */
export function buildRootWall(renderer: THREE.WebGLRenderer): RootWallBuild {
  const group = new THREE.Group();
  group.name = 'metroRootWall';
  const plan = rootWallPlan();
  const rnd = mulberry32(RW.seed + 5);
  const bark = new Mesher(), air = new Mesher(), fol = new Mesher();

  const rel = buildRelief(bark);

  // thin roots: tubes that drape over the relief
  for (const t of plan.thin) {
    const n = t.z.length;
    if (n < 3) continue;
    const spine = t.z.map((z, i) => {
      const y = t.y[i]!, r = t.r[i]!;
      const d = reliefDepth(z, y);
      return new THREE.Vector3(Math.max(rootMinXAt(y) + r, F - d - 0.2 * r), y, z);
    });
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < n - 1; i++) spine[i]!.x = (spine[i - 1]!.x + 2 * spine[i]!.x + spine[i + 1]!.x) / 4;
    }
    const ph = (t.seed % 1000) / 160;
    sweep(bark, spine, {
      radial: 7,
      rAt: (i, s, th) => t.r[i]! * (0.45 + 0.55 * ss(0, 0.08, s)) * (1 + 0.1 * Math.sin(i * 0.5 + ph) + 0.03 * Math.cos(th * 2 + i)),
      colAt: (i, _s, _th, up) => surfaceColour(t.z[i]!, t.y[i]!, up, 1, 0.05),
      tip: t.y[n - 1]! > RW.yFloor + 0.1,
    });
  }

  // crown limbs (world coordinates)
  for (const l of plan.limbs) {
    const spine = l.pts.map((p: V3) => new THREE.Vector3(p[0], p[1], p[2]));
    const mossSide = rnd() * TAU;
    sweep(bark, spine, {
      radial: 9,
      rAt: (i) => l.r[i]!,
      colAt: (_i, s, th, up) => {
        const m = Math.min(1, Math.max(0, 0.3 + 0.45 * Math.max(0, up) + 0.3 * Math.cos(th - mossSide) + 0.25 * s));
        return mixc(mixc(BARK_B, BARK_A, 0.5), MOSS, m * 0.8);
      },
      tile: 1.4,
      tip: true,
    });
  }

  // aerial roots: thin strands hanging from the limbs, swaying
  for (const a of plan.aerials) {
    const spine = a.pts.map((p: V3) => new THREE.Vector3(p[0], p[1], p[2]));
    const n = spine.length;
    sweep(air, spine, {
      radial: 5,
      rAt: (i, s) => a.r * (1 - 0.55 * s) * (i === 0 ? 1.6 : 1),
      colAt: (_i, s) => mixc(AERIAL, BARK_A, s * 0.4),
      tile: 1.0,
      wind: (s) => 0.1 + 2.6 * Math.pow(s, 1.3),
      phase: a.phase,
      tip: n > 2,
    });
  }

  const fcount = buildFoliage(fol, rel, rnd);

  const barkTex = makeFigBark(renderer);
  const barkMat = new THREE.MeshStandardMaterial({ name: 'metroRootBark', map: barkTex, vertexColors: true, roughness: 0.9, metalness: 0 });
  const airMat = new THREE.MeshStandardMaterial({ name: 'metroRootAerial', map: barkTex, vertexColors: true, roughness: 0.85, metalness: 0 });
  const folMat = new THREE.MeshStandardMaterial({
    name: 'metroRootFoliage', map: sharedFoliageAtlas(renderer), vertexColors: true, roughness: 0.62, metalness: 0, alphaTest: 0.42, side: THREE.DoubleSide,
  });
  patchForest(barkMat, 'rootBark', {});
  triplanarBark(barkMat, 'rootBark');
  patchForest(airMat, 'rootAerial', { wind: true });
  patchForest(folMat, 'rootFoliage', { wind: true, foliage: true });

  const barkGeo = bark.build(true, false);
  const airGeo = air.build(true, true);
  const folGeo = fol.build(true, true);
  const meshes = [new THREE.Mesh(barkGeo, barkMat), new THREE.Mesh(airGeo, airMat), new THREE.Mesh(folGeo, folMat)];
  meshes[0]!.name = 'rootWallBark'; meshes[1]!.name = 'rootWallAerial'; meshes[2]!.name = 'rootWallFoliage';
  for (const [i, m] of meshes.entries()) {
    m.castShadow = i !== 1;
    m.receiveShadow = true;
    group.add(m);
  }
  const tris = (barkGeo.index!.count + airGeo.index!.count + folGeo.index!.count) / 3;
  group.userData.fillCounts = fcount;
  return { group, deepMaterials: [barkMat, airMat, folMat], stats: { calls: meshes.length, triangles: tris } };
}
