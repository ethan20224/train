import { propObstacles } from './world/props/layout';

import { shedObstacles } from './world/shed/layoutData';

/**
 * Collidable props that are not part of the spec layout (benches, lamp posts, signs, ...).
 * navigation.ts treats each entry as a circle of radius `r` (the prop's physical footprint;
 * the player radius is added by navigation). Approximate long props with a row of circles
 * spaced no more than `r` apart.
 *
 * Each Phase 2 agent edits ONLY its own array.
 */
export interface PropObstacle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/** Owned by world/props.ts + world/concourse.ts (concourse, z < 102). Generated from world/props/layout.ts (pure data). */
export const CONCOURSE_OBSTACLES: readonly PropObstacle[] = propObstacles();

/** Owned by world/shed.ts (cross platform + islands, z >= 102). */
export const SHED_OBSTACLES: readonly PropObstacle[] = shedObstacles();
