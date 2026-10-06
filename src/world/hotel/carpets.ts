import * as THREE from 'three';
import { STAIR } from '../../layout';
import { RUNNERS, type Rug } from './layoutData';
import type { RugAtlas } from './textures';

/** Carpets: Persian rugs (atlas cells), the long runners, and the stair runner that joins them. All lifted 7-8 mm. */

const LIFT = 0.008;
const RUNNER_PERIOD_M = 6.0;

export function rugGeometry(rugs: readonly Rug[], atlas: RugAtlas): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const r of rugs) {
    const c = atlas.cell[r.cell];
    const y = r.level + 0.007;
    const x0 = r.x - r.w / 2;
    const x1 = r.x + r.w / 2;
    const z0 = r.z - r.l / 2;
    const z1 = r.z + r.l / 2;
    const base = pos.length / 3;
    // portrait cells: v runs along z; the landscape big rug: u along x
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    uv.push(c.u0, c.v0, c.u1, c.v0, c.u1, c.v1, c.u0, c.v1);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array<number>((pos.length / 3) * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

/** Stepped stair carpet (tread + riser per step) plus the balcony landing strip; returns geometry and the v reached. */
function stairRunner(width: number): { positions: number[]; uvs: number[]; index: number[]; v: number } {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const hw = width / 2;
  let v = 0;
  const quad = (a: [number, number], b: [number, number]): void => {
    // a, b = (y, z) of two path points; strip across x
    const base = pos.length / 3;
    const dv = Math.hypot(b[0] - a[0], b[1] - a[1]) / RUNNER_PERIOD_M;
    pos.push(-hw, a[0], a[1], hw, a[0], a[1], hw, b[0], b[1], -hw, b[0], b[1]);
    uv.push(0, v, 1, v, 1, v + dv, 0, v + dv);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    v += dv;
  };
  // landing strip a short landing before the stair (the balcony rug by the doors stays out of the start view) to the first riser
  quad([STAIR.topY + LIFT, 7.0], [STAIR.topY + LIFT, STAIR.zMin + 0.045]);
  for (let k = 0; k < STAIR.risers; k++) {
    const z = STAIR.zMin + STAIR.treadDepth * k + 0.045;
    const top = STAIR.topY - STAIR.riserHeight * (k + 1) + LIFT;
    // riser (rises from this tread up to the previous one), then the tread
    quad([top + STAIR.riserHeight, z], [top, z]);
    if (k < STAIR.risers - 1) quad([top, z], [top, z + STAIR.treadDepth]);
  }
  return { positions: pos, uvs: uv, index: idx, v };
}

/** Runner geometry (stair carpet + hall runners) with uv.v in repeats of the 6 m texture period. */
export function runnerGeometry(): THREE.BufferGeometry {
  const st = stairRunner(3.0);
  const pos = st.positions.slice();
  const uv = st.uvs.slice();
  const idx = st.index.slice();
  let vStart = st.v;
  for (const [i, r] of RUNNERS.entries()) {
    const base = pos.length / 3;
    const hw = r.width / 2;
    const z0 = i === 0 ? STAIR.zMin + STAIR.treadDepth * (STAIR.risers - 1) + 0.045 : r.z0;
    const v0 = i === 0 ? vStart : 0;
    const v1 = v0 + (r.z1 - z0) / RUNNER_PERIOD_M;
    pos.push(r.x - hw, LIFT, z0, r.x + hw, LIFT, z0, r.x + hw, LIFT, r.z1, r.x - hw, LIFT, r.z1);
    uv.push(0, v0, 1, v0, 1, v1, 0, v1);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    vStart = v1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // computeVertexNormals follows winding; force every vertex normal toward the carpet's visible side
  return g;
}
