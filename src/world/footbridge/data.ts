import { FOOTBRIDGE } from '../../layout';

/**
 * Pure-data pier placement for the footbridge, shared by the renderer (footbridge.ts) and the collision
 * list (obstacles.ts). No three.js here so Node scripts can import it.
 *
 * Piers stand only inside each stair's footprint column (x = island centre +- 1.2): the long island edges
 * (x within 1.0 m of the edges) are reserved for platform-edge doors, so the deck is carried by deep
 * lattice girders spanning between the stair portals and the shed side walls.
 */
export interface Pier {
  readonly x: number;
  readonly z: number;
}

export const PIER_DX = 1.2;
export const PIER_R = 0.22;
/** Collision radius used for the registered obstacles. */
export const PIER_OBSTACLE_R = 0.3;

export const BRIDGE_PIERS: readonly Pier[] = FOOTBRIDGE.stairCentersX.flatMap((c) =>
  [-PIER_DX, PIER_DX].flatMap((dx) => [
    { x: c + dx, z: FOOTBRIDGE.zMin + 0.2 },
    { x: c + dx, z: FOOTBRIDGE.zMax - 0.2 },
  ]),
);

export const footbridgeObstacles = (): { x: number; z: number; r: number; level: number }[] =>
  BRIDGE_PIERS.map((p) => ({ x: p.x, z: p.z, r: PIER_OBSTACLE_R, level: 0 }));
