// STUB — owned by Phase 2
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { RAIL, TRACKS } from '../layout';
import { buildTrainModel } from './trainModel';

/**
 * Placeholder scheduler: one parked train on T3 so the `platform` preset has something to frame.
 * Phase 2: arrive / dwell / depart state machine (spec section 5).
 */
export async function buildTrains(ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'trains';
  const t3 = TRACKS.find((t) => t.id === 'T3');
  if (!t3) throw new Error('T3 missing from layout');
  const train = buildTrainModel(ctx);
  train.position.set(t3.centerX, 0, RAIL.trainStopNoseZ);
  root.add(train);
  return { name: 'trains', object: root };
}
