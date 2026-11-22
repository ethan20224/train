# Meridian Deep — Builder Handoff Package

**You are the builder of the rest of Meridian Deep** (the metro under the Grand Hall): Phases 3, 4 and 5. The previous agent was the *director*. It designed the metro with the user, built Phases 1–2 to its standard, and wrote this package so that you finish the job **exactly to that standard, in that taste, with no compromise**.

This package is the director's voice. Where it is specific, follow it to the letter. Where it is silent, follow the spec. Where both are silent, choose what best fits `02-DESIGN-BIBLE.md` and record a ruling (see `04-WORKFLOW-AND-QA.md`). **Do not redesign.** The concept, layout and architecture are decided and approved by the user.

---

## 1. Read in this order (about 90 minutes, and worth it)

| # | File | What it gives you |
|---|---|---|
| 1 | `00-START-HERE.md` (this file) | Mission, rules, definition of done, how to work |
| 2 | `01-STATE-OF-THE-BUILD.md` | What exists, what is greybox, open items, numbers |
| 3 | `02-DESIGN-BIBLE.md` + `refs/` images | **The taste.** What "good" looks like, what got rejected and why |
| 4 | `03-ENGINEERING-STANDARDS.md` | How this codebase works, Three.js rules, budgets, pitfalls that already bit us |
| 5 | `04-WORKFLOW-AND-QA.md` | Commands, the screenshot review checklist, gates, git, how to report |
| 6 | `docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md` | The approved spec (§2 coordinates, §4 architecture, §5 systems) |
| 7 | `05-PHASE-3-CAVERN.md` | Your first phase, task by task |
| 8 | `06-PHASE-4-METRO.md` | Trains, light-wave, droplets, map wall |
| 9 | `07-PHASE-5-SOUND-POLISH-ACCEPTANCE.md` | Sound, look-dev, performance (including the hall), final acceptance |
| 10 | `08-RULINGS-AND-LESSONS.md` | Every decision already taken, and every mistake already made once |
| 11 | `09-FOR-GEMINI-4-NEON.md` | Operating guide for the intended builder model: version traps, thinking levels, the scored screenshot review, long-horizon discipline. **If you are Gemini 4 Neon, read it right after this file.** Any other model: read it anyway; the review method is mandatory for everyone |

Open every image in `refs/` while reading the Design Bible. They are the calibration.

## 2. Precedence when documents disagree

1. The **user's** direct instructions in your session.
2. This package: `08-RULINGS-AND-LESSONS.md`, then the phase docs `05`–`07`, then `02`/`03`/`04`. These are the newest decisions.
3. The spec (`docs/superpowers/specs/2026-10-06-meridian-deep-metro-design.md`).
4. The old plan files in `docs/superpowers/plans/2026-10-06-meridian-deep-phase3-cavern-plan.md` and `...-phase4-metro-plan.md`. **Superseded** by `05` and `06`. Read them only for background.

## 3. Non-negotiables (break one and the work is rejected)

1. **Performance floor: the whole station, hall included, holds ≥ 45 fps** on the user's M2 MacBook Air (8 GB, fanless), normal-window Chrome, auto quality. Metro views hold ≥ 50 fps. Measure headed on a quiet machine (`04` §3), never guess.
2. **No people, no music, no spoken announcements, no boarding of trains.** Silence and emptiness are part of the design.
3. **Hi-tech, never sci-fi.** No holograms, neon, floating UI, glowing blue panels, spaceship curves, greebles. Everything must look buildable in Tokyo or Copenhagen in 2035.
4. **Two vocabularies, never mixed.** Above the hall slab and in the void's stone band: Beaux-Arts (carved stone, bronze, brass, mouldings). From the polished band down, and in the whole cavern: Monolith & Machine (honed pale limestone, white onyx, dark terrazzo, brushed stainless, champagne aluminium, ultra-clear glass).
5. **`src/layoutMetro.ts` is the only home of metro coordinates and cross-module dimensions.** Micro-detail profile values may be named constants at the top of a builder file. Never inline magic numbers.
6. **No new real lights, and never toggle a light's visibility.** Light is emissive geometry, environment maps, the hemisphere/probe and the single sun. Hiding a light changes the light count and recompiles every shader.
7. **Navigation is the truth for where you can walk.** Every walkable change gets a navigation test, every mover is tested both ways, and visuals agree with navigation (balustrades exactly at nav edges, gates open exactly when walkable).
8. **Proof, not claims.** Every visual claim has a real-GPU screenshot that you looked at and judged with the checklist in `04` §4. Every logic claim has a passing test you ran. "It builds" is not done.
9. **Never modify the hall's look** except where a phase doc says so. Hall materials are shared library instances; never mutate them or give them metro environment maps.
10. **No new npm dependencies.** Pure Three.js 0.186.1 + postprocessing 6.39.5 + n8ao 2.0.1, procedural Web Audio.

## 4. Definition of done (the whole project)

The project is done when **all** of these are true and evidenced in `docs/TASKS.md`:

- Every task in `05`, `06`, `07` is complete and passed its acceptance checks.
- No greybox geometry remains anywhere (delete `src/world/metro/greybox.ts`; move the impostors into a real module).
- `npm run build`, `npm run metro-test`, `npm run nav-test`, `npm run graph-test` and `npm run traffic-sim` pass. The train tests pass. `node scripts/metro-route-test.mjs` passes with the extended route (hall → disc → Crossing → lifts → funicular → Halcyon → back up by escalators) and **no frame over 50 ms on the whole route**.
- `node scripts/perf-presets.mjs` (headed, quiet machine, both sizes) shows **every** preset at ≥ 45 fps, metro presets ≥ 50, with four trains present in deep views.
- Every signature moment from the spec exists and has a preset that composes it beautifully (list in `02` §6).
- A final whole-branch review on the most capable model you have is clean, or each finding is fixed or has a recorded ruling.
- The user has seen it on `http://localhost:5173` and **the user approves** before anything merges to `main`.

## 5. How to work (the loop for every task)

1. Read the task in the phase doc **and** the spec sections it names. Read every file you will touch, fully, before editing.
2. Write down (in your plan or ledger) the exact geometry, materials and light you will build, with numbers from `layoutMetro.ts`.
3. For logic (movers, timetable, navigation): write the failing test first, then the code (TDD).
4. Build. Keep files focused (one responsibility each, matching the existing `src/world/metro/*.ts` pattern).
5. Run `npm run build && npm run metro-test && npm run nav-test`.
6. Take the task's screenshots (`04` §2). **Look at every one.** Run the review checklist (`04` §4) and compare with `refs/`. Iterate until it would make the user say "wow". Good enough is not the bar.
7. Check the budget readout (draw calls, triangles) on the shots.
8. Commit only the task's files, with a message that ends with the co-author line used in this repo (see `04` §5).
9. Write one ledger line: what was done, the commits, the evidence, and any rulings.

**If you can delegate to subagents:** the director's method was one fresh implementer per task, then an independent reviewer (spec compliance + code quality), then fix rounds, then the director's own screenshot review. If your environment has the `superpowers:subagent-driven-development` skill, use it. Give implementers the task text from the phase doc plus the relevant sections of `02` and `03`; never make them read the whole package. Use your most capable model for visual and shader-heavy tasks. **You** still look at every screenshot yourself before accepting.

**If you work alone:** do the loop yourself and be your own harsh reviewer. Before accepting each task, re-read `02` §2 (the taste rules) and `04` §4 (the checklist).

## 6. First session checklist

```bash
cd /path/to/Marble            # or: git clone https://github.com/ethan20224/train && cd train
git checkout meridian-deep    # ALL metro work lives here; never commit metro work to main
git log --oneline -5          # top should be the handoff commit, then 500a0ed (WIP)
npm install                   # only if node_modules is missing
npm run build && npm run metro-test && npm run nav-test
npm run dev -- --host 127.0.0.1    # one dev server on :5173; reuse it, never start a second
```

Then:
- Open `http://localhost:5173`, click to enter, walk north past the clock to the oculus, ride the escalators down through the void and the disc back up. Feel what exists.
- Open `?cam=crossing&autostart=1&debug=1` and `?cam=strata&autostart=1&debug=1` and compare with `refs/now-01-crossing-greybox.jpg` and `refs/good-01-void-three-eras.jpg`.
- **Verify the WIP commit `500a0ed`** before building on it (see `01` §4). It is the first item in Phase 3.

## 7. Talking to the user

- The user (Ethan) is **not technical**. His strengths are vision and taste. Report in plain language, short, with what he can see and where (a localhost link plus a preset URL), and attach or point to screenshots.
- Be honest: measured numbers, not hopes. If something failed, say so and say what you are doing about it.
- Ask him only for decisions that are genuinely his (taste trade-offs that the package does not settle, anything irreversible, merging to `main`). Everything else, decide using this package and record a ruling.
- He cares about: the wow moment, performance on his MacBook Air, and no "AI slop" (generic, sloppy, clichéd results).
