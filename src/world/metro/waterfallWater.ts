import * as THREE from 'three';
import { WATERFALL, WATER_WALL } from '../../layoutMetro';
import { WF_GLSL, clamp01, smoothstep, vnoise, type RockField } from './waterfallRock';

/**
 * Cascades and films of the west waterfall as ONE transparent mesh.
 *
 * Each ribbon is a strip following the rock from the top lip: it free-falls (constant x) off every lip and lands on the
 * ledge below (white aerated impact, widening spray), then runs over the rock until the next lip. Per-vertex `aW`
 * carries (age, aeration, free-fall flag, thickness): `age` is the integrated travel time from release, so the shader
 * scrolls streaks as pattern(z, uTime - age): physically correct acceleration, slow crawl on ledges, no tiling.
 */

export interface Landing { z: number; x: number; strength: number }

interface WetSource { z: Float32Array; w: Float32Array; y0: number; dy: number; weight: number }

export interface WaterBuild {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  landings: Landing[];
  /** 0..1 wetness of the rock at (z, y) from the ribbons, spray and seeps. */
  wetAt(z: number, y: number): number;
}

interface PathSpec {
  z: number; w: number; yStart: number; yEnd: number;
  mode: 'fall' | 'film'; thick: number; seed: number; cols: number;
}

const ROW_DY = 0.18;
const G = 3.4;      // scaled gravity: a 36 m drop takes ~4.6 s so the motion is legible
const X0 = WATER_WALL.x;

export function buildWater(field: RockField, uTime: { value: number }): WaterBuild {
  const yTop = WATERFALL.yTop;
  const yEnd = WATERFALL.poolY;

  const specs: PathSpec[] = [];
  WATERFALL.cascades.forEach((c, i) => {
    specs.push({ z: c.z, w: c.w, yStart: yTop, yEnd, mode: 'fall', thick: c.w > 4 ? 1.0 : 0.78, seed: i * 7.31 + 1, cols: Math.max(8, Math.round(c.w * 3.2)) });
  });
  // Thin films running over the rock between the falls (all keep clear of the bore cuts)
  const films: Array<[number, number, number, number]> = [
    [63.6, 5.2, -43, -62], [71.2, 3.0, -37, -53], [84.8, 5.2, -45, -62], [77.8, 2.6, -48, -60],
  ];
  films.forEach(([z, w, y0, y1], i) => {
    specs.push({ z, w, yStart: y0, yEnd: y1, mode: 'film', thick: 0.2, seed: 50 + i * 3.7, cols: Math.max(8, Math.round(w * 3)) });
  });

  const landings: Landing[] = [];
  const sources: WetSource[] = [];
  const geos: THREE.BufferGeometry[] = [];

  for (const sp of specs) {
    const rows = Math.round((sp.yStart - sp.yEnd) / ROW_DY) + 1;
    const cols = sp.cols;
    const pos = new Float32Array(rows * (cols + 1) * 3);
    const uv = new Float32Array(rows * (cols + 1) * 2);
    const aw = new Float32Array(rows * (cols + 1) * 4);
    const zcRow = new Float32Array(rows), wRow = new Float32Array(rows);

    let xw = 0, v = 0.7, age = 0, aer = 0.05, onRock = true, spread = 0, spreadT = 0, freeDist = 0, aerT = 0;
    for (let r = 0; r < rows; r++) {
      const y = sp.yStart - r * ROW_DY;
      const drop = sp.yStart - y;
      const zc = sp.z + 0.45 * Math.sin(drop * 0.17 + sp.seed) + 0.5 * (vnoise(drop * 0.11 + sp.seed, sp.seed * 0.7) - 0.5) * 2;
      const rockX = field.depth(zc, y) + 0.03;
      let free = false;
      if (sp.mode === 'film') {
        xw = field.depth(zc, y) + 0.03;
        v = 0.45 + 0.5 * vnoise(drop * 0.3 + sp.seed, 0.4);
        age += ROW_DY / v;
        aer = 0.12 + 0.2 * vnoise(drop * 0.5 + sp.seed, 1.7);
      } else if (r === 0) {
        xw = rockX;
      } else {
        const rockTol = onRock ? 0.02 : 0.0;
        if (rockX >= xw - rockTol) {
          if (!onRock) {
            const str = clamp01(freeDist / 4);
            v *= 1 - 0.65 * str;
            aerT = Math.max(aerT, 0.3 + 0.7 * str);
            spreadT = 0.55 * str;
          }
          onRock = true;
          freeDist = 0;
          xw = rockX;
        } else {
          onRock = false;
          free = true;
          freeDist += ROW_DY;
        }
        const g = free ? G : G * 0.5;
        const vNew = Math.sqrt(v * v + 2 * g * ROW_DY);
        const vCap = free ? 30 : 5.5;
        const v2 = Math.min(vCap, vNew);
        age += ROW_DY / (0.5 * (v + v2));
        v = v2;
        if (free) { aer = Math.min(0.32, aer + ROW_DY * 0.012); aerT = aer; }
        else { aerT = Math.max(0.2, aerT - ROW_DY * 0.3); aer += (aerT - aer) * 0.3; }
        spread += (spreadT - spread) * 0.25;
        spreadT = Math.max(0, spreadT - ROW_DY * 0.12);
      }
      const wBase = sp.w * (sp.mode === 'fall' ? 0.8 + 0.8 * Math.pow(smoothstep(0, 38, drop), 0.8) : 0.45 + 0.55 * Math.sin(Math.PI * Math.pow((drop + 0.5) / (sp.yStart - sp.yEnd + 1), 0.8))) * (0.86 + 0.28 * vnoise(drop * 0.17 + sp.seed, 3.3));
      const w = wBase * (1 + 0.5 * spread);
      zcRow[r] = zc; wRow[r] = w;
      for (let c = 0; c <= cols; c++) {
        const s = c / cols;
        const z = zc + (s - 0.5) * w;
        const dRock = field.depth(z, y) + 0.03;
        const x = sp.mode === 'film' ? dRock : (onRock ? dRock : Math.max(xw, dRock));
        const vi = r * (cols + 1) + c;
        pos[vi * 3] = X0 + x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z;
        uv[vi * 2] = s; uv[vi * 2 + 1] = drop;
        aw[vi * 4] = age; aw[vi * 4 + 1] = aer; aw[vi * 4 + 2] = free ? 1 : 0; aw[vi * 4 + 3] = sp.thick;
      }
    }
    if (sp.mode === 'fall') {
      landings.push({ z: zcRow[rows - 1]!, x: pos[((rows - 1) * (cols + 1) + (cols >> 1)) * 3]!, strength: clamp01(sp.w / 5) * 0.6 + 0.4 });
    }
    sources.push({ z: zcRow, w: wRow, y0: sp.yStart, dy: ROW_DY, weight: sp.mode === 'fall' ? 1 : 0.55 });

    const idx: number[] = [];
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
        // rows run downward, columns run +z: (a, b, d) faces +x
        idx.push(a, b, d, b, e, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aW', new THREE.BufferAttribute(aw, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  // mergeGeometries needs identical attribute sets: all built above share them
  const geometry = mergeIndexed(geos);
  for (const g of geos) g.dispose();

  const wetAt = (z: number, y: number): number => {
    let wet = 0;
    for (const s of sources) {
      const r = (s.y0 - y) / s.dy;
      if (r < -2 || r > s.z.length + 2) continue;
      const ri = Math.min(s.z.length - 1, Math.max(0, Math.round(r)));
      const dz = Math.abs(z - s.z[ri]!);
      const hw = s.w[ri]! * 0.5;
      const core = dz < hw ? 1 : Math.exp(-(((dz - hw) / (0.5 + 0.35 * hw)) ** 2));
      wet = Math.max(wet, core * s.weight);
    }
    // spray zone toward the base and slow seeps
    const spray = smoothstep(-58, -72, y) * 0.75;
    const seep = smoothstep(0.58, 0.8, vnoise(z * 0.28 + 31, y * 0.11)) * 0.55;
    return clamp01(Math.max(wet, spray, seep));
  };

  const material = new THREE.MeshStandardMaterial({
    name: 'metroDeepWaterfallWater',
    color: 0xffffff,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    envMapIntensity: 1.6,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUv;\nattribute vec4 aW;\nvarying vec2 vAu;\nvarying vec4 vW;\nvarying vec3 vWW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAu = aUv;\nvW = aW;\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec2 vAu;\nvarying vec4 vW;\nvarying vec3 vWW;\n${WF_GLSL}`)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        float wfPh = uTime - vW.x;
        float wfZ = vWW.z;
        float wfEdgeD = min(vAu.x, 1.0 - vAu.x);
        float wfRag = wfNoise(vec2(wfZ * 3.0, wfPh * 2.2)) - 0.5;
        float wfRag2 = wfNoise(vec2(wfZ * 8.0 + 4.0, wfPh * 3.7)) - 0.5;
        float wfEdge = smoothstep(0.0, 0.34, wfEdgeD + wfRag * 0.34 + wfRag2 * 0.16);
        float wfS1 = wfNoise(vec2(wfZ * 4.4, wfPh * 5.0));
        float wfS2 = wfNoise(vec2(wfZ * 11.0 + 17.0, wfPh * 8.5));
        float wfStreak = wfS1 * 0.6 + wfS2 * 0.4;
        float wfAer = clamp(vW.y * (0.4 + 1.1 * wfStreak), 0.0, 1.0);
        // strands: gaps open up toward the edges and drift slowly along the fall
        float wfSn = wfNoise(vec2(wfZ * 2.6 + vW.w * 13.0 + wfRag * 0.6, 0.5 + wfPh * 0.22));
        float wfGap = 0.92 - 0.55 * smoothstep(0.0, 0.5, wfEdgeD);
        float wfStrand = mix(1.0 - wfGap, 1.0, smoothstep(0.3, 0.62, wfSn));
        float wfDens = 0.45 + 0.9 * wfNoise(vec2(wfZ * 0.9 + vW.w * 5.0, wfPh * 0.9 + wfSn * 1.5));
        float wfA = (0.07 + 0.3 * vW.w) * (0.3 + 1.0 * wfStreak) * wfStrand * wfDens + wfAer * 0.5 * mix(0.35, 1.0, wfStrand);
        wfA = clamp(wfA, 0.0, 1.0) * wfEdge;
        wfA *= smoothstep(0.0, 1.8, vAu.y);
        wfA *= mix(1.0, 0.75, vW.z * (1.0 - wfAer));
        float wfFilm = 1.0 - smoothstep(0.3, 0.6, vW.w);
        vec3 wfWater = vec3(0.30, 0.44, 0.48);
        vec3 wfFoam = vec3(0.86, 0.92, 0.97);
        diffuseColor.rgb = mix(wfWater, wfFoam, clamp(wfAer * 1.05 + wfStreak * 0.15 - 0.12, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.035, 0.04), wfFilm);
        float wfFilmA = 0.3 * (0.25 + wfStreak) * mix(0.4, 1.0, wfStrand) * wfEdge * smoothstep(0.0, 2.5, vAu.y);
        diffuseColor.a = mix(wfA, wfFilmA, wfFilm);
      `)
      .replace('#include <emissivemap_fragment>', /* glsl */`
        #include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.62, 0.72, 0.82) * wfAer * wfAer * 0.26 * wfEdge;
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(0.05, 0.55, wfAer) + (1.0 - vW.w) * 0.28 * (1.0 - wfFilm), 0.04, 0.9);
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        #include <normal_fragment_maps>
        {
          float wfH = wfS1;
          normal = wfPerturb(-vViewPosition, normal, vec2(dFdx(wfH), dFdy(wfH)) * 1.1 * vW.w, faceDirection);
        }
      `)
      .replace('#include <dithering_fragment>', /* glsl */`
        {
          vec2 wfCell = floor(vec2(wfZ * 22.0, wfPh * 6.0));
          float wfHs = wfHash(wfCell + 3.0);
          float wfTw = step(0.988, wfHs) * smoothstep(0.2, 0.7, vW.w) * (0.5 + 0.5 * sin(uTime * 7.0 + wfHs * 60.0)) * wfEdge * smoothstep(0.0, 1.5, vAu.y);
          gl_FragColor.rgb += vec3(1.3, 1.4, 1.5) * wfTw;
          gl_FragColor.a = clamp(gl_FragColor.a + wfTw * 0.7, 0.0, 1.0);
        }
        #include <dithering_fragment>
      `);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|waterfallWater`;

  return { geometry, material, landings, wetAt };
}

function mergeIndexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.getAttribute('position').count; ni += g.index!.count; }
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'aUv', 'aW'] as const;
  for (const n of names) {
    const size = geos[0]!.getAttribute(n).itemSize;
    out.setAttribute(n, new THREE.BufferAttribute(new Float32Array(nv * size), size));
  }
  const index = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of geos) {
    for (const n of names) {
      const src = g.getAttribute(n) as THREE.BufferAttribute;
      (out.getAttribute(n) as THREE.BufferAttribute).array.set(src.array as Float32Array, vo * src.itemSize);
    }
    const gi = g.index!.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i]! + vo;
    vo += g.getAttribute('position').count;
    io += gi.length;
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}
