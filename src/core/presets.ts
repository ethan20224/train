import * as THREE from 'three';
import {
  PLATFORM_END,
  DISC,
  SHOPS,
  ARCHES,
  BOOKING_OFFICE,
  CONCIERGE,
  CONCOURSE,
  FOOTBRIDGE,
  HALCYON,
  LANDINGS,
  MAP_WALL,
  MERIDIAN,
  OCULUS,
  SKY,
  THRESHOLD,
  VESPER,
  WATER_WALL,
  FUNICULAR,
  GATES,
  LOUNGE_ROOM,
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
  'loungedoor',
  'booking',
  'concierge',
  'gates',
  'bridge',
  'bridgedeck',
  'platformend',
  'shops',
  'shopseast',
  'throat',
  'throatbridge',
  'oculus', 'oculusdown', 'rim', 'void', 'strata', 'threshold', 'skyhole', 'crossing', 'meridian', 'glassfloor', 'glassup', 'mapwall', 'waterwall', 'funicular', 'deep', 'escalator', 'speedgates', 'disc', 'lifts',
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export interface CameraPreset {
  position: Vec3;
  target: Vec3;
  fov?: number;
  intent: string;
}

const EYE = PLAYER.eyeHeight;
const BALCONY_EYE = LOUNGE_ROOM.floorY + PLAYER.eyeHeight;
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
    // Inside the room, just past the doors, looking toward the south-west windows: sun beams, drapes, the seating group.
    position: [4.6, LOUNGE_ROOM.floorY + EYE, LOUNGE_ROOM.zMax - 2.5],
    target: [-8, LOUNGE_ROOM.floorY + 0.5, LOUNGE_ROOM.zMin + 3.5],
    fov: 60,
    intent: 'First-class lounge, just inside the doors, looking toward the south-west windows and the low sun.',
  },
  loungedoor: {
    // From the balcony, looking at the closed etched-glass doors in the hall's south wall.
    position: [1.6, BALCONY_EYE, 6.2],
    target: [0, LOUNGE_ROOM.floorY + 2.4, LOUNGE_ROOM.door.zMax],
    fov: 58,
    intent: 'From the balcony toward the closed walnut-and-etched-glass doors of the first-class lounge.',
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
  platformend: {
    position: [islandB.centerX + 2.5, EYE, PLATFORM_END.endZ - 14],
    target: [islandB.centerX - 1, 0.6, PLATFORM_END.endZ + 6],
    intent: 'Island B near its far end: staff ramp, locked gate, warning signs, starter signals, mirrors.',
  },
  shops: {
    // Inside the aisle (between colonnade face x -24 and shopfront face x -27.2) so no column blocks the view.
    position: [-25.4, EYE, SHOPS.units[0].bayZ - 11],
    target: [-28.6, 1.7, SHOPS.units[0].bayZ],
    intent: 'West aisle: the newsagent & tobacconist shopfront, florist beyond.',
  },
  shopseast: {
    position: [25.4, EYE, SHOPS.units[2].bayZ - 11],
    target: [28.6, 1.7, SHOPS.units[2].bayZ],
    intent: 'East aisle: coffee & pastries counter, travellers\u2019 conveniences beyond.',
  },
  throat: {
    position: [islandB.centerX + 1.5, EYE + 0.3, PLATFORM_END.endZ - 1.2],
    target: [islandB.centerX - 4, -1.5, PLATFORM_END.endZ + 80],
    fov: 55,
    intent: 'From the end of island B looking out over the station throat: pointwork, gantries, lines fanning out.',
  },
  throatbridge: {
    position: [-6, FOOTBRIDGE.deckTopY + EYE, FOOTBRIDGE.zMax - 0.7],
    target: [4, -1, PLATFORM_END.endZ + 160],
    fov: 50,
    intent: 'From the footbridge deck looking north down the platforms to the throat and the lines beyond.',
  },
  oculus: { position: [7, EYE, OCULUS.cz - 20], target: [0, -4, OCULUS.cz], intent: 'From the hall floor south of the oculus: curb, balustrade, chandelier above, light rising.' },
  oculusdown: { position: [-10.7, EYE + 0.2, OCULUS.cz + 1.5], target: [3, -15, OCULUS.cz], fov: 70, intent: 'Leaning over the rail: the void, crisscross flights, the disc, the eclipse far below.' },
  rim: { position: [-8.0, EYE, 66.4], target: [3, -2.5, 77], fov: 72, intent: 'Standing at the south-west balustrade: the ring, the gangway gates and the void seen through the openwork.' },
  void: { position: [-14, LANDINGS.L1.y + EYE, 81.8], target: [6, -24, 66], fov: 68, intent: 'On L1: era bands, light rings, flights crossing the void.' },
  strata: { position: [5.0, -15 + EYE, 71.2], target: [-19, -17.5, 70], fov: 70, intent: 'On F2 mid-flight looking across the void at the raw strata band: beds, overhangs, machined ring cuts.' },
  threshold: { position: [-9.5, THRESHOLD.y + EYE, 82.6], target: [5, -42, 58], fov: 66, intent: 'Threshold: speed gates, F4 dropping through the sky hole.' },
  skyhole: { position: [12, VESPER.topY + EYE, 66], target: [0, SKY.y, OCULUS.cz], fov: 70, intent: 'From the Crossing floor looking up at the eclipse, flights and disc descending out of the sky.' },
  crossing: { position: [-40, VESPER.topY + EYE, 70], target: [20, -52, 78], fov: 66, intent: 'Along the transept: Meridian bridge crossing overhead, sky, funicular beyond.' },
  meridian: { position: [3, MERIDIAN.topY + EYE, 40], target: [0, MERIDIAN.topY - 2, 110], intent: 'On the floating Meridian island looking north along the bridge.' },
  glassfloor: { position: [-24, VESPER.topY + EYE, 66], target: [-16, HALCYON.topY, 80], intent: 'Standing on the glass panel looking down at the Halcyon platform.' },
  glassup: { position: [HALCYON.centre[0], HALCYON.topY + EYE, HALCYON.centre[1]], target: [-10, -40, 80], fov: 72, intent: 'From the Halcyon platform looking up through the glass: bridge, droplets, sky.' },
  mapwall: { position: [0, MERIDIAN.topY + EYE, 70], target: [0, (MAP_WALL.yMin + MAP_WALL.yMax) / 2, MAP_WALL.z], intent: 'From the Meridian island facing the map wall and running clock under the sky.' },
  waterwall: { position: [-40, VESPER.topY + EYE, 74], target: [WATER_WALL.x, -55, 74], intent: 'Crossing floor west end facing the water wall and the Vesper portals.' },
  funicular: { position: [40, VESPER.topY + EYE, 80], target: [FUNICULAR.top[0], -40, FUNICULAR.z], fov: 66, intent: 'From the east floor looking up the funicular track into the sky.' },
  escalator: { position: [5.0, LANDINGS.L1.y + EYE, 80.7], target: [5.6, -17.5, 66], fov: 62, intent: 'At the top of F2 looking down the flight: steps flowing away, glass balustrades, handrails, warm skirt lines.' },
  speedgates: { position: [10.6, THRESHOLD.y + EYE, 80.6], target: [7.2, THRESHOLD.y + 0.9, 82.4], fov: 60, intent: 'Threshold: the east speed-gate bank seen from the F3 side, champagne cabinets, glass panels, light lines.' },
  disc: { position: [OCULUS.cx, DISC.topY + EYE, OCULUS.cz + 2.9], target: [OCULUS.cx, DISC.topY - 0.4, OCULUS.cz - 2.4], fov: 72, intent: 'Standing on the Sinking Floor at the top: the inlaid medallion, the brass rail, the open gangway behind.' },
  lifts: { position: [-11.2, THRESHOLD.y + EYE, 71.5], target: [-17, -25.6, 77], fov: 62, intent: 'Threshold: the two glass lift tubes rising to their stainless-and-glass machinery lanterns, sheaves visible.' },
  deep: { position: [-35, HALCYON.topY + EYE, 59], target: [0, HALCYON.topY + 1, 94], intent: 'Along the Halcyon platform diagonal.' },
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
