import * as THREE from 'three';
import { forestGroundY } from '../../metro/forestGround';
import { planLilies, planStones } from '../../metro/streamPlan';
import { buildKoi, buildLilies } from './streamKoi';
import { buildStreamStones } from './streamStones';
import { buildStreamWater } from './streamWater';

/**
 * The stream and the koi pond (user-approved 2026-11-24, layout STREAM in layoutMetro.ts, plan and terrain carve in
 * src/metro/streamPlan.ts + forestGround.ts). The stream leaves the west waterfall pool along the south transept strip, crosses
 * into the south nave arm and ends in a dark pond with stepping stones, lily pads, lotus blooms and eight koi.
 *
 * Budget: 4 draw calls (water, stones + pebbles, koi, lilies), ~60 k triangles, no lights. All motion is in the shaders or the
 * koi instance matrices, driven by REAL time (like the waterfall and the forest). Terrain banks live in the forest floor mesh
 * (the height field carries the channel and basin).
 */
export interface StreamBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  /** Advance water, koi in REAL time (seconds). */
  update(realTimeSec: number): void;
  stats: { calls: number; triangles: number };
}

export function buildStream(): StreamBuild {
  const group = new THREE.Group();
  group.name = 'metroStream';
  const plan = planStones(forestGroundY);
  const water = buildStreamWater(plan.wet);
  const stones = buildStreamStones(plan.stones);
  const koi = buildKoi();
  const lilies = buildLilies(planLilies(plan.steps));
  group.add(stones.mesh, koi.mesh, lilies.mesh, water.mesh);
  return {
    group,
    deepMaterials: [water.material, stones.material, koi.material, lilies.material],
    update(t: number): void {
      water.update(t);
      koi.update(t);
    },
    stats: { calls: 4, triangles: water.triangles + stones.triangles + koi.triangles + lilies.triangles },
  };
}
