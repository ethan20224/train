# Meridian Deep — Handoff

> **Superseded (2026-11-22): start with the builder handoff package in [`docs/meridian-deep-handoff/`](meridian-deep-handoff/00-START-HERE.md).**
> It holds the current state, the design bible, engineering standards, the task-by-task plans for Phases 3–5, every ruling, and a ready-to-paste kickoff prompt (`KICKOFF-PROMPT.md`). The text below is the historical director's note from Phases 1–2.

Read this first if you are picking up the metro work cold (new session, new agent, or a human).

## What it is
A metro interchange 82 m under the Grand Hall. Concept: **The Crossing + The Buried Sky**. Three lines cross at three depths and angles in one cross-shaped cavern, under an artificial noon sky with a real shadow-casting sun. You enter through an **oculus** in the hall floor north of the clock kiosk. You descend by crisscross escalators through a void whose walls pass through three eras (carved Beaux-Arts stone → raw rock strata → polished modern), or ride the **Sinking Floor** disc. The architecture is "Monolith & Machine": pale honed stone, white onyx, dark terrazzo, brushed steel, champagne aluminium, glass. It should feel hi-tech, never sci-fi. No people, no music, no announcements, no boarding.

- **Spec (binding authority):** `docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md`
- **Master plan + Phase 0–1 detail:** `docs/superpowers/plans/2026-10-06-meridian-deep-plan.md`
- **Phase 2 plan (the descent):** `docs/superpowers/plans/2026-10-06-meridian-deep-phase2-descent-plan.md`
- **Phases 3–5:** outlined in the master plan's phase map. Write each detailed plan after the previous phase gate passes.
- **Progress ledgers (git-ignored, the recovery map):** `.superpowers/sdd/<plan-name>/progress.md`, one per plan. Trust the ledger and `git log` over memory.
- **Branch:** `meridian-deep` (from `main` @ 87366ba). Never commit metro work to `main` directly.

## How the work is run
- Opus directs and reviews. Sonnet subagents implement, one task at a time, via `superpowers:subagent-driven-development`.
- Each task:
  1. Brief file.
  2. Implementer.
  3. Review package (`scripts/review-package` of that skill).
  4. Spec and quality reviewer.
  5. Fix rounds if needed.
  6. Ledger line.
- The director judges every visual from real-GPU screenshots: `npm run shot -- <presets> --out=meridian-deep/<x>`. The dev server is on :5173; reuse it.
- Decisions are recorded in the ledgers as `Ruling: <what> — <why> — <cost if wrong>`.

## Where it stands (2026-10-06)
**Phase 1, foundations + greybox: done except the gate (Task 7).**

| Area | Files | Notes |
|---|---|---|
| Layout data | `src/layoutMetro.ts` | Re-exported from `src/layout.ts`. 13 invariant checks in `scripts/metro-layout-test.ts`. |
| Navigation | `src/player/regions.ts`, `src/player/navigation.ts`, `src/metro/navData.ts` | Circles, oriented boxes, scoped holes, x/z ramps, connectors, conveyors, movers. |
| Runtime | `src/metro/escalators.ts`, `src/metro/disc.ts`, `src/metro/runtime.ts`, `src/player/walk.ts` | Escalator sensing; Sinking Floor (step on, wait 2 s; step off and back on to ride back); conveyor-aware walking. |
| Looks | `src/core/zones.ts`, `src/lighting/looks.ts`, `src/lighting/sunMask.ts` | Depth-blended looks, airlock at camera y −16 that hides the world you're not in, single-sun swap, void ignores the sun. |
| Greybox | `src/world/metro.ts`, `src/world/metro/greybox.ts` | Hall oculus cut, runner split, 13 presets (`oculus`, `oculusdown`, `void`, `threshold`, `skyhole`, `crossing`, `meridian`, `glassfloor`, `glassup`, `mapwall`, `waterwall`, `funicular`, `deep`). |
| Tests | `npm run metro-test`, `npm run nav-test` | `metro-test` aggregates layout, regions, nav-metro, runtime and zones. |

Measured:
- Deep views run at 60 fps with 47–91 draw calls.
- Hall views run at 42–50 fps at q=high in the shot harness. The baseline before the metro was 20–34 fps at q=auto. Hall performance is a pre-existing concern, logged for Phase 5.

**In flight:**
- A NaN-guard pass in post-processing. This fixes a **pre-existing bug on `main`**: three NaN pixels on hall marble get spread by bloom into a big black rectangle.
- Task 7: the live route test `scripts/metro-route-test.mjs` (hall → disc → Halcyon → back up by escalators), with airlock frame timing ≤ 50 ms.
- Phase 2 Task P2-1: shared constants and the metro material kit.

## Key rulings so far (full list in the ledgers)
- Hall props without a `level` apply only at ground y ≥ −5. `heightAt` with no `nearY` returns the level closest to y = 0.
- The disc won't bounce a rider back. You step off and back on to ride again.
- The Halcyon island has a hole under the foot of F6, so riders aren't trapped.
- Hard-coded metro numbers in the greybox and navData are being moved into `layoutMetro` in P2-1.
- Hall performance is measured as a delta against the Phase 0 baseline. Deep performance is measured in absolute terms.

## Next steps
1. Finish Task 7, the Phase 1 gate. If it passes, tick Phase 1 in `docs/TASKS.md`.
2. Phase 2 tasks P2-1 … P2-6 from the Phase 2 plan.
3. Write the Phase 3 plan (the cavern).
4. Phase 4 (metro trains, map wall, droplets).
5. Phase 5 (sound, look-dev, performance pass including the hall, full acceptance).
6. Final whole-branch review on the most capable model, then `superpowers:finishing-a-development-branch`. Merging to `main` needs the user's OK.

## User requirement (2026-10-06): performance floor
The finished station — **hall included** — must hold **≥ 45 fps** on the M2 MacBook Air (normal-window Chrome, auto quality). Metro views keep the stricter ≥ 50 fps spec target. The hall is already below 45 in the Phase 0 baseline (pre-existing), so **Phase 5 includes a hall optimization pass** and the final gate measures every preset in headed real-GPU Chrome.
