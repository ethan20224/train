import type { Region } from '../player/regions';
import { disc } from './disc';
import { escalators } from './escalators';
import { funicular } from './funicular';
import { lifts } from './lifts';

const dynRegions: Region[] = [];
function syncDynamicRegions(): void {
  dynRegions.length = 0;
  for (const r of disc.regions()) dynRegions.push(r);
  for (const r of lifts.regions()) dynRegions.push(r);
  for (const r of funicular.regions()) dynRegions.push(r);
}
syncDynamicRegions();

/** Player-facing metro machinery. Real time: call once per displayed frame BEFORE the player controller. */
export function updateMetroRuntime(dt: number, feet: { x: number; y: number; z: number }): void {
  escalators.update(dt, feet);
  disc.update(dt, feet);
  lifts.update(dt, feet);
  funicular.update(dt, feet);
  syncDynamicRegions();
  for (const fn of visualHooks) fn(dt, feet);
}

type VisualHook = (dt: number, feet: { x: number; y: number; z: number }) => void;
const visualHooks: VisualHook[] = [];
/**
 * Visuals that must follow the real-time runtime every displayed frame, independent of ?timescale (the disc mesh, the gate leaves,
 * the speed-gate panels, the capsule lifts). World modules register here instead of using their (simulation-time) `update`.
 */
export function onMetroFrame(fn: VisualHook): () => void {
  visualHooks.push(fn);
  return () => { const i = visualHooks.indexOf(fn); if (i >= 0) visualHooks.splice(i, 1); };
}

export function metroDynamicRegions(): readonly Region[] {
  return dynRegions;
}
