# Meridian Deep Implementation Plan (master + Phase 0–1 detail)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Meridian Deep metro interchange beneath the Grand Hall. This document fully specifies Phase 0 (baseline) and Phase 1 (foundations + greybox). Phases 2–5 are outlined here and each gets its own detailed plan once the previous phase passes its gate, because they depend on Phase 1's interfaces and greybox findings.

**Architecture:** Pure layout data (`src/layoutMetro.ts`) drives everything. A generalised region-based navigation (circles, oriented boxes, region-scoped holes, x/z ramps, conveyors, movers, connectors) carries the player on escalators and the Sinking Floor disc. A depth-driven look system blends surface ↔ deep looks, swaps the single sun between surface and deep duty at a mid-void "airlock", and hides whichever world the camera is not in. Phase 1 proves all of this end to end on greybox geometry before any finished art.

**Tech Stack:** three 0.186.1, postprocessing 6.39.5, n8ao 2.0.1, TypeScript 6.0.3, Vite 8.3.2, tsx (Node tests), Playwright (browser tests). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md`. Read it fully before any task; every coordinate below comes from its §2.

## Global Constraints

- No new dependencies or version changes. Pure Three.js real-time; procedural Web Audio only.
- No people, no music, no announcements, no boarding.
- `src/layout.ts` + `src/layoutMetro.ts` are the only places coordinates live; no other module hard-codes metro numbers.
- ≥ 50 fps settled, headed Chrome, M2 MacBook Air (8 GB), 1440×900@1 and 1470×956@2, auto quality.
- Deep zone ≤ 220 draw calls, ≤ 2.0 M visible triangles. Hall view ≤ baseline + 5 draw calls.
- No frame > 50 ms at the airlock switch / sun swap.
- GPU texture estimate ≤ 450 MB total.
- Existing behaviour preserved: ticket ritual, gates, lounge, footbridge, platform safety, mainline trains and interlocking, all existing tests.
- Work on branch `meridian-deep` (never commit to `main` directly). Commit per task, only that task's paths.
- Every visual claim is proven by a real-GPU screenshot reviewed by the director (Opus). Greybox (Phase 1) is judged on massing, sightlines and function only, never on materials.

## Review Focus

1. **A player is on the gangway, not the disc, when the disc is called away or departs.** Expected: the player is never trapped mid-gangway and never stands over the open well. Pinned in Task 4 (`metro-runtime-test`: gangway no-trap and closed-gangway cases).
2. **A player stands still at the end of a moving escalator, or walks against one.** Expected: no velocity runaway, no endless head-bob, stable position on the landing. Pinned in Task 4 (`walkStep` conveyor-end test).
3. **The camera hovers around the airlock height (−16 ± 1), e.g. riding F2 slowly or stopping mid-flight.** Expected: the zone toggles at most once per crossing; no flicker, no repeated shadow re-renders. Pinned in Task 5 (`zones-test` hysteresis oscillation).
4. **A long frame (tab hidden, dt clamped to 0.05 repeatedly) while riding the disc.** Expected: the rider stays on the disc and arrives with it. Pinned in Task 4 (large-dt ride test).
5. **Surface interaction prompts underground.** The Threshold ring reaches z ≈ 94 at y −30, inside the ticket-gate hint band. Expected: no "Ticket required" prompt anywhere below the hall. Pinned in Task 5 (guard) and Task 7 (route test asserts empty prompt at the Threshold north edge).

---

## Master phase map

| Phase | Plan | Delivers | Executor |
|---|---|---|---|
| 0 | this file, Task 0 | Baseline numbers + screenshots | Sonnet |
| 1 | this file, Tasks 1–7 | Layout data, navigation generalisation, escalators + disc runtime, depth looks + airlock + sun swap, greybox metro, route/perf gate | Tasks 1–4 Sonnet (code is fully specified here); Tasks 5–7 director (rendering integration) |
| 2 | `…-meridian-deep-phase2-descent-plan.md` (written after the Phase 1 gate) | Oculus finish (hall-side Beaux-Arts curb, balustrade, gangway, gate), void era bands + light rings + warm cove light tucked under every deck edge (L1, L2, Threshold; user-approved idea from the reference images; Phase 3 repeats it under the Meridian bridge), real escalators (instanced animated steps, glass balustrades, combplates), L1/L2/Threshold finish, speed gates, disc finish, void environment capture | Sonnet implementers, director review per task |
| 3 | `…-phase3-cavern-plan.md` | Monolith shell (joint grids, shadow gaps, light slots), onyx wall, sky shader + eclipse caster + slots, Meridian bridge (hangers, cove light, screen doors), Crossing floor (terrazzo + inlays + glass panel), deep hall + island, F5/F6 finish, portals, water wall, funicular (mover), capsule lifts (movers + E buttons + twin ghost runs), cavern sensing halo | Sonnet, parallel where files are disjoint |
| 4 | `…-phase4-metro-plan.md` | Timetable bus, 6-track scheduler, mirror train model, portal light-wave, kinetic droplets, live map wall + running clock | Sonnet, parallel with late Phase 3 |
| 5 | `…-phase5-acceptance-plan.md` | Zone audio, look-dev, perf pass, full acceptance (spec §7–§8) | director + Sonnet |

### Interfaces Phase 1 freezes for later phases
- `src/layoutMetro.ts` exports (Task 1): `OCULUS, VOID, voidRadiusAt, THROAT, ESCALATOR, FLIGHTS, escalatorUnits, LANDINGS, THRESHOLD, SKY, DISC, GANGWAY, LIFTS, FUNICULAR, CAVERN, MERIDIAN, VESPER, HALCYON, GLASS_FLOOR, METRO_TRAIN, PSD, DEEP_SUN, DEEP_LOOK, MAP_WALL, WATER_WALL, DROPLETS, ZONES, CROSS_OUTLINE`.
- `src/player/regions.ts` (Task 2): `Region`, `Shape`, `inRegion`, `groundY`, `rectShape`, `circleShape`, `obbShape`, `boundsOf`.
- `src/player/navigation.ts` (Task 2): existing `heightAt`, `resolve`, plus `setDynamicRegions`, `carryAt`, `conveyorAt`.
- `src/metro/escalators.ts`, `src/metro/disc.ts`, `src/metro/runtime.ts` (Task 4): `escalators`, `disc`, `updateMetroRuntime(dt, feet)`, `metroDynamicRegions()`.
- `src/core/zones.ts` (Task 5): `lookFactor`, `sunWeights`, `Airlock`.
- `src/lighting/looks.ts` (Task 5): `DepthLook` (`update(camY)`, `captureDeep()`, `airlock`, `factor`).
- Scene names (Task 6): `metro` root, `metroVoid`, `metroDeep`, `metroDeepImpostor`, `metroSurfaceImpostor`, `metroDisc`; `root.userData.deepMaterials`.

---

## Phase 0

### Task 0: Baseline and branch

**Files:**
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Branch**

```bash
git checkout -b meridian-deep
```

- [ ] **Step 2: Run the existing Node checks**

Run: `npm run build && npm run nav-test && npm run graph-test && npm run traffic-sim`
Expected: all pass. Record the exact pass lines (nav-test prints `ok …` per case).

- [ ] **Step 3: Start one dev server and run the live tests sequentially**

```bash
npm run dev -- --host 127.0.0.1 &
node scripts/walk-test.mjs --out=meridian-deep/baseline/walk
node scripts/train-test.mjs
node scripts/safety-test.mjs
node scripts/route-test.mjs
```
Expected: each prints its PASS/FAIL summary; record it. If pointer lock is unavailable (exit 2), record that, not a failure.

- [ ] **Step 4: Baseline screenshots and numbers**

Run: `npm run shot -- balcony concourse kiosk gates arches --q=auto --out=meridian-deep/baseline`
Record fps / draw calls / triangles / renderer string printed for each preset.

- [ ] **Step 5: Record in `docs/TASKS.md`**

Append:
```markdown
## Meridian Deep (spec: `docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md`, plan: `docs/superpowers/plans/2026-10-06-meridian-deep-plan.md`)
- [x] Phase 0 baseline (2026-10-06): build/nav/graph/traffic <results>; walk/train/safety/route <results>; balcony <fps>/<calls>/<tris>, concourse …, gates …
- [ ] Phase 1 foundations + greybox
- [ ] Phase 2 descent · [ ] Phase 3 cavern · [ ] Phase 4 metro · [ ] Phase 5 acceptance
```
Fill `<results>` with the recorded values. Pre-existing failures are recorded verbatim and not fixed.

- [ ] **Step 6: Commit**

```bash
git add docs/TASKS.md docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md docs/superpowers/plans/2026-10-06-meridian-deep-plan.md
git commit -m "Meridian Deep: spec, plan, phase 0 baseline"
```

---

## Phase 1

### Task 1: Metro layout data + geometry invariant test

**Files:**
- Create: `src/layoutMetro.ts`
- Modify: `src/layout.ts` (append one re-export line at the end)
- Create: `scripts/metro-layout-test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `PLAYER`, `GATES`, `KIOSK` from `src/layout.ts`.
- Produces: every export listed in "Interfaces Phase 1 freezes". `escalatorUnits(): EscalatorUnit[]` with `EscalatorUnit = { id: string; flight: FlightId; axis: 'x' | 'z'; across: number; from: number; to: number; yFrom: number; yTo: number; dir: 'down' | 'up'; sign: 1 | -1 }`. `sign` is the travel direction along `axis` for the conveyor.

- [ ] **Step 1: Write the failing invariant test** `scripts/metro-layout-test.ts`

```ts
// Geometry invariants of the Meridian Deep layout (spec §2). Run: npm run metro-layout-test
import assert from 'node:assert/strict';
import {
  CAVERN, DISC, ESCALATOR, FLIGHTS, FUNICULAR, HALCYON, LANDINGS, LIFTS, MERIDIAN, METRO_TRAIN, OCULUS, PSD, SKY,
  THRESHOLD, THROAT, VESPER, escalatorUnits, voidRadiusAt,
} from '../src/layoutMetro';
import { GATES, KIOSK } from '../src/layout';

let passed = 0;
const test = (name: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${name}`); };
const TAN30 = Math.tan(Math.PI / 6);
const flight = (id: string) => { const f = FLIGHTS.find((x) => x.id === id); assert.ok(f, id); return f!; };
/** Step height of flight f at axis coordinate c. */
const yAt = (id: string, c: number): number => { const f = flight(id); const t = (c - f.from) / (f.to - f.from); return f.yFrom + (f.yTo - f.yFrom) * t; };
const perpToHalcyon = (x: number, z: number): number => {
  const [cx, cz] = HALCYON.centre; const [ux, uz] = HALCYON.dir;
  return Math.abs(-(x - cx) * uz + (z - cz) * ux);
};
const MEDALLION_EDGE_Z = KIOSK.center[1] + 9.46; // MEDALLION_R in src/world/concourse/floor.ts

test('every flight is a 30° incline', () => {
  for (const f of FLIGHTS) assert.ok(Math.abs(Math.abs(f.yTo - f.yFrom) / Math.abs(f.to - f.from) - TAN30) < 1e-6, f.id);
});

test('flights chain through their landings (spec §2.3)', () => {
  const inZ = (z: number, r: { zMin: number; zMax: number }) => z >= r.zMin - 0.05 && z <= r.zMax + 0.05;
  assert.ok(inZ(flight('F1').to, LANDINGS.L1) && inZ(flight('F2').from, LANDINGS.L1), 'L1');
  assert.ok(inZ(flight('F2').to, LANDINGS.L2) && inZ(flight('F3').from, LANDINGS.L2), 'L2');
  assert.ok(inZ(flight('F3').to, LANDINGS.thresholdBridge) && inZ(flight('F4').from, LANDINGS.thresholdBridge), 'threshold');
  const isl = MERIDIAN.island;
  assert.ok(flight('F4').to > isl.zMin + 2 && flight('F5').from < isl.zMax - 2, 'F4 lands / F5 departs on the Meridian island');
  assert.ok(inZ(flight('F5').to, VESPER.floor), 'F5 lands on the Crossing floor');
  assert.ok(flight('F6').from >= VESPER.floor.xMin + 2, 'F6 starts on the Crossing floor');
  assert.ok(perpToHalcyon(flight('F6').to, 67.8) <= HALCYON.halfWidth - 1, 'F6 lands on the Halcyon island');
  assert.equal(flight('F1').yFrom, 0); assert.equal(flight('F5').yTo, VESPER.topY); assert.equal(flight('F6').yTo, HALCYON.topY);
});

test('22 escalator units with unique ids; inner unit of each z band runs down', () => {
  const u = escalatorUnits();
  assert.equal(u.length, 22);
  assert.equal(new Set(u.map((x) => x.id)).size, 22);
  for (const x of u.filter((q) => q.axis === 'z')) {
    const twin = u.find((q) => q.flight === x.flight && q !== x && Math.sign(q.across) === Math.sign(x.across))!;
    assert.equal(x.dir === 'down', Math.abs(x.across) < Math.abs(twin.across), `${x.id} direction`);
  }
  for (const x of u) {
    const travel = Math.sign(x.to - x.from);
    assert.equal(x.sign, x.dir === 'down' ? travel : -travel, `${x.id} sign`);
  }
});

test('disc column clears every z-axis flight band by >= 0.7 m', () => {
  for (const f of FLIGHTS.filter((q) => q.axis === 'z')) for (const [a, b] of f.bands) {
    assert.ok(Math.min(Math.abs(a), Math.abs(b)) - DISC.r >= 0.7 - 1e-9, `${f.id} band ${a}..${b}`);
  }
});

test('F4 and F5 bands sit >= 0.85 m inside the Meridian screen-door line', () => {
  const doorLine = MERIDIAN.island.xMax - PSD.inset;
  for (const id of ['F4', 'F5']) for (const [a, b] of flight(id).bands) {
    assert.ok(doorLine - Math.max(Math.abs(a), Math.abs(b)) >= 0.85 - 1e-9, `${id}`);
  }
});

test('F5 clears the Vesper north train roof by >= 3.5 m', () => {
  const roof = VESPER.railY + METRO_TRAIN.height;
  assert.ok(yAt('F5', VESPER.trackZ[1]) - roof >= 3.5, `F5 at the north track: ${yAt('F5', VESPER.trackZ[1])}`);
});

test('F4 passes through the sky inside the hole', () => {
  const f = flight('F4');
  const z = f.from + ((SKY.y - f.yFrom) / (f.yTo - f.yFrom)) * (f.to - f.from);
  for (const [a, b] of f.bands) {
    const x = Math.max(Math.abs(a), Math.abs(b));
    assert.ok(Math.hypot(x, z - OCULUS.cz) <= SKY.holeR - 1, `F4 band edge at sky: r=${Math.hypot(x, z - OCULUS.cz)}`);
  }
});

test('hall: oculus fits between the kiosk medallion and the gate approach; throats clear the curb', () => {
  assert.ok(OCULUS.cz - OCULUS.curbOuterR >= MEDALLION_EDGE_Z + 4, 'south of oculus');
  assert.ok(OCULUS.cz + OCULUS.curbOuterR <= GATES.approachZMin - 4, 'north of oculus');
  assert.ok(THROAT.zMin >= MEDALLION_EDGE_Z + 2, 'throat south of medallion');
  for (const [a, b] of THROAT.bands) {
    const x = Math.min(Math.abs(a), Math.abs(b));
    assert.ok(Math.hypot(x, THROAT.zMax - OCULUS.cz) >= OCULUS.curbOuterR, 'throat corner outside the curb');
  }
});

test('F1 rider head clears the slab edge by >= 0.5 m; F1 is inside the bell beyond the dome slot', () => {
  assert.ok(OCULUS.slabUnderY - (yAt('F1', THROAT.zMax) + 1.8) >= 0.5, 'head clearance at the throat end');
  for (let z = THROAT.domeSlotEndZ; z <= flight('F1').to; z += 0.25) {
    const y = yAt('F1', z);
    for (const [a, b] of flight('F1').bands) {
      const x = Math.max(Math.abs(a), Math.abs(b));
      assert.ok(Math.hypot(x, z - OCULUS.cz) <= voidRadiusAt(y) - 0.3, `F1 outside bell at z=${z}`);
    }
  }
});

test('landing bridges never cross the disc column', () => {
  for (const L of [LANDINGS.L1, LANDINGS.L2, LANDINGS.thresholdBridge]) {
    assert.ok(L.zMin >= OCULUS.cz + DISC.r + 0.5 || L.zMax <= OCULUS.cz - DISC.r - 0.5, `${L.zMin}..${L.zMax}`);
  }
});

test('capsule lifts: on the Threshold annulus, outside the sky hole, on the Crossing floor and the Halcyon island', () => {
  for (const [x, z] of LIFTS.positions) {
    const r = Math.hypot(x, z - OCULUS.cz);
    assert.ok(r - LIFTS.tubeR >= THRESHOLD.rInner && r + LIFTS.tubeR <= THRESHOLD.rOuter, `annulus r=${r}`);
    assert.ok(r - LIFTS.tubeR >= SKY.holeR, 'outside hole');
    assert.ok(z - LIFTS.tubeR >= VESPER.floor.zMin && z + LIFTS.tubeR <= VESPER.floor.zMax, 'on the floor');
    assert.ok(perpToHalcyon(x, z) + LIFTS.tubeR <= HALCYON.halfWidth, 'on the Halcyon island');
  }
});

test('funicular: top on the annulus, bottom on the floor, clear of the hole and the Meridian trains', () => {
  const [tx, ty] = FUNICULAR.top; const [bx, by] = FUNICULAR.bottom;
  assert.ok(Math.abs(Math.abs(ty - by) / Math.abs(bx - tx) - 1) < 1e-9, '45°');
  assert.ok(Math.hypot(tx, FUNICULAR.z - OCULUS.cz) >= THRESHOLD.rInner && ty === THRESHOLD.y, 'top on the Threshold');
  assert.ok(bx <= VESPER.floor.xMax && by === VESPER.topY, 'bottom on the floor');
  const xAtSky = tx + (ty - SKY.y);
  assert.ok(Math.hypot(xAtSky, FUNICULAR.z - OCULUS.cz) >= SKY.holeR, 'pierces the sky outside the hole');
  assert.ok(tx - FUNICULAR.cabinWidth / 2 >= MERIDIAN.trackX[1] + METRO_TRAIN.width / 2 + 1, 'clear of Meridian east train');
});

test('levels stack without collisions', () => {
  assert.ok(MERIDIAN.topY - 1.5 >= VESPER.railY + METRO_TRAIN.height + 10, 'bridge deck over Vesper trains');
  assert.ok(HALCYON.railY + METRO_TRAIN.height + 1.5 <= VESPER.railY - 1.4, 'Halcyon trains under the Vesper trench');
  assert.ok(MERIDIAN.island.xMax - PSD.inset + METRO_TRAIN.width / 2 <= MERIDIAN.trackX[1] + 0.1, 'Meridian track offset');
  assert.ok(CAVERN.nave.xMax >= MERIDIAN.trackX[1] + METRO_TRAIN.width / 2 + 2, 'nave wide enough');
});

console.log(`\n${passed} metro layout checks passed`);
```

- [ ] **Step 2: Run it to verify it fails**

Add to `package.json` scripts: `"metro-layout-test": "tsx scripts/metro-layout-test.ts"`.
Run: `npm run metro-layout-test`
Expected: FAIL, cannot resolve `../src/layoutMetro`.

- [ ] **Step 3: Write `src/layoutMetro.ts`**

```ts
/**
 * Meridian Deep metro: world layout. SINGLE SOURCE OF TRUTH for every metro coordinate (spec §2).
 * Source: docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md. Units: metres, +Y up, +Z north, x < 0 west.
 * Dependency-free (no three.js) so Node tests import it.
 */
import type { Rect } from './layout';

const TAN30 = Math.tan(Math.PI / 6);
const run = (rise: number): number => rise / TAN30;

/** The oculus in the Grand Hall floor; the void, the disc and the sky hole share its vertical axis (cx, cz). */
export const OCULUS = {
  cx: 0, cz: 74,
  r: 9.0, curbOuterR: 9.6, curbHeight: 0.15,
  balustradeR: 9.3, balustradeHeight: 1.1,
  /** Underside of the hall floor slab. */
  slabUnderY: -1.5,
} as const;

/** Bell-shaped descent void about the oculus axis. */
export const VOID = {
  rTop: 9.0, yTop: -1.5, rWide: 20, yWide: -6, yBottom: -30,
  eras: [
    { id: 'stone', yTop: -1.5, yBottom: -10 },
    { id: 'strata', yTop: -10, yBottom: -22 },
    { id: 'polished', yTop: -22, yBottom: -30 },
  ] as const,
  lightRingPitch: 2.5,
} as const;

/** Void wall radius at height y: a carved dome flaring from the oculus to the drum (sine easing), then a cylinder. */
export function voidRadiusAt(y: number): number {
  if (y >= VOID.yTop) return VOID.rTop;
  if (y >= VOID.yWide) {
    const t = (VOID.yTop - y) / (VOID.yTop - VOID.yWide);
    return VOID.rTop + (VOID.rWide - VOID.rTop) * Math.sin((t * Math.PI) / 2);
  }
  return VOID.rWide;
}

type Band = readonly [number, number];
const INNER: readonly Band[] = [[-7.8, -4.2], [4.2, 7.8]];
const OUTER: readonly Band[] = [[-12, -8.4], [8.4, 12]];

/** Openings in the hall floor where F1 dives under the slab. */
export const THROAT = { bands: OUTER, zMin: 62.5, zMax: 69.3, domeSlotEndZ: 68.5 } as const;

export const ESCALATOR = {
  angleDeg: 30,
  /** Each band holds two units of this width, with a 0.4 m deck between them. */
  unitWidth: 1.6, stepWidth: 1.0, treadDepth: 0.4, handrailHeight: 1.0,
  idleSpeed: 0.2, activeSpeed: 0.65, accel: 0.5, senseRadius: 8,
  /** Walkable corridor half-width of the player's centre on a 1.0 m step (radius 0.35). */
  walkCorridorHalf: 0.15,
  /** Corridor regions extend this far past each end so they overlap the landings. */
  endOverlap: 0.6,
} as const;

export type FlightId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6';
export interface FlightDef {
  readonly id: FlightId;
  readonly axis: 'x' | 'z';
  /** Across-axis ranges; each band carries a down unit and an up unit. */
  readonly bands: readonly Band[];
  /** Axis coordinate of the upper end (yFrom) and the lower end (yTo). */
  readonly from: number;
  readonly to: number;
  readonly yFrom: number;
  readonly yTo: number;
}
const Z0 = THROAT.zMin; // 62.5
const Z1 = Z0 + run(10); // 79.82
export const FLIGHTS: readonly FlightDef[] = [
  { id: 'F1', axis: 'z', bands: OUTER, from: Z0, to: Z1, yFrom: 0, yTo: -10 },
  { id: 'F2', axis: 'z', bands: INNER, from: Z1, to: Z0, yFrom: -10, yTo: -20 },
  { id: 'F3', axis: 'z', bands: OUTER, from: Z0, to: Z1, yFrom: -20, yTo: -30 },
  { id: 'F4', axis: 'z', bands: INNER, from: Z1, to: Z1 - run(16), yFrom: -30, yTo: -46 },
  { id: 'F5', axis: 'z', bands: INNER, from: 113.6, to: 113.6 - run(24), yFrom: -46, yTo: -70 },
  { id: 'F6', axis: 'x', bands: [[66, 69.6]], from: -47, to: -47 + run(12), yFrom: -70, yTo: -82 },
];

export interface EscalatorUnit {
  readonly id: string;
  readonly flight: FlightId;
  readonly axis: 'x' | 'z';
  /** Across-axis centre of the unit's steps. */
  readonly across: number;
  readonly from: number;
  readonly to: number;
  readonly yFrom: number;
  readonly yTo: number;
  readonly dir: 'down' | 'up';
  /** Conveyor travel direction along the axis. */
  readonly sign: 1 | -1;
}
/** All 22 units. In each z band the unit nearer the axis (smaller |x|) runs down; F6's south unit runs down. */
export function escalatorUnits(): EscalatorUnit[] {
  const out: EscalatorUnit[] = [];
  for (const f of FLIGHTS) {
    const travel = (Math.sign(f.to - f.from) || 1) as 1 | -1;
    for (const [a, b] of f.bands) {
      const c0 = a + ESCALATOR.unitWidth / 2;
      const c1 = b - ESCALATOR.unitWidth / 2;
      const down = f.axis === 'z' ? (Math.abs(c0) < Math.abs(c1) ? c0 : c1) : c0;
      for (const c of [c0, c1]) {
        const dir = c === down ? 'down' : 'up';
        out.push({
          id: `${f.id}:${c.toFixed(2)}`, flight: f.id, axis: f.axis, across: c,
          from: f.from, to: f.to, yFrom: f.yFrom, yTo: f.yTo, dir,
          sign: dir === 'down' ? travel : ((-travel) as 1 | -1),
        });
      }
    }
  }
  return out;
}

export interface Landing { readonly y: number; readonly zMin: number; readonly zMax: number; readonly halfX: number }
export const LANDINGS = {
  L1: { y: -10, zMin: 79.8, zMax: 83.8, halfX: 17 },
  L2: { y: -20, zMin: 58.5, zMax: 62.5, halfX: 12.4 },
  /** Bridge across the sky hole at the Threshold level (the annulus covers the rest). */
  thresholdBridge: { y: -30, zMin: 79.8, zMax: 83.8, halfX: 10.6 },
} as const satisfies Record<string, Landing>;

export const THRESHOLD = { y: -30, rInner: 10, rOuter: 20, deckThickness: 2, gateX: 8.1, lanesPerSide: 3 } as const;

export const SKY = { y: -32, holeR: 10 } as const;

export const DISC = {
  r: 3.5, topY: 0, bottomY: -70, vmax: 3, accel: 0.6, minSpeed: 0.05,
  /** Seconds the rider must stand on the docked disc before it departs. */
  departDelay: 2,
  /** Player within this horizontal distance of the other end's gate (same level) calls an empty disc. */
  callRadius: 6,
  /** Railed well in the Meridian island and the Crossing floor. */
  wellR: 4.0,
} as const;

/** Gangways from the hall rim (south) and from the Crossing-floor well rim (south) onto the disc. */
export const GANGWAY = { halfWidth: 1.2 } as const;

export const LIFTS = {
  cabinR: 1.2, tubeR: 1.4,
  positions: [[-17, 74], [-17, 80]] as ReadonlyArray<readonly [number, number]>,
  stops: [-30, -70, -82] as const,
  /** Tube top (machinery head) above the Threshold. */
  headY: -24,
} as const;

export const FUNICULAR = {
  /** [x, y] of the track ends along z = FUNICULAR.z. */
  top: [18, -30] as readonly [number, number],
  bottom: [58, -70] as readonly [number, number],
  z: 74, cabinLength: 4, cabinWidth: 2.4, cabinHeight: 2.6,
} as const;

export const CAVERN = {
  transept: { xMin: -60, xMax: 60, zMin: 54, zMax: 94 },
  nave: { xMin: -20, xMax: 20, zMin: 20, zMax: 128 },
  /** Lowest structure (Halcyon trench) for shadow fitting. */
  yBottom: -84,
  /** Non-walkable base floor field across the cross, outside the Crossing floor. */
  baseFloorY: -72.5,
} as const;

/** Cross plan outline (x, z), counter-clockwise seen from above. */
export const CROSS_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [-20, 20], [20, 20], [20, 54], [60, 54], [60, 94], [20, 94], [20, 128], [-20, 128], [-20, 94], [-60, 94], [-60, 54], [-20, 54],
];

export const METRO_TRAIN = { cars: 4, carLength: 20, gap: 0.5, length: 81.5, width: 2.9, height: 4.0, doorsPerSidePerCar: 3 } as const;
/** Full-height platform screen doors. */
export const PSD = { inset: 0.35, height: 2.6 } as const;

export const MERIDIAN = {
  island: { xMin: -9, xMax: 9, zMin: 29, zMax: 119 } as Rect,
  topY: -46, railY: -47.1, deckThickness: 1.5,
  trackX: [-10.55, 10.55] as const,
  /** Deck opening where F5 drops below the bridge (rider headroom under the deck edge). */
  f5OpeningZ: [107.0, 113.6] as const,
  /** F4 body is too low over the deck here: not walkable beneath it. */
  f4FootprintZ: [52.11, 58.0] as const,
} as const;

export const VESPER = {
  floor: { xMin: -58, xMax: 58, zMin: 64, zMax: 84 } as Rect,
  platformXMin: -45, platformXMax: 45,
  topY: -70, railY: -71.1, slabThickness: 1.5,
  trackZ: [62.45, 85.55] as const,
  /** F5 lands here; its low body above the floor is not walkable beneath. */
  f5FootprintZ: [72.03, 78.0] as const,
  /** F6 drops below the floor here (rider headroom under the slab edge). */
  f6OpeningX: [-46.7, -41.0] as const,
} as const;

const SQRT1_2 = Math.SQRT1_2;
export const HALCYON = {
  centre: [-20, 74] as readonly [number, number],
  /** Unit long axis (x, z): north-east diagonal. */
  dir: [SQRT1_2, SQRT1_2] as readonly [number, number],
  halfLength: 45, halfWidth: 5,
  topY: -82, railY: -83.1,
  /** Track centres either side of the island, perpendicular to the diagonal. */
  trackOffset: 6.55,
  /** Deep-hall half-width (walls) perpendicular to the diagonal. */
  hallHalfWidth: 10,
} as const;

export const GLASS_FLOOR = { xMin: -30, xMax: -10, zMin: 65, zMax: 83 } as const;

const DEEP_ELEV = (70 * Math.PI) / 180;
const DEEP_AZ: readonly [number, number] = [Math.sin(Math.PI / 8), -Math.cos(Math.PI / 8)]; // toward SSE in (x, z)
export const DEEP_SUN = {
  /** Unit vector toward the artificial sun. */
  direction: [Math.cos(DEEP_ELEV) * DEEP_AZ[0], Math.sin(DEEP_ELEV), Math.cos(DEEP_ELEV) * DEEP_AZ[1]] as readonly [number, number, number],
  color: [1.0, 0.97, 0.92] as readonly [number, number, number],
  intensity: 7.0,
} as const;

/** Initial deep look (Phase 5 look-dev tunes these by screenshot). Colours are linear RGB. */
export const DEEP_LOOK = {
  fog: [0.62, 0.68, 0.76] as readonly [number, number, number], fogDensity: 0.0012,
  background: [0.02, 0.022, 0.026] as readonly [number, number, number],
  exposure: 0.9, bloom: 0.55, bloomThreshold: 1.0,
  split: 0.35, contrast: 0.35, saturation: 1.0,
  shadowTint: [0.95, 0.98, 1.05] as readonly [number, number, number],
  highlightTint: [1.0, 1.0, 0.98] as readonly [number, number, number],
  hemiSky: [0.75, 0.85, 1.0] as readonly [number, number, number],
  hemiGround: [0.55, 0.53, 0.5] as readonly [number, number, number],
  hemi: 0.6, probe: 0.8,
  /** Cube-capture point for the deep environment (over the Crossing floor). */
  capture: [0, -60, 74] as readonly [number, number, number],
} as const;

export const MAP_WALL = { z: 20, xMin: -20, xMax: 20, yMin: -41, yMax: -34 } as const;
export const WATER_WALL = { x: -60, zMin: 54, zMax: 94, yMin: -70, yMax: -34 } as const;
export const DROPLETS = { count: 2400, rInner: 12, rOuter: 38, yTop: -33, yBottomMin: -42, bridgeExclusionHalfX: 12.5 } as const;

/** Depth zones (camera eye y). */
export const ZONES = {
  switchY: -16, hysteresis: 1,
  lookTopY: -4, lookBottomY: -30,
  surfaceSunFade: [-4, -14] as const,
  deepSunFade: [-18, -28] as const,
} as const;
```

Append to `src/layout.ts`:
```ts

// ---------------------------------------------------------------------------
// Meridian Deep metro (docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md)
// ---------------------------------------------------------------------------
export * from './layoutMetro';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run metro-layout-test && npm run build`
Expected: `13 metro layout checks passed`; build clean. If an invariant fails, the layout is wrong: fix the data to satisfy the spec, never weaken the assertion. Report any spec conflict to the director.

- [ ] **Step 5: Commit**

```bash
git add src/layoutMetro.ts src/layout.ts scripts/metro-layout-test.ts package.json
git commit -m "Meridian Deep: metro layout data + geometry invariants"
```

---

### Task 2: Generalised navigation regions

**Files:**
- Create: `src/player/regions.ts`
- Modify: `src/player/navigation.ts` (Region type, ramps, `groundAt` → `pick`, connectors/holes/dynamic regions, new exports)
- Create: `scripts/nav-regions-test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces (`regions.ts`): `Region`, `Shape`, `RectShape`, `CircleShape`, `ObbShape`, `Ramp`, `inShape`, `inRegion`, `groundY`, `rectShape`, `circleShape`, `obbShape`, `boundsOf`.
- Produces (`navigation.ts`): `setDynamicRegions(fn: () => readonly Region[]): void`, `carryAt(x, z, y): { x: number; y: number; z: number } | null`, `conveyorAt(x, z, y): { x: number; z: number }`. Existing `heightAt`, `resolve`, `ticketRequired`, `setRequireTicketOverride`, `walkableRegions`, `obstacleCircles` unchanged in signature and behaviour.

- [ ] **Step 1: Write the failing test** `scripts/nav-regions-test.ts`

Synthetic regions are injected as dynamic regions far from the station (x ≈ 500), so they never interact with real geometry.

```ts
// Generic region features of navigation (Task 2). Run: npm run nav-regions-test
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { carryAt, conveyorAt, heightAt, resolve, setDynamicRegions } from '../src/player/navigation';
import { boundsOf, circleShape, obbShape, rectShape, type Region } from '../src/player/regions';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };
const near = (a: number, b: number, e: number, m: string) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`);
const walk = (from: Vector3, to: Vector3, step = 0.08): Vector3 => {
  let p = from.clone();
  for (let i = 0; i < 20000; i++) {
    const d = new Vector3(to.x - p.x, 0, to.z - p.z); const len = d.length(); if (len < 1e-3) break;
    const r = resolve(p, p.clone().addScaledVector(d, Math.min(step, len) / len));
    if (Math.hypot(r.x - p.x, r.z - p.z) < 1e-7) break; p = r;
  }
  return p;
};

let open = false;
const carry = { x: 0, y: 0, z: 0 };
const floor: Region = { xMin: 500, xMax: 520, zMin: 0, zMax: 20, y: 0, holes: [circleShape(510, 10, 2)] };
const xRamp: Region = { xMin: 520, xMax: 530, zMin: 9.5, zMax: 10.5, y: 0, ramp: { axis: 'x', from: 520, to: 530, yFrom: 0, yTo: -5 } };
const lower: Region = { xMin: 530, xMax: 540, zMin: 0, zMax: 20, y: -5 };
const disc: Region = { ...boundsOf(circleShape(550, 10, 3)), y: 0, circle: circleShape(550, 10, 3), carry };
const door: Region = { xMin: 520, xMax: 547.5, zMin: 2.5, zMax: 3.5, y: 0, when: () => open };
const belt: Region = { xMin: 500, xMax: 520, zMin: 30, zMax: 31, y: 0, conveyor: { axis: 'z', speed: () => -0.65 } };
const diag: Region = { ...boundsOf(obbShape(600, 0, Math.SQRT1_2, Math.SQRT1_2, 10, 2)), y: 0, obb: obbShape(600, 0, Math.SQRT1_2, Math.SQRT1_2, 10, 2) };
setDynamicRegions(() => [floor, xRamp, lower, disc, door, belt, diag]);

test('region-scoped hole excludes only its own region', () => {
  assert.equal(heightAt(510, 10, 0), null, 'inside the hole');
  near(heightAt(507.5, 10, 0)!, 0, 1e-9, 'outside the hole');
});
test('x-axis ramp interpolates along x and connects two levels', () => {
  near(heightAt(525, 10, -2.5)!, -2.5, 1e-9, 'mid ramp');
  const p = walk(new Vector3(519, 0, 10), new Vector3(535, 0, 10));
  near(p.x, 535, 0.01, 'reached the lower level'); near(p.y, -5, 1e-9, 'at y -5');
});
test('circle and obb regions refine their bounding rectangles', () => {
  assert.notEqual(heightAt(550, 10, 0), null, 'disc centre'); assert.equal(heightAt(552.8, 12.8, 0), null, 'disc bbox corner');
  assert.notEqual(heightAt(607, 7, 0), null, 'obb along its axis'); assert.equal(heightAt(607, -7, 0), null, 'obb bbox corner');
});
test('connector is walkable only while `when()` is true, and never traps a player standing in it', () => {
  open = false; assert.equal(heightAt(530, 3, 0), null, 'closed door');
  open = true; const inDoor = walk(new Vector3(519, 0, 3), new Vector3(530, 0, 3)); near(inDoor.x, 530, 0.01, 'walked in');
  open = false; const out = walk(inDoor, new Vector3(519, 0, 3)); near(out.x, 519, 0.01, 'walked back out after it closed');
});
test('carryAt returns the mover delta for a rider at the previous height', () => {
  carry.y = -0.05; (disc as { y: number }).y = -0.05;
  assert.deepEqual(carryAt(550, 10, 0), carry, 'rider at old y is carried');
  assert.equal(carryAt(560, 10, 0), null, 'off the disc');
  carry.y = 0; (disc as { y: number }).y = 0;
});
test('conveyorAt reports the belt velocity and nothing elsewhere', () => {
  assert.deepEqual(conveyorAt(510, 30.5, 0), { x: 0, z: -0.65 });
  assert.deepEqual(conveyorAt(505, 10, 0), { x: 0, z: 0 });
});
setDynamicRegions(() => []);
console.log(`\n${passed} region checks passed`);
```

- [ ] **Step 2: Run to verify it fails**

Add `"nav-regions-test": "tsx scripts/nav-regions-test.ts"` to `package.json`.
Run: `npm run nav-regions-test`
Expected: FAIL, cannot resolve `../src/player/regions`.

- [ ] **Step 3: Create `src/player/regions.ts`**

```ts
import type { Rect } from '../layout';

/**
 * Walkable-region primitives shared by navigation.ts and the metro nav data (pure, no three.js).
 * A region is always a bounding rectangle, optionally refined to a circle or an oriented box; its ground is flat
 * or a ramp along x or z; region-scoped holes exclude points from THIS region only (others may still cover them).
 */
export interface RectShape extends Rect { readonly kind: 'rect' }
export interface CircleShape { readonly kind: 'circle'; readonly cx: number; readonly cz: number; readonly r: number }
/** Oriented box: centre, unit long axis (ux, uz), half length along it, half width across it. */
export interface ObbShape {
  readonly kind: 'obb'; readonly cx: number; readonly cz: number; readonly ux: number; readonly uz: number;
  readonly halfLen: number; readonly halfWid: number;
}
export type Shape = RectShape | CircleShape | ObbShape;

export interface Ramp { readonly axis: 'x' | 'z'; readonly from: number; readonly to: number; readonly yFrom: number; readonly yTo: number }

export interface Region extends Rect {
  /** Ground height (ramps: see `ramp`). */
  readonly y: number;
  readonly ramp?: Ramp;
  /** Ticket-gate lane corridor: walkable only while the lanes are open. */
  readonly gate?: boolean;
  readonly circle?: CircleShape;
  readonly obb?: ObbShape;
  readonly holes?: readonly Shape[];
  /** Connector: walkable only while this returns true (a player already standing in it is never trapped). */
  readonly when?: () => boolean;
  /** Moving walkway: signed velocity (m/s) along `axis` applied to whoever stands here. */
  readonly conveyor?: { readonly axis: 'x' | 'z'; readonly speed: () => number };
  /** Dynamic movers only: this floor's displacement since the previous frame; riders are carried by it. */
  readonly carry?: { readonly x: number; readonly y: number; readonly z: number };
}

export const rectShape = (xMin: number, xMax: number, zMin: number, zMax: number): RectShape => ({ kind: 'rect', xMin, xMax, zMin, zMax });
export const circleShape = (cx: number, cz: number, r: number): CircleShape => ({ kind: 'circle', cx, cz, r });
export const obbShape = (cx: number, cz: number, ux: number, uz: number, halfLen: number, halfWid: number): ObbShape =>
  ({ kind: 'obb', cx, cz, ux, uz, halfLen, halfWid });

export function inShape(s: Shape, x: number, z: number): boolean {
  switch (s.kind) {
    case 'rect':
      return x >= s.xMin && x <= s.xMax && z >= s.zMin && z <= s.zMax;
    case 'circle': {
      const dx = x - s.cx;
      const dz = z - s.cz;
      return dx * dx + dz * dz <= s.r * s.r;
    }
    case 'obb': {
      const dx = x - s.cx;
      const dz = z - s.cz;
      return Math.abs(dx * s.ux + dz * s.uz) <= s.halfLen && Math.abs(-dx * s.uz + dz * s.ux) <= s.halfWid;
    }
  }
}

/** Bounding rectangle of any shape. */
export function boundsOf(s: Shape): Rect {
  if (s.kind === 'rect') return { xMin: s.xMin, xMax: s.xMax, zMin: s.zMin, zMax: s.zMax };
  if (s.kind === 'circle') return { xMin: s.cx - s.r, xMax: s.cx + s.r, zMin: s.cz - s.r, zMax: s.cz + s.r };
  const ex = Math.abs(s.ux) * s.halfLen + Math.abs(s.uz) * s.halfWid;
  const ez = Math.abs(s.uz) * s.halfLen + Math.abs(s.ux) * s.halfWid;
  return { xMin: s.cx - ex, xMax: s.cx + ex, zMin: s.cz - ez, zMax: s.cz + ez };
}

export function inRegion(r: Region, x: number, z: number): boolean {
  if (x < r.xMin || x > r.xMax || z < r.zMin || z > r.zMax) return false;
  if (r.circle && !inShape(r.circle, x, z)) return false;
  if (r.obb && !inShape(r.obb, x, z)) return false;
  if (r.holes) for (const h of r.holes) if (inShape(h, x, z)) return false;
  return true;
}

export function groundY(r: Region, x: number, z: number): number {
  const ramp = r.ramp;
  if (!ramp) return r.y;
  const c = ramp.axis === 'x' ? x : z;
  const t = Math.min(1, Math.max(0, (c - ramp.from) / (ramp.to - ramp.from)));
  return ramp.yFrom + (ramp.yTo - ramp.yFrom) * t;
}
```

- [ ] **Step 4: Refactor `src/player/navigation.ts`**

1. Remove the local `interface Region`, `inRect` and `groundY`. Add `import { groundY, inRegion, type Region } from './regions';`.
2. Migrate both ramps to the new form:
   - Grand stair: `ramp: { axis: 'z', from: STAIR.zMin, to: STAIR.zMax, yFrom: STAIR.topY, yTo: STAIR.bottomY }`
   - Bridge stairs: `ramp: { axis: 'z', from: bot, to: top, yFrom: isl.topY, yTo: FOOTBRIDGE.deckTopY }`
3. Replace `groundAt` with:

```ts
interface Hit { readonly g: number; readonly region: Region }
const NO_KEEP: ReadonlySet<Region> = new Set();
let dynamicRegions: () => readonly Region[] = () => [];
/** Movers, doors and other time-varying regions (metro runtime). Called on every query: keep it cheap. */
export function setDynamicRegions(fn: () => readonly Region[]): void {
  dynamicRegions = fn;
}

/**
 * Best region at (x, z) for a player whose feet are at `nearY` (undefined = the LOWEST level there).
 * `lanes`: ticket-gate lanes count as walkable. `keep`: connectors the player is standing in (stay open for them).
 */
function pick(x: number, z: number, nearY: number | undefined, lanes: boolean, keep: ReadonlySet<Region>): Hit | null {
  let best: Hit | null = null;
  let bestD = Infinity;
  for (const list of [REGIONS, dynamicRegions()]) {
    for (const r of list) {
      if (r.gate && !lanes) continue;
      if (r.when && !r.when() && !keep.has(r)) continue;
      if (!inRegion(r, x, z)) continue;
      const g = groundY(r, x, z);
      const d = nearY === undefined ? g : Math.abs(g - nearY);
      if (nearY !== undefined && d > LEVEL_TOLERANCE) continue;
      if (d >= bestD) continue;
      if (inObstacle(x, z, g)) continue;
      best = { g, region: r };
      bestD = d;
    }
  }
  return best;
}

function groundAt(x: number, z: number, nearY: number | undefined, lanes: boolean, keep: ReadonlySet<Region> = NO_KEEP): number | null {
  return pick(x, z, nearY, lanes, keep)?.g ?? null;
}

/** Connectors containing the feet position: they stay walkable for this move (nobody is trapped when a door closes). */
function connectorsAt(p: Vector3): ReadonlySet<Region> {
  let keep: Set<Region> | null = null;
  for (const list of [REGIONS, dynamicRegions()]) {
    for (const r of list) {
      if (!r.when || !inRegion(r, p.x, p.z) || Math.abs(groundY(r, p.x, p.z) - p.y) > LEVEL_TOLERANCE) continue;
      (keep ??= new Set()).add(r);
    }
  }
  return keep ?? NO_KEEP;
}

/** Mover displacement this frame for a rider whose feet are at (x, y, z) BEFORE being carried, or null. */
export function carryAt(x: number, z: number, y: number): { x: number; y: number; z: number } | null {
  for (const r of dynamicRegions()) {
    if (!r.carry || !inRegion(r, x, z)) continue;
    if (Math.abs(groundY(r, x, z) - r.carry.y - y) <= LEVEL_TOLERANCE) return r.carry;
  }
  return null;
}

/** Moving-walkway velocity (m/s) under feet at (x, y, z); zero when not on one. */
export function conveyorAt(x: number, z: number, y: number): { x: number; z: number } {
  const c = pick(x, z, y, lanesOpen(), NO_KEEP)?.region.conveyor;
  if (!c) return { x: 0, z: 0 };
  const s = c.speed();
  return c.axis === 'x' ? { x: s, z: 0 } : { x: 0, z: s };
}
```

4. In `inLane`, replace `inRect(r, x, z)` with `inRegion(r, x, z)`.
5. In `resolve`, compute `const keep = connectorsAt(prev);` right after `lanes`, and pass `keep` as the last argument of every `groundAt(...)` call inside `resolve` (initial `y`, each candidate, the bisection, the final `y`).
6. Leave `heightAt`, obstacles, `MAX_STEP`, sliding and bisection logic untouched.

- [ ] **Step 5: Run all navigation tests**

Run: `npm run nav-regions-test && npm run nav-test && npm run build`
Expected: `6 region checks passed`; every existing nav-test case still `ok` (same count as the Phase 0 baseline); build clean.

- [ ] **Step 6: Commit**

```bash
git add src/player/regions.ts src/player/navigation.ts scripts/nav-regions-test.ts package.json
git commit -m "Navigation: circle/obb regions, scoped holes, x ramps, connectors, conveyors, movers"
```

---

### Task 3: Metro walkable regions + hall oculus holes

**Files:**
- Create: `src/metro/navData.ts`
- Modify: `src/player/navigation.ts` (hall floor holes; append metro static regions)
- Create: `scripts/nav-metro-test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 layout; Task 2 `Region` helpers; `escalators.velocity(id)` from Task 4's `src/metro/escalators.ts`. Task 3 creates that file minimally (Step 3a) so it can bind conveyors; Task 4 completes it.
- Produces: `HALL_HOLES: readonly Shape[]`, `metroStaticRegions(): Region[]`, `MetroNav` constants `C` re-export not needed.

- [ ] **Step 1: Write the failing test** `scripts/nav-metro-test.ts`

```ts
// Metro walkability (Task 3). Disc connectors are dynamic (Task 4), so this test covers static geometry + escalators.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { heightAt, resolve } from '../src/player/navigation';
import { FLIGHTS, HALCYON, LANDINGS, MERIDIAN, OCULUS, PLAYER, THRESHOLD, VESPER, escalatorUnits } from '../src/layout';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };
const near = (a: number, b: number, e: number, m: string) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`);
const walk = (from: Vector3, to: Vector3, step = 0.08): Vector3 => {
  let p = from.clone();
  for (let i = 0; i < 40000; i++) {
    const d = new Vector3(to.x - p.x, 0, to.z - p.z); const len = d.length(); if (len < 1e-3) break;
    const r = resolve(p, p.clone().addScaledVector(d, Math.min(step, len) / len));
    if (Math.hypot(r.x - p.x, r.z - p.z) < 1e-7) break; p = r;
  }
  return p;
};
const at = (x: number, z: number, y: number) => new Vector3(x, heightAt(x, z, y) ?? NaN, z);
const unit = (flight: string, dir: 'down' | 'up', side: 1 | -1) =>
  escalatorUnits().find((u) => u.flight === flight && u.dir === dir && Math.sign(u.across) === side)!;

test('hall: cannot step into the oculus or a throat; floor around them is walkable', () => {
  assert.equal(heightAt(0, OCULUS.cz, 0), null, 'oculus centre');
  assert.equal(heightAt(OCULUS.curbOuterR, OCULUS.cz, 0), null, 'curb');
  assert.equal(heightAt(10.2, 66, 0), null, 'throat');
  assert.equal(heightAt(0, 70, 0), null, 'gangway is closed without the disc runtime');
  near(heightAt(0, 60, 0)!, 0, 1e-9, 'floor south of the oculus');
  const p = walk(at(-15, 74, 0), new Vector3(15, 0, 74));
  assert.ok(p.x <= -(OCULUS.curbOuterR + PLAYER.wallClearance) + 1e-6, `blocked at the curb, x=${p.x}`);
});

test('escalator route down: hall -> F1 -> L1 -> F2 -> L2 -> F3 -> Threshold -> F4 -> Meridian -> F5 -> Crossing floor', () => {
  const dn = (id: string) => unit(id, 'down', 1).across; // F1/F3 outer down unit x 9.2, F2/F4/F5 inner down unit x 5.0
  // [x, z, expected y on arrival (optional)]. On the Meridian island the route skirts the F4 footprint, the disc well and
  // the F5 deck opening, and boards F5 from its north (upper) end.
  const route: Array<[number, number, number?]> = [
    [dn('F1'), 61.5, 0], [dn('F1'), LANDINGS.L1.zMax - 0.6, -10],
    [dn('F2'), LANDINGS.L1.zMax - 0.6], [dn('F2'), LANDINGS.L2.zMin + 0.6, -20],
    [dn('F3'), LANDINGS.L2.zMin + 0.6], [dn('F3'), LANDINGS.thresholdBridge.zMax - 0.6, -30],
    [dn('F4'), LANDINGS.thresholdBridge.zMax - 0.6], [dn('F4'), 50.5, MERIDIAN.topY],
    [2.0, 50.5], [2.0, 60], [6.5, 66], [6.5, 100], [1.0, 106], [1.0, 115], [dn('F5'), 115, MERIDIAN.topY],
    [dn('F5'), 70.6, VESPER.topY],
  ];
  let p = at(route[0]![0], route[0]![1], 0);
  for (const [x, z, y] of route.slice(1)) {
    p = walk(p, new Vector3(x, 0, z));
    near(p.x, x, 0.05, `x at (${x}, ${z})`); near(p.z, z, 0.05, `z at (${x}, ${z})`);
    if (y !== undefined) near(p.y, y, 1e-6, `y at (${x}, ${z})`);
  }
});

test('F6: Crossing floor -> Halcyon island, and back up on the up unit', () => {
  const d = unit('F6', 'down', 1);
  let p = walk(at(-50, d.across, VESPER.topY), new Vector3(-50, 0, d.across));
  p = walk(p, new Vector3(-25.0, 0, d.across));
  near(p.y, HALCYON.topY, 1e-6, 'down to Halcyon');
  const up = unit('F6', 'up', 1);
  p = walk(p, new Vector3(-24.5, 0, up.across)); p = walk(p, new Vector3(-50, 0, up.across));
  near(p.y, VESPER.topY, 1e-6, 'back on the floor');
});

test('edges hold: void, Meridian island, Crossing floor tracks, Halcyon island, wells', () => {
  const big = (from: Vector3, to: Vector3) => resolve(from, to);
  assert.ok(big(at(0, 82, -10), new Vector3(0, 0, 90)).z <= LANDINGS.L1.zMax, 'L1 north edge');
  assert.equal(heightAt(MERIDIAN.trackX[1], 90, MERIDIAN.topY), null, 'Meridian track');
  assert.equal(heightAt(0, OCULUS.cz, MERIDIAN.topY), null, 'Meridian well');
  assert.equal(heightAt(0, VESPER.trackZ[0], VESPER.topY), null, 'Vesper track');
  assert.equal(heightAt(0, OCULUS.cz, VESPER.topY), null, 'Crossing well');
  assert.equal(heightAt(-20 + 8 * Math.SQRT1_2, 74 - 8 * Math.SQRT1_2, HALCYON.topY), null, 'Halcyon track side');
  assert.equal(heightAt(0, OCULUS.cz, THRESHOLD.y), null, 'sky hole at the Threshold');
  assert.notEqual(heightAt(0, 81.8, THRESHOLD.y), null, 'Threshold bridge across the hole');
});

test('fuzz: 100k random moves on every metro level never leave the walkable set', () => {
  const starts = [at(0, 81.8, -10), at(0, 60.5, -20), at(15, 74, -30), at(0, 40, MERIDIAN.topY), at(20, 74, VESPER.topY), at(-20, 74, HALCYON.topY)];
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const s of starts) {
    let p = s.clone();
    for (let i = 0; i < 100000 / starts.length; i++) {
      const a = rnd() * Math.PI * 2; const len = rnd() < 0.05 ? rnd() * 20 : rnd() * 0.4;
      p = resolve(p, new Vector3(p.x + Math.cos(a) * len, 0, p.z + Math.sin(a) * len));
      assert.notEqual(heightAt(p.x, p.z, p.y), null, `left the walkable set at (${p.x}, ${p.y}, ${p.z})`);
    }
  }
});
console.log(`\n${passed} metro nav checks passed (flights: ${FLIGHTS.length})`);
```

- [ ] **Step 2: Run to verify it fails**

Add `"nav-metro-test": "tsx scripts/nav-metro-test.ts"`. Run: `npm run nav-metro-test`
Expected: FAIL (oculus centre is walkable; metro levels are not).

- [ ] **Step 3a: Minimal `src/metro/escalators.ts`** (Task 4 completes the class; keep these exports)

```ts
import { ESCALATOR, escalatorUnits, type EscalatorUnit } from '../layoutMetro';

/** Escalator speeds (Task 4 adds sensing in `update`). Velocity is signed along the unit's axis. */
export class Escalators {
  readonly units: readonly EscalatorUnit[] = escalatorUnits();
  protected readonly speeds = new Float64Array(this.units.length).fill(ESCALATOR.idleSpeed);
  protected readonly index = new Map(this.units.map((u, i) => [u.id, i] as const));
  speed(id: string): number {
    const i = this.index.get(id);
    return i === undefined ? 0 : (this.speeds[i] ?? 0);
  }
  velocity(id: string): number {
    const i = this.index.get(id);
    const u = i === undefined ? undefined : this.units[i];
    return u ? this.speed(id) * u.sign : 0;
  }
}
export const escalators = new Escalators();
```

- [ ] **Step 3b: Create `src/metro/navData.ts`**

```ts
import { PLAYER } from '../layout';
import {
  DISC, ESCALATOR, GLASS_FLOOR, HALCYON, LANDINGS, LIFTS, MERIDIAN, OCULUS, PSD, THRESHOLD, THROAT, VESPER, escalatorUnits,
} from '../layoutMetro';
import { boundsOf, circleShape, obbShape, rectShape, type Region, type Shape } from '../player/regions';
import { escalators } from './escalators';

/** Static metro walkability (spec §2). Movers and their gangways are dynamic (src/metro/disc.ts). */
const C = PLAYER.wallClearance;
const { cx, cz } = OCULUS;
const liftHoles = (): Shape[] => LIFTS.positions.map(([x, z]) => circleShape(x, z, LIFTS.tubeR + C));
const bandHoles = (bands: readonly (readonly [number, number])[], zMin: number, zMax: number): Shape[] =>
  bands.map(([a, b]) => rectShape(a - C, b + C, zMin, zMax));

/** Holes in the Grand Hall floor region: the oculus (to the curb) and the two F1 throats. */
export const HALL_HOLES: readonly Shape[] = [
  circleShape(cx, cz, OCULUS.curbOuterR + C),
  ...THROAT.bands.map(([a, b]) => rectShape(a - C, b + C, THROAT.zMin, THROAT.zMax + C)),
];

function landing(l: { y: number; zMin: number; zMax: number; halfX: number }): Region {
  return { xMin: -l.halfX + C, xMax: l.halfX - C, zMin: l.zMin + C, zMax: l.zMax - C, y: l.y };
}

function escalatorRegions(): Region[] {
  const h = ESCALATOR.walkCorridorHalf;
  const ext = ESCALATOR.endOverlap;
  return escalatorUnits().map((u): Region => {
    const lo = Math.min(u.from, u.to) - ext;
    const hi = Math.max(u.from, u.to) + ext;
    const rect = u.axis === 'z'
      ? { xMin: u.across - h, xMax: u.across + h, zMin: lo, zMax: hi }
      : { xMin: lo, xMax: hi, zMin: u.across - h, zMax: u.across + h };
    return {
      ...rect,
      y: u.yTo,
      ramp: { axis: u.axis, from: u.from, to: u.to, yFrom: u.yFrom, yTo: u.yTo },
      conveyor: { axis: u.axis, speed: () => escalators.velocity(u.id) },
    };
  });
}

/** Every static metro region. Order matters on exact ties: levels before escalators, so conveyors stop at the ends. */
export function metroStaticRegions(): Region[] {
  const inner = [[-7.8, -4.2], [4.2, 7.8]] as const;
  const annulus = circleShape(cx, cz, THRESHOLD.rOuter - C);
  const isl = MERIDIAN.island;
  const doorX = isl.xMax - PSD.inset - C;
  const floor = VESPER.floor;
  const [hx, hz] = HALCYON.centre;
  const [ux, uz] = HALCYON.dir;
  const deep = obbShape(hx, hz, ux, uz, HALCYON.halfLength - C, HALCYON.halfWidth - PSD.inset - C);
  return [
    landing(LANDINGS.L1),
    landing(LANDINGS.L2),
    { ...boundsOf(annulus), y: THRESHOLD.y, circle: annulus, holes: [circleShape(cx, cz, THRESHOLD.rInner + C)] },
    landing(LANDINGS.thresholdBridge),
    {
      xMin: -doorX, xMax: doorX, zMin: isl.zMin + C, zMax: isl.zMax - C, y: MERIDIAN.topY,
      holes: [
        circleShape(cx, cz, DISC.wellR + C),
        ...bandHoles(inner, MERIDIAN.f4FootprintZ[0] + 0.3, MERIDIAN.f4FootprintZ[1]),
        ...bandHoles(inner, MERIDIAN.f5OpeningZ[0], MERIDIAN.f5OpeningZ[1] - 0.3),
      ],
    },
    {
      xMin: floor.xMin + C, xMax: floor.xMax - C, zMin: floor.zMin + PSD.inset + C, zMax: floor.zMax - PSD.inset - C, y: VESPER.topY,
      holes: [
        circleShape(cx, cz, DISC.wellR + C),
        ...bandHoles(inner, VESPER.f5FootprintZ[0] + 0.3, VESPER.f5FootprintZ[1]),
        rectShape(VESPER.f6OpeningX[0], VESPER.f6OpeningX[1] + C, 66 - C, 69.6 + C),
        ...liftHoles(),
      ],
    },
    { ...boundsOf(deep), y: HALCYON.topY, obb: deep, holes: liftHoles() },
    ...escalatorRegions(),
  ];
}
// The glass floor (GLASS_FLOOR) is part of the Crossing floor: walkable, no separate region.
void GLASS_FLOOR;
```

- [ ] **Step 4: Wire into `src/player/navigation.ts`**

- `import { HALL_HOLES, metroStaticRegions } from '../metro/navData';`
- On the concourse floor region south of the gate band (the `r.push` with `zMin: STAIR.zMax, zMax: GATES.zMin - C`), add `holes: HALL_HOLES`.
- At the end of the `REGIONS` builder, before `return r;`: `r.push(...metroStaticRegions());`

- [ ] **Step 5: Run the tests**

Run: `npm run nav-metro-test && npm run nav-regions-test && npm run nav-test && npm run metro-layout-test && npm run build`
Expected: `5 metro nav checks passed`; all earlier suites unchanged; build clean. Existing nav fuzz from the balcony must still pass (the oculus holes must not trap anyone).

- [ ] **Step 6: Commit**

```bash
git add src/metro/navData.ts src/metro/escalators.ts src/player/navigation.ts scripts/nav-metro-test.ts package.json
git commit -m "Meridian Deep: static metro walkability and hall oculus holes"
```

---

### Task 4: Escalator sensing, Sinking Floor disc, conveyor-aware walking

**Files:**
- Modify: `src/metro/escalators.ts` (add `update`)
- Create: `src/metro/disc.ts`, `src/metro/runtime.ts`, `src/player/walk.ts`
- Modify: `src/player/controls.ts` (use `walkStep`, apply mover carry)
- Create: `scripts/metro-runtime-test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `escalators.update(dt, feet)`; `disc: DiscMover` with `y`, `docked: 'top' | 'bottom' | null`, `gateOpen(end)`, `update(dt, feet)`, `regions()`; `updateMetroRuntime(dt, feet)`, `metroDynamicRegions()`; `walkStep(feet, vel, desired, dt, scratch?) → ownDistance`.
- Consumes: Task 2 `carryAt`, `conveyorAt`, `resolve`, `setDynamicRegions`.

- [ ] **Step 1: Write the failing test** `scripts/metro-runtime-test.ts`

```ts
// Escalator sensing, disc rides, conveyor walking (Task 4). Run: npm run metro-runtime-test
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { DISC, ESCALATOR, OCULUS, VESPER, escalatorUnits } from '../src/layout';
import { carryAt, heightAt, setDynamicRegions } from '../src/player/navigation';
import { walkStep } from '../src/player/walk';
import { disc } from '../src/metro/disc';
import { escalators } from '../src/metro/escalators';
import { metroDynamicRegions, updateMetroRuntime } from '../src/metro/runtime';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };
const near = (a: number, b: number, e: number, m: string) => assert.ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`);
setDynamicRegions(metroDynamicRegions);
const DT = 1 / 60;
/** One frame exactly like the app: runtime, then carry, then walking toward `target` (or standing). */
function frame(feet: Vector3, vel: { x: number; z: number }, target: Vector3 | null, dt = DT): void {
  updateMetroRuntime(dt, feet);
  const c = carryAt(feet.x, feet.z, feet.y);
  if (c) { feet.x += c.x; feet.y += c.y; feet.z += c.z; }
  const d = target ? new Vector3(target.x - feet.x, 0, target.z - feet.z) : new Vector3();
  const len = d.length();
  const desired = len > 0.05 ? { x: (d.x / len) * 3.2, z: (d.z / len) * 3.2 } : { x: 0, z: 0 };
  walkStep(feet, vel, desired, dt);
}
const run = (feet: Vector3, vel: { x: number; z: number }, target: Vector3 | null, seconds: number, dt = DT) => {
  for (let t = 0; t < seconds; t += dt) frame(feet, vel, target, dt);
};

test('escalators idle at 0.2 m/s and ramp to 0.65 when the player is near', () => {
  const u = escalatorUnits().find((q) => q.flight === 'F1' && q.dir === 'down')!;
  const far = new Vector3(0, 6, 3);
  for (let i = 0; i < 300; i++) escalators.update(DT, far);
  near(escalators.speed(u.id), ESCALATOR.idleSpeed, 1e-9, 'idle');
  const close = new Vector3(u.across, 0, 60);
  for (let i = 0; i < 300; i++) escalators.update(DT, close);
  near(escalators.speed(u.id), ESCALATOR.activeSpeed, 1e-9, 'active');
});

test('standing still on a down escalator carries the player from the hall to L1', () => {
  const u = escalatorUnits().find((q) => q.flight === 'F1' && q.dir === 'down' && q.across > 0)!;
  const feet = new Vector3(u.across, 0, 63.0); const vel = { x: 0, z: 0 };
  run(feet, vel, null, 40);
  near(feet.y, -10, 1e-6, 'arrived on L1'); assert.ok(feet.z > u.to, 'pushed onto the landing');
});

test('standing at the end of a conveyor: stable position, no runaway velocity', () => {
  const u = escalatorUnits().find((q) => q.flight === 'F1' && q.dir === 'down' && q.across > 0)!;
  const feet = new Vector3(u.across, -10, u.to + 0.2); const vel = { x: 0, z: 0 };
  run(feet, vel, null, 5);
  const z0 = feet.z; run(feet, vel, null, 5);
  near(feet.z, z0, 0.01, 'stable'); assert.ok(Math.hypot(vel.x, vel.z) < 0.05, `own velocity ${vel.x},${vel.z}`);
});

test('disc: step on, wait 2 s, ride to the Crossing floor, step off south', () => {
  const feet = new Vector3(0, 0, 60); const vel = { x: 0, z: 0 };
  assert.equal(disc.docked, 'top');
  run(feet, vel, new Vector3(0, 0, OCULUS.cz), 6);
  run(feet, vel, null, 40);
  assert.equal(disc.docked, 'bottom'); near(feet.y, DISC.bottomY, 1e-6, 'rider arrived');
  run(feet, vel, new Vector3(0, 0, 66), 6);
  near(feet.y, VESPER.topY, 1e-6, 'on the floor'); assert.ok(feet.z < 68, 'walked off');
});

test('disc comes to a player waiting at the other end; gangway closed while away', () => {
  const feet = new Vector3(0, 0, 60); const vel = { x: 0, z: 0 };
  assert.equal(disc.docked, 'bottom'); assert.equal(heightAt(0, 68, 0), null, 'top gangway closed');
  run(feet, vel, null, 40);
  assert.equal(disc.docked, 'top'); assert.notEqual(heightAt(0, 68, 0), null, 'top gangway open');
});

test('gangway never traps: a player on the gangway when the disc is called away can walk back', () => {
  const feet = new Vector3(0, 0, 68); const vel = { x: 0, z: 0 };
  run(feet, vel, null, 0.5);
  const caller = new Vector3(0, VESPER.topY, 66); // far end
  for (let t = 0; t < 1; t += DT) { disc.update(DT, caller); }
  assert.equal(disc.docked, null, 'disc left to fetch the far caller');
  run(feet, vel, new Vector3(0, 0, 60), 4);
  near(feet.z, 60, 0.2, 'walked back off the gangway'); near(feet.y, 0, 1e-6, 'still on the hall floor');
  for (let t = 0; t < 40; t += DT) disc.update(DT, caller);
});

test('large dt spikes while riding keep the rider on the disc', () => {
  for (let t = 0; t < 40; t += DT) disc.update(DT, new Vector3(0, 0, 66)); // bring it to the top
  assert.equal(disc.docked, 'top');
  const feet = new Vector3(0, 0, OCULUS.cz); const vel = { x: 0, z: 0 };
  run(feet, vel, null, 2.2);
  run(feet, vel, null, 40, 0.05);
  assert.equal(disc.docked, 'bottom'); near(feet.y, DISC.bottomY, 1e-6, 'rider still on the disc');
});
console.log(`\n${passed} metro runtime checks passed`);
```

- [ ] **Step 2: Run to verify it fails**

Add `"metro-runtime-test": "tsx scripts/metro-runtime-test.ts"`. Run it.
Expected: FAIL, cannot resolve `../src/player/walk`.

- [ ] **Step 3: Implement**

`src/metro/escalators.ts`: add inside the class:

```ts
  /** Sensing: units within `senseRadius` of the player (3D, to the step line) run at active speed, others idle. */
  update(dt: number, p: { x: number; y: number; z: number }): void {
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i]!;
      const want = distToUnit(u, p) <= ESCALATOR.senseRadius ? ESCALATOR.activeSpeed : ESCALATOR.idleSpeed;
      const s = this.speeds[i] ?? ESCALATOR.idleSpeed;
      const step = ESCALATOR.accel * dt;
      this.speeds[i] = s < want ? Math.min(want, s + step) : Math.max(want, s - step);
    }
  }
```
and at module level:
```ts
/** Distance from p to the unit's step line (segment from the upper end to the lower end). */
function distToUnit(u: EscalatorUnit, p: { x: number; y: number; z: number }): number {
  const a = u.axis === 'z' ? [u.across, u.yFrom, u.from] : [u.from, u.yFrom, u.across];
  const b = u.axis === 'z' ? [u.across, u.yTo, u.to] : [u.to, u.yTo, u.across];
  const d = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const w = [p.x - a[0]!, p.y - a[1]!, p.z - a[2]!];
  const t = Math.min(1, Math.max(0, (w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!) / (d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2)));
  return Math.hypot(w[0]! - d[0]! * t, w[1]! - d[1]! * t, w[2]! - d[2]! * t);
}
```

`src/metro/disc.ts`:

```ts
import { PLAYER } from '../layout';
import { DISC, GANGWAY, OCULUS, VESPER } from '../layoutMetro';
import { boundsOf, circleShape, type Region } from '../player/regions';

export type DiscEnd = 'top' | 'bottom';
const C = PLAYER.wallClearance;
const LEVEL = 0.6;
const endY = (e: DiscEnd): number => (e === 'top' ? DISC.topY : DISC.bottomY);
/** Gate points on the gangway rims (south of the axis): hall curb and Crossing-floor well. */
const GATE_Z: Record<DiscEnd, number> = { top: OCULUS.cz - OCULUS.curbOuterR - C, bottom: OCULUS.cz - DISC.wellR - C };

/**
 * The Sinking Floor (spec §2.4). Docked at the top at boot. Occupied for DISC.departDelay s => travels to the other end.
 * Unoccupied and the player waits near the other end's gate => travels there empty. Trapezoid speed profile.
 * Real time (not train timescale). Gangways are connectors open only while docked at their end.
 */
export class DiscMover {
  y: number = DISC.topY;
  docked: DiscEnd | null = 'top';
  private target: DiscEnd = 'top';
  private speed = 0;
  private occupiedFor = 0;
  readonly carry = { x: 0, y: 0, z: 0 };
  private cache: Region[] = [];

  constructor() {
    this.rebuild();
  }

  gateOpen(end: DiscEnd): boolean {
    return this.docked === end;
  }

  private onDisc(p: { x: number; y: number; z: number }): boolean {
    return Math.hypot(p.x - OCULUS.cx, p.z - OCULUS.cz) <= DISC.r - C + 1e-6 && Math.abs(p.y - this.y) <= LEVEL;
  }

  private nearGate(end: DiscEnd, p: { x: number; y: number; z: number }): boolean {
    return Math.abs(p.y - endY(end)) <= 1 && Math.hypot(p.x - OCULUS.cx, p.z - GATE_Z[end]) <= DISC.callRadius;
  }

  private depart(to: DiscEnd): void {
    this.docked = null;
    this.target = to;
    this.occupiedFor = 0;
  }

  update(dt: number, p: { x: number; y: number; z: number }): void {
    const prevY = this.y;
    if (this.docked) {
      const other: DiscEnd = this.docked === 'top' ? 'bottom' : 'top';
      const on = this.onDisc(p);
      this.occupiedFor = on ? this.occupiedFor + dt : 0;
      if (this.occupiedFor >= DISC.departDelay) this.depart(other);
      else if (!on && this.nearGate(other, p)) this.depart(other);
    } else {
      const ty = endY(this.target);
      const rem = Math.abs(ty - this.y);
      const want = Math.max(DISC.minSpeed, Math.min(DISC.vmax, Math.sqrt(2 * DISC.accel * rem)));
      this.speed = this.speed < want ? Math.min(want, this.speed + DISC.accel * dt) : want;
      const move = Math.min(rem, this.speed * dt);
      this.y += Math.sign(ty - this.y) * move;
      if (rem - move < 1e-4) {
        this.y = ty;
        this.speed = 0;
        this.docked = this.target;
      }
    }
    this.carry.y = this.y - prevY;
    this.rebuild();
  }

  private rebuild(): void {
    const floor = circleShape(OCULUS.cx, OCULUS.cz, DISC.r - C);
    const w = GANGWAY.halfWidth - C;
    const reach = OCULUS.cz - (DISC.r - C) + 0.5; // overlaps the disc floor
    this.cache = [
      { ...boundsOf(floor), y: this.y, circle: floor, carry: this.carry },
      { xMin: -w, xMax: w, zMin: GATE_Z.top - 0.2, zMax: reach, y: DISC.topY, when: () => this.docked === 'top' },
      { xMin: -w, xMax: w, zMin: GATE_Z.bottom - 0.2, zMax: reach, y: VESPER.topY, when: () => this.docked === 'bottom' },
    ];
  }

  regions(): readonly Region[] {
    return this.cache;
  }
}
export const disc = new DiscMover();
```

`src/metro/runtime.ts`:

```ts
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
```

`src/player/walk.ts`:

```ts
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
```

`src/player/controls.ts`:
- Remove the `ACCEL` / `DECEL` constants; `import { walkStep } from './walk';` and `import { carryAt, heightAt } from './navigation';` (drop `resolve`).
- Replace `private readonly velocity = new THREE.Vector2();` with `private readonly velocity = { x: 0, z: 0 };` and `this.velocity.set(0, 0)` in `setEnabled` with `this.velocity.x = 0; this.velocity.z = 0;`.
- In `update`, right after the `if (!this.enabled || dt <= 0) return;` line insert:
```ts
    // Ride movers (Sinking Floor, cabins): carried by the floor's displacement this frame, eye included (no smoothing lag).
    const carry = carryAt(this.feet.x, this.feet.z, this.feet.y);
    if (carry) {
      this.feet.x += carry.x;
      this.feet.y += carry.y;
      this.feet.z += carry.z;
      this.eyeY += carry.y;
    }
```
- Replace everything from `// Accelerate / decelerate toward the desired velocity` through the end of the `if (this.velocity.lengthSq() > 1e-8) { … }` block with:
```ts
    const moved = walkStep(this.feet, this.velocity, { x: this.desired.x, z: this.desired.y }, dt, this.nextFeet);
```
  and keep `this.syncCamera(dt, moved);`.

- [ ] **Step 4: Run the tests**

Run: `npm run metro-runtime-test && npm run nav-metro-test && npm run nav-regions-test && npm run nav-test && npm run build`
Expected: `7 metro runtime checks passed`; all earlier suites pass; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/metro src/player/walk.ts src/player/controls.ts scripts/metro-runtime-test.ts package.json
git commit -m "Meridian Deep: escalator sensing, Sinking Floor disc, conveyor-aware walking"
```

---

### Task 5: Depth looks, airlock, sun swap, void sun mask (director)

**Files:**
- Create: `src/core/zones.ts`, `src/lighting/sunMask.ts`, `src/lighting/looks.ts`, `scripts/zones-test.ts`
- Modify: `src/lighting/lighting.ts` (export `setSunMode`, parametrise `fitSunShadow`), `src/core/interaction.ts` (underground guard), `package.json`

**Interfaces:**
- Produces: `lookFactor(y)`, `sunWeights(y)`, `Airlock` (`zone`, `update(y): boolean`); `stripDirectionalBlock(chunk)`, `excludeDirectionalLight(mat)`; `setSunMode(sun, mode)`; `DepthLook` (`constructor(deps)`, `update(camY)`, `captureDeep()`, `airlock`, `factor`).
- Consumes: `ZONES`, `DEEP_SUN`, `DEEP_LOOK`, `CAVERN`, `CROSS_OUTLINE` from layout; scene names from Task 6 (`metroDeep`, `metroDeepImpostor`, `metroSurfaceImpostor`, `metroVoid`, `userData.deepMaterials`).

- [ ] **Step 1: Write the failing test** `scripts/zones-test.ts`

```ts
// Depth zones + directional-light mask (Task 5). Run: npm run zones-test
import assert from 'node:assert/strict';
import { ShaderChunk } from 'three';
import { ZONES } from '../src/layout';
import { Airlock, lookFactor, sunWeights } from '../src/core/zones';
import { stripDirectionalBlock } from '../src/lighting/sunMask';

let passed = 0;
const test = (n: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${n}`); };
test('look factor: 0 at the hall, 1 at the Threshold, monotone between', () => {
  assert.equal(lookFactor(1.7), 0); assert.equal(lookFactor(-30), 1);
  let prev = 0;
  for (let y = -4; y >= -30; y -= 0.5) { const f = lookFactor(y); assert.ok(f >= prev - 1e-12); prev = f; }
});
test('both suns are fully off wherever the airlock can switch', () => {
  for (const y of [ZONES.switchY - ZONES.hysteresis, ZONES.switchY, ZONES.switchY + ZONES.hysteresis]) {
    const w = sunWeights(y); assert.equal(w.surface, 0, `surface at ${y}`); assert.equal(w.deep, 0, `deep at ${y}`);
  }
  assert.equal(sunWeights(0).surface, 1); assert.equal(sunWeights(-30).deep, 1);
});
test('airlock hysteresis: oscillating ±0.5 m around the switch toggles once per real crossing', () => {
  const a = new Airlock(1.7); let toggles = 0;
  for (let i = 0; i < 400; i++) if (a.update(ZONES.switchY + (i % 2 ? 0.5 : -0.5))) toggles++;
  assert.equal(toggles, 0, 'no flicker');
  assert.ok(a.update(-20)); assert.equal(a.zone, 'deep');
  for (let i = 0; i < 400; i++) if (a.update(ZONES.switchY + (i % 2 ? 0.5 : -0.5))) toggles++;
  assert.equal(toggles, 0, 'no flicker coming back up');
  assert.ok(a.update(-10)); assert.equal(a.zone, 'surface');
});
test('directional block stripped; point/spot/hemisphere lighting kept', () => {
  const src = ShaderChunk.lights_fragment_begin;
  const out = stripDirectionalBlock(src);
  assert.ok(!out.includes('NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'), 'dir block gone');
  assert.ok(out.includes('NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'), 'point kept');
  assert.ok(out.includes('NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'), 'spot kept');
  assert.ok(out.includes('NUM_HEMI_LIGHTS'), 'hemisphere kept');
  const balance = (s: string) => (s.match(/^\s*#if/gm) ?? []).length - (s.match(/^\s*#endif/gm) ?? []).length;
  assert.equal(balance(out), balance(src), 'preprocessor balanced');
});
console.log(`\n${passed} zone checks passed`);
```

- [ ] **Step 2: Run to verify it fails**

Add `"zones-test": "tsx scripts/zones-test.ts"` and `"metro-test": "npm run metro-layout-test && npm run nav-regions-test && npm run nav-metro-test && npm run metro-runtime-test && npm run zones-test"`.
Run: `npm run zones-test`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the pure modules**

`src/core/zones.ts`:
```ts
import { ZONES } from '../layoutMetro';

/** smoothstep from a (0) to b (1); works for a > b (depth going down). */
function ramp(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/** 0 = surface look, 1 = deep look, from the camera eye height. */
export const lookFactor = (y: number): number => ramp(ZONES.lookTopY, ZONES.lookBottomY, y);
/** Sun intensity weights; both are 0 across the airlock band so the swap is never visible. */
export const sunWeights = (y: number): { surface: number; deep: number } => ({
  surface: 1 - ramp(ZONES.surfaceSunFade[0], ZONES.surfaceSunFade[1], y),
  deep: ramp(ZONES.deepSunFade[0], ZONES.deepSunFade[1], y),
});

export type Zone = 'surface' | 'deep';
/** Which world is drawn. Hysteresis ±ZONES.hysteresis around ZONES.switchY. */
export class Airlock {
  zone: Zone;
  constructor(y: number) {
    this.zone = y < ZONES.switchY ? 'deep' : 'surface';
  }
  /** Returns true when the zone changed. */
  update(y: number): boolean {
    const next: Zone = this.zone === 'surface'
      ? (y < ZONES.switchY - ZONES.hysteresis ? 'deep' : 'surface')
      : (y > ZONES.switchY + ZONES.hysteresis ? 'surface' : 'deep');
    const changed = next !== this.zone;
    this.zone = next;
    return changed;
  }
}
```

`src/lighting/sunMask.ts`:
```ts
import * as THREE from 'three';

const DIR_MARKER = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';

/** lights_fragment_begin without the DirectionalLight block (balanced #if/#endif scan from its line). */
export function stripDirectionalBlock(chunk: string): string {
  const at = chunk.indexOf(DIR_MARKER);
  if (at < 0) throw new Error('sunMask: directional-light block not found (three.js chunk changed)');
  const lineStart = chunk.lastIndexOf('\n', at) + 1;
  const re = /^[ \t]*#(if|ifdef|ifndef|endif)\b.*$/gm;
  re.lastIndex = lineStart;
  let depth = 0;
  for (let m = re.exec(chunk); m; m = re.exec(chunk)) {
    if (m[1] === 'endif') {
      depth--;
      if (depth === 0) return chunk.slice(0, lineStart) + chunk.slice(m.index + m[0].length);
    } else depth++;
  }
  throw new Error('sunMask: unbalanced directional-light block');
}

/**
 * The material ignores every DirectionalLight (the void walls: they sit outside the surface sun's shadow frustum and
 * must never be lit by it; the deep sun is an emitter at the sky plane below them). Hemisphere, probe, point, spot and
 * environment lighting are kept. Light count is unchanged, so no other program recompiles.
 */
export function excludeDirectionalLight(mat: THREE.Material): void {
  const prev = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      stripDirectionalBlock(THREE.ShaderChunk.lights_fragment_begin),
    );
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|noDirLight`;
}
```

Run: `npm run zones-test` → `4 zone checks passed`.

- [ ] **Step 4: Sun modes in `src/lighting/lighting.ts`**

- Change `fitSunShadow(sun)` to `fitSunShadow(sun: THREE.DirectionalLight, dir: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3)`; inside, replace `SUN_DIR.clone()` with `dir.clone()` and the two hard-coded `min` / `max` lines with the parameters. The surface bounds move to module constants:
```ts
const SURFACE_MIN = new THREE.Vector3(CONCOURSE.xMin - 3, -3, LOUNGE_ROOM.zMin - LOUNGE_ROOM.wallThickness - 1.2);
const SURFACE_MAX = new THREE.Vector3(SHED.xMax + 3, VAULT.crownY + 2, SHED.zMax + 2);
const DEEP_MIN = new THREE.Vector3(CAVERN.transept.xMin, CAVERN.yBottom, CAVERN.nave.zMin);
const DEEP_MAX = new THREE.Vector3(CAVERN.transept.xMax, SKY.y, CAVERN.nave.zMax);
const DEEP_DIR = new THREE.Vector3(...DEEP_SUN.direction).normalize();
const DEEP_COLOR = new THREE.Color(...DEEP_SUN.color);
```
- In `buildLighting`: `const { w, h } = fitSunShadow(sun, SUN_DIR, SURFACE_MIN, SURFACE_MAX);` (the map size keeps following the SURFACE aspect; it is never reallocated).
- Export:
```ts
export type SunMode = 'surface' | 'deep';
/** Re-aims the single sun and refits its static shadow camera. Caller sets renderer.shadowMap.needsUpdate. */
export function setSunMode(sun: THREE.DirectionalLight, mode: SunMode): void {
  if (mode === 'surface') {
    sun.color.copy(SUN_COLOR);
    fitSunShadow(sun, SUN_DIR, SURFACE_MIN, SURFACE_MAX);
  } else {
    sun.color.copy(DEEP_COLOR);
    fitSunShadow(sun, DEEP_DIR, DEEP_MIN, DEEP_MAX);
  }
}
```
Run `npm run build`, then `npm run shot -- balcony concourse window --q=high --out=meridian-deep/t5-surface` and compare with Phase 0: the surface must be pixel-identical in composition and light (same shadow fit).

- [ ] **Step 5: `src/lighting/looks.ts`**

```ts
import * as THREE from 'three';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import type { PostFX } from '../core/postfx';
import { Airlock, lookFactor, sunWeights, type Zone } from '../core/zones';
import { DEEP_LOOK, DEEP_SUN } from '../layoutMetro';
import { setSunMode } from './lighting';

interface Look {
  fog: THREE.Color; fogDensity: number; background: THREE.Color; exposure: number; bloom: number; threshold: number;
  split: number; contrast: number; saturation: number; shadowTint: THREE.Color; highlightTint: THREE.Color;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemi: number; probe: number;
}
export interface DepthLookDeps {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; postfx: PostFX;
  /** Every module root except lighting and metro. */
  surfaceRoots: THREE.Object3D[];
  metroRoot: THREE.Object3D;
}
const col = (c: readonly [number, number, number]) => new THREE.Color(c[0], c[1], c[2]);
const req = <T extends THREE.Object3D>(root: THREE.Object3D, name: string): T => {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`DepthLook: missing "${name}"`);
  return o as T;
};
const hasLight = (o: THREE.Object3D): boolean => {
  let found = false;
  o.traverse((c) => { if ((c as THREE.Light).isLight) found = true; });
  return found;
};

/**
 * Depth-driven look (spec §5.1–5.3): blends surface <-> deep look by camera height, runs the airlock (which world is
 * drawn), swaps the single sun's duty at the airlock, and fades practical lights. Surface values are read from the live
 * objects at construction, so today's look (and any ?exp/&bloom look-dev overrides) is preserved exactly.
 */
export class DepthLook {
  readonly airlock: Airlock;
  factor = 0;
  private readonly d: DepthLookDeps;
  private readonly surface: Look;
  private readonly deep: Look;
  private readonly sun: THREE.DirectionalLight;
  private readonly sunSurface: number;
  private readonly fill: THREE.HemisphereLight;
  private readonly probe: THREE.LightProbe;
  private readonly surfaceSH: THREE.SphericalHarmonics3;
  private deepSH: THREE.SphericalHarmonics3 | null = null;
  private readonly dimmable: Array<{ light: THREE.Light; base: number }> = [];
  private readonly toggles: THREE.Object3D[] = [];
  private readonly voidCasters: THREE.Mesh[] = [];
  private readonly deepGroup: THREE.Object3D;
  private readonly deepImpostor: THREE.Object3D;
  private readonly surfaceImpostor: THREE.Object3D;
  private readonly godRaysAllowed: boolean;
  private readonly godRayBase: number;

  constructor(d: DepthLookDeps) {
    this.d = d;
    const { scene, postfx, metroRoot } = d;
    this.sun = req<THREE.DirectionalLight>(scene, 'sun');
    this.sunSurface = this.sun.intensity;
    this.fill = req<THREE.HemisphereLight>(scene, 'skyFill');
    this.probe = req<THREE.LightProbe>(scene, 'giProbe');
    this.surfaceSH = this.probe.sh.clone();
    const fog = scene.fog as THREE.FogExp2;
    const g = postfx.grade;
    this.surface = {
      fog: fog.color.clone(), fogDensity: fog.density, background: (scene.background as THREE.Color).clone(),
      exposure: postfx.exposure.exposure, bloom: postfx.bloom.intensity, threshold: postfx.bloom.luminanceMaterial.threshold,
      split: g.u<number>('uSplit').value, contrast: g.u<number>('uContrast').value, saturation: g.u<number>('uSaturation').value,
      shadowTint: g.u<THREE.Color>('uShadowTint').value.clone(), highlightTint: g.u<THREE.Color>('uHighlightTint').value.clone(),
      hemiSky: this.fill.color.clone(), hemiGround: this.fill.groundColor.clone(), hemi: this.fill.intensity, probe: this.probe.intensity,
    };
    const L = DEEP_LOOK;
    this.deep = {
      fog: col(L.fog), fogDensity: L.fogDensity, background: col(L.background), exposure: L.exposure, bloom: L.bloom,
      threshold: L.bloomThreshold, split: L.split, contrast: L.contrast, saturation: L.saturation,
      shadowTint: col(L.shadowTint), highlightTint: col(L.highlightTint), hemiSky: col(L.hemiSky), hemiGround: col(L.hemiGround),
      hemi: L.hemi, probe: L.probe,
    };
    // Practical lights of the surface fade out with depth.
    const lightingRoot = req(scene, 'lighting');
    for (const root of [lightingRoot, ...d.surfaceRoots]) {
      root.traverse((o) => {
        const l = o as THREE.Light;
        if ((l as THREE.PointLight).isPointLight || (l as THREE.SpotLight).isSpotLight) this.dimmable.push({ light: l, base: l.intensity });
      });
    }
    // Hide renderables only, never lights (hiding a light changes the light count => every program recompiles).
    for (const root of d.surfaceRoots) {
      if (!hasLight(root)) { this.toggles.push(root); continue; }
      for (const c of root.children) {
        if ((c as THREE.Light).isLight) continue;
        if (hasLight(c)) throw new Error(`DepthLook: ${root.name}/${c.name} mixes lights and geometry`);
        this.toggles.push(c);
      }
    }
    req(metroRoot, 'metroVoid').traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).castShadow) this.voidCasters.push(o as THREE.Mesh); });
    this.deepGroup = req(metroRoot, 'metroDeep');
    this.deepImpostor = req(metroRoot, 'metroDeepImpostor');
    this.surfaceImpostor = req(metroRoot, 'metroSurfaceImpostor');
    this.godRaysAllowed = postfx.godRays.enabled;
    this.godRayBase = postfx.godRays.intensity;
    this.airlock = new Airlock(d.camera.position.y);
    this.applyZone(this.airlock.zone);
  }

  /** Per displayed frame, after the camera moved. */
  update(camY: number): void {
    if (this.airlock.update(camY)) this.applyZone(this.airlock.zone);
    this.factor = lookFactor(camY);
    this.blend(this.factor);
    const w = sunWeights(camY);
    this.sun.intensity = this.airlock.zone === 'surface' ? this.sunSurface * w.surface : DEEP_SUN.intensity * w.deep;
    this.d.postfx.godRays.intensity = this.godRayBase * w.surface;
    for (const { light, base } of this.dimmable) light.intensity = base * (1 - this.factor);
  }

  private applyZone(z: Zone): void {
    const deep = z === 'deep';
    for (const o of this.toggles) o.visible = !deep;
    this.deepGroup.visible = deep;
    this.deepImpostor.visible = !deep;
    this.surfaceImpostor.visible = deep;
    for (const m of this.voidCasters) m.castShadow = !deep; // the deep sun is emitted at the sky plane: nothing above it casts
    setSunMode(this.sun, z);
    this.d.renderer.shadowMap.needsUpdate = true;
    this.d.postfx.setGodRaysEnabled(this.godRaysAllowed && !deep);
  }

  private blend(f: number): void {
    const { scene, postfx } = this.d;
    const a = this.surface;
    const b = this.deep;
    const fog = scene.fog as THREE.FogExp2;
    fog.color.lerpColors(a.fog, b.fog, f);
    fog.density = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, f);
    (scene.background as THREE.Color).lerpColors(a.background, b.background, f);
    postfx.exposure.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, f);
    postfx.bloom.intensity = THREE.MathUtils.lerp(a.bloom, b.bloom, f);
    postfx.bloom.luminanceMaterial.threshold = THREE.MathUtils.lerp(a.threshold, b.threshold, f);
    const g = postfx.grade;
    g.u<number>('uSplit').value = THREE.MathUtils.lerp(a.split, b.split, f);
    g.u<number>('uContrast').value = THREE.MathUtils.lerp(a.contrast, b.contrast, f);
    g.u<number>('uSaturation').value = THREE.MathUtils.lerp(a.saturation, b.saturation, f);
    g.u<THREE.Color>('uShadowTint').value.lerpColors(a.shadowTint, b.shadowTint, f);
    g.u<THREE.Color>('uHighlightTint').value.lerpColors(a.highlightTint, b.highlightTint, f);
    this.fill.color.lerpColors(a.hemiSky, b.hemiSky, f);
    this.fill.groundColor.lerpColors(a.hemiGround, b.hemiGround, f);
    this.fill.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, f);
    this.probe.intensity = THREE.MathUtils.lerp(a.probe, b.probe, f);
    if (this.deepSH) {
      const s = this.probe.sh.coefficients;
      for (let i = 0; i < 9; i++) s[i]!.lerpVectors(this.surfaceSH.coefficients[i]!, this.deepSH.coefficients[i]!, f);
    }
  }

  /** One-time deep environment: deep state, deep sun shadow, two-bounce cube capture -> metro materials + SH. */
  async captureDeep(): Promise<void> {
    const { renderer, scene, camera, metroRoot } = this.d;
    const mats = (metroRoot.userData.deepMaterials ?? []) as THREE.MeshStandardMaterial[];
    const saved = this.airlock.zone;
    this.applyZone('deep');
    this.blend(1);
    this.sun.intensity = DEEP_SUN.intensity;
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => { if (o.userData.noCapture && o.visible) { o.visible = false; hidden.push(o); } });
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.LinearFilter });
    const cube = new THREE.CubeCamera(0.2, 800, rt);
    cube.position.set(...DEEP_LOOK.capture);
    scene.add(cube);
    cube.updateMatrixWorld(true);
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      let env: THREE.WebGLRenderTarget | null = null;
      for (let pass = 0; pass < 2; pass++) {
        cube.update(renderer, scene);
        env?.dispose();
        env = pmrem.fromCubemap(rt.texture);
        for (const m of mats) { m.envMap = env.texture; m.needsUpdate = true; }
      }
      try {
        this.deepSH = (await LightProbeGenerator.fromCubeRenderTarget(renderer, rt)).sh.clone();
      } catch (e) {
        console.warn('deep light probe generation failed', e);
      }
    } finally {
      scene.remove(cube);
      pmrem.dispose();
      rt.dispose();
      for (const o of hidden) o.visible = true;
      this.applyZone(saved);
      this.update(camera.position.y);
    }
  }
}
```
Before writing this, verify in `node_modules/postprocessing/types/index.d.ts` that `BloomEffect.luminanceMaterial.threshold` exists in 6.39.5 (`grep -n "luminanceMaterial" node_modules/postprocessing/types/index.d.ts`). If the accessor differs, use the documented one and note it in the commit.

- [ ] **Step 6: Interaction guard** (`src/core/interaction.ts`, `findTarget`)

Replace `if (feet.y > 1.0) return null; // balcony, bridge deck: nothing to press up there` with:
```ts
  if (feet.y > 1.0 || feet.y < -1.0) return null; // balcony, bridge deck, metro: no surface targets there
```

- [ ] **Step 7: Verify and commit** (main wiring happens in Task 6 together with the scene objects this needs)

Run: `npm run metro-test && npm run nav-test && npm run build`. Expected: all pass.
```bash
git add src/core/zones.ts src/lighting/sunMask.ts src/lighting/looks.ts src/lighting/lighting.ts src/core/interaction.ts scripts/zones-test.ts package.json
git commit -m "Meridian Deep: depth looks, airlock, single-sun swap, void sun mask"
```

---

### Task 6: Greybox metro, hall oculus cut, main wiring, presets (director)

**Files:**
- Create: `src/world/metro.ts`, `src/world/metro/greybox.ts`
- Modify: `src/world/concourse/floor.ts` (oculus + throat holes), `src/world/hotel/layoutData.ts` (runner split), `src/main.ts`, `src/core/presets.ts`

**Interfaces:**
- Produces scene names `metro`, `metroVoid`, `metroDeep`, `metroDeepImpostor`, `metroSurfaceImpostor`, `metroDisc`; `metro.userData.deepMaterials`.
- Consumes everything above.

- [ ] **Step 1: Hall floor cut** (`src/world/concourse/floor.ts`, `buildFloor`)

Import `OCULUS, THROAT` from `../../layout`. Add two hole builders and pass them with the medallion hole:
```ts
  const oculus: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    oculus.push([OCULUS.cx + OCULUS.curbOuterR * Math.cos(a), OCULUS.cz + OCULUS.curbOuterR * Math.sin(a)]);
  }
  const throats = THROAT.bands.map(([a, b]) => rectPts(a, THROAT.zMin, b, THROAT.zMax));
  // field with the medallion, oculus and throat holes (non-overlapping: checked by metro-layout-test)
  bags.floor.add(planarShape([-28.94, zS + 1.06, 28.94, zN - 1.06], [hole, oculus, ...throats], 0));
```
(replacing the existing single-hole `bags.floor.add(...)` line). The curb ring (r 9.0–9.6) is built by the metro module.

- [ ] **Step 2: Runner split** (`src/world/hotel/layoutData.ts`)

Replace `{ x: 0, width: RUNNER_WIDTH, z0: KIOSK.center[1] + KIOSK_RING_R, z1: 88 }` with:
```ts
  // The runner leads from the kiosk to the oculus gangway gate, and resumes beyond the oculus to the gates.
  { x: 0, width: RUNNER_WIDTH, z0: KIOSK.center[1] + KIOSK_RING_R, z1: OCULUS.cz - OCULUS.curbOuterR - 0.3 },
  { x: 0, width: RUNNER_WIDTH, z0: OCULUS.cz + OCULUS.curbOuterR + 0.3, z1: 88 },
```
(import `OCULUS` from the layout).

- [ ] **Step 3: `src/world/metro/greybox.ts`** (GREYBOX ONLY: every mesh is replaced in Phases 2–3)

```ts
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CAVERN, CROSS_OUTLINE, DISC, FLIGHTS, FUNICULAR, GLASS_FLOOR, HALCYON, LANDINGS, LIFTS, MAP_WALL, MERIDIAN, OCULUS, SKY,
  THRESHOLD, THROAT, VESPER, VOID, WATER_WALL, voidRadiusAt, DEEP_SUN,
} from '../../layoutMetro';
import { excludeDirectionalLight } from '../../lighting/sunMask';

export interface Greybox {
  voidGroup: THREE.Group; deepGroup: THREE.Group; deepImpostor: THREE.Mesh; surfaceImpostor: THREE.Mesh;
  disc: THREE.Mesh; deepMaterials: THREE.MeshStandardMaterial[];
}

const std = (color: number, roughness = 0.75, metalness = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.Mesh {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return new THREE.Mesh(g, m);
}

/** Flat slab in the XZ plane with holes, top at yTop (shape y = -z, extruded down by `t`). */
function slab(outer: Array<[number, number]>, holes: Array<Array<[number, number]>>, yTop: number, t: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes = holes.map((h) => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, yTop - t, 0);
  return g;
}
const circle = (cx: number, cz: number, r: number, n = 64): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * Math.PI * 2), cz - r * Math.sin((i / n) * Math.PI * 2)] as [number, number]);
const rectPts = (x0: number, z0: number, x1: number, z1: number): Array<[number, number]> => [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];

/** Sloped slab under one flight band (top surface on the step line). */
function flightSlab(m: THREE.Material, axis: 'x' | 'z', a: number, b: number, from: number, to: number, yFrom: number, yTo: number): THREE.Mesh {
  if (to < from) [from, to, yFrom, yTo] = [to, from, yTo, yFrom];
  const len = Math.hypot(to - from, yTo - yFrom);
  const t = 0.9;
  const g = new THREE.BoxGeometry(axis === 'z' ? b - a : len, t, axis === 'z' ? len : b - a);
  g.translate(0, -t / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  const angle = Math.atan2(yTo - yFrom, to - from);
  if (axis === 'z') { mesh.position.set((a + b) / 2, (yFrom + yTo) / 2, (from + to) / 2); mesh.rotation.x = -angle; }
  else { mesh.position.set((from + to) / 2, (yFrom + yTo) / 2, (a + b) / 2); mesh.rotation.z = angle; }
  return mesh;
}

export function buildGreybox(): Greybox {
  const { cx, cz } = OCULUS;
  const stone = std(0xd8d2c6, 0.6);       // honed limestone stand-in
  const darkFloor = std(0x26292d, 0.35);  // terrazzo stand-in
  const steel = std(0xb9c0c6, 0.35, 0.7);
  const trench = std(0x15171a, 0.9);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe3ee, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false });
  const eras = [std(0xbfae93, 0.8), std(0x6f655b, 0.95), std(0xe2ddd3, 0.4)]; // carved stone, strata, polished
  const voidMats = [stone, steel, ...eras];
  for (const m of voidMats) excludeDirectionalLight(m);
  const deepStone = stone.clone(); const deepSteel = steel.clone();
  const deepMaterials = [deepStone, darkFloor, deepSteel, trench];

  // --- void (always drawn) ---------------------------------------------------------------------------
  const V = new THREE.Group(); V.name = 'metroVoid';
  const curb = new THREE.Mesh(slab(circle(cx, cz, OCULUS.curbOuterR), [circle(cx, cz, OCULUS.r)], OCULUS.curbHeight, OCULUS.curbHeight + 1.5), stone);
  const balustrade = new THREE.Mesh(new THREE.CylinderGeometry(OCULUS.balustradeR, OCULUS.balustradeR, 1.0, 96, 1, true), std(0x5a4632, 0.5, 0.6));
  balustrade.position.set(cx, OCULUS.curbHeight + 0.5, cz);
  V.add(curb, balustrade, box(stone, -1.2, -0.3, cz - OCULUS.r, 1.2, 0, cz - DISC.r));
  for (const [a, b] of THROAT.bands) V.add(box(stone, a - 0.1, 0, THROAT.zMin, a, 1.0, THROAT.zMax), box(stone, b, 0, THROAT.zMin, b + 0.1, 1.0, THROAT.zMax));
  VOID.eras.forEach((e, i) => {
    const pts: THREE.Vector2[] = [];
    for (let y = e.yTop; y >= e.yBottom - 1e-6; y -= 0.5) pts.push(new THREE.Vector2(voidRadiusAt(y), y));
    const m = eras[i]!;
    m.side = THREE.BackSide; // seen from inside the void
    const wall = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), m);
    wall.position.set(cx, 0, cz);
    V.add(wall);
  });
  const rings: THREE.BufferGeometry[] = [];
  for (let y = OCULUS.slabUnderY - VOID.lightRingPitch; y > VOID.yBottom; y -= VOID.lightRingPitch) {
    const g = new THREE.TorusGeometry(voidRadiusAt(y) - 0.08, 0.04, 6, 128); g.rotateX(Math.PI / 2); g.translate(cx, y, cz); rings.push(g);
  }
  const ringMesh = new THREE.Mesh(mergeGeometries(rings), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.9) }));
  ringMesh.userData.noShadow = true;
  V.add(ringMesh);
  for (const L of [LANDINGS.L1, LANDINGS.L2, LANDINGS.thresholdBridge]) V.add(box(stone, -L.halfX, L.y - 0.6, L.zMin, L.halfX, L.y, L.zMax));
  // 0.1 m short of the sky plane: the deck underside must not be coplanar with the sky (z-fighting from below).
  V.add(new THREE.Mesh(slab(circle(cx, cz, THRESHOLD.rOuter), [circle(cx, cz, THRESHOLD.rInner)], THRESHOLD.y, THRESHOLD.deckThickness - 0.1), stone));
  // F1–F4 live in the void group (F4 crosses the sky and is seen from both worlds); F5/F6 are deep-only.
  for (const f of FLIGHTS.filter((q) => q.id === 'F1' || q.id === 'F2' || q.id === 'F3' || q.id === 'F4')) {
    for (const [a, b] of f.bands) V.add(flightSlab(steel, f.axis, a, b, f.from, f.to, f.yFrom, f.yTo));
  }
  const discMesh = new THREE.Mesh(new THREE.CylinderGeometry(DISC.r, DISC.r, 0.4, 96), std(0xe8e2d6, 0.3));
  discMesh.geometry.translate(0, -0.2, 0); discMesh.position.set(cx, DISC.topY, cz); discMesh.name = 'metroDisc';
  discMesh.userData.noShadow = true; V.add(discMesh);
  const surfaceImpostor = new THREE.Mesh(new THREE.CircleGeometry(OCULUS.r, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.0, 1.0), fog: false }));
  surfaceImpostor.rotation.x = Math.PI / 2; surfaceImpostor.position.set(cx, OCULUS.slabUnderY - 0.05, cz); surfaceImpostor.name = 'metroSurfaceImpostor';
  surfaceImpostor.userData.noShadow = true;

  // --- deep (drawn below the airlock) ----------------------------------------------------------------
  const D = new THREE.Group(); D.name = 'metroDeep';
  const cross = CROSS_OUTLINE.map(([x, z]) => [x, z] as [number, number]);
  const skyHoles = [circle(cx, cz, SKY.holeR), ...LIFTS.positions.map(([x, z]) => circle(x, z, LIFTS.tubeR + 0.2, 32)), rectPts(FUNICULAR.top[0] + 0.5, FUNICULAR.z - 1.6, FUNICULAR.top[0] + 4, FUNICULAR.z + 1.6)];
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false,
    uniforms: { uSunDir: { value: new THREE.Vector3(...DEEP_SUN.direction).normalize() } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uSunDir; varying vec3 vW;
      void main(){ vec3 d = normalize(vW - cameraPosition); float up = max(d.y, 0.0);
        vec3 col = mix(vec3(0.75,0.85,1.0)*2.6, vec3(0.16,0.36,0.9)*2.2, pow(up, 0.6));
        float s = max(dot(d, uSunDir), 0.0); col += vec3(1.0,0.97,0.9) * (60.0*smoothstep(0.9995,0.9998,s) + 1.5*pow(s,40.0));
        gl_FragColor = vec4(col, 1.0); }`,
  });
  const sky = new THREE.Mesh(slab(cross, skyHoles, SKY.y + 0.02, 0.02), skyMat);
  sky.userData.noShadow = true;
  const holeCaster = new THREE.Mesh(new THREE.CircleGeometry(SKY.holeR, 64), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  holeCaster.rotation.x = -Math.PI / 2; holeCaster.position.set(cx, SKY.y - 0.2, cz); holeCaster.castShadow = true; holeCaster.userData.noCapture = true;
  D.add(sky, holeCaster);
  for (let i = 0; i < cross.length; i++) {
    const [x0, z0] = cross[i]!; const [x1, z1] = cross[(i + 1) % cross.length]!;
    D.add(box(deepStone, Math.min(x0, x1) - 0.5, CAVERN.yBottom, Math.min(z0, z1) - 0.5, Math.max(x0, x1) + 0.5, SKY.y, Math.max(z0, z1) + 0.5));
  }
  D.add(new THREE.Mesh(slab(rectPts(CAVERN.transept.xMin, CAVERN.transept.zMin, CAVERN.transept.xMax, VESPER.floor.zMin - 1.6), [], CAVERN.baseFloorY, 0.3), darkFloor));
  D.add(new THREE.Mesh(slab(rectPts(CAVERN.transept.xMin, VESPER.floor.zMax + 1.6, CAVERN.transept.xMax, CAVERN.transept.zMax), [], CAVERN.baseFloorY, 0.3), darkFloor));
  D.add(new THREE.Mesh(slab(rectPts(CAVERN.nave.xMin, CAVERN.nave.zMin, CAVERN.nave.xMax, CAVERN.transept.zMin), [], CAVERN.baseFloorY, 0.3), darkFloor));
  D.add(new THREE.Mesh(slab(rectPts(CAVERN.nave.xMin, CAVERN.transept.zMax, CAVERN.nave.xMax, CAVERN.nave.zMax), [], CAVERN.baseFloorY, 0.3), darkFloor));
  for (const tz of VESPER.trackZ) D.add(box(trench, CAVERN.transept.xMin, CAVERN.baseFloorY, tz - 1.6, CAVERN.transept.xMax, VESPER.railY, tz + 1.6));
  const fl = VESPER.floor;
  D.add(new THREE.Mesh(slab(rectPts(fl.xMin, fl.zMin, fl.xMax, fl.zMax), [
    circle(cx, cz, DISC.wellR), rectPts(VESPER.f6OpeningX[0], 66, VESPER.f6OpeningX[1], 69.6),
    rectPts(GLASS_FLOOR.xMin, GLASS_FLOOR.zMin, GLASS_FLOOR.xMax, GLASS_FLOOR.zMax),
  ], VESPER.topY, VESPER.slabThickness), darkFloor));
  D.add(new THREE.Mesh(slab(rectPts(GLASS_FLOOR.xMin, GLASS_FLOOR.zMin, GLASS_FLOOR.xMax, GLASS_FLOOR.zMax), LIFTS.positions.map(([x, z]) => circle(x, z, LIFTS.tubeR, 32)), VESPER.topY, 0.08), glass));
  const isl = MERIDIAN.island;
  D.add(new THREE.Mesh(slab(rectPts(isl.xMin, isl.zMin, isl.xMax, isl.zMax), [
    circle(cx, cz, DISC.wellR), ...[[-7.8, -4.2], [4.2, 7.8]].map(([a, b]) => rectPts(a!, MERIDIAN.f5OpeningZ[0], b!, MERIDIAN.f5OpeningZ[1])),
  ], MERIDIAN.topY, MERIDIAN.deckThickness), deepStone));
  D.add(box(deepSteel, -12.3, MERIDIAN.railY - 0.6, isl.zMin - 9, 12.3, MERIDIAN.railY, isl.zMax + 9));
  for (const f of FLIGHTS.filter((q) => q.id === 'F5' || q.id === 'F6')) for (const [a, b] of f.bands) D.add(flightSlab(deepSteel, f.axis, a, b, f.from, f.to, f.yFrom, f.yTo));
  const deepIsland = new THREE.Mesh(new THREE.BoxGeometry(HALCYON.halfLength * 2, 1.2, HALCYON.halfWidth * 2), deepStone);
  deepIsland.rotation.y = -Math.atan2(HALCYON.dir[1], HALCYON.dir[0]); deepIsland.position.set(HALCYON.centre[0], HALCYON.topY - 0.6, HALCYON.centre[1]);
  D.add(deepIsland);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(HALCYON.halfLength * 2 + 20, Math.abs(CAVERN.yBottom - (VESPER.topY - VESPER.slabThickness)), 0.5), deepStone);
    const [ux, uz] = HALCYON.dir;
    wall.rotation.y = deepIsland.rotation.y;
    wall.position.set(HALCYON.centre[0] - uz * side * HALCYON.hallHalfWidth, (CAVERN.yBottom + VESPER.topY - VESPER.slabThickness) / 2, HALCYON.centre[1] + ux * side * HALCYON.hallHalfWidth);
    D.add(wall);
  }
  for (const [x, z] of LIFTS.positions) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(LIFTS.tubeR, LIFTS.tubeR, LIFTS.headY - CAVERN.yBottom, 48, 1, true), glass);
    tube.position.set(x, (LIFTS.headY + CAVERN.yBottom) / 2, z); D.add(tube);
  }
  const [tx, ty] = FUNICULAR.top; const [bx, by] = FUNICULAR.bottom;
  const track = flightSlab(deepSteel, 'x', FUNICULAR.z - 1.3, FUNICULAR.z + 1.3, tx, bx, ty, by);
  const cabin = box(glass, tx, ty, FUNICULAR.z - FUNICULAR.cabinWidth / 2, tx + FUNICULAR.cabinLength, ty + FUNICULAR.cabinHeight, FUNICULAR.z + FUNICULAR.cabinWidth / 2);
  D.add(track, cabin);
  D.add(box(std(0x0c0d0f, 0.25), WATER_WALL.x - 0.6, WATER_WALL.yMin, WATER_WALL.zMin, WATER_WALL.x, WATER_WALL.yMax, WATER_WALL.zMax));
  const map = box(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.8) }), MAP_WALL.xMin, MAP_WALL.yMin, MAP_WALL.z, MAP_WALL.xMax, MAP_WALL.yMax, MAP_WALL.z + 0.1);
  map.userData.noShadow = true; D.add(map);
  const deepImpostor = new THREE.Mesh(new THREE.CircleGeometry(SKY.holeR, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.7, 3.2), fog: false }));
  deepImpostor.rotation.x = -Math.PI / 2; deepImpostor.position.set(cx, SKY.y + 0.1, cz); deepImpostor.name = 'metroDeepImpostor';
  deepImpostor.userData.noShadow = true;
  for (const m of [deepImpostor, surfaceImpostor]) m.userData.noCapture = true;
  return { voidGroup: V, deepGroup: D, deepImpostor, surfaceImpostor, disc: discMesh, deepMaterials };
}
```

- [ ] **Step 4: `src/world/metro.ts`**

```ts
import * as THREE from 'three';
import type { BuildContext, WorldModule } from '../core/types';
import { disc } from '../metro/disc';
import { buildGreybox } from './metro/greybox';

/** Meridian Deep (spec: docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md). Phase 1: greybox. */
export async function buildMetro(_ctx: BuildContext): Promise<WorldModule> {
  const root = new THREE.Group();
  root.name = 'metro';
  const gb = buildGreybox();
  root.add(gb.voidGroup, gb.deepGroup, gb.deepImpostor, gb.surfaceImpostor);
  root.userData.deepMaterials = gb.deepMaterials;
  return {
    name: 'metro',
    object: root,
    update(): void {
      gb.disc.position.y = disc.y;
    },
  };
}
```

- [ ] **Step 5: Wire `src/main.ts`**

- Imports: `buildMetro` from `./world/metro`, `DepthLook` from `./lighting/looks`, `updateMetroRuntime, metroDynamicRegions` from `./metro/runtime`, `disc` from `./metro/disc`, `setDynamicRegions` from `./player/navigation`.
- Before building: `setDynamicRegions(metroDynamicRegions);`
- Append `buildMetro(ctx)` as the LAST entry of the `Promise.all` list.
- After the `for (const m of modules) await m.finalize?.(ctx);` loop and BEFORE the "Guarantee" shadow render:
```ts
  const metroRoot = modules.find((m) => m.name === 'metro')?.object;
  if (!metroRoot) throw new Error('metro module missing');
  const depthLook = new DepthLook({
    renderer, scene, camera, postfx, metroRoot,
    surfaceRoots: modules.filter((m) => m.name !== 'lighting' && m.name !== 'metro').map((m) => m.object),
  });
  await depthLook.captureDeep();
```
- In `tick`, replace `controls.update(dt);` with:
```ts
    updateMetroRuntime(dt, controls.feet); // real time, before the controller (riders are carried this frame)
    controls.update(dt);
```
  and right before `renderer.info.reset();` add `depthLook.update(camera.position.y);`.
- Debug handle (add `metro?: () => unknown;` to the `__meridian` interface):
```ts
  window.__meridian.metro = () => ({ zone: depthLook.airlock.zone, look: depthLook.factor, disc: { y: disc.y, docked: disc.docked }, feet: controls.feet.toArray() });
```

- [ ] **Step 6: Presets** (`src/core/presets.ts`)

Add to `PRESET_NAMES`: `'oculus', 'oculusdown', 'void', 'threshold', 'skyhole', 'crossing', 'meridian', 'glassfloor', 'glassup', 'mapwall', 'waterwall', 'funicular', 'deep'` (the spec calls the bridge view `bridge`, which is already taken by the footbridge; use `meridian`). Import the metro constants and add:
```ts
  oculus: { position: [7, EYE, OCULUS.cz - 20], target: [0, -4, OCULUS.cz], intent: 'From the hall floor south of the oculus: curb, balustrade, chandelier above, light rising.' },
  oculusdown: { position: [2.5, EYE + 0.2, OCULUS.cz - OCULUS.curbOuterR - 0.5], target: [0, -30, OCULUS.cz + 2], fov: 70, intent: 'Leaning over the rail: the void, crisscross flights, the disc, the eclipse far below.' },
  void: { position: [-14, LANDINGS.L1.y + EYE, 81.8], target: [6, -24, 66], fov: 68, intent: 'On L1: era bands, light rings, flights crossing the void.' },
  threshold: { position: [-9.5, THRESHOLD.y + EYE, 82.6], target: [5, -42, 58], fov: 66, intent: 'Threshold: speed gates, F4 dropping through the sky hole.' },
  skyhole: { position: [12, VESPER.topY + EYE, 66], target: [0, SKY.y, OCULUS.cz], fov: 70, intent: 'From the Crossing floor looking up at the eclipse, flights and disc descending out of the sky.' },
  crossing: { position: [-40, VESPER.topY + EYE, 70], target: [20, -52, 78], fov: 66, intent: 'Along the transept: Meridian bridge crossing overhead, sky, funicular beyond.' },
  meridian: { position: [3, MERIDIAN.topY + EYE, 40], target: [0, MERIDIAN.topY - 2, 110], intent: 'On the floating Meridian island looking north along the bridge.' },
  glassfloor: { position: [-24, VESPER.topY + EYE, 66], target: [-16, HALCYON.topY, 80], intent: 'Standing on the glass panel looking down at the Halcyon platform.' },
  glassup: { position: [HALCYON.centre[0], HALCYON.topY + EYE, HALCYON.centre[1]], target: [-10, -40, 80], fov: 72, intent: 'From the Halcyon platform looking up through the glass: bridge, droplets, sky.' },
  mapwall: { position: [0, MERIDIAN.topY + EYE, 70], target: [0, (MAP_WALL.yMin + MAP_WALL.yMax) / 2, MAP_WALL.z], intent: 'From the Meridian island facing the map wall and running clock under the sky.' },
  waterwall: { position: [-40, VESPER.topY + EYE, 74], target: [WATER_WALL.x, -55, 74], intent: 'Crossing floor west end facing the water wall and the Vesper portals.' },
  funicular: { position: [40, VESPER.topY + EYE, 80], target: [FUNICULAR.top[0], -40, FUNICULAR.z], fov: 66, intent: 'From the east floor looking up the funicular track into the sky.' },
  deep: { position: [-35, HALCYON.topY + EYE, 59], target: [0, HALCYON.topY + 1, 94], intent: 'Along the Halcyon platform diagonal.' },
```

- [ ] **Step 7: Build, run all Node suites, screenshot**

Run: `npm run build && npm run metro-test && npm run nav-test`
Run: `npm run shot -- balcony concourse oculus oculusdown void threshold skyhole crossing meridian glassfloor glassup mapwall waterwall funicular deep --q=high --out=meridian-deep/greybox`
Director review of the PNGs: legible massing; sightlines as spec §3; hall unchanged except the oculus and runner; eclipse glow visible from the balcony; deep impostor from above, surface impostor from below; no console errors; deep fps/draw calls printed by the harness. Fix composition problems in layout data (and update the spec) before Task 7.

- [ ] **Step 8: Commit**

```bash
git add src/world/metro.ts src/world/metro/greybox.ts src/world/concourse/floor.ts src/world/hotel/layoutData.ts src/main.ts src/core/presets.ts
git commit -m "Meridian Deep: greybox metro, oculus cut, depth look wiring, presets"
```

---

### Task 7: Phase 1 gate: live route, airlock timing, review (director)

**Files:**
- Create: `scripts/metro-route-test.mjs`
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Write the live route test** (real controls, real GPU)

```js
// Meridian Deep Phase 1 route through the REAL controls: node scripts/metro-route-test.mjs [--headed]
// balcony -> oculus gangway -> disc ride (frame timing across the airlock) -> F6 down/up -> F5/F4/F3/F2/F1 up the up units -> hall.
import { launch, open } from './lib.mjs';
const headed = process.argv.includes('--headed');
const browser = await launch({ headed });
const { page, errors } = await open(browser, 'q=med', { noHmr: true });
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log(`FAIL ${m}`); } else console.log(`ok   ${m}`); };
await page.click('#intro .prompt');
await page.waitForTimeout(2500);
if (!(await page.evaluate(() => window.__meridian.locked()))) { await page.mouse.click(720, 450); await page.waitForTimeout(300); }
if (!(await page.evaluate(() => window.__meridian.locked()))) { console.log('NOTE: no pointer lock'); await browser.close(); process.exit(2); }
const state = () => page.evaluate(() => { const m = window.__meridian; return { yaw: m.camera.rotation.y, fx: m.feet.x, fy: m.feet.y, fz: m.feet.z, metro: m.metro(), prompt: m.ticketUi().prompt }; });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const look = (dyaw) => page.evaluate((mx) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: mx, movementY: 0 })), -dyaw / 0.002);
async function goto(tx, tz, { tol = 0.3, maxMs = 90000 } = {}) {
  await page.keyboard.down('KeyW');
  const t0 = Date.now(); let ok = false; let last = null; let lastT = Date.now();
  for (;;) {
    const s = await state(); const dx = tx - s.fx; const dz = tz - s.fz;
    if (Math.hypot(dx, dz) < tol) { ok = true; break; }
    if (Date.now() - t0 > maxMs) break;
    if (!last || Math.hypot(s.fx - last.fx, s.fz - last.fz) > 0.05) { last = s; lastT = Date.now(); } else if (Date.now() - lastT > 5000) break;
    await look(wrap(Math.atan2(-dx, -dz) - s.yaw) * 0.6);
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('KeyW'); await page.waitForTimeout(300);
  const s = await state();
  check(ok, `reach (${tx}, ${tz}) -> (${s.fx.toFixed(2)}, ${s.fy.toFixed(2)}, ${s.fz.toFixed(2)})`);
  return s;
}
const waitFor = async (pred, ms, label) => { const t0 = Date.now(); for (;;) { const s = await state(); if (pred(s)) return s; if (Date.now() - t0 > ms) { check(false, label); return s; } await page.waitForTimeout(200); } };

await page.evaluate(() => { const d = []; window.__frames = d; let last = performance.now(); const f = (t) => { d.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
for (const [x, z] of [[0, 22], [9, 50], [0, 60], [0, 63.4]]) await goto(x, z, { tol: 0.6 });
await waitFor((s) => s.metro.disc.docked === 'top', 40000, 'disc docked at the top');
await goto(0, 74, { tol: 0.4 });
const f0 = await page.evaluate(() => window.__frames.length);
const arrived = await waitFor((s) => s.metro.disc.docked === 'bottom' && s.fy < -69.9, 60000, 'disc arrived at the Crossing floor');
const frames = await page.evaluate((i) => window.__frames.slice(i), f0);
const sorted = [...frames].sort((a, b) => a - b);
console.log(`disc ride frames: n=${frames.length} p95=${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(1)} ms max=${sorted.at(-1)?.toFixed(1)} ms`);
check(sorted.at(-1) <= 50, `no frame > 50 ms across the airlock (max ${sorted.at(-1)?.toFixed(1)})`);
check(arrived.metro.zone === 'deep', 'zone is deep at the bottom');
// Waypoints skirt the disc well (r 4.4), the F6 floor opening (x -46.7..-40.6, z 65.6..70), the lift tubes, the F5/F4
// footprints and the F5 deck opening; escalators are boarded at their correct ends (tol 0.1 = on the 0.3 m corridor).
const via = async (pts, tol = 0.5) => { for (const [x, z] of pts) await goto(x, z, { tol }); };
await via([[0, 67], [-30, 72], [-50, 72], [-50, 66.8]]);
await goto(-25.2, 66.8, { tol: 0.4 });                                   // F6 down unit
check((await state()).fy < -81.9, 'F6 down to Halcyon');
await goto(-25.2, 68.8, { tol: 0.1 }); await goto(-50, 68.8);            // F6 up unit
check(Math.abs((await state()).fy + 70) < 0.01, 'F6 up to the Crossing floor');
await via([[-50, 72], [-10, 70], [-5, 68], [7.0, 68.5]]);
await goto(7.0, 71.4, { tol: 0.1 }); await goto(7.0, 114.3, { tol: 0.3 }); // F5 up to the Meridian island
check(Math.abs((await state()).fy + 46) < 0.01, 'F5 up to the Meridian island');
await via([[1.0, 114.5], [1.0, 106], [6.5, 100], [6.5, 66], [2.0, 60], [2.0, 51]]);
await goto(7.0, 51.0, { tol: 0.1 }); await goto(7.0, 80.5, { tol: 0.3 });  // F4 up through the sky
check(Math.abs((await state()).fy + 30) < 0.01, 'F4 up to the Threshold');
await goto(0, 93.0, { tol: 0.5 });                                        // Threshold north edge, facing north
check((await state()).prompt === '', 'no surface prompt at the Threshold north edge');
await goto(11.2, 84, { tol: 0.5 });
await goto(11.2, 80.5, { tol: 0.1 }); await goto(11.2, 61.9, { tol: 0.3 }); // F3 up
await goto(7.0, 61.9, { tol: 0.1 }); await goto(7.0, 80.5, { tol: 0.3 });   // F2 up
await goto(11.2, 80.5, { tol: 0.1 }); await goto(11.2, 61.9, { tol: 0.3 }); // F1 up
const top = await state();
check(Math.abs(top.fy) < 0.01 && top.metro.zone === 'surface', 'back on the hall floor, zone surface');
await goto(0, 60, { tol: 0.8 });
check(errors.length === 0, `no console errors (${errors.join(' | ')})`);
await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nPASS');
process.exit(failures ? 1 : 0);
```
Up units: F5/F4/F2 inner x 7.0, F3/F1 outer x 11.2 (`escalatorUnits()`; the down units are 5.0 / 9.2). If the prompt field of `ticketUi()` is `null` rather than `''` when idle, compare with a falsy check instead and note it.

- [ ] **Step 2: Run it**

Run (dev server up): `node scripts/metro-route-test.mjs --headed`
Expected: `PASS`; disc-ride max frame ≤ 50 ms. A failure here blocks the phase. Diagnose with `superpowers:systematic-debugging`; do not loosen thresholds.

- [ ] **Step 3: Regression**

Run: `npm run metro-test && npm run nav-test && npm run graph-test && npm run traffic-sim`, then sequentially `node scripts/walk-test.mjs`, `node scripts/train-test.mjs`, `node scripts/safety-test.mjs`, `node scripts/route-test.mjs`. Expected: identical to Phase 0, except the walk-test route crossing the hall north of the kiosk if it passes through the oculus. If so, the test's waypoint (not the product) changes to skirt the oculus: document it.

- [ ] **Step 4: Performance snapshot**

Run: `npm run shot -- balcony concourse crossing skyhole glassup --q=auto --out=meridian-deep/p1-perf`
Record fps/draw calls/triangles. Hall views must be within baseline + 5 draw calls. Deep views are informative only at greybox (the final budgets are Phase 3/5 gates).

- [ ] **Step 5: Ledger and commit**

Update `docs/TASKS.md`: tick Phase 1 with the measured results (route PASS, max frame, perf numbers, screenshot folder). Then:
```bash
git add scripts/metro-route-test.mjs docs/TASKS.md
git commit -m "Meridian Deep: phase 1 gate (route, airlock timing, perf snapshot)"
```

- [ ] **Step 6: Next plan**

Write `docs/superpowers/plans/2026-10-06-meridian-deep-phase2-descent-plan.md` from the greybox findings, using the same writing-plans standard. Present it to the user before executing Phase 2.
