import * as THREE from 'three';
import type { BuildContext } from '../../core/types';
import { RAIL, TRACKS } from '../../layout';
import { BENCHES, CLOCK_XS, CLOCK_Z, LAMPS, SIGNS, SIGNAL_GANTRY_ZS } from './layoutData';
import { beam, box, finish, ironPaint, mesh, T, plain, zCylinder } from './common';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function signAtlas(): THREE.CanvasTexture {
  const cell = 256;
  const c = document.createElement('canvas');
  c.width = cell * 6;
  c.height = cell;
  const g = c.getContext('2d');
  if (!g) throw new Error('no 2d canvas');
  for (let n = 1; n <= 6; n++) {
    const x0 = (n - 1) * cell;
    g.fillStyle = '#0c1511';
    g.fillRect(x0, 0, cell, cell);
    g.strokeStyle = '#c99a3c';
    g.lineWidth = 6;
    g.strokeRect(x0 + 12, 12, cell - 24, cell - 24);
    g.lineWidth = 2;
    g.strokeRect(x0 + 24, 24, cell - 48, cell - 48);
    // Deco corner notches
    g.fillStyle = '#c99a3c';
    for (const [cx, cy] of [[12, 12], [cell - 12, 12], [12, cell - 12], [cell - 12, cell - 12]] as const) {
      g.beginPath();
      g.arc(x0 + cx, cy, 14, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c99a3c';
    g.font = '600 26px Didot, "Bodoni 72", Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('P L A T F O R M', x0 + cell / 2, 62);
    g.fillStyle = '#f1e6c8';
    g.font = '700 150px Didot, "Bodoni 72", Georgia, serif';
    g.fillText(String(n), x0 + cell / 2, 150);
    g.fillStyle = '#c99a3c';
    g.fillRect(x0 + 60, 222 - 10, cell - 120, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function clockDial(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (!g) throw new Error('no 2d canvas');
  const r = s / 2;
  g.fillStyle = '#c9a24a';
  g.beginPath();
  g.arc(r, r, r - 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f2ead6';
  g.beginPath();
  g.arc(r, r, r - 34, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1a1a18';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(r, r, r - 46, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#1a1a18';
  g.font = '600 52px Didot, "Bodoni 72", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    g.fillText(String(h), r + Math.sin(a) * (r - 96), r - Math.cos(a) * (r - 96));
  }
  for (let m = 0; m < 60; m++) {
    const a = (m / 60) * Math.PI * 2;
    const l = m % 5 === 0 ? 16 : 7;
    g.lineWidth = m % 5 === 0 ? 4 : 2;
    g.beginPath();
    g.moveTo(r + Math.sin(a) * (r - 48), r - Math.cos(a) * (r - 48));
    g.lineTo(r + Math.sin(a) * (r - 48 - l), r - Math.cos(a) * (r - 48 - l));
    g.stroke();
  }
  // 6:47 frozen.
  const hand = (ang: number, len: number, w: number): void => {
    g.lineWidth = w;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(r - Math.sin(ang) * 22, r + Math.cos(ang) * 22);
    g.lineTo(r + Math.sin(ang) * len, r - Math.cos(ang) * len);
    g.stroke();
  };
  hand(((6 + 47 / 60) / 12) * Math.PI * 2, r * 0.5, 14);
  hand((47 / 60) * Math.PI * 2, r * 0.76, 8);
  g.fillStyle = '#1a1a18';
  g.beginPath();
  g.arc(r, r, 12, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function lathe(pts: [number, number][], seg = 16): THREE.BufferGeometry {
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

export function buildFurniture(ctx: BuildContext): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'shedFurniture';
  const iron = ironPaint(ctx);
  const brass = ctx.materials.get('brass');
  type Key = 'iron' | 'brass' | 'opal' | 'wood' | 'panels' | 'dial' | 'red' | 'green';
  const acc: Record<Key, THREE.BufferGeometry[]> = { iron: [], brass: [], opal: [], wood: [], panels: [], dial: [], red: [], green: [] };
  /** Bake instances into static merged geometry (one draw call per material). */
  const bake = (k: Key, geos: THREE.BufferGeometry[], mats: THREE.Matrix4[]): void => {
    for (const m of mats) for (const g of geos) acc[k].push(plain(g.clone()).applyMatrix4(m));
  };

  // --- lamp standards ------------------------------------------------------------------------------------
  const lp: THREE.BufferGeometry[] = [
    lathe([[0.001, 0], [0.24, 0], [0.24, 0.12], [0.16, 0.2], [0.1, 0.45], [0.07, 0.9], [0.055, 1.0], [0.055, 3.5], [0.09, 3.55], [0.09, 3.65], [0.05, 3.7], [0.001, 3.7]], 14),
  ];
  const globe: THREE.BufferGeometry[] = [];
  const g0 = new THREE.SphereGeometry(0.26, 16, 10);
  g0.translate(0, 4.05, 0);
  globe.push(g0);
  lp.push(lathe([[0.001, 4.3], [0.2, 4.3], [0.1, 4.45], [0.001, 4.62]], 14));
  lp.push(lathe([[0.15, 3.75], [0.15, 3.82], [0.001, 3.82]], 14));
  for (const s of [-1, 1]) {
    // curved arms carrying small globes over the tracks side
    lp.push(beam([s * 0.05, 3.62], [s * 0.45, 3.9], 0.045, 0.045, 0, 0.0));
    lp.push(beam([s * 0.45, 3.9], [s * 0.72, 3.78], 0.04, 0.04, 0, 0.0));
    const gs = new THREE.SphereGeometry(0.16, 12, 8);
    gs.translate(s * 0.72, 3.62, 0);
    globe.push(gs);
  }
  const lampMats = LAMPS.map((l) => T(l.x, 0, l.z));
  bake('iron', lp, lampMats);
  const opal = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffc888, emissiveIntensity: 2.6, roughness: 0.35 });
  bake('opal', globe, lampMats);

  // --- platform signs ------------------------------------------------------------------------------------
  const atlas = signAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.45, metalness: 0.1 });
  const posts: THREE.BufferGeometry[] = [];
  posts.push(box(-0.04, 0.04, 0, 3.15, -0.04, 0.04));
  posts.push(box(-0.12, 0.12, 0, 0.1, -0.12, 0.12));
  posts.push(box(-0.07, 0.07, 3.1, 3.2, -0.07, 0.07));
  const panel = (n: number): THREE.BufferGeometry => {
    const gs: THREE.BufferGeometry[] = [];
    for (const f of [1, -1]) {
      const p = new THREE.PlaneGeometry(1.0, 1.0);
      const uv = p.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setX(i, (n - 1) / 6 + uv.getX(i) / 6);
      if (f < 0) p.rotateY(Math.PI);
      p.translate(0, 3.7, f * 0.045);
      gs.push(p);
    }
    const frame = box(-0.52, 0.52, 3.18, 3.22, -0.04, 0.04);
    return mergeNP([...gs, frame]);
  };
  bake('iron', posts, SIGNS.map((s) => T(s.x, 0, s.z)));
  // One instanced mesh per numeral (the atlas cell is baked into each panel's UVs).
  for (let n = 1; n <= 6; n++) {
    const list = SIGNS.filter((s) => s.number === n);
    if (list.length === 0) continue;
    const pg = panel(n);
    bake('panels', [pg], list.map((s) => T(s.x, 0, s.z)));
  }

  // --- benches -------------------------------------------------------------------------------------------
  const wood: THREE.BufferGeometry[] = [];
  const bi: THREE.BufferGeometry[] = [];
  for (const x of [-0.17, 0, 0.17]) wood.push(box(x - 0.075, x + 0.075, 0.44, 0.48, -0.9, 0.9));
  for (const y of [0.66, 0.8, 0.94]) wood.push(box(-0.3, -0.26, y - 0.06, y + 0.06, -0.9, 0.9));
  for (const z of [-0.8, 0.8]) {
    bi.push(box(-0.28, 0.24, 0.4, 0.44, z - 0.04, z + 0.04));
    bi.push(box(0.16, 0.2, 0, 0.44, z - 0.04, z + 0.04));
    bi.push(box(-0.3, -0.26, 0, 1.02, z - 0.04, z + 0.04));
    bi.push(box(-0.3, 0.2, 0.62, 0.66, z - 0.045, z + 0.045));
    bi.push(box(-0.32, 0.3, 1.0, 1.05, z - 0.05, z + 0.05));
  }
  const bm = BENCHES.map((b) => T(b.x, 0, b.z, b.facing > 0 ? Math.PI : 0)); // local +x faces the track; rotate for +x-side benches
  bake('wood', wood, bm);
  bake('iron', bi, bm);

  // --- hanging four-faced clocks on projecting brackets (frozen 6:47) ------------------------------------
  const dial = clockDial();
  const dialMat = new THREE.MeshStandardMaterial({ map: dial, emissiveMap: dial, emissive: 0xffffff, emissiveIntensity: 0.16, roughness: 0.4 });
  const cb: THREE.BufferGeometry[] = [];
  const ci: THREE.BufferGeometry[] = [];
  const cy = 6.45;
  cb.push(box(-0.55, 0.55, cy - 0.55, cy + 0.55, -0.55, 0.55));
  cb.push(box(-0.62, 0.62, cy + 0.55, cy + 0.65, -0.62, 0.62));
  cb.push(box(-0.62, 0.62, cy - 0.65, cy - 0.55, -0.62, 0.62));
  const pyr = new THREE.ConeGeometry(0.62 * Math.SQRT2, 0.42, 4, 1);
  pyr.rotateY(Math.PI / 4);
  pyr.translate(0, cy + 0.86, 0);
  cb.push(pyr);
  const fin = new THREE.SphereGeometry(0.07, 10, 8);
  fin.translate(0, cy + 1.12, 0);
  cb.push(fin);
  ci.push(box(-0.025, 0.025, cy + 0.9, 7.55, -0.025, 0.025));
  ci.push(box(-0.07, 0.07, 7.5, 7.64, -0.07, 0.07));
  // arm from the wall (z = 102 face) with a diagonal brace
  const wallZ = CLOCK_Z - 102;
  ci.push(box(-0.05, 0.05, 7.56, 7.64, -wallZ, 0.05));
  ci.push(beam([0, 6.95], [0, 7.56], 0.001, 0.001, 0));
  const brace = beam([-0.5, 7.0], [-0.5, 7.0], 0.001, 0.001);
  void brace;
  const diag = new THREE.BoxGeometry(0.06, 0.06, Math.hypot(wallZ, 0.9));
  diag.rotateX(Math.atan2(0.9, wallZ));
  diag.translate(0, 7.1, -wallZ / 2);
  ci.push(diag);
  const faces: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const d = new THREE.CircleGeometry(0.46, 40);
    d.rotateY((k * Math.PI) / 2);
    const nx = Math.sin((k * Math.PI) / 2);
    const nz = Math.cos((k * Math.PI) / 2);
    d.translate(nx * 0.565, cy, nz * 0.565);
    faces.push(d);
  }
  const clockMats = CLOCK_XS.map((x) => T(x, 0, CLOCK_Z));
  bake('brass', cb, clockMats);
  bake('iron', ci, clockMats);
  bake('dial', faces, clockMats);

  // --- signal gantries beyond the shed (silhouettes in the haze) ----------------------------------------
  const gi: THREE.BufferGeometry[] = [];
  const topY = 8.6;
  const botY = 7.2;
  const nb = 16;
  const x0 = -31;
  const x1 = 31;
  for (const s of [-1, 1]) {
    gi.push(box(s * 31 - 0.3, s * 31 + 0.3, -1.4, topY + 0.2, -0.3, 0.3));
  }
  gi.push(box(x0, x1, topY - 0.08, topY + 0.08, -0.1, 0.1));
  gi.push(box(x0, x1, botY - 0.08, botY + 0.08, -0.1, 0.1));
  for (let i = 0; i < nb; i++) {
    const a = x0 + ((x1 - x0) * i) / nb;
    const b = x0 + ((x1 - x0) * (i + 1)) / nb;
    gi.push(beam(i % 2 ? [a, topY] : [a, botY], i % 2 ? [b, botY] : [b, topY], 0.07, 0.07));
    gi.push(box(a - 0.035, a + 0.035, botY, topY, -0.035, 0.035));
  }
  const lensR: THREE.BufferGeometry[] = [];
  const lensG: THREE.BufferGeometry[] = [];
  TRACKS.forEach((t, i) => {
    gi.push(box(t.centerX - 0.07, t.centerX + 0.07, 4.3, botY, -0.07, 0.07));
    gi.push(box(t.centerX - 0.3, t.centerX + 0.3, 4.4, 5.7, -0.1, 0.1));
    const red = new THREE.SphereGeometry(0.2, 12, 10);
    red.translate(t.centerX, 5.35, -0.14);
    const grn = new THREE.SphereGeometry(0.2, 12, 10);
    grn.translate(t.centerX, 4.75, -0.14);
    (i % 2 === 0 ? lensR : lensG).push(i % 2 === 0 ? red : grn);
  });
  const gm = SIGNAL_GANTRY_ZS.map((z) => T(0, 0, z));
  bake('iron', gi, gm);
  bake('red', lensR, gm);
  bake('green', lensG, gm);

  // --- buffer stops (iron frame, brass heads, Deco stepped crest, red lamp) -------------------------------
  const bz = RAIL.bufferStopZ;
  const bi2: THREE.BufferGeometry[] = [];
  const bb: THREE.BufferGeometry[] = [];
  bi2.push(box(-1.3, 1.3, -0.4, 0.35, bz - 0.12, bz + 0.3));
  for (const s of [-1, 1]) {
    bi2.push(box(s * 1.15 - 0.08, s * 1.15 + 0.08, -1.46, -0.4, bz - 0.12, bz + 0.2));
    bi2.push(box(s * 0.7 - 0.06, s * 0.7 + 0.06, -1.46, -0.4, bz - 0.1, bz + 0.1));
    bb.push(zCylinder(0.07, 0.4, s * 0.7, -0.02, bz + 0.45));
    bb.push(zCylinder(0.22, 0.07, s * 0.7, -0.02, bz + 0.66, 20));
    bb.push(zCylinder(0.15, 0.05, s * 0.7, -0.02, bz + 0.71, 20));
  }
  bb.push(box(-1.3, 1.3, 0.04, 0.12, bz + 0.29, bz + 0.33));
  bb.push(box(-0.8, 0.8, 0.35, 0.55, bz - 0.05, bz + 0.22));
  bb.push(box(-0.5, 0.5, 0.55, 0.72, bz - 0.02, bz + 0.18));
  bb.push(box(-0.22, 0.22, 0.72, 0.86, bz, bz + 0.15));
  bi2.push(box(-0.025, 0.025, 0.86, 1.2, bz + 0.03, bz + 0.09));
  const bufLamp = new THREE.SphereGeometry(0.12, 12, 8);
  bufLamp.translate(0, 1.32, bz + 0.06);
  const tm = TRACKS.map((t) => T(t.centerX, 0, 0));
  bake('iron', bi2, tm);
  bake('brass', bb, tm);
  bake('red', [bufLamp], tm);

  // (platform end railings now live in world/platformEnds/ends.ts, Phase 5A)

  // --- emit: one draw call per material ------------------------------------------------------------------
  root.add(mesh(finish(ctx, acc.iron, 'castIron'), iron, true));
  root.add(mesh(finish(ctx, acc.brass, 'brass'), brass, true));
  root.add(mesh(finish(ctx, acc.wood, 'wood'), ctx.materials.get('wood'), true));
  root.add(mesh(mergeNP(acc.opal), opal, false, false));
  root.add(mesh(mergeNP(acc.panels), signMat, true));
  root.add(mesh(mergeNP(acc.dial), dialMat, false));
  const red = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2a10, emissiveIntensity: 3.6 });
  const grn = new THREE.MeshStandardMaterial({ color: 0x002010, emissive: 0x30ff90, emissiveIntensity: 3 });
  root.add(mesh(mergeNP(acc.red), red, false, false));
  root.add(mesh(mergeNP(acc.green), grn, false, false));
  return root;
}


function mergeNP(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(gs.map(plain), false);
  if (!m) throw new Error('merge failed');
  m.computeBoundingSphere();
  return m;
}
