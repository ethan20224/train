import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 4 interior variants (2048x512): warm amber glow, lampshades, curtain edges, seat backs. Black outside the glass. */
export function windowAtlas(): THREE.CanvasTexture {
  const cw = 512;
  const [c, g] = canvas(cw * 4, cw);
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  const rnd = (s: number): number => {
    const v = Math.sin(s * 127.1) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let v = 0; v < 4; v++) {
    const x0 = v * cw;
    g.save();
    g.translate(x0, 0);
    g.beginPath();
    rrect(g, 20, 36, cw - 40, cw - 72, 46);
    g.clip();
    const bg = g.createLinearGradient(0, 36, 0, cw - 36);
    bg.addColorStop(0, '#ffe2a8');
    bg.addColorStop(0.35, '#ffbd62');
    bg.addColorStop(1, '#e5832a');
    g.fillStyle = bg;
    g.fillRect(0, 0, cw, cw);
    // ceiling light strip
    const cl = g.createLinearGradient(0, 36, 0, 120);
    cl.addColorStop(0, 'rgba(255,250,225,0.95)');
    cl.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = cl;
    g.fillRect(0, 36, cw, 90);
    // far wall panelling
    g.fillStyle = 'rgba(120,50,10,0.22)';
    g.fillRect(0, cw * 0.62, cw, cw);
    g.fillStyle = 'rgba(255,220,150,0.35)';
    for (let k = 0; k < 4; k++) g.fillRect(70 + k * 105 + rnd(v * 7 + k) * 14, 190, 4, 150);
    // table lamps (shade silhouettes with halos)
    const lamps = v === 2 ? [0.5] : v === 1 ? [0.3] : [0.28, 0.74];
    for (const lx of lamps) {
      const X = lx * cw;
      const halo = g.createRadialGradient(X, 330, 4, X, 330, 130);
      halo.addColorStop(0, 'rgba(255,248,214,1)');
      halo.addColorStop(0.35, 'rgba(255,214,130,0.7)');
      halo.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = halo;
      g.fillRect(X - 140, 200, 280, 260);
      g.fillStyle = '#8a4a14';
      g.beginPath();
      g.moveTo(X - 30, 348);
      g.lineTo(X + 30, 348);
      g.lineTo(X + 18, 395);
      g.lineTo(X - 18, 395);
      g.fill();
      g.fillStyle = '#ffe6a6';
      g.beginPath();
      g.moveTo(X - 36, 350);
      g.lineTo(X + 36, 350);
      g.lineTo(X + 52, 300);
      g.lineTo(X - 52, 300);
      g.closePath();
      g.fill();
      g.strokeStyle = '#d98a2a';
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = '#4a2810';
      g.fillRect(X - 4, 395, 8, 70);
    }
    // seat backs / table in the foreground
    g.fillStyle = '#4a2a14';
    rrect(g, 36, 430, 150, 110, 36);
    g.fill();
    rrect(g, cw - 190, 430, 150, 110, 36);
    g.fill();
    g.fillStyle = '#6b3b18';
    g.fillRect(150, 462, cw - 300, 14);
    // curtains
    const cwid = v === 3 ? 0.27 : v === 1 ? 0.18 : 0.12;
    for (const side of [0, 1]) {
      const x = side === 0 ? 0 : cw * (1 - cwid);
      const w = cw * cwid;
      const cg = g.createLinearGradient(x, 0, x + w, 0);
      cg.addColorStop(0, '#5c1710');
      cg.addColorStop(0.5, '#a23a22');
      cg.addColorStop(1, '#5c1710');
      g.fillStyle = cg;
      g.fillRect(x, 0, w, cw);
      g.fillStyle = 'rgba(30,5,0,0.4)';
      for (let k = 1; k < 5; k++) g.fillRect(x + (w * k) / 5, 0, 3, cw);
      g.fillStyle = '#e8b24a';
      g.fillRect(side === 0 ? x + w - 6 : x, 250, 6, 26);
    }
    // pelmet
    g.fillStyle = '#7a2616';
    g.fillRect(0, 36, cw, 34);
    g.fillStyle = '#e8b24a';
    g.fillRect(0, 66, cw, 5);
    g.restore();
    // inner frame bevel (stays dark)
    g.strokeStyle = '#000';
    g.lineWidth = 10;
    rrect(g, x0 + 20, 36, cw - 40, cw - 72, 46);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}

/** Gold lettering on transparent ground. Aspect 2048 x 96. */
export function lettersTexture(text: string): THREE.CanvasTexture {
  const [c, g] = canvas(2048, 96);
  g.clearRect(0, 0, c.width, c.height);
  const chars = [...text];
  g.font = '600 66px Didot, "Bodoni 72", "Playfair Display", Georgia, serif';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const gap = 34;
  const widths = chars.map((ch) => (ch === ' ' ? 40 : g.measureText(ch).width));
  const total = widths.reduce((a, w) => a + w + gap, 0) - gap;
  let x = (c.width - total) / 2;
  const grad = g.createLinearGradient(0, 14, 0, 82);
  grad.addColorStop(0, '#fff0a8');
  grad.addColorStop(0.45, '#e0a93a');
  grad.addColorStop(1, '#a8741c');
  g.fillStyle = grad;
  chars.forEach((ch, i) => {
    if (ch !== ' ') g.fillText(ch, x, 52);
    x += widths[i]! + gap;
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Glow atlas: left half = illuminated drumhead sign, right half = plain warm white (headlight lens). */
export function glowAtlas(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#fff3d2';
  g.fillRect(512, 0, 512, 512);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  const R = 246;
  g.translate(256, 256);
  g.fillStyle = '#e8b23c';
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#17110a';
  g.beginPath();
  g.arc(0, 0, R - 26, 0, Math.PI * 2);
  g.fill();
  // sunburst rays
  g.strokeStyle = '#8a6a22';
  g.lineWidth = 3;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 60, Math.sin(a) * 60);
    g.lineTo(Math.cos(a) * (R - 32), Math.sin(a) * (R - 32));
    g.stroke();
  }
  g.fillStyle = '#17110a';
  g.beginPath();
  g.arc(0, 0, 150, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#e8b23c';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, 150, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffe28a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 54px Didot, "Bodoni 72", Georgia, serif';
  g.fillText('GRAND', 0, -62);
  g.fillText('MERIDIAN', 0, 0);
  g.font = '600 40px Didot, "Bodoni 72", Georgia, serif';
  g.fillText('L I M I T E D', 0, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft contact shadow: dark across x with smooth falloff, tapered at both ends. 64 (x) x 512 (z). */
export function contactShadowTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 512;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const ez = Math.min(1, Math.min(y, H - 1 - y) / 10);
    for (let x = 0; x < W; x++) {
      const u = Math.abs((x + 0.5) / W - 0.5) * 2; // 0 center .. 1 edge
      const core = Math.min(1, (1 - u) / 0.55);
      const a = Math.pow(core, 1.4) * 0.62 * ez * ez * (3 - 2 * ez);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      img.data[i + 3] = Math.round(255 * a);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
