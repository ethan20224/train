import * as THREE from 'three';

/**
 * Local wall frames. Every wall decoration is authored in a local right-handed frame:
 *   u = along the wall, v = up (world Y), w = out of the wall INTO the hall.
 * `m` maps local -> world. u = 0 is the middle of the wall.
 */
export type WallName = 'west' | 'east' | 'south' | 'north';

export interface WallFrame {
  name: WallName;
  m: THREE.Matrix4;
  /** half length of the wall's hall-facing face (u in [-half, half]) */
  half: number;
  /** wall thickness behind the hall face (w in [-thickness, 0]) */
  thickness: number;
}

function frame(name: WallName, uDir: THREE.Vector3, wDir: THREE.Vector3, pos: THREE.Vector3, half: number, thickness: number): WallFrame {
  const m = new THREE.Matrix4().makeBasis(uDir, new THREE.Vector3(0, 1, 0), wDir).setPosition(pos);
  return { name, m, half, thickness };
}

export const WALLS: Record<WallName, WallFrame> = {
  // west wall x = -30, hall to +x. u = 50 - z.
  west: frame('west', new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(-30, 0, 50), 50, 2.5),
  // east wall x = +30, hall to -x. u = z - 50.
  east: frame('east', new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(30, 0, 50), 50, 2.5),
  // south wall z = 0, hall to +z. u = x.
  south: frame('south', new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 30, 2),
  // north wall z = 100, hall to -z. u = -x.
  north: frame('north', new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 100), 30, 2),
};

export const SIDE_WALLS: readonly WallFrame[] = [WALLS.west, WALLS.east];
export const END_WALLS: readonly WallFrame[] = [WALLS.south, WALLS.north];

/** Local u of a world z on a side wall (west: 50 - z, east: z - 50). */
export function uOfZ(wall: WallFrame, z: number): number {
  return wall.name === 'west' ? 50 - z : z - 50;
}

/** Window bays (z), blind bays (z), pilaster lines (z). */
export const WINDOW_Z = [26, 50, 74] as const;
export const BLIND_Z = [14, 38, 62, 86] as const;
export const PILASTER_Z = [20, 32, 44, 56, 68, 80] as const;

/** Entablature (cornice band) on the walls. */
export const WALL_CORNICE = { yMin: 22.6, yMax: 24 } as const;
