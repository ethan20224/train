import * as THREE from 'three';
import { rng } from '../concourse/geo';
import type { RugCell } from './layoutData';

/** Canvas-generated textures for the hotel: lettering/poster atlas, rug atlas, runner, leather grain, palm frond. */

const SERIF = '"Didot", "Bodoni 72", "Bodoni MT", "Georgia", "Times New Roman", serif';

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  return [c, g];
}

function finish(c: HTMLCanvasElement, renderer: THREE.WebGLRenderer, opts: { repeat?: boolean; srgb?: boolean } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const rectUV = (W: number, H: number, x: number, y: number, w: number, h: number): UVRect => ({
  u0: x / W,
  u1: (x + w) / W,
  v0: 1 - (y + h) / H,
  v1: 1 - y / H,
});

// ---------------------------------------------------------------------------------------------
// gilt lettering
// ---------------------------------------------------------------------------------------------
function gilt(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, spacingEm = 0.14): void {
  g.save();
  g.font = `600 ${size}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  (g as unknown as { letterSpacing: string }).letterSpacing = `${size * spacingEm}px`;
  const grad = g.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
  grad.addColorStop(0, '#fff0b8');
  grad.addColorStop(0.45, '#d9aa45');
  grad.addColorStop(0.55, '#a87a24');
  grad.addColorStop(1, '#e8c66a');
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.fillText(text, cx + size * 0.025, cy + size * 0.035);
  g.fillStyle = grad;
  g.fillText(text, cx, cy);
  g.restore();
}

function plate(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, edge = '#c9983e'): void {
  const grad = g.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, bg);
  grad.addColorStop(0.5, '#15110f');
  grad.addColorStop(1, bg);
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  g.strokeStyle = edge;
  g.lineWidth = Math.max(3, h * 0.025);
  g.strokeRect(x + h * 0.07, y + h * 0.07, w - h * 0.14, h - h * 0.14);
  g.lineWidth = Math.max(1.5, h * 0.01);
  g.strokeRect(x + h * 0.12, y + h * 0.12, w - h * 0.24, h - h * 0.24);
}

function deco(g: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  g.save();
  g.fillStyle = '#d9aa45';
  g.translate(cx, cy);
  g.beginPath();
  g.moveTo(0, -s);
  g.lineTo(s * 0.5, 0);
  g.lineTo(0, s);
  g.lineTo(-s * 0.5, 0);
  g.closePath();
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// posters
// ---------------------------------------------------------------------------------------------
const POSTERS: Array<{ title: string; sub: string; sky: [string, string]; ground: string; fig: string; sun: string }> = [
  { title: 'HOLLOW BAY', sub: 'THE SEASIDE LIMITED', sky: ['#f3c58a', '#b8472c'], ground: '#1f2c3b', fig: '#12161c', sun: '#ffe9b0' },
  { title: 'VESPER FALLS', sub: 'EVERY EVENING AT SEVEN', sky: ['#a9c4d4', '#2f5368'], ground: '#142029', fig: '#0c1319', sun: '#f4e7c4' },
  { title: 'THE LAST SUMMER', sub: 'ONE WAY ONLY', sky: ['#f7d98a', '#d8742e'], ground: '#40281a', fig: '#1c120b', sun: '#fff3c8' },
  { title: 'ELSEWHERE', sub: 'FIRST CLASS SLEEPERS', sky: ['#cdb2d6', '#5a3a73'], ground: '#1d1730', fig: '#0e0a18', sun: '#f9e6ff' },
  { title: 'ASHGROVE', sub: 'THE MORNING EXPRESS', sky: ['#e2c9a3', '#7b5a3a'], ground: '#2a2218', fig: '#120e09', sun: '#fff0cf' },
  { title: 'HALCYON', sub: 'GRAND MERIDIAN LIMITED', sky: ['#9fd3c7', '#2b7a74'], ground: '#10302f', fig: '#09191a', sun: '#f2fbd6' },
  { title: 'NOWHERE JUNCTION', sub: 'CHANGE HERE FOR EVERYWHERE', sky: ['#e8a0a0', '#8a2e3f'], ground: '#2a1118', fig: '#12070b', sun: '#ffe2c9' },
  { title: 'MERIDIAN', sub: 'THE HOUR BETWEEN', sky: ['#f0cf86', '#a8742a'], ground: '#1b1409', fig: '#0e0a04', sun: '#fff7d6' },
];

function drawPoster(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, i: number): void {
  const p = POSTERS[i % POSTERS.length]!;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const sky = g.createLinearGradient(x, y, x, y + h * 0.7);
  sky.addColorStop(0, p.sky[0]);
  sky.addColorStop(1, p.sky[1]);
  g.fillStyle = sky;
  g.fillRect(x, y, w, h);
  // deco sunburst
  const sx = x + w / 2;
  const sy = y + h * 0.5;
  g.fillStyle = p.sun;
  g.globalAlpha = 0.22;
  for (let k = 0; k < 14; k++) {
    const a0 = (k / 14) * Math.PI - Math.PI;
    g.beginPath();
    g.moveTo(sx, sy);
    g.arc(sx, sy, w * 1.1, a0, a0 + Math.PI / 28);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  g.beginPath();
  g.arc(sx, sy, w * 0.17, 0, Math.PI * 2);
  g.fill();
  // stepped skyline / mountains
  g.fillStyle = p.ground;
  g.beginPath();
  g.moveTo(x, y + h * 0.78);
  const steps = 9;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const hh = 0.12 + 0.1 * Math.abs(Math.sin(k * 1.9 + i)) + (k % 3 === 0 ? 0.05 : 0);
    g.lineTo(x + t * w, y + h * (0.7 - hh));
    g.lineTo(x + Math.min(1, t + 1 / steps) * w, y + h * (0.7 - hh));
  }
  g.lineTo(x + w, y + h * 0.78);
  g.lineTo(x + w, y + h);
  g.lineTo(x, y + h);
  g.closePath();
  g.fill();
  // streamliner silhouette, speed lines
  g.fillStyle = p.fig;
  const ty = y + h * 0.8;
  g.fillRect(x + w * 0.1, ty, w * 0.72, h * 0.055);
  g.beginPath();
  g.moveTo(x + w * 0.82, ty);
  g.quadraticCurveTo(x + w * 0.96, ty + h * 0.01, x + w * 0.98, ty + h * 0.055);
  g.lineTo(x + w * 0.82, ty + h * 0.055);
  g.fill();
  g.strokeStyle = p.sun;
  g.lineWidth = Math.max(1.5, h * 0.004);
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    g.moveTo(x + w * 0.02, ty + h * (0.012 + k * 0.012));
    g.lineTo(x + w * (0.09 + k * 0.01), ty + h * (0.012 + k * 0.012));
    g.stroke();
  }
  // lettering
  g.fillStyle = '#10100f';
  g.fillRect(x, y + h * 0.9, w, h * 0.1);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f2dc9c';
  const fs = Math.min(h * 0.052, (w * 0.9) / (p.title.length * 0.78));
  g.font = `600 ${fs}px ${SERIF}`;
  g.fillText(p.title, x + w / 2, y + h * 0.935);
  g.font = `500 ${h * 0.018}px ${SERIF}`;
  g.fillStyle = '#d9c183';
  g.fillText(p.sub, x + w / 2, y + h * 0.975);
  // top banner
  g.fillStyle = '#10100f';
  g.fillRect(x, y, w, h * 0.07);
  g.fillStyle = '#d9aa45';
  g.font = `600 ${h * 0.03}px ${SERIF}`;
  g.fillText('GRAND MERIDIAN', x + w / 2, y + h * 0.037);
  g.restore();
  g.strokeStyle = '#d9aa45';
  g.lineWidth = Math.max(2, w * 0.012);
  g.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

// ---------------------------------------------------------------------------------------------
// atlas: signs, clock face, ticket, newspaper, ledger page, posters
// ---------------------------------------------------------------------------------------------
export interface PaperAtlas {
  texture: THREE.CanvasTexture;
  cell: Record<string, UVRect>;
  posterCount: number;
}

export function makePaperAtlas(renderer: THREE.WebGLRenderer): PaperAtlas {
  const W = 2048;
  const H = 2048;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#e9dcc0';
  g.fillRect(0, 0, W, H);
  const cell: Record<string, UVRect> = {};
  const put = (name: string, x: number, y: number, w: number, h: number): void => void (cell[name] = rectUV(W, H, x, y, w, h));

  // --- signs -------------------------------------------------------------------------------
  put('tickets', 0, 0, 1024, 256);
  plate(g, 0, 0, 1024, 256, '#0f1d17');
  gilt(g, 'TICKETS', 512, 132, 118, 0.2);
  put('lounge', 1024, 0, 1024, 256);
  {
    const grad = g.createLinearGradient(1024, 0, 2048, 256);
    grad.addColorStop(0, '#d8b256');
    grad.addColorStop(0.5, '#a97a2a');
    grad.addColorStop(1, '#dcb85d');
    g.fillStyle = grad;
    g.fillRect(1024, 0, 1024, 256);
    g.strokeStyle = '#3b2a0c';
    g.lineWidth = 5;
    g.strokeRect(1042, 18, 988, 220);
    g.fillStyle = '#23190a';
    g.font = `600 70px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    (g as unknown as { letterSpacing: string }).letterSpacing = '8px';
    g.fillText('FIRST CLASS', 1536, 95);
    g.font = `500 52px ${SERIF}`;
    g.fillText('LOUNGE', 1536, 180);
    (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
  }
  put('booking', 0, 256, 2048, 256);
  plate(g, 0, 256, 2048, 256, '#0f1d17');
  gilt(g, 'BOOKING OFFICE', 1024, 392, 134, 0.24);
  deco(g, 150, 384, 46);
  deco(g, 1898, 384, 46);
  put('concierge', 0, 512, 1536, 256);
  plate(g, 0, 512, 1536, 256, '#2a0f12');
  gilt(g, 'CONCIERGE', 768, 648, 134, 0.26);
  deco(g, 120, 640, 42);
  deco(g, 1416, 640, 42);
  // clock face (6:47)
  put('clock', 1536, 512, 256, 256);
  {
    const cx = 1664;
    const cy = 640;
    g.fillStyle = '#f2e8cf';
    g.beginPath();
    g.arc(cx, cy, 120, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1a1510';
    g.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.sin(a) * 100, cy - Math.cos(a) * 100);
      g.lineTo(cx + Math.sin(a) * 114, cy - Math.cos(a) * 114);
      g.stroke();
    }
    const hand = (ang: number, len: number, wd: number): void => {
      g.lineWidth = wd;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);
      g.stroke();
    };
    hand(((6 + 47 / 60) / 12) * Math.PI * 2, 62, 8);
    hand((47 / 60) * Math.PI * 2, 96, 5);
  }
  // ticket (a printed Deco card)
  put('ticket', 1792, 512, 256, 256);
  {
    g.fillStyle = '#f1e4c2';
    g.fillRect(1792, 512, 256, 256);
    g.strokeStyle = '#8a1d24';
    g.lineWidth = 8;
    g.strokeRect(1800, 520, 240, 240);
    g.fillStyle = '#8a1d24';
    g.fillRect(1800, 520, 240, 56);
    g.fillStyle = '#f1e4c2';
    g.font = `700 30px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('FIRST CLASS', 1920, 548);
    g.fillStyle = '#1a1510';
    g.font = `600 24px ${SERIF}`;
    g.fillText('GRAND MERIDIAN', 1920, 616);
    g.fillText('LIMITED', 1920, 646);
    g.fillRect(1818, 672, 204, 3);
    g.fillRect(1818, 700, 204, 3);
    g.fillRect(1818, 728, 140, 3);
  }
  // newspaper
  put('news', 0, 768, 512, 384);
  {
    g.fillStyle = '#d9d0b6';
    g.fillRect(0, 768, 512, 384);
    g.fillStyle = '#16120d';
    g.font = `700 54px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('THE MERIDIAN TIMES', 256, 812);
    g.fillRect(14, 846, 484, 4);
    const R = rng(7);
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 22; row++) {
        g.fillStyle = `rgba(22,18,13,${0.45 + R() * 0.3})`;
        g.fillRect(18 + col * 162, 862 + row * 13, 130 - R() * 40, 4);
      }
    }
    g.fillStyle = '#9d9684';
    g.fillRect(24, 870, 140, 70);
  }
  // ledger page
  put('ledger', 512, 768, 512, 384);
  {
    g.fillStyle = '#efe4c8';
    g.fillRect(512, 768, 512, 384);
    g.strokeStyle = 'rgba(80,60,40,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 17; i++) {
      g.beginPath();
      g.moveTo(520, 800 + i * 20);
      g.lineTo(1016, 800 + i * 20);
      g.stroke();
    }
    g.strokeStyle = 'rgba(150,40,40,0.55)';
    for (const x of [600, 760, 900]) {
      g.beginPath();
      g.moveTo(x, 780);
      g.lineTo(x, 1140);
      g.stroke();
    }
    const R = rng(11);
    g.strokeStyle = 'rgba(25,30,70,0.8)';
    g.lineWidth = 2.2;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      let x = 610 + R() * 8;
      const y = 794 + i * 20;
      g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        x += 6 + R() * 6;
        g.lineTo(x, y + (R() - 0.5) * 8);
        if (x > 750) break;
      }
      g.stroke();
    }
  }
  // posters
  const PW = 256;
  const PH = 366;
  const py = 1152;
  for (let i = 0; i < POSTERS.length; i++) {
    put(`poster${i}`, i * PW, py, PW, PH);
    drawPoster(g, i * PW, py, PW, PH, i);
  }
  // a plain parchment strip for backs/edges
  put('paper', 1024, 768, 256, 128);
  g.fillStyle = '#e4d6b6';
  g.fillRect(1024, 768, 256, 128);
  return { texture: finish(c, renderer), cell, posterCount: POSTERS.length };
}

// ---------------------------------------------------------------------------------------------
// rugs
// ---------------------------------------------------------------------------------------------
interface RugPalette {
  field: string;
  field2: string;
  medal: string;
  medal2: string;
  border: string;
  border2: string;
  gold: string;
  ivory: string;
}

const PALETTES: Record<RugCell, RugPalette> = {
  big: { field: '#6c1c24', field2: '#85282f', medal: '#1d2b5e', medal2: '#c4a053', border: '#1d2b5e', border2: '#6c1c24', gold: '#c4a053', ivory: '#dccdac' },
  oxblood: { field: '#651b22', field2: '#7f262d', medal: '#c4a053', medal2: '#1d2b5e', border: '#1d2b5e', border2: '#651b22', gold: '#c4a053', ivory: '#dccdac' },
  indigo: { field: '#1f3070', field2: '#2c428a', medal: '#6c1c24', medal2: '#c4a053', border: '#651b22', border2: '#1f3070', gold: '#c4a053', ivory: '#dccdac' },
  forest: { field: '#1c4a34', field2: '#265f44', medal: '#6c1c24', medal2: '#c4a053', border: '#651b22', border2: '#1c4a34', gold: '#c4a053', ivory: '#dccdac' },
};

function drawRugPortrait(g: CanvasRenderingContext2D, pw: number, ph: number, pal: RugPalette, seed: number, fringe: boolean): void {
  const R = rng(seed);
  const f = fringe ? pw * 0.05 : 0;
  const bx = 0;
  const by = f;
  const bw = pw;
  const bh = ph - 2 * f;
  const inset = (n: number): [number, number, number, number] => [bx + n, by + n, bw - 2 * n, bh - 2 * n];
  const fillBand = (col: string, n0: number, n1: number): void => {
    g.fillStyle = col;
    const [x0, y0, w0, h0] = inset(n0);
    g.fillRect(x0, y0, w0, h0);
    const [x1, y1, w1, h1] = inset(n1);
    void [x1, y1, w1, h1];
  };
  void fillBand;
  const U = pw / 100;
  // selvedge + borders (painted as nested rects, each overpainting the previous)
  const rect = (n: number, col: string): void => {
    g.fillStyle = col;
    const [x, y, w, h] = inset(n * U);
    g.fillRect(x, y, w, h);
  };
  rect(0, pal.ivory);
  rect(0.8, pal.gold);
  rect(1.6, pal.border);
  rect(14.6, pal.gold);
  rect(15.2, pal.border2);
  rect(17.2, pal.gold);
  rect(17.7, pal.field);
  // border ornaments: rosette chain between 1.6U and 14.6U
  const mid = 8.1 * U;
  const drawRosette = (x: number, y: number, r: number, col: string, col2: string): void => {
    g.fillStyle = col;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.34, r * 0.1, a, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = col2;
    g.lineWidth = Math.max(1, r * 0.08);
    g.beginPath();
    g.arc(x, y, r * 0.42, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = col2;
    g.beginPath();
    g.arc(x, y, r * 0.3, 0, Math.PI * 2);
    g.fill();
  };
  const pitch = 10 * U;
  const nH = Math.round(bh / pitch);
  for (let i = 0; i < nH; i++) {
    const y = by + (bh * (i + 0.5)) / nH;
    drawRosette(bx + mid, y, 3.8 * U, pal.gold, pal.ivory);
    drawRosette(bx + bw - mid, y, 3.8 * U, pal.gold, pal.ivory);
  }
  const nW = Math.round(bw / pitch);
  for (let i = 0; i < nW; i++) {
    const x = bx + (bw * (i + 0.5)) / nW;
    drawRosette(x, by + mid, 3.8 * U, pal.gold, pal.ivory);
    drawRosette(x, by + bh - mid, 3.8 * U, pal.gold, pal.ivory);
  }
  // small vine between rosettes
  g.strokeStyle = pal.ivory;
  g.lineWidth = Math.max(1, U * 0.5);
  for (let i = 0; i < nH; i++) {
    const y0 = by + (bh * (i + 0.5)) / nH;
    for (const x of [bx + mid, bx + bw - mid]) {
      g.beginPath();
      g.moveTo(x, y0 + 4.6 * U);
      g.quadraticCurveTo(x + 2 * U, y0 + pitch / 2 - 1 * U, x, y0 + pitch - 4.6 * U);
      g.stroke();
    }
  }
  // field: lattice of lozenges
  const [fx, fy, fw, fh] = inset(17.7 * U);
  g.save();
  g.beginPath();
  g.rect(fx, fy, fw, fh);
  g.clip();
  g.strokeStyle = pal.field2;
  g.lineWidth = U * 1.1;
  const step = 11 * U;
  for (let k = -Math.ceil(fh / step); k < Math.ceil(fw / step) + Math.ceil(fh / step) + 2; k++) {
    g.beginPath();
    g.moveTo(fx + k * step, fy);
    g.lineTo(fx + k * step + fh, fy + fh);
    g.moveTo(fx + k * step + fh, fy);
    g.lineTo(fx + k * step, fy + fh);
    g.stroke();
  }
  g.fillStyle = pal.field2;
  // small boteh / bud motifs scattered on a loose grid
  for (let gy = fy + 5 * U; gy < fy + fh; gy += 11 * U) {
    for (let gx = fx + 5 * U; gx < fx + fw; gx += 11 * U) {
      g.fillStyle = pal.field2;
      g.beginPath();
      g.ellipse(gx, gy, 2.2 * U, 3.2 * U, 0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pal.gold;
      g.globalAlpha = 0.55;
      g.beginPath();
      g.arc(gx, gy, 0.9 * U, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  }
  g.fillStyle = pal.field2;
  for (let i = 0; i < 90; i++) {
    const x = fx + R() * fw;
    const y = fy + R() * fh;
    g.beginPath();
    g.ellipse(x, y, U * (0.8 + R()), U * (0.5 + R() * 0.7), R() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // medallion
  const cx = fx + fw / 2;
  const cy = fy + fh / 2;
  const mw = fw * 0.78;
  const mh = Math.min(fh * 0.62, mw * 1.5);
  const oct = (w: number, h: number, col: string): void => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, cy - h / 2);
    g.quadraticCurveTo(cx + w * 0.2, cy - h * 0.32, cx + w / 2, cy - h * 0.18);
    g.quadraticCurveTo(cx + w * 0.3, cy, cx + w / 2, cy + h * 0.18);
    g.quadraticCurveTo(cx + w * 0.2, cy + h * 0.32, cx, cy + h / 2);
    g.quadraticCurveTo(cx - w * 0.2, cy + h * 0.32, cx - w / 2, cy + h * 0.18);
    g.quadraticCurveTo(cx - w * 0.3, cy, cx - w / 2, cy - h * 0.18);
    g.quadraticCurveTo(cx - w * 0.2, cy - h * 0.32, cx, cy - h / 2);
    g.closePath();
    g.fill();
  };
  oct(mw * 1.06, mh * 1.06, pal.gold);
  oct(mw, mh, pal.medal);
  oct(mw * 0.8, mh * 0.8, pal.medal2);
  oct(mw * 0.74, mh * 0.74, pal.medal);
  // radiating petals + bead rings inside the medallion
  g.fillStyle = pal.gold;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * mw * 0.27, cy + Math.sin(a) * mh * 0.27, mw * 0.07, mh * 0.025, a, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = pal.ivory;
  g.lineWidth = Math.max(1, U * 0.7);
  for (const k of [0.42, 0.55, 0.66]) {
    g.setLineDash([U * 1.2, U * 1.6]);
    g.beginPath();
    g.ellipse(cx, cy, mw * k * 0.5, mh * k * 0.5, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.setLineDash([]);
  drawRosette(cx, cy, Math.min(mw, mh) * 0.3, pal.gold, pal.ivory);
  drawRosette(cx, cy, Math.min(mw, mh) * 0.15, pal.ivory, pal.field);
  for (const s of [-1, 1]) {
    // pendants
    g.fillStyle = pal.gold;
    g.beginPath();
    g.moveTo(cx, cy + s * (mh / 2 + 0.5 * U));
    g.lineTo(cx + 4.5 * U, cy + s * (mh / 2 + 6 * U));
    g.lineTo(cx, cy + s * (mh / 2 + 12 * U));
    g.lineTo(cx - 4.5 * U, cy + s * (mh / 2 + 6 * U));
    g.closePath();
    g.fill();
  }
  // corner spandrels
  g.fillStyle = pal.medal;
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    g.beginPath();
    g.arc(fx + sx * fw, fy + sy * fh, Math.min(fw, fh) * 0.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = pal.gold;
    g.lineWidth = U * 0.9;
    g.beginPath();
    g.arc(fx + sx * fw, fy + sy * fh, Math.min(fw, fh) * 0.3 + U * 1.4, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  // wool speckle (keeps alpha)
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < pw * ph * 0.012; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,235,200,0.07)';
    g.fillRect(R() * pw, R() * ph, 1.6, 1.6);
  }
  g.restore();
  // antique ageing: warm wash + soft wear patches (keeps alpha), so the rug sits in the room instead of glowing
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(62,38,18,0.16)';
  g.fillRect(0, 0, pw, ph);
  for (let i = 0; i < 26; i++) {
    const x = R() * pw;
    const y = R() * ph;
    const r = pw * (0.08 + R() * 0.18);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, R() < 0.5 ? 'rgba(20,10,5,0.12)' : 'rgba(255,230,190,0.07)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();
  // fringe on both short ends
  if (fringe) {
    g.strokeStyle = pal.ivory;
    g.lineWidth = Math.max(2, pw * 0.006);
    const n = Math.round(pw / (pw * 0.012));
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * pw;
      const j = (R() - 0.5) * f * 0.2;
      g.beginPath();
      g.moveTo(x, f + 1);
      g.lineTo(x + j, 0);
      g.moveTo(x, ph - f - 1);
      g.lineTo(x + j, ph);
      g.stroke();
    }
  }
}

export interface RugAtlas {
  texture: THREE.CanvasTexture;
  cell: Record<RugCell, UVRect>;
}

export function makeRugAtlas(renderer: THREE.WebGLRenderer): RugAtlas {
  const W = 2048;
  const H = 2048;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const cell = {} as Record<RugCell, UVRect>;
  // landscape big rug
  {
    const w = 2048;
    const h = 1100;
    g.save();
    g.translate(0, h); // portrait box (pw=h, ph=w): local x -> canvas -y, local y -> canvas +x
    g.rotate(-Math.PI / 2);
    drawRugPortrait(g, h, w, PALETTES.big, 3, true);
    g.restore();
    cell.big = rectUV(W, H, 0, 0, w, h);
  }
  const small: RugCell[] = ['oxblood', 'indigo', 'forest'];
  small.forEach((name, i) => {
    const x = i * 684;
    const y = 1108;
    const w = 680;
    const h = 936;
    g.save();
    g.translate(x, y);
    drawRugPortrait(g, w, h, PALETTES[name], 20 + i, true);
    g.restore();
    cell[name] = rectUV(W, H, x, y, w, h);
  });
  return { texture: finish(c, renderer), cell };
}

/** Tileable carpet runner: 512 px = 3 m wide, 1024 px = 6 m long (repeat along v). */
export function makeRunnerTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const [c, g] = canvas(512, 1024);
  const pal = PALETTES.oxblood;
  const R = rng(5);
  g.fillStyle = pal.field;
  g.fillRect(0, 0, 512, 1024);
  const U = 512 / 100;
  const band = (x0: number, x1: number, col: string): void => {
    g.fillStyle = col;
    g.fillRect(x0 * U, 0, (x1 - x0) * U, 1024);
    g.fillRect((100 - x1) * U, 0, (x1 - x0) * U, 1024);
  };
  band(0, 100, pal.gold); // selvedge base (overpainted)
  band(1.2, 100, pal.border);
  band(13, 100, pal.gold);
  band(13.6, 100, pal.border2);
  band(15.4, 100, pal.gold);
  band(15.9, 100, pal.field);
  // rosette chain on the main border
  const rosette = (x: number, y: number, r: number): void => {
    g.fillStyle = pal.gold;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.42, r * 0.2, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = pal.ivory;
    g.beginPath();
    g.arc(x, y, r * 0.3, 0, Math.PI * 2);
    g.fill();
  };
  for (let i = 0; i < 20; i++) {
    const y = (i + 0.5) * (1024 / 20);
    rosette(7.2 * U, y, 3.6 * U);
    rosette(92.8 * U, y, 3.6 * U);
  }
  // field lattice
  g.save();
  g.beginPath();
  g.rect(15.9 * U, 0, 68.2 * U, 1024);
  g.clip();
  g.strokeStyle = pal.field2;
  g.lineWidth = U * 1.1;
  const step = 14 * U;
  for (let k = -80; k < 80; k++) {
    g.beginPath();
    g.moveTo(15.9 * U + k * step, 0);
    g.lineTo(15.9 * U + k * step + 1024, 1024);
    g.moveTo(15.9 * U + k * step + 1024, 0);
    g.lineTo(15.9 * U + k * step, 1024);
    g.stroke();
  }
  // two medallions per period + diamonds between
  const medallion = (cy: number): void => {
    for (const [rx, ry, col] of [[28, 56, pal.gold], [25.5, 52, pal.medal], [20, 41, pal.medal2], [18.5, 38, pal.medal]] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(256, cy, rx * U, ry * U, 0, 0, Math.PI * 2);
      g.fill();
    }
    rosette(256, cy, 11 * U);
  };
  medallion(256);
  medallion(768);
  g.fillStyle = pal.gold;
  for (const cy of [0, 512, 1024]) {
    g.beginPath();
    g.moveTo(256, cy - 34);
    g.lineTo(256 + 20, cy);
    g.lineTo(256, cy + 34);
    g.lineTo(256 - 20, cy);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,235,200,0.07)';
    g.fillRect(R() * 512, R() * 1024, 1.6, 1.6);
  }
  return finish(c, renderer, { repeat: true });
}

// ---------------------------------------------------------------------------------------------
// leather grain (grayscale, tileable) - used as colour modulation and bump
// ---------------------------------------------------------------------------------------------
export function makeLeatherTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#b8b8b8';
  g.fillRect(0, 0, S, S);
  const R = rng(42);
  const wrap = (fn: (ox: number, oy: number) => void): void => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
  };
  // soft mottling
  for (let i = 0; i < 160; i++) {
    const x = R() * S;
    const y = R() * S;
    const r = 20 + R() * 50;
    const v = R() < 0.5 ? 0 : 255;
    wrap((ox, oy) => {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.05)`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  // fine crease network
  g.lineCap = 'round';
  for (let i = 0; i < 1500; i++) {
    const x = R() * S;
    const y = R() * S;
    const a = R() * Math.PI * 2;
    const l = 10 + R() * 26;
    g.lineWidth = 0.8 + R() * 0.9;
    g.strokeStyle = `rgba(40,40,40,${0.1 + R() * 0.14})`;
    wrap((ox, oy) => {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + Math.cos(a + 0.6) * l * 0.5, y + oy + Math.sin(a + 0.6) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    });
  }
  g.globalAlpha = 0.5;
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = R() < 0.6 ? '#707070' : '#d8d8d8';
    g.fillRect(R() * S, R() * S, 1.4, 1.4);
  }
  g.globalAlpha = 1;
  return finish(c, renderer, { repeat: true, srgb: true });
}

// ---------------------------------------------------------------------------------------------
// booth interior glow map (warm plaster lit from a desk lamp): bright centre, dark corners
// ---------------------------------------------------------------------------------------------
export function makeBoothTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const gr = g.createRadialGradient(128, 118, 8, 128, 128, 190);
  gr.addColorStop(0, '#ffe2b0');
  gr.addColorStop(0.3, '#c58d4a');
  gr.addColorStop(0.7, '#5a3519');
  gr.addColorStop(1, '#1f1209');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const R = rng(9);
  g.globalAlpha = 0.07;
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = R() < 0.5 ? '#000' : '#fff';
    g.fillRect(R() * 256, R() * 256, 2, 2);
  }
  return finish(c, renderer);
}

// ---------------------------------------------------------------------------------------------
// kentia palm frond (alpha-tested card): a pinnate leaf, rachis up the middle, drooping leaflets
// ---------------------------------------------------------------------------------------------
export function makeFrondTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const W = 256;
  const H = 1024;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const R = rng(77);
  const cx = W / 2;
  // rachis
  g.strokeStyle = '#3f5a24';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(cx, H);
  g.lineTo(cx, 8);
  g.stroke();
  const n = 46;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = H - 30 - t * (H - 52);
    const len = (W / 2 - 4) * (0.42 + 0.58 * Math.sin(Math.min(1, t * 1.15 + 0.1) * Math.PI * 0.62)) * (t > 0.9 ? 1 - (t - 0.9) * 6 : 1);
    for (const s of [-1, 1]) {
      const droop = 0.26 + R() * 0.18;
      const ang = -0.82 - R() * 0.1; // up-and-out from the rachis, toward the tip
      const x1 = cx + s * Math.cos(ang) * len * 0.5;
      const y1 = y + Math.sin(ang) * len * 0.5;
      const x2 = cx + s * len;
      const y2 = y + Math.sin(ang) * len * 0.5 + len * droop;
      const wd = 9 + R() * 3;
      const gr = g.createLinearGradient(cx, y, x2, y2);
      gr.addColorStop(0, '#355c26');
      gr.addColorStop(0.6, R() < 0.5 ? '#4c7a31' : '#41702c');
      gr.addColorStop(1, '#6f9a45');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(cx, y);
      g.quadraticCurveTo(x1, y1 - wd * 0.6, x2, y2);
      g.quadraticCurveTo(x1 + s * 2, y1 + wd * 0.9, cx, y + 5);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(20,45,15,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx, y + 1);
      g.quadraticCurveTo(x1, y1, x2, y2);
      g.stroke();
    }
  }
  return finish(c, renderer);
}

// ---------------------------------------------------------------------------------------------
// first-class lounge: damask wall silk, broadloom carpet, etched door glass
// ---------------------------------------------------------------------------------------------

/** Champagne damask wall silk, tileable (512 px = 1.2 m). Tonal ogee lattice with a fleur at each node over a satin stripe. */
export function makeDamaskTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#e1d3b2';
  g.fillRect(0, 0, S, S);
  // satin stripe
  for (let x = 0; x < S; x += 8) {
    g.fillStyle = (x / 8) % 2 === 0 ? 'rgba(255,248,225,0.10)' : 'rgba(120,90,40,0.05)';
    g.fillRect(x, 0, 4, S);
  }
  const wrap = (fn: (ox: number, oy: number) => void): void => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
  };
  const fleur = (cx: number, cy: number, s: number, flip: number): void => {
    wrap((ox, oy) => {
      g.save();
      g.translate(cx + ox, cy + oy);
      g.scale(1, flip);
      g.fillStyle = 'rgba(112,82,36,0.30)';
      // central teardrop
      g.beginPath();
      g.moveTo(0, -s);
      g.bezierCurveTo(s * 0.5, -s * 0.5, s * 0.46, s * 0.3, 0, s * 0.62);
      g.bezierCurveTo(-s * 0.46, s * 0.3, -s * 0.5, -s * 0.5, 0, -s);
      g.fill();
      // side scrolls
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, s * 0.45);
        g.bezierCurveTo(sx * s * 0.9, s * 0.5, sx * s * 1.0, -s * 0.2, sx * s * 0.62, -s * 0.34);
        g.bezierCurveTo(sx * s * 0.82, -s * 0.05, sx * s * 0.5, s * 0.2, 0, s * 0.3);
        g.fill();
      }
      g.fillStyle = 'rgba(255,246,218,0.34)';
      g.beginPath();
      g.moveTo(0, -s * 0.78);
      g.bezierCurveTo(s * 0.26, -s * 0.42, s * 0.24, s * 0.1, 0, s * 0.3);
      g.bezierCurveTo(-s * 0.24, s * 0.1, -s * 0.26, -s * 0.42, 0, -s * 0.78);
      g.fill();
      g.restore();
    });
  };
  fleur(S * 0.25, S * 0.25, 78, 1);
  fleur(S * 0.75, S * 0.75, 78, 1);
  fleur(S * 0.75, S * 0.25, 52, -1);
  fleur(S * 0.25, S * 0.75, 52, -1);
  // ogee lattice
  g.strokeStyle = 'rgba(112,82,36,0.20)';
  g.lineWidth = 3;
  wrap((ox, oy) => {
    g.beginPath();
    g.moveTo(S * 0.5 + ox, oy);
    g.bezierCurveTo(S * 0.5 + ox + 90, S * 0.25 + oy, S * 0.5 + ox - 90, S * 0.25 + oy, S * 0.5 + ox, S * 0.5 + oy);
    g.bezierCurveTo(S * 0.5 + ox + 90, S * 0.75 + oy, S * 0.5 + ox - 90, S * 0.75 + oy, S * 0.5 + ox, S + oy);
    g.stroke();
  });
  return finish(c, renderer, { repeat: true });
}

/** Deep bottle-green broadloom with a faint tone-on-tone diamond; tileable (512 px = 2 m). */
export function makeCarpetTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#466d4f';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(120,160,100,0.16)';
  g.lineWidth = 2;
  for (const [ox, oy] of [[0, 0], [S / 2, S / 2]] as const) {
    g.beginPath();
    g.moveTo(ox + S / 4, oy);
    g.lineTo(ox + S / 2, oy + S / 4);
    g.lineTo(ox + S / 4, oy + S / 2);
    g.lineTo(ox, oy + S / 4);
    g.closePath();
    g.stroke();
    g.fillStyle = 'rgba(214,184,110,0.42)';
    for (const [dx, dy] of [[S / 4, 0], [S / 2, S / 4], [S / 4, S / 2], [0, S / 4]] as const) {
      g.beginPath();
      g.arc(ox + dx, oy + dy, 5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const R = rng(13);
  for (let i = 0; i < 26000; i++) {
    const v = R();
    g.fillStyle = v < 0.5 ? 'rgba(10,22,14,0.35)' : 'rgba(96,140,104,0.28)';
    g.fillRect(R() * S, R() * S, 1.5, 1.5);
  }
  return finish(c, renderer, { repeat: true });
}

/** Etched glass for the lounge doors: frosted field (alpha ~0.62) with clear Deco linework (fan, rays, border), 1:2.4. */
export function makeEtchedGlassTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const W = 256;
  const H = 614;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(238,230,212,0.86)';
  g.fillRect(0, 0, W, H);
  const R = rng(5);
  g.globalAlpha = 0.5;
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(150,140,120,0.3)';
    g.fillRect(R() * W, R() * H, 1.5, 1.5);
  }
  g.globalAlpha = 1;
  // clear (un-frosted) strokes: erase the frost
  g.globalCompositeOperation = 'destination-out';
  g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.lineWidth = 3;
  g.strokeRect(14, 14, W - 28, H - 28);
  g.lineWidth = 1.5;
  g.strokeRect(24, 24, W - 48, H - 48);
  // sunburst fan from the lower third
  const cx = W / 2;
  const cy = H * 0.62;
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (i / 16) * Math.PI;
    g.lineWidth = i % 2 ? 1.6 : 3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
    g.lineTo(cx + Math.cos(a) * (i % 2 ? 96 : 118), cy + Math.sin(a) * (i % 2 ? 96 : 118));
    g.stroke();
  }
  for (const r of [26, 124]) {
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(cx, cy, r, Math.PI, 0);
    g.stroke();
  }
  // stepped Deco chevrons beneath
  for (let k = 0; k < 4; k++) {
    g.lineWidth = 2.4 - k * 0.3;
    g.beginPath();
    g.moveTo(cx - 90 + k * 12, cy + 40 + k * 26);
    g.lineTo(cx, cy + 20 + k * 26);
    g.lineTo(cx + 90 - k * 12, cy + 40 + k * 26);
    g.stroke();
  }
  // vertical fluting lines at the top
  for (let i = 0; i < 9; i++) {
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(40 + i * 22, 44);
    g.lineTo(40 + i * 22, 150);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  return finish(c, renderer);
}
