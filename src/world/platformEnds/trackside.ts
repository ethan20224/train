import * as THREE from 'three';
import { MIRRORS, STOP_BOARDS } from './data';
import { box, cyl, plate, type Bags } from './kit';
import type { EnamelAtlas } from './textures';

const BLACK = 0x121416;
const IRON = 0x1f2822;
const BED = -1.36;

/** Driver's convex dispatch mirrors on posts near each served edge, and STOP car-marker boards by each track. */
export function buildTrackside(b: Bags, atlas: EnamelAtlas): void {
  // ------------------------------------------------------------------------------------------ mirrors
  const R = 0.5; // sphere radius of curvature
  const rBase = 0.22;
  const theta = Math.asin(rBase / R);
  const lift = R * Math.cos(theta);
  const up = new THREE.Vector3(0, 1, 0);
  for (const m of MIRRORS) {
    const px = m.x;
    const pz = m.z;
    // post + foot
    b.paint.add(cyl(0.18, 0.05, px, 0, pz, 14), IRON);
    b.paint.add(cyl(0.05, 0.12, px, 0.05, pz, 12, 0.09), IRON);
    b.paint.add(cyl(0.032, 1.78, px, 0.15, pz, 10), IRON);
    b.paint.add(cyl(0.05, 0.05, px, 1.9, pz, 10), IRON);
    // mirror frame: local +y = mirror normal, aimed back toward the cab (-z) and a little across to the track
    const n = new THREE.Vector3(m.dir * 0.5, -0.04, -0.86).normalize();
    const xr = new THREE.Vector3().crossVectors(up, n).normalize();
    const zr = new THREE.Vector3().crossVectors(xr, n).normalize();
    // zr = xr x n -> points DOWN for horizontal n, so the visor goes on the local -z side
    const basis = new THREE.Matrix4().makeBasis(xr, n, zr);
    const placeM = new THREE.Matrix4().makeTranslation(px, 2.12, pz).multiply(basis);
    const back = new THREE.CylinderGeometry(rBase + 0.03, rBase + 0.03, 0.09, 28);
    back.translate(0, -0.055, 0);
    b.paint.add(back, BLACK, placeM);
    const rim = new THREE.TorusGeometry(rBase + 0.005, 0.016, 8, 28);
    rim.rotateX(Math.PI / 2);
    b.paint.add(rim, BLACK, placeM);
    // hood / visor: open half-tube over the top (local -z), extending forward of the glass
    const visor = new THREE.CylinderGeometry(rBase + 0.045, rBase + 0.045, 0.11, 24, 1, true, Math.PI / 2, Math.PI);
    visor.translate(0, 0.045, 0);
    b.paint.add(visor, BLACK, placeM);
    // the convex glass itself
    const cap = new THREE.SphereGeometry(R, 28, 6, 0, Math.PI * 2, 0, theta);
    cap.translate(0, -lift, 0);
    b.mirror.add(cap, 0xffffff, placeM);
    // collar joining post to housing
    b.paint.add(cyl(0.06, 0.1, px, 1.95, pz, 10), IRON);
  }

  // ------------------------------------------------------------------------------------------ STOP boards
  for (const s of STOP_BOARDS) {
    const px = s.x;
    const pz = s.z;
    const cy = -0.46;
    b.paint.add(box(px - 0.03, px + 0.03, BED - 0.2, cy, pz - 0.03, pz + 0.03), 0xe3ddcc); // short white post
    b.paint.add(box(px - 0.33, px + 0.33, cy - 0.255, cy + 0.255, pz - 0.012, pz + 0.014), BLACK);
    b.enamel.add(plate(0.62, 0.465, atlas.stop, px, cy, pz + 0.017, 0));
    b.paint.add(box(px - 0.09, px + 0.09, BED - 0.3, BED - 0.2, pz - 0.09, pz + 0.09), 0x55524a);
  }
}
