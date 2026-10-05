import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PLAYER, START_POSE } from '../layout';
import type { AudioEngine } from '../core/types';
import { heightAt, resolve } from './navigation';

/**
 * First-person controller: pointer-lock look, WASD / arrows, Shift to run, smooth acceleration,
 * subtle head-bob whose foot contacts trigger `audio.footstep()`, and vertical smoothing on stairs.
 * Collision comes from navigation.ts (feet positions); the camera is feet + eye height + bob.
 */

const ACCEL = 16; // m/s^2 toward the desired velocity
const DECEL = 11; // m/s^2 when no input (a ~0.3 s glide, never an instant stop)
const EYE_SMOOTH_RATE = 14; // 1/s exponential follow of eye height (stairs)
const STRIDE_WALK = 1.55; // meters per footstep at walking pace
const STRIDE_RUN = 2.1;
const BOB_Y_WALK = 0.022;
const BOB_Y_RUN = 0.036;
const SWAY_X = 0.012;

const KEYS_FORWARD = ['KeyW', 'ArrowUp'];
const KEYS_BACK = ['KeyS', 'ArrowDown'];
const KEYS_LEFT = ['KeyA', 'ArrowLeft'];
const KEYS_RIGHT = ['KeyD', 'ArrowRight'];
const KEYS_RUN = ['ShiftLeft', 'ShiftRight'];

export class PlayerControls {
  readonly pointer: PointerLockControls;
  /** Feet position (ground contact). */
  readonly feet = new THREE.Vector3();

  private readonly camera: THREE.PerspectiveCamera;
  private readonly audio: AudioEngine;
  private readonly keys = new Set<string>();
  private readonly velocity = new THREE.Vector2(); // x, z
  private eyeY = 0;
  private bobPhase = 0; // in steps; integer crossings = foot contacts
  private bobAmount = 0; // 0..1 smoothed speed factor
  private enabled = true;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly desired = new THREE.Vector2();
  private readonly nextFeet = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, audio: AudioEngine) {
    this.camera = camera;
    this.audio = audio;
    this.pointer = new PointerLockControls(camera, domElement);

    this.feet.set(...START_POSE.position);
    this.eyeY = this.feet.y + PLAYER.eyeHeight;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(THREE.MathUtils.degToRad(START_POSE.pitchDeg), START_POSE.yaw, 0);
    this.syncCamera(0, 0);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  get isLocked(): boolean {
    return this.pointer.isLocked;
  }

  /** Disable entirely (fixed-camera preset mode). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.velocity.set(0, 0);
    }
  }

  lock(): void {
    if (this.enabled) this.pointer.lock();
  }

  update(dt: number): void {
    if (!this.enabled || dt <= 0) return;
    const locked = this.pointer.isLocked;

    // Desired horizontal velocity in world space from camera yaw.
    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-8) this.forward.set(0, 0, -1);
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize(); // camera-right on the XZ plane

    let f = 0;
    let s = 0;
    if (locked) {
      if (this.any(KEYS_FORWARD)) f += 1;
      if (this.any(KEYS_BACK)) f -= 1;
      if (this.any(KEYS_RIGHT)) s += 1;
      if (this.any(KEYS_LEFT)) s -= 1;
    }
    const running = locked && this.any(KEYS_RUN);
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    this.desired.set(this.forward.x * f + this.right.x * s, this.forward.z * f + this.right.z * s);
    if (this.desired.lengthSq() > 1) this.desired.normalize();
    this.desired.multiplyScalar(speed);

    // Accelerate / decelerate toward the desired velocity (no instant stop).
    const hasInput = this.desired.lengthSq() > 1e-6;
    const rate = (hasInput ? ACCEL : DECEL) * dt;
    const dvx = this.desired.x - this.velocity.x;
    const dvz = this.desired.y - this.velocity.y;
    const dv = Math.hypot(dvx, dvz);
    if (dv <= rate) this.velocity.copy(this.desired);
    else this.velocity.set(this.velocity.x + (dvx / dv) * rate, this.velocity.y + (dvz / dv) * rate);

    // Move with collision; velocity follows what actually happened (sliding along walls).
    let moved = 0;
    if (this.velocity.lengthSq() > 1e-8) {
      this.nextFeet.set(this.feet.x + this.velocity.x * dt, this.feet.y, this.feet.z + this.velocity.y * dt);
      const r = resolve(this.feet, this.nextFeet);
      moved = Math.hypot(r.x - this.feet.x, r.z - this.feet.z);
      this.velocity.set((r.x - this.feet.x) / dt, (r.z - this.feet.z) / dt);
      this.feet.copy(r);
    }

    this.syncCamera(dt, moved);
  }

  private syncCamera(dt: number, moved: number): void {
    const ground = heightAt(this.feet.x, this.feet.z) ?? this.feet.y;
    const targetEye = ground + PLAYER.eyeHeight;
    this.eyeY = dt > 0 ? this.eyeY + (targetEye - this.eyeY) * (1 - Math.exp(-EYE_SMOOTH_RATE * dt)) : targetEye;

    // Head-bob: advance by distance travelled; a foot contact occurs at each integer phase crossing.
    const speedNow = dt > 0 ? moved / dt : 0;
    const running = speedNow > (PLAYER.walkSpeed + PLAYER.runSpeed) / 2;
    const stride = running ? STRIDE_RUN : STRIDE_WALK;
    const target = Math.min(1, speedNow / PLAYER.walkSpeed);
    this.bobAmount += (target - this.bobAmount) * (1 - Math.exp(-8 * dt));
    const before = Math.floor(this.bobPhase);
    this.bobPhase += moved / stride;
    if (Math.floor(this.bobPhase) !== before && speedNow > 0.4) this.audio.footstep();

    const amp = (running ? BOB_Y_RUN : BOB_Y_WALK) * this.bobAmount;
    const phase = this.bobPhase * Math.PI * 2;
    // Lowest point of the bob coincides with foot contact (integer phase): bobY = -amp at contact, 0 mid-stride.
    const bobY = -amp * 0.5 * (1 + Math.cos(phase));
    const swayX = Math.sin(phase * 0.5) * SWAY_X * this.bobAmount;

    this.right.crossVectors(this.camera.getWorldDirection(this.forward), this.camera.up).normalize();
    this.camera.position.set(
      this.feet.x + this.right.x * swayX,
      this.eyeY + bobY,
      this.feet.z + this.right.z * swayX,
    );
  }

  private any(codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    this.keys.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  private readonly onBlur = (): void => {
    this.keys.clear();
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.pointer.dispose();
  }
}
