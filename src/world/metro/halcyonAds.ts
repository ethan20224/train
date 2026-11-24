import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALCYON, HALCYON_ART, SHELL, halcyonPoint } from '../../layoutMetro';
import { dayNight } from '../../metro/dayNight';
import type { MetroMaterials } from './materials';

/**
 * Recessed museum-grade backlit editorial vitrines at the SW end of the Halcyon hall (user-approved 2026-11-24).
 *
 * Placement (single source of truth in `HALCYON_ART.ads`, src/layoutMetro.ts):
 *  - NW long wall (t = +10, eye-level behind Track 0 screen doors): 3 landscape vitrines snapped to alternating
 *    stack-bond stone bays [4, 6, 8] — Leica (past the train nose, always clear), Omega and Apple (behind the clear
 *    fixed glass beside planter W1, calmly occluded when a train docks and revealed as it departs).
 *  - SW end wall (s = -55, center pier t in [-1.35, +1.35]): 1 tall vertical hero vitrine ("Hollow Bay — Direct from
 *    Meridian Deep"), aligned to the two flanking tunnel portal lintels (y = -78.20).
 *
 * Craft & rendering budget (3 draw calls total):
 *  1. `halcyonAdsFrames` — 3D recessed brushed-stainless perimeter bezels + dark anodised 34 mm shadow-box liners.
 *  2. `halcyonAdsPrints` — ONE 4096x2048 high-DPI Swiss-minimalist canvas atlas with a custom physical backlit-diffuser
 *     shader (calibrated < 1.0 luminance so it never blooms, subtle bezel edge-shadow falloff, day/night adaptation).
 *  3. `halcyonAdsGlass`  — anti-reflective low-iron cover glass set 34 mm in front of each print for real parallax depth
 *     and soft oak-ceiling / train reflections (renderOrder = 1, cleanly behind foreground PSD glass at renderOrder = 2).
 */

export interface HalcyonAdsBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  calls: number;
}

export interface HalcyonAdsOpts {
  renderer?: THREE.WebGLRenderer;
}

type V3 = readonly [number, number, number];
type RGB = readonly [number, number, number];

const UX = HALCYON.dir[0];
const UZ = HALCYON.dir[1];
const VX = -UZ;
const VZ = UX;
const L_HALL = HALCYON.halfLength + HALCYON.portalExtra; // 55
const W_HALL = HALCYON.hallHalfWidth; // 10
const ADS = HALCYON_ART.ads;

const wp = (s: number, y: number, t: number): V3 => {
  const [x, z] = halcyonPoint(s, t);
  return [x, y, z];
};

/** Exact column joint coordinate on the NW wall stack-bond grid (matches halcyon.ts). */
export function halcyonNwBaySpan(bayIndex: number): readonly [number, number] {
  const nCols = Math.round((2 * L_HALL) / SHELL.panelW); // 37
  const s0 = -L_HALL + (2 * L_HALL * bayIndex) / nCols;
  const s1 = -L_HALL + (2 * L_HALL * (bayIndex + 1)) / nCols;
  return [s0, s1];
}

// ---- Shared day/night uniforms (zero per-frame allocation) ---------------------------------------------------------

const AD_UNIFORMS = {
  night: { value: 0 },
  golden: { value: 0 },
};
const syncAdUniforms = (): void => {
  AD_UNIFORMS.night.value = dayNight.state.night;
  AD_UNIFORMS.golden.value = dayNight.state.golden;
};

// ---- 4096 x 2048 High-DPI Swiss Graphic Atlas ----------------------------------------------------------------------

const ATLAS_W = 4096;
const ATLAS_H = 2048;

interface CellRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const CELLS = {
  leica: { x: 24, y: 24, w: 1320, h: 816 },
  omega: { x: 1368, y: 24, w: 1320, h: 816 },
  apple: { x: 24, y: 1048, w: 1320, h: 816 },
  hollowBay: { x: 2720, y: 24, w: 1352, h: 1750 },
} as const satisfies Record<string, CellRect>;

type PosterId = keyof typeof CELLS;

const SANS = '"Helvetica Neue", "Inter", "SF Pro Display", Helvetica, Arial, sans-serif';

function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Deterministic PRNG for subtle matte paper/diffuser grain. */
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

/** Pre-baked fine cotton-paper / acrylic diffuser grain pattern (tiled cleanly, ~2% amplitude). */
function makePaperGrainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const rnd = mulberry32(203501);
  for (let i = 0; i < S * S; i++) {
    const v = rnd();
    const bright = v > 0.5 ? 255 : 0;
    const alpha = Math.round(Math.abs(v - 0.5) * 16); // very subtle micro-grain
    img.data[i * 4] = bright;
    img.data[i * 4 + 1] = bright;
    img.data[i * 4 + 2] = bright;
    img.data[i * 4 + 3] = alpha;
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}

function withClippedCell(
  ctx: CanvasRenderingContext2D,
  r: CellRect,
  grain: CanvasPattern | null,
  draw: (x: number, y: number, w: number, h: number) => void,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  draw(r.x, r.y, r.w, r.h);
  if (grain) {
    ctx.fillStyle = grain;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

// ---- Poster 1: LEICA (Optical precision, Swiss grid, single vermilion dot) -----------------------------------------

function drawLeica(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // Warm museum paper ground
  const bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, '#eeeae2');
  bg.addColorStop(1, '#e3ded4');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  // Subtle architectural drafting hairlines anchoring the Swiss grid
  const pad = 68;
  const splitX = x + Math.round(w * 0.445);
  ctx.strokeStyle = 'rgba(20, 22, 26, 0.08)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(splitX, y + pad);
  ctx.lineTo(splitX, y + h - pad);
  ctx.stroke();

  // Top-left: Iconic Leica vermilion roundel + refined wordmark
  const lx = x + pad + 34;
  const ly = y + pad + 34;
  ctx.fillStyle = '#c41e24';
  ctx.beginPath();
  ctx.arc(lx, ly, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8f6f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 500 22px Georgia, "Times New Roman", serif`;
  setTracking(ctx, 0.5);
  ctx.fillText('Leica', lx, ly + 1);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#5c5a55';
  setTracking(ctx, 4.5);
  ctx.font = `500 16px ${SANS}`;
  ctx.fillText('WETZLAR  ·  OPTIK', lx + 54, ly + 1);

  // Left editorial typography (generous Swiss whitespace)
  const textX = x + pad;
  const headY = y + h * 0.50;
  ctx.strokeStyle = '#181a1d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(textX, headY - 62);
  ctx.lineTo(textX + 64, headY - 62);
  ctx.stroke();

  setTracking(ctx, -1.5);
  ctx.fillStyle = '#15171a';
  ctx.font = `300 76px ${SANS}`;
  ctx.fillText('See only', textX, headY);
  ctx.font = `500 76px ${SANS}`;
  ctx.fillText('what remains.', textX, headY + 84);

  setTracking(ctx, 2.8);
  ctx.fillStyle = '#605e58';
  ctx.font = `500 15px ${SANS}`;
  ctx.fillText('M12  ·  SUMMILUX-M 1:1.4/50 ASPH.', textX, y + h - pad - 8);

  // Right 55%: Precision machined rangefinder optical lens & 9-blade iris diagram
  const cx = x + w * 0.728;
  const cy = y + h * 0.50;
  const R = h * 0.375;

  // Soft ambient contact drop shadow beneath the machined barrel
  const sh = ctx.createRadialGradient(cx + 12, cy + 16, R * 0.65, cx + 12, cy + 16, R * 1.18);
  sh.addColorStop(0, 'rgba(18, 20, 24, 0.22)');
  sh.addColorStop(0.68, 'rgba(18, 20, 24, 0.08)');
  sh.addColorStop(1, 'rgba(18, 20, 24, 0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(cx + 12, cy + 16, R * 1.18, 0, Math.PI * 2);
  ctx.fill();

  // Outer black-anodised barrel ring
  const outerG = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  outerG.addColorStop(0, '#2a2d33');
  outerG.addColorStop(0.45, '#15171b');
  outerG.addColorStop(1, '#23262c');
  ctx.fillStyle = outerG;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // Subtle machined knurl ticks around outer barrel rim
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R * 0.94), cy + Math.sin(a) * (R * 0.94));
    ctx.lineTo(cx + Math.cos(a) * (R * 0.985), cy + Math.sin(a) * (R * 0.985));
    ctx.stroke();
  }

  // Satin brushed-silver aperture scale collar
  const silverG = ctx.createLinearGradient(cx - R * 0.88, cy - R * 0.88, cx + R * 0.88, cy + R * 0.88);
  silverG.addColorStop(0, '#dcdfe3');
  silverG.addColorStop(0.5, '#b6bcc4');
  silverG.addColorStop(1, '#d3d7dc');
  ctx.fillStyle = silverG;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.89, 0, Math.PI * 2);
  ctx.fill();

  // Recessed black inner barrel step
  ctx.fillStyle = '#14161a';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.745, 0, Math.PI * 2);
  ctx.fill();

  // Aperture f-stop markings engraved along the top arc of the silver ring
  const stops = ['1.4', '2', '2.8', '4', '5.6', '8', '11', '16'];
  ctx.fillStyle = '#1a1c20';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setTracking(ctx, 0);
  ctx.font = `600 17px ${SANS}`;
  for (let i = 0; i < stops.length; i++) {
    const ang = -Math.PI * 0.82 + (i / (stops.length - 1)) * (Math.PI * 0.64);
    const tx = cx + Math.cos(ang) * (R * 0.818);
    const ty = cy + Math.sin(ang) * (R * 0.818);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillText(stops[i]!, 0, 0);
    ctx.restore();
  }
  // Single signature Leica red alignment dot at 12 o'clock on the outer black ring
  ctx.fillStyle = '#c41e24';
  ctx.beginPath();
  ctx.arc(cx, cy - R * 0.915, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // Concentric fine baffle threads inside the black housing
  for (let k = 0; k < 5; k++) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.06 + k * 0.012})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.71 - k * 0.036), 0, Math.PI * 2);
    ctx.stroke();
  }

  // 9-blade overlapping machined iris diaphragm
  const rIrisOut = R * 0.54;
  const rIrisIn = R * 0.27;
  const blades = 9;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rIrisOut, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#181b20';
  ctx.fillRect(cx - rIrisOut, cy - rIrisOut, rIrisOut * 2, rIrisOut * 2);

  for (let i = 0; i < blades; i++) {
    const a0 = (i / blades) * Math.PI * 2 - 0.35;
    const a1 = ((i + 1) / blades) * Math.PI * 2 - 0.35;
    const a2 = ((i + 2.3) / blades) * Math.PI * 2 - 0.35;
    const shade = 25 + (i % 3) * 7;
    ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 5})`;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * rIrisIn, cy + Math.sin(a0) * rIrisIn);
    ctx.lineTo(cx + Math.cos(a1) * rIrisIn, cy + Math.sin(a1) * rIrisIn);
    ctx.lineTo(cx + Math.cos(a2) * rIrisOut * 1.12, cy + Math.sin(a2) * rIrisOut * 1.12);
    ctx.lineTo(cx + Math.cos(a0 + 0.5) * rIrisOut * 1.12, cy + Math.sin(a0 + 0.5) * rIrisOut * 1.12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();

  // Central multi-coated optical glass aperture + subtle AR coating reflections
  const glassG = ctx.createRadialGradient(cx - rIrisIn * 0.25, cy - rIrisIn * 0.25, 4, cx, cy, rIrisIn);
  glassG.addColorStop(0, '#19222b');
  glassG.addColorStop(0.55, '#0b0e14');
  glassG.addColorStop(1, '#06070a');
  ctx.fillStyle = glassG;
  ctx.beginPath();
  ctx.arc(cx, cy, rIrisIn, 0, Math.PI * 2);
  ctx.fill();

  // Soft cyan-emerald AR coating crescent (top-left) & subtle magenta counter-glint (bottom-right)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rIrisIn * 0.94, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(130, 210, 198, 0.32)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx + rIrisIn * 0.12, cy + rIrisIn * 0.12, rIrisIn * 0.86, Math.PI * 1.06, Math.PI * 1.46);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(182, 138, 210, 0.22)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx - rIrisIn * 0.08, cy - rIrisIn * 0.08, rIrisIn * 0.78, Math.PI * 0.12, Math.PI * 0.42);
  ctx.stroke();
  ctx.restore();

  // Fine architectural crosshair ticks outside the barrel
  ctx.strokeStyle = 'rgba(20, 22, 26, 0.25)';
  ctx.lineWidth = 1.2;
  for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * (R + 14), cy + Math.sin(ang) * (R + 14));
    ctx.lineTo(cx + Math.cos(ang) * (R + 30), cy + Math.sin(ang) * (R + 30));
    ctx.stroke();
  }
}

// ---- Poster 2: OMEGA (Horological stillness, cropped Swiss chronometer dial) ---------------------------------------

function drawOmega(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // Deep horological obsidian-navy ground with gentle radial dial sheen
  const dialX = x + w * 0.20;
  const dialY = y + h * 0.62;
  const R = h * 0.65;

  const bg = ctx.createRadialGradient(dialX, dialY, R * 0.15, dialX, dialY, w * 0.95);
  bg.addColorStop(0, '#182230');
  bg.addColorStop(0.52, '#101620');
  bg.addColorStop(1, '#0b0f16');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  // Cropped monumental chronometer dial on the left half
  // Outer satin champagne-gold bezel
  const bezG = ctx.createLinearGradient(dialX - R, dialY - R, dialX + R, dialY + R);
  bezG.addColorStop(0, '#e3d3b0');
  bezG.addColorStop(0.5, '#b8a279');
  bezG.addColorStop(1, '#d7c49e');
  ctx.fillStyle = bezG;
  ctx.beginPath();
  ctx.arc(dialX, dialY, R, 0, Math.PI * 2);
  ctx.fill();

  // Inner dial face (satin obsidian-indigo)
  const faceG = ctx.createRadialGradient(dialX - R * 0.2, dialY - R * 0.2, 20, dialX, dialY, R * 0.95);
  faceG.addColorStop(0, '#1c2636');
  faceG.addColorStop(0.7, '#111824');
  faceG.addColorStop(1, '#0b1018');
  ctx.fillStyle = faceG;
  ctx.beginPath();
  ctx.arc(dialX, dialY, R * 0.948, 0, Math.PI * 2);
  ctx.fill();

  // Subtle concentric guilloché hairline chapter rings
  ctx.strokeStyle = 'rgba(218, 200, 164, 0.22)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(dialX, dialY, R * 0.875, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(218, 200, 164, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(dialX, dialY, R * 0.825, 0, Math.PI * 2);
  ctx.stroke();

  // Precision minute & quarter-second railway track
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2 - Math.PI / 2;
    const isMin = i % 4 === 0;
    const isFive = i % 20 === 0;
    const r0 = R * (isFive ? 0.818 : isMin ? 0.836 : 0.854);
    const r1 = R * 0.873;
    ctx.strokeStyle = isMin ? 'rgba(232, 222, 200, 0.72)' : 'rgba(232, 222, 200, 0.24)';
    ctx.lineWidth = isFive ? 2.6 : isMin ? 1.5 : 0.9;
    ctx.beginPath();
    ctx.moveTo(dialX + Math.cos(a) * r0, dialY + Math.sin(a) * r0);
    ctx.lineTo(dialX + Math.cos(a) * r1, dialY + Math.sin(a) * r1);
    ctx.stroke();
  }

  // Applied chamfered champagne-gold baton hour indices (double-baton at 12 o'clock)
  for (let hr = 0; hr < 12; hr++) {
    const a = (hr / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(dialX, dialY);
    ctx.rotate(a);
    const drawBaton = (yOff: number, len: number, halfW: number): void => {
      const rIn = R * 0.79 - len;
      const rOut = R * 0.79;
      // Top bright facet
      ctx.fillStyle = '#efe4ca';
      ctx.beginPath();
      ctx.moveTo(rIn, yOff);
      ctx.lineTo(rOut, yOff - halfW);
      ctx.lineTo(rOut, yOff);
      ctx.closePath();
      ctx.fill();
      // Bottom shaded facet
      ctx.fillStyle = '#a8936a';
      ctx.beginPath();
      ctx.moveTo(rIn, yOff);
      ctx.lineTo(rOut, yOff);
      ctx.lineTo(rOut, yOff + halfW);
      ctx.closePath();
      ctx.fill();
    };
    if (hr === 0) {
      drawBaton(-9, R * 0.135, 5.5);
      drawBaton(9, R * 0.135, 5.5);
    } else {
      drawBaton(0, R * (hr % 3 === 0 ? 0.125 : 0.105), hr % 3 === 0 ? 6.5 : 4.8);
    }
    ctx.restore();
  }

  // Recessed sub-dial crosshair subtle hint
  const subY = dialY + R * 0.34;
  ctx.strokeStyle = 'rgba(218, 200, 164, 0.18)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(dialX, subY, R * 0.19, 0, Math.PI * 2);
  ctx.stroke();

  // Faceted Dauphine hour & minute hands poised at 10:10
  const drawHand = (angleRad: number, length: number, tail: number, baseHalfW: number): void => {
    ctx.save();
    ctx.translate(dialX, dialY);
    ctx.rotate(angleRad);
    // Bright facet
    ctx.fillStyle = '#f3ebda';
    ctx.beginPath();
    ctx.moveTo(-tail, 0);
    ctx.lineTo(0, -baseHalfW);
    ctx.lineTo(length, 0);
    ctx.closePath();
    ctx.fill();
    // Shaded facet
    ctx.fillStyle = '#a99773';
    ctx.beginPath();
    ctx.moveTo(-tail, 0);
    ctx.lineTo(length, 0);
    ctx.lineTo(0, baseHalfW);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  // 10:10 angles (from 12 o'clock = -pi/2)
  const minAng = -Math.PI / 2 + (10 / 60) * Math.PI * 2;
  const hrAng = -Math.PI / 2 + ((10 + 10 / 60) / 12) * Math.PI * 2;
  drawHand(hrAng, R * 0.50, R * 0.08, 12);
  drawHand(minAng, R * 0.74, R * 0.10, 9.5);

  // Razor-thin sweeping seconds hand at 37 seconds
  const secAng = -Math.PI / 2 + (37 / 60) * Math.PI * 2;
  ctx.save();
  ctx.translate(dialX, dialY);
  ctx.rotate(secAng);
  ctx.strokeStyle = '#d8c59e';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-R * 0.16, 0);
  ctx.lineTo(R * 0.80, 0);
  ctx.stroke();
  ctx.fillStyle = '#111824';
  ctx.beginPath();
  ctx.arc(-R * 0.12, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Polished center pinion cap
  ctx.fillStyle = '#e8dcc0';
  ctx.beginPath();
  ctx.arc(dialX, dialY, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#73654a';
  ctx.beginPath();
  ctx.arc(dialX, dialY, 5, 0, Math.PI * 2);
  ctx.fill();

  // Right editorial zone: Swiss horological typography
  const tx = x + w * 0.575;
  const topY = y + 110;

  // Bespoke geometric Omega (Ω) symbol
  ctx.save();
  ctx.translate(tx + 24, topY + 26);
  ctx.strokeStyle = '#d8c49b';
  ctx.lineWidth = 4.6;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(0, -3, 21, Math.PI * 0.72, Math.PI * 2.28, false);
  ctx.stroke();
  // Left & right feet
  ctx.beginPath();
  ctx.moveTo(-25, 19);
  ctx.lineTo(-10, 19);
  ctx.lineTo(-10, 12);
  ctx.moveTo(25, 19);
  ctx.lineTo(10, 19);
  ctx.lineTo(10, 12);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d8c49b';
  setTracking(ctx, 11);
  ctx.font = `500 28px ${SANS}`;
  ctx.fillText('OMEGA', tx + 68, topY + 28);

  // Thin champagne architectural rule
  ctx.strokeStyle = 'rgba(216, 196, 155, 0.38)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx, topY + 116);
  ctx.lineTo(tx + 92, topY + 116);
  ctx.stroke();

  // Headline
  const midY = y + h * 0.50;
  setTracking(ctx, -1.2);
  ctx.fillStyle = '#f2eee6';
  ctx.font = `300 72px ${SANS}`;
  ctx.fillText('Precision', tx, midY);
  ctx.font = `500 72px ${SANS}`;
  ctx.fillText('in stillness.', tx, midY + 80);

  // Subtle horological caption
  setTracking(ctx, 3.0);
  ctx.fillStyle = '#8b97aa';
  ctx.font = `500 14px ${SANS}`;
  ctx.fillText('CO-AXIAL MASTER CHRONOMETER', tx, y + h - 102);
  ctx.fillStyle = '#687487';
  ctx.fillText('CALIBRE 9935  ·  BIENNE', tx, y + h - 76);
}

// ---- Poster 3: APPLE (Quiet industrial restraint, chamfered titanium & frosted glass sculpture) --------------------

function drawAppleMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = fill;

  // Classic balanced two-lobe apple body with crisp circular bite
  ctx.beginPath();
  ctx.moveTo(0, -0.58);
  // Right upper lobe
  ctx.bezierCurveTo(0.28, -0.78, 0.72, -0.72, 0.84, -0.34);
  // Bite cutout (concave arc on right side)
  ctx.bezierCurveTo(0.56, -0.22, 0.54, 0.24, 0.86, 0.38);
  // Right lower curve to base cleft
  ctx.bezierCurveTo(0.76, 0.74, 0.50, 1.02, 0.24, 1.00);
  ctx.bezierCurveTo(0.11, 0.99, 0.06, 0.92, 0, 0.92);
  // Left base cleft up to left upper lobe
  ctx.bezierCurveTo(-0.06, 0.92, -0.12, 0.99, -0.25, 1.00);
  ctx.bezierCurveTo(-0.52, 1.02, -0.84, 0.66, -0.88, 0.14);
  ctx.bezierCurveTo(-0.92, -0.44, -0.58, -0.76, -0.24, -0.72);
  ctx.bezierCurveTo(-0.10, -0.70, -0.04, -0.62, 0, -0.58);
  ctx.closePath();
  ctx.fill();

  // Tilted leaf
  ctx.beginPath();
  ctx.moveTo(0.02, -0.74);
  ctx.bezierCurveTo(0.02, -1.04, 0.24, -1.24, 0.48, -1.26);
  ctx.bezierCurveTo(0.49, -0.96, 0.28, -0.74, 0.02, -0.74);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawApple(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // Serene warm architectural alabaster / titanium studio gradient
  const bg = ctx.createLinearGradient(x, y, x + w, y + h);
  bg.addColorStop(0, '#f0ede7');
  bg.addColorStop(0.55, '#e6e2da');
  bg.addColorStop(1, '#d8d2c6');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  // Subtle diagonal studio daylight wash across the backdrop
  const wash = ctx.createLinearGradient(x + w * 0.2, y, x + w * 0.9, y + h * 0.85);
  wash.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
  wash.addColorStop(0.45, 'rgba(255, 255, 255, 0.0)');
  wash.addColorStop(1, 'rgba(130, 122, 110, 0.08)');
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, w, h);

  // Left typographic zone: huge calm negative space
  const padX = 96;
  const tx = x + padX;
  drawAppleMark(ctx, tx + 22, y + h * 0.355, 26, '#1d1d1f');

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  setTracking(ctx, -1.8);
  ctx.fillStyle = '#1d1d1f';
  ctx.font = `300 72px ${SANS}`;
  ctx.fillText('Light,', tx, y + h * 0.515);
  ctx.font = `500 72px ${SANS}`;
  ctx.fillText('refined.', tx, y + h * 0.515 + 78);

  setTracking(ctx, 3.2);
  ctx.fillStyle = '#736f68';
  ctx.font = `500 14px ${SANS}`;
  ctx.fillText('DESIGNED IN CALIFORNIA', tx, y + h - 86);

  // Right 56%: Sculptural titanium & ultra-clear optical glass monolith (echoes Apple Fifth Avenue)
  const sx = x + w * 0.695;
  const sy = y + h * 0.50;
  const sw = 276;
  const sh = 556;
  const rad = 36;

  // Soft layered studio shadow cast down-right
  for (let i = 0; i < 4; i++) {
    const blur = 18 + i * 24;
    ctx.save();
    ctx.fillStyle = `rgba(38, 35, 30, ${0.075 - i * 0.015})`;
    ctx.beginPath();
    ctx.roundRect(sx - sw / 2 + 24 + i * 14, sy - sh / 2 + 26 + i * 16, sw + blur * 0.35, sh + blur * 0.3, rad + 6);
    ctx.fill();
    ctx.restore();
  }

  // Machined brushed-titanium outer chamfered chassis
  const rimG = ctx.createLinearGradient(sx - sw / 2, sy - sh / 2, sx + sw / 2, sy + sh / 2);
  rimG.addColorStop(0, '#fcfbf8');
  rimG.addColorStop(0.28, '#c5c1b9');
  rimG.addColorStop(0.55, '#8c8983');
  rimG.addColorStop(0.82, '#d5d1c8');
  rimG.addColorStop(1, '#6f6c67');
  ctx.fillStyle = rimG;
  ctx.beginPath();
  ctx.roundRect(sx - sw / 2, sy - sh / 2, sw, sh, rad);
  ctx.fill();

  // Precision dark micro-gasket reveal
  ctx.fillStyle = '#252629';
  ctx.beginPath();
  ctx.roundRect(sx - sw / 2 + 6, sy - sh / 2 + 6, sw - 12, sh - 12, rad - 5);
  ctx.fill();

  // Frosted architectural glass monolith face catching a calm diagonal noon beam
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(sx - sw / 2 + 10, sy - sh / 2 + 10, sw - 20, sh - 20, rad - 8);
  ctx.clip();

  const paneG = ctx.createLinearGradient(sx - sw / 2, sy - sh / 2, sx + sw / 2, sy + sh / 2);
  paneG.addColorStop(0, '#cfd4da');
  paneG.addColorStop(0.35, '#e8e6e1');
  paneG.addColorStop(0.68, '#b9c0c8');
  paneG.addColorStop(1, '#98a0aa');
  ctx.fillStyle = paneG;
  ctx.fillRect(sx - sw / 2, sy - sh / 2, sw, sh);

  // Soft diagonal optical refraction ribbon across the glass
  const beamG = ctx.createLinearGradient(sx - sw * 0.6, sy - sh * 0.35, sx + sw * 0.55, sy + sh * 0.25);
  beamG.addColorStop(0, 'rgba(255, 255, 255, 0)');
  beamG.addColorStop(0.36, 'rgba(255, 255, 255, 0.56)');
  beamG.addColorStop(0.52, 'rgba(248, 252, 255, 0.18)');
  beamG.addColorStop(0.75, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = beamG;
  ctx.beginPath();
  ctx.moveTo(sx - sw, sy - sh * 0.1);
  ctx.lineTo(sx + sw, sy - sh * 0.45);
  ctx.lineTo(sx + sw, sy + sh * 0.08);
  ctx.lineTo(sx - sw, sy + sh * 0.42);
  ctx.closePath();
  ctx.fill();

  // Whisper-subtle translucent glass edge highlight inside perimeter
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(sx - sw / 2 + 11, sy - sh / 2 + 11, sw - 22, sh - 22, rad - 9);
  ctx.stroke();
  ctx.restore();
}

// ---- Poster 4: HOLLOW BAY — DIRECT FROM MERIDIAN DEEP (2035 Swiss-editorial echo of 1910 Art Deco poster) ----------

function drawHollowBay(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // Warm pale architectural mineral paper base
  ctx.fillStyle = '#efeae0';
  ctx.fillRect(x, y, w, h);

  const pad = 64;
  const innerW = w - pad * 2;

  // ---- Top Swiss rail masthead ----
  const mastY = y + pad + 26;
  // Meridian Line ink-blue roundel
  ctx.fillStyle = '#204bb5';
  ctx.beginPath();
  ctx.arc(x + pad + 19, mastY, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8f6f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setTracking(ctx, 0);
  ctx.font = `700 20px ${SANS}`;
  ctx.fillText('M', x + pad + 19, mastY + 1);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#22252a';
  setTracking(ctx, 4.2);
  ctx.font = `600 18px ${SANS}`;
  ctx.fillText('MERIDIAN DEEP  ·  COASTAL NETWORK', x + pad + 54, mastY + 1);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#68655e';
  setTracking(ctx, 3.0);
  ctx.font = `400 18px ${SANS}`;
  ctx.fillText('2035', x + w - pad, mastY + 1);

  // Crisp divider line below masthead
  const ruleTopY = y + pad + 68;
  ctx.strokeStyle = '#1f2226';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x + pad, ruleTopY);
  ctx.lineTo(x + w - pad, ruleTopY);
  ctx.stroke();

  // ---- Central Swiss Geometric Coastal Landscape (modern 2035 echo of the 1910 Hollow Bay poster) ----
  const artX = x + pad;
  const artY = ruleTopY + 26;
  const artW = innerW;
  const artH = Math.round(h * 0.615);

  ctx.save();
  ctx.beginPath();
  ctx.rect(artX, artY, artW, artH);
  ctx.clip();

  // Sky: pale golden mist -> warm coastal apricot -> muted terracotta horizon
  const horizonY = artY + Math.round(artH * 0.64);
  const skyG = ctx.createLinearGradient(artX, artY, artX, horizonY);
  skyG.addColorStop(0, '#ebd4b0');
  skyG.addColorStop(0.55, '#dfa876');
  skyG.addColorStop(1, '#ba6042');
  ctx.fillStyle = skyG;
  ctx.fillRect(artX, artY, artW, horizonY - artY + 4);

  // Subtle concentric Swiss geometric sun-wave arcs (quiet 2035 nod to the 1910 Art Deco sunburst)
  const sunX = artX + artW * 0.50;
  const sunY = horizonY - artH * 0.145;
  const sunR = artW * 0.115;
  for (let k = 1; k <= 5; k++) {
    ctx.strokeStyle = `rgba(250, 238, 210, ${0.22 - k * 0.032})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR + k * (artW * 0.088), Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  // Luminous pale-ivory coastal sun disc
  const sunG = ctx.createRadialGradient(sunX, sunY - sunR * 0.2, sunR * 0.1, sunX, sunY, sunR);
  sunG.addColorStop(0, '#fbf4e2');
  sunG.addColorStop(1, '#f3dfb9');
  ctx.fillStyle = sunG;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // Distant atmospheric headland ridge
  ctx.fillStyle = '#5c4b52';
  ctx.beginPath();
  ctx.moveTo(artX, horizonY);
  ctx.lineTo(artX, horizonY - artH * 0.10);
  ctx.lineTo(artX + artW * 0.22, horizonY - artH * 0.155);
  ctx.lineTo(artX + artW * 0.39, horizonY - artH * 0.065);
  ctx.lineTo(artX + artW * 0.64, horizonY - artH * 0.05);
  ctx.lineTo(artX + artW * 0.84, horizonY - artH * 0.13);
  ctx.lineTo(artX + artW, horizonY - artH * 0.09);
  ctx.lineTo(artX + artW, horizonY);
  ctx.closePath();
  ctx.fill();

  // Calm deep slate-teal sea
  const seaG = ctx.createLinearGradient(artX, horizonY, artX, artY + artH);
  seaG.addColorStop(0, '#223544');
  seaG.addColorStop(0.45, '#162430');
  seaG.addColorStop(1, '#0f1821');
  ctx.fillStyle = seaG;
  ctx.fillRect(artX, horizonY, artW, artY + artH - horizonY);

  // Quiet vertical sun-shimmer lines across the calm water
  for (let i = 0; i < 16; i++) {
    const f = i / 15;
    const wy = horizonY + 12 + f * (artY + artH - horizonY - 28);
    const barW = sunR * (1.55 - f * 0.92) * (0.75 + 0.25 * Math.sin(i * 2.1));
    ctx.fillStyle = `rgba(246, 224, 182, ${(1 - f * 0.68) * 0.42})`;
    ctx.fillRect(sunX - barW / 2, wy, barW, 3.2 - f * 1.2);
  }

  // Architectural foreground stepped coastal promontory framing the bay
  ctx.fillStyle = '#141d25';
  ctx.beginPath();
  ctx.moveTo(artX, artY + artH);
  ctx.lineTo(artX, horizonY - artH * 0.045);
  ctx.lineTo(artX + artW * 0.16, horizonY - artH * 0.045);
  ctx.lineTo(artX + artW * 0.28, horizonY + artH * 0.065);
  ctx.lineTo(artX + artW * 0.28, artY + artH);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(artX + artW, artY + artH);
  ctx.lineTo(artX + artW, horizonY - artH * 0.025);
  ctx.lineTo(artX + artW * 0.80, horizonY - artH * 0.025);
  ctx.lineTo(artX + artW * 0.69, horizonY + artH * 0.085);
  ctx.lineTo(artX + artW * 0.69, artY + artH);
  ctx.closePath();
  ctx.fill();

  // Slender 2035 minimalist coastal viaduct + mirror train gliding across the bay
  const deckY = horizonY + Math.round(artH * 0.135);
  // Hairline piers rising from the water
  ctx.fillStyle = '#0d141b';
  for (let p = 1; p <= 7; p++) {
    const px = artX + (artW * p) / 8;
    ctx.fillRect(px - 3, deckY + 8, 6, artY + artH - deckY);
  }
  // Slender white-steel box girder viaduct
  ctx.fillStyle = '#c8c4bc';
  ctx.fillRect(artX, deckY, artW, 10);
  ctx.fillStyle = '#1a242e';
  ctx.fillRect(artX, deckY + 10, artW, 5);

  // The 2035 mirror train (sleek silver nose + warm 3500 K saloon window ribbon)
  const trX0 = artX + artW * 0.12;
  const trX1 = artX + artW * 0.76;
  const trH = 26;
  const trY = deckY - trH;
  const trG = ctx.createLinearGradient(trX0, trY, trX0, deckY);
  trG.addColorStop(0, '#eef1f5');
  trG.addColorStop(0.5, '#c4cbd2');
  trG.addColorStop(1, '#8d96a0');
  ctx.fillStyle = trG;
  ctx.beginPath();
  ctx.moveTo(trX0, deckY);
  ctx.lineTo(trX0, trY);
  ctx.lineTo(trX1 - 24, trY);
  ctx.quadraticCurveTo(trX1 + 4, trY + 2, trX1 + 12, deckY);
  ctx.closePath();
  ctx.fill();

  // Warm lit saloon window band + hairline Meridian blue livery stripe
  ctx.fillStyle = '#fae2b4';
  ctx.fillRect(trX0 + 14, trY + 6, trX1 - trX0 - 44, 9);
  ctx.fillStyle = '#204bb5';
  ctx.fillRect(trX0, deckY - 4, trX1 - trX0 + 6, 3.5);

  // Subtle warm saloon reflection shimmering on the dark bay water beneath the viaduct
  ctx.fillStyle = 'rgba(248, 220, 168, 0.14)';
  ctx.fillRect(trX0 + 24, deckY + 28, trX1 - trX0 - 54, 6);

  ctx.restore();

  // ---- Lower Swiss Typographic Plinth ----
  const titleY = artY + artH + 114;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#14171c';
  setTracking(ctx, 6.5);
  ctx.font = `600 108px ${SANS}`;
  ctx.fillText('HOLLOW BAY', x + pad - 4, titleY);

  // Oxblood / terracotta editorial accent rule
  const accY = titleY + 76;
  ctx.fillStyle = '#a43632';
  ctx.fillRect(x + pad, accY, Math.round(innerW * 0.28), 4.5);

  // Subtitle
  ctx.fillStyle = '#33363d';
  setTracking(ctx, 7.5);
  ctx.font = `400 32px ${SANS}`;
  ctx.fillText('DIRECT FROM MERIDIAN DEEP', x + pad, accY + 56);

  // Hairline bottom divider & 3-column Swiss timetable micro-footer
  const footRuleY = y + h - pad - 48;
  ctx.strokeStyle = 'rgba(20, 23, 28, 0.25)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + pad, footRuleY);
  ctx.lineTo(x + w - pad, footRuleY);
  ctx.stroke();

  const footY = y + h - pad - 14;
  ctx.fillStyle = '#5c5a54';
  setTracking(ctx, 3.2);
  ctx.font = `500 16px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText('MERIDIAN LINE · COASTAL EXPRESS', x + pad, footY);
  ctx.textAlign = 'center';
  ctx.fillText('PLATFORM 01', x + w / 2, footY);
  ctx.textAlign = 'right';
  ctx.fillText('EVERY 4 MIN · SLEEPER', x + w - pad, footY);
}

function paintAtlas(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('halcyonAds: 2d canvas unavailable');

  ctx.fillStyle = '#0d0f12';
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  const grain = makePaperGrainPattern(ctx);
  withClippedCell(ctx, CELLS.leica, grain, (x, y, w, h) => drawLeica(ctx, x, y, w, h));
  withClippedCell(ctx, CELLS.omega, grain, (x, y, w, h) => drawOmega(ctx, x, y, w, h));
  withClippedCell(ctx, CELLS.apple, grain, (x, y, w, h) => drawApple(ctx, x, y, w, h));
  withClippedCell(ctx, CELLS.hollowBay, grain, (x, y, w, h) => drawHollowBay(ctx, x, y, w, h));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---- Geometry Helpers ----------------------------------------------------------------------------------------------

/** Oriented prism in Halcyon local (s, y, t) coordinates with vertex colour. */
function stBox(s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, rgb: RGB): THREE.BufferGeometry {
  const g0 = new THREE.BoxGeometry(s1 - s0, y1 - y0, t1 - t0);
  g0.translate((s0 + s1) / 2, (y0 + y1) / 2, (t0 + t1) / 2);
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(UX, 0, UZ),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(VX, 0, VZ),
  );
  m.setPosition(HALCYON.centre[0], 0, HALCYON.centre[1]);
  g0.applyMatrix4(m);
  const g = g0.toNonIndexed();
  g0.dispose();
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = rgb[0];
    col[i * 3 + 1] = rgb[1];
    col[i * 3 + 2] = rgb[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Backlit poster quad given exact world-space corners (bl, br, tr, tl) and outward normal `n`.
 * Carries both atlas `uv` and per-poster local `aLocalUv` ([0..1, 0..1]) for physical lightbox bezel edge-falloff.
 */
function posterQuad(bl: V3, br: V3, tr: V3, tl: V3, n: V3, cell: CellRect): THREE.BufferGeometry {
  const u0 = cell.x / ATLAS_W;
  const u1 = (cell.x + cell.w) / ATLAS_W;
  const v1 = 1 - cell.y / ATLAS_H;
  const v0 = 1 - (cell.y + cell.h) / ATLAS_H;

  const pos = new Float32Array([
    bl[0], bl[1], bl[2], br[0], br[1], br[2], tr[0], tr[1], tr[2],
    bl[0], bl[1], bl[2], tr[0], tr[1], tr[2], tl[0], tl[1], tl[2],
  ]);
  const nor = new Float32Array([
    n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2],
    n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2],
  ]);
  const uv = new Float32Array([
    u0, v0, u1, v0, u1, v1,
    u0, v0, u1, v1, u0, v1,
  ]);
  const localUv = new Float32Array([
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
  ]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aLocalUv', new THREE.BufferAttribute(localUv, 2));
  return g;
}

/** Anti-reflective cover glass quad (bl, br, tr, tl) facing `n`. */
function glassQuad(bl: V3, br: V3, tr: V3, tl: V3, n: V3): THREE.BufferGeometry {
  const pos = new Float32Array([
    bl[0], bl[1], bl[2], br[0], br[1], br[2], tr[0], tr[1], tr[2],
    bl[0], bl[1], bl[2], tr[0], tr[1], tr[2], tl[0], tl[1], tl[2],
  ]);
  const nor = new Float32Array([
    n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2],
    n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2],
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---- Physical Backlit Diffuser Shader ------------------------------------------------------------------------------

function patchPrintMaterial(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAdNight = AD_UNIFORMS.night;
    sh.uniforms.uAdGolden = AD_UNIFORMS.golden;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aLocalUv;\nvarying vec2 vAdLocalUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAdLocalUv = aLocalUv;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uAdNight;\nuniform float uAdGolden;\nvarying vec2 vAdLocalUv;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    // Subtle physical bezel-edge diffuser shadow (real museum lightboxes soften ~8% right inside the frame lip).
    vec2 edge = min(vAdLocalUv, 1.0 - vAdLocalUv);
    float vig = smoothstep(0.0, 0.045, edge.x) * smoothstep(0.0, 0.045, edge.y);
    float edgeShade = mix(0.86, 1.0, vig);
    // Calibrated gallery backlight (< 1.0 so bright paper never triggers ugly bloom halos), gently adapting to day/night.
    float gain = mix(0.68, ${(0.68 * ADS.nightGain).toFixed(3)}, uAdNight);
    vec3 tint = mix(vec3(1.0, 0.99, 0.97), vec3(1.03, 0.95, 0.86), uAdGolden * 0.55);
    tint = mix(tint, vec3(0.95, 0.97, 1.02), uAdNight * 0.35);
    totalEmissiveRadiance += diffuseColor.rgb * tint * gain * edgeShade;
  }`,
      );
  };
  mat.customProgramCacheKey = () => 'halcyonAdsBacklitPrint';
}

// ---- Main Builder --------------------------------------------------------------------------------------------------

const GL_STUB = { capabilities: { getMaxAnisotropy: () => 8 } } as unknown as THREE.WebGLRenderer;

export function buildHalcyonAds(kit: MetroMaterials, opts: HalcyonAdsOpts = {}): HalcyonAdsBuild {
  const renderer = opts.renderer ?? GL_STUB;
  const group = new THREE.Group();
  group.name = 'metroHalcyonAds';

  const frameParts: THREE.BufferGeometry[] = [];
  const printParts: THREE.BufferGeometry[] = [];
  const glassParts: THREE.BufferGeometry[] = [];

  const STAINLESS_RGB: RGB = [0.95, 0.96, 0.98];
  const LINER_RGB: RGB = [0.09, 0.10, 0.12];

  const { shadowGap, bezelW, proud, recessDepth, glassInset, printInset } = ADS;
  const innerLip = 0.012; // dark internal shadow-box collar step inside the brushed-stainless bezel

  // ---- A. NW Long Wall (t = +10, facing -v into platform): 3 recessed landscape vitrines ----
  // Left-to-right when standing on platform facing NW wall is +s -> -s (bay 8 = Apple, bay 6 = Omega, bay 4 = Leica).
  const nwPosters: readonly PosterId[] = ['leica', 'omega', 'apple'];
  const nwNormal: V3 = [-VX, 0, -VZ];
  const [nwY0, nwY1] = ADS.nwY;

  ADS.nwBays.forEach((bayIdx, i) => {
    const [rawS0, rawS1] = halcyonNwBaySpan(bayIdx);
    // Outer brushed-stainless bezel sits inside the 12 mm physical shadow gap around the limestone recess opening
    const os0 = rawS0 + shadowGap;
    const os1 = rawS1 - shadowGap;
    const oy0 = nwY0 + shadowGap;
    const oy1 = nwY1 - shadowGap;

    const is0 = os0 + bezelW;
    const is1 = os1 - bezelW;
    const iy0 = oy0 + bezelW;
    const iy1 = oy1 - bezelW;

    const tFront = W_HALL - proud;        // 8 mm proud of limestone face
    const tBack = W_HALL + recessDepth;   // 44 mm deep into wall cavity
    const tGlass = W_HALL + glassInset;   // 2 mm behind limestone face (10 mm inside bezel lip)
    const tPrint = W_HALL + printInset;   // 36 mm deep (34 mm true physical shadow-box parallax behind glass!)

    // Outer 4-sided brushed-stainless frame
    frameParts.push(stBox(os0, is0, oy0, oy1, tFront, tBack, STAINLESS_RGB));
    frameParts.push(stBox(is1, os1, oy0, oy1, tFront, tBack, STAINLESS_RGB));
    frameParts.push(stBox(is0, is1, oy0, iy0, tFront, tBack, STAINLESS_RGB));
    frameParts.push(stBox(is0, is1, iy1, oy1, tFront, tBack, STAINLESS_RGB));

    // Inner dark anodised shadow-box liner cheeks between glass and backlit print
    const ps0 = is0 + innerLip;
    const ps1 = is1 - innerLip;
    const py0 = iy0 + innerLip;
    const py1 = iy1 - innerLip;
    frameParts.push(stBox(is0, ps0, iy0, iy1, tGlass + 0.003, tPrint + 0.004, LINER_RGB));
    frameParts.push(stBox(ps1, is1, iy0, iy1, tGlass + 0.003, tPrint + 0.004, LINER_RGB));
    frameParts.push(stBox(ps0, ps1, iy0, py0, tGlass + 0.003, tPrint + 0.004, LINER_RGB));
    frameParts.push(stBox(ps0, ps1, py1, iy1, tGlass + 0.003, tPrint + 0.004, LINER_RGB));

    // Backlit print quad (facing -v: viewer left = +s = ps1, viewer right = -s = ps0)
    const cell = CELLS[nwPosters[i]!];
    printParts.push(posterQuad(
      wp(ps1, py0, tPrint),
      wp(ps0, py0, tPrint),
      wp(ps0, py1, tPrint),
      wp(ps1, py1, tPrint),
      nwNormal,
      cell,
    ));

    // Anti-reflective low-iron cover glass (34 mm in front of print)
    glassParts.push(glassQuad(
      wp(is1, iy0, tGlass),
      wp(is0, iy0, tGlass),
      wp(is0, iy1, tGlass),
      wp(is1, iy1, tGlass),
      nwNormal,
    ));
  });

  // ---- B. SW End Wall (s = -55, center pier t in [-1.35, +1.35], facing +u into platform): Hollow Bay Hero ----
  {
    const endNormal: V3 = [UX, 0, UZ];
    const [rawT0, rawT1] = ADS.endT;
    const [rawY0, rawY1] = ADS.endY;

    const ot0 = rawT0 + shadowGap;
    const ot1 = rawT1 - shadowGap;
    const oy0 = rawY0 + shadowGap;
    const oy1 = rawY1 - shadowGap;

    const it0 = ot0 + bezelW;
    const it1 = ot1 - bezelW;
    const iy0 = oy0 + bezelW;
    const iy1 = oy1 - bezelW;

    const sFace = -L_HALL;
    const sFront = sFace + proud;        // 8 mm proud into hall (+s)
    const sBack = sFace - recessDepth;   // 44 mm recessed into wall (-s)
    const sGlass = sFace - glassInset;
    const sPrint = sFace - printInset;

    // Outer 4-sided brushed-stainless frame
    frameParts.push(stBox(sBack, sFront, oy0, oy1, ot0, it0, STAINLESS_RGB));
    frameParts.push(stBox(sBack, sFront, oy0, oy1, it1, ot1, STAINLESS_RGB));
    frameParts.push(stBox(sBack, sFront, oy0, iy0, it0, it1, STAINLESS_RGB));
    frameParts.push(stBox(sBack, sFront, iy1, oy1, it0, it1, STAINLESS_RGB));

    // Inner dark anodised shadow-box liner cheeks
    const pt0 = it0 + innerLip;
    const pt1 = it1 - innerLip;
    const py0 = iy0 + innerLip;
    const py1 = iy1 - innerLip;
    frameParts.push(stBox(sPrint - 0.004, sGlass - 0.003, iy0, iy1, it0, pt0, LINER_RGB));
    frameParts.push(stBox(sPrint - 0.004, sGlass - 0.003, iy0, iy1, pt1, it1, LINER_RGB));
    frameParts.push(stBox(sPrint - 0.004, sGlass - 0.003, iy0, py0, pt0, pt1, LINER_RGB));
    frameParts.push(stBox(sPrint - 0.004, sGlass - 0.003, py1, iy1, pt0, pt1, LINER_RGB));

    // Backlit hero print quad (facing +u: viewer left = +t = pt1, viewer right = -t = pt0)
    printParts.push(posterQuad(
      wp(sPrint, py0, pt1),
      wp(sPrint, py0, pt0),
      wp(sPrint, py1, pt0),
      wp(sPrint, py1, pt1),
      endNormal,
      CELLS.hollowBay,
    ));

    // Anti-reflective low-iron cover glass
    glassParts.push(glassQuad(
      wp(sGlass, iy0, it1),
      wp(sGlass, iy0, it0),
      wp(sGlass, iy1, it0),
      wp(sGlass, iy1, it1),
      endNormal,
    ));
  }

  // ---- Assemble 3 Batched Draw Calls ----
  const frameMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepHalcyonAdsFrame',
    color: 0xd4d9de,
    vertexColors: true,
    metalness: 0.94,
    roughness: 0.72,
    roughnessMap: kit.deep.stainless.roughnessMap,
    envMapIntensity: 1.25,
  });

  const atlas = paintAtlas(renderer);
  const printMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepHalcyonAdsPrint',
    color: 0xffffff,
    map: atlas,
    roughness: 0.68,
    metalness: 0.0,
    envMapIntensity: 0.22,
  });
  patchPrintMaterial(printMat);

  const glassMat = kit.deep.glass.clone();
  glassMat.name = 'metroDeepHalcyonAdsGlass';
  glassMat.opacity = 0.075;
  glassMat.roughness = 0.025;
  glassMat.envMapIntensity = 1.35;

  const frameGeo = mergeGeometries(frameParts, false)!;
  for (const g of frameParts) g.dispose();
  const printGeo = mergeGeometries(printParts, false)!;
  for (const g of printParts) g.dispose();
  const glassGeo = mergeGeometries(glassParts, false)!;
  for (const g of glassParts) g.dispose();

  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.name = 'halcyonAdsFrames';

  const printMesh = new THREE.Mesh(printGeo, printMat);
  printMesh.name = 'halcyonAdsPrints';
  printMesh.userData.noShadow = true;
  printMesh.onBeforeRender = syncAdUniforms;

  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.name = 'halcyonAdsGlass';
  glassMesh.renderOrder = 1; // cleanly behind foreground PSD glass (renderOrder = 2)
  glassMesh.userData.noShadow = true;

  group.add(frameMesh, printMesh, glassMesh);

  return {
    group,
    deepMaterials: [frameMat, printMat, glassMat],
    calls: 3,
  };
}
