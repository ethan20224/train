import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { CANOPY_WALK, CAVERN, DISC, MERIDIAN, OCULUS, PSD, SKY } from '../../layoutMetro';
import { trackOf } from '../../metro/tracks';
import { formatTransomText } from '../../metro/choreography';
import { LINE_COLORS } from '../../metro/trainModel';
import { GeoBag, boxMM, latheMeters, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import type { MetroMaterials } from './materials';
import { createPsdBank, type PsdController } from './psd';
import { buildSlabTracks } from './track';

/**
 * The floating Meridian bridge (spec §2.6, §4; Phase 3 task P3-3).
 *
 * Builds:
 *  - Chamfered white-painted steel box-girder bridge spanning the nave (z = 20..128), stopping 50 mm short of both
 *    end walls as a crisp expansion shadow gap everywhere except the two track beds, with 6 m fascia splice plates
 *    and warm 3200 K soffit cove lighting along both long edges so the bridge floats 24 m above the Crossing floor.
 *  - 22 instanced 30 mm polished stainless hanger assemblies (cast girder edge node + rod + 0.25 m flush sky rosette)
 *    every 9 m along both edges, hanging the bridge straight from the buried sky.
 *  - Dark terrazzo island deck (y = -46) with flush ink-blue satin enamel inlays, cut for the disc well and F5
 *    openings, guarded by 1.1 m ultra-clear glass balustrades with brushed stainless caps.
 *  - Full-height Meridian platform screen doors (`psd.ts`) and modern concrete slab tracks (`track.ts`).
 *
 * Budget: 14 draw calls total (bridge + hangers + balustrades + both PSD rows + both slab tracks).
 */

const BRIDGE_DETAIL = {
  /** Girder vertical profile (world Y): island terrazzo top -46, box soffit -47.92, tapered outer wing -47.76. */
  terrazzoT: 0.06,
  wingTopY: MERIDIAN.railY - 0.58,     // -47.68 (matches track concrete plinth bottom cleanly)
  wingEdgeTopY: MERIDIAN.railY - 0.32, // -47.42 (outer curb lip rising beside track bed, clear of x = 11.54 plinth)
  wingBotY: -47.76,                    // aerodynamic outer wing underside
  spineBotY: -47.92,                   // central box girder underside
  girderChamfer: 0.03,
  /** 6 m splice-plate and underside transverse rib rhythm along the 108 m span. */
  splicePitch: 6.0,
  spliceW: 0.34,
  spliceProud: 0.016,
  soffitRibW: 0.055,
  soffitRibDrop: 0.035,
  /** Warm 3200 K soffit cove pocket carved cleanly inside the solid outer curb (x = ±11.72..±12.14, 24 cm below curb top). */
  coveOuterLipW: 0.16,                 // lip at x = 12.14..12.30
  coveWidth: 0.42,                     // pocket at x = 11.72..12.14
  coveRecessY: -47.66,                 // 10 cm pocket above wingBotY (-47.76), 24 cm below wingEdgeTopY (-47.42)
  coveStripY: -47.685,                 // glowing 3200 K downward ribbon directly visible from Crossing & Skyhole
  /** Balustrade dimensions matching void Monolith language. */
  balH: 1.1,
  balGlassBot: 0.10,
  balGlassTop: 1.04,
  balPostPitch: 2.2,
  /** Hanger rod anchor Y on the girder outer edge & slight AA-safe visual radius (36 mm dia keeps hairline crisp at 40 m). */
  hangerBaseY: MERIDIAN.railY - 0.36,  // -47.46
  hangerVisualR: 0.018,
} as const;

export interface MeridianBridgeBuild {
  group: THREE.Group;
  /** Screen door controllers indexed [track0 (northbound), track1 (southbound)], driven by Phase 4. */
  psdRows: [PsdController, PsdController];
  deepMaterials: THREE.Material[];
}

const ccw = (pts: readonly P2[]): P2[] => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? [...pts].reverse() : [...pts];
};

function circlePts(cx: number, cz: number, r: number, n = 64): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cz - r * Math.sin(a)] as [number, number];
  });
}

function rectPts(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  return [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
}

/** Extruded XZ slab with holes, top at yTop, thickness t. */
function slabGeo(
  outer: ReadonlyArray<readonly [number, number]>,
  holes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  yTop: number,
  t: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes = holes.map((h) => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, yTop - t, 0);
  return g;
}

/** Horizontal segment box along (x0,z0)-(x1,z1), thickness `th` across, height y0..y1. */
function segBox(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, th: number, ext = 0): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, z1 - z0) + 2 * ext;
  const g = new THREE.BoxGeometry(len, y1 - y0, th);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

function quadGeo(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ref: THREE.Vector3): THREE.BufferGeometry {
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const pts = n.dot(ref) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Single precision hanger assembly prototype in local space (origin = girder edge anchor at y = 0, rising to y = height):
 * cast clevis fork + pin node, tapered collar, 30 mm tension rod, upper turnbuckle sleeve, and 0.25 m flush sky rosette.
 */
function buildHangerPrototype(height: number): THREE.BufferGeometry {
  const r = BRIDGE_DETAIL.hangerVisualR; // 0.018 m (36 mm dia: razor-thin hairline with clean MSAA continuity at 40 m)
  const rr = MERIDIAN.rosetteR + 0.015;  // 0.14 m (28 cm dia flush sky anchor rosette)
  const parts: THREE.BufferGeometry[] = [];
  const normGeo = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const out = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
    if (!out.getAttribute('normal')) out.computeVertexNormals();
    return out;
  };

  // 1. Cast structural node gripping the girder edge (y = -0.18 .. +0.34)
  const nodeProf: P2[] = [
    [0, -0.18], [0.068, -0.18], [0.08, -0.14], [0.08, 0.05], [0.055, 0.11], [0.038, 0.16],
    [0.038, 0.26], [r * 1.45, 0.31], [r, 0.34], [0, 0.34],
  ];
  parts.push(normGeo(latheMeters(nodeProf, 14, 1, 1)));
  // Clevis pin running along Z through the node head
  const pin = new THREE.CylinderGeometry(0.034, 0.034, 0.19, 12);
  pin.rotateX(Math.PI / 2);
  pin.translate(0, -0.04, 0);
  parts.push(normGeo(pin));

  // 2. Hairline tension rod rising straight to the sky
  const rodLen = height - 0.50;
  const rod = new THREE.CylinderGeometry(r, r, rodLen, 10, 1, false);
  rod.translate(0, 0.34 + rodLen / 2, 0);
  parts.push(normGeo(rod));

  // 3. Upper turnbuckle sleeve + crisp stepped flush sky anchor rosette (flush at y = height)
  const rosProf: P2[] = [
    [0, height - 0.24], [r, height - 0.24], [r * 1.6, height - 0.18], [0.042, height - 0.14],
    [0.042, height - 0.048], [0.072, height - 0.032], [rr - 0.012, height - 0.022],
    [rr, height - 0.010], [rr, height], [0, height],
  ];
  parts.push(normGeo(latheMeters(rosProf, 22, 1, 1)));

  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

export function buildMeridianBridge(lib: MaterialLibrary, kit: MetroMaterials): MeridianBridgeBuild {
  const group = new THREE.Group();
  group.name = 'metroMeridianBridge';

  const { cx, cz } = OCULUS;
  const isl = MERIDIAN.island;
  const yTop = MERIDIAN.topY; // -46.0
  const hw = MERIDIAN.railDeckHalfWidth; // 12.3
  const zGapS = CAVERN.nave.zMin + MERIDIAN.expansionGap; // 20.05
  const zGapN = CAVERN.nave.zMax - MERIDIAN.expansionGap; // 127.95

  const steelBag = new GeoBag(lib, 'wallStone', kit.metersPerTile.whiteSteel);
  const terrazzoBag = new GeoBag(lib, 'darkMarble', kit.metersPerTile.terrazzo);
  const inlayBag = new GeoBag(lib, 'wallStone', 1);
  const coveParts: THREE.BufferGeometry[] = [];
  const balMetalBag = new GeoBag(lib, 'castIron', kit.metersPerTile.stainless);
  const balGlassGeos: THREE.BufferGeometry[] = [];

  // ---- 1. White-painted steel box-girder bridge (z = 20.05 .. 127.95; 50 mm expansion gap at nave walls) ----
  {
    const D = BRIDGE_DETAIL;
    const ch = D.girderChamfer;
    const xIsl = isl.xMax; // 9.0
    const yGirderTop = yTop - D.terrazzoT; // -46.06

    // A. Central island structural box girder (z = 29 .. 119, x = -9 .. +9) cut cleanly for disc well + F5 openings.
    const islandHoles = [
      circlePts(cx, cz, DISC.wellR, 64),
      ...MERIDIAN.f5OpeningX.map(([a, b]) => rectPts(a, MERIDIAN.f5OpeningZ[0], b, MERIDIAN.f5OpeningZ[1])),
    ];
    steelBag.add(slabGeo(rectPts(isl.xMin, isl.zMin, isl.xMax, isl.zMax), islandHoles, yGirderTop, yGirderTop - D.spineBotY));

    // Chamfered nose fascias closing the south (z = 29) and north (z = 119) ends of the island deck cleanly.
    const noseProf = ccw([
      [0, D.wingBotY], [0.18, D.wingBotY], [0.18, yGirderTop - ch], [0.18 - ch, yGirderTop], [0, yGirderTop],
    ]);
    for (const [zEnd, dirZ] of [[isl.zMin, -1], [isl.zMax, +1]] as const) {
      const fr: Frame[] = [
        { o: v3(isl.xMin, 0, zEnd), a: v3(0, 0, dirZ), b: v3(0, 1, 0) },
        { o: v3(isl.xMax, 0, zEnd), a: v3(0, 0, dirZ), b: v3(0, 1, 0) },
      ];
      steelBag.add(sweep(noseProf, fr, { closed: true, caps: true }));
    }

    // B. Full-nave slender aerodynamic steel track wings + recessed 3200 K soffit cove channel (z = 20.05 .. 127.95)
    // Wing profile tapers up from spineBotY (-47.92) to a carved soffit cove pocket inside the outer curb so both
    // warm 3200 K cove ribbons are cleanly visible from Crossing, Skyhole, and Floor (non-self-intersecting solid).
    const coveLipInnerX = hw - D.coveOuterLipW;              // 12.14
    const coveInnerX = coveLipInnerX - D.coveWidth;          // 11.72
    const curbInnerX = coveInnerX - 0.06;                    // 11.66 (clear of track plinth outer edge 11.54)
    for (const side of [-1, 1] as const) {
      const wingProf = ccw([
        [side * (xIsl - 0.1), D.spineBotY],
        [side * (xIsl + 0.4), D.spineBotY],
        [side * coveInnerX, D.wingBotY],
        [side * coveInnerX, D.coveRecessY],
        [side * coveLipInnerX, D.coveRecessY],
        [side * coveLipInnerX, D.wingBotY],
        [side * (hw - ch), D.wingBotY],
        [side * hw, D.wingBotY + ch],
        [side * hw, D.wingEdgeTopY - ch],
        [side * (hw - ch), D.wingEdgeTopY],
        [side * curbInnerX, D.wingEdgeTopY],
        [side * (curbInnerX - 0.02), D.wingTopY],
        [side * (xIsl - 0.1), D.wingTopY],
      ]);
      const fr: Frame[] = [
        { o: v3(0, 0, zGapS), a: v3(1, 0, 0), b: v3(0, 1, 0) },
        { o: v3(0, 0, zGapN), a: v3(1, 0, 0), b: v3(0, 1, 0) },
      ];
      steelBag.add(sweep(wingProf, fr, { closed: true, caps: true }));

      // 6 m architectural bolt/splice-plate rhythm along the outer fascia (x = ±12.3)
      for (let z = cz - 8 * D.splicePitch; z <= cz + 8 * D.splicePitch + 0.01; z += D.splicePitch) {
        if (z < zGapS + 0.5 || z > zGapN - 0.5) continue;
        const x0 = side > 0 ? hw : -hw - D.spliceProud;
        const x1 = side > 0 ? hw + D.spliceProud : -hw;
        steelBag.add(boxMM(x0, D.wingBotY + 0.03, z - D.spliceW / 2, x1, D.wingEdgeTopY - 0.03, z + D.spliceW / 2));
      }

      // Warm 3200 K soffit cove ribbon cleanly exposed inside the carved outer pocket (runs full 108 m bridge length)
      const cx0 = side > 0 ? coveInnerX + 0.02 : -coveLipInnerX + 0.02;
      const cx1 = side > 0 ? coveLipInnerX - 0.02 : -(coveInnerX + 0.02);
      coveParts.push(quadGeo(
        v3(cx0, D.coveStripY, zGapS + 0.08), v3(cx1, D.coveStripY, zGapS + 0.08),
        v3(cx1, D.coveStripY, zGapN - 0.08), v3(cx0, D.coveStripY, zGapN - 0.08),
        v3(0, -1, 0),
      ));
      // Subtle angled warm diffuser on the inner cove wall facing outward so shallow views (crossing/skyhole) catch the warm wash
      const innerWallX = side > 0 ? coveInnerX + 0.015 : -(coveInnerX + 0.015);
      coveParts.push(quadGeo(
        v3(innerWallX, D.coveRecessY, zGapS + 0.08), v3(innerWallX, D.wingBotY + 0.01, zGapS + 0.08),
        v3(innerWallX, D.wingBotY + 0.01, zGapN - 0.08), v3(innerWallX, D.coveRecessY, zGapN - 0.08),
        v3(side, 0, 0),
      ));
    }

    // Subtle 6 m transverse structural soffit ribs across the bridge belly (aligned to the fascia splice plates,
    // interrupted cleanly around the central disc well and F5 openings so the soffit reads as crafted engineering).
    for (let z = cz - 8 * D.splicePitch; z <= cz + 8 * D.splicePitch + 0.01; z += D.splicePitch) {
      if (z < zGapS + 1.0 || z > zGapN - 1.0) continue;
      // Skip ribs crossing the disc well (z 70..78) or F5 openings (z 107..113.6) by splitting around them
      const z0 = z - D.soffitRibW / 2, z1 = z + D.soffitRibW / 2;
      const yRib0 = D.spineBotY - D.soffitRibDrop, yRib1 = D.spineBotY + 0.01;
      if (Math.abs(z - cz) < DISC.wellR + 0.45) {
        const xHole = Math.sqrt(Math.max(0, (DISC.wellR + 0.25) ** 2 - (z - cz) ** 2)) + 0.15;
        steelBag.add(boxMM(-xIsl, yRib0, z0, -xHole, yRib1, z1));
        steelBag.add(boxMM(xHole, yRib0, z0, xIsl, yRib1, z1));
      } else if (z > MERIDIAN.f5OpeningZ[0] - 0.35 && z < MERIDIAN.f5OpeningZ[1] + 0.35) {
        steelBag.add(boxMM(-xIsl, yRib0, z0, -7.95, yRib1, z1));
        steelBag.add(boxMM(-4.05, yRib0, z0, 4.05, yRib1, z1));
        steelBag.add(boxMM(7.95, yRib0, z0, xIsl, yRib1, z1));
      } else {
        steelBag.add(boxMM(-xIsl, yRib0, z0, xIsl, yRib1, z1));
      }
    }

    // C. Central spine deck between tracks beyond the island ends (z = 20.05..29.0 and 119.0..127.95, 50 mm short of walls)
    for (const [za, zb] of [[zGapS, isl.zMin], [isl.zMax, zGapN]] as const) {
      steelBag.add(boxMM(-xIsl + 0.1, D.spineBotY, za, xIsl - 0.1, D.wingTopY, zb));
    }

    // D. Track-bed invert plates extending cleanly from zGapS/N into all 4 Meridian portal bores (flush with bore sill -47.7)
    for (const tx of MERIDIAN.trackX) {
      steelBag.add(boxMM(tx - 1.75, MERIDIAN.railY - 0.6, CAVERN.nave.zMin - 0.4, tx + 1.75, D.wingTopY, zGapS + 0.05));
      steelBag.add(boxMM(tx - 1.75, MERIDIAN.railY - 0.6, zGapN - 0.05, tx + 1.75, D.wingTopY, CAVERN.nave.zMax + 0.4));
    }
  }

  // ---- 2. Island deck top: dark polished terrazzo + flush ink-blue satin enamel inlays ----
  {
    // 0.08 m ink-blue enamel wayfinding line 0.5 m inside each PSD line (x = ±8.15), inlaid flush in the terrazzo.
    const inlayX = isl.xMax - PSD.inset - MERIDIAN.inlayOffset; // 8.15
    const hwI = MERIDIAN.inlayWidth / 2;
    const iz0 = isl.zMin + 0.35, iz1 = isl.zMax - 0.35;
    const islandHoles = [
      circlePts(cx, cz, DISC.wellR, 64),
      ...MERIDIAN.f5OpeningX.map(([a, b]) => rectPts(a, MERIDIAN.f5OpeningZ[0], b, MERIDIAN.f5OpeningZ[1])),
      rectPts(-inlayX - hwI, iz0, -inlayX + hwI, iz1),
      rectPts(+inlayX - hwI, iz0, +inlayX + hwI, iz1),
    ];
    terrazzoBag.add(slabGeo(rectPts(isl.xMin, isl.zMin, isl.xMax, isl.zMax), islandHoles, yTop, BRIDGE_DETAIL.terrazzoT));

    for (const side of [-1, 1] as const) {
      const ix = side * inlayX;
      inlayBag.add(boxMM(ix - hwI, yTop - BRIDGE_DETAIL.terrazzoT, iz0, ix + hwI, yTop, iz1));
    }
  }

  // ---- 3. Ultra-clear 1.1 m glass balustrades (disc well, F5 openings, F4 low footprints, island ends) ----
  {
    const B = BRIDGE_DETAIL;
    const addGlassRun = (pts: ReadonlyArray<readonly [number, number]>): void => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, z0] = pts[i]!, [x1, z1] = pts[i + 1]!;
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.ceil(len / B.balPostPitch));
        const at = (k: number): [number, number] => [x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n];
        for (let k = i === 0 ? 0 : 1; k <= n; k++) {
          const [px, pz] = at(k);
          balMetalBag.add(boxMM(px - 0.022, yTop, pz - 0.022, px + 0.022, yTop + B.balH, pz + 0.022));
        }
        for (let k = 0; k < n; k++) {
          const [ax, az] = at(k), [bx, bz] = at(k + 1);
          balMetalBag.add(segBox(ax, az, bx, bz, yTop + B.balH - 0.042, yTop + B.balH, 0.048, 0.022));
          balMetalBag.add(segBox(ax, az, bx, bz, yTop, yTop + B.balGlassBot, 0.056));
          const gl = Math.hypot(bx - ax, bz - az);
          if (gl > 0.09) {
            const gx = (bx - ax) / gl, gz = (bz - az) / gl;
            balGlassGeos.push(segBox(
              ax + gx * 0.03, az + gz * 0.03, bx - gx * 0.03, bz - gz * 0.03,
              yTop + B.balGlassBot, yTop + B.balGlassTop, 0.012,
            ));
          }
        }
      }
    };

    // 360-degree glass balustrade ring around the disc well (r = 4.06; disc passes through without stopping here)
    const wellSegs = 28;
    const rW = DISC.wellR + 0.06;
    const wellPts: Array<[number, number]> = [];
    for (let i = 0; i <= wellSegs; i++) {
      const a = (i / wellSegs) * Math.PI * 2;
      wellPts.push([cx + rW * Math.cos(a), cz + rW * Math.sin(a)]);
    }
    addGlassRun(wellPts);

    // F5 openings (x in ±[4.2, 7.8], z in [107.0, 113.6]): open at NORTH combplate mouth (z = 113.6), guarded on E/S/W
    const [fz0, fz1] = MERIDIAN.f5OpeningZ;
    for (const [xa, xb] of MERIDIAN.f5OpeningX) {
      addGlassRun([
        [xa - 0.05, fz1], [xa - 0.05, fz0 - 0.05], [xb + 0.05, fz0 - 0.05], [xb + 0.05, fz1],
      ]);
    }

    // Island south and north end balustrades (spanning between the two PSD lines x = ±8.65)
    const xPsd = isl.xMax - PSD.inset;
    // The south end is open for the canopy walk (CANOPY_WALK.gapHalf either side of x = 0, src/metro/walks.ts)
    const gap = CANOPY_WALK.gapHalf;
    addGlassRun([[-xPsd, isl.zMin + 0.06], [-gap, isl.zMin + 0.06]]);
    addGlassRun([[gap, isl.zMin + 0.06], [xPsd, isl.zMin + 0.06]]);
    addGlassRun([[-xPsd, isl.zMax - 0.06], [xPsd, isl.zMax - 0.06]]);

    // Precision brushed-stainless soffit collar ring on the underside of the disc well opening (0 extra draw calls)
    const collarProf = ccw([[0, 0], [0.05, 0], [0.05, -0.05], [0, -0.05]]);
    const collarFr: Frame[] = [];
    const cn = 64;
    for (let i = 0; i <= cn; i++) {
      const phi = (i / cn) * Math.PI * 2;
      const rad = v3(Math.cos(phi), 0, Math.sin(phi));
      collarFr.push({ o: v3(cx + DISC.wellR * rad.x, BRIDGE_DETAIL.spineBotY, cz + DISC.wellR * rad.z), a: rad.clone(), b: v3(0, 1, 0) });
    }
    balMetalBag.add(sweep(collarProf, collarFr, { closed: true }));
  }

  // ---- 4. 22 instanced hairline stainless hangers (every 9 m along both bridge edges up to SKY.y = -32) ----
  // Slightly richer steel albedo & controlled envMapIntensity so the slender rods hold crisp dark-silver contrast
  // against the bright buried noon sky without vanishing or breaking into MSAA dots.
  const hangerMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepBridgeHanger',
    color: 0x8a95a0,
    metalness: 0.92,
    roughness: 0.24,
    envMapIntensity: 0.80,
  });
  const hangerPositions: Array<[number, number, number]> = [];
  for (let k = -5; k <= 5; k++) {
    const z = cz + k * MERIDIAN.hangerPitch; // 29, 38, ..., 119
    for (const side of [-1, 1] as const) {
      hangerPositions.push([side * MERIDIAN.hangerX, BRIDGE_DETAIL.hangerBaseY, z]);
    }
  }
  const hangerH = SKY.y - BRIDGE_DETAIL.hangerBaseY; // 15.46 m straight up to the buried sky
  const hangerMesh = new THREE.InstancedMesh(buildHangerPrototype(hangerH), hangerMat, hangerPositions.length);
  hangerMesh.name = 'meridianHangers';
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < hangerPositions.length; i++) {
    const [hx, hy, hz] = hangerPositions[i]!;
    m4.makeTranslation(hx, hy, hz);
    hangerMesh.setMatrixAt(i, m4);
  }
  hangerMesh.instanceMatrix.needsUpdate = true;
  hangerMesh.computeBoundingSphere();

  // ---- 5. Platform screen doors (both 90 m Meridian edges batched into 5 calls, incl. balustrade glass) ----
  const t0 = trackOf('meridian', 0);
  const t1 = trackOf('meridian', 1);
  const psdBank = createPsdBank(
    [
      { track: t0, side: -1, platformY: yTop, platformHalfLen: 45, initialDisplay: formatTransomText('meridian', 0, null, false) },
      { track: t1, side: -1, platformY: yTop, platformHalfLen: 45, initialDisplay: formatTransomText('meridian', 1, null, false) },
    ],
    lib,
    kit,
    { name: 'meridianPsd', extraFixedGlass: balGlassGeos },
  );

  // ---- 6. Modern slab tracks (entering all 4 Meridian bores cleanly and receding 24 m into the dark tunnels) ----
  const tracks = buildSlabTracks(
    [
      { track: t0, sMin: -78, sMax: 78 },
      { track: t1, sMin: -78, sMax: 78 },
    ],
    lib,
    kit,
    'meridianTracks',
  );

  // ---- Assemble meshes (14 draw calls total) ----
  const inlayCol = LINE_COLORS.meridian;
  const inlayMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepMeridianInlay',
    color: new THREE.Color().setRGB(inlayCol[0] * 0.85, inlayCol[1] * 0.85, inlayCol[2] * 0.85),
    roughness: 0.34,
    metalness: 0.08,
  });
  // Plain satin stainless for balustrade caps & posts (crisp architectural steel without stretched streaks).
  const balStainlessMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepBridgeStainless',
    color: 0xd0d5d9,
    metalness: 1.0,
    roughness: 0.24,
    envMapIntensity: 1.2,
  });

  const addM = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, noShadow = false): void => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (noShadow) m.userData.noShadow = true;
    group.add(m);
  };

  addM(steelBag.merge(), kit.deep.whiteSteel, 'meridianGirder');
  addM(terrazzoBag.merge(), kit.deep.terrazzo, 'meridianTerrazzo');
  addM(inlayBag.merge(), inlayMat, 'meridianInlay', true);
  if (coveParts.length > 0) {
    const mergedCove = mergeGeometries(coveParts, false)!;
    for (const p of coveParts) p.dispose();
    addM(mergedCove, kit.deep.emissive.coveStrip, 'meridianCove', true);
  }
  addM(balMetalBag.merge(), balStainlessMat, 'meridianBalustradeMetal');
  group.add(hangerMesh, psdBank.group, tracks.group);

  return {
    group,
    psdRows: [psdBank.rows[0]!, psdBank.rows[1]!],
    deepMaterials: [hangerMat, inlayMat, balStainlessMat, ...psdBank.deepMaterials, ...tracks.deepMaterials],
  };
}
