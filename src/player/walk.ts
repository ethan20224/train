import { Vector3 } from 'three';
import { conveyorAt, resolve } from './navigation';

export const ACCEL = 16; // m/s^2 toward the desired velocity
export const DECEL = 11; // m/s^2 when no input (a ~0.3 s glide, never an instant stop)

/**
 * One frame of walking. Accelerates the player's OWN velocity toward `desired`, adds the moving walkway under the feet,
 * resolves collisions, and writes back the own velocity (walkway excluded, else it feeds back and runs away).
 * Returns the distance the player's own stride covered (head-bob / footsteps). Mutates `feet` and `vel`.
 */
export function walkStep(feet: Vector3, vel: { x: number; z: number }, desired: { x: number; z: number }, dt: number, scratch = new Vector3()): number {
  const hasInput = desired.x * desired.x + desired.z * desired.z > 1e-6;
  const rate = (hasInput ? ACCEL : DECEL) * dt;
  const dvx = desired.x - vel.x;
  const dvz = desired.z - vel.z;
  const dv = Math.hypot(dvx, dvz);
  if (dv <= rate) {
    vel.x = desired.x;
    vel.z = desired.z;
  } else {
    vel.x += (dvx / dv) * rate;
    vel.z += (dvz / dv) * rate;
  }
  const conv = conveyorAt(feet.x, feet.z, feet.y);
  const tx = vel.x + conv.x;
  const tz = vel.z + conv.z;
  if (tx * tx + tz * tz <= 1e-8) return 0;
  scratch.set(feet.x + tx * dt, feet.y, feet.z + tz * dt);
  const r = resolve(feet, scratch);
  vel.x = (r.x - feet.x) / dt - conv.x;
  vel.z = (r.z - feet.z) / dt - conv.z;
  // Blocked against the end of a walkway with no input: the "own" velocity is just the walkway reversed. Drop it.
  if (!hasInput && vel.x * conv.x + vel.z * conv.z < 0) {
    vel.x = 0;
    vel.z = 0;
  }
  feet.copy(r);
  return Math.hypot(vel.x, vel.z) * dt;
}
