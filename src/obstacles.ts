import { propObstacles } from './world/props/layout';

import { footbridgeObstacles } from './world/footbridge/data';
import { shedObstacles } from './world/shed/layoutData';
import { hotelObstacles } from './world/hotel/layoutData';
import { platformObstacles } from './world/platformEnds/data';
import { shopObstacles } from './world/shops/layoutData';
import { HALCYON, THRESHOLD, halcyonPlanterObstacleCircles, infoScreenObstacleCircles, kitObstacleCircles, totemObstacleCircles } from './layoutMetro';

/**
 * Collidable props that are not part of the spec layout (benches, lamp posts, signs, ...).
 * navigation.ts treats each entry as a circle of radius `r` (the prop's physical footprint;
 * the player radius is added by navigation). Approximate long props with a row of circles
 * spaced no more than `r` apart.
 *
 * Each agent edits ONLY its own array.
 */
export interface PropObstacle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  /**
   * Ground height (feet y) of the level this obstacle stands on. Applies only when the player's feet
   * are within 1.0 m of it. Omitted = applies on every level (back-compatible).
   */
  readonly level?: number;
}

/** Owned by world/props.ts + world/concourse.ts (concourse, z < 102). Generated from world/props/layout.ts (pure data). */
export const CONCOURSE_OBSTACLES: readonly PropObstacle[] = propObstacles();

/** Owned by world/shed.ts (cross platform + islands, z >= 102). */
export const SHED_OBSTACLES: readonly PropObstacle[] = shedObstacles();

/** Owned by world/hotel.ts (Phase 4B: lounge on the balcony at level 6, concierge desk, hall lounges). */
export const HOTEL_OBSTACLES: readonly PropObstacle[] = hotelObstacles();

/** Owned by world/footbridge.ts (Phase 4C: piers on the islands at level 0, anything on the deck at level 7). */
export const FOOTBRIDGE_OBSTACLES: readonly PropObstacle[] = footbridgeObstacles();

/** Owned by world/platformEnds.ts (Phase 5A: end railings/gates are nav ends already; luggage barrows, mirror posts on islands, level 0). */
export const PLATFORM_OBSTACLES: readonly PropObstacle[] = platformObstacles();

/** Owned by world/shops.ts (Phase 5B: shopfronts, conveniences, cross-platform kiosk, level 0). */
export const SHOP_OBSTACLES: readonly PropObstacle[] = shopObstacles();

/** Owned by world/metro/gates.ts & crossing.ts (Threshold wayfinding totems at -30 — the fare line itself is region holes, src/metro/navData.ts; platform info-screen masts/pylons; platform kit: bench-planters, kiosks, lounges, help points ... on all three platforms). */
export const METRO_OBSTACLES: readonly PropObstacle[] = [
  ...totemObstacleCircles().map((c) => ({ ...c, level: THRESHOLD.y })),
  // Platform info screens (world/metro/infoScreens.ts): Meridian screen masts and Vesper floor pylons, each at its own platform level.
  ...infoScreenObstacleCircles(),
  // Platform life and station kit (world/metro/platformKit.ts): every solid object of PLATFORM_KIT at its platform's level.
  ...kitObstacleCircles(),
  // Halcyon island planter beds and their benches (world/metro/halcyonArt.ts), at the Halcyon platform level.
  ...halcyonPlanterObstacleCircles().map((c) => ({ ...c, level: HALCYON.topY })),
];
