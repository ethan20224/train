import * as THREE from 'three';
import { PLATFORM_SAFETY as PS } from '../../layout';
import { box } from '../shed/common';
import { ball } from '../gates/geo';

/**
 * Geometry for one half-height barrier run, built in a LOCAL frame: the run lies along +z (a..b), the barrier
 * centre plane is x = 0, y up. Callers rotate/translate the result into place. Same vocabulary as the ticket
 * gates: walnut rail, dark marble plinth, aged-brass posts with ball finials, slim glazing bars.
 */
export interface RunParts {
  dark: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
  brass: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
}
export const emptyParts = (): RunParts => ({ dark: [], wood: [], brass: [], glass: [] });

const H = PS.barrierHeight;
const PLINTH = 0.38;
const RAIL_Y = H - 0.08;
const HALF_OPEN = PS.openingWidth / 2;

function post3(p: RunParts, z: number, jamb: boolean): void {
  p.brass.push(box(-0.068, 0.068, 0, 0.17, z - 0.068, z + 0.068)); // foot
  p.brass.push(box(-0.075, 0.075, 0.17, 0.19, z - 0.075, z + 0.075)); // foot cap
  p.brass.push(box(-0.04, 0.04, 0.19, H, z - 0.04, z + 0.04)); // shaft
  p.brass.push(box(-0.052, 0.052, PLINTH - 0.02, PLINTH + 0.03, z - 0.052, z + 0.052)); // lower collar
  p.brass.push(box(-0.052, 0.052, RAIL_Y - 0.03, RAIL_Y + 0.0, z - 0.052, z + 0.052)); // upper collar
  p.brass.push(ball(0, H + 0.04, z, jamb ? 0.05 : 0.042, 7));
}

/** One fixed bay between posts at z0..z1 (post centres). */
function bay(p: RunParts, z0: number, z1: number): void {
  const a = z0 + 0.04;
  const b = z1 - 0.04;
  const gy0 = PLINTH + 0.02;
  const gy1 = RAIL_Y - 0.02;
  // plinth + inlay + cap
  p.dark.push(box(-0.055, 0.055, 0, PLINTH, a, b));
  p.brass.push(box(-0.059, 0.059, 0.17, 0.182, a, b));
  p.brass.push(box(-0.062, 0.062, PLINTH, PLINTH + 0.02, a, b));
  // walnut top rail with brass cap lines
  p.wood.push(box(-0.05, 0.05, RAIL_Y, H - 0.01, a, b));
  p.brass.push(box(-0.054, 0.054, H - 0.01, H, a, b));
  p.brass.push(box(-0.046, 0.046, RAIL_Y - 0.02, RAIL_Y, a, b));
  // glass + centre glazing bar + bevel hairline (proud brass frame on both faces of the pane)
  const g = new THREE.PlaneGeometry(b - a, gy1 - gy0);
  g.rotateY(Math.PI / 2);
  g.translate(0, (gy0 + gy1) / 2, (a + b) / 2);
  p.glass.push(g);
  const zm = (a + b) / 2;
  p.brass.push(box(-0.014, 0.014, gy0, gy1, zm - 0.008, zm + 0.008));
  const t = 0.008;
  const ins = 0.07;
  {
    const x0 = -0.011;
    const x1 = 0.011;
    p.brass.push(box(x0, x1, gy0 + ins, gy0 + ins + t, a + ins, b - ins));
    p.brass.push(box(x0, x1, gy1 - ins - t, gy1 - ins, a + ins, b - ins));
    p.brass.push(box(x0, x1, gy0 + ins, gy1 - ins, a + ins, a + ins + t));
    p.brass.push(box(x0, x1, gy0 + ins, gy1 - ins, b - ins - t, b - ins));
  }
}

/** Fixed run between two post centres, subdivided into ~2.4 m bays. */
function fixedSegment(p: RunParts, s0: number, s1: number, jambEnds: [boolean, boolean]): void {
  const len = s1 - s0;
  if (len < 0.3) return;
  const n = Math.max(1, Math.round(len / 2.4));
  for (let i = 0; i <= n; i++) {
    const z = s0 + (len * i) / n;
    post3(p, z, (i === 0 && jambEnds[0]) || (i === n && jambEnds[1]));
  }
  for (let i = 0; i < n; i++) bay(p, s0 + (len * i) / n, s0 + (len * (i + 1)) / n);
}

/** Door opening: a low marble sill with a brass track; the leaves are separate instanced meshes. */
function opening(p: RunParts, d: number): void {
  const a = d - HALF_OPEN;
  const b = d + HALF_OPEN;
  p.dark.push(box(-0.07, 0.07, 0, 0.1, a, b));
  p.brass.push(box(-0.075, 0.075, 0.1, 0.112, a, b));
}

/** Build a whole run from `a` to `b` with door openings centred at `doors` (sorted ascending). */
export function buildRun(a: number, b: number, doors: number[]): RunParts {
  const p = emptyParts();
  let cursor = a;
  let prevJamb = false;
  for (const d of doors) {
    fixedSegment(p, cursor, d - HALF_OPEN, [prevJamb, true]);
    opening(p, d);
    cursor = d + HALF_OPEN;
    prevJamb = true;
  }
  fixedSegment(p, cursor, b, [prevJamb, false]);
  return p;
}

/**
 * Door leaf, centred at its own origin (local z in +-0.375), x = 0 centre plane. Slides along z.
 * The caller offsets each leaf toward the track side so it parks behind the fixed bays.
 */
export interface LeafParts {
  brass: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
}
export function buildLeaf(): LeafParts {
  const w = HALF_OPEN / 2 - 0.004; // slight reveal between leaves
  const hw = w;
  const y0 = 0.12;
  const brass: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const th = 0.018;
  // stiles, top rail, mid rail, bottom rail
  brass.push(box(-th, th, y0, H, -hw, -hw + 0.04));
  brass.push(box(-th, th, y0, H, hw - 0.04, hw));
  brass.push(box(-th - 0.004, th + 0.004, RAIL_Y, H, -hw, hw));
  brass.push(box(-th, th, PLINTH - 0.02, PLINTH + 0.02, -hw, hw));
  brass.push(box(-th, th, y0, y0 + 0.025, -hw, hw));
  dark.push(box(-0.012, 0.012, y0 + 0.025, PLINTH - 0.02, -hw + 0.04, hw - 0.04));
  // brass inlay line on the kick panel (echoes the plinth inlay)
  brass.push(box(-0.015, 0.015, 0.17, 0.182, -hw + 0.04, hw - 0.04));
  const gy0 = PLINTH + 0.02;
  const gy1 = RAIL_Y;
  const g = new THREE.PlaneGeometry(2 * hw - 0.08, gy1 - gy0);
  g.rotateY(Math.PI / 2);
  g.translate(0, (gy0 + gy1) / 2, 0);
  glass.push(g);
  // bevel hairline
  const t = 0.008;
  const ins = 0.06;
  {
    const x0 = -0.01;
    const x1 = 0.01;
    brass.push(box(x0, x1, gy0 + ins, gy0 + ins + t, -hw + 0.04 + ins, hw - 0.04 - ins));
    brass.push(box(x0, x1, gy1 - ins - t, gy1 - ins, -hw + 0.04 + ins, hw - 0.04 - ins));
    brass.push(box(x0, x1, gy0 + ins, gy1 - ins, -hw + 0.04 + ins, -hw + 0.04 + ins + t));
    brass.push(box(x0, x1, gy0 + ins, gy1 - ins, hw - 0.04 - ins - t, hw - 0.04 - ins));
  }
  return { brass, dark, glass };
}

export const LEAF_HALF = HALF_OPEN / 2;
