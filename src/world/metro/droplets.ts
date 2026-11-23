import * as THREE from 'three';
import { CAVERN, DROPLETS, FUNICULAR, LIFTS, OCULUS, SKY } from '../../layoutMetro';
import type { MetroMaterials } from './materials';

/**
 * Kinetic droplet ceiling ("Kinetic Rain" sculptural canopy, spec §2.5, §4; Phase 4 task P4-4).
 *
 * Builds EXACTLY 2 draw calls in `metroDeep`:
 *  1. `dropletBodies`: single `InstancedMesh` of polished champagne teardrops (lathe, 0.20 m tall, <= 200 tris),
 *     vertex-shader animated through slow 45 s Changi-style sculptural states (wave crest -> vortex -> flat calm)
 *     in real time, plus up to 4 simulation-time arrival ripples (`uPulse[4]`) propagating from arriving portals.
 *  2. `dropletCables`: single merged camera-facing hairline cable ribbon mesh hanging from `SKY.y` (-32) straight
 *     to each teardrop's animated tip using the identical shared GLSL height function, fading smoothly with distance.
 *
 * Placement (Ruling 35): annulus r in [21, 38] around (0, 74), clipped to the cross outline with >= 2 m clearance from
 * every cavern wall, excluding bridge corridor (|x| < 12.5), lift tubes (>= 2 m clear of tubeR), and funicular corridor
 * (|z - 74| < 3 for x > 16). Neither mesh casts or receives shadows (`noShadow`).
 */

export interface DropletsBuild {
  group: THREE.Group;
  deepMaterials: THREE.Material[];
  readonly count: number;
  readonly dropletTris: number;
  /** Advance real-time sculptural base motion (called once per displayed frame via onMetroFrame). */
  updateReal(realTimeSec: number): void;
  /** Advance simulation clock used by arrival pulses (called in module sim update). */
  updateSim(simTimeSec: number): void;
  /** Trigger an arrival ripple originating from unit direction `(dirX, dirZ)` toward the portal from (0, 74). */
  triggerPulse(dirX: number, dirZ: number, simTimeSec: number, weight?: number): void;
}

const DROPLET_HEIGHT = 0.22;          // ~0.18–0.22 m polished champagne teardrop
const DROPLET_BASE_Y = -37.5;         // midpoint of [-42, -33] for accurate bounding sphere
const WALL_CLEARANCE = 2.0;           // >= 2 m clear of every cavern wall
const LIFT_CLEARANCE = LIFTS.tubeR + 2.0; // 3.4 m from each lift tube axis
const FUNICULAR_HALF_Z = 3.0;         // z 74 ± 3 for x > 16
const FUNICULAR_X_MIN = 16.0;
const GRID_PITCH = 0.84;              // tight architectural lattice (~2,150 droplets <= 2,400 budget, liquid Changi density)

/** Tests whether world (x, z) is valid for a kinetic droplet anchor. Pure so Node layout tests can assert it. */
export function isValidDropletXZ(x: number, z: number): boolean {
  const dx = x - OCULUS.cx;
  const dz = z - OCULUS.cz;
  const r = Math.hypot(dx, dz);
  if (r < DROPLETS.rInner || r > DROPLETS.rOuter) return false;
  // Cross outline with >= 2 m clearance from every wall
  const inTransept =
    x >= CAVERN.transept.xMin + WALL_CLEARANCE && x <= CAVERN.transept.xMax - WALL_CLEARANCE &&
    z >= CAVERN.transept.zMin + WALL_CLEARANCE && z <= CAVERN.transept.zMax - WALL_CLEARANCE;
  const inNave =
    x >= CAVERN.nave.xMin + WALL_CLEARANCE && x <= CAVERN.nave.xMax - WALL_CLEARANCE &&
    z >= CAVERN.nave.zMin + WALL_CLEARANCE && z <= CAVERN.nave.zMax - WALL_CLEARANCE;
  if (!inTransept && !inNave) return false;
  // Bridge corridor exclusion (|x| < 12.5) keeps droplets clear of Meridian trains and sky hangers
  if (Math.abs(x) < DROPLETS.bridgeExclusionHalfX) return false;
  // Lift tubes: >= 2 m clear of tube outer wall
  for (let i = 0; i < LIFTS.positions.length; i++) {
    const [lx, lz] = LIFTS.positions[i]!;
    if (Math.hypot(x - lx, z - lz) < LIFT_CLEARANCE) return false;
  }
  // Funicular corridor exclusion (z 74 ± 3 for x > 16)
  if (x > FUNICULAR_X_MIN && Math.abs(z - FUNICULAR.z) < FUNICULAR_HALF_Z) return false;
  return true;
}

/** Deterministic regular architectural lattice of valid droplet (x, z) anchors (always <= DROPLETS.count). */
export function computeDropletAnchors(): Array<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  const halfSteps = Math.ceil(DROPLETS.rOuter / GRID_PITCH);
  for (let ix = -halfSteps; ix <= halfSteps; ix++) {
    const x = OCULUS.cx + ix * GRID_PITCH;
    for (let iz = -halfSteps; iz <= halfSteps; iz++) {
      const z = OCULUS.cz + iz * GRID_PITCH;
      if (isValidDropletXZ(x, z)) pts.push([x, z]);
    }
  }
  return pts.length > DROPLETS.count ? pts.slice(0, DROPLETS.count) : pts;
}

/**
 * Shared GLSL droplet elevation function (world y of teardrop bottom in [-42, -33]) used by BOTH the teardrop
 * InstancedMesh and the hanging hairline cables so every cable stays locked to its droplet tip at all times.
 */
const DROPLET_HEIGHT_GLSL = /* glsl */`
uniform float uRealTime;
uniform float uSimTime;
uniform vec4 uPulse[4];

float dropletWorldY(vec2 xz) {
  float dx = xz.x - ${OCULUS.cx.toFixed(1)};
  float dz = xz.y - ${OCULUS.cz.toFixed(1)};
  float r = length(vec2(dx, dz));
  float rn = clamp((r - ${DROPLETS.rInner.toFixed(1)}) / ${(DROPLETS.rOuter - DROPLETS.rInner).toFixed(1)}, 0.0, 1.0);
  float theta = atan(dz, dx);

  // Gentle catenary base surface between -36.2 and -38.0
  float yBase = -36.4 - 1.5 * sin(rn * 3.14159265);

  // 45-second sculptural state cycle (offset +4 s so presets open on a sweeping wave crest):
  // State A (wave crest) -> State B (slow vortex around the eclipse) -> State C (serene calm)
  float t = uRealTime;
  float cyc = mod((t + 4.0) / 45.0, 1.0) * 6.2831853;
  float wA = 0.5 + 0.5 * cos(cyc);
  float wB = 0.5 + 0.5 * cos(cyc - 2.0943951);
  float wC = 0.5 + 0.5 * cos(cyc - 4.1887902);
  wA = wA * wA; wB = wB * wB; wC = wC * wC;
  float wSum = wA + wB + wC;
  wA /= wSum; wB /= wSum; wC /= wSum;

  // State A: slow layered diagonal liquid wave crest
  float sWave =
    2.55 * sin(dx * 0.145 + dz * 0.085 - t * 0.42) +
    1.15 * cos(dx * 0.075 - dz * 0.135 + t * 0.27);

  // State B: slow sculptural 3-arm vortex orbiting the eclipse
  float sVortex =
    2.70 * sin(theta * 3.0 - r * 0.23 + t * 0.36) * (0.25 + 0.75 * sin(rn * 3.14159265)) +
    0.95 * cos(r * 0.30 - t * 0.28);

  // State C: calm cathedral sheet with a slow breathing radial swell
  float sCalm =
    0.85 * cos(rn * 3.14159265 - 0.25) +
    0.45 * sin(t * 0.22 + r * 0.08);

  float disp = wA * sWave + wB * sVortex + wC * sCalm;

  // Up to 4 simulation-time arrival ripples propagating outward from arriving portals
  for (int i = 0; i < 4; i++) {
    vec4 p = uPulse[i];
    float age = uSimTime - p.z;
    if (p.w > 0.001 && age >= 0.0 && age < 14.0) {
      float distFromPortal = 42.0 - (dx * p.x + dz * p.y);
      float front = age * 10.5;
      float delta = distFromPortal - front;
      float env = smoothstep(0.0, 1.0, age) * smoothstep(14.0, 5.5, age);
      float gauss = exp(-0.5 * (delta / 7.5) * (delta / 7.5));
      disp += 2.1 * p.w * env * gauss * cos(delta * 0.26);
    }
  }

  return clamp(yBase + disp, ${DROPLETS.yBottomMin.toFixed(1)}, ${DROPLETS.yTop.toFixed(1)});
}
`;

/** Builds one sculpted Changi-style teardrop lathe prototype (height 0.20 m, <= 200 tris, origin at bottom tip). */
export function buildTeardropGeometry(): THREE.BufferGeometry {
  // Smooth plump teardrop silhouette: rounded bulb at bottom (r max 0.076 m around y = 0.07), graceful inflection neck to collet at y = 0.22
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0001, 0.0),
    new THREE.Vector2(0.044, 0.015),
    new THREE.Vector2(0.072, 0.044),
    new THREE.Vector2(0.076, 0.078),
    new THREE.Vector2(0.062, 0.118),
    new THREE.Vector2(0.036, 0.160),
    new THREE.Vector2(0.012, 0.198),
    new THREE.Vector2(0.0001, DROPLET_HEIGHT),
  ];
  // 10 radial segments × 7 bands × 2 tris = 140 triangles (strictly <= 200 tris spec cap)
  const geo = new THREE.LatheGeometry(profile, 10);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Builds ONE merged camera-facing hairline cable ribbon geometry for all anchors (2 tris per cable). */
function buildCablesGeometry(anchors: ReadonlyArray<readonly [number, number]>): THREE.BufferGeometry {
  const n = anchors.length;
  const pos = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const [x, z] = anchors[i]!;
    const vb = i * 4;
    // 4 verts: top-left (y=SKY.y, uv=(-1,0)), top-right (uv=(+1,0)), bot-right (y=yBottomMin, uv=(+1,1)), bot-left (uv=(-1,1))
    const ys = [SKY.y, SKY.y, DROPLETS.yBottomMin, DROPLETS.yBottomMin] as const;
    const uSide = [-1, 1, 1, -1] as const;
    const vEnd = [0, 0, 1, 1] as const;
    for (let k = 0; k < 4; k++) {
      const p3 = (vb + k) * 3;
      pos[p3] = x;
      pos[p3 + 1] = ys[k]!;
      pos[p3 + 2] = z;
      const u2 = (vb + k) * 2;
      uv[u2] = uSide[k]!;
      uv[u2 + 1] = vEnd[k]!;
    }
    const ib = i * 6;
    idx[ib] = vb; idx[ib + 1] = vb + 1; idx[ib + 2] = vb + 2;
    idx[ib + 3] = vb; idx[ib + 4] = vb + 2; idx[ib + 5] = vb + 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function buildDroplets(kit: MetroMaterials): DropletsBuild {
  const group = new THREE.Group();
  group.name = 'metroDroplets';

  const anchors = computeDropletAnchors();
  const count = anchors.length;

  const uRealTime = { value: 0 };
  const uSimTime = { value: 0 };
  const uPulse = {
    value: [
      new THREE.Vector4(0, 1, -100, 0),
      new THREE.Vector4(0, 1, -100, 0),
      new THREE.Vector4(0, 1, -100, 0),
      new THREE.Vector4(0, 1, -100, 0),
    ],
  };

  // ---- Draw call 1: polished champagne teardrops (InstancedMesh, env-mapped, vertex-shader motion) ----
  const dropGeo = buildTeardropGeometry();
  const dropletTris = (dropGeo.index ? dropGeo.index.count : dropGeo.getAttribute('position').count) / 3;

  const bodyMat = kit.deep.champagne.clone();
  bodyMat.name = 'metroDeepDropletsChampagne';
  // Warm polished anodised champagne: metalness 0.90 lets undersides catch soft cavern bounce light from below (skyhole)
  // while keeping crisp mirror specular reflections of the sky and pale limestone walls.
  bodyMat.color.setHex(0xe5d3ad);
  bodyMat.roughness = 0.16;
  bodyMat.metalness = 0.90;
  bodyMat.envMapIntensity = 1.65;
  bodyMat.onBeforeCompile = (sh) => {
    sh.uniforms.uRealTime = uRealTime;
    sh.uniforms.uSimTime = uSimTime;
    sh.uniforms.uPulse = uPulse;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${DROPLET_HEIGHT_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float _dropY = dropletWorldY(instanceMatrix[3].xz);
        transformed.y += (_dropY - ${DROPLET_BASE_Y.toFixed(1)});`,
      );
  };
  bodyMat.customProgramCacheKey = () => 'metroDropletsChampagne';

  const bodyMesh = new THREE.InstancedMesh(dropGeo, bodyMat, count);
  bodyMesh.name = 'dropletBodies';
  bodyMesh.userData.noShadow = true;
  bodyMesh.castShadow = false;
  bodyMesh.receiveShadow = false;

  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const [x, z] = anchors[i]!;
    m.makeTranslation(x, DROPLET_BASE_Y, z);
    bodyMesh.setMatrixAt(i, m);
  }
  bodyMesh.instanceMatrix.needsUpdate = true;
  bodyMesh.computeBoundingSphere();
  if (bodyMesh.boundingSphere) bodyMesh.boundingSphere.radius += 6.0;
  group.add(bodyMesh);

  // ---- Draw call 2: merged hairline cables hanging from SKY.y to each animated teardrop tip ----
  const cableGeo = buildCablesGeometry(anchors);
  const cableMat = new THREE.ShaderMaterial({
    name: 'metroDeepDropletCables',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      uRealTime,
      uSimTime,
      uPulse,
      uHalfWidth: { value: 0.0055 }, // 11 mm hairline cable ribbon
    },
    vertexShader: /* glsl */`
      uniform float uHalfWidth;
      varying float vCamDist;
      varying float vAlong;
      ${DROPLET_HEIGHT_GLSL}
      void main() {
        float dropY = dropletWorldY(position.xz);
        float worldY = mix(${SKY.y.toFixed(1)}, dropY + ${(DROPLET_HEIGHT - 0.006).toFixed(3)}, uv.y);
        vec3 wp = vec3(position.x, worldY, position.z);
        vec3 toCam = cameraPosition - wp;
        vCamDist = length(toCam);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), vec3(toCam.x, 0.0, toCam.z) + vec3(1e-5, 0.0, 0.0)));
        // Slight sub-pixel stabilization at mid range so cables stay crisp hairlines without aliasing
        float w = uHalfWidth * clamp(vCamDist / 26.0, 0.85, 2.0);
        wp += right * (uv.x * w);
        vAlong = uv.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying float vCamDist;
      varying float vAlong;
      void main() {
        // Subtle champagne-silver hairline, fading smoothly with distance and gently near the bright sky anchor
        float distFade = smoothstep(58.0, 14.0, vCamDist);
        float topSoft = smoothstep(0.0, 0.08, vAlong);
        float alpha = distFade * (0.18 + 0.24 * topSoft);
        if (alpha < 0.01) discard;
        vec3 col = mix(vec3(0.72, 0.75, 0.78), vec3(0.84, 0.78, 0.66), vAlong);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const cableMesh = new THREE.Mesh(cableGeo, cableMat);
  cableMesh.name = 'dropletCables';
  cableMesh.renderOrder = 1;
  cableMesh.userData.noShadow = true;
  cableMesh.castShadow = false;
  cableMesh.receiveShadow = false;
  group.add(cableMesh);

  let nextSlot = 0;
  const triggerPulse = (dirX: number, dirZ: number, simTimeSec: number, weight = 1.0): void => {
    const len = Math.hypot(dirX, dirZ) || 1;
    uPulse.value[nextSlot]!.set(dirX / len, dirZ / len, simTimeSec, weight);
    nextSlot = (nextSlot + 1) % 4;
  };

  return {
    group,
    deepMaterials: [bodyMat],
    count,
    dropletTris,
    updateReal(realTimeSec: number): void {
      uRealTime.value = realTimeSec;
    },
    updateSim(simTimeSec: number): void {
      uSimTime.value = simTimeSec;
    },
    triggerPulse,
  };
}
