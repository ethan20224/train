import * as THREE from 'three';
import { STREAM } from '../../layoutMetro';
import { KOI, koiPose, newKoiPose, pondEdge, pondWorld, type LilyInst } from '../../metro/streamPlan';
import { patchForest } from './forest';
import { STREAM_GLSL, followInstance } from './streamWater';
import { WF_GLSL } from './waterfallRock';

/**
 * Koi and lily pads of the pond, one draw call each.
 *
 * Koi: one procedural fish (lofted body with a rounded head and slim peduncle, forked tail fan, dorsal fin, two pectorals; about 540
 * triangles) instanced <= 12 times. Each fish follows a slow Lissajous path in the pond (streamPlan.koiPose, written to its instance
 * matrix on the CPU: eight 4x4 uploads a frame); the body undulation, tail beat and pectoral flutter run in the vertex shader. The
 * pattern (kohaku, sanke, ogon, shiro utsuri) is procedural in the fragment shader from the instance seed and kind.
 * Lilies: a notched, dished pad and a small lotus bloom share one geometry; a per-instance flag hides the part not wanted.
 */

const KOI_Y_DEPTH = 0.052;

function koiGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], body: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, z: number, u: number, th: number, part: number, extra: number): number => {
    pos.push(x, y, z); body.push(u, th, part, extra);
    return pos.length / 3 - 1;
  };
  const smooth = (a: number, b: number, v: number): number => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const prof = (u: number): number => {
    if (u < 0.3) return Math.pow(Math.sin((u / 0.3) * Math.PI * 0.5), 0.62);
    return 1 - 0.8 * Math.pow(smooth(0.34, 0.8, u), 0.85);
  };
  const W = 0.092, Ht = 0.112, Hb = 0.098;
  const RINGS = 26, RADIAL = 12;
  const ring0: number[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const u = (i / RINGS) * 0.8;
    const pr = prof(u);
    const x = 0.5 - u;
    ring0.push(pos.length / 3);
    for (let k = 0; k < RADIAL; k++) {
      const th = (k / RADIAL) * Math.PI * 2;
      const s = Math.sin(th), c = Math.cos(th);
      push(x, (s > 0 ? Ht : Hb) * pr * s - 0.01 * pr, W * pr * c, u, k / RADIAL, 0, 0);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < RADIAL; k++) {
      const a = ring0[i]! + k, b = ring0[i]! + ((k + 1) % RADIAL), c = ring0[i + 1]! + ((k + 1) % RADIAL), d = ring0[i + 1]! + k;
      idx.push(a, d, c, a, c, b);
    }
  }
  // tail fan (vertical, forked): columns along u, rows across y
  const TC = 6, TR = 6;
  const tail0 = pos.length / 3;
  for (let i = 0; i <= TC; i++) {
    const t = i / TC;
    const u = 0.76 + 0.24 * t;
    const half = 0.026 + 0.095 * smooth(0, 1, t);
    for (let j = 0; j <= TR; j++) {
      const f = (j / TR) * 2 - 1;
      const fork = -0.055 * (1 - Math.abs(f)) * smooth(0.55, 1, t);
      push(0.5 - u + fork, f * half, 0, u, 0.25, 1, Math.abs(f));
    }
  }
  for (let i = 0; i < TC; i++) for (let j = 0; j < TR; j++) {
    const a = tail0 + i * (TR + 1) + j, b = a + 1, c = a + TR + 2, d = a + TR + 1;
    idx.push(a, d, c, a, c, b, a, c, d, a, b, c);
  }
  // dorsal fin along the back u 0.30..0.64
  const DC = 8;
  const dor0 = pos.length / 3;
  for (let i = 0; i <= DC; i++) {
    const t = i / DC, u = 0.3 + 0.34 * t;
    const pr = prof(u);
    const hh = 0.07 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.3 * t);
    push(0.5 - u, Ht * pr * 0.92, 0, u, 0.25, 2, 0);
    push(0.5 - u - 0.02 * t, Ht * pr * 0.92 + hh, 0, u, 0.25, 2, 1);
  }
  for (let i = 0; i < DC; i++) {
    const a = dor0 + i * 2, b = a + 1, c = a + 3, d = a + 2;
    idx.push(a, d, c, a, c, b, a, c, d, a, b, c);
  }
  // pectoral fins
  for (const sg of [-1, 1]) {
    const f0 = pos.length / 3;
    const ux = 0.2;
    push(0.5 - ux, -0.035, sg * 0.08, ux, 0.7, 3, 0);
    push(0.5 - ux - 0.06, -0.04, sg * 0.082, ux + 0.06, 0.7, 3, 0.2);
    push(0.5 - ux - 0.11, -0.075, sg * 0.19, ux + 0.11, 0.7, 3, 1);
    push(0.5 - ux - 0.015, -0.06, sg * 0.18, ux + 0.015, 0.7, 3, 0.9);
    idx.push(f0, f0 + 1, f0 + 2, f0, f0 + 2, f0 + 3, f0, f0 + 2, f0 + 1, f0, f0 + 3, f0 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBody', new THREE.Float32BufferAttribute(body, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export interface KoiBuild {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshStandardMaterial;
  triangles: number;
  update(t: number): void;
}

export function buildKoi(): KoiBuild {
  const n = Math.min(12, KOI.length);
  const geo = koiGeometry();
  const aKoi = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  aKoi.setUsage(THREE.DynamicDrawUsage);
  KOI.slice(0, n).forEach((k, i) => aKoi.setXYZW(i, k.seed, k.kind, (k.seed * 7.31) % 1, 0.5));
  geo.setAttribute('aKoi', aKoi);
  const uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ name: 'metroDeepKoi', color: 0xffffff, roughness: 0.4, metalness: 0, envMapIntensity: 0.9, side: THREE.DoubleSide });
  patchForest(mat, 'streamKoi', {});
  const base = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    base(sh, r);
    followInstance(sh);
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec4 aBody;\nattribute vec4 aKoi;\nvarying vec4 vBody;\nvarying vec4 vKoi;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
vBody = aBody; vKoi = aKoi;
{
  float u = aBody.x;
  float ph = aKoi.z * 6.2831853;
  float beat = sin(u * 6.0 - uTime * 4.2 - ph);
  float amp = (0.012 + 0.085 * u * u) * (0.35 + 1.1 * aKoi.w);
  float zOff = beat * amp;
  if (aBody.z > 0.5 && aBody.z < 1.5) zOff *= 1.45;
  transformed.z += zOff;
  if (aBody.z > 2.5) {
    float flap = sin(uTime * 2.2 + ph * 1.7 + aBody.w * 1.5);
    transformed.y += flap * 0.022 * aBody.w;
    transformed.z += sign(position.z) * (0.012 + 0.012 * flap) * aBody.w;
  }
  if (aBody.z > 0.5 && aBody.z < 1.5) transformed.y += sin(uTime * 4.2 - ph + 2.0) * 0.012 * aBody.w * (0.4 + aKoi.w);
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vBody;\nvarying vec4 vKoi;\n${WF_GLSL}\n${STREAM_GLSL}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
float kSeed = vKoi.x * 37.0, kKind = vKoi.y;
float kU = vBody.x, kA = vBody.y * 6.2831853;
float kS = sin(kA), kC = cos(kA);
vec2 kq = vec2(kU * 4.2 + kSeed, kC * 1.5 + kSeed * 0.7);
float kN = wfNoise(kq) * 0.62 + wfNoise(kq * 2.3 + 5.0) * 0.38;
float kN2 = wfNoise(vec2(kU * 6.0 - kSeed, kC * 2.0 + kS * 1.0 + 3.0));
vec3 kWhite = vec3(0.9, 0.87, 0.82);
vec3 kHi = vec3(0.92, 0.24, 0.05);
vec3 kBlack = vec3(0.025, 0.025, 0.03);
vec3 kCol = kWhite;
float kBelly = smoothstep(-0.05, -0.55, kS);
if (kKind < 0.5) {
  float hi = smoothstep(0.48, 0.55, kN) + smoothstep(0.62, 0.7, kN2) * 0.0;
  hi = max(hi, (1.0 - smoothstep(0.05, 0.17, kU)) * smoothstep(0.25, 0.45, kN2));
  kCol = mix(kWhite, kHi, hi * (1.0 - kBelly * 0.9));
} else if (kKind < 1.5) {
  float hi = smoothstep(0.54, 0.6, kN);
  kCol = mix(kWhite, kHi, hi * (1.0 - kBelly * 0.9));
  float sumi = smoothstep(0.7, 0.75, kN2) * smoothstep(0.0, 0.4, kS) * (1.0 - smoothstep(0.0, 0.1, kU));
  sumi = max(sumi, smoothstep(0.72, 0.77, wfNoise(kq * 1.7 + 9.0)) * smoothstep(0.1, 0.5, kS));
  kCol = mix(kCol, kBlack, sumi);
} else if (kKind < 2.5) {
  kCol = mix(vec3(0.82, 0.5, 0.12), vec3(0.96, 0.78, 0.38), kN * 0.9 + kBelly * 0.4);
} else {
  float wh = smoothstep(0.5, 0.58, kN);
  kCol = mix(kBlack, kWhite, wh * (1.0 - 0.3 * kBelly));
  kCol = mix(kCol, kHi, smoothstep(0.78, 0.84, kN2) * wh * 0.8);
}
float kScale = 0.9 + 0.1 * wfNoise(vec2(kU * 40.0, kA * 5.0));
kCol *= kScale;
if (vBody.z > 0.5) kCol = mix(kCol, vec3(0.95, 0.82, 0.7), 0.45) * (0.8 + 0.3 * vBody.w);
diffuseColor.rgb = kCol;`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = (kKind > 1.5 && kKind < 2.5) ? 0.45 : 0.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.16;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'streamKoi';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = true;
  const [bx, bz] = pondWorld(0, 0);
  const pr = Math.max(...Array.from({ length: 16 }, (_, i) => pondEdge((i / 16) * Math.PI * 2))) + 1;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(bx, STREAM.level.pond, bz), pr);
  mesh.boundingBox = null;
  mesh.userData.noShadow = true;
  mesh.userData.noCapture = true;
  mesh.receiveShadow = true;
  const pose = newKoiPose();
  const arr = mesh.instanceMatrix.array as Float32Array;
  const update = (t: number): void => {
    uTime.value = t;
    for (let i = 0; i < n; i++) {
      koiPose(i, t, pose);
      const len = KOI[i]!.length;
      const o = i * 16;
      arr[o] = pose.hx * len; arr[o + 1] = 0; arr[o + 2] = pose.hz * len; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = len; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = -pose.hz * len; arr[o + 9] = 0; arr[o + 10] = pose.hx * len; arr[o + 11] = 0;
      arr[o + 12] = pose.x; arr[o + 13] = STREAM.level.pond - KOI_Y_DEPTH * (1 + 0.35 * Math.sin(t * 0.21 + i * 1.7)) - 0.02 * len + 0.0; arr[o + 14] = pose.z; arr[o + 15] = 1;
      aKoi.setW(i, Math.min(1, pose.speed / 0.22));
    }
    mesh.instanceMatrix.needsUpdate = true;
    aKoi.needsUpdate = true;
  };
  update(0);
  return { mesh, material: mat, triangles: (geo.index!.count / 3) * n, update };
}

// ---- lilies --------------------------------------------------------------------------------------------------------------

function lilyGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], lil: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, z: number, a: number, b: number, part: number): number => {
    pos.push(x, y, z); lil.push(a, b, part);
    return pos.length / 3 - 1;
  };
  // pad: dished disc, one wedge missing
  const notch = 0.34, SEG = 16;
  const c = push(0, 0.004, 0, 0, 0, 0);
  const ring: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const a = notch + ((Math.PI * 2 - 2 * notch) * i) / SEG;
    const ca = Math.cos(a), sa = Math.sin(a);
    ring.push(push(ca * 0.55, 0.009, sa * 0.55, ca * 0.55, sa * 0.55, 0));
  }
  const ring2: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const a = notch + ((Math.PI * 2 - 2 * notch) * i) / SEG;
    const ca = Math.cos(a), sa = Math.sin(a);
    ring2.push(push(ca, 0.013, sa, ca, sa, 0));
  }
  for (let i = 0; i < SEG; i++) {
    idx.push(c, ring[i + 1]!, ring[i]!);
    idx.push(ring[i]!, ring[i + 1]!, ring2[i + 1]!, ring[i]!, ring2[i + 1]!, ring2[i]!);
  }
  // lotus bloom: two rings of petals around a golden heart (radius 1 = the instance radius)
  const base = push(0, 0.02, 0, 0, 0, 2);
  for (let layer = 0; layer < 2; layer++) {
    const petals = layer === 0 ? 8 : 6;
    for (let p = 0; p < petals; p++) {
      const a = ((p + layer * 0.5) / petals) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a), cl = Math.cos(a + 0.34), sl = Math.sin(a + 0.34), cr = Math.cos(a - 0.34), sr = Math.sin(a - 0.34);
      const R = layer === 0 ? 0.95 : 0.6, Hh = layer === 0 ? 0.03 : 0.058;
      const tip = push(ca * R, 0.03 + Hh, sa * R, layer === 0 ? 0.9 : 0.7, layer, 1);
      const l = push(cl * R * 0.55, 0.026 + Hh * 0.4, sl * R * 0.55, 0.5, layer, 1);
      const r = push(cr * R * 0.55, 0.026 + Hh * 0.4, sr * R * 0.55, 0.5, layer, 1);
      const root = push(ca * 0.12, 0.022, sa * 0.12, 0.1, layer, 1);
      idx.push(root, l, tip, root, tip, r, root, tip, l, root, r, tip);
    }
  }
  void base;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLily', new THREE.Float32BufferAttribute(lil, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export interface LilyBuild { mesh: THREE.InstancedMesh; material: THREE.MeshStandardMaterial; triangles: number }

export function buildLilies(lilies: readonly LilyInst[]): LilyBuild {
  const geo = lilyGeometry();
  const vis = new Float32Array(lilies.length * 2);
  const mat = new THREE.MeshStandardMaterial({ name: 'metroDeepLily', color: 0xffffff, roughness: 0.55, metalness: 0, envMapIntensity: 0.6, side: THREE.DoubleSide });
  patchForest(mat, 'streamLily', {});
  const base = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    base(sh, r);
    followInstance(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aLily;\nattribute vec2 aVis;\nvarying vec3 vLily;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLily = aLily;\ntransformed *= (aLily.z > 0.5 ? aVis.y : aVis.x);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLily;\n${WF_GLSL}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
if (vLily.z < 0.5) {
  float lr = length(vLily.xy), la = atan(vLily.y, vLily.x);
  float lv = pow(abs(cos(la * 9.0)), 24.0) * (1.0 - smoothstep(0.0, 0.95, lr));
  float ln = wfNoise(vLily.xy * 9.0);
  vec3 lc = vec3(0.04, 0.15, 0.035) * (0.75 + 0.5 * ln);
  lc = mix(lc, vec3(0.14, 0.26, 0.07), lv * 0.7);
  lc = mix(lc, vec3(0.16, 0.14, 0.05), smoothstep(0.88, 1.0, lr) * 0.6);
  diffuseColor.rgb = lc;
} else {
  float lt = clamp(vLily.x, 0.0, 1.0);
  diffuseColor.rgb = mix(vec3(0.96, 0.9, 0.9), vec3(0.95, 0.5, 0.68), smoothstep(0.35, 0.95, lt) * (0.6 + 0.4 * vLily.y));
  if (lt < 0.2) diffuseColor.rgb = vec3(0.9, 0.7, 0.2);
}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vLily.z > 0.5) totalEmissiveRadiance += diffuseColor.rgb * 0.1;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, lilies.length);
  mesh.name = 'streamLilies';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  lilies.forEach((l, i) => {
    q.setFromAxisAngle(up, l.yaw);
    m.compose(p.set(l.x, STREAM.level.pond, l.z), q, s.set(l.r, 1, l.r));
    mesh.setMatrixAt(i, m);
    vis[i * 2] = l.flower ? 0 : 1; vis[i * 2 + 1] = l.flower ? 1 : 0;
  });
  mesh.instanceMatrix.needsUpdate = true;
  geo.setAttribute('aVis', new THREE.InstancedBufferAttribute(vis, 2));
  mesh.computeBoundingSphere();
  mesh.userData.noShadow = true;
  mesh.receiveShadow = true;
  return { mesh, material: mat, triangles: (geo.index!.count / 3) * lilies.length };
}
