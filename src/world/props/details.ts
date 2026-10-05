import * as THREE from 'three';
import { ARCHES, BOARD } from '../../layout';
import { GeoBag, Soup, boxMM, latheMeters, v3, type P2 } from '../concourse/geo';
import { STANCHION_POSTS } from './layout';

// ---------------------------------------------------------------------------------------------
// Departures board: backing + brass frame with a stepped Art-Deco crown
// ---------------------------------------------------------------------------------------------
export function buildBoardFrame(brass: GeoBag, iron: GeoBag): void {
  const [bx, by, bz] = BOARD.center;
  const w = BOARD.width;
  const h = BOARD.height;
  const x0 = bx - w / 2;
  const x1 = bx + w / 2;
  const y0 = by - h / 2;
  const y1 = by + h / 2;
  // black backing slab (behind the display plane)
  iron.add(boxMM(x0, y0, bz, x1, y1, 100.0));
  // frame border, stepped profile toward -z. Border thickness 0.4.
  const t = 0.4;
  const front = bz - 0.0;
  const bar = (a0: number, b0: number, a1: number, b1: number): void => {
    brass.add(boxMM(a0, b0, front - 0.22, a1, b1, front));
    brass.add(boxMM(a0 + 0.05, b0 + 0.05, front - 0.3, a1 - 0.05, b1 - 0.05, front - 0.22));
  };
  bar(x0, y0, x0 + t, y1);
  bar(x1 - t, y0, x1, y1);
  bar(x0 + t, y0, x1 - t, y0 + t);
  bar(x0 + t, y1 - t, x1 - t, y1);
  // inner fillet around the display
  const f = 0.04;
  brass.add(boxMM(x0 + t, y0 + t, front - 0.1, x1 - t, y0 + t + f, front));
  brass.add(boxMM(x0 + t, y1 - t - f, front - 0.1, x1 - t, y1 - t, front));
  brass.add(boxMM(x0 + t, y0 + t, front - 0.1, x0 + t + f, y1 - t, front));
  brass.add(boxMM(x1 - t - f, y0 + t, front - 0.1, x1 - t, y1 - t, front));
  // Deco crown: three stepped tiers + a fan of rays at the centre
  const tiers: Array<[number, number]> = [[w + 0.5, 0.26], [w - 1.6, 0.26], [w - 5.2, 0.26]];
  let y = y1;
  tiers.forEach(([tw, th], i) => {
    brass.add(boxMM(bx - tw / 2, y, front - 0.34 + i * 0.04, bx + tw / 2, y + th, front + 0.1));
    brass.add(boxMM(bx - tw / 2 + 0.06, y + th, front - 0.34 + i * 0.04, bx + tw / 2 - 0.06, y + th + 0.05, front + 0.1));
    y += th + 0.05;
  });
  // sunburst fan above the crown: 11 slender triangles
  const rays = 11;
  for (let i = 0; i < rays; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / (rays - 1));
    const long = i % 2 === 0;
    const len = long ? 1.15 : 0.8;
    const s = new THREE.Shape();
    s.moveTo(-0.05, 0);
    s.lineTo(0.05, 0);
    s.lineTo(0, len);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
    g.rotateZ(a - Math.PI / 2);
    g.translate(bx, y + 0.0, front - 0.32);
    brass.add(g);
  }
  const hub = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 28, 1, false, 0, Math.PI).rotateX(Math.PI / 2);
  hub.translate(bx, y, front - 0.34);
  brass.add(hub);
  // corner studs
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const s = new THREE.SphereGeometry(0.1, 12, 8);
      s.translate(bx + sx * (w / 2 - t / 2), by + sy * (h / 2 - t / 2), front - 0.34);
      brass.add(s);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Directional signs hanging in the three arch reveals
// ---------------------------------------------------------------------------------------------
export function makeSignAtlas(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 768;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const labels = ['PLATFORMS 1 · 2', 'PLATFORMS 3 · 4', 'PLATFORMS 5 · 6'];
  labels.forEach((txt, i) => {
    const y = i * 256;
    g.fillStyle = '#0d0b09';
    g.fillRect(0, y, 1024, 256);
    g.strokeStyle = '#c9a24e';
    g.lineWidth = 5;
    g.strokeRect(12, y + 14, 1000, 228);
    g.lineWidth = 2;
    g.strokeRect(24, y + 26, 976, 204);
    g.fillStyle = '#f2e3bd';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 96px "Didot", "Bodoni 72", "Georgia", serif';
    g.fillText(txt, 512, y + 134);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

export function buildSigns(brass: GeoBag): THREE.BufferGeometry {
  // textured faces (double-sided: hall side faces -z, shed side faces +z), atlas row i -> arch i
  const soup = new Soup();
  const SW = 4.2;
  const SH = 1.05;
  const yc = 12.1;
  const zc = 100.8;
  ARCHES.centersX.forEach((cx, i) => {
    const v0 = 1 - (i + 1) / 3;
    const v1 = 1 - i / 3;
    for (const side of [-1, 1] as const) {
      const z = zc + side * 0.045;
      const n = v3(0, 0, side);
      // facing -z (hall): u increases toward -x?  viewer looks +z, so screen-right is -x.
      const xr = side < 0 ? -1 : 1;
      const p = (u: number, v: number): THREE.Vector3 => v3(cx + xr * (u - 0.5) * SW * 1, yc + (v - 0.5) * SH, z);
      soup.quad(p(0, 0), p(1, 0), p(1, 1), p(0, 1), n, n, n, n, [0, v0], [1, v0], [1, v1], [0, v1]);
    }
    // frame + hanging rods
    const fr = 0.07;
    const ext = 0.07;
    brass.add(boxMM(cx - SW / 2 - ext, yc - SH / 2 - ext, zc - 0.035, cx + SW / 2 + ext, yc - SH / 2, zc + 0.035));
    brass.add(boxMM(cx - SW / 2 - ext, yc + SH / 2, zc - 0.035, cx + SW / 2 + ext, yc + SH / 2 + ext, zc + 0.035));
    brass.add(boxMM(cx - SW / 2 - ext, yc - SH / 2, zc - 0.035, cx - SW / 2, yc + SH / 2, zc + 0.035));
    brass.add(boxMM(cx + SW / 2, yc - SH / 2, zc - 0.035, cx + SW / 2 + ext, yc + SH / 2, zc + 0.035));
    // black enamel edge so the thin slab reads as an object
    for (const sx of [-1, 1]) {
      const rod = new THREE.CylinderGeometry(0.016, 0.016, 2.4, 8);
      rod.translate(cx + sx * (SW / 2 - 0.5), yc + SH / 2 + 1.2 + ext, zc);
      brass.add(rod);
      const cap = new THREE.SphereGeometry(0.045, 10, 8);
      cap.translate(cx + sx * (SW / 2 - 0.5), yc + SH / 2 + ext + 0.02, zc);
      brass.add(cap);
    }
    void fr;
  });
  return soup.build();
}

// ---------------------------------------------------------------------------------------------
// Brass stanchions with velvet ropes
// ---------------------------------------------------------------------------------------------
export function buildStanchions(brass: GeoBag, rope: GeoBag): void {
  const post: P2[] = [
    [0.0, 0.0], [0.19, 0.0], [0.19, 0.025], [0.15, 0.045], [0.1, 0.06], [0.05, 0.1], [0.026, 0.16], [0.022, 0.3],
    [0.034, 0.34], [0.022, 0.38], [0.022, 0.78], [0.04, 0.82], [0.05, 0.9], [0.055, 0.96], [0.04, 1.02], [0.0, 1.03],
  ];
  const pg = latheMeters(post, 20, 1, 1);
  for (const p of STANCHION_POSTS) brass.add(pg, new THREE.Matrix4().makeTranslation(p.x, 0, p.z), 'keep');
  // ropes between consecutive posts of a group
  for (let i = 0; i + 1 < STANCHION_POSTS.length; i++) {
    const a = STANCHION_POSTS[i]!;
    const b = STANCHION_POSTS[i + 1]!;
    if (a.group !== b.group) continue;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      pts.push(v3(a.x + (b.x - a.x) * t, 0.9 - 0.12 * 4 * t * (1 - t), a.z + (b.z - a.z) * t));
    }
    rope.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.022, 6, false), undefined, 'keep');
  }
}
