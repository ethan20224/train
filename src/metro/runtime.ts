import type { Region } from '../player/regions';
import { disc } from './disc';
import { escalators } from './escalators';

/** Player-facing metro machinery. Real time: call once per displayed frame BEFORE the player controller. */
export function updateMetroRuntime(dt: number, feet: { x: number; y: number; z: number }): void {
  escalators.update(dt, feet);
  disc.update(dt, feet);
  for (const fn of visualHooks) fn(dt, feet);
}

type VisualHook = (dt: number, feet: { x: number; y: number; z: number }) => void;
const visualHooks: VisualHook[] = [];
/**
 * Visuals that must follow the real-time runtime every displayed frame, independent of ?timescale (the disc mesh, the gate leaves,
 * the speed-gate panels). World modules register here instead of using their (simulation-time) `update`.
 */
export function onMetroFrame(fn: VisualHook): void {
  visualHooks.push(fn);
}

export function metroDynamicRegions(): readonly Region[] {
  return disc.regions();
}
