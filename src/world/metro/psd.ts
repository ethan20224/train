import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { METRO_TRAIN, PSD } from '../../layoutMetro';
import { doorOffsets, type MetroTrack } from '../../metro/tracks';
import { LINE_COLORS } from '../../metro/trainModel';
import { GeoBag, v3 } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * Reusable full-height platform-screen-door system (spec §2.6, §4; Phase 3 task P3-3, reused by P3-4 Vesper,
 * P3-5 Halcyon and P3-8b Funicular).
 *
 * Precision 2035 transit screen doors:
 *  - 2.6 m total height: 0.08 m base sill, ultra-clear structural glass fixed bays framed by slim 50 mm champagne
 *    anodised aluminium mullions, 0.25 m top transom housing;
 *  - sliding door pairs centred on `doorOffsets()` (1.56 m clear aperture >= train 1.44 m + 0.10 m), instanced with
 *    zero per-frame allocations;
 *  - transom fascia with dark glass backing, hairline white dot-matrix display (emissive text only) and non-emissive
 *    satin line-colour accent bar along its bottom lip (Ruling 8).
 *
 * `createPsdBank` batches all rows on an island into 5 draw calls total (static champagne, fixed glass, instanced
 * door frames, instanced door glass, shared transom fascia).
 */

const PSD_DETAIL = {
  sillH: 0.08,
  transomBot: PSD.height - PSD.transomH, // 2.35 m
  mullionD: 0.08,
  transomD: 0.14,
  glassT: 0.014,
  leafGap: 0.004,
  leafStileW: 0.036,
  leafTopRailH: 0.055,
  leafBotRailH: 0.065,
  leafThickness: 0.028,
  /** Leaves sit slightly track-side of the fixed glass so they slide smoothly behind the fixed bays. */
  leafOffsetOut: -0.028,
  /** Max span between vertical intermediate mullions in fixed bays. */
  maxFixedBayW: 2.3,
  /** Display panel width along the transom (one display above every 2nd door pair = 6 per 90 m platform). */
  displayW: 2.4,
  displayH: 0.19,
  canvasW: 1024,
  canvasRowH: 64,
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
  /** Initial transom display text (e.g. 'MERIDIAN LINE · NORTHBOUND'). */
  initialDisplay: string;
}

export interface PsdController {
  readonly doorCount: number;
  readonly doorCentres: readonly number[];
  setOpen(doorIndex: number, f: number): void;
  setAll(f: number): void;
  setDisplay(text: string): void;
  getDisplay(): string;
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

/** Single sliding door leaf prototype in local space: width `leafW` along Z (centred at 0), height along Y (0.02..2.35), thickness along X. */
function buildLeafPrototypes(leafW: number): { frame: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const y0 = 0.02, y1 = PSD_DETAIL.transomBot - 0.01;
  const sw = PSD_DETAIL.leafStileW;
  const th = PSD_DETAIL.leafThickness;
  const bh = PSD_DETAIL.leafBotRailH;
  const topH = PSD_DETAIL.leafTopRailH;

  const fParts: THREE.BufferGeometry[] = [];
  const addF = (dx: number, dy: number, dz: number, x: number, y: number, z: number): void => {
    const g = new THREE.BoxGeometry(dx, dy, dz);
    g.translate(x, y, z);
    fParts.push(g.index ? g.toNonIndexed() : g);
  };
  // Bottom rail, top rail, left & right slender stiles
  addF(th, bh, leafW, 0, y0 + bh / 2, 0);
  addF(th, topH, leafW, 0, y1 - topH / 2, 0);
  const midH = y1 - topH - (y0 + bh);
  const midY = y0 + bh + midH / 2;
  addF(th, midH, sw, 0, midY, -leafW / 2 + sw / 2);
  addF(th, midH, sw, 0, midY, +leafW / 2 - sw / 2);

  const frame = mergeGeometries(fParts, false)!;
  for (const p of fParts) p.dispose();
  frame.computeBoundingSphere();

  const glass = new THREE.BoxGeometry(PSD_DETAIL.glassT, midH + 0.01, Math.max(0.05, leafW - 2 * sw + 0.01));
  glass.translate(0, midY, 0);
  glass.computeBoundingSphere();
  return { frame, glass };
}

/** Shared canvas pair for a bank of PSD rows: `color` (dark glass + non-emissive satin line bar + text) and `emissive` (text only). */
function createDisplayAtlas(
  specs: readonly PsdRowSpec[],
  renderer?: THREE.WebGLRenderer,
): {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  drawRow: (rowIndex: number, text: string) => void;
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

  const map = new THREE.CanvasTexture(cColor);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;

  const emissiveMap = new THREE.CanvasTexture(cEmis);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.ClampToEdgeWrapping;
  emissiveMap.anisotropy = map.anisotropy;

  const linToSrgbByte = (v: number): number => {
    const c = Math.max(0, Math.min(1, v));
    const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(s * 255);
  };

  const drawRow = (rowIndex: number, text: string): void => {
    const spec = specs[rowIndex]!;
    const yOff = rowIndex * RH;
    const lc = LINE_COLORS[spec.track.line];
    // Non-emissive satin enamel accent bar (slightly restrained value so it never reads as neon).
    const barCss = `rgb(${linToSrgbByte(lc[0] * 0.85)}, ${linToSrgbByte(lc[1] * 0.85)}, ${linToSrgbByte(lc[2] * 0.85)})`;

    // Color canvas: smoked dark-slate glass fascia + crisp non-emissive satin line accent bar + hairline dot-matrix text
    gColor.fillStyle = '#171c24';
    gColor.fillRect(0, yOff, W, RH);
    // Non-emissive satin enamel accent bar along the bottom edge (Ruling 8: never glows)
    const barCssFull = `rgb(${linToSrgbByte(lc[0])}, ${linToSrgbByte(lc[1])}, ${linToSrgbByte(lc[2])})`;
    gColor.fillStyle = barCssFull;
    gColor.fillRect(0, yOff + RH - 10, W, 10);

    // Emissive canvas: pure black everywhere (accent bar NEVER glows — Ruling 8), hairline white text ONLY
    gEmis.fillStyle = '#000000';
    gEmis.fillRect(0, yOff, W, RH);

    const font = '500 26px "SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace';
    const label = text.toUpperCase();
    for (const ctx of [gColor, gEmis]) {
      ctx.save();
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ctx === gEmis ? '#dce6f2' : '#f2f6fb';
      // Hairline letter spacing via spaced glyphs (auto-tighten if a long label approaches canvas width)
      const chars = [...label];
      let glyphSum = 0;
      for (const ch of chars) glyphSum += ctx.measureText(ch).width;
      const maxSpacing = chars.length > 1 ? Math.max(0.8, (W - 48 - glyphSum) / (chars.length - 1)) : 3.6;
      const spacing = Math.min(3.6, maxSpacing);
      const totalW = glyphSum + spacing * Math.max(0, chars.length - 1);
      let cx = (W - totalW) / 2;
      const cy = yOff + (RH - 10) / 2 + 1;
      for (const ch of chars) {
        const w = ctx.measureText(ch).width;
        ctx.fillText(ch, cx + w / 2, cy);
        cx += w + spacing;
      }
      // Subtle dot-matrix scan grid over the text region (physical LED matrix texture)
      ctx.fillStyle = ctx === gEmis ? 'rgba(0,0,0,0.24)' : 'rgba(20,24,32,0.22)';
      for (let py = yOff + 4; py < yOff + RH - 12; py += 4) ctx.fillRect(0, py, W, 1);
      ctx.restore();
    }
    void barCss;
    map.needsUpdate = true;
    emissiveMap.needsUpdate = true;
  };

  for (let i = 0; i < specs.length; i++) drawRow(i, specs[i]!.initialDisplay);
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

  const metalBag = new GeoBag(lib, 'brass', kit.metersPerTile.champagne);
  const glassBag = new GeoBag(lib, 'glass', 1);
  if (opts.extraFixedGlass) {
    for (const g of opts.extraFixedGlass) glassBag.add(g);
  }

  // Per-leaf transform table for the single InstancedMesh pair (frames + glass).
  interface LeafSlot {
    ox: number; oy: number; oz: number;
    dx: number; dz: number;
    yaw: number;
    baseS: number;
    slideSign: 1 | -1;
    slideDist: number;
    open01: number;
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

    const addMetalBar = (s0: number, s1: number, y0: number, y1: number, depth: number = PSD_DETAIL.mullionD, nShift = 0): void => {
      const len = s1 - s0;
      if (len < 1e-4 || y1 - y0 < 1e-4) return;
      const [cx, cz] = ptS((s0 + s1) / 2, nShift);
      metalBag.add(orientedBox(cx, platformY + (y0 + y1) / 2, cz, len, y1 - y0, depth, yaw));
    };

    const addGlassBay = (s0: number, s1: number, maxTopY = PSD_DETAIL.transomBot): void => {
      const span = s1 - s0;
      if (span < 0.05) return;
      const nBays = Math.max(1, Math.ceil(span / PSD_DETAIL.maxFixedBayW));
      const bayW = span / nBays;
      // Continuous slim base sill across fixed span (and top cap rail when lowered under overhead structure)
      addMetalBar(s0, s1, 0, PSD_DETAIL.sillH, PSD_DETAIL.mullionD);
      if (maxTopY < PSD_DETAIL.transomBot - 0.05) {
        addMetalBar(s0, s1, maxTopY - 0.05, maxTopY, PSD_DETAIL.mullionD);
      }
      for (let b = 0; b < nBays; b++) {
        const a = s0 + b * bayW;
        const c = s0 + (b + 1) * bayW;
        if (b > 0) {
          // Slim 50 mm intermediate mullion
          addMetalBar(a - PSD.mullionW / 2, a + PSD.mullionW / 2, PSD_DETAIL.sillH, maxTopY, PSD_DETAIL.mullionD);
        }
        const ga = a + PSD.mullionW / 2;
        const gc = c - PSD.mullionW / 2;
        const glassTop = maxTopY < PSD_DETAIL.transomBot - 0.05 ? maxTopY - 0.05 : maxTopY;
        if (gc - ga > 0.04 && glassTop > PSD_DETAIL.sillH + 0.05) {
          const [cx, cz] = ptS((ga + gc) / 2, 0.014); // slightly platform-side so sliding leaves pass track-side cleanly
          glassBag.add(orientedBox(
            cx, platformY + (PSD_DETAIL.sillH + glassTop) / 2, cz,
            gc - ga, glassTop - PSD_DETAIL.sillH, PSD_DETAIL.glassT, yaw,
          ));
        }
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
      addMetalBar(c0 - PSD.mullionW / 2, c0 + PSD.mullionW / 2, 0, PSD_DETAIL.transomBot, PSD_DETAIL.mullionD);
      addGlassBay(c0 + PSD.mullionW / 2, c1 - PSD.mullionW / 2, lowSpan[2]);
      addMetalBar(c1 - PSD.mullionW / 2, c1 + PSD.mullionW / 2, 0, PSD_DETAIL.transomBot, PSD_DETAIL.mullionD);
      if (s1 > c1 + 0.05) addGlassBay(c1, s1);
    };

    // Continuous top transom housing along the entire PSD + fixed-extension span (interrupted cleanly at lowHeadroomSpan)
    if (lowSpan && lowSpan[1] > sMin && lowSpan[0] < sMax) {
      if (lowSpan[0] > sMin + 0.05) addMetalBar(sMin, lowSpan[0], PSD_DETAIL.transomBot, PSD.height, PSD_DETAIL.transomD);
      if (sMax > lowSpan[1] + 0.05) addMetalBar(lowSpan[1], sMax, PSD_DETAIL.transomBot, PSD.height, PSD_DETAIL.transomD);
    } else {
      addMetalBar(sMin, sMax, PSD_DETAIL.transomBot, PSD.height, PSD_DETAIL.transomD);
    }
    // End posts
    addMetalBar(sMin, sMin + PSD.mullionW, 0, PSD_DETAIL.transomBot, PSD_DETAIL.mullionD);
    addMetalBar(sMax - PSD.mullionW, sMax, 0, PSD_DETAIL.transomBot, PSD_DETAIL.mullionD);

    // Fixed bays alternating with door openings
    const startSlot = leafSlots.length;
    let cursor = sMin + PSD.mullionW;
    for (let dIdx = 0; dIdx < doors.length; dIdx++) {
      const dc = doors[dIdx]!;
      const da = dc - doorHalf;
      const db = dc + doorHalf;
      // Mullions flanking the door opening
      if (da - PSD.mullionW > cursor) addGlassBayWithCut(cursor, da - PSD.mullionW);
      addMetalBar(da - PSD.mullionW, da, 0, PSD_DETAIL.transomBot, PSD_DETAIL.mullionD + 0.015);
      addMetalBar(db, db + PSD.mullionW, 0, PSD_DETAIL.transomBot, PSD_DETAIL.mullionD + 0.015);
      // Slim flush stainless/champagne threshold bar in doorway floor
      addMetalBar(da, db, 0, 0.012, PSD_DETAIL.mullionD);

      // Register left (-1) and right (+1) sliding door leaves
      const [loX, loZ] = ptS(0, PSD_DETAIL.leafOffsetOut);
      const slideDist = doorHalf - 0.02;
      for (const sgn of [-1, 1] as const) {
        leafSlots.push({
          ox: loX, oy: platformY, oz: loZ, dx, dz, yaw,
          baseS: dc + sgn * (PSD_DETAIL.leafGap + leafW / 2),
          slideSign: sgn, slideDist, open01: 0,
        });
      }
      cursor = db + PSD.mullionW;
    }
    if (sMax - PSD.mullionW > cursor) addGlassBayWithCut(cursor, sMax - PSD.mullionW);
    rowLeafRanges.push({ start: startSlot, doors: doors.length, doorCentres: doors });

    // Transom fascia quads facing the platform (+nx, +nz): framed inside slim visible champagne top/bottom rails
    // (32 mm top cap, 24 mm bottom lip) so the transom reads as precision champagne architecture, not a black bar.
    const vTop = 1 - rIdx / numRows;
    const vBot = 1 - (rIdx + 1) / numRows;
    const fasciaN = PSD_DETAIL.transomD / 2 + 0.003;
    const fy0 = platformY + PSD_DETAIL.transomBot + 0.026;
    const fy1 = platformY + PSD.height - 0.032;
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

    // Place crisp 3.4 m display panels centred above every 2nd door pair (plus the last door so both ends show signage),
    // with blank smoked-glass + continuous line-accent fascia strips between them (clipping cleanly around lowHeadroomSpan).
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

  const metalGeo = metalBag.merge();
  if (metalGeo) {
    const m = new THREE.Mesh(metalGeo, kit.deep.champagne);
    m.name = `${name}Mullions`;
    group.add(m);
  }

  const glassGeo = glassBag.merge();
  if (glassGeo) {
    const m = new THREE.Mesh(glassGeo, kit.deep.glass);
    m.name = `${name}FixedGlass`;
    m.renderOrder = (kit.deep.glass.userData.renderOrder as number) ?? 2;
    m.userData.noShadow = true;
    group.add(m);
  }

  let doorFramesMesh: THREE.InstancedMesh | null = null;
  let doorGlassMesh: THREE.InstancedMesh | null = null;
  const writeLeafMatrix = (slotIdx: number): void => {
    const sl = leafSlots[slotIdx]!;
    const s = sl.baseS + sl.slideSign * sl.slideDist * sl.open01;
    _pos.set(sl.ox + sl.dx * s, sl.oy, sl.oz + sl.dz * s);
    _quat.setFromAxisAngle(_up, sl.yaw);
    _mat.compose(_pos, _quat, _scale);
    doorFramesMesh!.setMatrixAt(slotIdx, _mat);
    doorGlassMesh!.setMatrixAt(slotIdx, _mat);
  };

  if (leafSlots.length > 0) {
    const proto = buildLeafPrototypes(leafW);
    doorFramesMesh = new THREE.InstancedMesh(proto.frame, kit.deep.champagne, leafSlots.length);
    doorFramesMesh.name = `${name}DoorFrames`;
    doorFramesMesh.userData.noShadow = true; // moving parts never bake into static shadow map

    doorGlassMesh = new THREE.InstancedMesh(proto.glass, kit.deep.glass, leafSlots.length);
    doorGlassMesh.name = `${name}DoorGlass`;
    doorGlassMesh.renderOrder = (kit.deep.glass.userData.renderOrder as number) ?? 2;
    doorGlassMesh.userData.noShadow = true;

    for (let i = 0; i < leafSlots.length; i++) writeLeafMatrix(i);
    doorFramesMesh.instanceMatrix.needsUpdate = true;
    doorGlassMesh.instanceMatrix.needsUpdate = true;
    doorFramesMesh.computeBoundingSphere();
    doorGlassMesh.computeBoundingSphere();
    // Expand bounding sphere slightly by slide distance so open leaves never cull early
    if (doorFramesMesh.boundingSphere) doorFramesMesh.boundingSphere.radius += 1.0;
    if (doorGlassMesh.boundingSphere) doorGlassMesh.boundingSphere.radius += 1.0;
    group.add(doorFramesMesh, doorGlassMesh);
  }

  const atlas = createDisplayAtlas(specs);
  if (displayParts.length > 0) {
    const dispGeo = mergeGeometries(displayParts, false)!;
    for (const p of displayParts) p.dispose();
    const dispMat = new THREE.MeshStandardMaterial({
      name: `${name}TransomDisplay`,
      color: 0xffffff,
      map: atlas.map,
      emissive: 0xffffff,
      emissiveMap: atlas.emissiveMap,
      emissiveIntensity: 1.15,
      roughness: 0.16,
      metalness: 0.12,
      envMapIntensity: 0.85,
    });
    deepMaterials.push(dispMat);
    const dispMesh = new THREE.Mesh(dispGeo, dispMat);
    dispMesh.name = `${name}Displays`;
    dispMesh.userData.noShadow = true;
    group.add(dispMesh);
  }

  // ---- Per-row zero-allocation controllers ----
  const rows: PsdController[] = specs.map((spec, rIdx) => {
    const range = rowLeafRanges[rIdx]!;
    let lastText = spec.initialDisplay;
    const setOpen = (doorIndex: number, f: number): void => {
      if (doorIndex < 0 || doorIndex >= range.doors || !doorFramesMesh || !doorGlassMesh) return;
      const clamped = f < 0 ? 0 : f > 1 ? 1 : f;
      const i0 = range.start + doorIndex * 2;
      const sl0 = leafSlots[i0]!;
      if (Math.abs(sl0.open01 - clamped) < 1e-4) return;
      sl0.open01 = clamped;
      leafSlots[i0 + 1]!.open01 = clamped;
      writeLeafMatrix(i0);
      writeLeafMatrix(i0 + 1);
      doorFramesMesh.instanceMatrix.needsUpdate = true;
      doorGlassMesh.instanceMatrix.needsUpdate = true;
    };
    const setAll = (f: number): void => {
      const clamped = f < 0 ? 0 : f > 1 ? 1 : f;
      if (!doorFramesMesh || !doorGlassMesh) return;
      let dirty = false;
      for (let d = 0; d < range.doors; d++) {
        const i0 = range.start + d * 2;
        const sl0 = leafSlots[i0]!;
        if (Math.abs(sl0.open01 - clamped) < 1e-4) continue;
        sl0.open01 = clamped;
        leafSlots[i0 + 1]!.open01 = clamped;
        writeLeafMatrix(i0);
        writeLeafMatrix(i0 + 1);
        dirty = true;
      }
      if (dirty) {
        doorFramesMesh.instanceMatrix.needsUpdate = true;
        doorGlassMesh.instanceMatrix.needsUpdate = true;
      }
    };
    const setDisplay = (text: string): void => {
      if (text === lastText) return;
      lastText = text;
      atlas.drawRow(rIdx, text);
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
    return { doorCount: range.doors, doorCentres: range.doorCentres, setOpen, setAll, setDisplay, getDisplay, maxOpen };
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
  return {
    group: bank.group,
    deepMaterials: bank.deepMaterials,
    doorCount: ctrl.doorCount,
    doorCentres: ctrl.doorCentres,
    setOpen: ctrl.setOpen,
    setAll: ctrl.setAll,
    setDisplay: ctrl.setDisplay,
    getDisplay: ctrl.getDisplay,
    maxOpen: ctrl.maxOpen,
  };
}
