# Phase 4 Gate Evidence — The Metro Comes Alive (`P4-W` → `P4-6`)

Date: 2026-11-23 · Branch: `meridian-deep` · GPU: Apple M2 (ANGLE Metal)

## 1. Automated Tests & Verification Summary

| Suite | Result | Details |
|---|---|---|
| `npm run build` | **PASS** | `tsc --noEmit && vite build`, 0 errors |
| `npm run metro-test` (10 suites) | **PASS (85/85)** | `metro-layout-test` (16/16 incl. droplets), `nav-regions-test` (6/6), `nav-metro-test` (8/8), `metro-runtime-test` (16/16), `zones-test` (4/4), `escalator-phase-test` (3/3), `metro-train-test` (13/13, 344 trains / 2 h), `metro-trainmodel-test` (7/7), `metro-choreography-test` (8/8), `metro-map-test` (4/4, `2.84e-13 px` roundtrip) |
| `npm run nav-test` | **PASS (20/20)** | 1910 Grand Hall, lounge, gates, footbridge unchanged |
| `npm run graph-test` | **PASS** | All mainline throat geometry & routing checks green |
| `npm run traffic-sim` | **PASS** | 30,769 stops, 0 overlap, stop err `1.42e-13` |
| `node scripts/metro-route-test.mjs` | **Functional 100% PASS / 0 console errors** | Full balcony → oculus → disc → F6 → lift `−70/−82/−70` → funicular `−70/−30/−70` → **3-min Crossing dwell (`?timescale=4`)** → F5–F1 → hall: trains arrived on all 3 lines (`halcyon, meridian, vesper`), PSDs opened on all 3 lines with **0 violations**, 3-min dwell `p95 = 33.4 ms`, `max = 50.1 ms` (1,504 frames, zero spawn/wave PSO stalls) |

## 2. Headed Real-GPU Performance (`scripts/perf-presets.mjs`, `--extra=timescale=8`, 4 live trains)

Phase 4 target: **≥ 50 fps** at final **pixel ratio ≥ 1.0** at both sizes, deep draw calls **≤ 266**, **0 console errors**.

| Preset | 1440×900@1 (fps / p95 / max / pr / calls / trains) | 1470×956@2 (fps / p95 / max / pr / calls / trains) | Status |
|---|---|---|---|
| `crossing` | **60.0 fps** / 17.7 ms / 18.7 ms / **1.35** / 196 / 4 | **55.8 fps** / 33.3 ms / 34.3 ms / **1.20** / 196 / 4 | **PASS** |
| `meridian` | **60.0 fps** / 18.3 ms / 18.8 ms / **1.35** / 194 / 4 | **59.4 fps** / 16.9 ms / 33.4 ms / **1.35** / 194 / 4 | **PASS** |
| `glassup` | **60.0 fps** / 16.8 ms / 18.6 ms / **1.35** / 198 / 4 | **54.4 fps** / 33.4 ms / 34.2 ms / **1.10** / 198 / 4 | **PASS** |
| `mapwall` | **60.0 fps** / 17.7 ms / 17.8 ms / **1.35** / 151 / 4 | **60.0 fps** / 16.8 ms / 17.7 ms / **1.35** / 141 / 4 | **PASS** |
| `droplets` | **58.6 fps** / 17.6 ms / 50.0 ms / **1.35** / 178 / 4 | **58.7 fps** / 17.6 ms / 34.2 ms / **1.35** / 178 / 4 | **PASS** |
| `train` | **59.2 fps** / 17.6 ms / 34.3 ms / **1.35** / 178 / 4 | **57.2 fps** / 17.6 ms / 66.6 ms / **1.10** / 178 / 4 | **PASS** |
| `deep` | **59.0 fps** / 17.6 ms / 33.4 ms / **1.35** / 178 / 4 | **59.2 fps** / 16.8 ms / 33.6 ms / **1.35** / 178 / 4 | **PASS** |

- **Worst deep draw calls:** `198` (`68` calls below the `266` Phase 4 cap).
- **Zero console errors** across every preset and size.

## 3. Director Visual Rubric Scores (`09 §3` A–G)

- **A. Scale, proportion, composition:** `9.5/10` — 81.5 m mirror trains align flush with every PSD bay; 2,314 champagne droplets frame the eclipse & funicular slot cleanly; 40 × 7 m map wall and 2.4 m clock anchor the south nave wall.
- **B. Material truthfulness:** `9.5/10` — silver mirror-stainless trains reflecting the sunlit cavern (never brown hall), gleaming polished champagne droplets readable from above and below, backlit dark architectural glass & veined alabaster white onyx clock dial, non-emissive satin line accents (Ruling 8).
- **C. Light & mood:** `9.5/10` — trains emerge out of true blackness (`150 m` dark → `40 m` soft headlight wake → `0 m` cavern reflection); neutral-white arrival light-wave flares luminance-balanced line-tinted mouth ribs 4 s before emergence; glowing white onyx clock contrasts with the frozen 6:47 brass hall clock upstairs.
- **D. Detail craft:** `9.5/10` — exact smoothstep inversion (0.3 s PSD open lag / close lead), per-door alignment, aspect-corrected Swiss map circles/typography, `2.84e-13 px` live train dot precision, continuous millisecond-sweeping second hand.
- **E. Consistency & vocabulary:** `9.5/10` — pure 2035 Tokyo/Copenhagen transit; zero neon, zero brass in cavern, zero people, zero announcements.
- **F. Zero defects:** `9.5/10` — 0 console errors, 0 shader errors, 14/14 perf cells passing at `pr ≥ 1.10`, 1910 hall untouched.
- **G. Taste / "would Ethan screenshot this?":** `9.5/10` — `crossing.jpg`, `meridian.jpg`, `train-doors.jpg`, `portal-wave-mouth.jpg`, `droplets-t0.jpg`, `mapwall-closeup-t0.jpg`, `skyride.jpg`, and `glassup.jpg` are genuine hero frames.

## 4. Visual Archive (19 JPEGs)

- **Live Mirror Trains & Cavern:** ![crossing](crossing.jpg) ![meridian](meridian.jpg) ![deep](deep.jpg) ![glassup](glassup.jpg)
- **Tunnel Darkness & Emergence (`150 m → 40 m → mouth`):** ![tunnel-150m](tunnel-150m.jpg) ![tunnel-40m](tunnel-40m.jpg) ![portal-emerging](portal-emerging.jpg)
- **Light-Wave & Synced Doors:** ![portal-wave](portal-wave.jpg) ![portal-wave-mouth](portal-wave-mouth.jpg) ![train-doors](train-doors.jpg) ![meridian-doors](meridian-doors.jpg)
- **Kinetic Droplet Ceiling (`0 s → +2 s` + skyhole):** ![droplets-t0](droplets-t0.jpg) ![droplets-t2](droplets-t2.jpg) ![skyhole](skyhole.jpg)
- **Live Map Wall & Running Clock (`0 s → +3 s` + skyride):** ![mapwall](mapwall.jpg) ![mapwall-closeup-t0](mapwall-closeup-t0.jpg) ![mapwall-closeup-t1](mapwall-closeup-t1.jpg) ![skyride](skyride.jpg)
- **1910 Grand Hall Unchanged:** ![balcony](balcony.jpg)
