import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { METRO_TRAIN, PSD } from '../../layoutMetro';
import { destinationOf, lineLabelOf } from '../../metro/network';
import { doorOffsets, type MetroTrack } from '../../metro/tracks';
import { LINE_COLORS } from '../../metro/trainModel';
import { GeoBag, v3 } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * Reusable full-height platform-screen-door system (spec §2.6, §4; Phase 3 task P3-3, reused by P3-4 Vesper,
 * P3-5 Halcyon and P3-8b Funicular), upgraded to frameless smart glass (2026-11-23 ruling).
 *
 * Precision 2035 transit screen doors:
 *  - 2.6 m total height: slim satin-stainless base shoe, frameless ultra-clear structural glass bays butt-jointed with
 *    small stainless patch fittings (no mullions), 0.25 m black-glass header;
 *  - electrochromic glass: every row has a `clarity` 0 (frosted milky glass, faint line-colour tint low down) .. 1
 *    (crystal clear). Fixed bays and door leaves share the same uniforms, driven per row by `setClarity`;
 *  - sliding door pairs centred on `doorOffsets()` (1.56 m clear aperture >= train 1.44 m + 0.10 m), instanced with
 *    zero per-frame allocations; each leaf carries a vertical LED light strip on its meeting edge: steady white while the
 *    doors stand open, amber pulse while they close (emissive fixture only);
 *  - header fascia: black glass, crisp dot-matrix text (destination, status, next-train countdown), line-colour roundel and a
 *    hairline satin line-colour accent bar along its bottom lip (Ruling 8: never glows).
 *
 * `createPsdBank` batches all rows on an island into 5 draw calls total (stainless fittings, fixed smart glass, instanced
 * door fittings + light strips, instanced door smart glass, header + displays).
 */

const PSD_DETAIL = {
  sillH: 0.06,
  transomBot: PSD.height - PSD.transomH, // 2.35 m
  transomD: 0.14,
  shoeD: 0.07,
  postW: 0.04,
  glassT: 0.016,
  /** Silicone butt joint between neighbouring fixed panes. */
  jointGap: 0.008,
  leafGap: 0.004,
  leafGlassT: 0.014,
  /** Leaves sit slightly track-side of the fixed glass so they slide smoothly behind the fixed bays. */
  leafOffsetOut: -0.028,
  /** Max span between joints in fixed bays. */
  maxFixedBayW: 2.3,
  /** Stainless patch fitting (clamp) dimensions. */
  fitW: 0.07,
  fitH: 0.12,
  /** LED light strip on the leaf meeting edge. */
  stripW: 0.016,
  stripT: 0.024,
  canvasW: 2048,
  canvasRowH: 116,
} as const;

export interface PsdRowSpec {
  track: MetroTrack;
  /** +1 or -1 along right-hand perpendicular (-dir.z, dir.x) from track centre toward the platform. */
  side: 1 | -1;
  /** Platform walking surface y (e.g. MERIDIAN.topY = -46). */
  platformY: number;
  /** Half-length of the PSD row along the platform (default 45 m for a 90 m platform). */
  platformHalfLen?: number;
  /** Optional custom door centre offsets along s (defaults to doorOffsets() for 4-car metro trains). */
  doorCentres?: readonly number[];
  /** Optional custom door half-width (defaults to METRO_TRAIN.doorHalf + PSD.doorHalfPad = 0.78 m). */
  doorHalf?: number;
  /** Optional override for distance from track centre to PSD line (defaults to PSD.trackToDoorLine = 1.9 m). */
  trackToDoorLine?: number;
  /** Optional extended fixed-only glass screen beyond platformHalfLen (e.g. Vesper x = ±45..±58). */
  extendSMin?: number;
  extendSMax?: number;
  /** Optional low-headroom cutout [s0, s1, lowH] where overhead structure (e.g. F6 escalator) passes over the PSD line. */
  lowHeadroomSpan?: readonly [number, number, number];
  /** Initial transom display text (e.g. 'MERIDIAN · THE LAST SUMMER'). */
  initialDisplay: string;
}

export interface PsdController {
  readonly doorCount: number;
  readonly doorCentres: readonly number[];
  setOpen(doorIndex: number, f: number): void;
  setAll(f: number): void;
  /** Header text `LINE · DESTINATION[ · STATUS]`; the status segment shows small above the countdown. */
  setDisplay(text: string): void;
  getDisplay(): string;
  /** Big next-train countdown on the header (`2 min`, `Now`, `-- min`). */
  setCountdown(label: string): void;
  /** Smart-glass state of the whole row: 0 frosted .. 1 crystal clear. */
  setClarity(c: number): void;
  getClarity(): number;
  maxOpen(): number;
}

export interface PsdRow extends PsdController {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
}

export interface PsdBankBuild {
  group: THREE.Group;
  rows: PsdController[];
  deepMaterials: THREE.Material[];
}

export interface PsdBankOpts {
  name?: string;
  /** Optional additional ultra-clear glass geometries (world space) merged into the fixed glass call to save draw calls. */
  extraFixedGlass?: THREE.BufferGeometry[];
}

// Module-scope scratch math (zero per-frame allocation in setOpen / setAll).
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _mat = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

/** Shared real-time clock for the amber closing pulse (one value for every bank; written by `setPsdClock`). */
const PSD_CLOCK = { value: 0 };
/** Call once per displayed frame with real seconds; drives the amber door-edge pulse. */
export function setPsdClock(seconds: number): void {
  PSD_CLOCK.value = seconds;
}

/** Oriented box aligned to (tangent, up, inward) frame centred at (cx, cy, cz). */
function orientedBox(
  cx: number, cy: number, cz: number,
  lenS: number, h: number, depthN: number,
  yaw: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(depthN, h, lenS);
  g.rotateY(yaw);
  g.translate(cx, cy, cz);
  return g;
}

function withFloatAttr(g: THREE.BufferGeometry, name: string, v: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(n).fill(v), 1));
  return g;
}

/**
 * Door leaf prototypes in local space: width `leafW` along Z (centred at 0), height along Y, thickness along X.
 *  - `fit`: four stainless patch fittings (two at the foot, two under the header) plus the LED strip on the +Z (meeting) edge,
 *    tagged by the `aEm` attribute (1 on the strip, 0 on metal);
 *  - `glass`: one frameless glass pane.
 * Right-hand leaves are rotated 180 degrees about Y so their meeting edge is also +Z locally.
 */
function buildLeafPrototypes(leafW: number): { fit: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const y0 = 0.04, y1 = PSD_DETAIL.transomBot - 0.01;
  const th = PSD_DETAIL.leafGlassT + 0.012;
  const parts: THREE.BufferGeometry[] = [];
  const add = (dx: number, dy: number, dz: number, x: number, y: number, z: number, em: number): void => {
    const g = new THREE.BoxGeometry(dx, dy, dz);
    g.translate(x, y, z);
    parts.push(withFloatAttr(g, 'aEm', em));
  };
  const fitZ = leafW / 2 - 0.05;
  for (const z of [-fitZ, fitZ]) {
    add(th, PSD_DETAIL.fitH, PSD_DETAIL.fitW, 0, y0 + PSD_DETAIL.fitH / 2 + 0.02, z, 0);
    add(th, PSD_DETAIL.fitH, PSD_DETAIL.fitW, 0, y1 - PSD_DETAIL.fitH / 2, z, 0);
  }
  // LED strip bonded over the meeting edge, from just above the foot fittings to just below the header.
  const sy0 = y0 + PSD_DETAIL.fitH + 0.1, sy1 = y1 - PSD_DETAIL.fitH - 0.05;
  add(PSD_DETAIL.stripT, sy1 - sy0, PSD_DETAIL.stripW, 0, (sy0 + sy1) / 2, leafW / 2 - PSD_DETAIL.stripW / 2 + 0.002, 1);
  const fit = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  for (const p of parts) p.dispose();
  fit.computeBoundingSphere();

  const glass = new THREE.BoxGeometry(PSD_DETAIL.leafGlassT, y1 - y0, leafW);
  glass.translate(0, (y0 + y1) / 2, 0);
  glass.computeBoundingSphere();
  return { fit, glass };
}

// ---- smart glass shader -----------------------------------------------------------------------------------------------

interface SmartGlassUniforms {
  uSgClarity: { value: number[] };
  uSgTint: { value: THREE.Vector3[] };
  uSgPlat: { value: number[] };
}

/**
 * Electrochromic glass: a transparent physical glass whose fragment shader blends from crystal clear to frosted milky glass.
 * Frosted = higher roughness, a milky luminous veil with fine grain and a soft low-frequency mottle (diffused light), and a faint
 * line-colour tint that fades out over the lower ~1.5 m. Rows are looked up by the per-vertex / per-instance attribute `aRow`
 * (-1 = never frosted, e.g. the island-end balustrade glass merged into the same draw call).
 */
function makeSmartGlass(base: THREE.MeshPhysicalMaterial, u: SmartGlassUniforms, rows: number, suffix: string): THREE.MeshPhysicalMaterial {
  const m = base.clone();
  m.name = `${base.name}Smart${suffix}`;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSgClarity = u.uSgClarity;
    shader.uniforms.uSgTint = u.uSgTint;
    shader.uniforms.uSgPlat = u.uSgPlat;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRow;\nvarying vec3 vSgW;\nvarying float vSgRow;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 sgW = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           sgW = instanceMatrix * sgW;
         #endif
         vSgW = (modelMatrix * sgW).xyz;
         vSgRow = aRow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         #define SG_ROWS ${rows}
         uniform float uSgClarity[SG_ROWS];
         uniform vec3 uSgTint[SG_ROWS];
         uniform float uSgPlat[SG_ROWS];
         varying vec3 vSgW;
         varying float vSgRow;
         float sgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float sgNoise(vec2 p) {
           vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
           return mix(mix(sgHash(i), sgHash(i + vec2(1.0, 0.0)), f.x), mix(sgHash(i + vec2(0.0, 1.0)), sgHash(i + vec2(1.0, 1.0)), f.x), f.y);
         }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         float sgFrost = 0.0; float sgBand = 0.0; vec3 sgTintC = vec3(1.0);
         vec2 sgQ = vec2(vSgW.x + vSgW.z, vSgW.y);
         if (vSgRow > -0.5) {
           int sgI = int(vSgRow + 0.5);
           float sgC = uSgClarity[sgI];
           float sgL = clamp(sgC * 1.3 - 0.3 * sgNoise(sgQ * 1.7), 0.0, 1.0);
           float sgH = vSgW.y - uSgPlat[sgI];
           // Soft privacy band: frosted from ~0.1 m to ~1.4 m, fading to clear by ~2.0 m; faint line tint at the lower edge only.
           float sgMask = smoothstep(0.04, 0.1, sgH) * (1.0 - smoothstep(1.4, 2.0, sgH));
           sgFrost = (1.0 - sgL * sgL * (3.0 - 2.0 * sgL)) * sgMask;
           sgBand = (1.0 - smoothstep(0.1, 0.5, sgH)) * sgFrost;
           sgTintC = uSgTint[sgI];
         }
         roughnessFactor = mix(roughnessFactor, 0.6, sgFrost);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float sgEdge = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.0) * (1.0 - sgFrost);
         outgoingLight = mix(outgoingLight, vec3(0.30, 0.62, 0.50), sgEdge * 0.45);
         diffuseColor.a = mix(diffuseColor.a, 0.6, sgEdge);
         if (sgFrost > 0.001) {
           float sgSoft = sgNoise(sgQ * 0.55 + 3.1);
           float sgGrain = sgNoise(sgQ * vec2(46.0, 61.0));
           vec3 sgMilk = vec3(0.78, 0.82, 0.86);
           vec3 sgTint = mix(sgMilk, sgTintC * 0.85 + 0.15, 0.55);
           vec3 sgCol = mix(sgMilk, sgTint, sgBand * 0.8) * (0.88 + 0.16 * sgSoft + 0.05 * sgGrain);
           outgoingLight = mix(outgoingLight, sgCol + outgoingLight * 0.25, sgFrost);
           diffuseColor.a = mix(diffuseColor.a, 0.40 + 0.10 * sgBand + 0.04 * sgGrain, sgFrost);
         }
         #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `psdSmartGlass${rows}`;
  return m;
}

/** Stainless fittings material whose `aEm` vertices (the LED strips) glow by the per-instance `aStrip` state (+ white fade-in, - amber pulse). */
function makeFittingMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ name: 'metroPsdFittings', color: 0xc4c9cc, metalness: 1, roughness: 0.34, envMapIntensity: 1.0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPsdTime = PSD_CLOCK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEm;\nattribute float aStrip;\nvarying float vEm;\nvarying float vStrip;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEm = aEm; vStrip = aStrip;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPsdTime;\nvarying float vEm;\nvarying float vStrip;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), vEm);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, vEm);')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float stW = max(vStrip, 0.0);
         float stA = max(-vStrip, 0.0) * (0.45 + 0.55 * (0.5 + 0.5 * sin(uPsdTime * 9.4)));
         totalEmissiveRadiance += vEm * (vec3(2.3, 2.3, 2.2) * stW * stW + vec3(2.6, 1.1, 0.1) * stA);`,
      );
  };
  m.customProgramCacheKey = () => 'psdFittings';
  return m;
}

// ---- header display atlas ---------------------------------------------------------------------------------------------

const FONT = '"Inter", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';

const linToSrgbByte = (v: number): number => {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
};

interface HeaderState { text: string; countdown: string }

/** Shared canvas pair for a bank of PSD rows: `color` (black glass + satin accent + dim text) and `emissive` (lit text only). */
function createDisplayAtlas(specs: readonly PsdRowSpec[]): {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  drawRow: (rowIndex: number, state: HeaderState) => void;
} {
  const W = PSD_DETAIL.canvasW;
  const RH = PSD_DETAIL.canvasRowH;
  const H = RH * Math.max(1, specs.length);

  const cColor = document.createElement('canvas');
  cColor.width = W; cColor.height = H;
  const gColor = cColor.getContext('2d')!;
  const cEmis = document.createElement('canvas');
  cEmis.width = W; cEmis.height = H;
  const gEmis = cEmis.getContext('2d')!;

  const mk = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    return t;
  };
  const map = mk(cColor);
  const emissiveMap = mk(cEmis);

  // Dot-matrix grid: 1 px dark lines every 4 px both ways over the lit text (a 4 px LED pitch is ~6.5 mm on the panel).
  const grid = document.createElement('canvas');
  grid.width = 4; grid.height = 4;
  const gg = grid.getContext('2d')!;
  gg.fillStyle = 'rgba(0,0,0,0.62)';
  gg.fillRect(3, 0, 1, 4);
  gg.fillRect(0, 3, 4, 1);
  const gridPattern = gEmis.createPattern(grid, 'repeat')!;

  const drawRow = (rowIndex: number, state: HeaderState): void => {
    const spec = specs[rowIndex]!;
    const y0 = rowIndex * RH;
    const lc = LINE_COLORS[spec.track.line];
    const lineCss = `rgb(${linToSrgbByte(lc[0])}, ${linToSrgbByte(lc[1])}, ${linToSrgbByte(lc[2])})`;
    const parts = state.text.split(' · ');
    const status = (parts[2] ?? 'NEXT TRAIN').toUpperCase();
    const dest = destinationOf(spec.track.line, spec.track.track);
    const lineLabel = `${lineLabelOf(spec.track.line)} LINE`;

    // Black glass fascia, hairline satin line-colour bar on the bottom lip (non-emissive, Ruling 8)
    const grad = gColor.createLinearGradient(0, y0, 0, y0 + RH);
    grad.addColorStop(0, '#10151c');
    grad.addColorStop(1, '#070a0e');
    gColor.fillStyle = grad;
    gColor.fillRect(0, y0, W, RH);
    gColor.fillStyle = lineCss;
    gColor.fillRect(0, y0 + RH - 5, W, 5);
    gEmis.fillStyle = '#000000';
    gEmis.fillRect(0, y0, W, RH);

    // Line roundel (satin enamel disc in the colour canvas, white initial lit)
    const rx = 132, ry = y0 + (RH - 5) / 2, rr = 37;
    gColor.fillStyle = lineCss;
    gColor.beginPath(); gColor.arc(rx, ry, rr, 0, Math.PI * 2); gColor.fill();

    const text = (ctx: CanvasRenderingContext2D, lit: boolean): void => {
      ctx.save();
      ctx.textBaseline = 'middle';
      const ink = lit ? '#ffffff' : '#c9d1db';
      const dim = lit ? '#9aa6b6' : '#6f7a89';
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.font = `700 44px ${FONT}`;
      ctx.fillText(lineLabel[0]!, rx, ry + 2);
      ctx.textAlign = 'left';
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '4px';
      ctx.font = `600 22px ${FONT}`;
      ctx.fillStyle = dim;
      ctx.fillText(lineLabel, 196, y0 + 28);
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
      ctx.font = `700 54px ${FONT}`;
      ctx.fillStyle = ink;
      ctx.fillText(dest, 196, y0 + 72);
      ctx.textAlign = 'right';
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '4px';
      ctx.font = `600 22px ${FONT}`;
      ctx.fillStyle = dim;
      ctx.fillText(status, W - 70, y0 + 28);
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
      ctx.font = `700 54px ${FONT}`;
      ctx.fillStyle = ink;
      ctx.fillText(state.countdown || '-- min', W - 70, y0 + 72);
      ctx.restore();
    };
    text(gColor, false);
    text(gEmis, true);
    gEmis.save();
    gEmis.fillStyle = gridPattern;
    gEmis.fillRect(0, y0, W, RH - 5);
    gEmis.restore();
    map.needsUpdate = true;
    emissiveMap.needsUpdate = true;
  };

  for (let i = 0; i < specs.length; i++) drawRow(i, { text: specs[i]!.initialDisplay, countdown: '-- min' });
  return { map, emissiveMap, drawRow };
}

/** Build a bank of 1..N PSD rows sharing 5 batched draw calls total. */
export function createPsdBank(
  specs: readonly PsdRowSpec[],
  lib: MaterialLibrary,
  kit: MetroMaterials,
  opts: PsdBankOpts = {},
): PsdBankBuild {
  const name = opts.name ?? 'metroPsdBank';
  const group = new THREE.Group();
  group.name = name;

  const metalBag = new GeoBag(lib, 'brass', kit.metersPerTile.stainless);
  /** Smart (frostable) fixed glass; every part carries aRow. */
  const smartGlass: THREE.BufferGeometry[] = [];

  // Per-leaf transform table for the single InstancedMesh pair (fittings + glass).
  interface LeafSlot {
    ox: number; oy: number; oz: number;
    dx: number; dz: number;
    yaw: number;
    baseS: number;
    slideSign: 1 | -1;
    slideDist: number;
    open01: number;
    row: number;
  }
  const leafSlots: LeafSlot[] = [];
  const rowLeafRanges: Array<{ start: number; doors: number; doorCentres: readonly number[] }> = [];
  const displayParts: THREE.BufferGeometry[] = [];
  const numRows = Math.max(1, specs.length);
  const defaultDoors = doorOffsets();
  // Use a single consistent leaf width across the bank (standard metro 0.78 m unless custom single-spec bank).
  const bankDoorHalf = specs[0]?.doorHalf ?? (METRO_TRAIN.doorHalf + PSD.doorHalfPad);
  const leafW = bankDoorHalf - PSD_DETAIL.leafGap;

  for (let rIdx = 0; rIdx < specs.length; rIdx++) {
    const spec = specs[rIdx]!;
    const { track, side, platformY } = spec;
    const halfLen = spec.platformHalfLen ?? 45;
    const sMin = spec.extendSMin ?? -halfLen;
    const sMax = spec.extendSMax ?? +halfLen;
    const offset = spec.trackToDoorLine ?? PSD.trackToDoorLine;
    const doorHalf = spec.doorHalf ?? bankDoorHalf;
    const doors = [...(spec.doorCentres ?? defaultDoors)].sort((a, b) => a - b);

    const [ox, oz] = track.origin;
    const [dx, dz] = track.dir;
    // Unit normal from track centre toward the platform
    const nx = -dz * side;
    const nz = dx * side;
    // Line origin on the PSD centreline at s = 0
    const lx = ox + nx * offset;
    const lz = oz + nz * offset;
    const yaw = Math.atan2(dx, dz);

    const ptS = (s: number, nShift = 0): [number, number] => [lx + dx * s + nx * nShift, lz + dz * s + nz * nShift];

    const addMetalBar = (s0: number, s1: number, y0: number, y1: number, depth: number = PSD_DETAIL.shoeD, nShift = 0): void => {
      const len = s1 - s0;
      if (len < 1e-4 || y1 - y0 < 1e-4) return;
      const [cx, cz] = ptS((s0 + s1) / 2, nShift);
      metalBag.add(orientedBox(cx, platformY + (y0 + y1) / 2, cz, len, y1 - y0, depth, yaw));
    };

    /** Stainless patch fitting clamping a glass edge at track coordinate s, between heights y0..y1. */
    const addFitting = (s: number, y0: number): void => {
      addMetalBar(s - PSD_DETAIL.fitW / 2, s + PSD_DETAIL.fitW / 2, y0, y0 + PSD_DETAIL.fitH, PSD_DETAIL.glassT + 0.018, 0.014);
    };

    const addSmartPane = (s0: number, s1: number, yBot: number, yTop: number): void => {
      if (s1 - s0 < 0.04 || yTop - yBot < 0.05) return;
      const [cx, cz] = ptS((s0 + s1) / 2, 0.014); // slightly platform-side so sliding leaves pass track-side cleanly
      const g = orientedBox(cx, platformY + (yBot + yTop) / 2, cz, s1 - s0, yTop - yBot, PSD_DETAIL.glassT, yaw).toNonIndexed();
      // Fixed panes never frost (the forest view stays open); only the sliding leaves are electrochromic.
      smartGlass.push(withFloatAttr(g, 'aRow', -1));
    };

    const addGlassBay = (s0: number, s1: number, maxTopY = PSD_DETAIL.transomBot): void => {
      const span = s1 - s0;
      if (span < 0.05) return;
      const lowered = maxTopY < PSD_DETAIL.transomBot - 0.05;
      const nBays = Math.max(1, Math.ceil(span / PSD_DETAIL.maxFixedBayW));
      const bayW = span / nBays;
      const glassTop = lowered ? maxTopY - 0.03 : maxTopY;
      // Slim satin-stainless base shoe across the bay; a hairline cap rail when lowered under overhead structure
      addMetalBar(s0, s1, 0, PSD_DETAIL.sillH, PSD_DETAIL.shoeD);
      if (lowered) addMetalBar(s0, s1, glassTop, maxTopY, 0.05);
      for (let b = 0; b < nBays; b++) {
        const a = s0 + b * bayW;
        const c = s0 + (b + 1) * bayW;
        addSmartPane(a + (b > 0 ? PSD_DETAIL.jointGap / 2 : 0), c - (b < nBays - 1 ? PSD_DETAIL.jointGap / 2 : 0), PSD_DETAIL.sillH, glassTop);
        if (b > 0) {
          addFitting(a, PSD_DETAIL.sillH);
          addFitting(a, glassTop - PSD_DETAIL.fitH);
        }
      }
      // Patch fittings clamp both free ends of the bay (door jambs, posts)
      for (const s of [s0 + PSD_DETAIL.fitW / 2, s1 - PSD_DETAIL.fitW / 2]) {
        addFitting(s, PSD_DETAIL.sillH);
        addFitting(s, glassTop - PSD_DETAIL.fitH);
      }
    };

    const lowSpan = spec.lowHeadroomSpan;
    const addGlassBayWithCut = (s0: number, s1: number): void => {
      if (!lowSpan || lowSpan[1] <= s0 + 0.04 || lowSpan[0] >= s1 - 0.04) {
        addGlassBay(s0, s1);
        return;
      }
      const c0 = Math.max(s0, lowSpan[0]), c1 = Math.min(s1, lowSpan[1]);
      if (c0 > s0 + 0.05) addGlassBay(s0, c0);
      // Slim full-height stainless posts frame the lowered guard under the escalator truss
      addMetalBar(c0 - PSD_DETAIL.postW / 2, c0 + PSD_DETAIL.postW / 2, 0, PSD_DETAIL.transomBot, PSD_DETAIL.shoeD);
      addGlassBay(c0 + PSD_DETAIL.postW / 2, c1 - PSD_DETAIL.postW / 2, lowSpan[2]);
      addMetalBar(c1 - PSD_DETAIL.postW / 2, c1 + PSD_DETAIL.postW / 2, 0, PSD_DETAIL.transomBot, PSD_DETAIL.shoeD);
      if (s1 > c1 + 0.05) addGlassBay(c1, s1);
    };

    // Row-local header: black-glass body boxes + fascia quads share the display call. Body UVs point into the plain dark fascia.
    const vTop = 1 - rIdx / numRows;
    const vBot = 1 - (rIdx + 1) / numRows;
    const vMid = (vTop + vBot) / 2;
    const addHeaderBody = (s0: number, s1: number): void => {
      if (s1 - s0 < 0.02) return;
      const [cx, cz] = ptS((s0 + s1) / 2);
      const g = orientedBox(cx, platformY + (PSD_DETAIL.transomBot + PSD.height) / 2, cz, s1 - s0, PSD.transomH, PSD_DETAIL.transomD, yaw).toNonIndexed();
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.012, vMid);
      displayParts.push(g);
    };
    if (lowSpan && lowSpan[1] > sMin && lowSpan[0] < sMax) {
      if (lowSpan[0] > sMin + 0.05) addHeaderBody(sMin, lowSpan[0]);
      if (sMax > lowSpan[1] + 0.05) addHeaderBody(lowSpan[1], sMax);
    } else {
      addHeaderBody(sMin, sMax);
    }
    // End posts
    addMetalBar(sMin, sMin + PSD_DETAIL.postW, 0, PSD_DETAIL.transomBot, PSD_DETAIL.shoeD);
    addMetalBar(sMax - PSD_DETAIL.postW, sMax, 0, PSD_DETAIL.transomBot, PSD_DETAIL.shoeD);

    // Fixed bays alternating with door openings
    const startSlot = leafSlots.length;
    let cursor = sMin + PSD_DETAIL.postW;
    for (let dIdx = 0; dIdx < doors.length; dIdx++) {
      const dc = doors[dIdx]!;
      const da = dc - doorHalf;
      const db = dc + doorHalf;
      if (da > cursor) addGlassBayWithCut(cursor, da);
      // Slim flush stainless threshold bar in doorway floor
      addMetalBar(da, db, 0, 0.012, PSD_DETAIL.shoeD);

      // Register left (-1) and right (+1) sliding door leaves
      const [loX, loZ] = ptS(0, PSD_DETAIL.leafOffsetOut);
      const slideDist = doorHalf - 0.02;
      for (const sgn of [-1, 1] as const) {
        leafSlots.push({
          ox: loX, oy: platformY, oz: loZ, dx, dz, yaw,
          baseS: dc + sgn * (PSD_DETAIL.leafGap + leafW / 2),
          slideSign: sgn, slideDist, open01: 0, row: rIdx,
        });
      }
      cursor = db;
    }
    if (sMax - PSD_DETAIL.postW > cursor) addGlassBayWithCut(cursor, sMax - PSD_DETAIL.postW);
    rowLeafRanges.push({ start: startSlot, doors: doors.length, doorCentres: doors });

    // Fascia quads facing the platform (+nx, +nz). Display panels (2048 px, ~600 px/m) are centred above every 2nd door pair (plus
    // the last door so both ends show signage); blank black glass with the satin line-colour hairline fills the rest.
    const fasciaN = PSD_DETAIL.transomD / 2 + 0.003;
    const fy0 = platformY + PSD_DETAIL.transomBot + 0.02;
    const fy1 = platformY + PSD.height - 0.02;
    const addFasciaQuad = (sa: number, sb: number, u0: number, u1: number): void => {
      const [ax, az] = ptS(sa, fasciaN);
      const [bx, bz] = ptS(sb, fasciaN);
      const p0 = v3(ax, fy0, az), p1 = v3(bx, fy0, bz), p2 = v3(bx, fy1, bz), p3 = v3(ax, fy1, az);
      const ref = v3(nx, 0, nz);
      const crossN = p1.clone().sub(p0).cross(p2.clone().sub(p0));
      const flip = crossN.dot(ref) < 0;
      const pts = flip ? [p0, p2, p1, p0, p3, p2] : [p0, p1, p2, p0, p2, p3];
      // Ensure text reads left-to-right when standing on the platform facing the screen doors!
      const uL = flip ? u1 : u0, uR = flip ? u0 : u1;
      const uvs: Array<[number, number]> = flip
        ? [[uL, vBot], [uR, vTop], [uR, vBot], [uL, vBot], [uL, vTop], [uR, vTop]]
        : [[uL, vBot], [uR, vBot], [uR, vTop], [uL, vBot], [uR, vTop], [uL, vTop]];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flatMap((t) => [t[0], t[1]]), 2));
      g.computeVertexNormals();
      displayParts.push(g);
    };
    const addFasciaClipped = (sa: number, sb: number, u0: number, u1: number): void => {
      if (!lowSpan || lowSpan[1] <= sa + 0.02 || lowSpan[0] >= sb - 0.02) {
        addFasciaQuad(sa, sb, u0, u1);
        return;
      }
      if (lowSpan[0] > sa + 0.05) addFasciaQuad(sa, lowSpan[0], 0.005, 0.03);
      if (sb > lowSpan[1] + 0.05) addFasciaQuad(lowSpan[1], sb, 0.005, 0.03);
    };
    const dispHalf = 1.7;
    const dispCentres = doors.length <= 4
      ? doors
      : doors.filter((_, i) => i % 2 === 0 || i === doors.length - 1);
    let fCur = -halfLen;
    for (const dc of dispCentres) {
      const a = Math.max(-halfLen, dc - dispHalf);
      const b = Math.min(+halfLen, dc + dispHalf);
      if (a > fCur + 0.02) addFasciaClipped(fCur, a, 0.005, 0.03);
      addFasciaClipped(a, b, 0.0, 1.0);
      fCur = b;
    }
    if (halfLen > fCur + 0.02) addFasciaClipped(fCur, halfLen, 0.005, 0.03);
  }

  // ---- Build batched meshes (5 draw calls total for the entire bank) ----
  const deepMaterials: THREE.Material[] = [];

  // Smart-glass uniforms shared by the fixed panes and the door leaves.
  const sgUniforms: SmartGlassUniforms = {
    uSgClarity: { value: specs.map(() => 0) },
    uSgTint: {
      value: specs.map((s) => {
        const lc = LINE_COLORS[s.track.line];
        const mx = Math.max(lc[0], lc[1], lc[2], 1e-4);
        return new THREE.Vector3(lc[0] / mx, lc[1] / mx, lc[2] / mx);
      }),
    },
    uSgPlat: { value: specs.map((s) => s.platformY) },
  };
  const fixedGlassMat = makeSmartGlass(kit.deep.glass, sgUniforms, numRows, 'Fixed');
  const doorGlassMat = makeSmartGlass(kit.deep.glass, sgUniforms, numRows, 'Door');
  const fittingMat = makeFittingMaterial();
  deepMaterials.push(fixedGlassMat, doorGlassMat, fittingMat);

  const metalGeo = metalBag.merge();
  if (metalGeo) {
    const m = new THREE.Mesh(metalGeo, kit.deep.stainless);
    m.name = `${name}Fittings`;
    group.add(m);
  }

  // Fixed glass: smart panes (aRow = row) + the caller's balustrade glass (aRow = -1, never frosted) in one call.
  for (const g0 of opts.extraFixedGlass ?? []) {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    for (const an of Object.keys(g.attributes)) if (an !== 'position' && an !== 'normal' && an !== 'uv') g.deleteAttribute(an);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    smartGlass.push(withFloatAttr(g, 'aRow', -1));
  }
  if (smartGlass.length > 0) {
    const glassGeo = mergeGeometries(smartGlass, false)!;
    for (const p of smartGlass) p.dispose();
    const m = new THREE.Mesh(glassGeo, fixedGlassMat);
    m.name = `${name}FixedGlass`;
    m.renderOrder = (kit.deep.glass.userData.renderOrder as number) ?? 2;
    m.userData.noShadow = true;
    group.add(m);
  }

  let doorFitMesh: THREE.InstancedMesh | null = null;
  let doorGlassMesh: THREE.InstancedMesh | null = null;
  let stripAttr: THREE.InstancedBufferAttribute | null = null;
  const writeLeafMatrix = (slotIdx: number): void => {
    const sl = leafSlots[slotIdx]!;
    const s = sl.baseS + sl.slideSign * sl.slideDist * sl.open01;
    _pos.set(sl.ox + sl.dx * s, sl.oy, sl.oz + sl.dz * s);
    // Right-hand leaves turn 180 degrees so both meeting edges (and their LED strips) sit on local +Z.
    _quat.setFromAxisAngle(_up, sl.yaw + (sl.slideSign === 1 ? Math.PI : 0));
    _mat.compose(_pos, _quat, _scale);
    doorFitMesh!.setMatrixAt(slotIdx, _mat);
    doorGlassMesh!.setMatrixAt(slotIdx, _mat);
  };

  if (leafSlots.length > 0) {
    const proto = buildLeafPrototypes(leafW);
    stripAttr = new THREE.InstancedBufferAttribute(new Float32Array(leafSlots.length), 1);
    stripAttr.setUsage(THREE.DynamicDrawUsage);
    proto.fit.setAttribute('aStrip', stripAttr);
    proto.glass.setAttribute('aRow', new THREE.InstancedBufferAttribute(Float32Array.from(leafSlots.map((l) => l.row)), 1));

    doorFitMesh = new THREE.InstancedMesh(proto.fit, fittingMat, leafSlots.length);
    doorFitMesh.name = `${name}DoorFittings`;
    doorFitMesh.userData.noShadow = true; // moving parts never bake into static shadow map

    doorGlassMesh = new THREE.InstancedMesh(proto.glass, doorGlassMat, leafSlots.length);
    doorGlassMesh.name = `${name}DoorGlass`;
    doorGlassMesh.renderOrder = (kit.deep.glass.userData.renderOrder as number) ?? 2;
    doorGlassMesh.userData.noShadow = true;

    for (let i = 0; i < leafSlots.length; i++) writeLeafMatrix(i);
    doorFitMesh.instanceMatrix.needsUpdate = true;
    doorGlassMesh.instanceMatrix.needsUpdate = true;
    doorFitMesh.computeBoundingSphere();
    doorGlassMesh.computeBoundingSphere();
    // Expand bounding sphere slightly by slide distance so open leaves never cull early
    if (doorFitMesh.boundingSphere) doorFitMesh.boundingSphere.radius += 1.0;
    if (doorGlassMesh.boundingSphere) doorGlassMesh.boundingSphere.radius += 1.0;
    group.add(doorFitMesh, doorGlassMesh);
  }

  const atlas = createDisplayAtlas(specs);
  if (displayParts.length > 0) {
    // All parts must share attributes (position, normal, uv) and indexing.
    const dispGeo = mergeGeometries(displayParts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
    for (const p of displayParts) p.dispose();
    const dispMat = new THREE.MeshStandardMaterial({
      name: `${name}TransomDisplay`,
      color: 0xffffff,
      map: atlas.map,
      emissive: 0xffffff,
      emissiveMap: atlas.emissiveMap,
      emissiveIntensity: 1.25,
      roughness: 0.14,
      metalness: 0.1,
      envMapIntensity: 0.85,
    });
    deepMaterials.push(dispMat);
    const dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.name = `${name}Displays`;
    dispMesh.userData.noShadow = true;
    group.add(dispMesh);
  }

  // ---- Per-row zero-allocation controllers ----
  /** Writes the light-strip state of one doorway: -1 closing (amber pulse), 0 off, 0..1 white (steady at >= 0.95 open). */
  const setStrips = (i0: number, v: number): void => {
    stripAttr!.setX(i0, v);
    stripAttr!.setX(i0 + 1, v);
    stripAttr!.needsUpdate = true;
  };
  /** Moves doorway starting at leaf slot `i0` to `clamped`; returns true when anything changed. */
  const moveDoor = (i0: number, clamped: number): boolean => {
    const sl0 = leafSlots[i0]!;
    const prev = sl0.open01;
    if (Math.abs(prev - clamped) < 1e-4) return false;
    sl0.open01 = clamped;
    leafSlots[i0 + 1]!.open01 = clamped;
    writeLeafMatrix(i0);
    writeLeafMatrix(i0 + 1);
    setStrips(i0, clamped >= 0.95 ? 1 : clamped <= 0.001 ? 0 : clamped < prev ? -1 : clamped / 0.95);
    return true;
  };

  const rows: PsdController[] = specs.map((spec, rIdx) => {
    const range = rowLeafRanges[rIdx]!;
    let lastText = spec.initialDisplay;
    let lastCountdown = '-- min';
    let clarity = 0;
    const setOpen = (doorIndex: number, f: number): void => {
      if (doorIndex < 0 || doorIndex >= range.doors || !doorFitMesh || !doorGlassMesh) return;
      const clamped = f < 0 ? 0 : f > 1 ? 1 : f;
      if (!moveDoor(range.start + doorIndex * 2, clamped)) return;
      doorFitMesh.instanceMatrix.needsUpdate = true;
      doorGlassMesh.instanceMatrix.needsUpdate = true;
    };
    const setAll = (f: number): void => {
      const clamped = f < 0 ? 0 : f > 1 ? 1 : f;
      if (!doorFitMesh || !doorGlassMesh) return;
      let dirty = false;
      for (let d = 0; d < range.doors; d++) if (moveDoor(range.start + d * 2, clamped)) dirty = true;
      if (dirty) {
        doorFitMesh.instanceMatrix.needsUpdate = true;
        doorGlassMesh.instanceMatrix.needsUpdate = true;
      }
    };
    const redraw = (): void => atlas.drawRow(rIdx, { text: lastText, countdown: lastCountdown });
    const setDisplay = (text: string): void => {
      if (text === lastText) return;
      lastText = text;
      redraw();
    };
    const setCountdown = (label: string): void => {
      if (label === lastCountdown) return;
      lastCountdown = label;
      redraw();
    };
    const setClarity = (c: number): void => {
      const v = c < 0 ? 0 : c > 1 ? 1 : c;
      if (Math.abs(v - clarity) < 1e-4) return;
      clarity = v;
      sgUniforms.uSgClarity.value[rIdx] = v;
    };
    const getDisplay = (): string => lastText;
    const maxOpen = (): number => {
      let m = 0;
      for (let d = 0; d < range.doors; d++) {
        const v = leafSlots[range.start + d * 2]!.open01;
        if (v > m) m = v;
      }
      return m;
    };
    return {
      doorCount: range.doors, doorCentres: range.doorCentres, setOpen, setAll, setDisplay, getDisplay,
      setCountdown, setClarity, getClarity: () => clarity, maxOpen,
    };
  });

  return { group, rows, deepMaterials };
}

/** Single-row convenience API matching spec (`createPsdRow(track, side, opts)`). */
export function createPsdRow(
  track: MetroTrack,
  side: 1 | -1,
  opts: Omit<PsdRowSpec, 'track' | 'side'> & { lib: MaterialLibrary; kit: MetroMaterials; name?: string },
): PsdRow {
  const bank = createPsdBank([{ ...opts, track, side }], opts.lib, opts.kit, { name: opts.name ?? `psd_${track.line}_${track.track}` });
  const ctrl = bank.rows[0]!;
  return { group: bank.group, deepMaterials: bank.deepMaterials, ...ctrl };
}
