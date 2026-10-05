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
