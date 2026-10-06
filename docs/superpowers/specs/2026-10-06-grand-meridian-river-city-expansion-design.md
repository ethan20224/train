# Grand Meridian — River City, Station Grounds, Weather, and Ticket Kiosks

Date: 2026-10-06 (Asia/Singapore)
Status: conversational design approved; written specification awaiting user review.

## 1. Intent and approved decisions

Expand Grand Meridian into a coherent, first-person place to explore: a landmark terminal in a fictional river city, with meaningful station rooms and public grounds. Success is a convincing change of experience between the monumental concourse, a planted winter garden, outdoor river views, and an elevated railway observation gallery. Architecture, light, weather, motion, and sound supply the experience; there are no exploration objectives.

Approved by the user in this conversation:
- Setting: river city and formal gardens, with hills beyond the railway.
- Exploration boundary: station grounds, not an explorable city district.
- New rooms: winter garden and railway observation gallery with viewing terrace.
- Time: manual control over the full 24-hour daylight range, holding the selected time.
- Weather: clear, overcast, rain, and fog; no storms or snow in this expansion.
- All new player controls use keys, not clickable buttons, sliders, or menus.
- Kiosks assign a destination; there is no destination-selection menu. A physical ticket visibly prints and must be collected.
- The station clock remains frozen at 6:47. Daylight controls do not advance trains or change printed timetable times.
- New spaces support pure exploration and atmosphere: no sitting mechanics, inspection actions, clues, or discovery tasks.

Retained constraints from the existing design: no people, music, or announcements; Beaux-Arts station architecture and Art Deco railway design; existing balcony start and booking-window ritual; pure Three.js and procedural Web Audio; normal-window Chrome on the documented M2 MacBook Air, targeting at least 50 fps. No train boarding, carriage interiors, payments, new dependencies, package upgrades, or deployment work.

Assumptions for this specification: the wider city is equally quiet, with no simulated traffic or boats; new seating is architectural dressing only. The environment panel is a transient text readout and keyboard help, never an interactive GUI. The optional visual companion was offered but not accepted, so this document does not require one.

## 2. Current system and integration boundaries

The world uses metres, +Y up, +Z north; x<0 is west. The concourse is x[-30,30], z[0,100]; its side walls extend outward to x=±32.5. The lounge occupies x[-15,15], z[-24,-2], floor y=6. The train shed extends to z=360; platforms end at z=380. Dense pointwork begins near z=392; the yard and distant lines spread beyond it.

`src/layout.ts` remains the coordinate contract. World modules implement the existing build/finalize/update lifecycle. Navigation uses level-aware rectangles and ramps, subtracting shared prop obstacles. Preserve this model; adding these grounds does not require a new physics engine.

Lighting currently assumes one fixed golden-hour sun: static shadows, hall and lounge environment captures made once, fixed bounce lights, and copied shader uniforms for sky, dust, and shafts. Full daylight and weather control requires coordinated relighting, including those copies and the post-processing grade. Do not implement a sky-only toggle.

Ticket allocation currently lives inside `Interaction.issueTicket`, which selects a platform, updates held state and the board, and calls the scheduler. The scheduler exposes `requestTrain(track): boolean` and the traffic implementation can queue a request. Extract ticket coordination into a shared service. Do not fork kiosk-specific train scheduling or rewrite routing/interlocking.

At the time of specification, the checkout has an existing modified train scheduler and untracked route/debug scripts. Preserve them. Re-read their final state when planning implementation; do not reset, stage, or include them in this document's commit.

## 3. Site design and coordinate contract

The following are selected design coordinates, not implemented geometry. Put the named regions, doorways, stairs, shelters, and camera viewpoints into the shared layout/data before building them. Apply player clearances at exposed boundaries, never at shared edges between connected regions; thresholds and adjoining paths must overlap sufficiently to remain continuous.

| Element | World extent / level | Role |
|---|---|---|
| Public entrance portal | west wall x[-32.5,-30], z[11.5,16.5], floor 0, head 4.8 | Connect concourse bay 14 to the entrance court |
| Entrance vestibule | x[-43,-32.5], z[9,19], floor 0 | Sheltered threshold between hall and exterior |
| Covered west entrance court | x[-74,-43], z[-24,28], floor 0, canopy underside 5 | Public arrival space and outdoor kiosk |
| Front plaza | x[-74,74], z[-76,-28], floor 0 | View of the station frontage, safely south of the lounge |
| Winter garden | x[-68,-32.5], z[68,98], floor 0, roof ridge 12 | Enclosed planted west wing |
| Winter-garden hall portal | x[-32.5,-30], z[83.5,88.5], floor 0, head 4.8 | Connect concourse bay 86 to conservatory |
| Winter-garden outdoor portal | west face x=-68, z[81,86], floor 0, head 4.8 | Connect conservatory to gardens |
| Formal gardens | x[-130,-74], z[28,170], ground 0 | Authored planted spaces and paths |
| River promenade | x[-144,-134], z[-76,210], floor 0 | Stone embankment walk and city views |
| Gallery approach | x[-80,-72], z[160,309], floor 0 | Protected public path beside the railway |
| Gallery stair | x[-61,-57], z[311,331], y 0→9 | Ground-to-gallery connection; 60 risers at 0.15 m |
| Gallery landing | x[-63,-55], z[331,336], floor 9 | Safe stair landing and entrance |
| Observation gallery | x[-64,-36], z[335,365], floor 9, ceiling 14.5 | Enclosed viewing room facing north and east |
| Viewing terrace | x[-64,-36], z[365,379], floor 9 | Open view over platform ends and throat |

Connectivity is explicit:
- Main public loop: concourse bay 14 → vestibule → covered court → garden paths → promenade → gardens → winter garden → concourse bay 86.
- Plaza connector: covered court → x[-66,-60], z[-32,-20] → front plaza; plaza → x[-144,-60], z[-70,-64] → promenade at its south end.
- Garden entry from the court: x[-82,-60], z[24,44]. Garden loop: 4 m clear paths centred on x=-80 and x=-124, running z[38,162], joined by 4 m paths across x[-126,-78] centred on z=40, 94, and 160. Planting beds occupy the spaces between, not these paths.
- Promenade branch: x[-144,-78], z[92,96]. Winter-garden branch: x[-82,-67], z[81,86], connecting the east garden path to the outdoor doorway. Interior conservatory circulation links both doorways with at least 3 m clear width.
- Gallery branch: garden north path → approach strip → 4 m wide connector centred on z=307, x[-80,-59] → stair apron x[-63,-55], z[305,312] → stair → landing → gallery → terrace; return along the same protected branch.
- Ticket barriers and all existing track boundaries remain intact. Public exterior routes never connect directly to island platforms, the staff ramp, or the railway yard.

Doorways are real holes through wall solids and cladding, with complete reveals, thresholds, trim, and matching floor/navigation connections. Remove the two west wall benches in each affected bay (14 and 86) from both rendering and obstacle data; do not move unrelated furniture. Doors open automatically on approach, matching the lounge convention; they require no new interaction key. Keep at least 3 m clear through vestibules and around kiosk approaches.

Gallery footprint remains west of shed x=-32 and south of the existing signal box near z=388. Its east glazing sees over the 3 m shed plinth; its north glazing and terrace see beyond the shed end. Site validation must confirm sightlines using the real scene before accepting the architectural finish.

The river follows the west embankment: near bank x=-145, far bank x=-255 through z[-500,450]. Beyond z=450 the near bank bends west toward x=-650 at z=900 and x=-1000 at z=1600, maintaining approximately 110 m width. This places the river beyond the fanned railway lines rather than across them. Validate the final bank polygon against sampled existing track paths; no track may cross water accidentally. Distant terrain, embankment continuation, and water extend beyond the near model so clear daylight exposes no rectangular water ends or voids. Embankment top is y=0 and water level y=-3, with a complete retaining face and protected upper edge.

The opposite city frontage is approximately x[-430,-265], z[-180,340]. Use a fixed authored composition, not random buildings: masonry blocks of varied 3–6-storey height, a civic clock tower, and a distant dome, with streets suggested between blocks. Tree-covered hills sit beyond the northern railway and city. Background buildings are not enterable and have no navigation regions. No additional bridge, city district, vehicle system, or river simulation is required.

## 4. Architecture, landscape, and sensory treatment

Finish the station exterior visible from the plaza, gardens, promenade, and gallery approach: stone courses, plinths, cornices, window reveals, roof edges, gutters/downpipes, entrance lettering, structural canopy supports, and grounded foundations. Preserve the existing interior proportions and shops. New wings must not erase window openings or invent solid walls across established doorways.

Winter garden: dark iron framework, restrained brass fittings, clear glazing, patterned stone flooring, masonry planter beds, palms and broad-leaved plants, climbing greenery, and authored seating groups. Plant silhouettes and variation must withstand close inspection; no repeated flat green cones. Arrange vegetation to frame views and preserve the path loop. Glass should show both interior structure and exterior weather without unreadable transparency stacks.

Grounds: trimmed hedges, substantial trees, flower beds, stone paths and steps, period lamps, railings, drainage details, and a few benches. Borders, walls, railings, and planted obstacles communicate the navigation boundary. The river edge is physically and navigationally protected; there is no swimming or falling into water.

Gallery: masonry base and real support structure, panelled lower walls, broad iron-framed glazing, restrained furniture, and a small weather-exposed terrace. Maps/signage are static dressing, not inspectable objects. Protect all elevated edges, including the stair landing.

River water uses a bounded shader with subtle directional ripples, sky/light response, Fresnel variation, and restrained rain disturbance. Do not promise full planar reflections of the city. Reflections must read as plausible at the available budget, without mirrored silhouettes that fail when the camera moves.

Sound differentiates enclosure: hall reverberation, quieter garden air and river wash outdoors, conservatory roof patter, canopy patter, and stronger wind exposure on the gallery terrace. Existing positional trains remain audible. Weather sound blends by exposure and distance rather than toggling abruptly at a doorway. Preserve the existing hall/lounges' quiet character.

## 5. Keyboard controls and environmental behaviour

| Key | Behaviour |
|---|---|
| 1 / 2 / 3 / 4 | Clear / overcast / rain / fog |
| [ / ] | Daylight earlier / later: 15 minutes per tap; hold repeats at 4 steps/s after 300 ms |
| − / = | Rain or fog intensity lower / higher: steps of 0.1; same repeat rule |
| H | Show/hide a small, non-interactive shortcut guide |
| E | Existing interactions, plus print/collect at a targeted kiosk |

Time wraps through midnight. Weather defaults to intensity 0.6 for rain and 0.5 for fog; preserve each mode's last intensity during this session. Intensity clamps to [0.1,1]. In clear/overcast, intensity keys do not change the look and briefly report that intensity applies to rain/fog. Initial daylight is 17:30, clear, calibrated to retain the existing low west-south-west golden-hour sun. Reload restores defaults; no persistence is required.

Weather/time keys operate while entered and pointer-locked, without releasing the mouse or stopping movement. H also works on the existing pause screen. Ignore environment input during intro, fixed-camera automation, or modified keyboard chords (Ctrl/Meta/Alt), and while a text field has focus. Clear held-key state on blur/unlock. E remains one action per press, never repeat-triggered; ticket-card dismissal takes priority over issuing another interaction.

A small status message shows the selected weather, applicable intensity, and labelled **DAYLIGHT** time for 2 seconds after input, then fades. Do not present that value as the frozen station clock. H toggles help only; no clickable settings controls are added. Keep the existing intro/pointer-lock flow.

Time and weather each transition toward the latest requested state over approximately 1 second; repeated input retargets the current transition, not a queue. Weather never changes railway speed, dwell, ticket clocks, or simulation timescale. Wind motion is modest and visual; do not add wind controls or automatic weather evolution.

Lighting model is an authored fictional daily cycle, not a geolocation/astronomy simulation: dawn around 06:00, midday around 12:00, the existing golden look at 17:30, sunset around 19:00, full night by 20:00. Interpolate direction, intensity, sky colour, haze, and grade continuously, with a seamless midnight wrap. At night the sun and solar shafts are off; a restrained moon/stars and cool sky fill complement warm practical lights. There is no shadow-casting moon.

Weather requirements:
- Clear: legible nearby city, directional daylight, appropriate shafts and light pools; far haze hides railway/world termination.
- Overcast: visible cloud cover, soft cool fill, greatly reduced direct sunlight and shafts; not clear sky with a grey filter.
- Rain: overcast light, GPU precipitation outside shelters, wet exposed paving, restrained ripples/splashes, roof and outdoor rainfall sound. Interior marble, covered court paving, and conservatory floor stay dry.
- Fog: coherent sky/horizon/fog colour and density; reduced distant contrast, readable nearby paths and entrances. Intensity controls distance visibility rather than camera blur.
- Leaving rain: precipitation/audio fade with the transition; exposed wetness dries over 20 real seconds. Enclosed surfaces never acquire weather wetness.

## 6. Environment ownership and rendering strategy

Use one dependency-free environment store with state `{ daylightMinutes, weather, rainIntensity, fogIntensity }` and a version. A controller consumes input in real time and derives one interpolated look snapshot. Sky, lighting, atmosphere, water, wet surfaces, practical lamps, weather audio, and post-processing read that snapshot. Do not maintain competing clocks or weather flags in individual modules.

Add named shelter volumes/roof footprints to the same pure layout data used for geometry: hall, lounge, vestibule, covered court, winter garden, shed, and enclosed gallery. Covered regions can be open-sided; distinguish roof protection from acoustic enclosure. Rain is world-aligned, generated in a bounded camera-local volume, and culled beneath shelter roofs. It remains visible through glazing and outside doorways even when the player stands indoors. Use the union of authored roof footprints/height ranges, not just an indoor boolean derived from the player's position.

Retain one sun shadow map with automatic per-frame updates disabled. Refit/invalidate it when committed daylight direction or active coverage changes, coalescing input and limiting refreshes to 10/s while adjusting; settled scenes do no repeated shadow work. Keep its texel budget at or below the existing 4096² equivalent. Shadow direction/matrix, direct light, bounce treatment, and shaft uniforms publish together, so stale shafts cannot point toward yesterday's sun. Extend covered bounds to the near station grounds and gallery; distant city and hills use cheaper unshadowed detail. Disable solar shafts while their matching shadow state is unavailable and at night.

Refresh reflections and diffuse bounce after changes settle, using retained capture resources and a versioned refresh job. Capture one cube face per rendered frame, first hall, then lounge, then winter garden, using 256-pixel faces for hall/lounge and 128 for winter garden. Snapshot the look for each job, hide transient weather/dust/trains during capture, generate PMREM on completion, and swap only complete maps. Cancel stale jobs on new input; restore capture visibility and render state in a finally path. Never display a cube with faces from different environmental states. Use old complete maps with updated intensity temporarily, then converge to the new captures within 3 seconds after input stops. Update diffuse probes from completed captures. Do not allocate new capture targets every keypress or cache every time/weather combination.

Practical lights need actual illumination of paths, entrances, kiosks, the gallery stair, and new interiors at night, not emissive bulbs alone. Use bounded regional fill and at most 8 non-shadowing local lights active near the player; batch distant/window glows as emissive geometry. Existing lamps/materials must participate in daylight-dependent intensity. Recalibrate exposure, bloom, and warm grading per look; night and overcast must not retain a universal orange tint. Include the extended building bounds in volumetric treatment where appropriate.

Reuse material atlases and existing geometry batching. Merge static geometry by material within spatial chunks so off-screen city/garden sections can be culled. Instance repeated structural and plant parts with deliberate placement. The quality controller can scale precipitation density and reflection refresh work before reducing pixel ratio further; keep its current floor of 0.85. No quality rung may remove doors, railings, collision protection, or all exterior identity.

## 7. Kiosk ritual and ticket consistency

Two kiosks: covered court at (-52,0,14), facing west toward the court; concourse at (-19,0,84), facing south. Approximate machine footprint 1.1×0.8 m, height 2.0 m. Register geometry, interaction zones, and collision from shared placement data. Keep the inner machine clear of shops, the gate approach beginning at z=88, and routes to the winter garden. Enamel lettering, brass trim, a small illuminated status window, a mechanical print control, and a paper slot belong to the existing aesthetic. No destination chooser or simulated payment.

Per machine: `idle → printing → ready → idle`. Printing lasts 2.5 real seconds. Prompt is **E — Print ticket**, then non-actionable **Printing ticket…**, then **E — Collect ticket**. Paper visibly feeds from the slot, with matching motor/paper/cutter sound. The emerging paper and collected ticket share the same assigned identity, platform, and serial. Collection uses the existing ticket-card presentation with kiosk-specific copy.

Only one pending kiosk print is allowed globally. While it exists, the other kiosk and booking windows report that a ticket is printing/awaiting collection at the named machine; they do not issue a competing ticket. E during printing does nothing. Leaving the machine does not collect or cancel its ticket. A ready ticket expires after 45 real seconds, retracts over 0.5 seconds, and releases its allocation. Printing, ready expiry, and retraction pause while the browser is hidden or the experience is paused. An expiry never clears the player's currently held ticket. These timers are independent of train test timescale. There is no need for manual cancellation or reprint controls.

The ticket service supports prepare/collect/cancel. Preparing assigns the same dreamlike destinations and printed fields as the existing ritual and takes a scheduler allocation lease. It does **not** replace held state, change the departures board, release the existing ticket's train reservation, or launch a new ticket train. Collecting atomically commits the allocation and ticket, updates the board, and requests/extends the train. Only a successful commit replaces the previous ticket. Booking windows use the same service with immediate prepare-and-collect, retaining their existing presentation.

Allocation leases are additive scheduler support, separate from interlocking route locks. Prefer a free platform with a held pool slot; alternatively bind an eligible arrival or dwelling train before it has committed to departure. Ambient arrivals/shunts skip leased platforms; general spawn allocation skips leased slots. A bound existing train cannot depart during a pending print. Preparing fails with **Ticket service temporarily unavailable — try again** if no allocation is possible; there is no paper or board update on failure. A late departing train is never an eligible fallback. Cancellation/expiry releases only the pending lease and resumes the bound train's pre-lease remaining dwell, without changing existing held-ticket reservations.

Commit validates the lease before releasing any earlier ticket reservation, then converts it into the normal ticket request without an intervening free-platform window. Duplicate collection/cancellation of a spent token is a no-op. A failed collection retracts the paper and reports temporary unavailability without changing held state or the board. Preserve existing boolean `requestTrain` and track-state consumers, but make ticket requests persist while temporarily blocked by routes; do not silently discard an accepted ticket request after the current fixed retry count. Newer successfully collected tickets supersede older requests as today; an uncollected print does not. Interlocking still decides when a train can physically move.

## 8. Minimum interface changes

- Environment store: read state, subscribe, set weather, adjust daylight, adjust intensity. Controller adds real-time update, current look, and settled/revision status.
- Build context gains the shared environment controller reference. Existing frame/simulation semantics remain intact; environment/kiosk real-time work occurs once per displayed frame, outside accelerated train substeps.
- Ticket service: `prepare(source)` returns a prepared ticket/allocation token or unavailable; `collect(token)` commits and returns the held ticket or failure; `cancel(token)` releases it. Existing `Ticket` fields and `tickets.held/set/subscribe` stay compatible.
- Train control gains allocation lease methods for prepare/commit/cancel, with opaque tokens; existing track states, requestTrain signature, and safety/audio APIs remain compatible.
- Audio gains bounded environment/exposure input and positional kiosk print sound; preserve existing train voices, bell, gate, and ticket sounds.
- Add pure layout/obstacle data for the new spaces, shelter classification, and two kiosk targets. Extend interaction/debug target kinds and prompts; avoid a generic interaction framework.
- Add diagnostic `window.__meridian.environment()` and kiosk state snapshots, plus explicit test-only environment setters, consistent with existing debug handles. Add fixed camera presets: forecourt, plaza, wintergarden, gardens, river, gallery, galleryterrace, ticketkiosk. URL `daylight=HH:MM`, `weather=clear|overcast|rain|fog`, and `intensity=0.1..1` enable repeatable captures; invalid values fall back to normal defaults and never affect ticket time or timescale.

## 9. Verification and acceptance

Before implementation, record a fresh baseline of build/nav/graph/traffic checks, existing ticket/walk/safety/route behaviour, and representative real-GPU views/performance. Historical task-list metrics are context, not certification. Distinguish existing scheduler/script failures from regressions. No separate lint command currently exists; do not add a dependency to manufacture one.

Functional checks:
- Full public loop and gallery branch traversable through the real player controls without a ticket; existing ticket gates still block platform access.
- New entrance openings, doors, paths, stairs, landing, and terrace have matching visual and collision boundaries. Test both gallery levels, railing/river/yard edges, obstacle penetration, large movement steps, and seeded navigation fuzz.
- Each shortcut works alongside movement; midnight wrap, repeated holds, mode-specific intensity, pause/blur reset, modified chords, H help, and E repeat suppression behave as specified.
- Test clear/overcast/rain/fog at 00:00, 06:00, 12:00, 17:30, and 20:00; validate rain in exposed spaces and its absence under every named shelter, including gallery windows viewed from inside.
- Rapid weather/time changes converge to the latest state; shaft/light directions agree; captures never publish stale revisions; repeated changes and cancellations do not grow texture/render-target counts.
- Both kiosk sources, print feed, ready paper, collect, unattended expiry, second-machine lockout, failure, replacement of a held ticket, and all-tracks-busy conditions are exercised. Assert one serial/one commit, correct platform and board row, train request survival while interlocking is busy, and release of abandoned leases.
- Booking windows, lounge doors, concierge bell, gates, footbridge, platform safety, articulated trains, and interlocking regressions pass. Changing daylight/weather does not alter their clocks or simulation rate.
- Browser automation and actual keyboard-only use have no page errors, NaNs, resource leaks, or accidental click-only steps.

Visual acceptance requires real-GPU screenshots and an actual walkthrough. Inspect new rooms and exterior from both sides of thresholds, close plant/glass/material views, city composition, nighttime route readability, and wet/dry transitions. Build success is not visual acceptance. Clear-day views must not reveal cut-off tracks, spawning trains, unfinished station backs, river edges, or empty terrain beyond the protected boundary.

Performance acceptance: headed Chrome with actual hardware GPU on the documented M2, normal window, auto quality. Use 1440×900@1 and the existing 1470×956@2 comparison. Warm up for 30 seconds, then measure 60 seconds per demanding scenario: golden hall, clear river view, rainy winter garden, rainy gallery terrace, and night forecourt. Each settled scenario must average ≥50 fps, with p95 frame time ≤25 ms. Report transition/refresh hitches separately; normal weather/time adjustments must not cause repeated frames longer than 100 ms. Complete a 5-minute mixed public-route walk to check thermal and memory drift.

Planning budgets: new world geometry ≤60 additional visible draw calls and ≤650k additional visible triangles at a representative worst view; rain/water add ≤4 calls; full settled scene ≤250 calls, ≤2.5M visible triangles, and estimated resident GPU texture/render-target memory ≤450 MB. These are acceptance caps, not measured results. Preserve close architectural/material quality through culling/batching and measured effect costs; if the target cannot be met, report the measured blocker rather than silently reducing scope or asserting a pass.

## 10. Delivery and review gates

This document is the product/architecture specification, not the implementation plan. Following user review, writing-plans produces concrete implementation tasks and verification commands. Implementation is organised into three integrated milestones:
1. Environment ownership, keyboard controls, coherent relighting, weather and exposure foundations; validate on the existing station before expanding geometry.
2. Shared site layout, genuine openings, finished exterior, public grounds, city/river backdrop, winter garden, and observation gallery; validate the entire public route and all looks.
3. Shared ticket allocation, physical kiosks, keyboard prompts, and full visual/function/performance regression.

Keep documentation concise and update the task ledger with verified outcomes during implementation. No implementation skill, product changes, or dependency installation is authorized merely by approving the conversational design. After this specification is approved, create the written implementation plan and let the user select its execution method.
