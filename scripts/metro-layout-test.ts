// Geometry invariants of the Meridian Deep layout (spec §2). Run: npm run metro-layout-test
import assert from 'node:assert/strict';
import {
  CAVERN, DISC, DROPLETS, ESCALATOR, FLIGHTS, FUNICULAR, HALCYON, LANDINGS, LIFTS, MAP_WALL, MERIDIAN, METRO_TRAIN, OCULUS, PORTAL, PORTALS, PSD, SHELL, SKY,
  THRESHOLD, THROAT, VESPER, escalatorUnits, funicularRailTopAt, funicularRailUndersideAt, voidRadiusAt,
} from '../src/layoutMetro';
import { TRACKS as METRO_TRACKS, trackPoint } from '../src/metro/tracks';
import { buildTeardropGeometry, computeDropletAnchors } from '../src/world/metro/droplets';
import { GATES, KIOSK } from '../src/layout';

let passed = 0;
const test = (name: string, fn: () => void): void => { fn(); passed++; console.log(`ok   ${name}`); };
const TAN30 = Math.tan(Math.PI / 6);
const flight = (id: string) => { const f = FLIGHTS.find((x) => x.id === id); assert.ok(f, id); return f!; };
/** Step height of flight f at axis coordinate c. */
const yAt = (id: string, c: number): number => { const f = flight(id); const t = (c - f.from) / (f.to - f.from); return f.yFrom + (f.yTo - f.yFrom) * t; };
const perpToHalcyon = (x: number, z: number): number => {
  const [cx, cz] = HALCYON.centre; const [ux, uz] = HALCYON.dir;
  return Math.abs(-(x - cx) * uz + (z - cz) * ux);
};
const MEDALLION_EDGE_Z = KIOSK.center[1] + 9.46; // MEDALLION_R in src/world/concourse/floor.ts

test('every flight is a 30° incline', () => {
  for (const f of FLIGHTS) assert.ok(Math.abs(Math.abs(f.yTo - f.yFrom) / Math.abs(f.to - f.from) - TAN30) < 1e-6, f.id);
});

test('flights chain through their landings (spec §2.3)', () => {
  const inZ = (z: number, r: { zMin: number; zMax: number }) => z >= r.zMin - 0.05 && z <= r.zMax + 0.05;
  assert.ok(inZ(flight('F1').to, LANDINGS.L1) && inZ(flight('F2').from, LANDINGS.L1), 'L1');
  assert.ok(inZ(flight('F2').to, LANDINGS.L2) && inZ(flight('F3').from, LANDINGS.L2), 'L2');
  assert.ok(inZ(flight('F3').to, LANDINGS.thresholdBridge) && inZ(flight('F4').from, LANDINGS.thresholdBridge), 'threshold');
  const isl = MERIDIAN.island;
  assert.ok(flight('F4').to > isl.zMin + 2 && flight('F5').from < isl.zMax - 2, 'F4 lands / F5 departs on the Meridian island');
  assert.ok(inZ(flight('F5').to, VESPER.floor), 'F5 lands on the Crossing floor');
  assert.ok(flight('F6').from >= VESPER.floor.xMin + 2, 'F6 starts on the Crossing floor');
  assert.ok(perpToHalcyon(flight('F6').to, 67.8) <= HALCYON.halfWidth - 1, 'F6 lands on the Halcyon island');
  assert.equal(flight('F1').yFrom, 0); assert.equal(flight('F5').yTo, VESPER.topY); assert.equal(flight('F6').yTo, HALCYON.topY);
});

test('22 escalator units with unique ids; inner unit of each z band runs down', () => {
  const u = escalatorUnits();
  assert.equal(u.length, 22);
  assert.equal(new Set(u.map((x) => x.id)).size, 22);
  for (const x of u.filter((q) => q.axis === 'z')) {
    const twin = u.find((q) => q.flight === x.flight && q !== x && Math.sign(q.across) === Math.sign(x.across))!;
    assert.equal(x.dir === 'down', Math.abs(x.across) < Math.abs(twin.across), `${x.id} direction`);
  }
  for (const x of u) {
    const travel = Math.sign(x.to - x.from);
    assert.equal(x.sign, x.dir === 'down' ? travel : -travel, `${x.id} sign`);
  }
});

test('disc column clears every z-axis flight band by >= 0.7 m', () => {
  for (const f of FLIGHTS.filter((q) => q.axis === 'z')) for (const [a, b] of f.bands) {
    assert.ok(Math.min(Math.abs(a), Math.abs(b)) - DISC.r >= 0.7 - 1e-9, `${f.id} band ${a}..${b}`);
  }
});

test('F4 and F5 bands sit >= 0.85 m inside the Meridian screen-door line', () => {
  const doorLine = MERIDIAN.island.xMax - PSD.inset;
  for (const id of ['F4', 'F5']) for (const [a, b] of flight(id).bands) {
    assert.ok(doorLine - Math.max(Math.abs(a), Math.abs(b)) >= 0.85 - 1e-9, `${id}`);
  }
});

test('F5 clears the Vesper north train roof by >= 3.5 m', () => {
  const roof = VESPER.railY + METRO_TRAIN.height;
  assert.ok(yAt('F5', VESPER.trackZ[1]) - roof >= 3.5, `F5 at the north track: ${yAt('F5', VESPER.trackZ[1])}`);
});

test('F4 passes through the sky inside the hole', () => {
  const f = flight('F4');
  const z = f.from + ((SKY.y - f.yFrom) / (f.yTo - f.yFrom)) * (f.to - f.from);
  for (const [a, b] of f.bands) {
    const x = Math.max(Math.abs(a), Math.abs(b));
    assert.ok(Math.hypot(x, z - OCULUS.cz) <= SKY.holeR - 1, `F4 band edge at sky: r=${Math.hypot(x, z - OCULUS.cz)}`);
  }
});

test('hall: oculus fits between the kiosk medallion and the gate approach; throats clear the curb', () => {
  assert.ok(OCULUS.cz - OCULUS.curbOuterR >= MEDALLION_EDGE_Z + 4, 'south of oculus');
  assert.ok(OCULUS.cz + OCULUS.curbOuterR <= GATES.approachZMin - 4, 'north of oculus');
  assert.ok(THROAT.zMin >= MEDALLION_EDGE_Z + 2, 'throat south of medallion');
  for (const [a, b] of THROAT.bands) {
    const x = Math.min(Math.abs(a), Math.abs(b));
    assert.ok(Math.hypot(x, THROAT.zMax - OCULUS.cz) >= OCULUS.curbOuterR, 'throat corner outside the curb');
  }
});

test('F1 rider head clears the slab edge by >= 0.5 m; F1 is inside the bell beyond the dome slot', () => {
  assert.ok(OCULUS.slabUnderY - (yAt('F1', THROAT.zMax) + 1.8) >= 0.5, 'head clearance at the throat end');
  for (let z = THROAT.domeSlotEndZ; z <= flight('F1').to; z += 0.25) {
    const y = yAt('F1', z);
    for (const [a, b] of flight('F1').bands) {
      const x = Math.max(Math.abs(a), Math.abs(b));
      assert.ok(Math.hypot(x, z - OCULUS.cz) <= voidRadiusAt(y) - 0.3, `F1 outside bell at z=${z}`);
    }
  }
});

test('landing bridges never cross the disc column', () => {
  for (const L of [LANDINGS.L1, LANDINGS.L2, LANDINGS.thresholdBridge]) {
    assert.ok(L.zMin >= OCULUS.cz + DISC.r + 0.5 || L.zMax <= OCULUS.cz - DISC.r - 0.5, `${L.zMin}..${L.zMax}`);
  }
});

test('capsule lifts: on the Threshold annulus, outside the sky hole, on the Crossing floor and the Halcyon island', () => {
  for (const [x, z] of LIFTS.positions) {
    const r = Math.hypot(x, z - OCULUS.cz);
    assert.ok(r - LIFTS.tubeR >= THRESHOLD.rInner && r + LIFTS.tubeR <= THRESHOLD.rOuter, `annulus r=${r}`);
    assert.ok(r - LIFTS.tubeR >= SKY.holeR, 'outside hole');
    assert.ok(z - LIFTS.tubeR >= VESPER.floor.zMin && z + LIFTS.tubeR <= VESPER.floor.zMax, 'on the floor');
    assert.ok(perpToHalcyon(x, z) + LIFTS.tubeR <= HALCYON.halfWidth, 'on the Halcyon island');
  }
});

test('funicular (Ruling 37): ~50.7° slope, rail strictly below floor, clears deck/sky/floor outside slot & pit, both stops flush', () => {
  const [tx, ty] = FUNICULAR.top; const [bx, by] = FUNICULAR.bottom;
  // Both stops flush with Threshold (-30) and Crossing (-70); top west end 0.3 m outside r=20; bottom east end <= 57.4 inside Crossing east balustrade
  assert.equal(ty, THRESHOLD.y, 'top stop flush at -30');
  assert.equal(by, VESPER.topY, 'bottom stop flush at -70');
  assert.ok(tx >= THRESHOLD.rOuter + 0.25 && tx <= THRESHOLD.rOuter + 0.35, `top west end ~20.3 (got ${tx})`);
  assert.ok(bx + FUNICULAR.cabinLength <= 57.4, `bottom east end <= 57.4 (got ${bx + FUNICULAR.cabinLength})`);
  assert.ok(FUNICULAR.pit.xMax < VESPER.floor.xMax - 0.5, 'bottom pit strictly inside continuous east balustrade');
  const slopeDeg = (FUNICULAR.slopeRad * 180) / Math.PI;
  assert.ok(slopeDeg > 48 && slopeDeg < 54, `slope ~50.7 deg (got ${slopeDeg.toFixed(2)})`);
  assert.ok(tx - FUNICULAR.cabinWidth / 2 >= MERIDIAN.trackX[1] + METRO_TRAIN.width / 2 + 1, 'clear of Meridian east train');

  // Sample 200 positions along the incline: verify every geometric invariant
  const slot = FUNICULAR.skySlot;
  const pit = FUNICULAR.pit;
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const xw = tx + (bx - tx) * t;
    const xe = xw + FUNICULAR.cabinLength;
    const yc = ty + (by - ty) * t;
    const yRoof = yc + FUNICULAR.cabinHeight;

    // 1. Rail top is strictly below the level cabin floor at every x across the cabin length
    for (let k = 0; k <= 8; k++) {
      const x = xw + (FUNICULAR.cabinLength * k) / 8;
      assert.ok(funicularRailTopAt(x) <= yc - 0.15, `rail below floor at t=${t.toFixed(2)} x=${x.toFixed(2)}`);
    }
    // 2. Cabin never intersects the approved Threshold deck (r <= 20, y in [-32, -30])
    assert.ok(xw > THRESHOLD.rOuter + 0.1, `cabin west edge clears Threshold r=20 at t=${t.toFixed(2)}`);
    // 3. Wherever cabin body overlaps the sky plane band [SKY.y - SKY.slotRimDepth, SKY.y], it lies strictly inside skySlot
    if (yRoof >= SKY.y - SKY.slotRimDepth && yc <= SKY.y) {
      assert.ok(xw >= slot.xMin + 0.1 && xe <= slot.xMax - 0.1, `cabin inside skySlot at t=${t.toFixed(2)}: [${xw.toFixed(2)}, ${xe.toFixed(2)}] vs [${slot.xMin}, ${slot.xMax}]`);
    }
    assert.ok(FUNICULAR.cabinWidth / 2 <= slot.halfZ - 0.3, 'cabin width clears skySlot halfZ');
    // 4. Cabin never intersects Crossing floor outside the pit (floor is at y = -70, slab underside -71.5)
    if (yc < VESPER.topY + 0.01) {
      assert.ok(xw >= pit.xMin && xe <= pit.xMax, `cabin at -70 inside pit: [${xw}, ${xe}]`);
    }
  }
  // 5. Rail underside crossing sky plane (y = -32) and Crossing floor (y = -70) lies strictly inside skySlot and pit
  const xRailUnderAtSky = tx + (ty - FUNICULAR.floorThickness - FUNICULAR.beamDepth - SKY.y) / FUNICULAR.slope;
  assert.ok(xRailUnderAtSky >= slot.xMin + 0.25 && xRailUnderAtSky <= slot.xMax - 0.25, `rail underside at sky (${xRailUnderAtSky.toFixed(2)}) inside skySlot`);
  const xRailUnderAtFloor = tx + (ty - FUNICULAR.floorThickness - FUNICULAR.beamDepth - VESPER.topY) / FUNICULAR.slope;
  assert.ok(xRailUnderAtFloor >= pit.xMin + 0.15, `rail underside at -70 (${xRailUnderAtFloor.toFixed(2)}) clears pit west lip (${pit.xMin})`);
  // 6. Wherever rail underside is < 2.3 m above Crossing floor (-70), x is inside underTrackGuardXMin
  assert.ok(funicularRailUndersideAt(FUNICULAR.underTrackGuardXMin) >= VESPER.topY + 2.3, 'under-incline guard covers entire < 2.3 m headroom zone');
  // 7. Bottom rail buffer fits inside pit depth
  assert.ok(funicularRailUndersideAt(bx + FUNICULAR.cabinLength) >= pit.floorY + 0.3, 'chassis/rail clears pit floor');
});

test('levels stack without collisions', () => {
  assert.ok(MERIDIAN.topY - 1.5 >= VESPER.railY + METRO_TRAIN.height + 10, 'bridge deck over Vesper trains');
  assert.ok(HALCYON.railY + METRO_TRAIN.height + 1.5 <= VESPER.railY - 1.4, 'Halcyon trains under the Vesper trench');
  assert.ok(MERIDIAN.island.xMax - PSD.inset + METRO_TRAIN.width / 2 <= MERIDIAN.trackX[1] + 0.1, 'Meridian track offset');
  assert.ok(CAVERN.nave.xMax >= MERIDIAN.trackX[1] + METRO_TRAIN.width / 2 + 2, 'nave wide enough');
});

test('monolith shell courses and portal bores fit cleanly', () => {
  const plinthTop = CAVERN.baseFloorY + SHELL.plinthH;
  const revealBot = SKY.y - SHELL.reveal;
  assert.equal(SHELL.courses, 26);
  assert.ok(Math.abs(SHELL.courses * SHELL.courseH - (revealBot - plinthTop)) < 1e-9, 'courses span plinth to reveal');
  assert.equal(SHELL.stripH, 0, 'base-floor stainless strips are flush');
  const meridianTop = MERIDIAN.railY - PORTAL.bedBelowRail + PORTAL.h;
  assert.ok(MAP_WALL.yMin - meridianTop >= 1.0, 'Meridian south bores clear map wall');
  const vesperBot = VESPER.railY - PORTAL.bedBelowRail;
  assert.ok(vesperBot >= plinthTop + 0.2, 'Vesper bores sit above plinth top');
  assert.ok(VESPER.trackZ[0] - PORTAL.w / 2 >= CAVERN.transept.zMin + 4, 'Vesper south bore inside transept');
  assert.ok(VESPER.trackZ[1] + PORTAL.w / 2 <= CAVERN.transept.zMax - 4, 'Vesper north bore inside transept');
});

test('twelve PORTALS entries align with all 6 metro tracks (portalIn and portalOut)', () => {
  assert.equal(PORTALS.length, 12);
  for (const tr of METRO_TRACKS) {
    for (const role of ['in', 'out'] as const) {
      const p = PORTALS.find((b) => b.line === tr.line && b.track === tr.track && b.role === role);
      assert.ok(p, `missing portal ${tr.line} T${tr.track} ${role}`);
      const s = role === 'in' ? -tr.portalIn : tr.portalOut;
      const [tx, ty, tz] = trackPoint(tr, s);
      assert.ok(Math.hypot(p!.centre[0] - tx, p!.centre[2] - tz) < 1e-6, `${tr.line} T${tr.track} ${role} xz`);
      assert.ok(Math.abs(p!.bedY - (ty - PORTAL.bedBelowRail)) < 1e-6, `${tr.line} T${tr.track} ${role} bedY`);
      const sgn = role === 'in' ? 1 : -1;
      assert.ok(Math.hypot(p!.facing[0] - tr.dir[0] * sgn, p!.facing[1] - tr.dir[1] * sgn) < 1e-6, `${tr.line} T${tr.track} ${role} facing`);
    }
  }
});

test('kinetic droplets (Ruling 35): r in [21, 38], >= 2 m clear of walls/lifts, excludes bridge & funicular, <= 2400 & <= 200 tris', () => {
  assert.equal(DROPLETS.rInner, 21);
  assert.equal(DROPLETS.rOuter, 38);
  const pts = computeDropletAnchors();
  assert.ok(pts.length >= 1200 && pts.length <= DROPLETS.count, `droplet count ${pts.length}`);
  for (const [x, z] of pts) {
    const r = Math.hypot(x - OCULUS.cx, z - OCULUS.cz);
    assert.ok(r >= DROPLETS.rInner - 1e-9 && r <= DROPLETS.rOuter + 1e-9, `r=${r}`);
    assert.ok(Math.abs(x) >= DROPLETS.bridgeExclusionHalfX - 1e-9, `bridge excl x=${x}`);
    const inTr = x >= CAVERN.transept.xMin + 2 && x <= CAVERN.transept.xMax - 2 && z >= CAVERN.transept.zMin + 2 && z <= CAVERN.transept.zMax - 2;
    const inNv = x >= CAVERN.nave.xMin + 2 && x <= CAVERN.nave.xMax - 2 && z >= CAVERN.nave.zMin + 2 && z <= CAVERN.nave.zMax - 2;
    assert.ok(inTr || inNv, `wall clear (${x},${z})`);
    for (const [lx, lz] of LIFTS.positions) assert.ok(Math.hypot(x - lx, z - lz) >= LIFTS.tubeR + 2 - 1e-9, `lift clear (${x},${z})`);
    if (x > 16) assert.ok(Math.abs(z - FUNICULAR.z) >= 3 - 1e-9, `funicular excl (${x},${z})`);
  }
  const geo = buildTeardropGeometry();
  const tris = (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
  assert.ok(tris <= 200 && tris >= 60, `teardrop tris=${tris}`);
  geo.dispose();
  console.log(`     droplets: ${pts.length} instances, ${tris} tris/droplet`);
});

console.log(`\n${passed} metro layout checks passed`);
