import * as THREE from 'three';

/**
 * Analytic light for the void (no real lights are allowed in `metroVoid`). The void's emissive light rings and cove
 * strips are line sources; this injects their illumination into the void materials as an emissive term evaluated per
 * fragment from the world position and normal: a wrapped-Lambert fall-off from the closest point of each ring / strip,
 * so ledges, overhangs and joints in the rock are picked out by the rings that pass them, and the deck soffits glow
 * next to their cove strips. Cost is a short fixed loop; nothing is baked and nothing moves.
 */

/** Circular ring about the void axis: centre (cx, cz) is shared; `y`, source radius `r`, HDR colour (intensity included). */
export interface RingSource { y: number; r: number; color: THREE.Color }
/** Straight strip A to B emitting toward `dir` (unit). */
export interface StripSource { a: THREE.Vector3; b: THREE.Vector3; dir: THREE.Vector3; color: THREE.Color }

export interface VoidLightSources {
  cx: number; cz: number;
  /** Wall rings, y strictly descending at a constant `pitch` from `y0` (each fragment evaluates only the pair around it). */
  rings: readonly RingSource[]; y0: number; pitch: number;
  /** Isolated rings (the Threshold rim cove): always evaluated. */
  extraRings?: readonly RingSource[];
  /** Strips are skipped cheaply when more than 6 m above or below the fragment. */
  strips: readonly StripSource[];
  wrap?: number; gain?: number; softness?: number;
  /** Wide, soft bounce of every ring and strip (the rock is never pure black between rings). */
  bounce?: number;
  /** The eclipse: a bright point-like source at the sky hole, lighting the void from below. */
  sky?: { pos: THREE.Vector3; color: THREE.Color; falloff: number };
}

const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : n.toFixed(4));
const v3s = (v: THREE.Vector3 | THREE.Color): string => {
  const [x, y, z] = v instanceof THREE.Color ? [v.r, v.g, v.b] : [v.x, v.y, v.z];
  return `vec3(${f(x)},${f(y)},${f(z)})`;
};

/** GLSL for `vec3 voidLight(vec3 P, vec3 N)`. */
function glsl(s: VoidLightSources): string {
  const nr = s.rings.length, ns = s.strips.length;
  const extra = s.extraRings ?? [];
  const wrap = s.wrap ?? 0.45, gain = s.gain ?? 1, soft = s.softness ?? 0.3, bounce = s.bounce ?? 0;
  const all = [...s.rings, ...extra];
  const ringP = all.map((r) => `vec2(${f(r.y)},${f(r.r)})`).join(',');
  const ringC = all.map((r) => v3s(r.color)).join(',');
  const sA = s.strips.map((q) => v3s(q.a)).join(',');
  const sB = s.strips.map((q) => v3s(q.b)).join(',');
  const sD = s.strips.map((q) => v3s(q.dir)).join(',');
  const sC = s.strips.map((q) => v3s(q.color)).join(',');
  const ringTerm = (idx: string): string => `{
    vec3 Q = vec3(${f(s.cx)} + e.x * VOID_RP[${idx}].y, VOID_RP[${idx}].x, ${f(s.cz)} + e.y * VOID_RP[${idx}].y);
    vec3 L = Q - P;
    float d2 = dot(L, L);
    vec3 Lh = L * inversesqrt(max(d2, 1e-6));
    float lam = clamp((dot(N, Lh) + ${f(wrap)}) / (1.0 + ${f(wrap)}), 0.0, 1.0);
    float emit = 0.3 + 0.7 * clamp(dot(Lh, e3), 0.0, 1.0);
    acc += VOID_RC[${idx}] * (lam * emit / (d2 + ${f(soft)}) + ${f(bounce)} * (dot(N, Lh) * 0.5 + 0.5) / (1.0 + d2 * 0.2));
  }`;
  return `
varying vec3 vVoidW;
varying vec3 vVoidN;
#define VOID_NS ${ns}
const vec2 VOID_RP[${all.length}] = vec2[${all.length}](${ringP});
const vec3 VOID_RC[${all.length}] = vec3[${all.length}](${ringC});
const vec3 VOID_SA[VOID_NS] = vec3[VOID_NS](${sA});
const vec3 VOID_SB[VOID_NS] = vec3[VOID_NS](${sB});
const vec3 VOID_SD[VOID_NS] = vec3[VOID_NS](${sD});
const vec3 VOID_SC[VOID_NS] = vec3[VOID_NS](${sC});
vec3 voidLight(vec3 P, vec3 N) {
  vec3 acc = vec3(0.0);
  vec2 pr = P.xz - vec2(${f(s.cx)}, ${f(s.cz)});
  float rr = length(pr);
  vec2 e = pr / max(rr, 1e-3);
  vec3 e3 = vec3(e.x, 0.0, e.y);
  // the pair of wall rings around this fragment (constant pitch: no search)
  int i0 = int(clamp(floor((${f(s.y0)} - P.y) / ${f(s.pitch)}), 0.0, ${nr - 2}.0));
  ${ringTerm('i0')}
  ${ringTerm('i0 + 1')}
  for (int k = 0; k < ${extra.length}; k++) {
    int i = ${nr} + k;
    ${ringTerm('i')}
  }
  for (int j = 0; j < VOID_NS; j++) {
    if (abs(VOID_SA[j].y - P.y) > 6.0) continue;
    vec3 ab = VOID_SB[j] - VOID_SA[j];
    float t = clamp(dot(P - VOID_SA[j], ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    vec3 L = VOID_SA[j] + ab * t - P;
    float d2 = dot(L, L);
    if (d2 > 36.0) continue;
    vec3 Lh = L * inversesqrt(max(d2, 1e-6));
    float lam = clamp((dot(N, Lh) + ${f(wrap)}) / (1.0 + ${f(wrap)}), 0.0, 1.0);
    float emit = 0.3 + 0.7 * clamp(dot(-Lh, VOID_SD[j]), 0.0, 1.0);
    acc += VOID_SC[j] * (lam * emit / (d2 + ${f(soft)}));
  }
${s.sky ? `  vec3 Ls = ${v3s(s.sky.pos)} - P;
  float ds2 = dot(Ls, Ls);
  vec3 Lsh = Ls * inversesqrt(max(ds2, 1e-6));
  float lamS = clamp((dot(N, Lsh) + 0.6) / 1.6, 0.0, 1.0);
  acc += ${v3s(s.sky.color)} * (lamS / (1.0 + ds2 * ${f(s.sky.falloff)}));` : ''}
  return acc * ${f(gain)};
}`;
}

/**
 * Adds the void light to a standard material (call before `excludeDirectionalLight`, or after: both chain). World position and normal
 * go through `modelMatrix`, so any mesh transform is honoured.
 */
export function installVoidLight(mat: THREE.MeshStandardMaterial, sources: VoidLightSources, tag: string): void {
  install(mat, () => glsl(sources), tag);
}

let shared: VoidLightSources | null = null;
/** The void shell registers its sources here; materials made elsewhere (escalators) install them lazily at first compile. */
export function setSharedVoidLight(s: VoidLightSources): void { shared = s; }
export function installSharedVoidLight(mat: THREE.MeshStandardMaterial, tag: string): void {
  install(mat, () => { if (!shared) throw new Error('voidLight: shared sources not set before first compile'); return glsl(shared); }, tag);
}

function install(mat: THREE.MeshStandardMaterial, getCode: () => string, tag: string): void {
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    const code = getCode();
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vVoidW;\nvarying vec3 vVoidN;\nvoid main() {')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vVoidW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vVoidN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${code}\nvoid main() {`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * voidLight(vVoidW, normalize(vVoidN) * (gl_FrontFacing ? 1.0 : -1.0));');
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|voidLight:${tag}`;
}
