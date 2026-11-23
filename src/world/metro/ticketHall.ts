import * as THREE from 'three';
import { OCULUS, THRESHOLD, TICKET_HALL as TH } from '../../layoutMetro';
import { LINE_COLORS } from '../../metro/trainModel';
import { boxMM, sweep, v3, type Frame, type P2 } from '../concourse/geo';
import { FARE_TINT, RAMP_STOPS, ramped, type TintedPart } from './fareLine';

/**
 * Ticket-hall dressing of the Threshold annulus (layout: TICKET_HALL in src/layoutMetro.ts):
 *  - the station identity, backlit lettering on the north drum wall, seen by riders stepping off F3, with a thin three-line colour rule below it;
 *  - two wayfinding totems, one per F3 landing: stainless frame, frosted-white backlit face listing the three lines with colour roundels
 *    and arrows toward the gates / lifts / funicular.
 * Lettering and faces are canvas textures on unlit materials (2 draw calls); the totem frames are returned as stainless parts so the
 * caller merges them into the fare metal mesh (0 extra calls).
 */

const FONT = '"Helvetica Neue", "Avenir Next", "Inter", Helvetica, Arial, sans-serif';
const TAU = Math.PI * 2;

/** Linear RGB (LINE_COLORS) to a canvas sRGB string. */
function srgb(c: readonly [number, number, number]): string {
  const f = (v: number): number => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
}
const LINES = [
  { id: 'meridian', name: 'Meridian', letter: 'M', color: srgb(LINE_COLORS.meridian) },
  { id: 'vesper', name: 'Vesper', letter: 'V', color: srgb(LINE_COLORS.vesper) },
  { id: 'halcyon', name: 'Halcyon', letter: 'H', color: srgb(LINE_COLORS.halcyon) },
] as const;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
function finish(c: HTMLCanvasElement, maxAniso: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
/** Letter-spaced text, left edge at x, baseline y (canvas letterSpacing is not universal). */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, track: number): number {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + track; }
  return cx - track - x;
}
function spacedWidth(ctx: CanvasRenderingContext2D, text: string, track: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + track;
  return w - track;
}

// ---- identity -------------------------------------------------------------------------------------------------------------------
const ID_W = 4096, ID_H = 512;

function identityTexture(aniso: number): THREE.CanvasTexture {
  const I = TH.identity;
  const [c, ctx] = makeCanvas(ID_W, ID_H);
  const ppm = ID_W / I.width;                       // pixels per metre
  const midY = (I.yTop - I.yCentre) * ppm;
  // Fit the word to 78 % of the strip: light weight, wide tracking (a 2035 wordmark).
  let size = 300, track = 0;
  for (let k = 0; k < 6; k++) {
    ctx.font = `400 ${size}px ${FONT}`;
    track = size * 0.2;
    const w = spacedWidth(ctx, I.text, track);
    size *= (ID_W * 0.78) / w;
  }
  ctx.font = `400 ${size}px ${FONT}`;
  track = size * 0.2;
  const textW = spacedWidth(ctx, I.text, track);
  const capH = size * 0.72;
  const x0 = (ID_W - textW) / 2, base = midY + capH / 2;
  ctx.textBaseline = 'alphabetic';
  // soft wash on the wall behind the letters (backlit), then the crisp letters
  ctx.save();
  ctx.shadowColor = 'rgba(255,248,235,0.5)'; ctx.shadowBlur = 30;
  ctx.fillStyle = 'rgba(255,250,242,0.9)';
  spaced(ctx, I.text, x0, base, track);
  ctx.restore();
  ctx.fillStyle = '#fffdf8';
  spaced(ctx, I.text, x0, base, track);
  // three-line colour rule under the lettering: enamel, not light (non-emissive tone is set by the material)
  const ruleY = (I.yTop - I.ruleY) * ppm, ruleH = 0.05 * ppm, seg = textW / 3;
  LINES.forEach((l, i) => { ctx.fillStyle = l.color; ctx.fillRect(x0 + i * seg + (i ? 3 : 0), ruleY, seg - (i ? 3 : 0) - (i < 2 ? 3 : 0), ruleH); });
  return finish(c, aniso);
}

/** Cylinder section on the drum wall, centred due north, normals pointing in. UV u grows with the angle (left to right for a rider facing north). */
function identityGeometry(): THREE.BufferGeometry {
  const I = TH.identity;
  const R = THRESHOLD.rOuter - I.wallInset;
  const half = I.width / 2 / R;
  const segs = 64;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const th = Math.PI / 2 - half + 2 * half * f;
    for (const [y, v] of [[I.yTop, 1], [I.yBottom, 0]] as const) {
      pos.push(OCULUS.cx + R * Math.cos(th), y, OCULUS.cz + R * Math.sin(th));
      nor.push(-Math.cos(th), 0, -Math.sin(th));
      uv.push(f, v);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    // seen from the axis (inside): a (top, left) -> b (bottom, left) -> d (bottom, right): counter-clockwise from the viewer
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---- totems ---------------------------------------------------------------------------------------------------------------------
const CELL_W = 512, CELL_H = 1336;
type Arrow = 'up' | 'left' | 'right' | null;
interface Row { line: number; label: string; arrow: Arrow }
/** Faces (viewed from the arrival side, facing north: screen-right is -x, so the lifts in the west are on the right, the funicular in the east on the left). */
const FACES: ReadonlyArray<ReadonlyArray<Row>> = [
  [{ line: 0, label: 'Gates ahead', arrow: 'up' }, { line: 1, label: 'Lifts', arrow: 'right' }, { line: 2, label: 'Lifts', arrow: 'right' }], // west landing
  [{ line: 0, label: 'Gates ahead', arrow: 'up' }, { line: 1, label: 'Funicular', arrow: 'left' }, { line: 2, label: 'Gates ahead', arrow: 'up' }], // east landing
  [{ line: 0, label: '', arrow: null }, { line: 1, label: '', arrow: null }, { line: 2, label: '', arrow: null }], // back
];

function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, kind: Exclude<Arrow, null>, s: number): void {
  const [dx, dy] = kind === 'up' ? [0, -1] : kind === 'left' ? [-1, 0] : [1, 0];
  const px = -dy, py = dx;
  ctx.save();
  ctx.strokeStyle = '#23272b'; ctx.lineWidth = s * 0.16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - dx * s * 0.55, cy - dy * s * 0.55); ctx.lineTo(cx + dx * s * 0.55, cy + dy * s * 0.55);
  ctx.moveTo(cx + dx * s * 0.55 + (-dx + px) * s * 0.4, cy + dy * s * 0.55 + (-dy + py) * s * 0.4);
  ctx.lineTo(cx + dx * s * 0.55, cy + dy * s * 0.55);
  ctx.lineTo(cx + dx * s * 0.55 + (-dx - px) * s * 0.4, cy + dy * s * 0.55 + (-dy - py) * s * 0.4);
  ctx.stroke();
  ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, ox: number, rows: ReadonlyArray<Row>): void {
  ctx.save();
  ctx.translate(ox, 0);
  // frosted white glass, a hair warmer than the sky: reads as a lit panel, not a blown plane (the material dims it)
  ctx.fillStyle = '#f1efe9'; ctx.fillRect(0, 0, CELL_W, CELL_H);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#5f646a'; ctx.font = `500 34px ${FONT}`;
  const head = 'MERIDIAN DEEP';
  spaced(ctx, head, (CELL_W - spacedWidth(ctx, head, 9)) / 2, 112, 9);
  ctx.fillStyle = '#c9c7c0'; ctx.fillRect(48, 150, CELL_W - 96, 3);
  const top = 190, rowH = (CELL_H - top - 60) / 3;
  rows.forEach((r, i) => {
    const cy = top + rowH * i + rowH / 2;
    const L = LINES[r.line]!;
    ctx.fillStyle = L.color;
    ctx.beginPath(); ctx.arc(104, cy, 66, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = `500 76px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(L.letter, 104, cy + 27);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1b1e22'; ctx.font = `500 50px ${FONT}`;
    ctx.fillText(L.name, 196, r.arrow ? cy - 10 : cy + 20);
    if (r.arrow) {
      ctx.fillStyle = '#6a6f75'; ctx.font = `400 34px ${FONT}`;
      ctx.fillText(r.label, 198, cy + 42);
      drawArrow(ctx, 446, cy, r.arrow, 46);
    }
    if (i < 2) { ctx.fillStyle = '#dcdad4'; ctx.fillRect(48, top + rowH * (i + 1), CELL_W - 96, 2); }
  });
  ctx.restore();
}

function totemTexture(aniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(CELL_W * 3, CELL_H);
  FACES.forEach((rows, i) => drawFace(ctx, i * CELL_W, rows));
  return finish(c, aniso);
}

/** Window quad (0.46 x 1.2) facing +dir z at depth `z`, UV in atlas cell `cell`. Wound counter-clockwise seen from the face side. */
function faceQuad(cx: number, z: number, facing: 1 | -1, cell: number): THREE.BufferGeometry {
  const T = TH.totem;
  const hw = T.faceWidth / 2, y0 = THRESHOLD.y + T.faceY0, y1 = THRESHOLD.y + T.faceY1;
  // viewer on the +z side looks toward -z: screen-right is +x; on the -z side screen-right is -x
  const xl = cx - facing * hw, xr = cx + facing * hw;
  const u0 = cell / 3, u1 = (cell + 1) / 3;
  const pos = [xl, y1, z, xl, y0, z, xr, y0, z, xr, y1, z];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, facing, 0, 0, facing, 0, 0, facing, 0, 0, facing], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, 1, u0, 0, u1, 0, u1, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Chamfered stainless block along x between x0..x1, z centre/half-depth, y range (c = chamfer). */
function chamferBlock(x0: number, x1: number, zc: number, hz: number, y0: number, y1: number, c: number, ramp = false): THREE.BufferGeometry {
  const stops = ramp ? RAMP_STOPS.map((h) => THRESHOLD.y + h).filter((y) => y > y0 + c + 0.01 && y < y1 - c - 0.01) : [];
  const prof: P2[] = [[-hz + c, y0], [hz - c, y0], [hz, y0 + c], ...stops.map((y): P2 => [hz, y]), [hz, y1 - c], [hz - c, y1], [-hz + c, y1], [-hz, y1 - c], ...[...stops].reverse().map((y): P2 => [-hz, y]), [-hz, y0 + c]];
  const fr = (x: number): Frame => ({ o: v3(x, 0, zc), a: v3(0, 0, 1), b: v3(0, 1, 0) });
  return sweep(prof, [fr(x0), fr(x1)], { closed: true, caps: true });
}

export interface TicketHall {
  group: THREE.Group;
  /** Stainless parts (totem frames) for the fare metal mesh. */
  metalParts: TintedPart[];
  stats: { calls: number; triangles: number };
}

export function buildTicketHall(maxAnisotropy: number): TicketHall {
  const T = TH.totem;
  const group = new THREE.Group();
  group.name = 'metroTicketHall';

  const idMat = new THREE.MeshBasicMaterial({
    name: 'ticketHallIdentity', map: identityTexture(maxAnisotropy), transparent: true, depthWrite: false,
    color: new THREE.Color(1.7, 1.66, 1.58), toneMapped: true,
  });
  const idMesh = new THREE.Mesh(identityGeometry(), idMat);
  idMesh.name = 'ticketHallIdentity'; idMesh.renderOrder = 1; idMesh.userData.noShadow = true; idMesh.userData.noCapture = true;
  group.add(idMesh);

  const faceMat = new THREE.MeshBasicMaterial({ name: 'ticketHallTotemFace', map: totemTexture(maxAnisotropy), color: new THREE.Color(0.82, 0.82, 0.82) });
  const faces: THREE.BufferGeometry[] = [];
  const parts: TintedPart[] = [];
  const faceZ = 0.02; // faces sit 40 mm inside the housing skin, 8 mm clear of the dark core
  const push = (g: THREE.BufferGeometry, rgb: readonly [number, number, number]): void => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal') n.deleteAttribute(name);
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    const cnt = n.getAttribute('position').count, col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
    n.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push({ geo: n, rgb });
  };
  const hx = T.width / 2, hz = T.depth / 2, y0 = THRESHOLD.y;
  const fy0 = y0 + T.faceY0, fy1 = y0 + T.faceY1;
  for (const [side, cell] of [[-1, 0], [1, 1]] as const) {
    const cx = side * T.x;
    // plinth shadow gap, pillar, then the lit housing: side bars, head and foot bars, a dark core between the two glass faces
    push(boxMM(cx - hx + 0.03, y0, T.z - hz + 0.03, cx + hx - 0.03, y0 + 0.04, T.z + hz - 0.03), FARE_TINT.plinth);
    parts.push({ geo: ramped(chamferBlock(cx - hx, cx + hx, T.z, hz, y0 + 0.04, fy0 - 0.06, 0.008, true), y0), rgb: FARE_TINT.body });
    push(chamferBlock(cx - hx, cx - T.faceWidth / 2, T.z, hz, fy0 - 0.06, y0 + T.height, 0.008), FARE_TINT.body);
    push(chamferBlock(cx + T.faceWidth / 2, cx + hx, T.z, hz, fy0 - 0.06, y0 + T.height, 0.008), FARE_TINT.body);
    push(chamferBlock(cx - T.faceWidth / 2, cx + T.faceWidth / 2, T.z, hz, fy1, y0 + T.height, 0.008), FARE_TINT.body);
    push(chamferBlock(cx - T.faceWidth / 2, cx + T.faceWidth / 2, T.z, hz, fy0 - 0.06, fy0, 0.008), FARE_TINT.body);
    push(boxMM(cx - T.faceWidth / 2, fy0, T.z - 0.012, cx + T.faceWidth / 2, fy1, T.z + 0.012), FARE_TINT.smoked);
    // south face (toward the F3 arrivals, viewer faces +z) and north face (viewer faces -z): both sit inside the housing
    faces.push(faceQuad(cx, T.z - faceZ, -1, cell));
    faces.push(faceQuad(cx, T.z + faceZ, 1, 2));
  }
  const faceGeo = faces.length === 1 ? faces[0]! : (() => {
    // merge the four quads (indexed, same attributes)
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const g of faces) {
      const base = pos.length / 3;
      pos.push(...(g.getAttribute('position').array as Float32Array)); nor.push(...(g.getAttribute('normal').array as Float32Array)); uv.push(...(g.getAttribute('uv').array as Float32Array));
      for (const i of g.index!.array as Uint16Array) idx.push(base + i);
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    m.setIndex(idx);
    return m;
  })();
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.name = 'ticketHallTotemFaces'; faceMesh.userData.noShadow = true;
  group.add(faceMesh);

  return { group, metalParts: parts, stats: { calls: 2, triangles: 128 + 8 } };
}
