import type { Region } from '../player/regions';
import { disc } from './disc';
import { escalators } from './escalators';

/** Player-facing metro machinery. Real time: call once per displayed frame BEFORE the player controller. */
export function updateMetroRuntime(dt: number, feet: { x: number; y: number; z: number }): void {
  escalators.update(dt, feet);
  disc.update(dt, feet);
}

export function metroDynamicRegions(): readonly Region[] {
  return disc.regions();
}
