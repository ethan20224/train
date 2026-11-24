import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import {
  KIT_LOUNGE_INTERIOR, KIT_PLATFORMS, PLATFORM_KIT, PLATFORM_KIT_FRAMES, kitCarCentres, kitItems, kitWorld, kitYaw,
  type KitFrame, type KitItem,
} from '../../layoutMetro';
import { rng } from '../concourse/geo';
import { CELL, Mesher, card, frond, patchForest, sharedFoliageAtlas } from './forest';
import { hdrFromKelvin, type MetroMaterials } from './materials';
import { makeOakTexture } from './walkKit';

/**
 * Platform life and the real station kit, on all three platforms (Meridian island, Vesper/Crossing floor, Halcyon island).
 * Layout lives in `PLATFORM_KIT` (src/layoutMetro.ts: frames, edge slots, centre bench-planters, amenities, footprints and the collision
 * circles); this file only turns those rows into geometry.
 *
 * Draw calls: ALL platforms share eight meshes, one per material: honed stone, oiled oak, satin stainless, champagne aluminium,
 * ultra-clear glass, emissive fixtures (screens, ports, coves: one unlit material, HDR vertex colours), decals (tactile strips, floor
 * plaques, signs, dark parts) and the forest foliage atlas (ferns, moss, bromeliads in the planters). Everything is merged static
 * geometry stamped from per-item builders; no per-frame work except the foliage sway the forest module already drives.
 */

type Bin = 'stone' | 'oak' | 'steel' | 'champ' | 'glass' | 'glow' | 'decal';
type RGB = readonly [number, number, number];
type V3 = readonly [number, number, number];

/** Micro-detail of the kit builders (metres). Footprints and placements live in PLATFORM_KIT. */
const KD = {
  oakTileU: 2.4, oakTileV: 1.12,
  planterH: 0.62, plinthH: 0.38, wall: 0.08, seatY: 0.45, seatT: 0.05, slat: 0.18, slatGap: 0.02,
  tactileCellM: 0.30,
  warm: hdrFromKelvin(3200, 1.5), warmSoft: hdrFromKelvin(3200, 0.9), screen: [1.5, 1.5, 1.5] as RGB,
  port: [0.5, 2.0, 1.5] as RGB, amber: [2.6, 1.2, 0.2] as RGB, green: [0.2, 1.8, 0.6] as RGB,
} as const;

// ---- decal / screen atlas -------------------------------------------------------------------------------------------------

const ATLAS_W = 2048, ATLAS_H = 1024;
/** Pixel rectangles (x, y, w, h; canvas y down) of the cells of the shared decal + screen atlas. */
const CELLS = {
  tactile: [0, 0, 256, 256], plain: [256, 0, 64, 64], dark: [320, 0, 64, 64], white: [384, 0, 64, 64], soil: [448, 0, 64, 64],
  car1: [512, 0, 256, 256], car2: [768, 0, 256, 256], car3: [1024, 0, 256, 256], car4: [1280, 0, 256, 256],
  tick: [1536, 0, 256, 256], fire: [1792, 0, 256, 256],
  staff: [0, 256, 512, 256], helpPlate: [512, 256, 128, 128],
  helpScreen: [768, 256, 512, 320],
  monitor: [0, 576, 1024, 448], kioskBoard: [1024, 576, 1024, 192], waterScreen: [1024, 768, 256, 256],
} as const satisfies Record<string, readonly [number, number, number, number]>;
type CellName = keyof typeof CELLS;

function cellUV(name: CellName): { u0: number; v0: number; u1: number; v1: number } {
  const [x, y, w, h] = CELLS[name];
  return { u0: x / ATLAS_W, u1: (x + w) / ATLAS_W, v1: 1 - y / ATLAS_H, v0: 1 - (y + h) / ATLAS_H };
}

function paintAtlas(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS_W; c.height = ATLAS_H;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  const r = rng(4417);
  const font = (w: number, px: number): string => `${w} ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const rect = (n: CellName): [number, number, number, number] => [...CELLS[n]];
  const fill = (n: CellName, col: string): void => { const [x, y, w, h] = rect(n); g.fillStyle = col; g.fillRect(x, y, w, h); };
  g.fillStyle = '#000'; g.fillRect(0, 0, ATLAS_W, ATLAS_H);
  fill('plain', '#b6ab98'); fill('dark', '#17191d'); fill('white', '#ffffff'); fill('soil', '#2b2219');

  // Tactile strip: warm grey stone-resin with a 5 x 5 field of truncated domes, shaded top-left to bottom-right; the cell repeats every 0.30 m.
  {
    const [x0, y0, S] = rect('tactile');
    g.fillStyle = '#8f8674'; g.fillRect(x0, y0, S, S);
    for (let k = 0; k < 1400; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,110,96' : '214,204,186'},${0.03 + r() * 0.05})`; g.fillRect(x0 + r() * S, y0 + r() * S, 1 + r() * 2, 1 + r() * 2); }
    const pitch = S / 5;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const cx = x0 + pitch * (i + 0.5), cy = y0 + pitch * (j + 0.5);
      g.fillStyle = 'rgba(70,62,50,0.38)'; g.beginPath(); g.arc(cx + 3, cy + 4, 17, 0, 6.2832); g.fill();
      const gr = g.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, 17);
      gr.addColorStop(0, '#c2b8a2'); gr.addColorStop(0.7, '#a89e89'); gr.addColorStop(1, '#756c5b');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 15, 0, 6.2832); g.fill();
    }
  }
  // Car plaques: graphite square, champagne keyline, big numeral.
  for (const [k, n] of [['car1', '1'], ['car2', '2'], ['car3', '3'], ['car4', '4']] as const) {
    const [x, y, w, h] = rect(k);
    g.fillStyle = '#212328'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#c9b88f'; g.lineWidth = 5; g.strokeRect(x + 12, y + 12, w - 24, h - 24);
    g.fillStyle = '#d6c7a2'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(600, 40); g.fillText('CAR', x + w / 2, y + 62);
    g.font = font(300, 150); g.fillText(n, x + w / 2, y + 150);
  }
  {
    const [x, y, w, h] = rect('tick');
    g.fillStyle = '#212328'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#c9b88f'; g.lineWidth = 5; g.strokeRect(x + 12, y + 12, w - 24, h - 24);
    g.fillStyle = '#d6c7a2';
    g.beginPath(); g.moveTo(x + w / 2, y + 40); g.lineTo(x + w - 62, y + 130); g.lineTo(x + w / 2 + 26, y + 130); g.lineTo(x + w / 2 + 26, y + 196); g.lineTo(x + w / 2 - 26, y + 196); g.lineTo(x + w / 2 - 26, y + 130); g.lineTo(x + 62, y + 130); g.closePath(); g.fill();
  }
  // Fire / emergency plate: signal red with a white extinguisher pictogram.
  {
    const [x, y, w, h] = rect('fire');
    g.fillStyle = '#a8231c'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f4efe6';
    g.beginPath(); g.roundRect(x + 92, y + 98, 72, 118, 22); g.fill();
    g.fillRect(x + 118, y + 66, 20, 36);
    g.fillRect(x + 118, y + 62, 62, 14);
    g.beginPath(); g.moveTo(x + 164, y + 70); g.quadraticCurveTo(x + 204, y + 80, x + 200, y + 130); g.lineWidth = 9; g.strokeStyle = '#f4efe6'; g.stroke();
    g.fillStyle = '#a8231c'; g.fillRect(x + 100, y + 128, 56, 8);
  }
  {
    const [x, y, w, h] = rect('staff');
    g.fillStyle = '#1b1d21'; g.fillRect(x, y, w, h);
    g.fillStyle = '#a8231c'; g.fillRect(x, y, 26, h);
    g.fillStyle = '#f2eee6'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = font(700, 96); g.fillText('STAFF ONLY', x + 56, y + 96);
    g.fillStyle = '#c9b88f'; g.font = font(500, 38); g.fillText('TRACK ACCESS · NO PUBLIC ENTRY', x + 56, y + 184);
  }
  {
    const [x, y, w, h] = rect('helpPlate');
    g.fillStyle = '#1f5ea6'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f4f4f2'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(700, 96); g.fillText('?', x + w / 2, y + h / 2 + 4);
  }
  // Emissive cells (drawn at moderate brightness: the unlit material multiplies by an HDR vertex colour).
  {
    const [x, y, w, h] = rect('helpScreen');
    g.fillStyle = '#05100f'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#53e0c4'; g.lineWidth = 8; g.beginPath(); g.arc(x + 92, y + h / 2, 52, 0, 6.2832); g.stroke();
    g.fillStyle = '#53e0c4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(700, 70); g.fillText('?', x + 92, y + h / 2 + 4);
    g.textAlign = 'left'; g.font = font(700, 92); g.fillText('HELP', x + 176, y + 110);
    g.fillStyle = '#b6e8de'; g.font = font(400, 44); g.fillText('Press for assistance', x + 176, y + 190); g.fillText('24 h · voice and video', x + 176, y + 250);
  }
  {
    const [x, y, w, h] = rect('monitor');
    g.fillStyle = '#060b13'; g.fillRect(x, y, w, h);
    g.fillStyle = '#8fa4c0'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = font(500, 44); g.fillText('MERIDIAN DEEP · SYSTEM STATUS', x + 48, y + 60);
    g.fillStyle = '#4de08b'; g.beginPath(); g.arc(x + 70, y + 170, 22, 0, 6.2832); g.fill();
    g.fillStyle = '#eef3fa'; g.font = font(700, 66); g.fillText('AUTOMATIC OPERATION', x + 118, y + 170);
    g.fillStyle = '#a9bad2'; g.font = font(400, 48); g.fillText('Driverless trains · all lines running normally', x + 48, y + 262);
    const lines: Array<[string, string]> = [['MERIDIAN', '#2f6bdc'], ['VESPER', '#14b36a'], ['HALCYON', '#c23a52']];
    lines.forEach(([n, col], i) => {
      const cx = x + 48 + i * 320;
      g.fillStyle = col; g.beginPath(); g.arc(cx + 24, y + 366, 24, 0, 6.2832); g.fill();
      g.fillStyle = '#dfe7f2'; g.font = font(600, 40); g.fillText(n, cx + 62, y + 366);
    });
  }
  {
    const [x, y, w, h] = rect('kioskBoard');
    g.fillStyle = '#17110b'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f2d9a8'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = font(600, 78); g.fillText('COFFEE · TEA · BAKERY', x + 40, y + 78);
    g.fillStyle = '#c9a36a'; g.font = font(400, 40); g.fillText('Oat, hazelnut and cloud-forest single origin', x + 40, y + 148);
  }
  {
    const [x, y, w, h] = rect('waterScreen');
    g.fillStyle = '#04101a'; g.fillRect(x, y, w, h);
    g.fillStyle = '#6cc8f2'; g.beginPath(); g.moveTo(x + w / 2, y + 36); g.quadraticCurveTo(x + w / 2 + 70, y + 130, x + w / 2, y + 168); g.quadraticCurveTo(x + w / 2 - 70, y + 130, x + w / 2, y + 36); g.fill();
    g.fillStyle = '#bfe6f8'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(700, 40); g.fillText('REFILL', x + w / 2, y + 212);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// ---- geometry collector ---------------------------------------------------------------------------------------------------

class Bags {
  readonly bins: Record<Bin, THREE.BufferGeometry[]> = { stone: [], oak: [], steel: [], champ: [], glass: [], glow: [], decal: [] };
  readonly fol = new Mesher();
  /** Current item placement (local item frame -> world). */
  T = new THREE.Matrix4();
  private readonly rnd = rng(9021);

  put(bin: Bin, g: THREE.BufferGeometry, color?: RGB, keepUV = false): void {
    g.applyMatrix4(this.T);
    if (!keepUV && (bin === 'decal' || bin === 'glow')) {
      // cell-less solids sample the middle of a plain cell (dark for decals, white for emitters)
      const c = cellUV(bin === 'decal' ? 'dark' : 'white'), uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
      const n = g.getAttribute('position').count;
      const arr = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { arr[i * 2] = (c.u0 + c.u1) / 2; arr[i * 2 + 1] = (c.v0 + c.v1) / 2; }
      void uv;
      g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
    }
    if (bin === 'glow') {
      const n = g.getAttribute('position').count;
      const c = color ?? [1, 1, 1];
      g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from({ length: n * 3 }, (_, i) => c[i % 3]!), 3));
    }
    this.bins[bin].push(g);
  }
  /** Axis-aligned box in the item frame. Oak boxes get plank UVs (grain along the long face edge). */
  box(bin: Bin, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color?: RGB): void {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const g = new THREE.BoxGeometry(w, h, d);
    if (bin === 'oak') {
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const dims: ReadonlyArray<readonly [number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      const ou = this.rnd(), ov = this.rnd();
      for (let i = 0; i < uv.count; i++) {
        const [a, b] = dims[Math.floor(i / 4)]!;
        const u = uv.getX(i), v = uv.getY(i);
        if (a >= b) uv.setXY(i, (u * a) / KD.oakTileU + ou, (v * b) / KD.oakTileV + ov);
        else uv.setXY(i, (v * b) / KD.oakTileU + ou, (u * a) / KD.oakTileV + ov);
      }
    }
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.put(bin, g, color);
  }
  /** Vertical or horizontal-axis cylinder; `axis` is the cylinder's long axis in the item frame. */
  cyl(bin: Bin, axis: 'x' | 'y' | 'z', cx: number, cy: number, cz: number, r: number, len: number, seg = 12, color?: RGB): void {
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    else if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(cx, cy, cz);
    this.put(bin, g, color);
  }
  /** Quad p0..p3 (item frame, counter-clockwise seen from `n`), with the atlas cell mapped bl, br, tr, tl. */
  quad(bin: 'glow' | 'decal', p: readonly [V3, V3, V3, V3], n: V3, cell: CellName, color?: RGB): void {
    const { u0, v0, u1, v1 } = cellUV(cell);
    const uv = [u0, v0, u1, v0, u1, v1, u0, v1];
    const pos: number[] = [];
    for (const q of p) pos.push(q[0], q[1], q[2]);
    const a = new THREE.Vector3(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
    const b = new THREE.Vector3(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
    const flip = a.cross(b).dot(new THREE.Vector3(n[0], n[1], n[2])) < 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([...n, ...n, ...n, ...n], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    this.put(bin, g, color, true);
  }
  /** Rectangle on a face of an item: `face` +z/-z/+x/-x, spanning (a0..a1) horizontally and (y0..y1), at offset `off` along the face normal. */
  face(bin: 'glow' | 'decal', face: 'z+' | 'z-' | 'x+' | 'x-', off: number, a0: number, a1: number, y0: number, y1: number, cell: CellName, color?: RGB): void {
    switch (face) {
      case 'z+': return this.quad(bin, [[a0, y0, off], [a1, y0, off], [a1, y1, off], [a0, y1, off]], [0, 0, 1], cell, color);
      case 'z-': return this.quad(bin, [[a1, y0, off], [a0, y0, off], [a0, y1, off], [a1, y1, off]], [0, 0, -1], cell, color);
      case 'x+': return this.quad(bin, [[off, y0, a1], [off, y0, a0], [off, y1, a0], [off, y1, a1]], [1, 0, 0], cell, color);
      case 'x-': return this.quad(bin, [[off, y0, a0], [off, y0, a1], [off, y1, a1], [off, y1, a0]], [-1, 0, 0], cell, color);
    }
  }
  /** Flat horizontal rectangle at height y facing up (or down), whole cell. */
  flat(bin: 'glow' | 'decal', x0: number, z0: number, x1: number, z1: number, y: number, cell: CellName, up = true, color?: RGB): void {
    if (up) this.quad(bin, [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [0, 1, 0], cell, color);
    else this.quad(bin, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, -1, 0], cell, color);
  }
}

/** Stadium (slot) outline in plan: `len` long (x), `w` wide (z). */
function stadiumPts(len: number, w: number, n = 10): THREE.Vector2[] {
  const r = w / 2, hx = Math.max(0, len / 2 - r), pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n; pts.push(new THREE.Vector2(hx + Math.cos(a) * r, Math.sin(a) * r)); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (Math.PI * i) / n; pts.push(new THREE.Vector2(-hx + Math.cos(a) * r, Math.sin(a) * r)); }
  return pts;
}
/** Stadium prism from y0 to y1 (optionally with a hole outline). */
function stadiumPrism(len: number, w: number, y0: number, y1: number, hole?: { len: number; w: number }): THREE.BufferGeometry {
  const shape = new THREE.Shape(stadiumPts(len, w));
  if (hole) shape.holes.push(new THREE.Path(stadiumPts(hole.len, hole.w)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

// ---- foliage --------------------------------------------------------------------------------------------------------------

const UPV = new THREE.Vector3(0, 1, 0);
const upNormal = (): THREE.Vector3 => UPV;

/** Fern, moss and bromeliad planting of a rectangular bed (item frame), soil surface at `y`. */
function plantBed(b: Bags, rnd: () => number, cx: number, cz: number, hx: number, hz: number, y: number, opts: { treeFern?: boolean; bromeliad?: boolean }): void {
  const w = (lx: number, ly: number, lz: number): THREE.Vector3 => new THREE.Vector3(lx, ly, lz).applyMatrix4(b.T);
  // Ground cover: flat leaf cards (moss and low leaves) over the whole bed.
  const step = 0.3;
  for (let x = cx - hx + 0.15; x <= cx + hx - 0.15; x += step) for (let z = cz - hz + 0.15; z <= cz + hz - 0.15; z += step) {
    const c = w(x + (rnd() - 0.5) * 0.12, y + 0.015 + rnd() * 0.04, z + (rnd() - 0.5) * 0.12);
    const ang = rnd() * 6.283, s = 0.2 + rnd() * 0.1, k = 0.65 + rnd() * 0.3;
    const ax = new THREE.Vector3(Math.cos(ang) * s, 0, Math.sin(ang) * s);
    const bz = new THREE.Vector3(-ax.z, 0, ax.x);
    card(b.fol, c, ax, bz, rnd() < 0.5 ? CELL.leafA : CELL.leafB, [k * 0.85, k, k * 0.7], upNormal, 0, 0.05, rnd() * 6.283);
  }
  // Ferns: a loose line of rosettes, alternating frond cards.
  const n = Math.max(2, Math.round((2 * hx) / 0.46));
  for (let i = 0; i < n; i++) {
    const fx = cx - hx + 0.28 + ((2 * hx - 0.56) * (i + 0.5 * (i % 2))) / n, fz = cz + (rnd() - 0.5) * (hz * 0.9);
    const base = w(fx, y - 0.02, fz);
    const ph = rnd() * 6.283, tone = 0.8 + rnd() * 0.3, size = 0.46 + rnd() * 0.22;
    for (let k = 0; k < 7; k++) {
      const az = (k / 7) * 6.283 + rnd() * 0.5;
      frond(b.fol, base, az, 0.9 + rnd() * 0.3, 0.1 - rnd() * 0.3, size * (0.85 + rnd() * 0.4), size * 0.46, 4,
        rnd() < 0.5 ? CELL.frondA : CELL.frondB, [tone * 0.95, tone, tone * 0.85], 0.3, ph + k * 0.7);
    }
  }
  if (opts.bromeliad) {
    const lx = cx + (rnd() - 0.5) * hx * 1.2, lz = cz + (rnd() - 0.5) * hz * 0.6;
    for (let k = 0; k < 2; k++) {
      const ang = k * 1.5708 + rnd();
      const ax = new THREE.Vector3(Math.cos(ang) * 0.2, 0, Math.sin(ang) * 0.2), bv = new THREE.Vector3(0, 0.22, 0);
      card(b.fol, w(lx, y + 0.2, lz), ax, bv, CELL.bromeliad, [1, 1, 1], upNormal, 0, 0.25, rnd() * 6.283);
    }
  }
  if (opts.treeFern) {
    const lx = cx + (rnd() - 0.5) * hx * 0.8, lz = cz;
    const topH = 0.85 + rnd() * 0.3;
    const trunk = new THREE.CylinderGeometry(0.045, 0.06, topH, 8);
    trunk.translate(lx, y + topH / 2, lz);
    const tc = cellUV('soil'), tuv = trunk.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < tuv.count; i++) tuv.setXY(i, (tc.u0 + tc.u1) / 2, (tc.v0 + tc.v1) / 2);
    b.put('decal', trunk, undefined, true);
    const top = w(lx, y + topH, lz);
    for (let k = 0; k < 10; k++) {
      const az = (k / 10) * 6.283 + rnd() * 0.4, len = 0.9 + rnd() * 0.45;
      frond(b.fol, top, az, 0.7 + rnd() * 0.3, -0.5 - rnd() * 0.3, len, 0.46, 5, rnd() < 0.5 ? CELL.frondA : CELL.frondB, [0.95, 1, 0.9], 0.5, rnd() * 6.283);
    }
  }
}

// ---- per-item builders (item frame: +z front, +x right, y up from the floor) ----------------------------------------------------

function buildPlanter(b: Bags, rnd: () => number, len: number, withTreeFern: boolean): void {
  const W = PLATFORM_KIT.planter.width, h = KD.planterH;
  // Recessed plinth, base slab, then the stone trough ring: sculpted slot plan with full-radius ends.
  b.put('stone', stadiumPrism(len - 0.2, W - 0.26, 0, KD.plinthH - 0.02));
  b.put('stone', stadiumPrism(len, W, KD.plinthH - 0.02, KD.plinthH + 0.02));
  b.put('stone', stadiumPrism(len, W, KD.plinthH + 0.02, h, { len: len - 2 * KD.wall, w: W - 2 * KD.wall }));
  // Soil surface (dark, inside the ring).
  const soil = new THREE.ShapeGeometry(new THREE.Shape(stadiumPts(len - 2 * KD.wall - 0.01, W - 2 * KD.wall - 0.01)));
  soil.rotateX(-Math.PI / 2);
  soil.translate(0, h - 0.07, 0);
  const suv = cellUV('soil'), uv = soil.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (suv.u0 + suv.u1) / 2, (suv.v0 + suv.v1) / 2);
  b.put('decal', soil, undefined, true);
  // Oak seats on both sides: two slats each, on stone corbels, warm LED line under the seat.
  const half = len / 2 - 0.5, z0 = W / 2 + 0.01;
  for (const s of [1, -1]) {
    for (let k = 0; k < 2; k++) {
      const za = z0 + k * (KD.slat + KD.slatGap), zb = za + KD.slat;
      b.box('oak', -half, KD.seatY - KD.seatT, Math.min(s * za, s * zb), half, KD.seatY, Math.max(s * za, s * zb));
    }
    const nrib = Math.max(2, Math.round((2 * half) / 1.2) + 1);
    for (let k = 0; k < nrib; k++) {
      const x = -half + 0.12 + ((2 * half - 0.24) * k) / (nrib - 1);
      b.box('stone', x - 0.04, KD.seatY - KD.seatT - 0.11, Math.min(s * (W / 2 - 0.02), s * (z0 + 0.3)), x + 0.04, KD.seatY - KD.seatT, Math.max(s * (W / 2 - 0.02), s * (z0 + 0.3)));
    }
    b.flat('glow', -half + 0.1, s * (z0 + 0.34), half - 0.1, s * (z0 + 0.36), KD.seatY - KD.seatT - 0.004, 'white', false, KD.warmSoft.toArray() as unknown as RGB);
  }
  plantBed(b, rnd, 0, 0, len / 2 - KD.wall - 0.02, W / 2 - KD.wall - 0.02, h - 0.07, { bromeliad: true, treeFern: withTreeFern });
}

function buildPerch(b: Bags): void {
  const L = PLATFORM_KIT.perch.len;
  for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) {
    b.cyl('steel', 'y', x, 0.5, 0, 0.026, 1.0, 10);
    b.box('steel', x - 0.07, 0, -0.08, x + 0.07, 0.012, 0.1);
  }
  b.cyl('steel', 'x', 0, 0.98, 0, 0.026, L - 0.3, 10);
  b.cyl('steel', 'x', 0, 0.7, 0, 0.018, L - 0.3, 8);
  for (const x of [-0.55, 0.55]) {
    b.box('steel', x - 0.012, 0.69, 0, x + 0.012, 0.71, 0.3);
    b.box('oak', x - 0.22, 0.71, 0.06, x + 0.22, 0.76, 0.34);
  }
}

function buildHelp(b: Bags): void {
  b.box('champ', -0.095, 0, -0.07, 0.095, 0.04, 0.07);
  b.box('steel', -0.08, 0.04, -0.06, 0.08, 1.45, 0.06);
  b.box('champ', -0.088, 1.45, -0.066, 0.088, 1.47, 0.066);
  b.face('decal', 'z+', 0.0605, -0.065, 0.065, 0.96, 1.4, 'dark');
  b.face('glow', 'z+', 0.0615, -0.056, 0.056, 1.27, 1.341, 'helpScreen', KD.screen);
  b.face('decal', 'z+', 0.0625, -0.03, 0.03, 1.356, 1.386, 'helpPlate');
  b.cyl('champ', 'z', 0, 1.12, 0.066, 0.03, 0.012, 16);
  b.cyl('glow', 'z', 0, 1.12, 0.074, 0.019, 0.004, 16, KD.amber);
  for (let k = 0; k < 3; k++) b.box('decal', -0.03, 1.0 + k * 0.026, 0.06, 0.03, 1.008 + k * 0.026, 0.0615);
}

function buildFire(b: Bags): void {
  b.box('decal', -0.26, 0, -0.115, 0.26, 0.06, 0.115);
  b.box('steel', -0.25, 0.06, -0.11, 0.25, 1.45, 0.11);
  b.box('champ', -0.255, 1.45, -0.115, 0.255, 1.47, 0.115);
  // door seams (recessed grooves), handle, red pictogram plate
  b.box('decal', -0.2, 0.2, 0.108, -0.196, 1.35, 0.111);
  b.box('decal', 0.196, 0.2, 0.108, 0.2, 1.35, 0.111);
  b.box('decal', -0.2, 0.2, 0.108, 0.2, 0.204, 0.111);
  b.box('decal', -0.2, 1.346, 0.108, 0.2, 1.35, 0.111);
  b.box('steel', 0.15, 0.7, 0.108, 0.162, 0.95, 0.128);
  b.face('decal', 'z+', 0.1115, -0.1, 0.1, 1.04, 1.24, 'fire');
}

function buildMast(b: Bags): void {
  b.cyl('steel', 'y', 0, 1.65, 0, 0.04, 3.3, 12);
  b.cyl('champ', 'y', 0, 0.01, 0, 0.11, 0.02, 16);
  b.cyl('champ', 'y', 0, 3.31, 0, 0.046, 0.02, 12);
  b.box('champ', -0.02, 3.2, 0.02, 0.02, 3.25, 0.4);
  b.cyl('champ', 'y', 0, 3.2, 0.4, 0.075, 0.025, 16);
  const dome = new THREE.SphereGeometry(0.068, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  dome.translate(0, 3.19, 0.4);
  b.put('decal', dome);
  for (const s of [1, -1]) {
    b.box('champ', s > 0 ? 0.04 : -0.1, 2.55, -0.035, s > 0 ? 0.1 : -0.04, 3.05, 0.035);
    b.face('decal', s > 0 ? 'x+' : 'x-', s * 0.1005, -0.028, 0.028, 2.6, 3.0, 'dark');
  }
}

function buildCharger(b: Bags): void {
  b.box('champ', -0.08, 0, -0.065, 0.08, 0.03, 0.065);
  b.box('steel', -0.065, 0.03, -0.05, 0.065, 1.05, 0.05);
  b.box('champ', -0.07, 1.05, -0.055, 0.07, 1.075, 0.055);
  for (const s of [1, -1]) {
    const f = s > 0 ? 'z+' : 'z-';
    b.face('decal', f, s * 0.0505, -0.045, 0.045, 0.62, 0.84, 'dark');
    for (let k = 0; k < 2; k++) b.face('glow', f, s * 0.0515, -0.016, 0.016, 0.7 + k * 0.08, 0.712 + k * 0.08, 'white', KD.port);
    b.face('glow', f, s * 0.0515, -0.03, 0.03, 0.98, 0.986, 'white', KD.warmSoft.toArray() as unknown as RGB);
  }
}

function buildFountain(b: Bags): void {
  b.box('stone', -0.26, 0, -0.17, 0.26, 0.84, 0.17);
  b.box('steel', -0.27, 0.84, -0.18, 0.27, 0.875, 0.2);
  b.flat('decal', -0.18, -0.06, 0.18, 0.17, 0.8755, 'dark');
  b.box('steel', -0.25, 0.875, -0.18, 0.25, 1.28, -0.15);
  b.face('glow', 'z+', -0.1495, -0.07, 0.07, 1.1, 1.24, 'waterScreen', KD.screen);
  b.cyl('steel', 'y', 0, 0.96, -0.1, 0.018, 0.17, 10);
  b.cyl('steel', 'z', 0, 1.045, -0.04, 0.016, 0.13, 10);
  b.cyl('steel', 'y', 0, 1.0, 0.03, 0.02, 0.08, 10);
  b.box('stone', -0.26, 0.84, 0.17, 0.26, 0.875, 0.2);
}

function buildMonitor(b: Bags): void {
  b.box('steel', -0.66, 0, -0.14, 0.66, 0.04, 0.14);
  for (const x of [-0.56, 0.56]) b.box('steel', x - 0.025, 0.04, -0.025, x + 0.025, 2.2, 0.025);
  b.box('steel', -0.72, 1.5, -0.04, 0.72, 2.22, 0.04);
  b.face('decal', 'z+', 0.0405, -0.69, 0.69, 1.53, 2.19, 'dark');
  b.face('glow', 'z+', 0.0415, -0.635, 0.635, 1.585, 2.14, 'monitor', KD.screen);
  b.face('decal', 'z-', -0.0405, -0.69, 0.69, 1.53, 2.19, 'dark');
}

function buildGate(b: Bags): void {
  const hw = 0.5;
  for (const x of [-hw, hw]) b.box('steel', x - 0.025, 0, 0, x + 0.025, 2.2, 0.05);
  b.box('steel', -hw, 2.16, 0, hw, 2.2, 0.05);
  b.box('steel', -hw, 0, 0, hw, 0.04, 0.05);
  b.box('steel', -0.34, 0.98, 0.05, 0.34, 1.02, 0.08);
  for (const x of [-0.3, 0.3]) b.box('steel', x - 0.01, 0.98, 0.0, x + 0.01, 1.02, 0.05);
  b.face('decal', 'z+', 0.0505, -0.25, 0.25, 1.5, 1.75, 'staff');
  b.face('glow', 'z+', 0.0515, -0.07, 0.07, 2.1, 2.116, 'white', KD.green);
  b.box('steel', hw + 0.02, 0.9, 0.0, hw + 0.04, 1.1, 0.04);
}

function buildKiosk(b: Bags, rnd: () => number): void {
  const K = PLATFORM_KIT.kiosk, hx = K.len / 2, hz = K.depth / 2, top = K.height - 0.12;
  b.box('stone', -hx - 0.05, 0, -hz - 0.05, hx + 0.05, 0.08, hz + 0.05);
  b.box('oak', -hx + 0.04, 0.08, -hz + 0.04, hx - 0.04, 0.095, hz - 0.04);
  for (const x of [-hx + 0.04, -0.8, 0.8, hx - 0.04]) for (const z of [-hz + 0.04, hz - 0.04]) {
    if (Math.abs(x) === 0.8 && z < 0) continue;
    b.box('champ', x - 0.04, 0.08, z - 0.04, x + 0.04, top, z + 0.04);
  }
  // roof slab, oak soffit, warm cove and luminous ceiling
  b.box('champ', -hx - 0.15, top, -hz - 0.15, hx + 0.15, K.height, hz + 0.15);
  b.box('oak', -hx, top - 0.02, -hz, hx, top, hz);
  for (const s of [1, -1]) {
    b.flat('glow', -hx + 0.1, s * (hz - 0.1), hx - 0.1, s * (hz - 0.14), top - 0.022, 'white', false, KD.warm.toArray() as unknown as RGB);
    b.flat('glow', s * (hx - 0.1), -hz + 0.14, s * (hx - 0.14), hz - 0.14, top - 0.022, 'white', false, KD.warm.toArray() as unknown as RGB);
  }
  b.flat('glow', -1.1, -0.7, 1.1, 0.7, top - 0.024, 'white', false, [1.7, 1.45, 1.1]);
  // glass: sides, front flanks (the middle 1.6 m is the service hatch)
  const glass = (x0: number, z0: number, x1: number, z1: number): void => b.box('glass', Math.min(x0, x1) - 0.006, 0.1, Math.min(z0, z1) - 0.006, Math.max(x0, x1) + 0.006, top - 0.02, Math.max(z0, z1) + 0.006);
  glass(-hx + 0.04, -hz + 0.04, -hx + 0.04, hz - 0.04);
  glass(hx - 0.04, -hz + 0.04, hx - 0.04, hz - 0.04);
  glass(-hx + 0.04, hz - 0.04, -0.8, hz - 0.04);
  glass(0.8, hz - 0.04, hx - 0.04, hz - 0.04);
  // back wall: vertical oak slats with a stone back counter, machine, shelves
  for (let i = 0; i < 22; i++) {
    const x = -hx + 0.1 + ((K.len - 0.2) * i) / 21;
    b.box('oak', x - 0.05, 0.095, -hz + 0.04, x + 0.05, top - 0.02, -hz + 0.1);
  }
  b.box('oak', -hx + 0.1, 0.095, -hz + 0.1, hx - 0.1, 0.9, -0.7);
  b.box('stone', -hx + 0.08, 0.9, -hz + 0.1, hx - 0.08, 0.935, -0.66);
  b.box('steel', -0.6, 0.935, -hz + 0.2, 0.3, 1.45, -0.8);
  b.face('glow', 'z+', -0.799, -0.5, -0.1, 1.28, 1.4, 'white', [1.4, 1.5, 1.6]);
  b.box('steel', 0.5, 0.935, -hz + 0.25, 1.0, 1.2, -0.85);
  for (const y of [1.6, 1.95]) {
    b.box('oak', -hx + 0.2, y, -hz + 0.1, hx - 0.2, y + 0.03, -hz + 0.34);
    b.flat('glow', -hx + 0.3, -hz + 0.2, hx - 0.3, -hz + 0.23, y - 0.002, 'white', false, KD.warm.toArray() as unknown as RGB);
  }
  // service counter outside the hatch and the menu header
  b.box('oak', -0.82, 0.095, hz - 0.06, 0.82, 1.0, hz + 0.28);
  b.box('stone', -0.88, 1.0, hz - 0.1, 0.88, 1.04, hz + 0.34);
  b.box('champ', -0.84, 2.1, hz - 0.08, 0.84, top, hz + 0.02);
  b.face('glow', 'z+', hz + 0.0205, -0.78, 0.78, 2.19, 2.48, 'kioskBoard', KD.screen);
  void rnd;
}

function buildLounge(b: Bags, rnd: () => number): void {
  const L = PLATFORM_KIT.lounge, hx = L.len / 2, hz = L.depth / 2, H = L.height, dh = L.door / 2;
  b.box('stone', -hx - 0.05, 0, -hz - 0.05, hx + 0.05, 0.05, hz + 0.05);
  b.box('oak', -hx + 0.03, 0.05, -hz + 0.03, hx - 0.03, 0.07, hz - 0.03);
  // frameless glass: panes butt-jointed, stainless floor channel, patch fittings at the joints
  const pane = (x0: number, z0: number, x1: number, z1: number): void => {
    b.box('glass', Math.min(x0, x1) - 0.006, 0.09, Math.min(z0, z1) - 0.006, Math.max(x0, x1) + 0.006, H - 0.02, Math.max(z0, z1) + 0.006);
    b.box('steel', Math.min(x0, x1) - 0.025, 0.07, Math.min(z0, z1) - 0.025, Math.max(x0, x1) + 0.025, 0.09, Math.max(z0, z1) + 0.025);
  };
  pane(-hx, -hz, -0.01, -hz); pane(0.01, -hz, hx, -hz);
  pane(-hx, -hz, -hx, hz); pane(hx, -hz, hx, hz);
  pane(-hx, hz, -dh, hz); pane(dh, hz, hx, hz);
  for (const [x, z] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz], [0, -hz], [-dh, hz], [dh, hz]] as const) {
    for (const y of [0.3, H - 0.3]) b.box('steel', x - 0.035, y - 0.05, z - 0.035, x + 0.035, y + 0.05, z + 0.035);
  }
  for (const x of [-dh, dh]) b.box('steel', x - 0.02, 0.07, hz - 0.02, x + 0.02, H - 0.02, hz + 0.02);
  // roof: champagne slab, oak soffit, cove all round
  b.box('champ', -hx - 0.14, H - 0.02, -hz - 0.14, hx + 0.14, H + 0.1, hz + 0.14);
  b.box('oak', -hx, H - 0.04, -hz, hx, H - 0.02, hz);
  const warm = KD.warm.toArray() as unknown as RGB;
  for (const s of [1, -1]) {
    b.flat('glow', -hx + 0.08, s * (hz - 0.08), hx - 0.08, s * (hz - 0.12), H - 0.042, 'white', false, warm);
    b.flat('glow', s * (hx - 0.08), -hz + 0.12, s * (hx - 0.12), hz - 0.12, H - 0.042, 'white', false, warm);
  }
  // furniture: oak benches on stone plinths along the back and one end wall
  for (const f of KIT_LOUNGE_INTERIOR.slice(0, 2)) {
    const x0 = f.cx - f.hx, x1 = f.cx + f.hx, z0 = f.cz - f.hz, z1 = f.cz + f.hz;
    b.box('stone', x0 + 0.05, 0.07, z0 + 0.05, x1 - 0.05, 0.38, z1 - 0.05);
    for (let k = 0; k < 2; k++) {
      const horizontal = f.hx > f.hz;
      if (horizontal) b.box('oak', x0, 0.38, z0 + k * 0.25, x1, 0.43, z0 + k * 0.25 + 0.23);
      else b.box('oak', x0 + k * 0.25, 0.38, z0, x0 + k * 0.25 + 0.23, 0.43, z1);
    }
    if (f.hx > f.hz) b.box('oak', x0, 0.43, z0 - 0.0, x1, 0.85, z0 + 0.03);
    else b.box('oak', x0 - 0.0, 0.43, z0, x0 + 0.03, 0.85, z1);
  }
  // planted corner
  const P = KIT_LOUNGE_INTERIOR[2]!;
  b.box('stone', P.cx - 0.45, 0.07, P.cz - 0.45, P.cx + 0.45, 0.5, P.cz + 0.45);
  b.flat('decal', P.cx - 0.4, P.cz - 0.4, P.cx + 0.4, P.cz + 0.4, 0.502, 'soil');
  plantBed(b, rnd, P.cx, P.cz, 0.4, 0.4, 0.5, { treeFern: true });
}

// ---- strips, plaques -----------------------------------------------------------------------------------------------------

/** Tactile warning strips, fine light line and car / train-end plaques along both PSD lines of one platform (world space). */
function buildEdgeDecals(b: Bags, f: KitFrame): void {
  b.T.identity();
  const S = PLATFORM_KIT.strip, y = f.y, top = y + S.height;
  const nSeg = Math.round((2 * f.halfLen) / KD.tactileCellM);
  const vx = -f.u[1], vz = f.u[0];
  const warm = KD.warmSoft.toArray() as unknown as RGB;
  for (const e of [1, -1] as const) {
    // point at distance d off the PSD line, along-coordinate u, height yy
    const pt = (u: number, d: number, yy: number): [number, number, number] => { const [wx, wz] = kitWorld(f, u, e * (f.psdHalf - d)); return [wx, yy, wz]; };
    const dA = S.from, dB = S.from + S.width, L = f.halfLen;
    // the strip: one quad per 0.30 m so the domes cell repeats exactly (the atlas cell cannot wrap)
    for (let i = 0; i < nSeg; i++) {
      const u0 = -L + i * KD.tactileCellM, u1 = u0 + KD.tactileCellM;
      b.quad('decal', [pt(u0, dA, top), pt(u1, dA, top), pt(u1, dB, top), pt(u0, dB, top)], [0, 1, 0], 'tactile');
    }
    const toPsd: V3 = [e * vx, 0, e * vz], away: V3 = [-e * vx, 0, -e * vz];
    b.quad('decal', [pt(-L, dA, y), pt(L, dA, y), pt(L, dA, top), pt(-L, dA, top)], toPsd, 'plain');
    b.quad('decal', [pt(-L, dB, y), pt(L, dB, y), pt(L, dB, top), pt(-L, dB, top)], away, 'plain');
    b.quad('glow', [pt(-L, S.light, y + 0.004), pt(L, S.light, y + 0.004), pt(L, S.light + S.lightW, y + 0.004), pt(-L, S.light + S.lightW, y + 0.004)], [0, 1, 0], 'white', warm);
    // plaques: `up` is the direction the numeral's head points (toward the train), so a passenger facing the doors reads it
    const plaque = (u: number, up: readonly [number, number], cell: CellName): void => {
      const h = PLATFORM_KIT.plaque.size / 2;
      const [cx, cz] = kitWorld(f, u, e * (f.psdHalf - PLATFORM_KIT.plaque.d));
      const R: [number, number] = [-up[1], up[0]];
      const P = (a: number, c: number): [number, number, number] => [cx + R[0] * a + up[0] * c, y + 0.004, cz + R[1] * a + up[1] * c];
      b.quad('decal', [P(-h, -h), P(h, -h), P(h, h), P(-h, h)], [0, 1, 0], cell);
    };
    kitCarCentres().forEach((u, i) => plaque(u, [e * vx, e * vz], (['car1', 'car2', 'car3', 'car4'] as const)[i]!));
    for (const s of [1, -1]) plaque(s * 40.75, [s * f.u[0], s * f.u[1]], 'tick');
  }
}

// ---- assembly ------------------------------------------------------------------------------------------------------------

export interface PlatformKitBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  stats: { calls: number; triangles: number };
}

function normalise(g: THREE.BufferGeometry, bin: Bin): THREE.BufferGeometry {
  const x = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(bin === 'glow' && k === 'color')) x.deleteAttribute(k);
  if (!x.getAttribute('normal')) x.computeVertexNormals();
  const n = x.getAttribute('position').count;
  if (!x.getAttribute('uv')) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (bin === 'glow' && !x.getAttribute('color')) x.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return x;
}

export function buildPlatformKit(lib: MaterialLibrary, kit: MetroMaterials, renderer: THREE.WebGLRenderer): PlatformKitBuild {
  const group = new THREE.Group();
  group.name = 'metroPlatformKit';
  const b = new Bags();
  const rnd = rng(6032);

  for (const id of KIT_PLATFORMS) buildEdgeDecals(b, PLATFORM_KIT_FRAMES[id]);

  let planterCount = 0;
  for (const it of kitItems() as readonly KitItem[]) {
    const f = PLATFORM_KIT_FRAMES[it.platform];
    const [wx, wz] = kitWorld(f, it.u, it.v);
    b.T.makeRotationY(kitYaw(f, it.face)).setPosition(wx, f.y, wz);
    switch (it.kind) {
      case 'planter': buildPlanter(b, rnd, it.len ?? PLATFORM_KIT.planter.defaultLen, planterCount++ % 2 === 0); break;
      case 'perch': buildPerch(b); break;
      case 'help': buildHelp(b); break;
      case 'fire': buildFire(b); break;
      case 'mast': buildMast(b); break;
      case 'charger': buildCharger(b); break;
      case 'fountain': buildFountain(b); break;
      case 'kiosk': buildKiosk(b, rnd); break;
      case 'lounge': buildLounge(b, rnd); break;
      case 'monitor': buildMonitor(b); break;
      case 'gate': buildGate(b); break;
    }
  }

  const atlas = paintAtlas(renderer);
  const oakTex = makeOakTexture(renderer);
  const oak = new THREE.MeshStandardMaterial({ name: 'metroDeepKitOak', map: oakTex, color: 0xffffff, roughness: 0.6, metalness: 0, envMapIntensity: 0.75 });
  const decal = new THREE.MeshStandardMaterial({ name: 'metroDeepKitDecal', map: atlas, color: 0xffffff, roughness: 0.5, metalness: 0, envMapIntensity: 0.8 });
  const glow = new THREE.MeshBasicMaterial({ name: 'metroDeepKitGlow', map: atlas, vertexColors: true });
  const atlasFol = sharedFoliageAtlas(renderer);
  const folMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepKitFoliage', map: atlasFol, vertexColors: true, roughness: 0.62, metalness: 0, alphaTest: 0.42, side: THREE.DoubleSide,
  });
  patchForest(folMat, 'kitFoliage', { wind: true, foliage: true });

  const mats: Record<Bin, THREE.Material> = {
    stone: kit.deep.honedLimestone, oak, steel: kit.deep.stainless, champ: kit.deep.champagne, glass: kit.deep.glass, glow, decal,
  };
  const tiles: Partial<Record<Bin, number>> = { stone: kit.metersPerTile.honedLimestone, steel: kit.metersPerTile.stainless };
  let tris = 0;
  for (const bin of Object.keys(b.bins) as Bin[]) {
    const parts = b.bins[bin].map((g) => {
      let x = normalise(g, bin);
      const tile = tiles[bin];
      if (tile) x = lib.applyWorldUVs(x, tile);
      return x;
    });
    if (parts.length === 0) continue;
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mats[bin]);
    mesh.name = `platformKit_${bin}`;
    if (bin === 'glass') { mesh.renderOrder = (kit.deep.glass.userData.renderOrder as number | undefined) ?? 2; mesh.userData.noShadow = true; }
    if (bin === 'glow') mesh.userData.noShadow = true;
    group.add(mesh);
    tris += merged.getAttribute('position').count / 3;
  }
  const folGeo = b.fol.build(true, true);
  const fol = new THREE.Mesh(folGeo, folMat);
  fol.name = 'platformKit_foliage';
  fol.castShadow = true; fol.receiveShadow = true;
  group.add(fol);
  tris += (folGeo.index?.count ?? 0) / 3;

  return { group, deepMaterials: [oak, decal, glow, folMat], stats: { calls: group.children.length, triangles: tris } };
}

