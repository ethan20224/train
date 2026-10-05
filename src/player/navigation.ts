import { Vector3 } from 'three';
import {
  ARCHES,
  BALCONY,
  COLONNADE,
  CONCOURSE,
  CROSS_PLATFORM,
  ISLANDS,
  KIOSK,
  PLAYER,
  STAIR,
  type Rect,
} from '../layout';

/**
 * Walkable-surface queries, built ONLY from layout.ts (spec section 3 "Player").
 *
 * Model: the walkable area is a union of axis-aligned rectangles (each with a ground height or a
 * ramp), minus circular obstacles (columns, kiosk). Tracks and everything else are simply outside
 * the union, so they can never be entered. Platform edges are therefore hard boundaries.
 *
 * Coordinates returned are FEET positions (ground height). The controller adds eye height.
 */

const C = PLAYER.wallClearance;

interface Region extends Rect {
  /** Ground height; for ramps see `ramp`. */
  readonly y: number;
  readonly ramp?: { readonly zFrom: number; readonly zTo: number; readonly yFrom: number; readonly yTo: number };
}

interface Circle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

const COLUMN_REACH = COLONNADE.shaftDiameter / 2 + PLAYER.radius; // 1.0 + 0.35
const KIOSK_REACH = KIOSK.footprintRadius + PLAYER.radius; // 3.5 + 0.35

const stairHalfOpening = STAIR.xMax - C; // 9.6: inside the stair balustrades
const stairBalustradeBlock = STAIR.xMax + PLAYER.radius; // 10.35: floor beside the stair is open from here

/** Everything walkable, in priority order for height lookup (first containing region wins). */
const REGIONS: readonly Region[] = (() => {
  const r: Region[] = [];

  // Balcony: whole width, balustrade (z = 8) blocks it everywhere except across the stair opening.
  r.push({
    xMin: BALCONY.xMin + C,
    xMax: BALCONY.xMax - C,
    zMin: BALCONY.zMin + C,
    zMax: BALCONY.balustradeZ - C,
    y: BALCONY.topY,
  });
  // Stair opening on the balcony level: through the balustrade line up to the first tread.
  r.push({
    xMin: -stairHalfOpening,
    xMax: stairHalfOpening,
    zMin: BALCONY.balustradeZ - C - 0.01,
    zMax: STAIR.zMin,
    y: BALCONY.topY,
  });
  // Grand staircase as a ramp 6 -> 0 over z in [8, 20].
  r.push({
    xMin: -stairHalfOpening,
    xMax: stairHalfOpening,
    zMin: STAIR.zMin,
    zMax: STAIR.zMax,
    y: STAIR.bottomY,
    ramp: { zFrom: STAIR.zMin, zTo: STAIR.zMax, yFrom: STAIR.topY, yTo: STAIR.bottomY },
  });

  // Concourse floor south of the stair foot (z >= stair end): full width.
  r.push({
    xMin: CONCOURSE.xMin + C,
    xMax: CONCOURSE.xMax - C,
    zMin: STAIR.zMax,
    zMax: CONCOURSE.zMax - C,
    y: CONCOURSE.floorY,
  });
  // Concourse floor beside the stair (excludes the stair footprint and its balustrades), both sides.
  r.push({
    xMin: CONCOURSE.xMin + C,
    xMax: -stairBalustradeBlock,
    zMin: BALCONY.zMax + C,
    zMax: STAIR.zMax,
    y: CONCOURSE.floorY,
  });
  r.push({
    xMin: stairBalustradeBlock,
    xMax: CONCOURSE.xMax - C,
    zMin: BALCONY.zMax + C,
    zMax: STAIR.zMax,
    y: CONCOURSE.floorY,
  });

  // North wall arch openings (x +-4.6 about each arch center), linking floor, wall thickness and cross platform.
  for (const cx of ARCHES.centersX) {
    r.push({
      xMin: cx - (ARCHES.width / 2 - C),
      xMax: cx + (ARCHES.width / 2 - C),
      zMin: CONCOURSE.zMax - C - 0.01,
      zMax: CROSS_PLATFORM.zMin + C + 0.01,
      y: 0,
    });
  }

  // Cross platform. Walkable edge keeps the clearance from the north wall and the platform edge toward the tracks.
  r.push({
    xMin: CROSS_PLATFORM.xMin + C,
    xMax: CROSS_PLATFORM.xMax - C,
    zMin: CROSS_PLATFORM.zMin + C,
    zMax: CROSS_PLATFORM.zMax - PLAYER.platformEdgeInset,
    y: CROSS_PLATFORM.topY,
  });

  // Island platforms: inset 0.6 from the long edges, joined to the cross platform, ending at z = 379.5.
  for (const isl of ISLANDS) {
    r.push({
      xMin: isl.xMin + PLAYER.platformEdgeInset,
      xMax: isl.xMax - PLAYER.platformEdgeInset,
      zMin: CROSS_PLATFORM.zMax - PLAYER.platformEdgeInset - 0.01,
      zMax: isl.zMax - PLAYER.platformEndInset,
      y: isl.topY,
    });
  }
  return r;
})();

const OBSTACLES: readonly Circle[] = [
  ...COLONNADE.xs.flatMap((x) => COLONNADE.zs.map((z): Circle => ({ x, z, r: COLUMN_REACH }))),
  { x: KIOSK.center[0], z: KIOSK.center[1], r: KIOSK_REACH },
];

function inRect(r: Rect, x: number, z: number): boolean {
  return x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax;
}

function regionAt(x: number, z: number): Region | null {
  for (const r of REGIONS) if (inRect(r, x, z)) return r;
  return null;
}

function inObstacle(x: number, z: number): boolean {
  for (const o of OBSTACLES) {
    const dx = x - o.x;
    const dz = z - o.z;
    if (dx * dx + dz * dz < o.r * o.r) return true;
  }
  return false;
}

function groundY(r: Region, z: number): number {
  const ramp = r.ramp;
  if (!ramp) return r.y;
  const t = Math.min(1, Math.max(0, (z - ramp.zFrom) / (ramp.zTo - ramp.zFrom)));
  return ramp.yFrom + (ramp.yTo - ramp.yFrom) * t;
}

/** Ground (feet) height at (x, z), or null where it is not walkable (void, tracks, walls, obstacles). */
export function heightAt(x: number, z: number): number | null {
  const r = regionAt(x, z);
  if (!r || inObstacle(x, z)) return null;
  return groundY(r, z);
}

const walkable = (x: number, z: number): boolean => heightAt(x, z) !== null;

/** Max XZ distance moved per collision sub-step. Smaller than any obstacle, so nothing can be tunnelled. */
const MAX_STEP = 0.1;

/** Push (x, z) out of any circular obstacle it is inside; returns the corrected point. */
function pushOutOfObstacles(x: number, z: number): [number, number] {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const o of OBSTACLES) {
      const dx = x - o.x;
      const dz = z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < o.r * o.r) {
        const d = Math.sqrt(d2) || 1e-6;
        const nx = d2 === 0 ? 1 : dx / d;
        const nz = d2 === 0 ? 0 : dz / d;
        x = o.x + nx * (o.r + 1e-4);
        z = o.z + nz * (o.r + 1e-4);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, z];
}

/**
 * Resolve a desired move from `prev` to `next` (feet positions) against the walkable area.
 * Moves in sub-steps <= 0.1 m (never tunnels), slides along boundaries (axis-separated for rectangle
 * edges, tangential for circles), and returns the final feet position with y = ground height.
 * `prev` should be walkable; if it is not, the nearest handling is to return `prev` unchanged.
 */
export function resolve(prev: Vector3, next: Vector3): Vector3 {
  const out = new Vector3(prev.x, prev.y, prev.z);
  const startGround = heightAt(prev.x, prev.z);
  if (startGround === null) return out;
  out.y = startGround;

  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-9) return out;

  const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
  const sx = dx / steps;
  const sz = dz / steps;
  let x = prev.x;
  let z = prev.z;

  for (let i = 0; i < steps; i++) {
    // Candidate moves in order of preference: full, then slide along X, then slide along Z.
    const candidates: ReadonlyArray<readonly [number, number]> = [
      [sx, sz],
      [sx, 0],
      [0, sz],
    ];
    let advanced = false;
    for (const [mx, mz] of candidates) {
      if (mx === 0 && mz === 0) continue;
      const [px, pz] = pushOutOfObstacles(x + mx, z + mz);
      if (walkable(px, pz)) {
        x = px;
        z = pz;
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      // Fully blocked this sub-step: close the remaining gap to the boundary (bisection) so the player
      // can touch walls / edges exactly instead of stopping up to MAX_STEP short, then stop.
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        const [px, pz] = pushOutOfObstacles(x + sx * mid, z + sz * mid);
        if (walkable(px, pz)) lo = mid;
        else hi = mid;
      }
      if (lo > 0) {
        const [px, pz] = pushOutOfObstacles(x + sx * lo, z + sz * lo);
        x = px;
        z = pz;
      }
      break;
    }
  }

  out.x = x;
  out.z = z;
  out.y = heightAt(x, z) ?? startGround;
  return out;
}

/** Exposed for tooling / debug overlays. Rectangles are the walkable union (obstacles excluded). */
export const walkableRegions: readonly Rect[] = REGIONS;
export const obstacleCircles: readonly Circle[] = OBSTACLES;
