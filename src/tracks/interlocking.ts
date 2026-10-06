/**
 * Interlocking: route reservation, point (switch) throwing and signal aspects. Pure (no three.js).
 *
 * A route is reserved ALL-OR-NOTHING: every edge and every node (turnout / crossing / joint) on it must be free (or already
 * owned by the same train). A turnout node's blade state is then driven toward the state the route needs
 * (animated 0..1 over POINT_THROW_TIME). Conflicting routes cannot coexist because crossings and turnouts are nodes
 * (a shared edge, a shared node, or a shared diamond all block). Resources are released progressively behind the
 * last car (see releaseBehind) so following routes can be set.
 */
import { type RoutePath, type TrackGraph } from './graph';

export const POINT_THROW_TIME = 2.0;
/** Distance (m) behind a node / edge end the rear of the train must be before it is released. */
export const CLEAR_MARGIN = 3;

export type Aspect = 'red' | 'yellow' | 'green';

export interface PointState {
  /** 0 = straight, 1 = diverging; animated. */
  pos: number;
  target: 0 | 1;
  /** Reserved by a route. */
  locked: boolean;
}

export interface Reservation {
  train: number;
  route: RoutePath;
  /** Pieces / nodes not yet released (index of first still-held piece). */
  held: number;
  /** Route distance the leader had when the reservation was made (for debugging). */
  started: number;
}

export class Interlocking {
  readonly edgeOwner: number[];
  readonly nodeOwner: number[];
  readonly points: PointState[];
  readonly reservations = new Map<number, Reservation>();
  /** Counters for tests. */
  stats = { reserved: 0, refused: 0, thrown: 0 };

  constructor(readonly g: TrackGraph) {
    this.edgeOwner = g.edges.map(() => -1);
    this.nodeOwner = g.nodes.map(() => -1);
    this.points = g.nodes.map(() => ({ pos: 0, target: 0 as 0 | 1, locked: false }));
  }

  /** Can `train` reserve every resource of the route pieces from `fromPiece` on? */
  canReserve(train: number, route: RoutePath, fromPiece = 0): boolean {
    for (let i = fromPiece; i < route.pieces.length; i++) {
      const pc = route.pieces[i]!;
      const eo = this.edgeOwner[pc.edge]!;
      if (eo !== -1 && eo !== train) return false;
      if (pc.nodeEnd >= 0) {
        const no = this.nodeOwner[pc.nodeEnd]!;
        if (no !== -1 && no !== train) return false;
      }
    }
    return true;
  }

  /** Reserve the route for `train` (replacing any previous reservation it held, whose resources stay held if re-used). */
  reserve(train: number, route: RoutePath, startPiece = 0): boolean {
    if (!this.canReserve(train, route, startPiece)) {
      this.stats.refused++;
      return false;
    }
    for (let i = startPiece; i < route.pieces.length; i++) {
      const pc = route.pieces[i]!;
      this.edgeOwner[pc.edge] = train;
      if (pc.nodeEnd >= 0) {
        this.nodeOwner[pc.nodeEnd] = train;
        if (pc.state >= 0) {
          const p = this.points[pc.nodeEnd]!;
          if (p.target !== pc.state) {
            p.target = pc.state as 0 | 1;
            this.stats.thrown++;
          }
          p.locked = true;
        }
      }
    }
    this.reservations.set(train, { train, route, held: startPiece, started: 0 });
    this.stats.reserved++;
    return true;
  }

  /** Release everything `train` holds (despawn / cancelled). */
  releaseAll(train: number): void {
    for (let i = 0; i < this.edgeOwner.length; i++) if (this.edgeOwner[i] === train) this.edgeOwner[i] = -1;
    for (let i = 0; i < this.nodeOwner.length; i++) {
      if (this.nodeOwner[i] === train) {
        this.nodeOwner[i] = -1;
        this.points[i]!.locked = false;
      }
    }
    this.reservations.delete(train);
  }

  /** Release every resource of `train` except the edge it stands on (dwell / stabled). */
  releaseExcept(train: number, keepEdge: number): void {
    for (let i = 0; i < this.edgeOwner.length; i++) if (this.edgeOwner[i] === train && i !== keepEdge) this.edgeOwner[i] = -1;
    for (let i = 0; i < this.nodeOwner.length; i++) {
      if (this.nodeOwner[i] === train) {
        this.nodeOwner[i] = -1;
        this.points[i]!.locked = false;
      }
    }
    this.reservations.delete(train);
  }

  /** Progressive release: free pieces / nodes the rear of the train (route distance `rearU`) has cleared. */
  releaseBehind(train: number, rearU: number): void {
    const r = this.reservations.get(train);
    if (!r) return;
    const pcs = r.route.pieces;
    while (r.held < pcs.length - 1) {
      const pc = pcs[r.held]!;
      if (rearU < pc.u1 + CLEAR_MARGIN) break;
      if (this.edgeOwner[pc.edge] === train) this.edgeOwner[pc.edge] = -1;
      if (pc.nodeEnd >= 0 && this.nodeOwner[pc.nodeEnd] === train) {
        this.nodeOwner[pc.nodeEnd] = -1;
        this.points[pc.nodeEnd]!.locked = false;
      }
      r.held++;
    }
  }

  /** Advance point animation. */
  update(dt: number): void {
    const step = dt / POINT_THROW_TIME;
    for (const n of this.g.nodes) {
      if (n.kind !== 'turnout') continue;
      const p = this.points[n.id]!;
      if (p.pos < p.target) p.pos = Math.min(p.target, p.pos + step);
      else if (p.pos > p.target) p.pos = Math.max(p.target, p.pos - step);
    }
  }

  /** Are all points on `route` (pieces from `fromPiece`) at rest in the required state? */
  pointsReady(route: RoutePath, fromPiece = 0): boolean {
    for (let i = fromPiece; i < route.pieces.length; i++) {
      const pc = route.pieces[i]!;
      if (pc.nodeEnd >= 0 && pc.state >= 0) {
        const p = this.points[pc.nodeEnd]!;
        if (p.pos !== pc.state) return false;
      }
    }
    return true;
  }

  pointState(node: number): PointState {
    return this.points[node]!;
  }

  /** Signal protecting `edge` in direction `dir`. */
  signalAspect(edge: number, dir: 1 | -1): Aspect {
    const owner = this.edgeOwner[edge]!;
    if (owner < 0) return 'red';
    const r = this.reservations.get(owner);
    if (!r) return 'red';
    const pc = r.route.pieces.find((p) => p.edge === edge);
    if (!pc || pc.dir !== dir) return 'red';
    return this.pointsReady(r.route) ? 'green' : 'yellow';
  }
}
