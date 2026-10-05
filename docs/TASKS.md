# Grand Meridian — Task List

Legend: [x] done & verified · [~] in progress · [ ] todo

## Phase 0 — Design
- [x] Brainstorm with user (role, aesthetic, mood, scale, audio, trains)
- [x] Spec + coordinate contract (`docs/superpowers/specs/2026-10-05-grand-meridian-design.md`)

## Phase 1 — Foundation (1 agent)
- [x] Vite + TS scaffold, pinned deps
- [x] `layout.ts` coordinate contract, `core/types.ts` module interface
- [x] Renderer, loop, post-FX (AO, bloom, tone map, vignette, grain, SMAA)
- [x] Adaptive quality controller (hold ≥ 50 fps)
- [x] Navigation/collision + self-test; first-person controls with head-bob
- [x] Camera presets, intro overlay, debug stats
- [x] Poly Haven CC0 texture fetch + material library
- [x] Screenshot/perf harness (`npm run shot`)
- [x] Director review: build, nav test (7/7), real-GPU screenshots

## Phase 2 — World (3 parallel agents)
- [x] Shared prerequisites: per-agent shot folders, shared dev server, prop obstacle registry
- [~] A: Concourse architecture (vault, coffers, colonnade, windows, balcony, grand stair) + props (clock kiosk, split-flap board, benches, lamps, chandeliers)
- [~] B: Train shed (iron trusses, glass roof, platforms, tracks, buffers, signage) + Art Deco streamliner model + arrive/dwell/depart scheduler
- [~] C: Lighting (static sun shadow, env capture, light probe, bounce lights) + atmosphere (sky, fog, god-ray shafts, dust) + procedural audio
- [ ] Director review: each module screenshots vs. quality bar

## Phase 3 — Integration & polish
- [ ] Full-scene visual pass (light balance, color grade, haze depth)
- [ ] Performance pass on M2 (≥ 50 fps, draw calls < 250, tris < 2.5M, tex < 450 MB)
- [ ] Walk test end to end (balcony → stair → kiosk → arches → platform → haze)
- [ ] Adversarial review of code (bugs, leaks, edge cases)
- [ ] Final screenshots + report to user
