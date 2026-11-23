import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { FUNICULAR, SKY, THRESHOLD, VESPER, funicularRailTopAt } from '../../layoutMetro';
import { excludeDirectionalLight } from '../../lighting/sunMask';
import { funicular } from '../../metro/funicular';
import { boxMM } from '../concourse/geo';
import { vertexGlow } from './glow';
import type { MetroMaterials } from './materials';
import { installSharedVoidLight } from './voidLight';

/**
 * Inclined glass funicular (spec §2.6, P3-8b, Ruling 37):
 * - Void group (<= 4 calls total: cabin + upper track + top station):
 *     1. funicularCabinMetal  (both-zone: level champagne glass-box frame, dark deck, warm ceiling halo, wedge stainless bogie chassis)
 *     2. funicularCabinGlass  (both-zone: panoramic end/roof/fixed glass + 4 CPU-sliding bi-parting cabin doors)
 *     3. funicularUpperMetal  (void-lit: inclined rail/rack above y = -32 + Threshold top station side decks, canopy ribs, screen frames)
 *     4. funicularUpperGlass  (void glass: top canopy, fixed screens, balustrades + 4 CPU-sliding top-station gates)
 * - Deep group (3 calls total: lower track + bottom pit + under-incline guard + bottom station):
 *     1. funicularLowerMetal  (deep: inclined twin box-rails + toothed rack below -32, bottom pit & buffers, under-incline guard rails, bottom station frames)
 *     2. funicularLowerGlass  (deep glass: under-incline guard glass, bottom station fixed screens + 4 CPU-sliding bottom gates)
 *     3. funicularBottomGateFrames (4 instanced slim champagne gate frames moving with bottom station sliding gates)
 */

type RGB = readonly [number, number, number];

const F = FUNICULAR;
const FZ = F.z; // 74
const LEN = F.cabinLength; // 4.0
const HALF_W = F.cabinWidth / 2; // 1.2
const H = F.cabinHeight; // 2.6
const SLOPE = F.slope; // ~1.22324
const ANGLE = F.slopeRad; // ~50.73 deg
const DOOR_HALF_X = 1.05; // 2.1 m clear central doorway on both +-z sides
const DOOR_H = 2.34;
const SCREEN_H = 2.6;
const PIT_Z0 = F.pit.zMin; // 72.5
const PIT_Z1 = F.pit.zMax; // 75.5

const CHAMP: RGB = [0.84, 0.76, 0.62];
const STEEL: RGB = [0.80, 0.84, 0.88];
const DARK_STEEL: RGB = [0.24, 0.27, 0.31];
const DARK_DECK: RGB = [0.16, 0.175, 0.20];
const PIT_WALL: RGB = [0.14, 0.15, 0.17];
const SMOKED_FASCIA: RGB = [0.11, 0.13, 0.16];
const WARM_GLOW: RGB = [2.6, 2.05, 1.45];
const SOFT_GLOW: RGB = [1.65, 1.35, 1.02];

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

/** Oriented 3D box strut connecting world/local points A(ax,ay,az) to B(bx,by,bz) with width (Z) `wZ` and thickness `thick` in XY. */
function strutXY(ax: number, ay: number, bx: number, by: number, z0: number, z1: number, thick: number): THREE.BufferGeometry {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  const g = new THREE.BoxGeometry(len, thick, z1 - z0);
  g.rotateZ(Math.atan2(dy, dx));
  g.translate((ax + bx) / 2, (ay + by) / 2, (z0 + z1) / 2);
  return g;
}

/** Both-zone ultra-clear glass with green grazing edge + sun-masking (shared pattern with liftsView.ts). */
function makeBothZoneGlass(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    name: 'funicularBothZoneGlass',
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

/**
 * Append inclined track geometry (twin brushed-stainless box rails + central toothed rack + cross-ties + underside truss chords)
 * between world x0 and x1 (x0 < x1). All geometry aligns to `funicularRailTopAt(x)`.
 */
function buildTrackSegment(
  x0: number, x1: number, addMetal: (g: THREE.BufferGeometry, rgb: RGB) => void,
): void {
  const y0 = funicularRailTopAt(x0);
  const y1 = funicularRailTopAt(x1);
  const beamD = F.beamDepth; // 0.55 m vertical depth below rail top
  const railZ = 0.92; // twin running rails centred at z = FZ +- 0.92 (matches wedge bogies)

  // Twin main brushed-stainless running rails + chamfered dark steel guide webs
  for (const sgn of [-1, 1] as const) {
    const rz = FZ + sgn * railZ;
    addMetal(strutXY(x0, y0 - 0.05, x1, y1 - 0.05, rz - 0.11, rz + 0.11, 0.10), STEEL);
    // Main diagonal structural girder chord underneath each rail
    addMetal(strutXY(x0, y0 - 0.24, x1, y1 - 0.24, rz - 0.08, rz + 0.08, 0.24), STEEL);
    // Lower flange chord along beam underside
    addMetal(strutXY(x0, y0 - beamD + 0.05, x1, y1 - beamD + 0.05, rz - 0.10, rz + 0.10, 0.09), DARK_STEEL);
  }
  // Subtle champagne outer fascia trim ribbons flanking the track girder
  for (const sgn of [-1, 1] as const) {
    const ez = FZ + sgn * 1.06;
    addMetal(strutXY(x0, y0 - 0.14, x1, y1 - 0.14, ez - 0.018, ez + 0.018, 0.16), CHAMP);
  }

  // Central brushed-stainless architectural box-spine fairing beneath the rack rail (reads as precision monorail beam, not a bare ladder)
  addMetal(strutXY(x0, y0 - 0.30, x1, y1 - 0.30, FZ - 0.38, FZ + 0.38, 0.30), STEEL);
  addMetal(strutXY(x0, y0 - beamD + 0.05, x1, y1 - beamD + 0.05, FZ - 0.26, FZ + 0.26, 0.08), DARK_STEEL);

  // Central toothed rack spine (brushed steel rack rail + precision machined gear teeth every 0.42 m along slope)
  addMetal(strutXY(x0, y0 - 0.10, x1, y1 - 0.10, FZ - 0.12, FZ + 0.12, 0.14), DARK_STEEL);
  const cosA = Math.cos(ANGLE), sinA = Math.sin(ANGLE);
  const sStart = (x0 - F.top[0]) / cosA;
  const sEnd = (x1 - F.top[0]) / cosA;
  const toothPitch = 0.42;
  const k0 = Math.ceil(sStart / toothPitch);
  const k1 = Math.floor(sEnd / toothPitch);
  for (let k = k0; k <= k1; k++) {
    const s = k * toothPitch;
    const tx = F.top[0] + s * cosA;
    const ty = funicularRailTopAt(tx);
    const tooth = new THREE.BoxGeometry(0.11, 0.085, 0.18);
    tooth.rotateZ(-ANGLE);
    tooth.translate(tx + sinA * 0.02, ty + cosA * 0.02 - 0.02, FZ);
    addMetal(tooth, STEEL);
  }

  // Structural cross-ties every 1.6 m along slope linking the twin girders & central rack
  const tiePitch = 1.6;
  const t0 = Math.ceil(sStart / tiePitch);
  const t1 = Math.floor(sEnd / tiePitch);
  for (let k = t0; k <= t1; k++) {
    const s = k * tiePitch;
    const tx = F.top[0] + s * cosA;
    const ty = funicularRailTopAt(tx);
    const tie = new THREE.BoxGeometry(0.14, 0.16, railZ * 2 + 0.24);
    tie.rotateZ(-ANGLE);
    tie.translate(tx - sinA * 0.26, ty - cosA * 0.26, FZ);
    addMetal(tie, STEEL);
  }
}

interface SlideLeafSpan {
  start: number;
  count: number;
  sign: -1 | 1;
}

const _mGate = new THREE.Matrix4();

export interface FunicularView {
  /** Movable cabin + upper track (above -32) + top station at -30 (goes in `metroVoid`, 4 calls). */
  voidGroup: THREE.Group;
  /** Lower track (below -32) + bottom pit + under-incline guard + bottom station (goes in `metroDeep`, 3 calls). */
  deepGroup: THREE.Group;
  /** Sun-masked cabin materials whose envMap swaps at the -16 airlock (register in `metro.userData.bothZoneMaterials`). */
  bothZoneMaterials: THREE.Material[];
  /** Deep materials owned by deepGroup (register in `metro.userData.deepMaterials`). */
  deepMaterials: THREE.Material[];
  /** Per displayed frame (real time, zero allocations). */
  update(): void;
  stats: { voidCalls: number; deepCalls: number; triangles: number };
}

export function buildFunicularView(_lib: MaterialLibrary, kit: MetroMaterials): FunicularView {
  const voidGroup = new THREE.Group();
  voidGroup.name = 'metroFunicularVoid';
  const deepGroup = new THREE.Group();
  deepGroup.name = 'metroFunicularDeep';

  // ---- Materials ----
  const cabinMetalMat = new THREE.MeshStandardMaterial({
    name: 'funicularCabinMetal',
    color: 0xffffff,
    metalness: 0.92,
    roughness: 0.28,
    envMapIntensity: 1.30,
  });
  vertexGlow(cabinMetalMat);
  excludeDirectionalLight(cabinMetalMat);

  const cabinGlassMat = makeBothZoneGlass();
  const bothZoneMaterials: THREE.Material[] = [cabinMetalMat, cabinGlassMat];

  const upperMetalMat = new THREE.MeshStandardMaterial({
    name: 'funicularUpperMetal',
    color: 0xffffff,
    metalness: 0.92,
    roughness: 0.30,
    envMapIntensity: 1.15,
  });
  vertexGlow(upperMetalMat);
  installSharedVoidLight(upperMetalMat, 'funicularUpperMetal');
  excludeDirectionalLight(upperMetalMat);

  const lowerMetalMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepFunicularMetal',
    color: 0xffffff,
    metalness: 0.90,
    roughness: 0.28,
    envMapIntensity: 1.25,
  });
  vertexGlow(lowerMetalMat);

  const bottomGateFrameMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepFunicularGateChampagne',
    color: 0xcdbb98,
    metalness: 1.0,
    roughness: 0.28,
    envMapIntensity: 1.25,
  });
  const deepMaterials: THREE.Material[] = [lowerMetalMat, bottomGateFrameMat];

  // ============================================================================================================
  // 1. MOVABLE CABIN (in voidGroup, 2 calls: funicularCabinMetal + funicularCabinGlass)
  //    Local origin: west-edge x = 0, floor top y = 0, centre z = 0 (moves to [funicular.x, funicular.y, FZ])
  // ============================================================================================================
  const cabinGroup = new THREE.Group();
  cabinGroup.name = 'funicularCabin';
  voidGroup.add(cabinGroup);

  const cMetalParts: THREE.BufferGeometry[] = [];
  const cGlassStatic: THREE.BufferGeometry[] = [];
  const cGlassDoors: THREE.BufferGeometry[] = [];
  const addCM = (g: THREE.BufferGeometry, rgb: RGB): void => { cMetalParts.push(tintGeo(g, rgb)); };

  // Level stepped floor deck: chamfered champagne outer skirt + dark-graphite floor deck + stainless doorway sills
  addCM(boxMM(0, -F.floorThickness, -HALF_W, LEN, 0.0, HALF_W), CHAMP);
  addCM(boxMM(0.08, -0.01, -HALF_W + 0.08, LEN - 0.08, 0.008, HALF_W - 0.08), DARK_DECK);
  // Subtle recessed architectural stepped perimeter plate & stainless doorway threshold sills
  for (const sgn of [-1, 1] as const) {
    const sz = sgn * (HALF_W - 0.05);
    addCM(boxMM(LEN / 2 - DOOR_HALF_X, 0.0, sz - 0.05, LEN / 2 + DOOR_HALF_X, 0.012, sz + 0.05), STEEL);
    // Warm micro floor-kick cove under fixed side panes
    addCM(boxMM(0.14, 0.01, sgn * (HALF_W - 0.08) - 0.01, LEN / 2 - DOOR_HALF_X - 0.08, 0.025, sgn * (HALF_W - 0.08) + 0.01), SOFT_GLOW);
    addCM(boxMM(LEN / 2 + DOOR_HALF_X + 0.08, 0.01, sgn * (HALF_W - 0.08) - 0.01, LEN - 0.14, 0.025, sgn * (HALF_W - 0.08) + 0.01), SOFT_GLOW);
  }

  // Sculpted champagne roof ring framing panoramic skylight + warm 3200 K recessed ceiling light cove
  const roofH0 = H - 0.16;
  addCM(boxMM(0, roofH0, -HALF_W, LEN, H, -HALF_W + 0.18), CHAMP);
  addCM(boxMM(0, roofH0, HALF_W - 0.18, LEN, H, HALF_W), CHAMP);
  addCM(boxMM(0, roofH0, -HALF_W + 0.18, 0.22, H, HALF_W - 0.18), CHAMP);
  addCM(boxMM(LEN - 0.22, roofH0, -HALF_W + 0.18, LEN, H, HALF_W - 0.18), CHAMP);
  // Two slim stainless skylight cross-ribs + warm glowing perimeter cove tucked inside roof aperture
  addCM(boxMM(LEN / 3 - 0.02, roofH0 + 0.04, -HALF_W + 0.18, LEN / 3 + 0.02, H - 0.02, HALF_W - 0.18), STEEL);
  addCM(boxMM((2 * LEN) / 3 - 0.02, roofH0 + 0.04, -HALF_W + 0.18, (2 * LEN) / 3 + 0.02, H - 0.02, HALF_W - 0.18), STEEL);
  addCM(boxMM(0.22, roofH0 + 0.01, -HALF_W + 0.17, LEN - 0.22, roofH0 + 0.045, -HALF_W + 0.20), WARM_GLOW);
  addCM(boxMM(0.22, roofH0 + 0.01, HALF_W - 0.20, LEN - 0.22, roofH0 + 0.045, HALF_W - 0.17), WARM_GLOW);
  addCM(boxMM(0.20, roofH0 + 0.01, -HALF_W + 0.18, 0.235, roofH0 + 0.045, HALF_W - 0.18), WARM_GLOW);
  addCM(boxMM(LEN - 0.235, roofH0 + 0.01, -HALF_W + 0.18, LEN - 0.20, roofH0 + 0.045, HALF_W - 0.18), WARM_GLOW);

  // Slim vertical champagne structural posts (4 corners + 4 doorway jambs framing +-z bi-parting doors)
  const postXs = [0.035, LEN / 2 - DOOR_HALF_X - 0.03, LEN / 2 + DOOR_HALF_X + 0.03, LEN - 0.035];
  for (const px of postXs) {
    for (const sgn of [-1, 1] as const) {
      const pz = sgn * (HALF_W - 0.035);
      addCM(boxMM(px - 0.035, 0, pz - 0.035, px + 0.035, roofH0, pz + 0.035), CHAMP);
    }
  }
  // Transom lintel above both +-z doorways + slim stainless end handrails at x = 0.14 & x = 3.86
  for (const sgn of [-1, 1] as const) {
    const pz = sgn * (HALF_W - 0.035);
    addCM(boxMM(LEN / 2 - DOOR_HALF_X, DOOR_H, pz - 0.035, LEN / 2 + DOOR_HALF_X, roofH0, pz + 0.035), CHAMP);
  }
  for (const ex of [0.14, LEN - 0.14]) {
    addCM(boxMM(ex - 0.015, 0.94, -HALF_W + 0.16, ex + 0.015, 0.97, HALF_W - 0.16), STEEL);
    for (const pz of [-HALF_W + 0.45, HALF_W - 0.45]) {
      addCM(boxMM(ex < 1 ? 0.04 : LEN - 0.14, 0.945, pz - 0.012, ex < 1 ? 0.14 : LEN - 0.04, 0.965, pz + 0.012), STEEL);
    }
  }

  // Wedge-shaped architectural brushed-stainless bogie chassis under the level cabin floor
  // Hypotenuse tracks rail top exactly: y_hyp(x) = -F.floorThickness - SLOPE * x  (x = 0 -> -0.18, x = 4 -> -5.073)
  const yHyp = (x: number): number => -F.floorThickness - SLOPE * x;
  const bogieZ = 0.92;
  for (const sgn of [-1, 1] as const) {
    const bz = sgn * bogieZ;
    // Inclined main bogie beam riding just above rail top (offset +0.08 vertically so zero clip into rail)
    addCM(strutXY(0.06, yHyp(0.06) + 0.09, LEN - 0.06, yHyp(LEN - 0.06) + 0.09, bz - 0.10, bz + 0.10, 0.18), STEEL);
    // Champagne architectural trim cheek along the inclined wedge chord
    addCM(strutXY(0.08, yHyp(0.08) + 0.20, LEN - 0.08, yHyp(LEN - 0.08) + 0.20, bz + sgn * 0.09, bz + sgn * 0.13, 0.12), CHAMP);
    // Vertical structural columns from level floor frame down to inclined bogie beam
    for (const cx of [1.25, 2.55, 3.85]) {
      addCM(boxMM(cx - 0.06, yHyp(cx) + 0.10, bz - 0.07, cx + 0.06, -F.floorThickness, bz + 0.07), STEEL);
    }
    // Diagonal K-truss bracing inside the wedge triangle
    addCM(strutXY(0.18, -F.floorThickness, 1.25, yHyp(1.25) + 0.14, bz - 0.05, bz + 0.05, 0.09), STEEL);
    addCM(strutXY(1.25, -F.floorThickness, 2.55, yHyp(2.55) + 0.14, bz - 0.05, bz + 0.05, 0.09), STEEL);
    addCM(strutXY(2.55, -F.floorThickness, 3.85, yHyp(3.85) + 0.14, bz - 0.05, bz + 0.05, 0.09), STEEL);
    addCM(strutXY(1.25, yHyp(1.25) + 0.14, 2.55, -F.floorThickness, bz - 0.04, bz + 0.04, 0.07), DARK_STEEL);
    addCM(strutXY(2.55, yHyp(2.55) + 0.14, 3.85, -F.floorThickness, bz - 0.04, bz + 0.04, 0.07), DARK_STEEL);
    // Machined wheel bogie housings at uphill & downhill ends
    for (const wx of [0.45, 3.55]) {
      const b = new THREE.BoxGeometry(0.56, 0.22, 0.26);
      b.rotateZ(-ANGLE);
      b.translate(wx, yHyp(wx) + 0.06, bz);
      addCM(b, DARK_STEEL);
    }
  }
  // Cross-ties linking the two wedge frames + central rack drive pinion housing
  for (const cx of [1.25, 2.55, 3.85]) {
    addCM(boxMM(cx - 0.05, yHyp(cx) + 0.14, -bogieZ, cx + 0.05, yHyp(cx) + 0.28, bogieZ), STEEL);
  }
  {
    const gear = new THREE.BoxGeometry(0.65, 0.30, 0.42);
    gear.rotateZ(-ANGLE);
    gear.translate(2.0, yHyp(2.0) + 0.12, 0);
    addCM(gear, DARK_STEEL);
  }

  // Cabin glass: panoramic east/west end windows, roof skylight, fixed side windows, plus 4 sliding door leaves
  cGlassStatic.push(
    cleanGeo(boxMM(0.025, 0.01, -HALF_W + 0.06, 0.037, roofH0, HALF_W - 0.06)),
    cleanGeo(boxMM(LEN - 0.037, 0.01, -HALF_W + 0.06, LEN - 0.025, roofH0, HALF_W - 0.06)),
    cleanGeo(boxMM(0.22, H - 0.03, -HALF_W + 0.18, LEN - 0.22, H - 0.018, HALF_W - 0.18)), // skylight
  );
  const sideEnd0 = LEN / 2 - DOOR_HALF_X - 0.05;
  const sideStart1 = LEN / 2 + DOOR_HALF_X + 0.05;
  for (const sgn of [-1, 1] as const) {
    const gz = sgn * (HALF_W - 0.028);
    cGlassStatic.push(
      cleanGeo(boxMM(0.06, 0.01, gz - 0.006, sideEnd0, roofH0, gz + 0.006)),
      cleanGeo(boxMM(sideStart1, 0.01, gz - 0.006, LEN - 0.06, roofH0, gz + 0.006)),
    );
  }
  // 4 cabin door glass leaves (2 sides x 2 bi-parting leaves) appended after static cabin glass
  const cabinDoorLeaves: SlideLeafSpan[] = [];
  let cDoorCursor = 0;
  for (const sgn of [-1, 1] as const) {
    const gz = sgn * (HALF_W - 0.055);
    for (const lSgn of [-1, 1] as const) {
      const x0 = lSgn < 0 ? LEN / 2 - DOOR_HALF_X + 0.005 : LEN / 2 + 0.005;
      const x1 = lSgn < 0 ? LEN / 2 - 0.005 : LEN / 2 + DOOR_HALF_X - 0.005;
      const leaf = cleanGeo(boxMM(x0, 0.02, gz - 0.006, x1, DOOR_H - 0.01, gz + 0.006));
      const count = leaf.getAttribute('position').count;
      cGlassDoors.push(leaf);
      cabinDoorLeaves.push({ start: cDoorCursor, count, sign: lSgn });
      cDoorCursor += count;
    }
  }

  const cabinMetalGeo = mergeGeometries(cMetalParts, false)!;
  for (const p of cMetalParts) p.dispose();
  const cabinMetalMesh = new THREE.Mesh(cabinMetalGeo, cabinMetalMat);
  cabinMetalMesh.name = 'funicularCabinMetal';
  cabinMetalMesh.userData.noShadow = true;
  cabinGroup.add(cabinMetalMesh);

  const cGlassStatGeo = mergeGeometries(cGlassStatic, false)!;
  const cGlassDoorGeo = mergeGeometries(cGlassDoors, false)!;
  const cDoorBase = cGlassStatGeo.getAttribute('position').count;
  const cabinGlassGeo = mergeGeometries([cGlassStatGeo, cGlassDoorGeo], false)!;
  for (const p of [...cGlassStatic, ...cGlassDoors]) p.dispose();
  cGlassStatGeo.dispose(); cGlassDoorGeo.dispose();
  const cGlassPos = cabinGlassGeo.getAttribute('position') as THREE.BufferAttribute;
  const cGlassBase = Float32Array.from(cGlassPos.array);
  const cabinGlassMesh = new THREE.Mesh(cabinGlassGeo, cabinGlassMat);
  cabinGlassMesh.name = 'funicularCabinGlass';
  cabinGlassMesh.renderOrder = 2;
  cabinGlassMesh.userData.noShadow = true;
  cabinGroup.add(cabinGlassMesh);

  // ============================================================================================================
  // 2. UPPER TRACK (above SKY.y = -32) + TOP STATION AT THRESHOLD (y = -30) — 2 calls in voidGroup
  // ============================================================================================================
  const uMetalParts: THREE.BufferGeometry[] = [];
  const uGlassStatic: THREE.BufferGeometry[] = [];
  const uGlassGates: THREE.BufferGeometry[] = [];
  const addUM = (g: THREE.BufferGeometry, rgb: RGB): void => { uMetalParts.push(tintGeo(g, rgb)); };

  // Split inclined track cleanly at y = SKY.y (-32): xSplit where railTopAt(x) = SKY.y
  const xSplit = F.top[0] + (F.top[1] - F.floorThickness - SKY.y) / SLOPE; // ~21.79 m
  buildTrackSegment(F.railTopEnd[0], xSplit, addUM);

  // Top station alcove at Threshold (-30): side landings (approved r <= 20 deck uncut!), portal frame, PSD screens, glass canopy
  const TS = F.topStation;
  const yTop = THRESHOLD.y; // -30
  const topWestX = F.top[0]; // 20.3
  const topEastX = topWestX + LEN; // 24.3
  const topMidX = topWestX + LEN / 2;
  const canopyY = yTop + TS.portalHeight; // -27.0

  // Side landing decks cantilevered outside r = 20 (x 19.6 .. 24.8, z 70.2..72.5 and 75.5..77.8) + slim champagne fascia
  for (const [za, zb] of [[TS.zMin, PIT_Z0], [PIT_Z1, TS.zMax]] as const) {
    addUM(boxMM(19.55, yTop - 0.04, za, TS.xMax, yTop, zb), DARK_DECK);
    addUM(boxMM(19.55, yTop - 0.42, za, TS.xMax, yTop - 0.04, zb), CHAMP);
    // Subtle warm soffit glow strip under outer edge
    const edgeZ = za < FZ ? za + 0.14 : zb - 0.14;
    addUM(boxMM(20.1, yTop - 0.435, edgeZ - 0.04, TS.xMax - 0.1, yTop - 0.42, edgeZ + 0.04), SOFT_GLOW);
  }
  // Architectural sky-slot light-well shaft sealing the 2 m deck thickness (-32 .. -30) and east clearance hood (-30 .. -27)
  // so looking up through the sky slot from the cavern shows a crisp, luminous architectural shaft (zero raw void backside).
  const SL = F.skySlot;
  const slZ0 = FZ - SL.halfZ, slZ1 = FZ + SL.halfZ;
  const HOOD_PALE: RGB = [0.88, 0.90, 0.92];
  // 2 m vertical reveal lining the sky slot from y = -32.0 up to y = -30.0
  addUM(boxMM(SL.xMin, SKY.y, slZ0 - 0.06, SL.xMax, yTop, slZ0), HOOD_PALE);
  addUM(boxMM(SL.xMin, SKY.y, slZ1, SL.xMax, yTop, slZ1 + 0.06), HOOD_PALE);
  addUM(boxMM(SL.xMin - 0.06, SKY.y, slZ0, SL.xMin, yTop, slZ1), HOOD_PALE);
  addUM(boxMM(SL.xMax, SKY.y, slZ0, SL.xMax + 0.06, yTop, slZ1), HOOD_PALE);
  // Crisp hooded enclosure extending east of the top station (x = 24.8 .. 28.65, y = -30 .. -27) with luminous skylight ceiling
  addUM(boxMM(TS.xMax, yTop, slZ0 - 0.06, SL.xMax + 0.06, canopyY, slZ0), HOOD_PALE);
  addUM(boxMM(TS.xMax, yTop, slZ1, SL.xMax + 0.06, canopyY, slZ1 + 0.06), HOOD_PALE);
  addUM(boxMM(SL.xMax, yTop, slZ0, SL.xMax + 0.06, canopyY, slZ1), HOOD_PALE);
  addUM(boxMM(TS.xMax, canopyY, slZ0 - 0.06, SL.xMax + 0.06, canopyY + 0.08, slZ1 + 0.06), HOOD_PALE);
  // Warm linear architectural wash along both inner walls of the sky-slot shaft (-31.6)
  addUM(boxMM(SL.xMin + 0.15, SKY.y + 0.35, slZ0 + 0.005, SL.xMax - 0.15, SKY.y + 0.43, slZ0 + 0.025), SOFT_GLOW);
  addUM(boxMM(SL.xMin + 0.15, SKY.y + 0.35, slZ1 - 0.025, SL.xMax - 0.15, SKY.y + 0.43, slZ1 - 0.005), SOFT_GLOW);
  // Crisp brushed-stainless portal frame where the Threshold polished drum wall opens into the top station (x = 20.0)
  addUM(boxMM(19.90, canopyY - 0.08, TS.zMin - 0.06, 20.20, canopyY + 0.08, TS.zMax + 0.06), STEEL);
  for (const pz of [TS.zMin, TS.zMax]) {
    addUM(boxMM(19.90, yTop, pz - 0.06, 20.20, canopyY, pz + 0.06), STEEL);
  }
  // Sleek champagne-ribbed ultra-clear glass canopy sheltering the top station (x 20.0..24.9, y = -27.0)
  addUM(boxMM(20.0, canopyY - 0.05, TS.zMin - 0.04, TS.xMax + 0.08, canopyY + 0.05, TS.zMin + 0.06), CHAMP);
  addUM(boxMM(20.0, canopyY - 0.05, TS.zMax - 0.06, TS.xMax + 0.08, canopyY + 0.05, TS.zMax + 0.04), CHAMP);
  addUM(boxMM(TS.xMax - 0.04, canopyY - 0.05, TS.zMin, TS.xMax + 0.08, canopyY + 0.05, TS.zMax), CHAMP);
  for (const rx of [21.2, 22.4, 23.6]) {
    addUM(boxMM(rx - 0.03, canopyY - 0.04, TS.zMin, rx + 0.03, canopyY + 0.04, TS.zMax), STEEL);
  }
  // Canopy corner support columns & warm linear canopy downlights
  for (const px of [22.4, TS.xMax]) {
    for (const pz of [TS.zMin + 0.03, TS.zMax - 0.03]) {
      addUM(boxMM(px - 0.035, yTop, pz - 0.035, px + 0.035, canopyY, pz + 0.035), CHAMP);
    }
  }
  for (const lz of [TS.zMin + 0.9, TS.zMax - 0.9]) {
    addUM(boxMM(20.3, canopyY - 0.055, lz - 0.03, TS.xMax - 0.2, canopyY - 0.035, lz + 0.03), WARM_GLOW);
  }
  uGlassStatic.push(cleanGeo(boxMM(20.05, canopyY + 0.01, TS.zMin + 0.04, TS.xMax + 0.02, canopyY + 0.025, TS.zMax - 0.04)));

  // Top station outer glass balustrades (east end x = 24.8, outer sides z = 70.2 & 77.8, west bay nose x = 20.15)
  const addBalustrade = (
    x0: number, z0: number, x1: number, z1: number, y0: number,
    addM: (g: THREE.BufferGeometry, rgb: RGB) => void, glassArr: THREE.BufferGeometry[],
  ): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / 1.8));
    for (let i = 0; i <= n; i++) {
      const px = x0 + ((x1 - x0) * i) / n, pz = z0 + ((z1 - z0) * i) / n;
      addM(boxMM(px - 0.022, y0, pz - 0.022, px + 0.022, y0 + 1.1, pz + 0.022), STEEL);
    }
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    if (alongX) {
      const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
      addM(boxMM(xa, y0 + 1.055, z0 - 0.024, xb, y0 + 1.1, z0 + 0.024), STEEL);
      addM(boxMM(xa, y0, z0 - 0.028, xb, y0 + 0.09, z0 + 0.028), STEEL);
      glassArr.push(cleanGeo(boxMM(xa + 0.02, y0 + 0.09, z0 - 0.006, xb - 0.02, y0 + 1.05, z0 + 0.006)));
    } else {
      const za = Math.min(z0, z1), zb = Math.max(z0, z1);
      addM(boxMM(x0 - 0.024, y0 + 1.055, za, x0 + 0.024, y0 + 1.1, zb), STEEL);
      addM(boxMM(x0 - 0.028, y0, za, x0 + 0.028, y0 + 0.09, zb), STEEL);
      glassArr.push(cleanGeo(boxMM(x0 - 0.006, y0 + 0.09, za + 0.02, x0 + 0.006, y0 + 1.05, zb - 0.02)));
    }
  };
  addBalustrade(20.0, TS.zMin + 0.04, TS.xMax - 0.04, TS.zMin + 0.04, yTop, addUM, uGlassStatic);
  addBalustrade(20.0, TS.zMax - 0.04, TS.xMax - 0.04, TS.zMax - 0.04, yTop, addUM, uGlassStatic);
  addBalustrade(TS.xMax - 0.04, TS.zMin + 0.04, TS.xMax - 0.04, TS.zMax - 0.04, yTop, addUM, uGlassStatic);
  addBalustrade(20.15, PIT_Z0, 20.15, PIT_Z1, yTop, addUM, uGlassStatic);

  // Top station full-height champagne screens along both long sides of the cabin (z = 72.5 & 75.5) + 4 sliding gates
  const topGateLeaves: SlideLeafSpan[] = [];
  let topGateCursor = 0;
  for (const sz of [PIT_Z0, PIT_Z1]) {
    // Champagne transom beam + mullions flanking central 2.1 m sliding gate aperture
    addUM(boxMM(topWestX - 0.15, yTop + DOOR_H, sz - 0.04, topEastX + 0.15, yTop + SCREEN_H, sz + 0.04), CHAMP);
    addUM(boxMM(topWestX - 0.15, yTop + DOOR_H + 0.03, sz - 0.045, topEastX + 0.15, yTop + SCREEN_H - 0.03, sz + 0.045), SMOKED_FASCIA);
    for (const mx of [topWestX - 0.12, topMidX - DOOR_HALF_X - 0.03, topMidX + DOOR_HALF_X + 0.03, topEastX + 0.12]) {
      addUM(boxMM(mx - 0.03, yTop, sz - 0.035, mx + 0.03, yTop + DOOR_H, sz + 0.035), CHAMP);
    }
    // Fixed side screen glass panels
    uGlassStatic.push(
      cleanGeo(boxMM(topWestX - 0.10, yTop + 0.06, sz - 0.006, topMidX - DOOR_HALF_X - 0.05, yTop + DOOR_H, sz + 0.006)),
      cleanGeo(boxMM(topMidX + DOOR_HALF_X + 0.05, yTop + 0.06, sz - 0.006, topEastX + 0.10, yTop + DOOR_H, sz + 0.006)),
    );
    // Sliding glass gate leaves (2 per side)
    const gz = sz < FZ ? sz + 0.035 : sz - 0.035;
    for (const lSgn of [-1, 1] as const) {
      const x0 = lSgn < 0 ? topMidX - DOOR_HALF_X + 0.005 : topMidX + 0.005;
      const x1 = lSgn < 0 ? topMidX - 0.005 : topMidX + DOOR_HALF_X - 0.005;
      const leaf = cleanGeo(boxMM(x0, yTop + 0.02, gz - 0.006, x1, yTop + DOOR_H - 0.01, gz + 0.006));
      const count = leaf.getAttribute('position').count;
      uGlassGates.push(leaf);
      topGateLeaves.push({ start: topGateCursor, count, sign: lSgn });
      topGateCursor += count;
    }
  }

  const upperMetalGeo = mergeGeometries(uMetalParts, false)!;
  for (const p of uMetalParts) p.dispose();
  const upperMetalMesh = new THREE.Mesh(upperMetalGeo, upperMetalMat);
  upperMetalMesh.name = 'funicularUpperMetal';
  upperMetalMesh.userData.noShadow = true;
  voidGroup.add(upperMetalMesh);

  const uGlassStatGeo = mergeGeometries(uGlassStatic, false)!;
  const uGlassGateGeo = mergeGeometries(uGlassGates, false)!;
  const uGateBase = uGlassStatGeo.getAttribute('position').count;
  const upperGlassGeo = mergeGeometries([uGlassStatGeo, uGlassGateGeo], false)!;
  for (const p of [...uGlassStatic, ...uGlassGates]) p.dispose();
  uGlassStatGeo.dispose(); uGlassGateGeo.dispose();
  const uGlassPos = upperGlassGeo.getAttribute('position') as THREE.BufferAttribute;
  const uGlassBase = Float32Array.from(uGlassPos.array);
  const upperGlassMesh = new THREE.Mesh(upperGlassGeo, kit.glass);
  upperGlassMesh.name = 'funicularUpperGlass';
  upperGlassMesh.renderOrder = 2;
  upperGlassMesh.userData.noShadow = true;
  voidGroup.add(upperGlassMesh);

  // ============================================================================================================
  // 3. LOWER TRACK (below SKY.y = -32) + BOTTOM PIT + UNDER-INCLINE GUARD + BOTTOM STATION — 3 calls in deepGroup
  // ============================================================================================================
  const dMetalParts: THREE.BufferGeometry[] = [];
  const dGlassStatic: THREE.BufferGeometry[] = [];
  const dGlassGates: THREE.BufferGeometry[] = [];
  const addDM = (g: THREE.BufferGeometry, rgb: RGB): void => { dMetalParts.push(tintGeo(g, rgb)); };

  // Lower inclined brushed-stainless rack track from sky slot (-32) down into bottom pit buffer (-75.3)
  buildTrackSegment(xSplit, F.railBottomEnd[0], addDM);

  // Bottom pit liner (x = 52.15 .. 57.3, z = 72.5 .. 75.5, y = -76.0 .. -70.0) + stainless coping + hydraulic buffers
  const pit = F.pit;
  const yBot = VESPER.topY; // -70.0
  const pitT = 0.22;
  // Pit floor + 4 enclosing dark concrete walls (watertight down to -76)
  addDM(boxMM(pit.xMin - pitT, pit.floorY - 0.25, pit.zMin - pitT, pit.xMax + pitT, pit.floorY, pit.zMax + pitT), PIT_WALL);
  addDM(boxMM(pit.xMin - pitT, pit.floorY, pit.zMin - pitT, pit.xMax + pitT, yBot - 0.04, pit.zMin), PIT_WALL);
  addDM(boxMM(pit.xMin - pitT, pit.floorY, pit.zMax, pit.xMax + pitT, yBot - 0.04, pit.zMax + pitT), PIT_WALL);
  addDM(boxMM(pit.xMin - pitT, pit.floorY, pit.zMin, pit.xMin, yBot - 0.04, pit.zMax), PIT_WALL);
  addDM(boxMM(pit.xMax, pit.floorY, pit.zMin, pit.xMax + pitT, yBot - 0.04, pit.zMax), PIT_WALL);
  // Crisp brushed-stainless perimeter coping flush around pit mouth at -70
  addDM(boxMM(pit.xMin - 0.08, yBot - 0.04, pit.zMin - 0.08, pit.xMax + 0.08, yBot + 0.006, pit.zMin + 0.02), STEEL);
  addDM(boxMM(pit.xMin - 0.08, yBot - 0.04, pit.zMax - 0.02, pit.xMax + 0.08, yBot + 0.006, pit.zMax + 0.08), STEEL);
  addDM(boxMM(pit.xMin - 0.08, yBot - 0.04, pit.zMin, pit.xMin + 0.02, yBot + 0.006, pit.zMax), STEEL);
  addDM(boxMM(pit.xMax - 0.02, yBot - 0.04, pit.zMin, pit.xMax + 0.08, yBot + 0.006, pit.zMax), STEEL);
  // Subtle warm service light strips inside the pit coping so the wedge chassis reads crisp even when looking down into the pit
  addDM(boxMM(pit.xMin + 0.2, yBot - 0.20, pit.zMin + 0.005, pit.xMax - 0.2, yBot - 0.16, pit.zMin + 0.025), SOFT_GLOW);
  addDM(boxMM(pit.xMin + 0.2, yBot - 0.20, pit.zMax - 0.025, pit.xMax - 0.2, yBot - 0.16, pit.zMax - 0.005), SOFT_GLOW);
  // Twin hydraulic buffer stops at the bottom of the inclined rails in the pit
  for (const sgn of [-1, 1] as const) {
    const bz = FZ + sgn * 0.92;
    const bx = F.railBottomEnd[0] - 0.10;
    const by = funicularRailTopAt(bx);
    const buf = new THREE.CylinderGeometry(0.11, 0.14, 0.72, 14);
    buf.rotateZ(Math.PI / 2 - ANGLE);
    buf.translate(bx, by, bz);
    addDM(buf, DARK_STEEL);
  }

  // Under-incline Crossing floor glass guard (x = 50.2 .. 52.7, z = 72.5 .. 75.5) where rail underside < 2.3 m above -70
  const gx0 = F.underTrackGuardXMin; // 50.2
  const botScreenX0 = F.bottom[0] - 0.3; // 52.7
  const botScreenX1 = F.bottom[0] + LEN + 0.3; // 57.3 (0.64 m strictly inside continuous east balustrade x = 57.94)
  const botMidX = F.bottom[0] + LEN / 2; // 55.0
  addBalustrade(gx0, PIT_Z0, botScreenX0, PIT_Z0, yBot, addDM, dGlassStatic);
  addBalustrade(gx0, PIT_Z1, botScreenX0, PIT_Z1, yBot, addDM, dGlassStatic);
  addBalustrade(gx0, PIT_Z0, gx0, PIT_Z1, yBot, addDM, dGlassStatic);

  // Bottom station full-height 2.6 m champagne-framed glass screens (psd.ts vocabulary) + east end screen + 4 sliding gates
  // East end screen at x = 57.3 (strictly inside continuous Crossing east balustrade)
  addDM(boxMM(botScreenX1 - 0.035, yBot, PIT_Z0, botScreenX1 + 0.035, yBot + SCREEN_H, PIT_Z0 + 0.06), CHAMP);
  addDM(boxMM(botScreenX1 - 0.035, yBot, PIT_Z1 - 0.06, botScreenX1 + 0.035, yBot + SCREEN_H, PIT_Z1), CHAMP);
  addDM(boxMM(botScreenX1 - 0.04, yBot + DOOR_H, PIT_Z0, botScreenX1 + 0.04, yBot + SCREEN_H, PIT_Z1), CHAMP);
  addDM(boxMM(botScreenX1 - 0.03, yBot, PIT_Z0, botScreenX1 + 0.03, yBot + 0.08, PIT_Z1), STEEL);
  dGlassStatic.push(cleanGeo(boxMM(botScreenX1 - 0.006, yBot + 0.08, PIT_Z0 + 0.06, botScreenX1 + 0.006, yBot + DOOR_H, PIT_Z1 - 0.06)));

  const botGateLeaves: SlideLeafSpan[] = [];
  const botGateCenters: Array<{ x0: number; z: number; sign: -1 | 1 }> = [];
  let botGateCursor = 0;
  for (const sz of [PIT_Z0, PIT_Z1]) {
    addDM(boxMM(botScreenX0, yBot + DOOR_H, sz - 0.04, botScreenX1, yBot + SCREEN_H, sz + 0.04), CHAMP);
    addDM(boxMM(botScreenX0 + 0.04, yBot + DOOR_H + 0.03, sz - 0.045, botScreenX1 - 0.04, yBot + SCREEN_H - 0.03, sz + 0.045), SMOKED_FASCIA);
    // Subtle warm status line inside transom (matches PSD header restraint)
    const faceZ = sz < FZ ? sz - 0.047 : sz + 0.047;
    addDM(boxMM(botMidX - 0.75, yBot + DOOR_H + 0.12, faceZ - 0.003, botMidX + 0.75, yBot + DOOR_H + 0.15, faceZ + 0.003), SOFT_GLOW);
    for (const mx of [botScreenX0 + 0.03, botMidX - DOOR_HALF_X - 0.03, botMidX + DOOR_HALF_X + 0.03, botScreenX1 - 0.03]) {
      addDM(boxMM(mx - 0.03, yBot, sz - 0.035, mx + 0.03, yBot + DOOR_H, sz + 0.035), CHAMP);
    }
    addDM(boxMM(botScreenX0, yBot, sz - 0.035, botMidX - DOOR_HALF_X, yBot + 0.07, sz + 0.035), STEEL);
    addDM(boxMM(botMidX + DOOR_HALF_X, yBot, sz - 0.035, botScreenX1, yBot + 0.07, sz + 0.035), STEEL);
    dGlassStatic.push(
      cleanGeo(boxMM(botScreenX0 + 0.06, yBot + 0.07, sz - 0.006, botMidX - DOOR_HALF_X - 0.05, yBot + DOOR_H, sz + 0.006)),
      cleanGeo(boxMM(botMidX + DOOR_HALF_X + 0.05, yBot + 0.07, sz - 0.006, botScreenX1 - 0.06, yBot + DOOR_H, sz + 0.006)),
    );
    const gz = sz < FZ ? sz + 0.038 : sz - 0.038;
    for (const lSgn of [-1, 1] as const) {
      const x0 = lSgn < 0 ? botMidX - DOOR_HALF_X + 0.005 : botMidX + 0.005;
      const x1 = lSgn < 0 ? botMidX - 0.005 : botMidX + DOOR_HALF_X - 0.005;
      const leaf = cleanGeo(boxMM(x0, yBot + 0.06, gz - 0.006, x1, yBot + DOOR_H - 0.05, gz + 0.006));
      const count = leaf.getAttribute('position').count;
      dGlassGates.push(leaf);
      botGateLeaves.push({ start: botGateCursor, count, sign: lSgn });
      botGateCenters.push({ x0: (x0 + x1) / 2, z: gz, sign: lSgn });
      botGateCursor += count;
    }
  }

  // Prototype slim champagne gate leaf frame for the 4 bottom station sliding gates (InstancedMesh count 4)
  const leafW = DOOR_HALF_X - 0.01;
  const gFrameParts = [
    cleanGeo(boxMM(-leafW / 2, 0.01, -0.014, leafW / 2, 0.065, 0.014)),
    cleanGeo(boxMM(-leafW / 2, DOOR_H - 0.055, -0.014, leafW / 2, DOOR_H - 0.005, 0.014)),
    cleanGeo(boxMM(-leafW / 2, 0.065, -0.014, -leafW / 2 + 0.032, DOOR_H - 0.055, 0.014)),
    cleanGeo(boxMM(leafW / 2 - 0.032, 0.065, -0.014, leafW / 2, DOOR_H - 0.055, 0.014)),
  ];
  const botGateFrameGeo = mergeGeometries(gFrameParts, false)!;
  for (const p of gFrameParts) p.dispose();

  const lowerMetalGeo = mergeGeometries(dMetalParts, false)!;
  for (const p of dMetalParts) p.dispose();
  const lowerMetalMesh = new THREE.Mesh(lowerMetalGeo, lowerMetalMat);
  lowerMetalMesh.name = 'funicularLowerMetal';
  lowerMetalMesh.userData.noShadow = true;
  deepGroup.add(lowerMetalMesh);

  const dGlassStatGeo = mergeGeometries(dGlassStatic, false)!;
  const dGlassGateGeo = mergeGeometries(dGlassGates, false)!;
  const dGateBase = dGlassStatGeo.getAttribute('position').count;
  const lowerGlassGeo = mergeGeometries([dGlassStatGeo, dGlassGateGeo], false)!;
  for (const p of [...dGlassStatic, ...dGlassGates]) p.dispose();
  dGlassStatGeo.dispose(); dGlassGateGeo.dispose();
  const dGlassPos = lowerGlassGeo.getAttribute('position') as THREE.BufferAttribute;
  const dGlassBase = Float32Array.from(dGlassPos.array);
  const lowerGlassMesh = new THREE.Mesh(lowerGlassGeo, kit.deep.glass);
  lowerGlassMesh.name = 'funicularLowerGlass';
  lowerGlassMesh.renderOrder = 3;
  lowerGlassMesh.userData.noShadow = true;
  deepGroup.add(lowerGlassMesh);

  const botGateFramesMesh = new THREE.InstancedMesh(botGateFrameGeo, bottomGateFrameMat, 4);
  botGateFramesMesh.name = 'funicularBottomGateFrames';
  botGateFramesMesh.userData.noShadow = true;
  botGateFramesMesh.frustumCulled = false;
  deepGroup.add(botGateFramesMesh);

  // ---- Zero-allocation per-frame update ----
  const slideX = DOOR_HALF_X * 0.94;
  let prevCabinDoor = -1;
  let prevTopGate = -1;
  let prevBotGate = -1;

  const applySlide = (
    posAttr: THREE.BufferAttribute, baseArr: Float32Array, baseVert: number,
    leaves: readonly SlideLeafSpan[], open01: number,
  ): void => {
    const dx = open01 * slideX;
    for (let i = 0; i < leaves.length; i++) {
      const lf = leaves[i]!;
      const off = lf.sign * dx;
      const v0 = baseVert + lf.start;
      for (let k = 0; k < lf.count; k++) {
        posAttr.setX(v0 + k, baseArr[(v0 + k) * 3]! + off);
      }
    }
    posAttr.needsUpdate = true;
  };

  const update = (): void => {
    cabinGroup.position.set(funicular.x, funicular.y, FZ);
    const cd = funicular.doorOpen01;
    if (cd !== prevCabinDoor) {
      prevCabinDoor = cd;
      applySlide(cGlassPos, cGlassBase, cDoorBase, cabinDoorLeaves, cd);
    }
    const tg = funicular.stationGateOpen01('top');
    if (tg !== prevTopGate) {
      prevTopGate = tg;
      applySlide(uGlassPos, uGlassBase, uGateBase, topGateLeaves, tg);
    }
    const bg = funicular.stationGateOpen01('bottom');
    if (bg !== prevBotGate) {
      prevBotGate = bg;
      applySlide(dGlassPos, dGlassBase, dGateBase, botGateLeaves, bg);
      for (let i = 0; i < botGateCenters.length; i++) {
        const gc = botGateCenters[i]!;
        _mGate.makeTranslation(gc.x0 + gc.sign * bg * slideX, yBot, gc.z);
        botGateFramesMesh.setMatrixAt(i, _mGate);
      }
      botGateFramesMesh.instanceMatrix.needsUpdate = true;
    }
  };
  update();

  const tris = (g: THREE.BufferGeometry, mult = 1): number => (g.getAttribute('position').count / 3) * mult;
  const triangles = Math.round(
    tris(cabinMetalGeo) + tris(cabinGlassGeo) + tris(upperMetalGeo) + tris(upperGlassGeo) +
    tris(lowerMetalGeo) + tris(lowerGlassGeo) + tris(botGateFrameGeo, 4),
  );

  return {
    voidGroup,
    deepGroup,
    bothZoneMaterials,
    deepMaterials,
    update,
    stats: { voidCalls: 4, deepCalls: 3, triangles },
  };
}
