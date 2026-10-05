import * as THREE from 'three';
import type { MaterialLibrary } from '../../core/types';
import { GeoBag, boxMM, latheMeters } from '../concourse/geo';
import { BENCH, benchPlacements } from './layout';

/** One waiting-room bench, local frame: length along x, sitter faces +z, back at z = -depth/2, y up. */
function benchParts(lib: MaterialLibrary): { wood: THREE.BufferGeometry; iron: THREE.BufferGeometry; brass: THREE.BufferGeometry } {
  const wood = new GeoBag(lib, 'wood');
  const iron = new GeoBag(lib, 'castIron');
  const brass = new GeoBag(lib, 'brass');
  const L = BENCH.length;
  const D = BENCH.depth;
  const half = L / 2;
  // seat slats
  const slatW = 0.098;
  const gapW = 0.011;
  const n = 5;
  const z0 = -D / 2 + 0.08;
  for (let i = 0; i < n; i++) {
    const zs = z0 + i * (slatW + gapW);
    wood.add(boxMM(-half + 0.05, 0.44, zs, half - 0.05, 0.485, zs + slatW));
  }
  // curved-ish back: 4 slats, leaned back 12 degrees
  for (let i = 0; i < 4; i++) {
    const g = boxMM(-half + 0.05, 0, -0.02, half - 0.05, 0.085, 0.035);
    g.rotateX(THREE.MathUtils.degToRad(-12));
    g.translate(0, 0.56 + i * 0.1, -D / 2 + 0.04);
    wood.add(g);
  }
  // top rail with a rounded edge
  const top = new THREE.CylinderGeometry(0.03, 0.03, L - 0.1, 10).rotateZ(Math.PI / 2);
  top.translate(0, 0.98, -D / 2 - 0.05);
  wood.add(top);

  // cast-iron supports at both ends and two intermediate positions
  for (const x of [-half + 0.06, -0.56, 0.56, half - 0.06]) {
    const end = Math.abs(x) > 1;
    const t = end ? 0.045 : 0.03;
    // front leg
    iron.add(boxMM(x - t / 2, 0, D / 2 - 0.1, x + t / 2, 0.44, D / 2 - 0.055));
    // rear leg raking up into the back
    const rear = boxMM(-t / 2, 0, -0.025, t / 2, 1.02, 0.025);
    rear.rotateX(THREE.MathUtils.degToRad(-8));
    rear.translate(x, 0, -D / 2 + 0.06);
    iron.add(rear);
    // seat rail
    iron.add(boxMM(x - t / 2, 0.40, -D / 2 + 0.05, x + t / 2, 0.44, D / 2 - 0.05));
    // foot
    iron.add(boxMM(x - t, 0, D / 2 - 0.14, x + t, 0.035, D / 2 - 0.04));
    iron.add(boxMM(x - t, 0, -D / 2 + 0.02, x + t, 0.035, -D / 2 + 0.14));
    if (end) {
      // scroll under the arm
      const sc = new THREE.TorusGeometry(0.1, 0.014, 6, 18, Math.PI * 1.55);
      sc.rotateY(Math.PI / 2);
      sc.translate(x, 0.54, D / 2 - 0.2);
      iron.add(sc);
      // armrest support
      iron.add(boxMM(x - t / 2, 0.44, D / 2 - 0.1, x + t / 2, 0.62, D / 2 - 0.06));
    }
  }
  // brass arm rests / dividers
  for (const x of [-half + 0.06, -0.56, 0.56, half - 0.06]) {
    const arm = new THREE.CylinderGeometry(0.02, 0.02, D - 0.2, 8).rotateX(Math.PI / 2);
    arm.translate(x, 0.63, -0.02);
    brass.add(arm);
    const ball = new THREE.SphereGeometry(0.035, 10, 8);
    ball.translate(x, 0.63, D / 2 - 0.1);
    brass.add(ball);
  }
  void latheMeters;
  const w = wood.merge();
  const i = iron.merge();
  const b = brass.merge();
  if (!w || !i || !b) throw new Error('bench merge failed');
  return { wood: w, iron: i, brass: b };
}

export function buildBenches(lib: MaterialLibrary): THREE.Object3D[] {
  const parts = benchParts(lib);
  const placements = benchPlacements();
  const meshes: THREE.InstancedMesh[] = [];
  const specs: Array<[THREE.BufferGeometry, THREE.Material, string]> = [
    [parts.wood, lib.get('wood'), 'benchWood'],
    [parts.iron, lib.get('castIron'), 'benchIron'],
    [parts.brass, lib.get('brass'), 'benchBrass'],
  ];
  const m = new THREE.Matrix4();
  for (const [geo, mat, name] of specs) {
    const im = new THREE.InstancedMesh(geo, mat, placements.length);
    im.name = name;
    placements.forEach((p, i) => {
      // local: length along x, sitter faces +z. World: length along z; sitter faces +/-x.
      // rotateY(+90deg): local +z -> +x ; local +x -> -z (length stays along z)
      m.makeRotationY(p.facing > 0 ? Math.PI / 2 : -Math.PI / 2).setPosition(p.x, 0, p.z);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = im.receiveShadow = true;
    meshes.push(im);
  }
  return meshes;
}
