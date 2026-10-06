import * as THREE from 'three';
import { SHOPS } from '../../layout';

/**
 * Canvas atlas for the shops: black-glass gilt fascia signs, period mastheads, magazine covers, postcards,
 * locker numerals, penny-scale dial, small signs. One 4096 x 2048 texture, one draw call.
 */
const SERIF = '"Didot", "Bodoni 72", "Bodoni MT", "Georgia", "Times New Roman", serif';

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}
export interface ShopAtlas {
  texture: THREE.CanvasTexture;
  cell: Record<string, UVRect>;
}

type G = CanvasRenderingContext2D;
const W = 4096;
const H = 2048;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ls(g: G, px: number): void {
  (g as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

function text(g: G, s: string, cx: number, cy: number, size: number, fill: string | CanvasGradient, opts: { w?: number; family?: string; spacing?: number } = {}): void {
  g.save();
  g.font = `${opts.w ?? 600} ${size}px ${opts.family ?? SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  ls(g, (opts.spacing ?? 0) * size);
  g.fillStyle = fill;
  g.fillText(s, cx, cy);
  g.restore();
}

function giltFill(g: G, cy: number, size: number): CanvasGradient {
  const grad = g.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
  grad.addColorStop(0, '#fff0b8');
  grad.addColorStop(0.45, '#dcae48');
  grad.addColorStop(0.55, '#a87a24');
  grad.addColorStop(1, '#ecca70');
  return grad;
}

function gilt(g: G, s: string, cx: number, cy: number, size: number, spacing = 0.14): void {
  text(g, s, cx + size * 0.02, cy + size * 0.03, size, 'rgba(0,0,0,0.7)', { spacing });
  text(g, s, cx, cy, size, giltFill(g, cy, size), { spacing });
}

/** Deco fan ornament: radiating gilt lines. */
function fan(g: G, cx: number, cy: number, r: number): void {
  g.save();
  g.strokeStyle = '#d5a845';
  g.lineWidth = Math.max(2, r * 0.05);
  for (let i = -4; i <= 4; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 11;
    g.beginPath();
    g.moveTo(cx, cy + r * 0.5);
    g.lineTo(cx + Math.cos(a) * r, cy + r * 0.5 + Math.sin(a) * r);
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy + r * 0.5, r * 0.28, Math.PI, 0);
  g.stroke();
  g.restore();
}

/** Black-glass fascia with a double gilt keyline and Deco end ornaments. */
function fascia(g: G, x: number, y: number, w: number, h: number, label: string, size: number, spacing: number, tint = '#0b0c0e', sub?: string): void {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#1b1c20');
  grad.addColorStop(0.5, tint);
  grad.addColorStop(1, '#050506');
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // faint diagonal glass reflection
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.045)';
  g.beginPath();
  g.moveTo(x + w * 0.1, y);
  g.lineTo(x + w * 0.2, y);
  g.lineTo(x + w * 0.1 - h * 0.6, y + h);
  g.lineTo(x - h * 0.6, y + h);
  g.fill();
  g.restore();
  g.strokeStyle = '#c79a3c';
  g.lineWidth = Math.max(3, h * 0.022);
  g.strokeRect(x + h * 0.09, y + h * 0.1, w - h * 0.18, h * 0.8);
  g.lineWidth = Math.max(1.5, h * 0.01);
  g.strokeRect(x + h * 0.14, y + h * 0.16, w - h * 0.28, h * 0.68);
  fan(g, x + h * 0.62, y + h * 0.35, h * 0.3);
  fan(g, x + w - h * 0.62, y + h * 0.35, h * 0.3);
  if (sub) {
    gilt(g, label, x + w / 2, y + h * 0.45, size, spacing);
    text(g, sub, x + w / 2, y + h * 0.78, size * 0.3, '#caa14a', { spacing: 0.4, w: 500 });
  } else gilt(g, label, x + w / 2, y + h * 0.52, size, spacing);
}

function plaque(g: G, x: number, y: number, w: number, h: number, label: string, size: number, bg = '#101114', spacing = 0.18): void {
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#c79a3c';
  g.lineWidth = Math.max(2, h * 0.04);
  g.strokeRect(x + h * 0.08, y + h * 0.1, w - h * 0.16, h * 0.8);
  gilt(g, label, x + w / 2, y + h / 2 + h * 0.02, size, spacing);
}

const COVER_PAL: Array<[string, string, string]> = [
  ['#7a1f24', '#f0dcb4', '#d9aa3e'],
  ['#1f3d57', '#efe4c8', '#d9b04a'],
  ['#2f5a3f', '#f1e5c6', '#e0c15a'],
  ['#d8c18a', '#2a1a12', '#8a2a22'],
  ['#e5d3ad', '#1d2a3b', '#a8322a'],
  ['#3a2a52', '#f1e2bd', '#d9a845'],
  ['#b8552a', '#f6ecd2', '#2a1d14'],
  ['#233b3c', '#ecdfbe', '#cfa241'],
  ['#8b2d4a', '#f3e6c8', '#e2c15f'],
  ['#c9ae6c', '#2b1b13', '#8a2a22'],
  ['#2a2d33', '#e8dcc0', '#c9a246'],
  ['#5d6f3a', '#f0e4c4', '#d8b24c'],
];
const TITLES = ['THE ILLUSTRATED', 'PUNCH & CO', 'COUNTRY LIFE', 'THE SPHERE', 'BYSTANDER', 'THE TATLER', 'RAILWAY MAG', 'WOMAN’S OWN', 'THE STUDIO', 'VOGUE', 'LONDON NEWS', 'THE QUEEN'];
const SUBS = ['Weekly Journal', 'Wit & Humour', 'Fashion Number', 'Motoring Special', 'Winter Resorts', 'Society Pages', 'Express Timetables', 'Home & Garden', 'Deco Interiors', 'Paris Spring', 'Midnight Edition', 'Ladies’ Supplement'];

function cover(g: G, x: number, y: number, w: number, h: number, i: number): void {
  const R = mulberry(41 + i * 17);
  const [bg, fg, ac] = COVER_PAL[i % COVER_PAL.length]!;
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  g.strokeStyle = ac;
  g.lineWidth = 3;
  g.strokeRect(x + 7, y + 7, w - 14, h - 14);
  // Deco illustration: sunburst, silhouette arches or stepped skyline
  g.save();
  g.beginPath();
  g.rect(x + 10, y + 70, w - 20, h - 100);
  g.clip();
  const kind = i % 3;
  if (kind === 0) {
    g.strokeStyle = ac;
    g.lineWidth = 3;
    for (let k = 0; k < 15; k++) {
      const a = Math.PI + (k / 14) * Math.PI;
      g.beginPath();
      g.moveTo(x + w / 2, y + h - 40);
      g.lineTo(x + w / 2 + Math.cos(a) * 190, y + h - 40 + Math.sin(a) * 190);
      g.stroke();
    }
    g.fillStyle = fg;
    g.beginPath();
    g.arc(x + w / 2, y + h - 40, 34, Math.PI, 0);
    g.fill();
  } else if (kind === 1) {
    g.fillStyle = fg;
    for (let k = 0; k < 6; k++) {
      const bw = 20 + R() * 16;
      const bh = 40 + R() * 90;
      g.fillRect(x + 14 + k * 26, y + h - 30 - bh, bw, bh);
    }
    g.fillStyle = ac;
    g.beginPath();
    g.arc(x + w * 0.7, y + 120, 24, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = ac;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(x + w / 2, y + h - 30, 30 + k * 26, Math.PI, 0);
      g.lineWidth = 8;
      g.strokeStyle = k % 2 ? fg : ac;
      g.stroke();
    }
  }
  g.restore();
  text(g, TITLES[i % TITLES.length]!, x + w / 2, y + 34, 22, fg, { spacing: 0.08, w: 700 });
  text(g, SUBS[i % SUBS.length]!, x + w / 2, y + 58, 13, ac, { spacing: 0.15, w: 500 });
  text(g, `Nº ${100 + ((i * 37) % 800)}`, x + w / 2, y + h - 16, 12, fg, { spacing: 0.15, w: 500 });
}

const MASTHEADS = ['THE DAILY MERIDIAN', 'THE EVENING STAR', 'THE TIMES-HERALD', 'THE MORNING POST', 'THE GLOBE', 'RAILWAY GAZETTE'];
function newspaper(g: G, x: number, y: number, w: number, h: number, i: number): void {
  const R = mulberry(900 + i * 31);
  g.fillStyle = ['#ded0ac', '#d8cba5', '#e3d8b9'][i % 3]!;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(80,60,30,0.12)';
  g.fillRect(x, y, w, h);
  text(g, MASTHEADS[i % MASTHEADS.length]!, x + w / 2, y + 24, 21, '#17120c', { spacing: 0.02, w: 800 });
  g.strokeStyle = '#17120c';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + 8, y + 42);
  g.lineTo(x + w - 8, y + 42);
  g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + 8, y + 46);
  g.lineTo(x + w - 8, y + 46);
  g.stroke();
  text(g, 'PRICE ONE PENNY', x + w / 2, y + 58, 10, '#2a2218', { spacing: 0.15, w: 500 });
  // headline + photo + columns
  g.fillStyle = '#17120c';
  g.fillRect(x + 10, y + 68, w - 20, 16 + R() * 6);
  g.fillStyle = 'rgba(40,32,20,0.55)';
  g.fillRect(x + 10, y + 96, w * 0.45, 60);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 20; r++) {
      const ly = y + 94 + r * 7;
      if (ly > y + h - 12) break;
      const cx0 = x + 10 + c * ((w - 20) / 3);
      if (c === 0 && ly < y + 158) continue;
      const lw = (w - 20) / 3 - 6 - (R() < 0.15 ? 20 : 0);
      g.fillStyle = 'rgba(30,24,14,0.55)';
      g.fillRect(cx0, ly, lw, 2);
    }
  }
}

function postcard(g: G, x: number, y: number, w: number, h: number, i: number): void {
  const skies = ['#8fb4cc', '#e7b784', '#a9c4aa', '#c9a4b8'];
  g.fillStyle = '#efe6cf';
  g.fillRect(x, y, w, h);
  g.fillStyle = skies[i % 4]!;
  g.fillRect(x + 6, y + 6, w - 12, h - 12);
  g.fillStyle = 'rgba(30,26,30,0.7)';
  const R = mulberry(7 + i * 5);
  for (let k = 0; k < 7; k++) g.fillRect(x + 12 + k * 24, y + h - 20 - R() * 50, 18, 60);
  g.fillStyle = '#f5e5c0';
  g.beginPath();
  g.arc(x + w * (0.3 + 0.15 * i), y + 32, 12, 0, Math.PI * 2);
  g.fill();
  text(g, ['Greetings from the Terminus', 'The Grand Meridian', 'Platform Seven', 'Golden Hour'][i % 4]!, x + w / 2, y + h - 12, 11, '#fff6dc', { family: SERIF, w: 600, spacing: 0.02 });
}

function dial(g: G, x: number, y: number, s: number): void {
  const cx = x + s / 2;
  const cy = y + s / 2;
  g.fillStyle = '#efe5cc';
  g.fillRect(x, y, s, s);
  g.beginPath();
  g.arc(cx, cy, s * 0.47, 0, Math.PI * 2);
  g.fillStyle = '#f4ead2';
  g.fill();
  g.strokeStyle = '#1b1510';
  g.lineWidth = 4;
  g.stroke();
  for (let k = 0; k <= 40; k++) {
    const a = Math.PI * 0.75 + (k / 40) * Math.PI * 1.5;
    const long = k % 5 === 0;
    g.lineWidth = long ? 4 : 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * s * 0.38, cy + Math.sin(a) * s * 0.38);
    g.lineTo(cx + Math.cos(a) * s * (long ? 0.31 : 0.34), cy + Math.sin(a) * s * (long ? 0.31 : 0.34));
    g.stroke();
    if (long) text(g, String((k / 5) * 2 * 7), cx + Math.cos(a) * s * 0.25, cy + Math.sin(a) * s * 0.25, s * 0.07, '#1b1510', { family: SERIF, w: 700 });
  }
  text(g, 'STONE · LBS', cx, cy + s * 0.12, s * 0.055, '#6a1f1a', { spacing: 0.1, w: 700 });
  text(g, 'YOUR WEIGHT', cx, cy - s * 0.1, s * 0.055, '#6a1f1a', { spacing: 0.1, w: 700 });
  g.strokeStyle = '#7a1c14';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(Math.PI * 1.02) * s * 0.34, cy + Math.sin(Math.PI * 1.02) * s * 0.34);
  g.stroke();
}

function clockFace(g: G, x: number, y: number, s: number): void {
  const cx = x + s / 2;
  const cy = y + s / 2;
  g.fillStyle = '#f2e8cc';
  g.fillRect(x, y, s, s);
  g.beginPath();
  g.arc(cx, cy, s * 0.48, 0, Math.PI * 2);
  g.fillStyle = '#f6eed6';
  g.fill();
  g.strokeStyle = '#2a1d10';
  g.lineWidth = 5;
  g.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    text(g, String(k === 0 ? 12 : k), cx + Math.sin(a) * s * 0.36, cy - Math.cos(a) * s * 0.36, s * 0.1, '#2a1d10', { family: SERIF, w: 700 });
  }
  const hand = (ang: number, len: number, wd: number): void => {
    g.lineWidth = wd;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);
    g.stroke();
  };
  hand(((6 + 47 / 60) / 12) * Math.PI * 2, s * 0.22, 8);
  hand((47 / 60) * Math.PI * 2, s * 0.34, 5);
}

function menu(g: G, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#1c2420';
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#d9c89a';
  g.lineWidth = 3;
  g.strokeRect(x + 8, y + 8, w - 16, h - 16);
  text(g, 'Today', x + w / 2, y + 40, 38, '#f3ead0', { family: SERIF, w: 600, spacing: 0.1 });
  const items: Array<[string, string]> = [['Espresso', '3d'], ['Cappuccino', '4d'], ['Hot Chocolate', '4d'], ['Eccles Cake', '2d'], ['Éclair', '3d'], ['Mille-feuille', '4d'], ['Teacake', '3d']];
  items.forEach(([n, p], i) => {
    const yy = y + 90 + i * 34;
    text(g, n, x + 24 + (n.length * 7), yy, 22, '#efe6c8', { family: SERIF, w: 500 });
    g.fillStyle = 'rgba(239,230,200,0.5)';
    g.fillRect(x + 30 + n.length * 14, yy + 10, w - 120 - n.length * 14, 1.5);
    text(g, p, x + w - 40, yy, 22, '#efe6c8', { family: SERIF, w: 500 });
  });
}

function blade(g: G, x: number, y: number, w: number, h: number, a: string, b: string, c: string, bg: string): void {
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#c79a3c';
  g.lineWidth = 5;
  g.strokeRect(x + 10, y + 10, w - 20, h - 20);
  text(g, a, x + w / 2, y + h * 0.2, w * 0.17, '#f1dfa8', { spacing: 0.08, w: 700 });
  g.strokeStyle = '#c79a3c';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x + w / 2, y + h * 0.54, w * 0.24, 0, Math.PI * 2);
  g.stroke();
  text(g, b, x + w / 2, y + h * 0.54, w * 0.3, '#e6c25c', { w: 700 });
  text(g, c, x + w / 2, y + h * 0.86, w * 0.12, '#f1dfa8', { spacing: 0.2, w: 500 });
}

export function makeShopAtlas(renderer: THREE.WebGLRenderer): ShopAtlas {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  g.fillStyle = '#e9dcc0';
  g.fillRect(0, 0, W, H);
  const cell: Record<string, UVRect> = {};
  const put = (name: string, x: number, y: number, w: number, h: number): void => void (cell[name] = { u0: x / W, u1: (x + w) / W, v0: 1 - (y + h) / H, v1: 1 - y / H });

  // --- fascias (4096 x 256) -------------------------------------------------------------------------------------
  const sizes: Record<string, [number, number, string | undefined, string | undefined]> = {
    newsstand: [118, 0.1, '#0a0b0f', 'PERIODICALS · PIPES · CIGARS · POSTCARDS'],
    florist: [128, 0.1, '#0c0f0b', 'CUT FLOWERS · BOXED CHOCOLATES · BOILED SWEETS'],
    coffee: [150, 0.14, '#0f0b09', 'ROASTED DAILY · FRESH PASTRIES · TEA'],
    conveniences: [112, 0.1, '#0a0c10', 'LUGGAGE · TELEPHONES · LETTERS · SHOE SHINE'],
  };
  SHOPS.units.forEach((u, i) => {
    const [size, sp, tint, sub] = sizes[u.id]!;
    put(`fascia_${u.id}`, 0, i * 256, 4096, 256);
    fascia(g, 0, i * 256, 4096, 256, u.label, size, sp, tint, sub);
  });

  // --- row: covers, newspapers, postcards (y 1024) --------------------------------------------------------------
  for (let i = 0; i < 12; i++) {
    put(`cover${i}`, i * 172, 1024, 170, 240);
    cover(g, i * 172, 1024, 170, 240, i);
  }
  for (let i = 0; i < 6; i++) {
    put(`paper${i}`, 2064 + i * 202, 1024, 200, 240);
    newspaper(g, 2064 + i * 202, 1024, 200, 240, i);
  }
  for (let i = 0; i < 4; i++) {
    put(`card${i}`, 3290 + i * 192, 1024, 190, 130);
    postcard(g, 3290 + i * 192, 1024, 190, 130, i);
  }
  // --- row: kiosk fascias, blade signs, small plaques (y 1280) --------------------------------------------------
  put('kioskNews', 0, 1280, 1024, 192);
  fascia(g, 0, 1280, 1024, 192, 'NEWS & TOBACCO', 54, 0.08, '#0a0b0f');
  put('kioskCoffee', 1024, 1280, 1024, 192);
  fascia(g, 1024, 1280, 1024, 192, 'COFFEE BAR', 78, 0.14, '#0f0b09');
  const blades: Array<[string, string, string, string]> = [
    ['PIPES', 'P', 'TOBACCO', '#14181f'],
    ['FLOWERS', 'F', 'FRESH DAILY', '#12201a'],
    ['COFFEE', 'C', 'PASTRIES', '#2a1710'],
    ['TELEPHONE', 'T', 'LOCKERS', '#101a2a'],
  ];
  blades.forEach(([a, b, cc, bg], i) => {
    put(`blade${i}`, 2048 + i * 244, 1280, 240, 300);
    blade(g, 2048 + i * 244, 1280, 240, 300, a, b, cc, bg);
  });
  put('telephone', 3024, 1280, 512, 128);
  plaque(g, 3024, 1280, 512, 128, 'TELEPHONE', 60, '#0f1722');
  put('lockers', 3536, 1280, 512, 128);
  plaque(g, 3536, 1280, 512, 128, 'LUGGAGE LOCKERS', 40, '#12151a', 0.1);
  // --- row: numerals, dial, clock, menu, small plaques (y 1600) -------------------------------------------------
  for (let i = 0; i < 24; i++) {
    put(`num${i + 1}`, i * 98, 1600, 96, 96);
    g.fillStyle = '#1a1209';
    g.fillRect(i * 98, 1600, 96, 96);
    g.strokeStyle = '#e0bb5c';
    g.lineWidth = 3;
    g.strokeRect(i * 98 + 8, 1608, 80, 80);
    text(g, String(i + 1), i * 98 + 48, 1650, 44, '#f1d58a', { w: 700 });
  }
  put('dial', 2400, 1600, 256, 256);
  dial(g, 2400, 1600, 256);
  put('clock', 2660, 1600, 256, 256);
  clockFace(g, 2660, 1600, 256);
  put('letters', 2930, 1600, 256, 128);
  plaque(g, 2930, 1600, 256, 128, 'LETTERS', 36, '#7a1812', 0.12);
  put('shoeshine', 3200, 1600, 512, 128);
  plaque(g, 3200, 1600, 512, 128, 'SHOE SHINE · 2d', 44, '#16120c', 0.08);
  put('open', 3726, 1600, 256, 96);
  plaque(g, 3726, 1600, 256, 96, 'OPEN', 44, '#16120c', 0.3);
  put('weigh', 3200, 1736, 512, 96);
  plaque(g, 3200, 1736, 512, 96, 'WEIGH YOURSELF · 1d', 34, '#16120c', 0.06);
  put('menu', 3726, 1720, 330, 320);
  menu(g, 3726, 1720, 330, 320);
  // chocolate box lids + tobacco tin labels (y 1720 / 1860)
  const lid = ['#7a1f24', '#233b57', '#c9a44a', '#2f5a3f'];
  for (let i = 0; i < 4; i++) {
    put(`lid${i}`, i * 130, 1720, 128, 128);
    g.fillStyle = lid[i]!;
    g.fillRect(i * 130, 1720, 128, 128);
    g.strokeStyle = '#e6c25c';
    g.lineWidth = 4;
    g.strokeRect(i * 130 + 10, 1730, 108, 108);
    text(g, ['Maison', 'Reine', 'Or', 'Délice'][i]!, i * 130 + 64, 1784, 26, '#f4e4ae', { w: 700 });
    put(`tin${i}`, 560 + i * 130, 1720, 128, 128);
    g.fillStyle = ['#8a1d1a', '#1d3a2a', '#c8a03e', '#1b2b4a'][i]!;
    g.fillRect(560 + i * 130, 1720, 128, 128);
    g.strokeStyle = '#f0d58a';
    g.lineWidth = 3;
    g.strokeRect(570 + i * 130, 1730, 108, 108);
    text(g, ['PLAYER’S', 'NAVY CUT', 'GOLD FLAKE', 'CAPSTAN'][i]!, 560 + i * 130 + 64, 1784, 17, '#f6e6b0', { w: 700 });
  }
  const monos: Record<string, string> = { newsstand: 'NEWSAGENT', florist: 'FLORIST', coffee: 'COFFEE', conveniences: 'TRAVELLERS’' };
  SHOPS.units.forEach((u, i) => {
    put(`mono_${u.id}`, i * 810, 1862, 800, 180);
    fascia(g, i * 810, 1862, 800, 180, monos[u.id]!, 62, 0.12);
  });
  put('plain', 4060, 2000, 30, 30);
  g.fillStyle = '#ffffff';
  g.fillRect(4060, 2000, 30, 30);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return { texture: t, cell };
}
