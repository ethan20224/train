import * as THREE from 'three';
import type { TrackPath } from '../../tracks/geom';

export interface Station {
  x: number;
  z: number;
  y: number;
  h: number;
}

/** Stations along a path between s0 and s1 (inclusive ends); fine steps on curves / ramps, coarse on plain straights. */
export function stations(path: TrackPath, s0: number, s1: number, stepStraight: number, stepCurve: number): Station[] {
  const out: Station[] = [];
  const cuts = new Set<number>([s0, s1]);
  for (const b of path.breakpoints()) if (b > s0 + 1e-6 && b < s1 - 1e-6) cuts.add(b);
  for (const r of path.ramps) {
    for (const b of [r.s0, r.s0 + r.blend, r.s1 - r.blend, r.s1]) if (b > s0 + 1e-6 && b < s1 - 1e-6) cuts.add(b);
  }
  const list = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i]!;
    const b = list[i + 1]!;
    const mid = (a + b) / 2;
    const curved = Math.abs(path.curvatureAt(mid)) > 1e-9;
    const ramp = Math.abs(path.slopeAt(mid)) > 1e-9;
    const step = curved || ramp ? stepCurve : stepStraight;
    const n = Math.max(1, Math.ceil((b - a) / step));
    for (let k = 0; k < n; k++) {
      const s = a + ((b - a) * k) / n;
      const p = path.poseAt(s);
      out.push({ x: p.x, z: p.z, y: path.yAt(s), h: p.h });
    }
  }
  const pe = path.poseAt(s1);
  out.push({ x: pe.x, z: pe.z, y: path.yAt(s1), h: pe.h });
  return out;
}

export class GeoAcc {
  pos: number[] = [];
  nor: number[] = [];
  idx: number[] = [];
  col: number[] = [];
  /** Current vertex colour (written for every vertex when `useColor`). */
  color: [number, number, number] = [1, 1, 1];
  useColor = false;

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    if (this.useColor) this.col.push(this.color[0], this.color[1], this.color[2]);
    return this.pos.length / 3 - 1;
  }

  /** Sweep a profile (lateral, up) along stations. `skip`: profile segment indices that are not drawn. Flat shaded per segment. */
  sweep(st: Station[], profile: readonly (readonly [number, number])[], lateral: number, yOff: number, closed = true, skip: ReadonlySet<number> = new Set()): void {
    const nSeg = closed ? profile.length : profile.length - 1;
    for (let j = 0; j < nSeg; j++) {
      if (skip.has(j)) continue;
      const p0 = profile[j]!;
      const p1 = profile[(j + 1) % profile.length]!;
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      const nl = dy / l;
      const nu = -dx / l;
      let prevA = -1;
      let prevB = -1;
      for (const s of st) {
        const rx = Math.cos(s.h);
        const rz = -Math.sin(s.h);
        const la = lateral + p0[0];
        const lb = lateral + p1[0];
        const nx = rx * nl;
        const nz = rz * nl;
        const a = this.vertex(s.x + rx * la, s.y + yOff + p0[1], s.z + rz * la, nx, nu, nz);
        const b = this.vertex(s.x + rx * lb, s.y + yOff + p1[1], s.z + rz * lb, nx, nu, nz);
        if (prevA >= 0) this.idx.push(prevA, prevB, b, prevA, b, a);
        prevA = a;
        prevB = b;
      }
    }
  }

  /** Axis-oriented box (centre, half extents, yaw about Y). */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const faces: [number[], number[]][] = [
      [[1, 0, 0], [0, 1, 0]],
      [[-1, 0, 0], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0]],
      [[0, -1, 0], [1, 0, 0]],
      [[0, 0, 1], [1, 0, 0]],
      [[0, 0, -1], [1, 0, 0]],
    ];
    for (const [n, t] of faces) {
      const nv = new THREE.Vector3(n[0]!, n[1]!, n[2]!);
      const tv = new THREE.Vector3(t[0]!, t[1]!, t[2]!);
      const bv = new THREE.Vector3().crossVectors(nv, tv);
      const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const ids: number[] = [];
      for (const [a, b] of corners) {
        const lx = nv.x * hx + tv.x * a * hx + bv.x * b * hx;
        const ly = nv.y * hy + tv.y * a * hy + bv.y * b * hy;
        const lz = nv.z * hz + tv.z * a * hz + bv.z * b * hz;
        const wx = lx * c + lz * s;
        const wz = -lx * s + lz * c;
        const nwx = nv.x * c + nv.z * s;
        const nwz = -nv.x * s + nv.z * c;
        ids.push(this.vertex(cx + wx, cy + ly, cz + wz, nwx, nv.y, nwz));
      }
      // orientation: (a,b) corners are CCW around n when t x b = n; choose winding so the triangle normal matches n
      this.idx.push(ids[0]!, ids[1]!, ids[2]!, ids[0]!, ids[2]!, ids[3]!);
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const i0 = this.vertex(a.x, a.y, a.z, n.x, n.y, n.z);
    const i1 = this.vertex(b.x, b.y, b.z, n.x, n.y, n.z);
    const i2 = this.vertex(c.x, c.y, c.z, n.x, n.y, n.z);
    const i3 = this.vertex(d.x, d.y, d.z, n.x, n.y, n.z);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (this.useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}
