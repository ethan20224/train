import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../core/types';
import { MAP_WALL } from '../../layoutMetro';
import {
  clockHandAngles, linePolylineUV, lineStationsUV, MAP_CLOCK_CENTER_Y, MAP_PANEL, MAP_PANEL_H, MAP_PANEL_W,
  MAP_TEX_H, MAP_TEX_W, mapTrainToUV, mapUVToWorldXY,
} from '../../metro/mapLayout';
import { METRO_NETWORK } from '../../metro/network';
import type { TrainState } from '../../metro/timetable';
import type { LineId } from '../../metro/tracks';
import { LINE_COLORS } from '../../metro/trainModel';
import { boxMM, GeoBag } from '../concourse/geo';
import type { MetroMaterials } from './materials';

/**
 * Live transit map wall & the one running clock in the station (spec §2.6, §4; Phase 4 task P4-5).
 *
 * Mounted in the south nave frieze alcove (`MAP_WALL`: z = 20, x ±20, y -41..-34) in EXACTLY 4 draw calls:
 *  1. `mapWallPanel`     — backlit 2048×512 glass transit diagram (drawn ONCE at build, zero per-frame redraws).
 *  2. `mapWallOnyxDial`  — 2.4 m backlit white onyx clock dial at centre (no numerals; glows warm against dark map).
 *  3. `mapWallStainless` — brushed-stainless perimeter frame, 8 m glazing seams, machined clock bezel, 12 slim hour
 *                          indices, AND the 3 real-time hairline hands (hour, minute, continuous sweeping second hand)
 *                          rotated in vertex shader from `new Date()` every displayed frame (shares NOTHING with the
 *                          upstairs 6:47 hall clock).
 *  4. `mapWallTrainDots` — instanced luminous quads (<= 4) placed at exact `mapTrainToUV` coordinates, pulsing softly
 *                          while stopped.
 */

export interface MapDotSnapshot {
  readonly id: number;
  readonly line: LineId;
  readonly track: 0 | 1;
  readonly u: number;
  readonly v: number;
  readonly x: number;
  readonly y: number;
  readonly stopped: boolean;
}

export interface MapWallBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  /** Updates the running clock from real local `new Date()` and animates train-dot pulse every displayed frame. */
  updateReal(realTimeSec: number): void;
  /** Updates the instanced live train dots (<= 4) from timetable state. Zero per-frame heap allocations. */
  updateTrains(trains: readonly TrainState[]): void;
  /** Read-only snapshot of live dot positions & clock angles for debug/verification. */
  snapshot(): { clock: { hour: number; minute: number; second: number; iso: string }; dots: MapDotSnapshot[] };
}

const MAX_DOTS = 4;

function linToSrgbByte(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/** Crisp architectural CSS colour for a line on the dark backlit map glass (brightened slightly for legibility on dark). */
function mapLineCss(line: LineId, lift = 1.0): string {
  const [r, g, b] = LINE_COLORS[line];
  // Lift deep ink blue & oxblood gently so thin strokes read clearly against the obsidian glass at 50 m distance
  const lr = line === 'meridian' ? 0.14 : line === 'halcyon' ? 0.68 : r;
  const lg = line === 'meridian' ? 0.34 : line === 'halcyon' ? 0.09 : g;
  const lb = line === 'meridian' ? 0.96 : line === 'halcyon' ? 0.11 : b;
  return `rgb(${linToSrgbByte(lr * lift)}, ${linToSrgbByte(lg * lift)}, ${linToSrgbByte(lb * lift)})`;
}

/** Draws the 2048×512 backlit architectural transit diagram ONCE into paired color + emissive textures. */
function createMapTextures(renderer?: THREE.WebGLRenderer): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const W = MAP_TEX_W;
  const H = MAP_TEX_H;
  const cCol = document.createElement('canvas'); cCol.width = W; cCol.height = H;
  const gCol = cCol.getContext('2d')!;
  const cEmi = document.createElement('canvas'); cEmi.width = W; cEmi.height = H;
  const gEmi = cEmi.getContext('2d')!;

  const px = (u: number): number => u * W;
  const py = (v: number): number => (1 - v) * H;
  const ringRx = (MAP_PANEL.interchangeRingR / MAP_PANEL_W) * W;
  const ringRy = (MAP_PANEL.interchangeRingR / MAP_PANEL_H) * H;
  const clockRx = (MAP_PANEL.clockRadius / MAP_PANEL_W) * W;
  const clockRy = (MAP_PANEL.clockRadius / MAP_PANEL_H) * H;

  const paint = (g: CanvasRenderingContext2D, isEmissive: boolean): void => {
    // 1. Deep obsidian architectural backlit glass field
    const bg = g.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, W * 0.56);
    if (isEmissive) {
      bg.addColorStop(0, '#121822');
      bg.addColorStop(0.65, '#0b0f16');
      bg.addColorStop(1, '#070a0f');
    } else {
      bg.addColorStop(0, '#18202c');
      bg.addColorStop(0.65, '#11161f');
      bg.addColorStop(1, '#0c1017');
    }
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // 2. Ultra-fine Swiss drafting grid & subtle framing border
    g.strokeStyle = isEmissive ? 'rgba(180, 200, 224, 0.045)' : 'rgba(190, 206, 226, 0.07)';
    g.lineWidth = 1;
    for (let x = 64; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 64; y < H; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

    g.strokeStyle = isEmissive ? 'rgba(205, 218, 232, 0.14)' : 'rgba(210, 222, 236, 0.22)';
    g.lineWidth = 2;
    g.strokeRect(22, 20, W - 44, H - 40);

    // 3. Clean geometric line strokes in their accent colours (Vesper, Meridian, Halcyon)
    const lines: readonly LineId[] = ['meridian', 'halcyon', 'vesper'];
    for (const line of lines) {
      const pts = linePolylineUV(line);
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // Crisp dark casing keeps intersections ultra-clean
      g.strokeStyle = '#080b10';
      g.lineWidth = 14;
      g.beginPath();
      pts.forEach(([u, v], i) => (i === 0 ? g.moveTo(px(u), py(v)) : g.lineTo(px(u), py(v))));
      g.stroke();

      g.strokeStyle = mapLineCss(line, isEmissive ? 0.92 : 1.0);
      g.lineWidth = 8.5;
      g.beginPath();
      pts.forEach(([u, v], i) => (i === 0 ? g.moveTo(px(u), py(v)) : g.lineTo(px(u), py(v))));
      g.stroke();
      g.restore();
    }

    // 4. Central Meridian Deep interchange halo framing the 2.4 m running clock
    g.save();
    g.fillStyle = isEmissive ? '#0d121a' : '#131924';
    g.beginPath();
    g.ellipse(W * 0.5, H * 0.5, ringRx * 1.12, ringRy * 1.12, 0, 0, Math.PI * 2);
    g.fill();

    // Luminous hairline interchange orbital ring (where stopped train dots pause & pulse!)
    g.strokeStyle = isEmissive ? 'rgba(220, 232, 246, 0.42)' : 'rgba(232, 240, 248, 0.55)';
    g.lineWidth = 2.6;
    g.beginPath();
    g.ellipse(W * 0.5, H * 0.5, ringRx, ringRy, 0, 0, Math.PI * 2);
    g.stroke();

    // Inner dark recess behind clock bezel
    g.fillStyle = '#070a0e';
    g.beginPath();
    g.ellipse(W * 0.5, H * 0.5, clockRx * 1.03, clockRy * 1.03, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // Aspect correction so circles and letterforms drawn on the 2048×512 (4:1) canvas render with exact 1:1
    // circular and typographic proportions on the 39.6 × 6.6 m (6:1) physical map panel!
    const aspectScaleX = (W / H) / (MAP_PANEL_W / MAP_PANEL_H); // 4 / 6 = 0.6667

    // 5. Station nodes & crisp unstretched Swiss transit typography (8–10 dreamlike stations per line)
    for (const line of lines) {
      const stations = lineStationsUV(line);
      const accent = mapLineCss(line, isEmissive ? 0.95 : 1.0);
      for (const st of stations) {
        if (st.isInterchange) continue;
        const sx = px(st.u);
        const sy = py(st.v);
        const isTerminus = st.index === 0 || st.index === stations.length - 1;
        const r = isTerminus ? 12 : 8.5;

        // True circular station ring (aspect-compensated)
        g.save();
        g.translate(sx, sy);
        g.scale(aspectScaleX, 1);
        g.fillStyle = '#0d1219';
        g.beginPath();
        g.arc(0, 0, r + 3.0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = isTerminus ? '#eef4fa' : accent;
        g.lineWidth = isTerminus ? 3.8 : 3.2;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
        if (isTerminus) {
          g.fillStyle = accent;
          g.beginPath();
          g.arc(0, 0, 4.8, 0, Math.PI * 2);
          g.fill();
        }

        // Station name label (unstretched Swiss proportions)
        g.font = isTerminus
          ? '600 20px "Inter", "Helvetica Neue", -apple-system, BlinkMacSystemFont, sans-serif'
          : '500 17px "Inter", "Helvetica Neue", -apple-system, BlinkMacSystemFont, sans-serif';
        g.fillStyle = isTerminus
          ? (isEmissive ? '#ecf3fa' : '#f5f9fd')
          : (isEmissive ? '#bccadb' : '#d2deeb');
        g.textAlign = 'center';
        g.textBaseline = st.labelSide > 0 ? 'bottom' : 'top';
        const dy = st.labelSide > 0 ? -(r + 12) : +(r + 12);
        g.fillText(st.name.toUpperCase(), 0, dy);
        g.restore();
      }
    }

    // 6. Central interchange caption & architectural line legend (aspect-compensated, clear of all station labels)
    g.save();
    g.translate(W * 0.5, H * 0.5 + ringRy + 16);
    g.scale(aspectScaleX, 1);
    g.font = '600 22px "Inter", "Helvetica Neue", -apple-system, sans-serif';
    g.fillStyle = isEmissive ? '#e0ebf6' : '#eff5fb';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText('M E R I D I A N   D E E P', 0, 0);

    g.font = '500 14px "SF Mono", Menlo, ui-monospace, monospace';
    g.fillStyle = isEmissive ? '#92a5bd' : '#a8bad0';
    g.fillText('CENTRAL INTERCHANGE · −46 / −70 / −82 M', 0, 29);
    g.restore();

    // Subtle top-centre title & line key cleanly above the clock (well clear of all left/right terrace labels)
    g.save();
    g.translate(W * 0.5, 32);
    g.scale(aspectScaleX, 1);
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.font = '600 16px "Inter", "Helvetica Neue", -apple-system, sans-serif';
    g.fillStyle = isEmissive ? '#cad8e8' : '#e2ebf5';
    g.fillText('MERIDIAN METROPOLITAN NETWORK', 0, 0);

    const legend: readonly LineId[] = ['meridian', 'vesper', 'halcyon'];
    const legOffsets = [-165, 0, 165] as const;
    g.font = '600 13px "Inter", "Helvetica Neue", -apple-system, sans-serif';
    g.textAlign = 'left';
    for (let i = 0; i < legend.length; i++) {
      const lid = legend[i]!;
      const ox = legOffsets[i]! - 46;
      g.fillStyle = mapLineCss(lid, isEmissive ? 0.95 : 1.0);
      g.fillRect(ox, 30, 22, 5);
      g.fillStyle = isEmissive ? '#b8c7d9' : '#d2dfec';
      g.fillText(METRO_NETWORK[lid].label, ox + 28, 25);
    }
    g.restore();
  };

  paint(gCol, false);
  paint(gEmi, true);

  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  const finish = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = aniso;
    t.needsUpdate = true;
    return t;
  };
  return { map: finish(cCol), emissiveMap: finish(cEmi) };
}

/** Tags every vertex of a geometry with `aHandId` (0 = static, 1 = hour, 2 = minute, 3 = second) and vertex colour. */
function tagHandPart(
  geo: THREE.BufferGeometry,
  handId: number,
  rgb: readonly [number, number, number],
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  const n = g.getAttribute('position').count;
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const ids = new Float32Array(n);
  ids.fill(handId);
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    cols[i * 3] = rgb[0];
    cols[i * 3 + 1] = rgb[1];
    cols[i * 3 + 2] = rgb[2];
  }
  g.setAttribute('aHandId', new THREE.BufferAttribute(ids, 1));
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

export function buildMapWall(lib: MaterialLibrary, kit: MetroMaterials, renderer?: THREE.WebGLRenderer): MapWallBuild {
  const group = new THREE.Group();
  group.name = 'metroMapWall';

  const deepMaterials: THREE.Material[] = [];
  const zFace = MAP_PANEL.zFace;           // 19.96
  const cy = MAP_CLOCK_CENTER_Y;           // -37.5
  const rClock = MAP_PANEL.clockRadius;    // 1.20 m (2.4 m diameter)

  // ---- Draw call 1: backlit 2048×512 glass transit diagram panel ----
  const tex = createMapTextures(renderer);
  const panelGeo = new THREE.PlaneGeometry(MAP_PANEL_W, MAP_PANEL_H);
  panelGeo.translate(0, cy, zFace);
  const panelMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepMapGlassPanel',
    color: 0xffffff,
    map: tex.map,
    emissive: 0xffffff,
    emissiveMap: tex.emissiveMap,
    emissiveIntensity: 1.05,
    roughness: 0.10,
    metalness: 0.05,
    envMapIntensity: 0.65,
  });
  deepMaterials.push(panelMat);
  const panelMesh = new THREE.Mesh(panelGeo, panelMat);
  panelMesh.name = 'mapWallPanel';
  panelMesh.userData.noShadow = true;
  group.add(panelMesh);

  // ---- Draw call 2: 2.4 m backlit white onyx clock dial (no numerals) ----
  const dialGeo = new THREE.CircleGeometry(rClock - 0.02, 72);
  dialGeo.translate(0, cy, zFace + 0.085);
  const dialMat = kit.deep.onyx.clone();
  dialMat.name = 'metroDeepClockOnyxDial';
  dialMat.emissiveIntensity = 1.25;
  dialMat.roughness = 0.18;
  dialMat.envMapIntensity = 0.7;
  deepMaterials.push(dialMat);
  const dialMesh = new THREE.Mesh(dialGeo, dialMat);
  dialMesh.name = 'mapWallOnyxDial';
  dialMesh.userData.noShadow = true;
  group.add(dialMesh);

  // ---- Draw call 3: brushed stainless frame + 8 m glass seams + clock bezel + 12 indices + 3 real-time animated hands ----
  const staticParts: THREE.BufferGeometry[] = [];
  const BRIGHT_STEEL: readonly [number, number, number] = [0.82, 0.85, 0.88];
  const DARK_STEEL: readonly [number, number, number] = [0.13, 0.15, 0.18];
  const SECOND_STEEL: readonly [number, number, number] = [0.28, 0.31, 0.36];

  const brightBag = new GeoBag(lib, 'castIron', 1.0);
  const darkBag = new GeoBag(lib, 'castIron', 1.0);
  const zFrameBack = MAP_WALL.z - 0.17;
  const zFrameFront = MAP_WALL.z + 0.055; // flush with outer limestone arris
  const frW = 0.20;
  // Perimeter brushed-stainless mitered frame around the 40 × 7 m recess
  brightBag.add(boxMM(MAP_WALL.xMin, MAP_WALL.yMax - frW, zFrameBack, MAP_WALL.xMax, MAP_WALL.yMax, zFrameFront));
  brightBag.add(boxMM(MAP_WALL.xMin, MAP_WALL.yMin, zFrameBack, MAP_WALL.xMax, MAP_WALL.yMin + frW, zFrameFront));
  brightBag.add(boxMM(MAP_WALL.xMin, MAP_WALL.yMin + frW, zFrameBack, MAP_WALL.xMin + frW, MAP_WALL.yMax - frW, zFrameFront));
  brightBag.add(boxMM(MAP_WALL.xMax - frW, MAP_WALL.yMin + frW, zFrameBack, MAP_WALL.xMax, MAP_WALL.yMax - frW, zFrameFront));
  // Subtle slim glazing seams positioned cleanly between stations (never slicing through a station node or label)
  for (const sx of [-13.6, -6.4, 6.4, 13.6]) {
    brightBag.add(boxMM(sx - 0.011, MAP_PANEL.yMin, zFace - 0.01, sx + 0.011, MAP_PANEL.yMax, zFace + 0.012));
  }

  // Machined brushed-stainless clock bezel ring (2.4 m outer diameter, proud 16 cm housing)
  const bezelShape = new THREE.Shape();
  bezelShape.absarc(0, 0, rClock + 0.045, 0, Math.PI * 2, false);
  const bezelHole = new THREE.Path();
  bezelHole.absarc(0, 0, rClock - 0.025, 0, Math.PI * 2, true);
  bezelShape.holes.push(bezelHole);
  const bezelGeo = new THREE.ExtrudeGeometry(bezelShape, { depth: 0.16, bevelEnabled: false, curveSegments: 72 });
  bezelGeo.translate(0, cy, zFace - 0.01);
  brightBag.add(bezelGeo);

  // Back drum behind the onyx dial so side views show a solid precision cylinder
  const drumGeo = new THREE.CylinderGeometry(rClock + 0.03, rClock + 0.03, 0.12, 48);
  drumGeo.rotateX(Math.PI / 2);
  drumGeo.translate(0, cy, zFace + 0.02);
  brightBag.add(drumGeo);

  // 12 slim stainless hour indices (no numerals — dark satin steel baton ticks razor-legible on backlit white onyx)
  const zDial = zFace + 0.085;
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    const isCardinal = h % 3 === 0;
    const len = isCardinal ? 0.165 : 0.100;
    const wid = isCardinal ? 0.032 : 0.018;
    const rMid = rClock - 0.075 - len / 2;
    const tick = new THREE.BoxGeometry(wid, len, 0.018);
    tick.rotateZ(-a);
    tick.translate(Math.sin(a) * rMid, cy + Math.cos(a) * rMid, zDial + 0.012);
    darkBag.add(tick);
  }
  // Central stainless arbor pin cap
  const pinGeo = new THREE.CylinderGeometry(0.044, 0.050, 0.055, 24);
  pinGeo.rotateX(Math.PI / 2);
  pinGeo.translate(0, cy, zDial + 0.032);
  darkBag.add(pinGeo);

  const brightMerged = brightBag.merge();
  if (brightMerged) staticParts.push(tagHandPart(brightMerged, 0, BRIGHT_STEEL));
  const darkMerged = darkBag.merge();
  if (darkMerged) staticParts.push(tagHandPart(darkMerged, 0, DARK_STEEL));

  // Three hairline stainless clock hands in 12 o'clock rest pose, rotated clockwise in vertex shader via uClockAngles!
  const addHand = (
    handId: number, halfW: number, lenFwd: number, lenTail: number, zOff: number, depth: number, rgb: readonly [number, number, number],
  ): void => {
    const g = new THREE.BoxGeometry(halfW * 2, lenFwd + lenTail, depth);
    g.translate(0, cy + (lenFwd - lenTail) / 2, zDial + zOff);
    staticParts.push(tagHandPart(g, handId, rgb));
  };
  // 1: Hour hand (crisp slim stainless blade, 0.66 m)
  addHand(1, 0.020, 0.66, 0.14, 0.024, 0.012, DARK_STEEL);
  // 2: Minute hand (long hairline stainless blade, 0.96 m)
  addHand(2, 0.014, 0.96, 0.18, 0.038, 0.010, DARK_STEEL);
  // 3: Sweeping second hand (razor hairline stainless needle, 1.06 m + counter-balance tail)
  addHand(3, 0.0065, 1.06, 0.24, 0.050, 0.008, SECOND_STEEL);

  const stainlessGeo = mergeGeometries(staticParts, false)!;
  for (const p of staticParts) p.dispose();
  stainlessGeo.computeBoundingSphere();

  const uClockAngles = { value: new THREE.Vector3(0, 0, 0) };
  const stainlessMat = new THREE.MeshStandardMaterial({
    name: 'metroDeepMapWallStainless',
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.92,
    roughness: 0.22,
    envMapIntensity: 1.25,
  });
  stainlessMat.onBeforeCompile = (sh) => {
    sh.uniforms.uClockAngles = uClockAngles;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aHandId;\nuniform vec3 uClockAngles;`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float _hAng = aHandId > 2.5 ? uClockAngles.z : (aHandId > 1.5 ? uClockAngles.y : (aHandId > 0.5 ? uClockAngles.x : 0.0));
        if (aHandId > 0.5) {
          float _hc = cos(_hAng), _hs = sin(_hAng);
          objectNormal.xy = vec2(objectNormal.x * _hc + objectNormal.y * _hs, -objectNormal.x * _hs + objectNormal.y * _hc);
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (aHandId > 0.5) {
          float _hc = cos(_hAng), _hs = sin(_hAng);
          vec2 _rel = vec2(transformed.x, transformed.y - (${cy.toFixed(2)}));
          transformed.x = _rel.x * _hc + _rel.y * _hs;
          transformed.y = (${cy.toFixed(2)}) - _rel.x * _hs + _rel.y * _hc;
        }`,
      );
  };
  stainlessMat.customProgramCacheKey = () => 'metroMapWallClockHands';
  deepMaterials.push(stainlessMat);

  const stainlessMesh = new THREE.Mesh(stainlessGeo, stainlessMat);
  stainlessMesh.name = 'mapWallStainless';
  stainlessMesh.userData.noShadow = true;
  group.add(stainlessMesh);

  // ---- Draw call 4: instanced live train dots (<= 4 quads), soft pulse while stopped ----
  const dotGeo = new THREE.PlaneGeometry(0.46, 0.46);
  const aDotColor = new Float32Array(MAX_DOTS * 3);
  const aDotStopped = new Float32Array(MAX_DOTS);
  const dotColorAttr = new THREE.InstancedBufferAttribute(aDotColor, 3);
  const dotStoppedAttr = new THREE.InstancedBufferAttribute(aDotStopped, 1);
  dotGeo.setAttribute('aDotColor', dotColorAttr);
  dotGeo.setAttribute('aDotStopped', dotStoppedAttr);

  const uDotTime = { value: 0 };
  const dotMat = new THREE.ShaderMaterial({
    name: 'metroDeepMapTrainDots',
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: uDotTime },
    vertexShader: /* glsl */`
      attribute vec3 aDotColor;
      attribute float aDotStopped;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vStopped;
      void main() {
        vUv = uv;
        vColor = aDotColor;
        vStopped = aDotStopped;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vStopped;
      void main() {
        float d = length(vUv - vec2(0.5)) * 2.0; // 0 at centre, 1 at quad edge
        if (d > 1.0) discard;
        // Soft breathing pulse when stopped at Meridian Deep
        float pulse = 0.5 + 0.5 * sin(uTime * 3.0);
        float coreR = mix(0.42, 0.48 + 0.06 * pulse, vStopped);
        float core = 1.0 - smoothstep(coreR - 0.08, coreR + 0.05, d);
        float ring = smoothstep(coreR - 0.02, coreR + 0.08, d) * (1.0 - smoothstep(coreR + 0.08, 0.96, d));
        float haloGain = mix(0.32, 0.65 + 0.35 * pulse, vStopped);
        float alpha = clamp(core + ring * haloGain, 0.0, 1.0);
        // Bright white pinpoint core ringed by crisp line colour (architectural transit LED indicator)
        vec3 col = mix(vColor * 1.9, vec3(2.2, 2.25, 2.3), core * 0.82);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const dotsMesh = new THREE.InstancedMesh(dotGeo, dotMat, MAX_DOTS);
  dotsMesh.name = 'mapWallTrainDots';
  // Start with 1 hidden warmup instance behind the opaque clock drum so DepthLook.precompile() warms its Metal PSO!
  const mDot = new THREE.Matrix4();
  mDot.makeTranslation(0, cy, zFace - 0.05);
  dotsMesh.setMatrixAt(0, mDot);
  dotsMesh.instanceMatrix.needsUpdate = true;
  dotsMesh.count = 1;
  dotsMesh.renderOrder = 2;
  dotsMesh.frustumCulled = false; // always tiny (<= 4 quads) on the map wall; never culls early as dots move
  dotsMesh.userData.noShadow = true;
  group.add(dotsMesh);

  // Reusable scratch state (zero per-frame allocations)
  const zDot = zFace + 0.028;
  const dotSnapshots: MapDotSnapshot[] = [];
  let lastClock = { hour: 0, minute: 0, second: 0, iso: '' };

  const syncClock = (): void => {
    const now = new Date();
    const ang = clockHandAngles(now);
    uClockAngles.value.set(ang.hour, ang.minute, ang.second);
    lastClock = { ...ang, iso: now.toISOString() };
  };
  syncClock();

  const updateTrains = (trains: readonly TrainState[]): void => {
    let n = 0;
    dotSnapshots.length = 0;
    for (let i = 0; i < trains.length && n < MAX_DOTS; i++) {
      const t = trains[i]!;
      if (t.phase === 'gone') continue;
      const uv = mapTrainToUV(t.line, t.track, t.s);
      const [wx, wy] = mapUVToWorldXY(uv.u, uv.v);
      mDot.makeTranslation(wx, wy, zDot);
      dotsMesh.setMatrixAt(n, mDot);
      // Bright linear accent colour for the dot ring
      const lr = t.line === 'meridian' ? 0.18 : t.line === 'halcyon' ? 0.85 : 0.05;
      const lg = t.line === 'meridian' ? 0.45 : t.line === 'halcyon' ? 0.12 : 0.88;
      const lb = t.line === 'meridian' ? 1.00 : t.line === 'halcyon' ? 0.14 : 0.42;
      aDotColor[n * 3] = lr;
      aDotColor[n * 3 + 1] = lg;
      aDotColor[n * 3 + 2] = lb;
      const stopped = t.phase === 'stopped';
      aDotStopped[n] = stopped ? 1 : 0;
      dotSnapshots.push({ id: t.id, line: t.line, track: t.track, u: uv.u, v: uv.v, x: wx, y: wy, stopped });
      n++;
    }
    dotsMesh.count = n;
    if (n > 0) {
      dotsMesh.instanceMatrix.needsUpdate = true;
      dotColorAttr.needsUpdate = true;
      dotStoppedAttr.needsUpdate = true;
    }
  };

  return {
    group,
    deepMaterials,
    updateReal(realTimeSec: number): void {
      uDotTime.value = realTimeSec;
      syncClock();
    },
    updateTrains,
    snapshot: () => ({ clock: lastClock, dots: dotSnapshots.slice() }),
  };
}
