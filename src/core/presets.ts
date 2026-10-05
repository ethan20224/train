import * as THREE from 'three';
import {
  ARCHES,
  BOOKING_OFFICE,
  CONCIERGE,
  CONCOURSE,
  FOOTBRIDGE,
  GATES,
  LOUNGE,
  ISLANDS,
  KIOSK,
  PLAYER,
  RAIL,
  SHED,
  STAIR,
  START_POSE,
  TRACKS,
  type Vec3,
} from '../layout';

/**
 * Camera presets for `?cam=<name>` (fixed camera, no pointer lock). All coordinates derive from layout.ts.
 * Each is a deliberate composition, see `intent`. Camera is placed at `position` and looks at `target`.
 */

export const PRESET_NAMES = [
  'balcony',
  'concourse',
  'kiosk',
  'window',
  'arches',
  'platform',
  'shed',
  'haze',
  'lounge',
  'booking',
  'concierge',
  'gates',
  'bridge',
  'bridgedeck',
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export interface CameraPreset {
  position: Vec3;
  target: Vec3;
  fov?: number;
  intent: string;
}

const EYE = PLAYER.eyeHeight;
const islandB = ISLANDS.find((i) => i.id === 'B');
const t3 = TRACKS.find((t) => t.id === 'T3');
if (!islandB || !t3) throw new Error('layout is missing island B / track T3');

const startPos: Vec3 = [START_POSE.position[0], START_POSE.position[1] + EYE, START_POSE.position[2]];
// Direction for the start pose: three.js YXZ euler (pitch about X, yaw about Y) applied to -Z.
const startDir = new THREE.Vector3(0, 0, -1).applyEuler(
  new THREE.Euler(THREE.MathUtils.degToRad(START_POSE.pitchDeg), START_POSE.yaw, 0, 'YXZ'),
);

export const PRESETS: Record<PresetName, CameraPreset> = {
  balcony: {
    position: startPos,
    target: [startPos[0] + startDir.x * 60, startPos[1] + startDir.y * 60, startPos[2] + startDir.z * 60],
    intent: 'Start pose: standing at the top of the grand stair, looking down the length of the hall.',
  },
  concourse: {
    // Floor level at the foot of the stair, a little off-axis, looking north up the hall: kiosk clock mid-frame,
    // departures board and arches terminating the vista.
    position: [-9, EYE, STAIR.zMax + 4],
    target: [-2, 12, CONCOURSE.zMax - 20],
    intent: 'Eye-level at the stair foot looking north: kiosk, board, arches, vault.',
  },
  kiosk: {
    // 3/4 view from the sun side (south-west of the kiosk) so the brass clock faces catch light.
    position: [KIOSK.center[0] - 9, EYE + 0.6, KIOSK.center[1] - 11],
    target: [KIOSK.center[0], KIOSK.clockY - 1.5, KIOSK.center[1]],
    intent: 'Three-quarter view of the four-faced clock, looking slightly up at it.',
  },
  window: {
    // Look toward the sun (-X) into the middle window bay: beams cross the camera and floor.
    position: [12, EYE, KIOSK.center[1] - 20],
    target: [CONCOURSE.xMin, 9, KIOSK.center[1]],
    fov: 58,
    intent: 'Contre-jour toward the west window bay at z = 50 to read the light beams.',
  },
  arches: {
    position: [0, EYE, ARCHES.zMin - 36],
    target: [0, 6, 220],
    intent: 'Centred on the middle arch, looking through to the shed and tracks beyond.',
  },
  platform: {
    // On island B, left of the camera is T3 where a train stands (nose at RAIL.trainStopNoseZ);
    // looking back toward the concourse arches.
    position: [islandB.centerX + 3, EYE, 168],
    target: [t3.centerX + 5, 3.4, RAIL.trainStopNoseZ - 12],
    intent: 'Standing on platform 3/4 alongside the train on T3, looking back toward the concourse.',
  },
  shed: {
    position: [0, 16, SHED.zMin + 10],
    target: [0, 19, 300],
    fov: 68,
    intent: 'High view under the roof, down the axis of the trusses.',
  },
  haze: {
    position: [islandB.centerX, EYE, 330],
    target: [islandB.centerX, 3.2, 700],
    intent: 'Island B near the shed end, looking north where tracks dissolve into golden fog.',
  },
  lounge: {
    position: [LOUNGE.wings[0].xMax - 1, LOUNGE.y + EYE, 1.2],
    target: [LOUNGE.wings[0].xMin + 2, LOUNGE.y + 0.6, 6.5],
    intent: 'Balcony west wing: the first-class lounge, looking across the armchairs toward the hall rail.',
  },
  booking: {
    position: [BOOKING_OFFICE.windowCentersX[1] + 4, EYE, BOOKING_OFFICE.faceZ + 7],
    target: [BOOKING_OFFICE.windowCentersX[1] - 1, 1.6, BOOKING_OFFICE.faceZ],
    intent: 'Three-quarter view of the booking office ticket windows under the balcony.',
  },
  concierge: {
    position: [CONCIERGE.interact.centerX - 4, EYE, CONCIERGE.desk.zMax + 6],
    target: [CONCIERGE.interact.centerX + 1, 1.4, CONCIERGE.faceZ],
    intent: 'Three-quarter view of the concierge desk, bell and key-box wall.',
  },
  gates: {
    position: [-6, EYE + 0.4, GATES.zMin - 9],
    target: [0, 1.2, GATES.lineZ + 4],
    intent: 'Approaching the centre bank of ticket gates, arches and board beyond.',
  },
  bridge: {
    position: [islandB.centerX + 3, EYE, FOOTBRIDGE.stairBottomZ - 26],
    target: [islandB.centerX, FOOTBRIDGE.deckTopY - 1, FOOTBRIDGE.centerZ],
    intent: 'From island B looking north at the footbridge spanning the shed, stair rising toward it.',
  },
  bridgedeck: {
    position: [6, FOOTBRIDGE.deckTopY + EYE, FOOTBRIDGE.centerZ],
    target: [-12, 0, FOOTBRIDGE.centerZ - 40],
    intent: 'On the bridge deck looking down and south over the tracks toward the concourse.',
  },
};

/** Parses `?cam=` from a query string; returns null if absent or unknown. */
export function parsePreset(search: string): PresetName | null {
  const v = new URLSearchParams(search).get('cam');
  return v && (PRESET_NAMES as readonly string[]).includes(v) ? (v as PresetName) : null;
}

export function applyPreset(camera: THREE.PerspectiveCamera, name: PresetName): void {
  const p = PRESETS[name];
  camera.position.set(...p.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(p.target[0], p.target[1], p.target[2]);
  if (p.fov !== undefined && camera.fov !== p.fov) {
    camera.fov = p.fov;
    camera.updateProjectionMatrix();
  }
}
