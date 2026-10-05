// STUB — owned by Phase 2
import * as THREE from 'three';
import type { BuildContext } from '../core/types';
import { RAIL, TRAIN_ROUTE } from '../layout';

/** Overall length of the placeholder consist (spec: loco 24 m + 5 carriages of 25 m + 1 m gaps). */
export const STUB_TRAIN_LENGTH = 24 + 5 * 25 + 5;

/**
 * Placeholder train: one black box with the correct envelope. The nose is at local z = 0 and the body
 * extends toward +z (a stopped train has its nose at z = RAIL.trainStopNoseZ). Phase 2: Art Deco streamliner.
 */
export function buildTrainModel(ctx: BuildContext): THREE.Group {
  const g = new THREE.Group();
  g.name = 'trainModel';
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_ROUTE.width, TRAIN_ROUTE.heightAboveRail, STUB_TRAIN_LENGTH),
    ctx.materials.get('trainPaint'),
  );
  box.position.set(0, RAIL.topY + TRAIN_ROUTE.heightAboveRail / 2, STUB_TRAIN_LENGTH / 2);
  box.castShadow = false; // trains do not cast into the static sun map (spec section 4)
  g.add(box);
  return g;
}
