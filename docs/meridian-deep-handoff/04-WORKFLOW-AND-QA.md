# 04 — Workflow, Review Checklist, Gates

## 1. Commands

```bash
npm run dev -- --host 127.0.0.1          # ONE dev server on :5173. Reuse it. Never start a second; never kill one you didn't start.
npm run build                            # tsc + vite; must be clean
npm run metro-test                       # metro Node suites (layout, regions, nav-metro, runtime, zones, escalator phase)
npm run nav-test                         # hall + platform navigation (20 cases), must stay green
npm run graph-test && npm run traffic-sim  # mainline rail system, must stay green
node_modules/.bin/tsx scripts/metro-train-test.ts       # timetable (until P4-W adds it to metro-test)
node_modules/.bin/tsx scripts/metro-trainmodel-test.ts  # train model
node scripts/metro-route-test.mjs [--headed]            # live walk with real controls + frame gate (exit 2 = no pointer lock: retry --headed)
npm run shot -- crossing skyhole --q=high --out=meridian-deep/p3-1   # screenshots -> shots/meridian-deep/p3-1/*.png (+ calls/tris readout)
node scripts/perf-presets.mjs balcony,crossing --sizes=1440x900@1,1470x956@2 --warm=10 --secs=20   # REAL perf (headed)
node scripts/walk-test.mjs && node scripts/train-test.mjs && node scripts/safety-test.mjs && node scripts/route-test.mjs  # regression at gates (sequential!)
```

**Rules:**
- Run browser scripts **one at a time**. The fanless M2 throttles, and parallel runs made numbers worthless.
- `shots/` is git-ignored. Keep a few key images per task by copying them (as JPEG) into `docs/meridian-deep-handoff/evidence/<task>/` if you want them in the repo.
- `shot.mjs` once hung on the `deep` preset; if it hangs, take that shot with a small Playwright script using `scripts/lib.mjs` (`launch`, `open`).

## 2. Screenshot protocol for every visual task

1. Build passes, tests pass.
2. Shoot the task's presets at `--q=high` (look) and note the draw calls and triangles printed for each.
3. **Read every PNG yourself.** Don't trust a subagent's "looks good".
4. Run the checklist in §4, then compare against the `refs/` images named in the task.
5. If anything fails, fix and re-shoot into a new folder (`p3-1-v2`, `-v3`, …) so the history stays visible.
6. For animated features (escalators, droplets, light-wave, doors), take two shots 0.5–1 s apart (Playwright) and confirm the motion is what you intended.
7. For perf-sensitive tasks, finish with `perf-presets.mjs` on the affected presets, headed and quiet.

## 3. Performance protocol

- **Quiet machine:** close other Chrome windows, no other tests or agents running, laptop on power.
- Measure with `node scripts/perf-presets.mjs <presets> --sizes=1440x900@1,1470x956@2` (headed, auto quality, 10 s warm-up, 20 s sample).
- Report avg fps, p95 ms, max ms, draw calls, triangles and the final quality rung and pixel ratio.
- A preset "passes" only if avg ≥ 45 (hall) / ≥ 50 (metro) **at both sizes**, and for metro presets the final pixel ratio is ≥ 1.0. Auto quality lowers the pixel ratio to protect fps, so a pass bought by blurring the image is not a pass.
- **Hall regression tolerance during Phases 3–4:** each hall preset must stay within 3 fps of its Phase 2 number (`01` §5) at a pixel ratio no lower than it had then. The fanless laptop varies run to run, so re-run once before calling a regression.
- If it fails, find the cause with evidence: draw calls, triangles, a shader (A/B by hiding objects or switching a material), post cost (`?nogr=1`, `?noao=1`). **Never** pass by lowering quality defaults or quietly dropping scope.

## 4. The director's review checklist (run it on every screenshot)

**A. First impression (2 seconds)**
- Does it produce the feeling `02` §1 assigns to this place? Would Ethan say "wow"?
- Is there a clear focal point and a deliberate composition?

**B. Vocabulary and taste** (`02` §2, §7)
- Right era for this zone? No Beaux-Arts in the cavern, no Monolith in the hall.
- Anything chunky that should be slender? Anything glowing that isn't a fixture?
- Anything on the banned list?

**C. Materials**
- Does metal read as metal, glass as glass, stone as stone, **at this distance and in this zone's light**? Nothing painted, plastic or woody where it should be metal.
- Is the texture scale believable against a 1.7 m eye height? Any visible tiling? Any stretched UVs?
- Terrazzo fine and dark; limestone pale and matte; onyx glowing with structure.

**D. Light**
- Does every bright area have a source?
- Deep-sun shadows present and crisp where the sun reaches?
- No black unlit pockets and no flat blown-white walls.
- Cove lights make deck edges float; slots and reveals are thin and precise.

**E. Construction quality**
- No z-fighting or coplanar flicker, no gaps or light leaks, no floating or interpenetrating geometry.
- Edges have chamfers or reveals; nothing razor-sharp at architectural scale.
- Balustrades and edges exactly where navigation edges are; openings exactly at escalator mouths and gates.

**F. Budget**
- Draw calls and triangles within the task budget (`03` §3).

**G. Compared with references**
- Is it at least as good as the `good-*` images in craft? Is it free of every mistake in the `bad-*` images?

A shot passes only when **every** section passes. If you are unsure, it doesn't pass yet.

## 5. Git rules

- Branch `meridian-deep` only. **Never commit to `main`.** Merging to `main` needs Ethan's explicit approval.
- Commit per task (or per fix round), staging **only that task's files** by explicit path (`git add path/a path/b`), never `git add -A`.
- Message: a short imperative subject (`Meridian Deep P3-2: the buried sky (window-to-infinity shader, slot casters)`), a body explaining what and why if non-obvious, ending with your environment's attribution line. This repo has used `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Push `meridian-deep` to `origin` (`https://github.com/ethan20224/train`) at the end of each phase gate, so work is never only local.
- Never rewrite published history (no force-push, no rebase of pushed commits).

## 6. Ledger and rulings (so decisions survive)

- `docs/TASKS.md` is the committed progress record. Tick each phase with its measured gate results, in the style of the existing Meridian Deep lines.
- `docs/meridian-deep-handoff/LEDGER.md` is the committed decision log. Append one line per task completion and **one line per decision you take** where this package was silent:
  `Ruling: <what you decided> — <why> — <what it costs if wrong>`
- If you are interrupted or your context is compacted, the ledger plus `git log` is your recovery map. Trust them over memory.

## 7. Phase gates (what must be true before the next phase starts)

| Gate | Evidence required |
|---|---|
| **Phase 3 (cavern)** | No greybox left in the cavern; every Phase 3 preset passes the §4 checklist; route test extended (lifts, funicular) passes with no frame over 50 ms; deep worst view ≤ 220 calls / ≤ 2.0 M tris; perf-presets on all deep presets ≥ 50 fps at both sizes **at a final pixel ratio ≥ 1.0**; hall presets within the §3 tolerance of `01` §5; `docs/TASKS.md` updated; pushed |
| **Phase 4 (metro)** | Trains run on all six tracks; doors align on every stop; light-wave, droplets and map in sync after `?timescale=20`; deep views with 4 trains ≥ 50 fps **at a final pixel ratio ≥ 1.0**; route test dwell passes; pushed |
| **Phase 5 (acceptance)** | Everything in `00` §4 (definition of done) |

## 8. Reporting to Ethan

Short, plain, honest, visual. Template:

> **Done: the buried sky.** You can see it at http://localhost:5173/?cam=sun&autostart=1. Or walk: oculus → escalators → down through the Threshold.
> What it looks like: (1–2 sentences of what he'll see).
> Numbers: deep views 58 fps (floor is 50), hall unchanged.
> Not right yet: (anything honest).
> Next: (one line).

- Don't explain internals unless he asks.
- Never claim something works without having seen it work.
