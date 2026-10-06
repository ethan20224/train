import * as THREE from 'three';

/** Procedural canvases: enamel signs (atlas), brick, slate. Deterministic (seeded). */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('no 2d canvas');
  return [c, g];
}

const FONT = '"Gill Sans", "Gill Sans MT", Futura, "Avenir Next Condensed", "Helvetica Neue", Arial, sans-serif';

type UV = readonly [number, number, number, number];
export interface EnamelAtlas {
  tex: THREE.CanvasTexture;
  personnel: UV;
  crossLine: UV;
  stop: UV;
  nameboard: UV;
}

const AW = 2048;
const AH = 1024;
/** Cell rectangles in canvas pixels (x, y, w, h). */
const CELLS = {
  personnel: [0, 0, 1024, 512],
  crossLine: [1024, 0, 1024, 512],
  stop: [0, 512, 512, 384],
  nameboard: [512, 512, 1536, 256],
} as const;
const uvOf = (c: readonly [number, number, number, number]): UV => [c[0] / AW, 1 - (c[1] + c[3]) / AH, (c[0] + c[2]) / AW, 1 - c[1] / AH];

/** Draws centred text scaled down (never up) to fit maxW, with tracking. */
function line(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number, maxW: number, weight = 700, track = 0.06): void {
  let size = px;
  const setFont = (): void => {
    g.font = `${weight} ${size}px ${FONT}`;
    (g as unknown as { letterSpacing: string }).letterSpacing = `${(size * track).toFixed(1)}px`;
  };
  setFont();
  while (g.measureText(text).width > maxW && size > 12) {
    size -= 2;
    setFont();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx + (size * track) / 2, cy);
  (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
}

/** Vitreous-enamel plate: coloured field, cream border, rolled-edge highlight, chips and weathering. */
function enamel(g: CanvasRenderingContext2D, c: readonly [number, number, number, number], field: string, ink: string, rand: () => number): void {
  const [x, y, w, h] = c;
  g.fillStyle = '#d9d2bd';
  g.fillRect(x, y, w, h); // white rim (the enamel's rolled edge)
  g.fillStyle = field;
  g.fillRect(x + 10, y + 10, w - 20, h - 20);
  g.strokeStyle = ink;
  g.lineWidth = Math.max(5, h * 0.016);
  g.strokeRect(x + h * 0.045, y + h * 0.045, w - h * 0.09, h - h * 0.09);
  // soft gloss gradient + staining
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, 'rgba(255,255,255,0.10)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.14)');
  g.fillStyle = gr;
  g.fillRect(x + 10, y + 10, w - 20, h - 20);
  // chips at the edges and rust weeping from the bolt holes
  for (let i = 0; i < 26; i++) {
    const e = Math.floor(rand() * 4);
    const px = e < 2 ? x + 10 + rand() * (w - 20) : x + (e === 2 ? 10 : w - 10 - 8);
    const py = e < 2 ? y + (e === 0 ? 10 : h - 10 - 8) : y + 10 + rand() * (h - 20);
    g.fillStyle = rand() < 0.6 ? '#5b4a3a' : '#a8997e';
    g.fillRect(px, py, 3 + rand() * 7, 3 + rand() * 6);
  }
  for (const [bx, by] of [[x + h * 0.095, y + h * 0.095], [x + w - h * 0.095, y + h * 0.095], [x + h * 0.095, y + h - h * 0.095], [x + w - h * 0.095, y + h - h * 0.095]] as const) {
    g.fillStyle = '#2a1f17';
    g.beginPath();
    g.arc(bx, by, h * 0.016, 0, Math.PI * 2);
    g.fill();
    const rs = g.createLinearGradient(bx, by, bx, by + h * 0.18);
    rs.addColorStop(0, 'rgba(110,60,25,0.38)');
    rs.addColorStop(1, 'rgba(110,60,25,0)');
    g.fillStyle = rs;
    g.fillRect(bx - 3, by, 6, h * 0.18);
  }
}

export function enamelAtlas(): EnamelAtlas {
  const [c, g] = canvas(AW, AH);
  const rand = rng(77);
  g.fillStyle = '#222';
  g.fillRect(0, 0, AW, AH);

  // --- AUTHORISED PERSONNEL ONLY (cream on dark blue)
  {
    const cell = CELLS.personnel;
    enamel(g, cell, '#16355a', '#eee4c8', rand);
    g.fillStyle = '#eee4c8';
    const cx = cell[0] + cell[2] / 2;
    line(g, 'AUTHORISED', cx, 118, 118, 800, 800);
    line(g, 'PERSONNEL ONLY', cx, 232, 118, 800, 800);
    g.fillRect(cx - 330, 292, 660, 5);
    line(g, 'NO PUBLIC ACCESS', cx, 352, 56, 760, 600, 0.12);
    line(g, 'BEYOND THIS POINT', cx, 424, 56, 760, 600, 0.12);
  }
  // --- PASSENGERS MUST NOT CROSS THE LINE (cream on dark green)
  {
    const cell = CELLS.crossLine;
    enamel(g, cell, '#183f2e', '#eee4c8', rand);
    g.fillStyle = '#eee4c8';
    const cx = cell[0] + cell[2] / 2;
    line(g, 'PASSENGERS', cx, 120, 108, 800, 800);
    line(g, 'MUST NOT', cx, 240, 108, 800, 800);
    line(g, 'CROSS THE LINE', cx, 372, 108, 820, 800);
    // chevrons either side of the legend rule
    g.fillRect(cx - 360, 438, 720, 4);
  }
  // --- STOP (white on signal red)
  {
    const cell = CELLS.stop;
    enamel(g, cell, '#a81a17', '#f0e8d4', rand);
    g.fillStyle = '#f4ecda';
    line(g, 'STOP', cell[0] + cell[2] / 2, cell[1] + cell[3] / 2 + 6, 190, 400, 900, 0.08);
  }
  // --- GRAND MERIDIAN nameboard (cream on dark green, long board)
  {
    const cell = CELLS.nameboard;
    enamel(g, cell, '#1a3b2d', '#e6dcbc', rand);
    g.fillStyle = '#e6dcbc';
    line(g, 'GRAND MERIDIAN', cell[0] + cell[2] / 2, cell[1] + cell[3] / 2 + 4, 150, 1300, 700, 0.22);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, personnel: uvOf(CELLS.personnel), crossLine: uvOf(CELLS.crossLine), stop: uvOf(CELLS.stop), nameboard: uvOf(CELLS.nameboard) };
}

/** Stretcher-bond London-stock-style brick, one repeat = 0.5 m (6 courses, 2 bricks across). */
export function brickTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rand = rng(9);
  g.fillStyle = '#b3a891';
  g.fillRect(0, 0, S, S);
  const rows = 6;
  const rh = S / rows;
  const bw = S / 2;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let k = -1; k < 3; k++) {
      const x = k * bw + off;
      const hue = 12 + rand() * 14;
      const sat = 38 + rand() * 18;
      const lit = 30 + rand() * 14;
      g.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
      g.fillRect(x + 4, r * rh + 4, bw - 8, rh - 8);
      // sooty / sandy speckle
      for (let i = 0; i < 40; i++) {
        g.fillStyle = rand() < 0.5 ? 'rgba(25,15,10,0.22)' : 'rgba(220,170,120,0.16)';
        g.fillRect(x + 6 + rand() * (bw - 14), r * rh + 6 + rand() * (rh - 14), 2 + rand() * 4, 2 + rand() * 3);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Welsh-slate courses; one repeat = 0.64 m (4 courses of 3 slates). */
export function slateTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rand = rng(31);
  g.fillStyle = '#10151a';
  g.fillRect(0, 0, S, S);
  const rows = 4;
  const rh = S / rows;
  const sw = S / 3;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? sw / 2 : 0;
    for (let k = -1; k < 4; k++) {
      const x = k * sw + off;
      const v = 30 + rand() * 18;
      g.fillStyle = `hsl(${205 + rand() * 20},${10 + rand() * 8}%,${v}%)`;
      g.fillRect(x + 2, r * rh, sw - 4, rh - 3);
      const gr = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      gr.addColorStop(0, 'rgba(0,0,0,0.0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.38)');
      g.fillStyle = gr;
      g.fillRect(x + 2, r * rh, sw - 4, rh - 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
