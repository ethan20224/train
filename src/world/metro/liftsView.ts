import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { HALCYON, LIFTS, SKY, VESPER } from '../../layoutMetro';
import { excludeDirectionalLight } from '../../lighting/sunMask';
import { LIFT_KINEMATICS, LIFT_STOPS, liftCallButtonPos, liftDoorDir, lifts, type LiftStop } from '../../metro/lifts';
import { boxMM, latheMeters, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import { vertexGlow } from './glow';
import type { MetroMaterials } from './materials';

/**
 * Twin glass capsule lifts (spec §2.6, P3-8a):
 * - Both cabins live in `metroVoid` (both-zone movers: sun-masked, env swapped at the -16 airlock via `bothZoneMaterials`),
 *   total 6 instanced draw calls for both cabins combined:
 *     1. liftCabinFrame       (2 inst: champagne rings/mullions, dark deck, stainless under-bowl/handrail/yoke, warm ceiling halo)
 *     2. liftCabinGlass       (2 inst: 304 deg panoramic ultra-clear curved glass cylinder)
 *     3. liftCabinDoorFrames  (4 inst: slim champagne top/bottom/stile rails on curved bi-parting cabin doors)
 *     4. liftCabinDoorGlass   (4 inst: curved ultra-clear sliding cabin door leaves)
 *     5. liftDepthDial        (2 inst: backlit white-onyx 0 -> -82 m depth gauge dial + 3 floor buttons with live current highlight)
 *     6. liftDepthNeedle      (2 inst: brushed stainless/champagne depth pointer tracking real-time y)
 * - Deep tubes (-82 .. -32) & deep landing doors (-70, -82) live in `metroDeep` (4 draw calls total, replacing greybox cylinders).
 */

const TAU = Math.PI * 2;
const UP = v3(0, 1, 0);
const CABIN_H = 2.66;
const DOOR_H = 2.45;
const DOOR_HALF = LIFT_KINEMATICS.doorHalfAngle; // 28 deg
const PANEL_PHI = LIFT_KINEMATICS.panelAngleOffset; // -0.64 rad
const DIAL_R = 0.145;
const DIAL_Y = LIFT_KINEMATICS.dialHeight; // 1.72 m

const _mCabin = new THREE.Matrix4();
const _mRot = new THREE.Matrix4();
const _mTrans = new THREE.Matrix4();
const _mDoor = new THREE.Matrix4();
const _mNeedle = new THREE.Matrix4();
const _mNeedleRot = new THREE.Matrix4();

type RGB = readonly [number, number, number];

function cleanGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(out.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
  }
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) {
    const n = out.getAttribute('position').count;
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return out;
}

function tintGeo(g: THREE.BufferGeometry, rgb: RGB): THREE.BufferGeometry {
  const out = cleanGeo(g);
  const n = out.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = rgb[0];
    col[i * 3 + 1] = rgb[1];
    col[i * 3 + 2] = rgb[2];
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** Curved horizontal arc-strip solid around Y axis at radius r, thickness t, height y0..y1, azimuth a0..a1 (atan2(z,x)). */
function arcStrip(r: number, t: number, y0: number, y1: number, a0: number, a1: number, segs: number): THREE.BufferGeometry {
  const prof: P2[] = [[-t / 2, y0], [t / 2, y0], [t / 2, y1], [-t / 2, y1]];
  const frames: Frame[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    const rad = v3(Math.cos(a), 0, Math.sin(a));
    frames.push({ o: v3(r * rad.x, 0, r * rad.z), a: rad, b: UP.clone() });
  }
  return sweep(prof, frames, { closed: true, caps: true });
}

/** Open single-sheet cylindrical arc surface (zero self-overdraw) at radius r, height y0..y1, azimuth a0..a1. */
function arcGlassSheet(r: number, y0: number, y1: number, a0: number, a1: number, segs: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const phi0 = a0 + (a1 - a0) * t0;
    const phi1 = a0 + (a1 - a0) * t1;
    const x0 = r * Math.cos(phi0), z0 = r * Math.sin(phi0);
    const x1 = r * Math.cos(phi1), z1 = r * Math.sin(phi1);
    // Outward normal: (x0,z0) -> (x0,y1,z0) -> (x1,y1,z1) ... verify cross product:
    // Tangent +phi = (-sin, 0, cos), +Y = (0, 1, 0), (+Y) x (+phi) = (cos, 0, sin) = outward radial!
    pos.push(
      x0, y0, z0, x0, y1, z0, x1, y1, z1,
      x0, y0, z0, x1, y1, z1, x1, y0, z1,
    );
    uvs.push(t0, 0, t0, 1, t1, 1, t0, 0, t1, 1, t1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Clockwise angle from 12 o'clock (rad) for cabin elevation y (0 m = -135 deg, -82 m = +135 deg). */
function dialCwAngle(y: number): number {
  const frac = Math.min(1, Math.max(0, -y / 82));
  return ((-135 + frac * 270) * Math.PI) / 180;
}

/** Procedural 512x512 backlit white-onyx depth gauge dial (top half) + 3 floor button faces (bottom half). */
function makeDialTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;

  // Soft translucent alabaster white-onyx base with faint warm mineral clouding & delicate veining
  const bg = g.createRadialGradient(S * 0.5, S * 0.25, 16, S * 0.5, S * 0.25, S * 0.52);
  bg.addColorStop(0, '#fcfaf3');
  bg.addColorStop(0.7, '#f4efe3');
  bg.addColorStop(1, '#e8e0cf');
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);

  // Delicate translucent warm onyx veins across the stone background
  g.save();
  g.strokeStyle = 'rgba(182, 166, 140, 0.22)';
  g.lineWidth = 2.2;
  for (let v = 0; v < 7; v++) {
    g.beginPath();
    let y = 30 + v * 72;
    g.moveTo(0, y);
    for (let x = 24; x <= S; x += 24) {
      y += Math.sin(x * 0.025 + v * 1.7) * 7 + Math.cos(x * 0.011 - v) * 4;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();

  // ---- Top half (y: 0..256): Analog White Onyx Depth Gauge (0 -> -82 m) ----
  const cx = 256, cy = 128, R = 114;
  // Subtle brushed-steel outer hairline track
  g.strokeStyle = 'rgba(42, 48, 56, 0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.stroke();

  g.strokeStyle = 'rgba(42, 48, 56, 0.16)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, R - 20, 0, TAU);
  g.stroke();

  // Graduated depth ticks every 2 m (0 .. 82)
  const stopDepths = new Set([0, 30, 70, 82]);
  for (let d = 0; d <= 82; d += 2) {
    const cw = dialCwAngle(-d);
    const sin = Math.sin(cw), cos = Math.cos(cw);
    const isStop = stopDepths.has(d);
    const isMajor = d % 10 === 0 || isStop;
    const rOut = R - 5;
    const rIn = isStop ? R - 22 : isMajor ? R - 16 : R - 10;
    g.strokeStyle = isStop ? '#1d242c' : isMajor ? '#3f4852' : 'rgba(63, 72, 82, 0.45)';
    g.lineWidth = isStop ? 3.2 : isMajor ? 2.0 : 1.1;
    g.beginPath();
    g.moveTo(cx + rIn * sin, cy - rIn * cos);
    g.lineTo(cx + rOut * sin, cy - rOut * cos);
    g.stroke();
  }

  // Stop labels & numerals on dial face
  g.fillStyle = '#1b2128';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const marks: Array<{ d: number; num: string; sub?: string }> = [
    { d: 0, num: '0' },
    { d: 30, num: '−30', sub: 'THR' },
    { d: 70, num: '−70', sub: 'CRS' },
    { d: 82, num: '−82', sub: 'HLC' },
  ];
  for (const m of marks) {
    const cw = dialCwAngle(-m.d);
    const sin = Math.sin(cw), cos = Math.cos(cw);
    const rNum = R - 38;
    g.font = '600 18px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.fillStyle = '#181e25';
    g.fillText(m.num, cx + rNum * sin, cy - rNum * cos);
    if (m.sub) {
      const rSub = R - 56;
      g.font = '500 9.5px "Helvetica Neue", Helvetica, Arial, sans-serif';
      g.fillStyle = 'rgba(40, 48, 58, 0.72)';
      g.fillText(m.sub, cx + rSub * sin, cy - rSub * cos);
    }
  }
  g.font = '500 10px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillStyle = 'rgba(42, 50, 60, 0.65)';
  g.fillText('DEPTH · M', cx, cy + 46);
  g.font = '500 8.5px "Helvetica Neue", Helvetica, Arial, sans-serif';
  g.fillText('MERIDIAN DEEP', cx, cy + 62);

  // ---- Bottom half (y: 256..512): 3 backlit white-onyx floor button faceplates ----
  // UV v = 1 - y/512:
  //   Band 0 (Threshold -30): y 256..341 -> v 0.333..0.500
  //   Band 1 (Crossing  -70): y 341..426 -> v 0.167..0.333
  //   Band 2 (Halcyon   -82): y 426..512 -> v 0.000..0.167
  const bands: Array<{ num: string; name: string; yMid: number }> = [
    { num: '−30', name: 'THRESHOLD', yMid: 298.5 },
    { num: '−70', name: 'CROSSING', yMid: 383.5 },
    { num: '−82', name: 'HALCYON', yMid: 469.0 },
  ];
  for (const b of bands) {
    // Crisp dark graphite halo ring + numeral centred in band (x = 256)
    g.strokeStyle = 'rgba(42, 48, 56, 0.38)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(256, b.yMid, 36, 0, TAU);
    g.stroke();

    g.fillStyle = '#181e25';
    g.font = '600 22px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.fillText(b.num, 256, b.yMid - 5);
    g.font = '500 9.5px "Helvetica Neue", Helvetica, Arial, sans-serif';
    g.fillStyle = 'rgba(38, 46, 56, 0.78)';
    g.fillText(b.name, 256, b.yMid + 14);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

/** Add a flat disc facing `normal` with `right` & `up` axes and custom UV window [u0..u1, v0..v1]. */
function orientedDisc(
  centre: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, radius: number, segs: number,
  u0: number, u1: number, v0: number, v1: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const uc = (u0 + u1) * 0.5, vc = (v0 + v1) * 0.5;
  const ur = (u1 - u0) * 0.5, vr = (v1 - v0) * 0.5;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p0x = centre.x + right.x * c0 * radius + up.x * s0 * radius;
    const p0y = centre.y + right.y * c0 * radius + up.y * s0 * radius;
    const p0z = centre.z + right.z * c0 * radius + up.z * s0 * radius;
    const p1x = centre.x + right.x * c1 * radius + up.x * s1 * radius;
    const p1y = centre.y + right.y * c1 * radius + up.y * s1 * radius;
    const p1z = centre.z + right.z * c1 * radius + up.z * s1 * radius;
    pos.push(centre.x, centre.y, centre.z, p0x, p0y, p0z, p1x, p1y, p1z);
    uvs.push(uc, vc, uc + c0 * ur, vc + s0 * vr, uc + c1 * ur, vc + s1 * vr);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Build one curved door leaf prototype spanning local azimuth [0, +DOOR_HALF] at radius `rLeaf`. */
function buildCurvedDoorLeaf(rLeaf: number, h: number, frameT = 0.024): { frame: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const topH = 0.055, botH = 0.070;
  const stileArc = 0.030 / rLeaf;
  const gapArc = 0.004 / rLeaf;
  const a0 = gapArc;
  const a1 = DOOR_HALF - gapArc;
  const segs = 8;

  const fParts = [
    cleanGeo(arcStrip(rLeaf, frameT, 0.010, 0.010 + botH, a0, a1, segs)),
    cleanGeo(arcStrip(rLeaf, frameT, h - topH, h, a0, a1, segs)),
    cleanGeo(arcStrip(rLeaf, frameT, 0.010 + botH, h - topH, a0, a0 + stileArc, 2)),
    cleanGeo(arcStrip(rLeaf, frameT, 0.010 + botH, h - topH, a1 - stileArc, a1, 2)),
  ];
  const frame = mergeGeometries(fParts, false)!;
  for (const p of fParts) p.dispose();
  frame.computeBoundingSphere();

  const glass = arcGlassSheet(rLeaf, 0.010 + botH - 0.004, h - topH + 0.004, a0 + stileArc - 0.002, a1 - stileArc + 0.002, segs);
  glass.computeBoundingSphere();
  return { frame, glass };
}

/** Both-zone ultra-clear glass with green Fresnel grazing edge + sun-masking. */
function makeBothZoneGlass(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    name: 'liftBothZoneGlass',
    color: 0xe4f2ee,
    metalness: 0,
    roughness: 0.035,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    envMapIntensity: 1.55,
    ior: 1.5,
    specularIntensity: 1,
    side: THREE.DoubleSide,
  });
  excludeDirectionalLight(m);
  const prev = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float edgeF = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.0);
       outgoingLight = mix(outgoingLight, vec3(0.30, 0.62, 0.50), edgeF * 0.45);
       diffuseColor.a = mix(diffuseColor.a, 0.58, edgeF);
       #include <opaque_fragment>`,
    );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${key()}|glassEdge`;
  return m;
}

export interface LiftsView {
  /** Both glass capsule cabins (goes in `metroVoid`, <= 6 calls). */
  voidGroup: THREE.Group;
  /** Deep glass shafts (-82 .. -32) & deep landing doors (-70, -82) (goes in `metroDeep`, 4 calls). */
  deepGroup: THREE.Group;
  /** Sun-masked cabin materials whose envMap swaps at the -16 airlock (register in `metro.userData.bothZoneMaterials`). */
  bothZoneMaterials: THREE.Material[];
  /** Deep materials owned by deepGroup (register in `metro.userData.deepMaterials`). */
  deepMaterials: THREE.Material[];
  /** Per displayed frame (real time, zero allocations). */
  update(): void;
  stats: { voidCalls: number; deepCalls: number; triangles: number };
}

export function buildLiftsView(_lib: MaterialLibrary, kit: MetroMaterials, renderer: THREE.WebGLRenderer): LiftsView {
  const voidGroup = new THREE.Group();
  voidGroup.name = 'metroLiftCabins';
  const deepGroup = new THREE.Group();
  deepGroup.name = 'metroDeepLiftTubes';

  // ---- Both-zone materials for the 2 cabins (sun-masked, env swapped at -16) ----
  const cabinMetalMat = new THREE.MeshStandardMaterial({
    name: 'liftCabinMetal',
    color: 0xffffff,
    metalness: 0.92,
    roughness: 0.28,
    envMapIntensity: 1.30,
  });
  vertexGlow(cabinMetalMat);
  excludeDirectionalLight(cabinMetalMat);

  const cabinGlassMat = makeBothZoneGlass();

  const dialTex = makeDialTexture(renderer);
  const cabinDialMat = new THREE.MeshStandardMaterial({
    name: 'liftCabinDepthDial',
    color: 0xffffff,
    map: dialTex,
    emissive: 0xffffff,
    emissiveMap: dialTex,
    emissiveIntensity: 1.0,
    roughness: 0.24,
    metalness: 0.0,
    envMapIntensity: 0.75,
  });
  excludeDirectionalLight(cabinDialMat);
  {
    const prev = cabinDialMat.onBeforeCompile.bind(cabinDialMat);
    cabinDialMat.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aLitStop;\nvarying float vLitStop;\nvarying vec2 vDialUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLitStop = aLitStop;\nvDialUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLitStop;\nvarying vec2 vDialUv;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
  if (vDialUv.y >= 0.5) {
    totalEmissiveRadiance *= 1.15;
  } else {
    float btnIdx = vDialUv.y > 0.3333 ? 0.0 : (vDialUv.y > 0.1667 ? 1.0 : 2.0);
    float lit = step(abs(btnIdx - vLitStop), 0.25);
    totalEmissiveRadiance *= mix(0.55, 2.35, lit);
  }`,
        );
    };
    const key = cabinDialMat.customProgramCacheKey.bind(cabinDialMat);
    cabinDialMat.customProgramCacheKey = () => `${key()}|liftDialLit`;
  }

  const cabinNeedleMat = new THREE.MeshStandardMaterial({
    name: 'liftCabinDepthNeedle',
    color: 0x56606b,
    metalness: 0.92,
    roughness: 0.24,
    envMapIntensity: 1.15,
  });
  excludeDirectionalLight(cabinNeedleMat);

  const bothZoneMaterials: THREE.Material[] = [cabinMetalMat, cabinGlassMat, cabinDialMat, cabinNeedleMat];

  // ---- Cabin prototype geometry (local: doorway at +X / phi = 0, floor top at y = 0) ----
  const R = LIFTS.cabinR; // 1.20
  const CHAMP: RGB = [0.84, 0.76, 0.62];
  const STEEL: RGB = [0.80, 0.84, 0.88];
  const DARK_DECK: RGB = [0.16, 0.175, 0.20];
  const WARM_GLOW: RGB = [2.65, 2.10, 1.48];
  const FLOOR_GLOW: RGB = [1.55, 1.28, 0.96];

  const frameParts: THREE.BufferGeometry[] = [];
  const addFrame = (g: THREE.BufferGeometry, rgb: RGB): void => { frameParts.push(tintGeo(g, rgb)); };

  // Sculpted champagne floor ring + stainless tapered under-chassis bowl
  const floorRingProf: P2[] = [
    [1.04, 0.0], [R, 0.0], [R, -0.02], [R, -0.14], [R - 0.04, -0.17], [1.04, -0.17],
  ];
  addFrame(latheMeters(floorRingProf, 48, 1, 1), CHAMP);
  const underBowlProf: P2[] = [
    [0.0, -0.34], [0.22, -0.34], [0.46, -0.29], [0.96, -0.22], [R - 0.04, -0.17], [0.0, -0.17],
  ];
  addFrame(latheMeters(underBowlProf, 48, 1, 1), STEEL);
  // Recessed dark-graphite circular floor deck + slim stainless inlay ring
  const floorDisc = new THREE.CylinderGeometry(1.045, 1.045, 0.03, 48);
  floorDisc.translate(0, -0.015, 0);
  addFrame(floorDisc, DARK_DECK);
  addFrame(arcStrip(1.04, 0.018, 0.0, 0.004, 0, TAU, 48), STEEL);
  // Subtle warm recessed floor-kick micro-cove around outer 304 deg (clear of doorway)
  addFrame(arcStrip(1.135, 0.014, 0.004, 0.014, DOOR_HALF + 0.04, TAU - DOOR_HALF - 0.04, 40), FLOOR_GLOW);

  // Sculpted champagne ceiling ring + stainless suspension roof crown & yoke
  const ceilRingProf: P2[] = [
    [0.98, CABIN_H], [R, CABIN_H], [R, CABIN_H + 0.16], [R - 0.05, CABIN_H + 0.20], [0.96, CABIN_H + 0.20], [0.96, CABIN_H + 0.02],
  ];
  addFrame(latheMeters(ceilRingProf, 48, 1, 1), CHAMP);
  const roofCapProf: P2[] = [
    [0.0, CABIN_H + 0.28], [0.22, CABIN_H + 0.28], [0.60, CABIN_H + 0.23], [0.98, CABIN_H + 0.20], [0.98, CABIN_H + 0.02], [0.0, CABIN_H + 0.02],
  ];
  addFrame(latheMeters(roofCapProf, 48, 1, 1), STEEL);
  // Overhead cable suspension yoke on roof crown
  const yoke = new THREE.CylinderGeometry(0.08, 0.12, 0.14, 16);
  yoke.translate(0, CABIN_H + 0.34, 0);
  addFrame(yoke, STEEL);
  // Soft warm 3200 K recessed ceiling downlight halo ring (emissive via vertexGlow)
  const haloRing = new THREE.RingGeometry(0.82, 0.94, 48);
  haloRing.rotateX(Math.PI / 2); // faces straight down into cabin
  haloRing.translate(0, CABIN_H + 0.015, 0);
  addFrame(haloRing, WARM_GLOW);
  const centerGlow = new THREE.CircleGeometry(0.24, 32);
  centerGlow.rotateX(Math.PI / 2);
  centerGlow.translate(0, CABIN_H + 0.016, 0);
  addFrame(centerGlow, WARM_GLOW);

  // Slim structural champagne mullions flanking doorway (±30 deg) & rear (±145 deg), plus sleek transom bar above door
  const mullionAngles = [DOOR_HALF + 0.03, -DOOR_HALF - 0.03, 2.53, -2.53];
  for (const ma of mullionAngles) {
    addFrame(arcStrip(R - 0.022, 0.044, 0.0, CABIN_H, ma - 0.018, ma + 0.018, 2), CHAMP);
  }
  addFrame(arcStrip(R - 0.022, 0.048, DOOR_H, CABIN_H, -DOOR_HALF - 0.04, DOOR_HALF + 0.04, 12), CHAMP);

  // Sleek champagne control & depth-gauge mullion column at PANEL_PHI (-0.64 rad, right beside doorway inside cabin)
  // Outer flush at R (1.20), thickness 0.034 -> inner flat mounting surface cleanly at r = 1.166 m
  const panelSpan = 0.145; // ~0.34 m arc width housing the 29 cm white-onyx dial + 3 buttons cleanly
  const panelInnerR = R - 0.034; // 1.166 m
  addFrame(arcStrip(R - 0.017, 0.034, 0.0, CABIN_H, PANEL_PHI - panelSpan, PANEL_PHI + panelSpan, 6), CHAMP);

  // Curved brushed-stainless interior handrail anchored cleanly into the flanking mullions (zero floating tips)
  const railA0 = DOOR_HALF + 0.03;
  const railA1 = TAU + PANEL_PHI - panelSpan;
  addFrame(arcStrip(R - 0.085, 0.026, 0.945, 0.975, railA0, railA1, 40), STEEL);
  for (const sa of [railA0 + 0.01, Math.PI * 0.62, Math.PI, -Math.PI * 0.62, railA1 - 0.01]) {
    const cx = Math.cos(sa), sz = Math.sin(sa);
    const pin = new THREE.BoxGeometry(0.085, 0.022, 0.022);
    pin.rotateY(-sa);
    pin.translate((R - 0.048) * cx, 0.96, (R - 0.048) * sz);
    addFrame(pin, STEEL);
  }

  // Control panel basis vectors (inward normal N toward cabin centre, right R = (-N) x UP)
  const pCos = Math.cos(PANEL_PHI), pSin = Math.sin(PANEL_PHI);
  const panelN = v3(-pCos, 0, -pSin);
  const panelR = v3(-pSin, 0, pCos);
  const panelBasis = new THREE.Matrix4().makeBasis(panelR, UP, panelN);

  // Chamfered brushed-stainless bezel rings proud on the inner face of the control mullion (panelInnerR -> panelInnerR - 0.018)
  const makeBezel = (rInner: number, rOuter: number, depth: number, yCenter: number): THREE.BufferGeometry => {
    const prof: P2[] = [[rInner, 0], [rOuter, 0], [rOuter, depth], [rInner + 0.004, depth + 0.004], [rInner, depth]];
    const g = latheMeters(prof, 36, 1, 1);
    g.rotateX(Math.PI / 2); // axis along +Z -> aligned with inward normal panelN via panelBasis
    const m = new THREE.Matrix4().makeTranslation(panelInnerR * pCos, yCenter, panelInnerR * pSin).multiply(panelBasis);
    g.applyMatrix4(m);
    return g;
  };
  addFrame(makeBezel(DIAL_R - 0.002, DIAL_R + 0.016, 0.018, DIAL_Y), STEEL);
  for (const by of LIFT_KINEMATICS.floorButtonHeights) {
    addFrame(makeBezel(0.044, 0.055, 0.014, by), STEEL);
  }

  const cabinFrameGeo = mergeGeometries(frameParts, false)!;
  for (const p of frameParts) p.dispose();
  cabinFrameGeo.computeBoundingSphere();

  // Panoramic curved glass wall (304 deg outside ±DOOR_HALF)
  const cabinGlassGeo = arcGlassSheet(R - 0.015, 0.015, CABIN_H - 0.01, DOOR_HALF + 0.01, TAU - DOOR_HALF - 0.01, 44);
  cabinGlassGeo.computeBoundingSphere();

  // Curved bi-parting cabin door prototype (slides concentrically at r = R - 0.055)
  const cabinDoorProto = buildCurvedDoorLeaf(R - 0.055, DOOR_H, 0.022);
  const cabinDoorFrameGeo = tintGeo(cabinDoorProto.frame, CHAMP);
  cabinDoorProto.frame.dispose();

  // White onyx depth gauge dial + 3 floor button faceplates proud in front of control mullion (r = panelInnerR - 0.014 = 1.152 m)
  const dialFaceR = panelInnerR - 0.014;
  const dialParts: THREE.BufferGeometry[] = [
    orientedDisc(v3(dialFaceR * pCos, DIAL_Y, dialFaceR * pSin), panelR, UP, DIAL_R, 36, 0.275, 0.725, 0.525, 0.975),
    // Band 0 (Threshold -30): v 0.333..0.500 -> disc radius in UV = 0.072
    orientedDisc(v3(dialFaceR * pCos, LIFT_KINEMATICS.floorButtonHeights[0], dialFaceR * pSin), panelR, UP, 0.044, 24, 0.428, 0.572, 0.345, 0.489),
    // Band 1 (Crossing -70): v 0.167..0.333
    orientedDisc(v3(dialFaceR * pCos, LIFT_KINEMATICS.floorButtonHeights[1], dialFaceR * pSin), panelR, UP, 0.044, 24, 0.428, 0.572, 0.179, 0.323),
    // Band 2 (Halcyon -82): v 0.000..0.167
    orientedDisc(v3(dialFaceR * pCos, LIFT_KINEMATICS.floorButtonHeights[2], dialFaceR * pSin), panelR, UP, 0.044, 24, 0.428, 0.572, 0.012, 0.156),
  ];
  const dialGeo = mergeGeometries(dialParts, false)!;
  for (const p of dialParts) p.dispose();
  dialGeo.computeBoundingSphere();
  const litStopArray = new Float32Array([-1, -1]);
  const litStopAttr = new THREE.InstancedBufferAttribute(litStopArray, 1);
  dialGeo.setAttribute('aLitStop', litStopAttr);

  // Tapered brushed-stainless/champagne depth gauge needle (local: pointing +Y, face +Z)
  const needleParts: THREE.BufferGeometry[] = [];
  {
    const shape = new THREE.Shape([
      new THREE.Vector2(-0.0055, -0.026),
      new THREE.Vector2(0.0055, -0.026),
      new THREE.Vector2(0.0022, 0.108),
      new THREE.Vector2(0.0, 0.118),
      new THREE.Vector2(-0.0022, 0.108),
    ]);
    const ptr = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false });
    needleParts.push(cleanGeo(ptr));
    const cap = new THREE.CylinderGeometry(0.012, 0.014, 0.009, 16);
    cap.rotateX(Math.PI / 2);
    cap.translate(0, 0, 0.0045);
    needleParts.push(cleanGeo(cap));
  }
  const needleGeo = mergeGeometries(needleParts, false)!;
  for (const p of needleParts) p.dispose();
  needleGeo.computeBoundingSphere();

  // ---- 6 InstancedMeshes in metroVoid (EXACTLY 6 draw calls for both cabins combined!) ----
  const bigBound = new THREE.Sphere(new THREE.Vector3(-17, -55, 77), 40);
  const mkInst = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, name: string, order = 0): THREE.InstancedMesh => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.name = name;
    m.renderOrder = order;
    m.userData.noShadow = true;
    m.boundingSphere = bigBound.clone();
    m.frustumCulled = false; // dynamic vertical bounds across -30 .. -82
    voidGroup.add(m);
    return m;
  };

  const cabinFrameMesh = mkInst(cabinFrameGeo, cabinMetalMat, 2, 'liftCabinFrame', 0);
  const cabinGlassMesh = mkInst(cabinGlassGeo, cabinGlassMat, 2, 'liftCabinGlass', 2);
  const cabinDoorFrameMesh = mkInst(cabinDoorFrameGeo, cabinMetalMat, 4, 'liftCabinDoorFrames', 0);
  const cabinDoorGlassMesh = mkInst(cabinDoorProto.glass, cabinGlassMat, 4, 'liftCabinDoorGlass', 2);
  const cabinDialMesh = mkInst(dialGeo, cabinDialMat, 2, 'liftDepthDial', 0);
  const cabinNeedleMesh = mkInst(needleGeo, cabinNeedleMat, 2, 'liftDepthNeedle', 0);

  // ============================================================================================================
  // Deep-group static lift tubes (-82 .. -32) + deep landing doors (-70, -82) — 4 draw calls total in metroDeep
  // ============================================================================================================
  const tubeStainlessMat = kit.deep.stainless.clone();
  tubeStainlessMat.name = 'metroDeepLiftTubeStainless';
  tubeStainlessMat.color.set(0xd2d8de);
  tubeStainlessMat.roughness = 0.26;
  tubeStainlessMat.envMapIntensity = 1.25;
  vertexGlow(tubeStainlessMat);

  const deepDoorStainlessMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepLiftDoorStainless',
    color: 0xd0d6dc,
    metalness: 1.0,
    roughness: 0.24,
    envMapIntensity: 1.25,
  });

  const deepMaterials: THREE.Material[] = [tubeStainlessMat, deepDoorStainlessMat];

  const tubeMetalParts: THREE.BufferGeometry[] = [];
  const tubeGlassParts: THREE.BufferGeometry[] = [];
  const addTubeMetal = (g: THREE.BufferGeometry, rgb: RGB = [1, 1, 1]): void => { tubeMetalParts.push(tintGeo(g, rgb)); };
  const addTubeGlass = (g: THREE.BufferGeometry): void => { tubeGlassParts.push(cleanGeo(g)); };

  const RT = LIFTS.tubeR; // 1.40
  const yBot = HALCYON.topY; // -82
  const yTop = SKY.y; // -32
  const CALL_GLOW: RGB = [2.4, 1.95, 1.45];
  // Guide-rail angles guaranteed clear of all 3 doorways on each tube
  const guideRailAngles: ReadonlyArray<readonly number[]> = [
    [(68 * Math.PI) / 180, (-145 * Math.PI) / 180, (-65 * Math.PI) / 180], // Lift 0 (doors at 0°, 135°)
    [(65 * Math.PI) / 180, Math.PI, (-115 * Math.PI) / 180],                // Lift 1 (doors at -19.4°, 0°, -45°)
  ];

  // Deep doorway spans on each tube: Crossing (-70) and Halcyon (-82)
  const deepDoorStops: readonly LiftStop[] = [1, 2];

  for (let i = 0; i < LIFTS.positions.length; i++) {
    const [lx, lz] = LIFTS.positions[i]!;
    const T = (g: THREE.BufferGeometry): THREE.BufferGeometry => { g.translate(lx, 0, lz); return g; };

    // 1. Vertical glass segments split at the two deep doorways (-82..-79.55 and -70..-67.55)
    const d82 = liftDoorDir(i, 2).angle;
    const d70 = liftDoorDir(i, 1).angle;
    // -82 .. -82 + DOOR_H: open across d82 ± DOOR_HALF
    addTubeGlass(T(arcGlassSheet(RT, yBot, yBot + DOOR_H, d82 + DOOR_HALF, d82 + TAU - DOOR_HALF, 42)));
    // -82 + DOOR_H .. -70: full 360 cylinder
    addTubeGlass(T(arcGlassSheet(RT, yBot + DOOR_H, VESPER.topY, 0, TAU, 48)));
    // -70 .. -70 + DOOR_H: open across d70 ± DOOR_HALF
    addTubeGlass(T(arcGlassSheet(RT, VESPER.topY, VESPER.topY + DOOR_H, d70 + DOOR_HALF, d70 + TAU - DOOR_HALF, 42)));
    // -70 + DOOR_H .. -32: full 360 cylinder up to sky slot
    addTubeGlass(T(arcGlassSheet(RT, VESPER.topY + DOOR_H, yTop, 0, TAU, 48)));

    // 2. Slim brushed-stainless structural rings every 3.0 m (-82 .. -32), split cleanly across any doorway height
    for (let y = yBot + 1.5; y <= yTop - 0.4; y += 3.0) {
      let cutAngle: number | null = null;
      if (y >= yBot - 0.1 && y <= yBot + DOOR_H + 0.08) cutAngle = d82;
      else if (y >= VESPER.topY - 0.1 && y <= VESPER.topY + DOOR_H + 0.08) cutAngle = d70;
      if (cutAngle !== null) {
        addTubeMetal(T(arcStrip(RT + 0.022, 0.044, y - 0.022, y + 0.022, cutAngle + DOOR_HALF, cutAngle + TAU - DOOR_HALF, 40)));
      } else {
        addTubeMetal(T(arcStrip(RT + 0.022, 0.044, y - 0.022, y + 0.022, 0, TAU, 48)));
      }
    }

    // 3. Three slim brushed-stainless vertical guide rails (-82 .. -32), clear of all doorways
    const railH = yTop - yBot;
    for (const ga of guideRailAngles[i]!) {
      const rail = new THREE.CylinderGeometry(0.022, 0.022, railH, 8);
      rail.translate(lx + (RT + 0.024) * Math.cos(ga), (yBot + yTop) / 2, lz + (RT + 0.024) * Math.sin(ga));
      addTubeMetal(rail);
    }

    // 4. Lower buffer collar below Halcyon island (-83.5 .. -82.0)
    const pit = new THREE.CylinderGeometry(RT + 0.04, RT + 0.04, 1.5, 36, 1, true);
    pit.translate(lx, yBot - 0.75, lz);
    addTubeMetal(pit, [0.42, 0.45, 0.48]);

    // 5. Doorway portal frames + sleek call-button beacons at Crossing (-70) and Halcyon (-82)
    for (const s of deepDoorStops) {
      const sy = LIFT_STOPS[s]!;
      const da = liftDoorDir(i, s).angle;
      // Curved transom header + flanking jamb stiles
      addTubeMetal(T(arcStrip(RT + 0.015, 0.055, sy + DOOR_H, sy + DOOR_H + 0.065, da - DOOR_HALF - 0.03, da + DOOR_HALF + 0.03, 12)));
      addTubeMetal(T(arcStrip(RT + 0.015, 0.055, sy, sy + DOOR_H, da - DOOR_HALF - 0.025, da - DOOR_HALF + 0.005, 2)));
      addTubeMetal(T(arcStrip(RT + 0.015, 0.055, sy, sy + DOOR_H, da + DOOR_HALF - 0.005, da + DOOR_HALF + 0.025, 2)));
      // Sleek call-button housing + warm backlit indicator disc at exact liftCallButtonPos(i, s)
      const bp = liftCallButtonPos(i, s);
      const bAng = Math.atan2(bp.nz, bp.nx);
      const housing = boxMM(-0.03, -0.10, -0.05, 0.03, 0.10, 0.05);
      housing.rotateY(-bAng);
      housing.translate(bp.x - bp.nx * 0.02, bp.y, bp.z - bp.nz * 0.02);
      addTubeMetal(housing, [0.82, 0.85, 0.88]);
      const led = new THREE.CylinderGeometry(0.026, 0.026, 0.014, 16);
      led.rotateZ(Math.PI / 2);
      led.rotateY(-bAng);
      led.translate(bp.x + bp.nx * 0.014, bp.y, bp.z + bp.nz * 0.014);
      addTubeMetal(led, CALL_GLOW);
    }
  }

  const deepTubeMetalGeo = mergeGeometries(tubeMetalParts, false)!;
  for (const p of tubeMetalParts) p.dispose();
  deepTubeMetalGeo.computeBoundingSphere();
  const deepTubeMetalMesh = new THREE.Mesh(deepTubeMetalGeo, tubeStainlessMat);
  deepTubeMetalMesh.name = 'deepLiftTubeMetal';
  deepTubeMetalMesh.userData.noShadow = true;
  deepGroup.add(deepTubeMetalMesh);

  const deepTubeGlassGeo = mergeGeometries(tubeGlassParts, false)!;
  for (const p of tubeGlassParts) p.dispose();
  deepTubeGlassGeo.computeBoundingSphere();
  const deepTubeGlassMesh = new THREE.Mesh(deepTubeGlassGeo, kit.deep.glass);
  deepTubeGlassMesh.name = 'deepLiftTubeGlass';
  deepTubeGlassMesh.renderOrder = 3;
  deepTubeGlassMesh.userData.noShadow = true;
  deepGroup.add(deepTubeGlassMesh);

  // Deep landing sliding doors (2 lifts x 2 deep stops x 2 curved bi-parting leaves = 8 instances)
  const deepDoorProto = buildCurvedDoorLeaf(RT - 0.035, DOOR_H, 0.024);
  const deepDoorFrameMesh = new THREE.InstancedMesh(deepDoorProto.frame, deepDoorStainlessMat, 8);
  deepDoorFrameMesh.name = 'deepLiftLandingDoorFrames';
  deepDoorFrameMesh.userData.noShadow = true;
  deepDoorFrameMesh.frustumCulled = false;

  const deepDoorGlassMesh = new THREE.InstancedMesh(deepDoorProto.glass, kit.deep.glass, 8);
  deepDoorGlassMesh.name = 'deepLiftLandingDoorGlass';
  deepDoorGlassMesh.renderOrder = 3;
  deepDoorGlassMesh.userData.noShadow = true;
  deepDoorGlassMesh.frustumCulled = false;
  deepGroup.add(deepDoorFrameMesh, deepDoorGlassMesh);

  // Precompute needle local mount transform in cabin space (before cabin world translation & doorAngle rotation)
  const needleOffsetX = (dialFaceR - 0.008) * pCos;
  const needleOffsetZ = (dialFaceR - 0.008) * pSin;
  const needleBaseLocal = new THREE.Matrix4().makeTranslation(needleOffsetX, DIAL_Y, needleOffsetZ).multiply(panelBasis);

  // ---- Zero-allocation per-frame update ----
  const update = (): void => {
    let litDirty = false;
    for (let i = 0; i < 2; i++) {
      const s = lifts.cabin(i);
      const ry = -s.doorAngle;

      // Cabin frame, panoramic glass, depth dial (rotated smoothly with doorAngle)
      _mTrans.makeTranslation(s.x, s.y, s.z);
      _mRot.makeRotationY(ry);
      _mCabin.multiplyMatrices(_mTrans, _mRot);
      cabinFrameMesh.setMatrixAt(i, _mCabin);
      cabinGlassMesh.setMatrixAt(i, _mCabin);
      cabinDialMesh.setMatrixAt(i, _mCabin);

      // Lit floor button highlight (docked floor lit; target stop lit while moving)
      const litVal = s.docked !== null ? s.docked : s.targetStop;
      if (litStopArray[i] !== litVal) {
        litStopArray[i] = litVal;
        litDirty = true;
      }

      // Rotating depth gauge needle (0 -> -82 m)
      const cw = dialCwAngle(s.y);
      _mNeedleRot.makeRotationZ(-cw);
      _mNeedle.multiplyMatrices(_mCabin, needleBaseLocal).multiply(_mNeedleRot);
      cabinNeedleMesh.setMatrixAt(i, _mNeedle);

      // Cabin bi-parting curved doors: leaf 0 spans [0, +DOOR_HALF] mirrored to [-DOOR_HALF, 0] via rotation -DOOR_HALF
      const slide = s.doorOpen01 * DOOR_HALF * 0.96;
      // Right leaf (+phi side): spans [0, +DOOR_HALF], slides toward +phi by +slide -> ry = -(doorAngle + slide)
      _mRot.makeRotationY(-(s.doorAngle + slide));
      _mDoor.multiplyMatrices(_mTrans, _mRot);
      cabinDoorFrameMesh.setMatrixAt(i * 2, _mDoor);
      cabinDoorGlassMesh.setMatrixAt(i * 2, _mDoor);
      // Left leaf (-phi side): spans [-DOOR_HALF, 0], slides toward -phi by -slide -> ry = -(doorAngle - DOOR_HALF - slide)
      _mRot.makeRotationY(-(s.doorAngle - DOOR_HALF - slide));
      _mDoor.multiplyMatrices(_mTrans, _mRot);
      cabinDoorFrameMesh.setMatrixAt(i * 2 + 1, _mDoor);
      cabinDoorGlassMesh.setMatrixAt(i * 2 + 1, _mDoor);

      // Deep landing doors at Crossing (-70, stop 1) and Halcyon (-82, stop 2)
      for (let dIdx = 0; dIdx < 2; dIdx++) {
        const stop = deepDoorStops[dIdx]!;
        const sy = LIFT_STOPS[stop]!;
        const da = liftDoorDir(i, stop).angle;
        const dSlide = lifts.landingDoorOpen01(i, stop) * DOOR_HALF * 0.96;
        const slot = (i * 2 + dIdx) * 2;
        _mTrans.makeTranslation(s.x, sy, s.z);

        _mRot.makeRotationY(-(da + dSlide));
        _mDoor.multiplyMatrices(_mTrans, _mRot);
        deepDoorFrameMesh.setMatrixAt(slot, _mDoor);
        deepDoorGlassMesh.setMatrixAt(slot, _mDoor);

        _mRot.makeRotationY(-(da - DOOR_HALF - dSlide));
        _mDoor.multiplyMatrices(_mTrans, _mRot);
        deepDoorFrameMesh.setMatrixAt(slot + 1, _mDoor);
        deepDoorGlassMesh.setMatrixAt(slot + 1, _mDoor);
      }
    }

    cabinFrameMesh.instanceMatrix.needsUpdate = true;
    cabinGlassMesh.instanceMatrix.needsUpdate = true;
    cabinDoorFrameMesh.instanceMatrix.needsUpdate = true;
    cabinDoorGlassMesh.instanceMatrix.needsUpdate = true;
    cabinDialMesh.instanceMatrix.needsUpdate = true;
    cabinNeedleMesh.instanceMatrix.needsUpdate = true;
    deepDoorFrameMesh.instanceMatrix.needsUpdate = true;
    deepDoorGlassMesh.instanceMatrix.needsUpdate = true;
    if (litDirty) litStopAttr.needsUpdate = true;
  };

  update();

  const tris = (g: THREE.BufferGeometry, mult = 1): number => (g.getAttribute('position').count / 3) * mult;
  const triangles =
    tris(cabinFrameGeo, 2) + tris(cabinGlassGeo, 2) + tris(cabinDoorFrameGeo, 4) +
    tris(cabinDoorProto.glass, 4) + tris(dialGeo, 2) + tris(needleGeo, 2) +
    tris(deepTubeMetalGeo) + tris(deepTubeGlassGeo) + tris(deepDoorProto.frame, 8) + tris(deepDoorProto.glass, 8);

  return {
    voidGroup,
    deepGroup,
    bothZoneMaterials,
    deepMaterials,
    update,
    stats: { voidCalls: 6, deepCalls: 4, triangles: Math.round(triangles) },
  };
}
