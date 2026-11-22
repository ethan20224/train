# 09 — Operating guide for Gemini 4 Neon (read this right after `00`)

This package was written by a Claude model (the director). You are **Gemini 4 Neon**, most likely running in **Google Antigravity**. This page translates the package to your environment and protects against the specific ways a strong model can still miss the director's bar on this project. Everything here **adds to** `00`–`08`; nothing relaxes them.

Facts about you that shaped this guide (from your model card, Nov 2026):
- knowledge cutoff March 2026
- text, image, audio and video input
- 1M-token context, about 64K synchronous output
- thinking levels low / medium / high / xhigh
- built for long-running, tool-heavy agent workflows with sub-agents
- positioned below Gemini 4 Carbon for the very hardest long-horizon work

---

## 1. Your knowledge is older than this project's libraries: read the source, not your memory

This project pins **three 0.186.1**, **postprocessing 6.39.5** and **n8ao 2.0.1**. Some of these may postdate your training, and three.js changes its internals often.

- **Before using any three.js / postprocessing API or shader chunk you haven't seen in this repo, open it in `node_modules`** and confirm the name, signature and behaviour:
  - shader chunks: `node_modules/three/src/renderers/shaders/ShaderChunk/*.glsl.js`
  - lights: `node_modules/three/src/renderers/webgl/WebGLLights.js`
  - postprocessing typings: `node_modules/postprocessing/types/index.d.ts`
- **Copy the patterns already in this codebase** instead of patterns from memory. They are proven against these exact versions.
- **Version facts already verified here:**
  - `THREE.PCFSoftShadowMap` is deprecated in r186; the code uses `PCFShadowMap` (`src/main.ts`).
  - `lights_fragment_begin` has separate `NUM_DIR_LIGHTS` and `NUM_SUN_LIGHTS` blocks. A `DirectionalLight` uses the **DIR** block (`src/lighting/sunMask.ts` strips exactly that block and throws if the chunk changes).
  - postprocessing: `BloomEffect.luminanceMaterial.threshold` exists. A custom `Effect` with the default `BlendFunction.NORMAL` does **not** remove NaN (it mixes); use `BlendFunction.SRC` for pass-through replacement (`NanGuardEffect` in `src/lighting/grade.ts`).
  - The renderer uses `NoToneMapping`; tone mapping and the colour grade happen in post (`src/core/postfx.ts`). Emissive HDR values > 1 are expected and bloom.
  - `MeshPhysicalMaterial` transmission adds a full extra render pass. It is banned here (`03` §2.7).
- If a test or the build contradicts what you "know", **the repo is right.** Find out why before changing anything.

## 2. Thinking level per kind of work

| Work | Level |
|---|---|
| Reading the package, planning a phase, **any visual judgment or screenshot review**, shader design (sky, water, droplets, light-wave, halo), mover state machines, performance investigation | **xhigh** |
| Building geometry and materials to a precise spec, wiring, navigation regions, tests | **high** (default) |
| Mechanical edits (renames, constant moves, adding a preset, ledger lines) | medium |

Never use low on this project. Thinking tokens are cheap next to a rejected visual round.

**If you have access to Gemini 4 Carbon,** consider delegating the four hardest creative tasks to it, or reviewing them with it: P3-2 sky, P3-7 water wall, P4-3 light-wave choreography and P4-4 droplets. Otherwise run them at xhigh and plan an extra iteration.

## 3. Use your eyes, in writing: the scored screenshot review

You can read images directly. That is the most important skill on this project. A glance is not a review. For **every** screenshot that gates a task, write this critique (in your reasoning or the ledger), then decide:

```
Shot: <preset> (<folder>)
Feeling target (02 §1/§6): <one line>        Achieved? <yes/no + why>
A First impression  /10:  ...
B Vocabulary & taste /10: ...  (anything chunky? any glow that isn't a fixture? wrong era?)
C Materials         /10:  ...  (metal reads metal? glass reads glass? texture scale vs 1.7 m eye?)
D Light             /10:  ...  (every bright area has a source? crisp sun shadows? no black pockets / blown planes?)
E Construction      /10:  ...  (z-fight, gaps, floating, leaks, razor edges, nav-edge agreement)
F Budget: calls __ / tris __ (limit __)
G vs refs: closer to good-__ than to bad-__ because ...
Verdict: PASS only if every score >= 8 and F within budget; else list the exact fixes.
```

**Calibration** (open these images and score them once before your first review, so your scale matches the director's):

| Image | Score |
|---|---|
| `refs/good-01`, `good-02`, `good-04`, `good-05` | 8–9 in every section |
| `refs/good-06` (train) | 8–9 for form and material; the brown body is only the hall env, not a defect |
| `refs/bad-01`, `bad-03`, `bad-05`, `bad-07`, `bad-09` | 3–5 in B or C: these were rejected |
| `refs/residual-06` | ~6–7 in C: accepted only temporarily |

If your scores for the bad images come out above 6, recalibrate: you are being too generous.

**Never** accept a visual on the first render by default. The director's own agents needed one or two rounds on the train, terrazzo and gates (lesson L12).

## 4. Long-horizon discipline (this is a multi-week build)

- **Load the package fully at the start** (`00`–`09`, the spec, `refs/`). You have the context for it.
- **Re-read the exact task section, `02` §2 and `03` §5 at the start of every task anyway.** Long sessions dilute attention; the pitfalls in `03` §5 are the ones that recur.
- **The ledger is your memory.** Append to `docs/meridian-deep-handoff/LEDGER.md` after every task and every ruling. If your session restarts, read `LEDGER.md` and `git log --oneline -30` before anything else; trust them over recollection.
- **One task at a time, finished and committed, before the next.** No half-done parallel work in shared files (`layoutMetro.ts`, `metro.ts`, `presets.ts`, `navData.ts`).
- **Don't drift.** If you catch yourself redesigning something the package decided, stop and re-read `00` §2 (precedence).

## 5. Sub-agents (Antigravity's agent manager, or equivalent)

The director worked as orchestrator and reviewer, with fresh implementers per task. You can do the same:

- **Give each implementer only its task:** the task text from `05`/`06`/`07`, plus `02` §2–§7, plus `03` §2 and §5, plus the file paths it touches. Never "read the whole package".
- **Require each implementer to return:** files changed, tests run with output, screenshot folder, and calls/tris per shot.
- **Review every implementer's diff and screenshots yourself** with §3 before accepting. **An implementer's "looks great" counts for nothing.**
- **One implementer per shared file at a time.** Implementers commit only their own paths.

## 6. Hallucination guards (your model card names hallucination as a limitation)

- **Never cite a file, function, preset, constant or command you haven't opened or run in this session.** Grep first.
- **Never report a number** (fps, calls, triangles, test counts) you didn't read from tool output in this session.
- When a doc here states a fact about the code and the code disagrees, record a ruling and follow the code (`03` header).
- **Status reports to Ethan contain only what you verified.** Separate "done and verified" from "not yet checked".

## 7. Environment translation (Claude-specific mentions in the package)

| Package says | In your environment |
|---|---|
| `superpowers:subagent-driven-development` skill | Not available. Use §5 with Antigravity's agent manager, or work solo with the `00` §5 loop. |
| "most capable model" for reviews | Gemini 4 Carbon if available; otherwise yourself at xhigh. |
| Commit attribution `Co-Authored-By: Claude Opus 5.5 …` | Use your own environment's attribution line (or none). Keep the subject style. |
| "director" | The previous Claude agent whose taste this package encodes. Ethan may also ask it to review your phase gates. |
| `npm run shot`, `scripts/*.mjs` | Same: plain Node + Playwright scripts, run from a terminal. Antigravity's built-in browser is fine for exploring, but **the scripts' screenshots and `perf-presets.mjs` numbers are the gate evidence.** |

## 8. Phase-gate review option

Ethan may bring your phase-gate screenshots to the director (the Claude agent) for an independent taste review. Make that easy: at each gate, put the gate screenshots as JPEGs in `docs/meridian-deep-handoff/evidence/<phase>/`, with a short `README.md` listing preset, calls/tris and your §3 scores. Treat any returned findings as binding fix items.
