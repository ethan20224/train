import * as THREE from 'three';

export const SIGN_TEXT = ['PLATFORMS 1 · 2', 'PLATFORMS 3 · 4', 'PLATFORMS 5 · 6'] as const;

/** Atlas of three black-glass sign faces with gilt Deco lettering; row r = bank r. */
export function makeSignAtlas(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const W = 2048;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H * 3;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  SIGN_TEXT.forEach((txt, r) => {
    const y0 = r * H;
    const bg = g.createLinearGradient(0, y0, 0, y0 + H);
    bg.addColorStop(0, '#16130f');
    bg.addColorStop(0.45, '#070605');
    bg.addColorStop(1, '#0d0b09');
    g.fillStyle = bg;
    g.fillRect(0, y0, W, H);
    // double gilt rule + corner diamonds
    g.strokeStyle = '#b98e3d';
    g.lineWidth = 4;
    g.strokeRect(16, y0 + 16, W - 32, H - 32);
    g.lineWidth = 1.5;
    g.strokeRect(30, y0 + 30, W - 60, H - 60);
    g.fillStyle = '#d9b25f';
    for (const x of [78, W - 78]) {
      g.beginPath();
      g.moveTo(x, y0 + H / 2 - 22);
      g.lineTo(x + 14, y0 + H / 2);
      g.lineTo(x, y0 + H / 2 + 22);
      g.lineTo(x - 14, y0 + H / 2);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#e2bd6a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 118px "Didot", "Bodoni 72", "Georgia", serif';
    (g as unknown as { letterSpacing: string }).letterSpacing = '14px';
    g.fillText(txt, W / 2, y0 + H / 2 + 6);
    // arrow chevrons either side of the lettering, pointing north through the gates
    g.strokeStyle = '#d9b25f';
    g.lineWidth = 6;
    for (const x of [190, W - 190]) {
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        g.moveTo(x - 20 + k * 22, y0 + H / 2 - 30);
        g.lineTo(x + 6 + k * 22, y0 + H / 2);
        g.lineTo(x - 20 + k * 22, y0 + H / 2 + 30);
        g.stroke();
      }
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
