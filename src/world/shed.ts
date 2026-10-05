// STUB — owned by Phase 2
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { CROSS_PLATFORM, ISLANDS, RAIL, TRACKS } from '../layout';

/** Placeholder: platform slabs, ballast strips and rails so tracks/platforms read. Phase 2 builds the shed, trusses, roof, buffers. */
export async function buildShed(ctx: BuildContext): Promise<WorldModule> {
  const { materials } = ctx;
  const root = new THREE.Group();
  root.name = 'shed';
  const platformDepth = 1.1; // visual slab thickness below y = 0

  const slab = (xMin: number, xMax: number, zMin: number, zMax: number): THREE.Mesh => {
    const g = new THREE.BoxGeometry(xMax - xMin, platformDepth, zMax - zMin);
    g.translate((xMin + xMax) / 2, -platformDepth / 2, (zMin + zMax) / 2);
    const mesh = new THREE.Mesh(materials.applyWorldUVs(g, materials.tileSize('platformStone')), materials.get('platformStone'));
    mesh.receiveShadow = true;
    return mesh;
  };
  root.add(slab(CROSS_PLATFORM.xMin, CROSS_PLATFORM.xMax, CROSS_PLATFORM.zMin, CROSS_PLATFORM.zMax));
  for (const isl of ISLANDS) root.add(slab(isl.xMin, isl.xMax, isl.zMin, isl.zMax));

  // Track bed: one long ballast strip per track, plus two rails.
  const bedLength = RAIL.endZ - CROSS_PLATFORM.zMax;
  for (const t of TRACKS) {
    const bed = new THREE.BoxGeometry(5, 0.2, bedLength) /* 5 m = track spacing: beds abut, no void between platforms */;
    bed.translate(t.centerX, RAIL.topY - 0.3, CROSS_PLATFORM.zMax + bedLength / 2);
    const bedMesh = new THREE.Mesh(materials.applyWorldUVs(bed, materials.tileSize('trackBallast')), materials.get('trackBallast'));
    bedMesh.receiveShadow = true;
    root.add(bedMesh);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, bedLength), materials.get('railSteel'));
      rail.position.set(t.centerX + (side * RAIL.gauge) / 2, RAIL.topY - 0.075, CROSS_PLATFORM.zMax + bedLength / 2);
      root.add(rail);
    }
  }
  return { name: 'shed', object: root };
}
