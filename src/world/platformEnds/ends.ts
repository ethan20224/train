import * as THREE from 'three';
import { ISLANDS, PLATFORM_END as PE } from '../../layout';
import { END_LAMPS } from './data';
import { at, ball, box, lathe, plate, strut, type Bags, type Geo } from './kit';
import type { EnamelAtlas } from './textures';

const IRON = 0x1f2822; // shed iron: green-black
const BLACK = 0x121416;
const BATTEN = 0x3b2d21;
const SLOPE = (PE.ramp.topY - PE.ramp.bottomY) / (PE.ramp.zMax - PE.ramp.zMin);
/** Ramp surface height at world z. */
const surfY = (z: number): number => PE.ramp.topY - SLOPE * (z - PE.ramp.zMin);

/** Wedge (profile in z/y) extruded across x in [x0, x1]. */
function wedge(x0: number, x1: number, zA: number, zB: number, yBot: number, yA: number, yB: number): Geo {
  const s = new THREE.Shape();
  s.moveTo(zA, yBot);
  s.lineTo(zB, yBot);
  s.lineTo(zB, yB);
  s.lineTo(zA, yA);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // local x -> world z, local depth -> -x
  g.translate(x1, 0, 0);
  return g;
}

/** Staff ramp, locked gate, end railing, enamel plates and the end lamp standards for every island. */
export function buildEnds(b: Bags, atlas: EnamelAtlas): void {
  const { ramp } = PE;
  const hw = ramp.width / 2;
  const railZ = PE.endZ - 0.22; // 379.78: just beyond the 4D barrier run and nav limit
  const GROUND = -1.75;

  for (const isl of ISLANDS) {
    const cx = isl.centerX;

    // ------------------------------------------------------------------------------------ ramp body
    b.stone.add(wedge(cx - hw, cx + hw, ramp.zMin, ramp.zMax, GROUND, ramp.topY, ramp.bottomY));
    // parapet walls (follow the slope, 0.3 above the surface)
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? cx - hw - 0.2 : cx + hw;
      b.stone.add(wedge(x0, x0 + 0.2, ramp.zMin, ramp.zMax, GROUND, ramp.topY + 0.3, ramp.bottomY + 0.3));
      // coping stone
      b.stone.add(wedge(x0 - 0.02, x0 + 0.22, ramp.zMin, ramp.zMax, ramp.bottomY + 0.3, ramp.topY + 0.36, ramp.bottomY + 0.36), 0xcfc5b2);
      // handrail posts + two sloping rails
      const px = x0 + 0.1;
      for (const z of [380.3, 382.4, 384.5, 386.6, 387.85]) b.paint.add(box(px - 0.025, px + 0.025, surfY(z) + 0.3, surfY(z) + 1.02, z - 0.025, z + 0.025), IRON);
      b.paint.add(strut([px, surfY(380.2) + 1.0, 380.2], [px, surfY(387.9) + 1.0, 387.9], 0.045), IRON);
      b.paint.add(strut([px, surfY(380.2) + 0.66, 380.2], [px, surfY(387.9) + 0.66, 387.9], 0.03), IRON);
    }
    // timber non-slip battens across the surface
    const ang = Math.atan(SLOPE);
    for (let z = 380.45; z < ramp.zMax - 0.1; z += 0.45) {
      const g = new THREE.BoxGeometry(ramp.width - 0.1, 0.03, 0.07);
      g.rotateX(ang);
      b.paint.add(g, BATTEN, at(cx, surfY(z) + 0.012, z));
    }
    // two stone steps down from the ramp foot
    b.stone.add(box(cx - hw, cx + hw, GROUND, -1.4, ramp.zMax, ramp.zMax + 0.5));

    // ------------------------------------------------------------------------------------ end railing
    const segs: [number, number][] = [
      [isl.xMin + 0.45, cx - 0.9],
      [cx + 0.9, isl.xMax - 0.45],
    ];
    for (const [x0, x1] of segs) {
      const len = x1 - x0;
      const nPost = Math.max(2, Math.round(len / 1.2) + 1);
      b.paint.add(box(x0, x1, 1.05, 1.11, railZ - 0.035, railZ + 0.035), IRON);
      b.paint.add(box(x0, x1, 0.6, 0.65, railZ - 0.03, railZ + 0.03), IRON);
      b.paint.add(box(x0, x1, 0.12, 0.17, railZ - 0.03, railZ + 0.03), IRON);
      for (let i = 0; i < nPost; i++) {
        const x = x0 + (len * i) / (nPost - 1);
        b.paint.add(box(x - 0.045, x + 0.045, -0.05, 1.14, railZ - 0.045, railZ + 0.045), IRON);
        b.brass.add(ball(0.05, x, 1.2, railZ, 12));
      }
      // fine balusters between the posts
      const nb = Math.floor(len / 0.24);
      for (let i = 1; i < nb; i++) {
        const x = x0 + (len * i) / nb;
        b.paint.add(box(x - 0.011, x + 0.011, 0.12, 1.05, railZ - 0.011, railZ + 0.011), IRON);
      }
      // PASSENGERS MUST NOT CROSS THE LINE plate on the south face of the railing
      const px = (x0 + x1) / 2;
      b.paint.add(box(px - 0.43, px + 0.43, 0.66, 1.07, railZ - 0.058, railZ - 0.035), BLACK);
      b.enamel.add(plate(0.8, 0.4, atlas.crossLine, px, 0.865, railZ - 0.06, Math.PI));
    }

    // ------------------------------------------------------------------------------------ locked gate
    for (const s of [-1, 1]) {
      const px = cx + s * 0.9;
      b.paint.add(box(px - 0.09, px + 0.09, -0.05, 2.0, railZ - 0.09, railZ + 0.09), BLACK);
      b.paint.add(box(px - 0.12, px + 0.12, 1.9, 1.98, railZ - 0.12, railZ + 0.12), BLACK);
      b.brass.add(ball(0.075, px, 2.07, railZ, 16));
      // leaf: frame + bars + spear tops
      const lx0 = s < 0 ? cx - 0.8 : cx + 0.015;
      const lx1 = s < 0 ? cx - 0.015 : cx + 0.8;
      b.paint.add(box(lx0, lx1, 1.82, 1.9, railZ - 0.025, railZ + 0.025), BLACK);
      b.paint.add(box(lx0, lx1, 1.02, 1.07, railZ - 0.025, railZ + 0.025), BLACK);
      b.paint.add(box(lx0, lx1, 0.12, 0.2, railZ - 0.025, railZ + 0.025), BLACK);
      const nBars = 7;
      for (let i = 0; i <= nBars; i++) {
        const x = lx0 + 0.02 + ((lx1 - lx0 - 0.04) * i) / nBars;
        b.paint.add(box(x - 0.012, x + 0.012, 0.12, 1.88, railZ - 0.012, railZ + 0.012), BLACK);
        const spear = new THREE.ConeGeometry(0.022, 0.09, 4);
        b.paint.add(spear, BLACK, at(x, 1.945, railZ));
      }
    }
    // padlock, hasp and a hanging chain
    b.brass.add(box(cx - 0.04, cx + 0.04, 0.76, 0.86, railZ - 0.06, railZ - 0.03));
    b.brass.add(box(cx - 0.03, cx + 0.03, 0.86, 0.92, railZ - 0.055, railZ - 0.04));
    for (let i = 0; i < 6; i++) {
      const t = new THREE.TorusGeometry(0.02, 0.005, 5, 10);
      t.rotateY(i % 2 ? 0 : Math.PI / 2);
      const x = cx - 0.2 + i * 0.08;
      b.brass.add(t, 0xffffff, at(x, 0.93 - 0.05 * Math.sin((i / 5) * Math.PI), railZ - 0.045));
    }
    // AUTHORISED PERSONNEL ONLY plate across the gate
    b.paint.add(box(cx - 0.66, cx + 0.66, 1.1, 1.78, railZ - 0.058, railZ - 0.035), BLACK);
    b.enamel.add(plate(1.3, 0.65, atlas.personnel, cx, 1.44, railZ - 0.06, Math.PI));
  }

  // ---------------------------------------------------------------------------------------- end lamp standards
  const lampProfile: [number, number][] = [[0.001, 0], [0.24, 0], [0.24, 0.12], [0.16, 0.2], [0.1, 0.45], [0.07, 0.9], [0.055, 1.0], [0.055, 3.5], [0.09, 3.55], [0.09, 3.65], [0.05, 3.7], [0.001, 3.7]];
  for (const l of END_LAMPS) {
    const m = at(l.x, 0, l.z);
    b.paint.add(lathe(lampProfile, 14), IRON, m);
    b.paint.add(lathe([[0.15, 3.75], [0.15, 3.82], [0.001, 3.82]], 14), IRON, m);
    b.paint.add(lathe([[0.001, 4.3], [0.2, 4.3], [0.1, 4.45], [0.001, 4.62]], 14), IRON, m);
    b.lens.add(new THREE.SphereGeometry(0.26, 16, 10).translate(0, 4.05, 0), 0xffe2b6, m, 2.4);
  }
}
