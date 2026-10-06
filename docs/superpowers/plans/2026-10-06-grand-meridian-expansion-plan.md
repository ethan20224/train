# Grand Meridian Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved river-city station grounds, winter garden, railway gallery, keyboard-controlled weather/daylight, and physical self-service ticket ritual.

**Architecture:** Execute three subsystem plans in order, keeping the existing module lifecycle, coordinate contract, navigation, and railway interlocking. Environment and kiosks update once per display frame in real time; trains continue to use simulation substeps. Each subsystem has its own behavioural and visual acceptance gate.

**Tech Stack:** Existing Three.js 0.186.1, TypeScript 6.0.3, Vite 8.3.2, postprocessing 6.39.5, n8ao 2.0.1, procedural Web Audio, tsx and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-grand-meridian-river-city-expansion-design.md` — approved 2026-10-06. Read it alongside all three plans.

## Global Constraints

- All new player controls use keys, not clickable buttons, sliders, or menus.
- No people, music, announcements, sitting mechanics, inspection actions, clues, boarding, payments, or explorable city streets.
- Station time remains 6:47; daylight/weather never change printed times or train simulation rate.
- No new dependencies, package upgrades, deployment changes, or replacement of the routing/interlocking system.
- Preserve existing balcony start, booking windows, shops, lounge, ticket gates, footbridge, safety doors, and train APIs.
- Target at least 50 fps in normal-window headed Chrome on the documented M2 MacBook Air; pixel ratio floor 0.85.
- Settled scene caps: 250 draw calls, 2.5M visible triangles, estimated 450 MB resident GPU textures/render targets; these are requirements, not achieved measurements.
- Existing modified `src/trains/scheduler.ts` and untracked route/debug scripts are pre-existing work. Never reset them or include their existing changes in task commits unintentionally. Re-read before editing that module.

## Review Focus

1. Daylight changes during accelerated train runs: light follows real input while tickets and train times remain independent (Environment E2/E5; Kiosks K4).
2. Input or rendering failure during a cube refresh: transient objects/render state are restored and only complete maps publish (Environment E4).
3. A connection is visually open but clearance or a bench blocks it: real controls traverse every threshold and gallery level (Grounds G1/G2/G4).
4. A train commits to departure while its ticket prints: an allocation lease protects the printed identity without clearing the old ticket (Kiosks K1/K2).
5. Clear/night looks expose previous haze-dependent shortcuts: no visible train teleport, hard terrain end, or unlit route (Grounds G3/G5; Kiosks K4).

---

## Plans and execution order

1. [Environment controls and weather](2026-10-06-grand-meridian-environment-plan.md): E1–E5. Working deliverable: original station with keyboard daylight/weather, coherent light/reflections, precipitation and exposure audio.
2. [Station grounds and river city](2026-10-06-grand-meridian-grounds-plan.md): G1–G5. Working deliverable: complete public loop and gallery branch, finished exterior and surroundings under all supported looks.
3. [Ticket kiosks and acceptance](2026-10-06-grand-meridian-kiosks-plan.md): K1–K4. Working deliverable: physical printing/collection, shared ticket allocation, preserved original ritual, and whole-expansion acceptance.

**Do not parallelise implementation across these plans.** Geometry depends on environment/shelter interfaces; kiosks depend on completed placements and traffic allocation. Task reviewers may work independently only after a task's code and evidence are complete. Do not spawn workers until the human has reviewed these plans and selected the execution method.

## Planning baseline and execution preparation

Planning-time checks on 2026-10-06: `npm run build`, all 20 `npm run nav-test` cases, `npm run graph-test`, and `npm run traffic-sim` passed. Traffic PASS is a simulation invariant check, not a visual or browser certification. No new browser/GPU baseline has been claimed.

- [ ] Before product edits, inspect any applicable AGENTS.md and the final checkout state; choose the worktree strategy using the execution skill. Include the current local train changes in the baseline if using a separate checkout; never silently start from remote main and omit them.
- [ ] Start/reuse Vite at port 5173 (`npm run dev -- --host 127.0.0.1`); avoid duplicate servers. Save baseline console logs, screenshots and frame samples under ignored `shots/river-city/baseline/`.
- [ ] Record baseline frame deltas through a bounded browser-injected requestAnimationFrame observer before product edits; this needs no future environment debug API. Use headed hardware-GPU Chrome and record viewport/DPR/quality. K4 integrates the same measurement into the permanent harness; the existing last-five-FPS debug average alone cannot certify the baseline.
- [ ] Run existing build/nav/graph/traffic checks and live walk/train/safety/route tests. Existing live scripts require the server, have their own browser lifetimes, and run sequentially against this machine; do not claim performance from software rendering or overloaded parallel browser tests.
- [ ] Record baseline failures and their exact conditions in `docs/TASKS.md`; investigate failures in a touched subsystem before proceeding. Do not opportunistically fix unrelated issues.
- [ ] After each numbered task: run its stated verification, inspect the task diff, update its checkboxes/evidence, and commit only its paths. With the existing scheduler changes, use selected hunks; do not commit the whole file indiscriminately.

## Completion and handoff

Acceptance is the spec's functional, visual, and sustained performance gate, implemented by K4. A successful build alone is insufficient. Preserve screenshots, timings, hardware/browser/quality details, and any unverified result. No deployment or push is part of this plan.

Recommended execution method: **subagent-driven**, with a fresh reviewer after each task. The 14 tasks cover GPU resource lifetime, world/collision integration, and train allocation; mistakes cross module boundaries and benefit from independent review before subsequent tasks depend on them. Native execution in the current session is also available, with self-checks at each gate and one independent whole-branch review after implementation.

This plan package awaits user review and method selection. Approval of the specification alone does not start product implementation.
