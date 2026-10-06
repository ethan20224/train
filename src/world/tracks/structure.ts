import * as THREE from 'three';
import type { OverpassInfo, TrackGraph } from '../../tracks/graph';
import { GeoAcc, stations, type Station } from './sweep';

/**
 * Stone embankment + viaduct + iron girder spans for every elevated path (the goods-line flyover).
 * Cross-section (lateral, up) is a trough: parapet walls either side of the ballast bed.
 */
const GROUND = -1.62;
const HALF_OUT = 2.6;
const HALF_IN = 2.3;
const PARAPET = 0.36; // above ballast top (rail top - 0.26)
const SOFFIT = 1.25; // deck thickness below the trough floor
const VIADUCT_H = 2.6; // above this height the embankment becomes a viaduct on piers
const PIER_PITCH = 20;

export interface StructureGeo {
  stone: THREE.BufferGeometry | null;
  iron: THREE.BufferGeometry | null;
}

export function buildStructures(g: TrackGraph): StructureGeo {
  const stone = new GeoAcc();
  const iron = new GeoAcc();
  // ground-level lines (for pier clearance)
  const ground: { x: number; z: number }[] = [];
  for (const d of g.paths) {
    if (d.path.ramps.length > 0) continue;
    for (let s = 0; s <= d.path.length; s += 2) {
      const p = d.path.poseAt(s);
      if (p.z > 380 && p.z < 1450) ground.push({ x: p.x, z: p.z });
    }
  }
  const clear = (x: number, z: number, r: number): boolean => {
    for (const q of ground) if ((q.x - x) ** 2 + (q.z - z) ** 2 < r * r) return false;
    return true;
  };

  for (const d of g.paths) {
    if (d.path.ramps.length === 0) continue;
    const path = d.path;
    const hAt = (s: number): number => path.yAt(s) - (-1.1);
    // elevated span where the rail is more than 0.2 m above ground level
    let a = -1;
    for (let s = 0; s <= path.length; s += 1) if (hAt(s) > 0.2) {
      a = s;
      break;
    }
    if (a < 0) continue;
    const b = path.length;
    const st = stations(path, a, b, 6, 3);
    // piece boundaries (where the type switches embankment <-> viaduct)
    let i0 = 0;
    const isVia = (s: Station): boolean => s.y + 1.1 > VIADUCT_H;
    for (let i = 1; i <= st.length; i++) {
      if (i === st.length || isVia(st[i]!) !== isVia(st[i0]!)) {
        const seg = st.slice(i0, Math.min(st.length, i + 1));
        const via = isVia(st[i0]!);
        const profile: [number, number][] = [];
        // trough polygon relative to the station y (rail top): lateral, up
        if (via) {
          profile.push([-HALF_OUT, -0.3 - SOFFIT], [HALF_OUT, -0.3 - SOFFIT], [HALF_OUT, -0.26 + PARAPET], [HALF_IN, -0.26 + PARAPET], [HALF_IN, -0.3], [-HALF_IN, -0.3], [-HALF_IN, -0.26 + PARAPET], [-HALF_OUT, -0.26 + PARAPET]);
          stone.sweep(seg, profile, 0, 0, true);
        } else {
          for (let k = 0; k + 1 < seg.length; k++) {
            const s0 = seg[k]!;
            const s1 = seg[k + 1]!;
            const P = (s: Station, lat: number, y: number): THREE.Vector3 => new THREE.Vector3(s.x + Math.cos(s.h) * lat, y, s.z - Math.sin(s.h) * lat);
            const top0 = s0.y - 0.26 + PARAPET;
            const top1 = s1.y - 0.26 + PARAPET;
            const flo0 = s0.y - 0.3;
            const flo1 = s1.y - 0.3;
            const gb = GROUND - 0.15;
            // outer faces (normal pointing outward, i.e. +right for the right wall)
            stone.quad(P(s0, HALF_OUT, gb), P(s0, HALF_OUT, top0), P(s1, HALF_OUT, top1), P(s1, HALF_OUT, gb));
            stone.quad(P(s0, -HALF_OUT, gb), P(s1, -HALF_OUT, gb), P(s1, -HALF_OUT, top1), P(s0, -HALF_OUT, top0));
            // parapet tops
            stone.quad(P(s0, HALF_IN, top0), P(s1, HALF_IN, top1), P(s1, HALF_OUT, top1), P(s0, HALF_OUT, top0));
            stone.quad(P(s0, -HALF_OUT, top0), P(s1, -HALF_OUT, top1), P(s1, -HALF_IN, top1), P(s0, -HALF_IN, top0));
            // inner faces
            stone.quad(P(s0, HALF_IN, flo0), P(s1, HALF_IN, flo1), P(s1, HALF_IN, top1), P(s0, HALF_IN, top0));
            stone.quad(P(s0, -HALF_IN, flo0), P(s0, -HALF_IN, top0), P(s1, -HALF_IN, top1), P(s1, -HALF_IN, flo1));
            // trough floor
            stone.quad(P(s0, -HALF_IN, flo0), P(s1, -HALF_IN, flo1), P(s1, HALF_IN, flo1), P(s0, HALF_IN, flo0));
          }
        }
        i0 = i;
      }
    }
    // abutment at the start of the embankment and where it becomes a viaduct
    const startS = st[0]!;
    void startS;
    // piers (viaduct only) every PIER_PITCH m, nudged away from lines on the ground
    let sFirst = -1;
    for (let s = a; s <= b; s += 1) if (hAt(s) > VIADUCT_H) {
      sFirst = s;
      break;
    }
    if (sFirst >= 0) {
      const abut = path.poseAt(sFirst);
      stone.box(abut.x, (GROUND + path.yAt(sFirst) - 0.3 - SOFFIT) / 2, abut.z, HALF_OUT, (path.yAt(sFirst) - 0.3 - SOFFIT - GROUND) / 2, 1.2, abut.h);
      for (let s = sFirst + PIER_PITCH; s < b - 6; s += PIER_PITCH) {
        let best = -1;
        for (const dd of [0, 2, -2, 4, -4, 6, -6, 8, -8]) {
          const ss = s + dd;
          const p = path.poseAt(ss);
          if (clear(p.x, p.z, 4.2)) {
            best = ss;
            break;
          }
        }
        if (best < 0) continue; // clear span over a crossing line
        const p = path.poseAt(best);
        const top = path.yAt(best) - 0.3 - SOFFIT;
        const hgt = top - GROUND;
        if (hgt < 0.5) continue;
        stone.box(p.x, GROUND + hgt / 2, p.z, 1.45, hgt / 2, 0.8, p.h);
        stone.box(p.x, top - 0.18, p.z, 2.1, 0.18, 1.1, p.h); // cap
        stone.box(p.x, GROUND + 0.35, p.z, 1.7, 0.35, 1.0, p.h); // plinth
      }
    }
  }
  // iron plate girders flanking the deck over every line it crosses
  const bridges: OverpassInfo[] = g.overpasses;
  for (const o of bridges) {
    const d = g.pathById(o.over);
    if (d.path.ramps.length === 0) continue;
    const s0 = Math.max(0, o.overS - 20);
    const s1 = Math.min(d.path.length, o.overS + 20);
    const st = stations(d.path, s0, s1, 4, 2);
    for (const sd of [-1, 1]) {
      for (let k = 0; k + 1 < st.length; k++) {
        const A = st[k]!;
        const B = st[k + 1]!;
        const lat = sd * (HALF_OUT + 0.06);
        const P = (s: Station, y: number): THREE.Vector3 => new THREE.Vector3(s.x + Math.cos(s.h) * lat, y, s.z - Math.sin(s.h) * lat);
        const yt = (s: Station): number => s.y - 0.26 + PARAPET + 0.04;
        const yb = (s: Station): number => s.y - 0.3 - SOFFIT - 0.35;
        if (sd > 0) iron.quad(P(A, yb(A)), P(A, yt(A)), P(B, yt(B)), P(B, yb(B)));
        else iron.quad(P(A, yb(A)), P(B, yb(B)), P(B, yt(B)), P(A, yt(A)));
      }
      // flanges
      for (let k = 0; k < st.length; k++) {
        const A = st[k]!;
        iron.box(A.x + Math.cos(A.h) * sd * (HALF_OUT + 0.18), A.y - 0.3 - SOFFIT - 0.38, A.z - Math.sin(A.h) * sd * (HALF_OUT + 0.18), 0.2, 0.05, 2.2, A.h);
        if (k % 2 === 0) iron.box(A.x + Math.cos(A.h) * sd * (HALF_OUT + 0.1), A.y - 0.3 - SOFFIT / 2 + 0.15, A.z - Math.sin(A.h) * sd * (HALF_OUT + 0.1), 0.06, SOFFIT / 2 + 0.2, 0.1, A.h);
      }
    }
  }
  return { stone: stone.empty ? null : stone.toGeometry(), iron: iron.empty ? null : iron.toGeometry() };
}
