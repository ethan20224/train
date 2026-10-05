import * as THREE from 'three';
import { BOOKING_OFFICE, CONCIERGE, GATES } from '../layout';
import type { AudioEngine } from './types';
import { ticketRequired } from '../player/navigation';
import { buildTicket, tickets } from './ticket';
import { DESTS, boardControl } from '../world/props/board';
import { trainControl } from '../trains/scheduler';
import type { TicketUI } from '../ui/ticketUi';

/**
 * Interaction system (Phase 4): proximity + facing checks for the three booking-office windows and the concierge
 * bell, plus the "ticket required" hint at the gates. E performs the action (only while pointer-locked, never
 * in ?cam mode). Targeting is a pure function so it can be tested without a browser.
 */

export type Target =
  | { kind: 'window'; index: number }
  | { kind: 'bell' }
  | { kind: 'gate' };

interface V3 {
  x: number;
  y: number;
  z: number;
}

/** cos of the half-angle of the "looking at it" cone. */
const FACING_DOT = 0.5;
/** Window opening centre height (counter top + half the opening above it, reachable from eye height). */
const WINDOW_TARGET_Y = BOOKING_OFFICE.counterHeight + 0.45;
const GATE_HINT_DEPTH = 2.9; // metres south of the band (the player stops 0.4 m short of it)

const facing = (eye: V3, fwd: V3, tx: number, ty: number, tz: number): boolean => {
  const dx = tx - eye.x;
  const dy = ty - eye.y;
  const dz = tz - eye.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return (fwd.x * dx + fwd.y * dy + fwd.z * dz) / len > FACING_DOT;
};

/** What is the player at / looking at? `fwd` is the unit camera forward. Pure. */
export function findTarget(feet: V3, eye: V3, fwd: V3, hasTicket: boolean, ticketRequired = true): Target | null {
  if (feet.y > 1.0) return null; // balcony, bridge deck: nothing to press up there
  const bo = BOOKING_OFFICE;
  for (let i = 0; i < bo.windowCentersX.length; i++) {
    const wx = bo.windowCentersX[i] as number;
    if (Math.abs(feet.x - wx) < bo.interact.halfWidth && feet.z >= bo.interact.zMin && feet.z <= bo.interact.zMax) {
      if (facing(eye, fwd, wx, WINDOW_TARGET_Y, bo.faceZ)) return { kind: 'window', index: i };
    }
  }
  const c = CONCIERGE;
  if (Math.abs(feet.x - c.interact.centerX) < c.interact.halfWidth && feet.z >= c.interact.zMin && feet.z <= c.interact.zMax) {
    if (facing(eye, fwd, c.bell[0], c.bell[1], c.bell[2])) return { kind: 'bell' };
  }
  if (ticketRequired && !hasTicket && feet.z >= GATES.zMin - GATE_HINT_DEPTH && feet.z <= GATES.zMin && fwd.z > 0.25) {
    for (const bx of GATES.bankCentersX) {
      if (Math.abs(feet.x - bx) < GATES.bankWidth / 2 + 1.0) return { kind: 'gate' };
    }
  }
  return null;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)] as T;

export interface InteractionDeps {
  camera: THREE.PerspectiveCamera;
  feet: THREE.Vector3;
  audio: AudioEngine;
  ui: TicketUI;
  isLocked: () => boolean;
  /** ?cam fixed-camera mode: interaction fully off. */
  disabled: boolean;
}

export class Interaction {
  private readonly d: InteractionDeps;
  private target: Target | null = null;
  private lastBell = -10;
  private readonly fwd = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();

  constructor(deps: InteractionDeps) {
    this.d = deps;
    if (deps.disabled) return;
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyE' || e.repeat) return;
      if (this.d.ui.cardVisible) {
        this.d.ui.dismiss();
        return;
      }
      if (this.d.isLocked()) this.perform();
    });
    window.addEventListener('mousedown', () => {
      if (this.d.ui.cardVisible) this.d.ui.dismiss();
    });
    tickets.subscribe((t) => this.d.ui.setBadge(t));
  }

  /** Per frame, after the controller moved the player. */
  update(): void {
    if (this.d.disabled) return;
    this.target = this.currentTarget();
    const ui = this.d.ui;
    if (!this.d.isLocked() || ui.cardVisible || !this.target) {
      ui.setPrompt(null, false);
      return;
    }
    switch (this.target.kind) {
      case 'window':
        ui.setPrompt('Collect ticket', true);
        break;
      case 'bell':
        ui.setPrompt('Ring the bell', true);
        break;
      case 'gate':
        ui.setPrompt('Ticket required — Booking Office', false);
        break;
    }
  }

  private currentTarget(): Target | null {
    const cam = this.d.camera;
    cam.getWorldDirection(this.fwd);
    cam.getWorldPosition(this.eye);
    return findTarget(this.d.feet, this.eye, this.fwd, tickets.held !== null, ticketRequired());
  }

  /** Do what E does at the current target. Returns the kind acted on (debug hook ignores pointer lock). */
  perform(): Target['kind'] | null {
    if (this.d.disabled) return null;
    const t = this.currentTarget();
    if (!t) return null;
    if (t.kind === 'window') {
      this.issueTicket();
      return 'window';
    }
    if (t.kind === 'bell') {
      const now = performance.now() / 1000;
      if (now - this.lastBell > 1.0) {
        this.lastBell = now;
        this.d.audio.bell();
      }
      return 'bell';
    }
    return null; // the gate hint is information only
  }

  private issueTicket(): void {
    // Platform: a track with no train present or reserved; if the pool has no free slot, one whose train is
    // already stopped / braking (the reservation then extends its dwell).
    const free = trainControl.freeTracks();
    const occupied = trainControl.occupiedTracks();
    const pool = trainControl.hasFreeSlot() && free.length > 0 ? free : occupied.length > 0 ? occupied : free;
    const track = pool.length > 0 ? pick(pool) : Math.floor(Math.random() * 6);
    const onBoard = new Set(boardControl?.destinations() ?? []);
    const dests = DESTS.filter((x) => !onBoard.has(x));
    const ticket = buildTicket(pick(dests.length > 0 ? dests : DESTS), track);

    tickets.set(ticket);
    this.d.audio.ticket();
    const [h, m] = ticket.departs.split(':');
    boardControl?.forceRow({
      time: `${pad2(Number(h))}:${pad2(Number(m))}`,
      dest: ticket.destination,
      plat: String(ticket.platform),
      rem: 'BOARDING',
    });
    trainControl.requestTrain(track);
    this.d.ui.showTicket(ticket);
  }
}
