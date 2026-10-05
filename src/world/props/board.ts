import * as THREE from 'three';
import type { FrameInfo } from '../../core/types';
import { BOARD } from '../../layout';
import { rng } from '../concourse/geo';

/**
 * Split-flap departures board. One CanvasTexture (3072 px wide); the canvas is redrawn ONLY while a row is
 * flapping (needsUpdate only then). Deterministic: the PRNG is seeded and driven by FrameInfo.time.
 */

export interface Entry {
  time: string; // 'HH:MM' (5 cells)
  dest: string; // 16 cells
  plat: string; // 2 cells
  rem: string; // 9 cells
}

const C_TIME = 5;
const C_DEST = 16;
const C_PLAT = 2;
const C_REM = 9;
const CELLS = C_TIME + C_DEST + C_PLAT + C_REM;

const START: Entry[] = [
  { time: '06:49', dest: 'ELSEWHERE', plat: '2', rem: 'BOARDING' },
  { time: '06:52', dest: 'HOLLOW BAY', plat: '5', rem: 'ON TIME' },
  { time: '06:58', dest: 'THE LAST SUMMER', plat: '1', rem: 'ON TIME' },
  { time: '07:04', dest: 'MERIDIAN', plat: '3', rem: 'DELAYED' },
  { time: '07:11', dest: 'VESPER FALLS', plat: '6', rem: 'ON TIME' },
  { time: '07:20', dest: 'ASHGROVE', plat: '4', rem: 'ON TIME' },
  { time: '07:26', dest: 'HALCYON', plat: '2', rem: 'ON TIME' },
  { time: '07:35', dest: 'NOWHERE JUNCTION', plat: '5', rem: '—' },
];

export const DESTS = [
  'ELSEWHERE', 'HOLLOW BAY', 'THE LAST SUMMER', 'MERIDIAN', 'VESPER FALLS', 'ASHGROVE', 'HALCYON', 'NOWHERE JUNCTION',
  'DUSKHAVEN', 'THE QUIET HOURS', 'LANTERN SOUND', 'PAPER HARBOUR', 'SOMEWHERE ELSE', 'THE LONG WAY', 'LOW MERIDIAN', 'OLD NOSTALGIA',
];
const REMARKS = ['ON TIME', 'ON TIME', 'ON TIME', 'BOARDING', 'DELAYED', '—'];
const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Phase 4 hook: the ticket system forces one row to a specific entry (flap animation) and can read which
 * destinations are on the board. Set by buildBoard(); null before the board exists.
 */
export interface BoardControl {
  /** Re-flap one row (the one whose time is nearest `entry.time`) to `entry`; it then stays until the next call. */
  forceRow(entry: Entry): void;
  /** Destinations currently on the board (including a pending forced one). */
  destinations(): string[];
}
export let boardControl: BoardControl | null = null;

export interface BoardRig {
  mesh: THREE.Mesh;
  update(f: FrameInfo): void;
}

const CW = 3072;
const CH = 850;

/** Display area (m): the board plane minus the brass frame. */
export const BOARD_DISPLAY = { w: 15.2, h: (15.2 * CH) / CW };

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

export function buildBoard(renderer: THREE.WebGLRenderer): BoardRig {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');

  const rows: Entry[] = START.map((e) => ({ ...e }));
  const rand = rng(0x6d657269);

  // --- layout ---------------------------------------------------------------------------------------
  const cellW = 54;
  const cellH = 70;
  const rowPitch = 80;
  const top = 176;
  const colX = [0, 0, 0, 0];
  const marginL = 90;
  const gap = (CW - 2 * marginL - CELLS * cellW) / 3;
  colX[0] = marginL;
  colX[1] = colX[0] + C_TIME * cellW + gap;
  colX[2] = colX[1] + C_DEST * cellW + gap;
  colX[3] = colX[2] + C_PLAT * cellW + gap;

  const CREAM = '#f6e7c6';
  const FONT = `700 60px "Helvetica Neue", "Arial Narrow", Arial, sans-serif`;

  const drawCell = (x: number, y: number, ch: string, color: string): void => {
    // flap body
    g.fillStyle = '#25211c';
    g.beginPath();
    g.roundRect(x + 1.5, y, cellW - 3, cellH, 5);
    g.fill();
    g.strokeStyle = '#0a0908';
    g.lineWidth = 2;
    g.stroke();
    // upper half slightly lighter, lower darker (two flaps)
    g.fillStyle = 'rgba(255,240,210,0.05)';
    g.fillRect(x + 1.5, y + 2, cellW - 3, cellH / 2 - 2);
    if (ch.trim()) {
      g.fillStyle = color;
      g.font = FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, x + cellW / 2, y + cellH / 2 + 3);
    }
    // hairline split
    g.fillStyle = '#050403';
    g.fillRect(x + 1.5, y + cellH / 2 - 1.2, cellW - 3, 2.4);
    g.fillStyle = 'rgba(255,235,200,0.10)';
    g.fillRect(x + 1.5, y + cellH / 2 + 1.2, cellW - 3, 1);
    // hinge pins
    g.fillStyle = '#2a2622';
    g.fillRect(x + 1.5, y + cellH / 2 - 3, 3, 6);
    g.fillRect(x + cellW - 4.5, y + cellH / 2 - 3, 3, 6);
  };

  const remColor = (rem: string): string => (rem === 'DELAYED' ? '#f09a54' : rem === 'BOARDING' ? '#ffe9a8' : CREAM);

  /** chars: per-cell characters for the row (full width), already padded */
  const drawRow = (r: number, chars: string[] | null, e: Entry): void => {
    const y = top + r * rowPitch;
    // clear row strip
    g.fillStyle = '#080706';
    g.fillRect(0, y - 6, CW, rowPitch);
    const cells = chars ?? (pad(e.time, C_TIME) + pad(e.dest, C_DEST) + pad(e.plat.padStart(C_PLAT - 1, ' '), C_PLAT) + pad(e.rem, C_REM)).split('');
    const col = remColor(e.rem);
    for (let i = 0; i < CELLS; i++) {
      let cx: number;
      let color = CREAM;
      if (i < C_TIME) cx = colX[0]! + i * cellW;
      else if (i < C_TIME + C_DEST) cx = colX[1]! + (i - C_TIME) * cellW;
      else if (i < C_TIME + C_DEST + C_PLAT) cx = colX[2]! + (i - C_TIME - C_DEST) * cellW;
      else {
        cx = colX[3]! + (i - C_TIME - C_DEST - C_PLAT) * cellW;
        color = col;
      }
      drawCell(cx, y, cells[i] ?? ' ', color);
    }
  };

  const drawStatic = (): void => {
    g.fillStyle = '#080706';
    g.fillRect(0, 0, CW, CH);
    // header
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = '#e0b960';
    g.font = '600 84px "Didot", "Bodoni 72", "Georgia", "Times New Roman", serif';
    const title = 'D E P A R T U R E S';
    g.fillText(title, marginL, 98);
    g.textAlign = 'right';
    g.font = '500 34px "Georgia", serif';
    g.fillStyle = '#b79444';
    g.fillText('G R A N D   M E R I D I A N   T E R M I N A L', CW - marginL, 96);
    // Deco rule: thick + thin
    g.fillStyle = '#c9a24e';
    g.fillRect(marginL, 114, CW - 2 * marginL, 5);
    g.fillRect(marginL, 126, CW - 2 * marginL, 2);
    // column heads
    g.textAlign = 'left';
    g.font = '600 30px "Helvetica Neue", Arial, sans-serif';
    g.fillStyle = '#b79444';
    const heads = ['TIME', 'DESTINATION', 'PLATFORM', 'REMARKS'];
    heads.forEach((h, i) => g.fillText(h.split('').join(' '), colX[i]!, 162));
    for (let r = 0; r < rows.length; r++) drawRow(r, null, rows[r]!);
  };
  drawStatic();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  const mat = new THREE.MeshStandardMaterial({
    name: 'boardScreen', map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffdcaa), emissiveIntensity: 0.9,
    roughness: 0.7, metalness: 0,
  });
  const geo = new THREE.PlaneGeometry(BOARD_DISPLAY.w, BOARD_DISPLAY.h);
  geo.rotateY(Math.PI); // face -Z
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'boardScreen';
  mesh.position.set(BOARD.center[0], BOARD.center[1], BOARD.center[2] - 0.02);
  mesh.receiveShadow = true;

  // --- animation state ----------------------------------------------------------------------------------
  interface Flap { row: number; t0: number; from: Entry; to: Entry; last: number }
  let flap: Flap | null = null;
  let nextAt = 14 + rand() * 8;
  let lastRow = -1;
  let pendingForce: Entry | null = null;
  let lockedRow = -1; // the row last forced by a ticket: random flaps leave it alone
  const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  boardControl = {
    forceRow(entry: Entry): void {
      pendingForce = { ...entry };
    },
    destinations: () => [...rows.map((r) => r.dest), ...(pendingForce ? [pendingForce.dest] : [])],
  };

  const pickEntry = (row: number): Entry => {
    const cur = rows[row]!;
    let dest = cur.dest;
    while (dest === cur.dest || rows.some((r, i) => i !== row && r.dest === dest)) dest = DESTS[Math.floor(rand() * DESTS.length)]!;
    // keep the list in time order: nudge this row's time forward, never past the next row
    const own = toMin(cur.time);
    const nxt = rows[row + 1] ? toMin(rows[row + 1]!.time) : own + 20;
    const mins = Math.min(own + 1 + Math.floor(rand() * 3), Math.max(own, nxt - 1));
    const time = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    return { time, dest, plat: String(1 + Math.floor(rand() * 6)), rem: REMARKS[Math.floor(rand() * REMARKS.length)]! };
  };

  const rowChars = (e: Entry): string[] => (pad(e.time, C_TIME) + pad(e.dest, C_DEST) + pad(e.plat.padStart(C_PLAT - 1, ' '), C_PLAT) + pad(e.rem, C_REM)).split('');

  const DUR = 1.9;
  return {
    mesh,
    update(f: FrameInfo): void {
      if (!flap) {
        if (pendingForce) {
          // nearest row by time, never the same one twice running if another is equally close
          let row = 0;
          let best = Infinity;
          const want = toMin(pendingForce.time);
          rows.forEach((r, i) => {
            const d = Math.abs(toMin(r.time) - want) + (i === lockedRow ? 0.5 : 0);
            if (d < best) {
              best = d;
              row = i;
            }
          });
          lockedRow = row;
          lastRow = row;
          flap = { row, t0: f.time, from: { ...rows[row]! }, to: pendingForce, last: -1 };
          pendingForce = null;
          return;
        }
        if (f.time >= nextAt) {
          let row = Math.floor(rand() * rows.length);
          if (row === lastRow || row === lockedRow) row = (row + 3) % rows.length;
          if (row === lockedRow) row = (row + 1) % rows.length;
          lastRow = row;
          flap = { row, t0: f.time, from: { ...rows[row]! }, to: pickEntry(row), last: -1 };
        }
        return;
      }
      const t = f.time - flap.t0;
      const frameIdx = Math.floor(t * 16);
      if (frameIdx === flap.last && t < DUR) return;
      flap.last = frameIdx;
      const from = rowChars(flap.from);
      const to = rowChars(flap.to);
      const chars: string[] = [];
      for (let i = 0; i < CELLS; i++) {
        const settle = 0.3 + (i / (CELLS - 1)) * (DUR - 0.5);
        if (t >= settle) chars.push(to[i]!);
        else if (t < 0.12) chars.push(from[i]!);
        else {
          // cycle through letters; hash of (cell, frame) so the order is deterministic
          const h = Math.imul(i * 2654435761 + frameIdx * 40503, 2246822519) >>> 0;
          chars.push(to[i] === ' ' && from[i] === ' ' ? ' ' : FLAP_CHARS[h % FLAP_CHARS.length]!);
        }
      }
      drawRow(flap.row, chars, t >= DUR - 0.25 ? flap.to : flap.from);
      tex.needsUpdate = true;
      if (t >= DUR) {
        rows[flap.row] = flap.to;
        drawRow(flap.row, null, flap.to);
        tex.needsUpdate = true;
        flap = null;
        nextAt = f.time + 20 + rand() * 20;
      }
    },
  };
}
