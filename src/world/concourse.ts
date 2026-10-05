// STUB — owned by Phase 2
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { BALCONY, COLONNADE, CONCOURSE, STAIR } from '../layout';

/**
 * Blockout placeholder so presets / navigation can be checked visually: floor, balcony slab, stair wedge,
 * colonnade cylinders. Phase 2 replaces everything (hall shell, vault, windows, balustrades, ...).
 */
export async function buildConcourse(ctx: BuildContext): Promise<WorldModule> {
  const { materials } = ctx;
  const root = new THREE.Group();
  root.name = 'concourse';

  const floorGeo = new THREE.PlaneGeometry(CONCOURSE.width, CONCOURSE.length).rotateX(-Math.PI / 2);
  floorGeo.translate(0, CONCOURSE.floorY, (CONCOURSE.zMin + CONCOURSE.zMax) / 2);
  const floor = new THREE.Mesh(
    materials.applyWorldUVs(floorGeo, materials.tileSize('floorMarble')),
    materials.get('floorMarble'),
  );
  floor.receiveShadow = true;
  root.add(floor);

  const balconyGeo = new THREE.BoxGeometry(BALCONY.xMax - BALCONY.xMin, BALCONY.topY, BALCONY.zMax - BALCONY.zMin);
  balconyGeo.translate(0, BALCONY.topY / 2, (BALCONY.zMin + BALCONY.zMax) / 2);
  const balcony = new THREE.Mesh(materials.applyWorldUVs(balconyGeo, materials.tileSize('wallStone')), materials.get('wallStone'));
  balcony.castShadow = balcony.receiveShadow = true;
  root.add(balcony);

  // Stair as a single wedge (ramp 6 -> 0).
  const w = STAIR.xMax - STAIR.xMin;
  const d = STAIR.zMax - STAIR.zMin;
  const wedge = new THREE.Shape();
  wedge.moveTo(0, 0);
  wedge.lineTo(d, 0);
  wedge.lineTo(0, STAIR.topY);
  wedge.closePath();
  const stairGeo = new THREE.ExtrudeGeometry(wedge, { depth: w, bevelEnabled: false });
  stairGeo.rotateY(-Math.PI / 2); // shape x -> world z, extrusion -> world x
  stairGeo.translate(STAIR.xMin + w, 0, STAIR.zMin);
  const stair = new THREE.Mesh(materials.applyWorldUVs(stairGeo, materials.tileSize('wallStone')), materials.get('wallStone'));
  stair.castShadow = stair.receiveShadow = true;
  root.add(stair);

  const colGeo = new THREE.CylinderGeometry(COLONNADE.shaftDiameter / 2, COLONNADE.shaftDiameter / 2, COLONNADE.height, 24);
  const cols = new THREE.InstancedMesh(colGeo, materials.get('columnMarble'), COLONNADE.xs.length * COLONNADE.zs.length);
  const m = new THREE.Matrix4();
  let i = 0;
  for (const x of COLONNADE.xs) {
    for (const z of COLONNADE.zs) cols.setMatrixAt(i++, m.makeTranslation(x, COLONNADE.height / 2, z));
  }
  cols.castShadow = cols.receiveShadow = true;
  root.add(cols);

  return { name: 'concourse', object: root };
}
