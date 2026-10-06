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
- [x] Performance pass (auto quality converges to 54-60 fps at 1440x900 and 1470x956@2x: `node scripts/perf-test.mjs`; N8AO half-res on all rungs; draw calls ~110, tris ~1.3M, tex ~208 MB)
- [x] Walk test end to end through the real controls (`node scripts/walk-test.mjs`: stair, kiosk/column/track bumps, island B z > 300, 0 console errors)
- [x] Train cycle verified live incl. depart (`node scripts/train-test.mjs`, `?timescale=N`)
- [x] Floor mottling root-caused (env reflection) and fixed; trains never baked into shadow map; ashlar scale; north wall emblem panels
- [x] Adversarial review of code (bugs, leaks, edge cases)
- [ ] Final screenshots + report to user

## Phase 4 — Hotel feel + ticket ritual (spec: `docs/superpowers/specs/2026-10-05-grand-meridian-phase4-hotel-ritual.md`)
- [x] Questions answered, addendum spec written & approved
- [x] Shared prep: layout constants, ticket store, module stubs, audio hooks, obstacle arrays, camera presets (director)
- [x] 4A Systems (browser walk-test route only partly verified — machine overloaded): layered navigation, gate lanes, interaction (E), ticket flow + ticket card UI, scheduler requestTrain, board hook, bell/ticket audio
- [x] 4B Hotel (revised 2026-10-06): SEPARATE first-class lounge room behind the south wall (doors, panelling, sun through windows), booking office, concierge desk, hall warmth 'a bit' (wainscot, runners)
- [x] 4C Structures: brass-and-glass ticket gates (animated paddles), ornate iron footbridge + stairs
- [ ] Director review: screenshots, extended nav/walk tests, perf
- [x] 4D Platform safety: half-height brass-and-glass platform edge doors (open for every stopped train) + glowing amber edge line on approach (starts after 4A/4C finish — shares scheduler + island edges)
- [~] Polish pass: lounge richness (damask/panelling, Persian rugs, chandeliers, piano, paintings), calm balcony rug, clear platform-door glass
- [ ] Final: full walk-test + auto-quality perf on a quiet machine
