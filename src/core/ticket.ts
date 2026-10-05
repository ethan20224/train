import { TRACKS } from '../layout';

/**
 * Ticket state store (Phase 4 spec "Systems"). Dependency-free so Node tests can import it.
 * Writers: the interaction system (issues tickets). Readers: gates (open lanes), navigation
 * (gate lanes walkable), board (forced row), scheduler (reserved train), UI (ticket card/badge).
 */
export interface Ticket {
  destination: string;
  /** Platform number 1..6 (see TRACKS / spec platform numbering). */
  platform: number;
  /** Index into TRACKS. */
  track: number;
  /** Departure time as printed, e.g. "6:52". */
  departs: string;
  car: number;
  seat: number;
  serial: string;
}

/** Frozen terminal clock is 6:47; tickets depart a few minutes later. */
const DEPARTURE_MINUTES = [51, 52, 52, 53, 54, 55] as const;

/**
 * Compose a ticket for a chosen destination and track index. Pure (no globals) apart from `rnd`
 * (defaults to Math.random) so tests stay deterministic when they pass a seeded generator.
 */
export function buildTicket(destination: string, track: number, rnd: () => number = Math.random): Ticket {
  const t = TRACKS[track];
  if (!t) throw new Error(`buildTicket: bad track index ${track}`);
  const minute = DEPARTURE_MINUTES[Math.floor(rnd() * DEPARTURE_MINUTES.length)] ?? 52;
  return {
    destination,
    platform: t.platformNumber,
    track,
    departs: `6:${String(minute).padStart(2, '0')}`,
    car: 1 + Math.floor(rnd() * 5),
    seat: 1 + Math.floor(rnd() * 40),
    serial: `GM-${String(1000 + Math.floor(rnd() * 9000)).padStart(6, '0')}`,
  };
}

type Listener = (t: Ticket | null) => void;

let held: Ticket | null = null;
const listeners = new Set<Listener>();

export const tickets = {
  get held(): Ticket | null {
    return held;
  },
  /** Replace the held ticket (null clears it) and notify subscribers synchronously. */
  set(t: Ticket | null): void {
    held = t;
    for (const fn of listeners) fn(held);
  },
  /** Subscribe; returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
