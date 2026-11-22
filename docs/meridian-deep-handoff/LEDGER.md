# Meridian Deep — Builder Ledger (Phases 3–5)

Append one line per completed task, and one line per decision where the handoff package was silent. This file is committed: it is the recovery map if a session is interrupted. Rulings already taken before the handoff are in `08-RULINGS-AND-LESSONS.md`.

Formats:
- `P3-1: complete (commits abc1234..def5678) — evidence: shots/meridian-deep/p3-1-v2, crossing 61 calls / 1.1 M tris, perf crossing 59.8 fps @2`
- `Ruling: <what you decided> — <why> — <what it costs if wrong>`
- `P3-2: minor (deferred): <one-liner>`

## Calibration (09 §3)

Scored before writing any code to calibrate against the director's scale (`refs/`):
- `refs/good-01-void-three-eras.jpg`: A 9, B 9, C 8.5, D 9, E 8.5 — PASS. Three-era progression (2700 / 4300 / 5800 K) reads unmistakably; crisp glass-and-steel landings and metronomic rings.
- `refs/good-02-escalator-ride.jpg`: A 9, B 8.5, C 8.5, D 9, E 8.5 — PASS. Genuine vertigo and luxury; grooved treads, ultra-clear glass, rock strata overhead; slight newel boxiness noted for P5-2.
- `refs/good-04-sinking-floor-medallion.jpg`: A 9, B 9, C 9, D 9, E 9 — PASS. Seamless 1910 Beaux-Arts hall marble, dark marble compass medallion, slender brass rail catching golden-hour glints.
- `refs/good-05-oculus-beaux-arts-ring.jpg`: A 9, B 9, C 9, D 8.5, E 9 — PASS. Sculptural bronze balusters and brass cap rail; strong warm-hall vs cool-void contrast.
- `refs/good-06-train-glass-nose.jpg`: A 8.5, B 9, C 8.5, D 8.5, E 8.5 — PASS (form & material). Sleek curved dark-tinted glass nose showing lit warm saloon, headlight ring as fixture, non-emissive satin jade stripe; brown reflection is only the unwired hall env.
- `refs/bad-01-terrazzo-confetti.jpg`: A 4, B 5, C 3, D 7, E 7 — FAIL (rejected). Coarse, high-contrast chips read as confetti rather than fine honed dark stone.
- `refs/bad-03-train-neon-band.jpg`: A 5, B 3, C 5, D 5, E 7 — FAIL (rejected). Glowing cyan/jade skirt band reads as sci-fi neon; violates "every glow is a fixture".
- `refs/bad-05-speedgates-wardrobes.jpg`: A 4, B 3, C 4, D 6, E 6 — FAIL (rejected). Thick, chunky beige slab housings read as painted wardrobes/cabinets instead of slender champagne metal.
- `refs/bad-07-white-newel-boxes.jpg`: A 5, B 3, C 4, D 8, E 6 — FAIL (rejected). Chunky untextured white boxes next to 1910 bronze balusters mix vocabularies and read as greybox.
- `refs/bad-09-wrong-era-bronze-in-cavern.jpg`: A 4, B 3, C 5, D 6, E 6 — FAIL (rejected). Ornate 1910 bronze gate with brass finials inside the 2035 cavern breaks the two-vocabularies rule (re-skin in P3-4).
- `refs/residual-06-speedgates-read-painted.jpg`: A 7, B 8, C 6, D 7.5, E 8 — RESIDUAL. Slender form and clean glass blades pass, but cabinet flanks still read as matte cream paint instead of anodised champagne metal (fix in P5-2).

## Progress

- `P3-0: complete — verified WIP 500a0ed (hall floorMarble/darkMarble/columnMarble envMap === null after boot, 0 "empty after excluding" warnings, balcony/concourse match refs/good-08); independent review of src/lighting/looks.ts fixed 4 bugs: (1) precompile() now binds postfx.composer.inputBuffer so compileAsync builds LinearSRGBColorSpace programs (236 programs at boot -> 236 across full surface<->deep round-trip, 0 runtime compiles); (2) pick() filters to isMeshStandardMaterial with dedup so MeshBasicMaterial emissives in kit.deepList never get PMREM envMaps; (3) captureEnv('deep') clears scene.environment and probe.intensity so golden hall light no longer bleeds into deep env/SH (verified cleaner neutral stone in shots/meridian-deep/p3-0-v2/crossing.png); (4) PMREM/renderer state restore + rollback safety + single PMREMGenerator + constructor update() + keep godRays off while sunWeights.surface === 0. Evidence: build + metro-test + nav-test green; shots/meridian-deep/p3-0-v2 (balcony 278 calls/3.15M tris, concourse 263/2.82M, oculus 249/2.75M, disc 160/2.08M, crossing 97/535k, strata 170/2.38M); metro-route-test navigation/airlock/0-errors green (p95 16.7 ms, disc ride 16.8 ms max across airlock; occasional headless macOS scheduling stalls on active machine noted, re-check headed/quiet at Phase 3 gate).`
- `Ruling: Deep cavern honedLimestone (kit.deep.honedLimestone) uses dedicated procedural 512² pale mineral albedo/roughness/normal maps (no baked ashlar brick mortar lines), leaving void honedLimestone untouched — wallStone is Poly Haven stone_tile_wall whose running-bond mortar lines read as 1910 brickwork across 40 m Monolith panels (violating 02 §2 rules 5–6); ~4 MB GPU texture cost (total stays ~224 MB, limit 450 MB) — easy to revert or adjust contrast in P5-2 look-dev.`
- `P3-1: complete — built Monolith cavern shell + base floor (src/world/metro/shell.ts, 6 draw calls, ~75 k tris), updated SHELL/PORTAL in src/layoutMetro.ts (26 uniform 1.525 m courses, flush stripH=0 brushed stainless, no brass in cavern), trimmed wall/base-floor/water boxes from greybox.ts, wired into metro.ts with kit.deepList, added layout invariant in metro-layout-test.ts. Round 2 fixes: procedural honed limestone (eliminated 1910 ashlar lines), shallow 16 mm vertical light slots with 92 mm cool-4000K diffuser visible at oblique angles, sky-reveal downward soffit strip so sky floats cleanly from floor sightlines, fine mineral normal on west black granite. Evidence: build + metro-test (14+6+7+7+4+3) + nav-test (20) green; shots/meridian-deep/p3-1-v2 PASS (all sections 8–9/10; crossing 86 calls/610k tris, meridian 78/506k, waterwall 52/132k, funicular 89/633k, deep 60/134k, skyhole 89/633k, mapwall 63/263k). Note: unchamfered greybox sky leaves tiny dark corner triangles at the 4 re-entrant chamfers; P3-2 sky.ts closes them.`
