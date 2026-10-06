import * as THREE from 'three';
import type { TrackGraph } from '../../tracks/graph';

export interface SleeperSet {
  /** Instance matrices (unit-length box along local x: scale x = length). */
  matrices: THREE.Matrix4[];
}

interface Pt {
  x: number;
  z: number;
  y: number;
  path: number;
}
interface Sl {
  x: number;
  z: number;
  c: number;
  s: number;
  hl: number;
  y: number;
}

/**
 * Timber sleepers along every path inside `maxDist` of (cx, cz). Where tracks run close together (pointwork) the
 * sleepers of the higher-priority path are lengthened to span both, and sleepers of the other path that would sit
 * inside them are dropped, so there is no interpenetrating timber.
 */
export function buildSleepers(g: TrackGraph, opts: { cx: number; cz: number; maxDist: number; zMin: number; spacing: number; halfLen: number; halfWidth: number; yBase: number }): SleeperSet {
  const cell = 4;
  const key = (cx: number, cz: number): string => `${cx},${cz}`;
  const pts = new Map<string, Pt[]>();
  const order = g.paths.map((_, i) => i).sort((a, b) => g.paths[a]!.rank - g.paths[b]!.rank || a - b);
  // centreline samples (1 m) for neighbour queries
  g.paths.forEach((d, pi) => {
    for (let s = 0; s <= d.path.length; s += 1) {
      const p = d.path.poseAt(s);
      if (Math.hypot(p.x - opts.cx, p.z - opts.cz) > opts.maxDist + 10) continue;
      const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
      const arr = pts.get(k) ?? [];
      arr.push({ x: p.x, z: p.z, y: d.path.yAt(s), path: pi });
      pts.set(k, arr);
    }
  });
  const placed = new Map<string, Sl[]>();
  const matrices: THREE.Matrix4[] = [];
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const pi of order) {
    const d = g.paths[pi]!;
    const path = d.path;
    for (let s = 0.3; s < path.length; s += opts.spacing) {
      const p = path.poseAt(s);
      if (p.z < opts.zMin) continue;
      if (Math.hypot(p.x - opts.cx, p.z - opts.cz) > opts.maxDist) continue;
      const y = path.yAt(s);
      const c = Math.cos(p.h);
      const sn = Math.sin(p.h);
      // right = (cos h, -sin h), forward = (sin h, cos h)
      // already covered by a higher-priority sleeper? (centre inside its footprint)
      let covered = false;
      const cx0 = Math.floor((p.x - 4) / cell);
      const cx1 = Math.floor((p.x + 4) / cell);
      const cz0 = Math.floor((p.z - 4) / cell);
      const cz1 = Math.floor((p.z + 4) / cell);
      for (let a = cx0; a <= cx1 && !covered; a++) {
        for (let b = cz0; b <= cz1 && !covered; b++) {
          for (const o of placed.get(key(a, b)) ?? []) {
            if (Math.abs(o.y - y) > 0.5) continue;
            const dx = p.x - o.x;
            const dz = p.z - o.z;
            const lat = dx * o.c - dz * o.s;
            const alo = dx * o.s + dz * o.c;
            if (Math.abs(lat) < o.hl + 0.05 && Math.abs(alo) < opts.halfWidth * 2.2) covered = true;
          }
        }
      }
      if (covered) continue;
      // neighbours abeam within 3.4 m: lengthen toward them
      let eR = 0;
      let eL = 0;
      for (let a = cx0; a <= cx1; a++) {
        for (let b = cz0; b <= cz1; b++) {
          for (const n of pts.get(key(a, b)) ?? []) {
            if (n.path === pi || Math.abs(n.y - y) > 0.5) continue;
            const dx = n.x - p.x;
            const dz = n.z - p.z;
            const lat = dx * c - dz * sn;
            const alo = dx * sn + dz * c;
            if (Math.abs(alo) > 1.2) continue;
            if (lat > 0.3 && lat < 3.4) eR = Math.max(eR, lat);
            else if (lat < -0.3 && lat > -3.4) eL = Math.max(eL, -lat);
          }
        }
      }
      const left = opts.halfLen + eL;
      const right = opts.halfLen + eR;
      const hl = (left + right) / 2;
      const shift = (right - left) / 2;
      const sx = p.x + c * shift;
      const sz = p.z - sn * shift;
      const rec: Sl = { x: sx, z: sz, c, s: sn, hl, y };
      const k = key(Math.floor(sx / cell), Math.floor(sz / cell));
      const arr = placed.get(k) ?? [];
      arr.push(rec);
      placed.set(k, arr);
      q.setFromAxisAngle(up, p.h);
      pos.set(sx, y + opts.yBase + d.rank * 0.004, sz);
      scl.set(hl * 2, 1, 1);
      tmp.compose(pos, q, scl);
      matrices.push(tmp.clone());
    }
  }
  return { matrices };
}
