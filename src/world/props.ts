// STUB — owned by Phase 2
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { BOARD, KIOSK } from '../layout';

/** Placeholder: kiosk drum with a brass clock cube, and a dark board slab. Phase 2 builds the real props. */
export async function buildProps(ctx: BuildContext): Promise<WorldModule> {
  const { materials } = ctx;
  const root = new THREE.Group();
  root.name = 'props';

  const [kx, kz] = KIOSK.center;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(KIOSK.footprintRadius, KIOSK.footprintRadius, 4, 32), materials.get('darkMarble'));
  drum.position.set(kx, 2, kz);
  const clock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), materials.get('brass'));
  clock.position.set(kx, KIOSK.clockY, kz);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, KIOSK.clockY - 4, 12), materials.get('brass'));
  post.position.set(kx, 4 + (KIOSK.clockY - 4) / 2, kz);
  for (const o of [drum, clock, post]) o.castShadow = o.receiveShadow = true;

  const [bx, by, bz] = BOARD.center;
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD.width, BOARD.height, 0.4), materials.get('castIron'));
  board.position.set(bx, by, bz + 0.2);
  root.add(drum, clock, post, board);

  return { name: 'props', object: root };
}
