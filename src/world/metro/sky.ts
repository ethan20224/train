import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { CROSS_OUTLINE, DEEP_SUN, FUNICULAR, LIFTS, OCULUS, SHELL, SKY, SKY_LOOK } from '../../layoutMetro';
import { GeoBag, boxMM, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * The buried noon sky (spec §2.5, §5.6; Phase 3 task P3-2).
 *
 * Builds:
 *  - Single-sided downward-facing sky plane at y = SKY.y (-32) over the chamfered cross outline, cut for the sky hole
 *    ("eclipse"), both lift-tube slots, and the funicular slot, shaded by a CoeLux-style view-direction "window to
 *    infinity" shader (zenith blue -> grazing haze, chord-precision crisp HDR sun disc + aureole, dithered, no clouds).
 *  - 0.3 m deep polished stainless lips around the two lift-tube slots and funicular slot (the sky-hole rim lives in
 *    void.ts).
 *  - Merged invisible DoubleSide shadow casters at y = SKY.y - 0.15 for the eclipse hole, both lift slots and the
 *    funicular slot so the deep sun casts their real shadows across the Crossing floor.
 *
 * Budget: 3 draw calls (sky plane, stainless slot rims, invisible shadow casters).
 */

const SKY_DETAIL = {
  /** Sky outer edge tucks 2 cm over the reveal closure ledge (never overlapping the reveal soffit light at 4.5 cm). */
  perimeterTuck: 0.02,
  holeSegs: 96,
  liftSlotSegs: 48,
  /** Stainless slot lip radial/wall thickness and upward seal overlap behind the sky plane. */
  rimThickness: 0.045,
  rimUpSeal: 0.04,
} as const;

export interface BuriedSkyBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
}

/** Counter-clockwise chamfered cross outline matching shell.ts, offset outward by `outset` metres. */
function chamferedSkyOutline(outset: number): Array<[number, number]> {
  const n = CROSS_OUTLINE.length;
  const verts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const prev = CROSS_OUTLINE[(i - 1 + n) % n]!;
    const cur = CROSS_OUTLINE[i]!;
    const next = CROSS_OUTLINE[(i + 1) % n]!;
    const pLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const nLen = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const px = (cur[0] - prev[0]) / pLen, pz = (cur[1] - prev[1]) / pLen;
    const nx = (next[0] - cur[0]) / nLen, nz = (next[1] - cur[1]) / nLen;
    if (px * nz - pz * nx < -0.5) {
      verts.push([cur[0] - px * SHELL.chamfer, cur[1] - pz * SHELL.chamfer]);
      verts.push([cur[0] + nx * SHELL.chamfer, cur[1] + nz * SHELL.chamfer]);
    } else {
      verts.push([cur[0], cur[1]]);
    }
  }
  if (Math.abs(outset) < 1e-6) return verts;
  const m = verts.length;
  const outNormals: Array<[number, number]> = [];
  for (let i = 0; i < m; i++) {
    const a = verts[i]!, b = verts[(i + 1) % m]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
    outNormals.push([tz, -tx]);
  }
  return verts.map((v, i) => {
    const [n0x, n0z] = outNormals[(i - 1 + m) % m]!;
    const [n1x, n1z] = outNormals[i]!;
    const denom = 1 + n0x * n1x + n0z * n1z;
    return [v[0] + (outset / denom) * (n0x + n1x), v[1] + (outset / denom) * (n0z + n1z)];
  });
}

/** Clockwise hole path in (x, z) for a Shape wound CCW in (x, z) (so after rotateX(+PI/2) front faces point -Y). */
function circleHoleCW(cx: number, cz: number, r: number, n: number): THREE.Path {
  const p = new THREE.Path();
  for (let i = 0; i <= n; i++) {
    const a = -(i / n) * Math.PI * 2;
    const x = cx + r * Math.cos(a), z = cz + r * Math.sin(a);
    if (i === 0) p.moveTo(x, z); else p.lineTo(x, z);
  }
  return p;
}

function rectHoleCW(x0: number, z0: number, x1: number, z1: number): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(x0, z0); p.lineTo(x0, z1); p.lineTo(x1, z1); p.lineTo(x1, z0); p.closePath();
  return p;
}

/**
 * Live sky state (day/night + clouds, user ruling 2026-11-23), driven every displayed frame by src/lighting/looks.ts from
 * src/metro/dayNight.ts. Shared by reference with the sky shader.
 */
export const skyDynamic = {
  uTime: { value: 0 },
  uGolden: { value: 0 },
  uNight: { value: 0 },
  uSunOcc: { value: 0 },
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunDir: { value: new THREE.Vector3(...DEEP_SUN.direction).normalize() },
};

function createSkyMaterial(): THREE.ShaderMaterial {
  const L = SKY_LOOK;
  // Chord length |d - uSunDir| = 2*sin(theta/2) gives full float32 precision near dot = 1 (avoids cos() quantization).
  const chord = (deg: number): number => 2 * Math.sin(((deg * Math.PI) / 180) * 0.5);
  return new THREE.ShaderMaterial({
    name: 'metroBuriedSky',
    side: THREE.FrontSide,
    fog: false,
    depthWrite: true,
    uniforms: {
      uSunColor: { value: new THREE.Vector3(...DEEP_SUN.color) },
      uZenith: { value: new THREE.Vector3(...L.zenithColor).multiplyScalar(L.zenithGain) },
      uHorizon: { value: new THREE.Vector3(...L.horizonColor).multiplyScalar(L.horizonGain) },
      uHorizonPow: { value: L.horizonPow },
      uGrazing: { value: new THREE.Vector3(...L.grazingBandColor).multiplyScalar(L.grazingBandGain) },
      uGrazingPow: { value: L.grazingBandPow },
      uForward: { value: new THREE.Vector3(...L.forwardScatterColor).multiplyScalar(L.forwardScatterGain) },
      uForwardPow: { value: L.forwardScatterPow },
      uSunInnerChord: { value: chord(L.sunDiscInnerDeg) },
      uSunOuterChord: { value: chord(L.sunDiscOuterDeg) },
      uSunDiscGain: { value: L.sunDiscGain },
      uSunCoronaGain: { value: L.sunCoronaGain },
      uSunCoronaFalloff: { value: L.sunCoronaFalloff },
      uAureoleTightGain: { value: L.sunAureoleTightGain },
      uAureoleTightPow: { value: L.sunAureoleTightPow },
      uAureoleWideGain: { value: L.sunAureoleWideGain },
      uAureoleWidePow: { value: L.sunAureoleWidePow },
      uDither: { value: L.ditherStrength },
      ...skyDynamic,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform float uHorizonPow;
      uniform vec3 uGrazing;
      uniform float uGrazingPow;
      uniform vec3 uForward;
      uniform float uForwardPow;
      uniform float uSunInnerChord;
      uniform float uSunOuterChord;
      uniform float uSunDiscGain;
      uniform float uSunCoronaGain;
      uniform float uSunCoronaFalloff;
      uniform float uAureoleTightGain;
      uniform float uAureoleTightPow;
      uniform float uAureoleWideGain;
      uniform float uAureoleWidePow;
      uniform float uDither;
      uniform float uTime;
      uniform float uGolden;
      uniform float uNight;
      uniform float uSunOcc;
      uniform vec3 uMoonDir;
      varying vec3 vWorldPos;

      float vhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(vhash(i), vhash(i + vec2(1.0, 0.0)), f.x), mix(vhash(i + vec2(0.0, 1.0)), vhash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
        return s;
      }

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec3 delta = vWorldPos - cameraPosition;
        float len = max(length(delta), 1e-5);
        vec3 d = delta / len;
        float up = clamp(d.y, 0.0, 1.0);

        // CoeLux-style Rayleigh noon gradient: grazing pale haze -> deep noon zenith blue
        vec3 col = mix(uHorizon, uZenith, pow(up, uHorizonPow));
        // Golden hour: warm low horizon, softened zenith. Night: deep indigo.
        vec3 gold = mix(vec3(1.7, 0.78, 0.36), vec3(0.62, 0.55, 0.62), pow(up, 0.7));
        col = mix(col, gold, uGolden);
        vec3 nightCol = mix(vec3(0.020, 0.028, 0.060), vec3(0.003, 0.006, 0.020), pow(up, 0.6));
        col = mix(col, nightCol, uNight);
        // Luminous atmospheric band near grazing angles sells infinite sky depth
        col += uGrazing * pow(1.0 - up, uGrazingPow);

        float s = clamp(dot(d, uSunDir), 0.0, 1.0);
        col += uForward * pow(s, uForwardPow);

        // Chord-length solar angle for jitter-free float32 disc edge + Mie corona/aureole
        float ang = length(d - uSunDir);
        float disc = 1.0 - smoothstep(uSunInnerChord, uSunOuterChord, ang);
        float corona = uSunCoronaGain * exp(-ang * uSunCoronaFalloff);
        float aureole = uAureoleTightGain * pow(s, uAureoleTightPow) + uAureoleWideGain * pow(s, uAureoleWidePow);
        float sunVis = 1.0 - smoothstep(0.55, 0.7, uNight + uGolden * 0.0);
        vec3 sunTint = mix(uSunColor, vec3(1.0, 0.55, 0.25), uGolden);

        // Stars (night): sparse cells on a direction grid, gentle twinkle.
        vec2 sd = d.xz / (d.y + 0.35) * 260.0;
        vec2 cell = floor(sd);
        float sh = vhash(cell);
        float star = step(0.9965, sh) * smoothstep(0.5, 0.0, length(fract(sd) - 0.5)) * (0.6 + 0.4 * sin(uTime * (1.5 + sh * 3.0) + sh * 40.0));
        // Moon: crisp disc + soft halo.
        float mAng = length(d - uMoonDir);
        float moon = 1.0 - smoothstep(0.0085, 0.0105, mAng);
        vec3 nightAdd = vec3(0.85, 0.9, 1.0) * star * 2.2 + vec3(0.9, 0.94, 1.0) * (moon * 7.0 + 0.25 * exp(-mAng * 9.0));

        // Drifting clouds: a virtual cloud deck seen through the window to infinity, thickening in front of the sun when a
        // cloud passes (uSunOcc, in step with the sun dimming on the CPU).
        vec2 cuv = d.xz / max(d.y, 0.08) * 1.1 + vec2(uTime * 0.0045, uTime * 0.0021);
        float f = fbm(cuv);
        float sunPass = uSunOcc * exp(-ang * 2.6) * 0.55;
        float dens = smoothstep(0.36, 0.66, f + sunPass) * smoothstep(0.04, 0.3, d.y);
        float shade = fbm(cuv + normalize(uSunDir.xz + 1e-4) * 0.06);
        float lit = clamp(0.55 + (f - shade) * 4.0 + 0.35 * pow(s, 4.0), 0.0, 1.3);
        vec3 cDay = mix(vec3(0.62, 0.68, 0.78), vec3(1.55, 1.55, 1.52), lit);
        vec3 cGold = mix(vec3(0.40, 0.26, 0.36), vec3(1.6, 0.78, 0.48), lit);
        vec3 cNight = mix(vec3(0.010, 0.013, 0.025), vec3(0.09, 0.10, 0.14), lit) + vec3(0.25, 0.27, 0.32) * exp(-mAng * 5.0) * lit;
        vec3 cloudCol = mix(mix(cDay, cGold, uGolden), cNight, uNight);
        float cover = dens * 0.92;

        col += sunTint * (uSunDiscGain * disc + corona + aureole) * sunVis * (1.0 - cover);
        col += nightAdd * uNight * (1.0 - cover);
        col = mix(col, cloudCol, cover);

        // Triangular dither against 8-bit banding after tone mapping
        float n = hash12(gl_FragCoord.xy) - hash12(gl_FragCoord.xy + vec2(17.13, 41.71));
        col += n * uDither;
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }
    `,
  });
}

const ccw = (pts: readonly P2[]): P2[] => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...pts].reverse() : [...pts];
};

export function buildBuriedSky(lib: MaterialLibrary, kit: MetroMaterials): BuriedSkyBuild {
  const group = new THREE.Group();
  group.name = 'metroBuriedSky';
  const { cx, cz } = OCULUS;
  const liftSlotR = LIFTS.tubeR + SKY.liftSlotPad;
  const fSlot = FUNICULAR.skySlot;
  const fz0 = FUNICULAR.z - fSlot.halfZ, fz1 = FUNICULAR.z + fSlot.halfZ;

  // ---- 1. Single-sided downward-facing sky plane (y = -32) ----
  const outerPts = chamferedSkyOutline(SKY_DETAIL.perimeterTuck);
  const shape = new THREE.Shape();
  outerPts.forEach(([x, z], i) => { if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z); });
  shape.closePath();
  shape.holes.push(
    circleHoleCW(cx, cz, SKY.holeR, SKY_DETAIL.holeSegs),
    ...LIFTS.positions.map(([lx, lz]) => circleHoleCW(lx, lz, liftSlotR, SKY_DETAIL.liftSlotSegs)),
    rectHoleCW(fSlot.xMin, fz0, fSlot.xMax, fz1),
  );
  const skyGeo = new THREE.ShapeGeometry(shape, 1);
  // rotateX(+PI/2) maps (x, z, 0) -> (x, 0, z) and normal (0, 0, +1) -> (0, -1, 0) facing DOWN into the cavern.
  skyGeo.rotateX(Math.PI / 2);
  skyGeo.translate(0, SKY.y, 0);
  const skyMesh = new THREE.Mesh(skyGeo, createSkyMaterial());
  skyMesh.name = 'cavernSky';
  skyMesh.userData.noShadow = true;
  group.add(skyMesh);

  // ---- 2. Polished stainless 0.3 m rims around lift-tube slots and funicular slot (sky-hole rim lives in void.ts) ----
  const rimsBag = new GeoBag(lib, 'castIron', kit.metersPerTile.stainless);
  const rimT = SKY_DETAIL.rimThickness;
  const rimH = SKY.slotRimDepth;
  const upSeal = SKY_DETAIL.rimUpSeal;
  // Circular collars around both lift slots: bevelled bottom lip hanging 0.3 m below SKY.y
  const collarProf = ccw([
    [-upSeal, 0], [rimH - 0.02, 0], [rimH, 0.015], [rimH, rimT], [-upSeal, rimT],
  ]);
  for (const [lx, lz] of LIFTS.positions) {
    const segs = SKY_DETAIL.liftSlotSegs;
    const fr: Frame[] = [];
    for (let i = 0; i <= segs; i++) {
      const phi = (i / segs) * Math.PI * 2;
      const rad = v3(Math.cos(phi), 0, Math.sin(phi));
      fr.push({ o: v3(lx + liftSlotR * rad.x, SKY.y, lz + liftSlotR * rad.z), a: v3(0, -1, 0), b: rad });
    }
    rimsBag.add(sweep(collarProf, fr, { closed: true }));
  }
  // Rectangular stainless reveal frame around the funicular sky slot (0.3 m deep, 45 mm walls)
  const yBot = SKY.y - rimH, yTop = SKY.y + upSeal;
  rimsBag.add(boxMM(fSlot.xMin - rimT, yBot, fz0 - rimT, fSlot.xMax + rimT, yTop, fz0));
  rimsBag.add(boxMM(fSlot.xMin - rimT, yBot, fz1, fSlot.xMax + rimT, yTop, fz1 + rimT));
  rimsBag.add(boxMM(fSlot.xMin - rimT, yBot, fz0, fSlot.xMin, yTop, fz1));
  rimsBag.add(boxMM(fSlot.xMax, yBot, fz0, fSlot.xMax + rimT, yTop, fz1));

  const rimMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepSkySlotRim',
    color: 0xdbe0e4,
    metalness: 1.0,
    roughness: 0.16,
    envMapIntensity: 1.35,
  });
  const rimGeo = rimsBag.merge();
  if (rimGeo) {
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.name = 'cavernSkyRims';
    group.add(rimMesh);
  }

  // ---- 3. Invisible shadow casters (eclipse hole + two lift slots + funicular slot) ----
  // DoubleSide ensures Three.js PCF shadow pass renders them regardless of shadowSide front/back flipping.
  const casterY = SKY.y + SKY.casterOffsetY;
  const casterParts: THREE.BufferGeometry[] = [];
  const addDiscCaster = (x: number, z: number, r: number, segs: number): void => {
    const g = new THREE.CircleGeometry(r, segs);
    g.rotateX(-Math.PI / 2);
    g.translate(x, casterY, z);
    casterParts.push(g.index ? g.toNonIndexed() : g);
  };
  addDiscCaster(cx, cz, SKY.holeR, 64);
  for (const [lx, lz] of LIFTS.positions) addDiscCaster(lx, lz, liftSlotR, 32);
  const fCaster = new THREE.PlaneGeometry(fSlot.xMax - fSlot.xMin, fz1 - fz0);
  fCaster.rotateX(-Math.PI / 2);
  fCaster.translate((fSlot.xMin + fSlot.xMax) / 2, casterY, FUNICULAR.z);
  casterParts.push(fCaster.index ? fCaster.toNonIndexed() : fCaster);
  for (const g of casterParts) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  }
  const mergedCasters = mergeGeometries(casterParts, false)!;
  for (const g of casterParts) g.dispose();
  const casterMat = new THREE.MeshBasicMaterial({
    name: 'metroSkyCasters',
    colorWrite: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const castersMesh = new THREE.Mesh(mergedCasters, casterMat);
  castersMesh.name = 'cavernSkyCasters';
  castersMesh.castShadow = true;
  castersMesh.receiveShadow = false;
  castersMesh.userData.noCapture = true;
  group.add(castersMesh);

  return { group, deepMaterials: [rimMat] };
}
