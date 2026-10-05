# Grand Meridian — Phase 4 Addendum: Hotel Feel + Ticket Ritual + Gates + Footbridge

Date: 2026-10-05 · Extends `2026-10-05-grand-meridian-design.md` (all its rules still bind).

## User decisions
- Gantries = **ticket barrier gates** + **ornate iron footbridge** over the tracks.
- Interaction = **light ritual**: collect a ticket at the booking office → gates open → your train arrives
  on your platform. No boarding.
- Hotel = **first-class lounge on the balcony** + **whole-hall restyle** + **concierge / reception desk**.

## Experience
1. Start (unchanged pose) in the balcony **First-Class Lounge**.
2. Under the balcony at floor level: **Booking Office** on the WEST frontage (x < 0), **Concierge** on the
   EAST frontage (x > 0), facing north toward the hall, either side of the grand stair.
3. Booking office windows are unattended. Press **E** at a window → "A ticket is already waiting for you":
   a printed Deco ticket card animates up (FIRST CLASS · GRAND MERIDIAN LIMITED · FROM Grand Meridian ·
   TO <destination> · PLATFORM <n> · DEPARTS <time> · CAR <c> SEAT <s>, with a stamp). The destination is
   chosen for you (uncanny), from the board's dreamlike list. Afterwards a small ticket badge stays in a
   corner of the screen. Pressing E again at a window later issues a new ticket (replaces the old one).
4. On issue: the departures board re-flaps one row to the ticket's destination / platform / BOARDING;
   the scheduler reserves the ticket's track and runs a train to it (arrival begins within ~10 s;
   dwell 90 s; then normal departure). Platform is chosen among tracks free at issue time.
5. **Ticket gates** stand across the concourse in front of the three north arches. Without a ticket the
   lanes are closed (nav-blocked) and a small red lamp glows on the gate as you approach; a prompt says
   "Ticket required — Booking Office". With a ticket, the lane in front of you opens (paddles swing,
   green lamp) as you approach, and closes behind you. Exit (platform → concourse) is always allowed
   while holding a ticket.
6. **Footbridge** across the shed: climb from any island, cross, look down on trains passing under.
7. Concierge desk has a brass service bell: E → "ding", a long echo, nobody comes.

## Coordinates (meters; add to `src/layout.ts` as named constants — single source of truth)

### Ticket gates (`GATES`)
- Gate line centered z = 95, cabinets occupy z ∈ [94.4, 95.6].
- Three banks centered x ∈ {-20, 0, 20} (aligned with arches/islands). Each bank: 7 lanes,
  lane width 1.1, cabinet width 0.3 → bank width 10.1. Lane i center x = bankX + (i − 3) × 1.4.
- Between banks and out to the side walls (x ±29.6): brass-framed glass screens, height 1.3 m, same z band.
- Navigation: the gate band z ∈ [94.4, 95.6] is blocked everywhere except open lanes. A lane is walkable
  (player-center corridor x = laneX ± 0.2) only while the player holds a ticket.

### Booking office (`BOOKING_OFFICE`) — west under-balcony frontage, face plane z = 8
- Frontage x ∈ [-29.6, -10.6]. Three ticket windows centered x ∈ {-25.5, -20.5, -15.5}, counter height
  1.05, window opening ~1.6 w × 1.4 h with brass grille, walnut + darkMarble, gilt "TICKETS" lettering.
- Interaction zone per window: |x − windowX| < 1.0 and z ∈ [8.4, 10.2] at floor level, facing roughly −Z.

### Concierge (`CONCIERGE`) — east under-balcony frontage
- Frontage x ∈ [10.6, 29.6]; pigeonhole key-box wall + "CONCIERGE" lettering set into the frontage.
- Freestanding reception desk: x ∈ [15, 25], z ∈ [9.4, 10.6] (curved/Deco front allowed within that box);
  register desk as obstacles. Service bell at (20, 1.1, 9.6). Interaction zone: |x − 20| < 1.5,
  z ∈ [10.6, 12.2].

### Footbridge (`FOOTBRIDGE`)
- Deck centered z = 228, z ∈ [226.2, 229.8], deck top y = 7.0, soffit ≥ y 6.2.
  Walkable deck x ∈ [-21.4, 21.4]. Structure may extend visually to the shed walls (x ±31.5).
- One stair per island, centered on the island (x ∈ {-20, 0, 20}), width 2.8 (x ± 1.4), descending
  SOUTH from z = 226.2 (y 7.0) to z = 214.2 (y 0). Under each stair at ground level is not walkable.
- Ground level under the deck (islands, z ∈ [226.2, 229.8]) stays walkable except piers (register them).
- Clearance: train roof y 3.3 < soffit 6.2.

### Lounge (balcony, y = 6) and hall restyle
- Lounge furniture only in the balcony wings x ∈ [-29.6, -11] and [11, 29.6]; the central zone
  x ∈ [-10, 10] stays clear (start pose + stair approach) except a large rug.
- Hall restyle: carpet runners (stair foot → kiosk → gates, ~3 m wide), lounge clusters in the side
  aisles (between columns x ±23 and walls x ±30), replacing aisle benches where they clash. The central
  floor's sun pools stay unobstructed. Nothing may block: stair foot, kiosk ring, gate approaches
  (z ∈ [88, 94.4] in front of each bank), booking office / concierge interaction zones.

## Systems
- `src/core/ticket.ts` — ticket state store: `{ held: Ticket | null }`, `issue(): Ticket`,
  `subscribe(fn)`. `Ticket = { destination, platform (1–6), track index, departs (string), car, seat, serial }`.
- Navigation: **levels**. Regions carry a ground height; resolution keeps the player on the region whose
  ground is within 0.6 m of the current feet y (stairs/ramps connect levels). `PropObstacle` gains an
  optional `level` (ground y); an obstacle applies only when |feetY − level| < 1.0 (no level = all levels).
  Gate lanes are dynamic (`setGatesOpen(boolean)` driven by the ticket store).
- Interaction: proximity + facing check → elegant prompt ("E — Collect ticket", "E — Ring the bell");
  E triggers. Works only while pointer-locked (not in ?cam mode).
- Scheduler: `requestTrain(track)` reserves a track and spawns a train to it promptly; dwell 90 s.
- Board: hook to force one row to the ticket's entry (flap animation).
- Audio: `audio.bell()` (brass service bell, long reverb tail), `audio.ticket()` (soft paper + stamp),
  gate paddle swish/clunk positional. Extend the AudioEngine interface additively.

## Verification
- nav-test extended: deck over island resolves to the correct level; can climb/descend each bridge
  stair; cannot fall off the deck; cannot pass gates without a ticket; can with one; fuzz never leaves
  the walkable set on either level.
- walk-test extended: lounge → stair → booking office (press E) → gates → platform → bridge → cross →
  descend. Ticket UI shown; board row flips; the train arrives on the ticket's platform.
- Screens: lounge, booking office, concierge, gates (closed/open), bridge views — art-director review.
- Perf: auto quality still ≥ 50 fps; budgets: draw calls < 180, triangles < 2.2 M.
