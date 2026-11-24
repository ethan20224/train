/**
 * Cloud-forest floor height field (pure, no three.js so Node tests and the walk planner import it). Single source for the
 * mounded floor: src/world/metro/forest.ts builds the terrain mesh from it, src/metro/walks.ts sets boardwalk deck heights from it.
 */
import { CAVERN, FOREST, TRENCH, VESPER } from '../layoutMetro';

const Y0 = CAVERN.baseFloorY;

export function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export interface GroundRect { xMin: number; xMax: number; zMin: number; zMax: number }
/** Forest floor patches, wall to wall (the transept strips exclude the nave arms; the west/east ends stop clear of the waterfall pool and onyx reveal). */
const zS = VESPER.trackZ[0] - TRENCH.halfWidth - 0.3, zN = VESPER.trackZ[1] + TRENCH.halfWidth + 0.3;
export const GROUND: readonly GroundRect[] = [
  { xMin: CAVERN.nave.xMin, xMax: CAVERN.nave.xMax, zMin: CAVERN.nave.zMin, zMax: zS },
  { xMin: CAVERN.nave.xMin, xMax: CAVERN.nave.xMax, zMin: zN, zMax: CAVERN.nave.zMax },
  { xMin: -58.0, xMax: CAVERN.nave.xMin, zMin: CAVERN.transept.zMin, zMax: zS },
  { xMin: CAVERN.nave.xMax, xMax: 58.0, zMin: CAVERN.transept.zMin, zMax: zS },
  { xMin: -58.0, xMax: CAVERN.nave.xMin, zMin: zN, zMax: CAVERN.transept.zMax },
  { xMin: CAVERN.nave.xMax, xMax: 58.0, zMin: zN, zMax: CAVERN.transept.zMax },
];

/** Forest floor height at (x, z): soft mounds, low against the walls and the track plinths. */
export function forestGroundY(x: number, z: number): number {
  const n = vnoise(x * 0.11 + 17, z * 0.11 - 5) * 0.7 + vnoise(x * 0.31 - 3, z * 0.31 + 9) * 0.3;
  let edge = 1;
  for (const r of GROUND) {
    if (x < r.xMin - 0.01 || x > r.xMax + 0.01 || z < r.zMin - 0.01 || z > r.zMax + 0.01) continue;
    const d = Math.min(x - r.xMin, r.xMax - x, z - r.zMin, r.zMax - z);
    edge = Math.min(1, Math.max(0, d / 3.0));
  }
  return Y0 + 0.06 + FOREST.groundRise * n * (0.25 + 0.75 * edge);
}
