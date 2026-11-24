import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { HALCYON, INFO_SCREENS, infoScreenSpecs, type InfoScreenSpec } from '../../layoutMetro';
import { carCrowding, formatCountdown, nextTrainFor } from '../../metro/choreography';
import { destinationOf, lineLabelOf, METRO_NETWORK } from '../../metro/network';
import type { TrainState } from '../../metro/timetable';
import { TRACKS } from '../../metro/tracks';
import { LINE_COLORS } from '../../metro/trainModel';
import { GeoBag } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * Live platform info screens (2026-11-23 smart-station ruling): slim double-sided black-glass boards showing, per track,
 * `Next: <destination>`, the countdown, crowding per car (4 bars, procedural but stable per train), a line map strip and a
 * rotating line-status ticker. No people, no speech; text only.
 *
 * Mounts (coordinates in `INFO_SCREENS`, src/layoutMetro.ts): Meridian = portal frames (two slim stainless masts + cross beam),
 * Halcyon = ceiling-hung on two rods, Vesper = floor pylons.
 *
 * Rendering budget: ONE shared canvas atlas, TWO draw calls for every screen on every platform (screens, stainless hardware).
 * The atlas is redrawn at most twice per second and only for the cells whose content changed.
 */

const ATLAS_W = 2048;
const ATLAS_H = 1056;
const HANG_CELL = { w: 512, h: 256 } as const;
const PYLON_CELL = { w: 256, h: 512 } as const;
/** Left 1536 px: 3 x 4 landscape cells. Right 512 px: 2 x 2 portrait cells. Bottom 32 px stay plain black glass (UV target of every housing). */
const HANG_COLS = 3, HANG_ROWS = 4, PYLON_COLS = 2, PYLON_ROWS = 2;
const PYLON_X0 = HANG_COLS * HANG_CELL.w;
const BLACK_UV: readonly [number, number] = [0.5, 1 - (ATLAS_H - 16) / ATLAS_H];
const UPDATE_PERIOD_SEC = 0.5;
const TICKER_PERIOD_SEC = 7;
const TICKER = ['Good service on all lines', 'Welcome to Meridian Deep', 'Waterfall gallery open west of the Crossing'] as const;

const FONT = '"Inter", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';

const srgbByte = (v: number): number => {
  const c = Math.max(0, Math.min(1, v));
  return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
};
const lineCss = (idx: number): string => {
  const c = LINE_COLORS[TRACKS[idx]!.line];
  return `rgb(${srgbByte(c[0])}, ${srgbByte(c[1])}, ${srgbByte(c[2])})`;
};

/** Everything one column of a board shows for one track. */
interface ColumnData {
  readonly idx: number;
  readonly dest: string;
  readonly big: string;
  readonly status: string;
  readonly crowd: readonly number[] | null;
  /** Position of the train marker along the 9-station strip in travel order (null = no train due). */
  readonly marker: number | null;
  readonly sig: string;
}

function columnData(idx: number, trains: readonly TrainState[], forecastSec: number | null): ColumnData {
  const tr = TRACKS[idx]!;
  const train = nextTrainFor(trains, idx);
  const big = formatCountdown(train, forecastSec);
  let status = 'Next train';
  let marker: number | null = null;
  if (train?.phase === 'stopped') {
    status = train.doors01 > 0.01 ? 'Boarding' : 'At platform';
    marker = 4;
  } else {
    const eta = train?.phase === 'approaching' ? train.eta : forecastSec;
    if (eta !== null && eta !== undefined) {
      if (eta <= 20) status = 'Train approaching';
      if (eta <= 90) marker = 4 - Math.min(1, eta / 90);
    }
  }
  const crowd = train ? [0, 1, 2, 3].map((c) => Math.round(carCrowding(train.id, c) * 20) / 20) : null;
  const markerQ = marker === null ? null : Math.round(marker * 10) / 10;
  return {
    idx, dest: destinationOf(tr.line, tr.track), big, status, crowd, marker: markerQ,
    sig: `${idx}|${big}|${status}|${crowd ? crowd.join(',') : '-'}|${markerQ ?? '-'}`,
  };
}

interface Layout {
  head: number; big: number; bigPx: number; stat: number; crowdLabel: number;
  barsTop: number; barsH: number; barLabel: number; mapY: number;
}
const HANG_LAYOUT: Layout = { head: 34, big: 98, bigPx: 58, stat: 134, crowdLabel: 150, barsTop: 160, barsH: 38, barLabel: 214, mapY: 228 };
const PYLON_LAYOUT: Layout = { head: 46, big: 146, bigPx: 76, stat: 196, crowdLabel: 246, barsTop: 262, barsH: 118, barLabel: 398, mapY: 440 };

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, maxPx: number, maxW: number, minPx = 13): void {
  let px = maxPx;
  for (; px > minPx; px--) {
    ctx.font = `${weight} ${px}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) return;
  }
  ctx.font = `${weight} ${minPx}px ${FONT}`;
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

const CROWD_LOW = '#8fd9c0', CROWD_MID = '#f2d27c', CROWD_HIGH = '#f0a05c';
const crowdColour = (v: number): string => (v < 0.45 ? CROWD_LOW : v < 0.72 ? CROWD_MID : CROWD_HIGH);

function drawColumn(ctx: CanvasRenderingContext2D, x0: number, y0: number, d: ColumnData, L: Layout): void {
  const w = 256;
  const tr = TRACKS[d.idx]!;
  const css = lineCss(d.idx);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // Header: line roundel, "NEXT", destination
  const rx = x0 + 34, ry = y0 + L.head;
  ctx.fillStyle = css;
  ctx.beginPath(); ctx.arc(rx, ry, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(lineLabelOf(tr.line)[0]!, rx, ry + 1);
  ctx.textAlign = 'left';
  setSpacing(ctx, 3);
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = '#8c98a8';
  ctx.fillText('NEXT', x0 + 62, ry - 13);
  setSpacing(ctx, 0);
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, d.dest, 700, 26, w - 62 - 14, 15);
  ctx.fillText(d.dest, x0 + 62, ry + 8);

  // Countdown + status
  fitFont(ctx, d.big, 700, L.bigPx, w - 38, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(d.big, x0 + 19, y0 + L.big);
  setSpacing(ctx, 3);
  ctx.font = `600 15px ${FONT}`;
  ctx.fillStyle = d.status === 'Boarding' || d.status === 'Train approaching' ? '#bfeadb' : '#8c98a8';
  ctx.fillText(d.status.toUpperCase(), x0 + 19, y0 + L.stat);

  // Crowding: four car bars
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = '#6f7b8b';
  ctx.fillText('CROWDING', x0 + 19, y0 + L.crowdLabel);
  setSpacing(ctx, 0);
  const bw = 44, gap = 14;
  for (let c = 0; c < 4; c++) {
    const bx = x0 + 19 + c * (bw + gap);
    ctx.fillStyle = '#10161d';
    ctx.fillRect(bx, y0 + L.barsTop, bw, L.barsH);
    if (d.crowd) {
      const v = d.crowd[c]!;
      const fh = Math.max(3, Math.round(L.barsH * v));
      ctx.fillStyle = crowdColour(v);
      ctx.fillRect(bx, y0 + L.barsTop + L.barsH - fh, bw, fh);
    }
    ctx.strokeStyle = '#3a4554';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, y0 + L.barsTop + 0.5, bw - 1, L.barsH - 1);
    ctx.fillStyle = '#6f7b8b';
    ctx.textAlign = 'center';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(String(c + 1), bx + bw / 2, y0 + L.barLabel);
    ctx.textAlign = 'left';
  }

  // Map strip: nine stations in travel order, this station ringed, train marker
  const n = METRO_NETWORK[tr.line].stations.length;
  const sx0 = x0 + 24, sx1 = x0 + w - 24, my = y0 + L.mapY;
  ctx.strokeStyle = css;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(sx0, my); ctx.lineTo(sx1, my); ctx.stroke();
  for (let i = 0; i < n; i++) {
    const x = sx0 + ((sx1 - sx0) * i) / (n - 1);
    ctx.fillStyle = '#05080c';
    ctx.beginPath(); ctx.arc(x, my, i === 4 ? 6 : 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = i === 4 ? '#ffffff' : '#9aa6b6';
    ctx.lineWidth = i === 4 ? 2.5 : 1.5;
    ctx.stroke();
  }
  if (d.marker !== null) {
    const x = sx0 + ((sx1 - sx0) * d.marker) / (n - 1);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(x, my - 9); ctx.lineTo(x + 5, my - 14); ctx.lineTo(x - 5, my - 14); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, kind: 'hang' | 'pylon', cols: readonly ColumnData[], tickerIdx: number): void {
  const cell = kind === 'hang' ? HANG_CELL : PYLON_CELL;
  const g = ctx.createLinearGradient(0, cy, 0, cy + cell.h);
  g.addColorStop(0, '#0b1016');
  g.addColorStop(1, '#05080c');
  ctx.fillStyle = g;
  ctx.fillRect(cx, cy, cell.w, cell.h);
  const L = kind === 'hang' ? HANG_LAYOUT : PYLON_LAYOUT;
  cols.forEach((c, i) => drawColumn(ctx, cx + i * 256, cy, c, L));
  if (cols.length > 1) {
    ctx.fillStyle = '#26303c';
    ctx.fillRect(cx + 255, cy + 14, 1, cell.h - 54);
  }
  // Ticker: thin status line along the foot of the board
  const msg = `${lineLabelOf(TRACKS[cols[0]!.idx]!.line)} LINE  ·  ${TICKER[tickerIdx % TICKER.length]}`;
  ctx.save();
  ctx.fillStyle = '#1b232d';
  ctx.fillRect(cx + 10, cy + cell.h - 26, cell.w - 20, 1);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a7b2c1';
  fitFont(ctx, msg, 500, 15, cell.w - 28, 10);
  ctx.fillText(msg, cx + cell.w / 2, cy + cell.h - 12);
  ctx.restore();
}

// ---- geometry helpers ---------------------------------------------------------------------------------------------

/** Box with width along `r` (horizontal unit), thickness along its normal, centred at c. */
function boxAlong(cx: number, cy: number, cz: number, rx: number, rz: number, width: number, h: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(depth, h, width);
  g.rotateY(Math.atan2(rx, rz));
  g.translate(cx, cy, cz);
  return g;
}

function cylinder(x: number, y0: number, y1: number, z: number, r: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 12, 1);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}

export interface InfoScreens {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  /** Redraws changed cells at most twice per real second (`force` skips the throttle: scene staging). */
  update(trains: readonly TrainState[], realSec: number, etas: ReadonlyArray<number | null>, force?: boolean): void;
}

interface Placed {
  readonly spec: InfoScreenSpec;
  /** Atlas cells: face A first, then face B (pylons share one cell for both faces). */
  readonly cells: ReadonlyArray<{ x: number; y: number; cols: readonly number[] }>;
}

export function buildInfoScreens(lib: MaterialLibrary, kit: MetroMaterials): InfoScreens {
  const group = new THREE.Group();
  group.name = 'metroInfoScreens';
  const specs = infoScreenSpecs();

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W; canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#05080c';
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;

  // ---- atlas allocation ----
  let hangUsed = 0, pylonUsed = 0;
  const placed: Placed[] = specs.map((spec) => {
    if (spec.kind === 'hang') {
      const [nx, nz] = spec.normal;
      const rightA: readonly [number, number] = [nz, -nx];
      const lat = (idx: number): number => (TRACKS[idx]!.origin[0] - spec.x) * rightA[0] + (TRACKS[idx]!.origin[1] - spec.z) * rightA[1];
      const colsA = [...spec.tracks].sort((a, b) => lat(a) - lat(b));
      const take = (cols: readonly number[]): { x: number; y: number; cols: readonly number[] } => {
        const k = hangUsed++;
        if (k >= HANG_COLS * HANG_ROWS) throw new Error('infoScreens: hang atlas cells exhausted');
        return { x: (k % HANG_COLS) * HANG_CELL.w, y: Math.floor(k / HANG_COLS) * HANG_CELL.h, cols };
      };
      return { spec, cells: [take(colsA), take([...colsA].reverse())] };
    }
    const k = pylonUsed++;
    if (k >= PYLON_COLS * PYLON_ROWS) throw new Error('infoScreens: pylon atlas cells exhausted');
    return { spec, cells: [{ x: PYLON_X0 + (k % PYLON_COLS) * PYLON_CELL.w, y: Math.floor(k / PYLON_COLS) * PYLON_CELL.h, cols: spec.tracks }] };
  });

  // ---- geometry ----
  const steel = new GeoBag(lib, 'brass', kit.metersPerTile.stainless);
  const screenParts: THREE.BufferGeometry[] = [];
  const addFace = (
    cx: number, cy: number, cz: number, mx: number, mz: number, w: number, h: number,
    cell: { x: number; y: number }, kind: 'hang' | 'pylon',
  ): void => {
    // Right-hand vector of a viewer facing the board along outward normal m = (mx, 0, mz): (mz, -mx).
    const r: [number, number] = [mz, -mx];
    const hw = w / 2, hh = h / 2;
    const cs = kind === 'hang' ? HANG_CELL : PYLON_CELL;
    const u0 = cell.x / ATLAS_W, u1 = (cell.x + cs.w) / ATLAS_W;
    const vT = 1 - cell.y / ATLAS_H, vB = 1 - (cell.y + cs.h) / ATLAS_H;
    const P = (sx: number, sy: number): [number, number, number] => [cx + r[0] * hw * sx + mx * 0.0015, cy + hh * sy, cz + r[1] * hw * sx + mz * 0.0015];
    const bl = P(-1, -1), br = P(1, -1), tr = P(1, 1), tl = P(-1, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...bl, ...br, ...tr, ...bl, ...tr, ...tl], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [mx, 0, mz]).flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, vB, u1, vB, u1, vT, u0, vB, u1, vT, u0, vT], 2));
    screenParts.push(g);
  };
  const addBody = (cx: number, cy: number, cz: number, nx: number, nz: number, w: number, h: number, depth: number): void => {
    const g = boxAlong(cx, cy, cz, nz, -nx, w, h, depth).toNonIndexed();
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, BLACK_UV[0], BLACK_UV[1]);
    screenParts.push(g);
  };

  for (const { spec, cells } of placed) {
    const [nx, nz] = spec.normal;
    const rx = nz, rz = -nx;
    if (spec.kind === 'hang') {
      const { w, h, depth, bottomAbove } = INFO_SCREENS.hang;
      const cy = spec.platformY + bottomAbove + h / 2;
      addBody(spec.x, cy, spec.z, nx, nz, w, h, depth);
      const off = depth / 2;
      const m = 0.012;
      addFace(spec.x + nx * off, cy, spec.z + nz * off, nx, nz, w - 2 * m, h - 2 * m, cells[0]!, 'hang');
      addFace(spec.x - nx * off, cy, spec.z - nz * off, -nx, -nz, w - 2 * m, h - 2 * m, cells[1]!, 'hang');
      const yTop = spec.platformY + bottomAbove + h;
      if (spec.mount === 'masts') {
        // One 90 mm stainless column beside the board, a cast node at its head, a cantilevered arm over the board and two slim hangers.
        const { columnOffset, columnR, armAbove, basePlateR } = INFO_SCREENS.meridian;
        const px = spec.x + rx * columnOffset, pz = spec.z + rz * columnOffset;
        const yArm = spec.platformY + armAbove;
        steel.add(cylinder(px, spec.platformY + 0.03, yArm + 0.1, pz, columnR));
        steel.add(cylinder(px, spec.platformY, spec.platformY + 0.03, pz, basePlateR));
        steel.add(cylinder(px, spec.platformY + 0.03, spec.platformY + 0.2, pz, columnR + 0.02));
        const node = new THREE.SphereGeometry(columnR + 0.032, 16, 10);
        node.translate(px, yArm, pz);
        steel.add(node);
        const armFrom = columnOffset, armTo = -0.75;
        steel.add(boxAlong(spec.x + rx * (armFrom + armTo) / 2, yArm, spec.z + rz * (armFrom + armTo) / 2, rx, rz, armFrom - armTo, 0.075, 0.055));
        for (const hs of [-0.6, 0.6]) {
          steel.add(cylinder(spec.x + rx * hs, yTop, yArm - 0.035, spec.z + rz * hs, 0.008));
        }
      } else {
        const yc = HALCYON.ceilingY;
        for (const s of [-1, 1]) {
          const hx = spec.x + rx * INFO_SCREENS.halcyon.rodHalfSpan * s, hz = spec.z + rz * INFO_SCREENS.halcyon.rodHalfSpan * s;
          steel.add(cylinder(hx, yTop, yc, hz, 0.011));
          steel.add(cylinder(hx, yc - 0.012, yc, hz, 0.05));
          steel.add(boxAlong(hx, yTop + 0.018, hz, rx, rz, 0.06, 0.036, depth + 0.012));
        }
      }
    } else {
      const { w, h, depth, bottomAbove } = INFO_SCREENS.pylon;
      const y0 = spec.platformY + bottomAbove;
      const cy = y0 + h / 2;
      addBody(spec.x, cy, spec.z, nx, nz, w, h, depth);
      const off = depth / 2;
      const m = 0.01;
      addFace(spec.x + nx * off, cy, spec.z + nz * off, nx, nz, w - 2 * m, h - 2 * m, cells[0]!, 'pylon');
      addFace(spec.x - nx * off, cy, spec.z - nz * off, -nx, -nz, w - 2 * m, h - 2 * m, cells[0]!, 'pylon');
      steel.add(boxAlong(spec.x, spec.platformY + 0.015, spec.z, rx, rz, 0.46, 0.03, 0.32));
      steel.add(boxAlong(spec.x, (spec.platformY + 0.03 + y0 + 0.01) / 2, spec.z, rx, rz, 0.1, y0 + 0.01 - spec.platformY - 0.03, 0.06));
    }
  }

  const deepMaterials: THREE.Material[] = [];
  const steelGeo = steel.merge();
  if (steelGeo) {
    const m = new THREE.Mesh(steelGeo, kit.deep.stainless);
    m.name = 'infoScreenHardware';
    group.add(m);
  }
  const screenGeo = mergeGeometries(screenParts, false)!;
  for (const p of screenParts) p.dispose();
  const screenMat = new THREE.MeshStandardMaterial({
    name: 'metroInfoScreens', color: 0xffffff, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.95,
    roughness: 0.16, metalness: 0.1, envMapIntensity: 0.8,
  });
  deepMaterials.push(screenMat);
  const screenMesh = new THREE.Mesh(screenGeo, screenMat);
  screenMesh.name = 'infoScreenBoards';
  screenMesh.userData.noShadow = true;
  group.add(screenMesh);

  // ---- content ----
  const cellSig: string[] = [];
  const cellList: Array<{ x: number; y: number; kind: 'hang' | 'pylon'; cols: readonly number[] }> = [];
  for (const { spec, cells } of placed) for (const c of cells) cellList.push({ ...c, kind: spec.kind });
  let lastAt = -1e9;

  const update = (trains: readonly TrainState[], realSec: number, etas: ReadonlyArray<number | null>, force = false): void => {
    if (!force && realSec - lastAt < UPDATE_PERIOD_SEC) return;
    lastAt = realSec;
    const tickerIdx = Math.floor(realSec / TICKER_PERIOD_SEC);
    const data = new Map<number, ColumnData>();
    const get = (idx: number): ColumnData => {
      let d = data.get(idx);
      if (!d) { d = columnData(idx, trains, etas[idx] ?? null); data.set(idx, d); }
      return d;
    };
    let dirty = false;
    for (let i = 0; i < cellList.length; i++) {
      const c = cellList[i]!;
      const cols = c.cols.map(get);
      const sig = `${cols.map((d) => d.sig).join('#')}@${tickerIdx % TICKER.length}`;
      if (cellSig[i] === sig) continue;
      cellSig[i] = sig;
      drawCell(ctx, c.x, c.y, c.kind, cols, tickerIdx);
      dirty = true;
    }
    if (dirty) tex.needsUpdate = true;
  };
  update([], 0, [], true);

  return { group, deepMaterials, update };
}
