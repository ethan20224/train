import * as THREE from 'three';
import { FOREST, SKY } from '../../layoutMetro';
import { dayNight } from '../../metro/dayNight';

/**
 * Cloud forest life (user ruling 2026-11-23): blue morpho butterflies drifting through the understory by day, and soft
 * sunbeams slanting from the buried sky down through the canopy and mist along the current light direction (warm at golden
 * hour, faint cool moonbeams at night). Both are single draw calls with all motion in the vertex shader; no lights.
 */

const LIFE = {
  butterflies: 70, wingSpan: 0.16,
  beams: 22, beamWidth: [1.4, 3.2] as const, beamStrength: 0.3,
} as const;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const uTime = { value: 0 };
const uDay = { value: 1 };
const uLightDir = { value: new THREE.Vector3(0, 1, 0) };
const uBeamCol = { value: new THREE.Vector3(1, 0.97, 0.9) };

function buildButterflies(rnd: () => number, groundY: (x: number, z: number) => number): THREE.Mesh {
  const n = LIFE.butterflies;
  const pos: number[] = [], home: number[] = [], wing: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = FOREST.beds[Math.floor(rnd() * FOREST.beds.length)]!;
    const x = b.xMin + 1 + rnd() * (b.xMax - b.xMin - 2), z = b.zMin + 1 + rnd() * (b.zMax - b.zMin - 2);
    const y = groundY(x, z) + 0.8 + rnd() * 3.5;
    const ph = rnd() * 100;
    // two wings: each a quad hinged on the body axis (local x = along body, z = out along the wing)
    for (const side of [-1, 1]) {
      const v0 = pos.length / 3;
      for (const [ax, az] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] as const) {
        pos.push(ax, 0, az * side);
        home.push(x, y, z, ph);
        wing.push(side, ax + 0.5, az);
      }
      idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aHome', new THREE.Float32BufferAttribute(home, 4));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 3));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    name: 'metroForestButterflies', side: THREE.DoubleSide, fog: true,
    uniforms: { ...THREE.UniformsLib.fog, uTime, uDay, uSpan: { value: LIFE.wingSpan } },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform float uTime; uniform float uDay; uniform float uSpan;
      attribute vec4 aHome; attribute vec3 aWing;
      varying vec2 vUv;
      void main() {
        float t = uTime * 0.45 + aHome.w;
        vec3 c = aHome.xyz + vec3(sin(t * 0.7) * 2.2 + sin(t * 0.23) * 3.0, sin(t * 1.3) * 0.5 + sin(t * 0.4) * 0.6, cos(t * 0.6) * 2.2 + cos(t * 0.19) * 3.0);
        vec3 fwd = normalize(vec3(cos(t * 0.7) * 1.54 + cos(t * 0.23) * 0.69, 0.0, -sin(t * 0.6) * 1.32 - sin(t * 0.19) * 0.57) + 1e-4);
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
        float flap = sin(uTime * 14.0 + aHome.w * 3.0) * 0.9 + 0.25;
        float a = aWing.z * flap;
        vec3 wingDir = side * aWing.x * cos(a) + vec3(0.0, 1.0, 0.0) * sin(a) * aWing.z;
        vec3 p = c + fwd * position.x * uSpan * 0.9 + wingDir * aWing.z * uSpan;
        p *= 1.0; vUv = vec2(aWing.y, aWing.z);
        vec4 mvPosition = viewMatrix * vec4(mix(c - vec3(0.0, 500.0, 0.0), p, step(0.5, uDay)), 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying vec2 vUv;
      void main() {
        // rounded morpho wing: iridescent blue centre, black margin with white specks
        vec2 q = vec2(vUv.x * 2.0 - 1.0, vUv.y);
        float r = length(vec2(q.x * 0.9, q.y * 1.1 - 0.15));
        if (r > 0.95) discard;
        vec3 blue = mix(vec3(0.05, 0.35, 1.2), vec3(0.2, 0.75, 1.6), smoothstep(0.7, 0.1, r));
        vec3 col = mix(blue, vec3(0.01), smoothstep(0.62, 0.78, r));
        col += step(0.97, fract(sin(dot(floor(vUv * 9.0), vec2(12.9, 78.2))) * 43758.5)) * smoothstep(0.65, 0.8, r) * 0.8;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'forestButterflies';
  m.frustumCulled = false;
  m.userData.noShadow = true;
  return m;
}

function buildSunbeams(rnd: () => number): THREE.Mesh {
  const pos: number[] = [], top: number[] = [], prm: number[] = [], idx: number[] = [];
  for (let i = 0; i < LIFE.beams; i++) {
    const b = FOREST.beds[i % FOREST.beds.length]!;
    const x = b.xMin + rnd() * (b.xMax - b.xMin), z = b.zMin + rnd() * (b.zMax - b.zMin);
    const len = 0.78 + rnd() * 0.22; // fraction of the sky-to-floor path (shader)
    const w = LIFE.beamWidth[0] + rnd() * (LIFE.beamWidth[1] - LIFE.beamWidth[0]);
    const ph = rnd() * 100;
    const v0 = pos.length / 3;
    for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]] as const) {
      pos.push(u, v, 0);
      // anchor where the beam's axis crosses mid-canopy, so tilting with the sun keeps it over the forest
      top.push(x, -52, z, len);
      prm.push(w, ph, 0);
    }
    idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAnchor', new THREE.Float32BufferAttribute(top, 4));
  g.setAttribute('aParam', new THREE.Float32BufferAttribute(prm, 3));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    name: 'metroForestSunbeams', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime, uLightDir, uBeamCol, uSkyY: { value: SKY.y - 0.4 }, uFloorY: { value: FOREST.mist.yBottom } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec3 uLightDir; uniform float uSkyY; uniform float uFloorY;
      attribute vec4 aAnchor; attribute vec3 aParam;
      varying vec2 vUv; varying float vFade; varying float vPh;
      void main() {
        vec3 dir = -normalize(uLightDir);                       // light travels down along -lightDir
        float tTop = (uSkyY - aAnchor.y) / dir.y;               // negative: back up to the sky plane
        vec3 a0 = aAnchor.xyz + dir * tTop;                     // beam starts at the sky
        float full = (uSkyY - uFloorY - 0.5) / max(0.2, -dir.y);   // sky plane to forest floor along the light
        vec3 a1 = a0 + dir * full * aAnchor.w;
        vec3 p = mix(a0, a1, position.y);
        // cylindrical billboard about the beam axis
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(dir, toCam));
        p += side * position.x * aParam.x * 0.5;
        p.y = max(p.y, uFloorY);
        vUv = vec2(position.x, position.y);
        float facing = abs(dot(toCam, dir));
        vFade = (1.0 - facing * facing) * smoothstep(1.5, 9.0, length(cameraPosition - p));
        vPh = aParam.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uBeamCol;
      varying vec2 vUv; varying float vFade; varying float vPh;
      void main() {
        float across = 1.0 - smoothstep(0.0, 1.0, abs(vUv.x));
        float along = smoothstep(0.15, 0.45, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y)); // strongest among the trunks, fading into the mist
        float shimmer = 0.75 + 0.25 * sin(uTime * 0.4 + vPh + vUv.y * 6.0);
        float streak = 0.7 + 0.3 * sin(vUv.x * 9.0 + vPh * 3.0);
        gl_FragColor = vec4(uBeamCol * across * across * along * shimmer * streak * vFade, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'forestSunbeams';
  m.frustumCulled = false;
  m.userData.noShadow = true;
  m.renderOrder = 5;
  return m;
}

export interface ForestLife {
  group: THREE.Group;
  update(realTimeSec: number): void;
}

export function buildForestLife(groundY: (x: number, z: number) => number): ForestLife {
  const rnd = mulberry32(FOREST.seed + 101);
  const group = new THREE.Group();
  group.name = 'metroForestLife';
  const butterflies = buildButterflies(rnd, groundY);
  const beams = buildSunbeams(rnd);
  group.add(butterflies, beams);
  return {
    group,
    update(realTimeSec: number): void {
      uTime.value = realTimeSec;
      const dn = dayNight.state;
      uDay.value = dn.night < 0.4 ? 1 : 0;
      butterflies.visible = dn.night < 0.4;
      uLightDir.value.set(dn.lightDir[0], dn.lightDir[1], dn.lightDir[2]);
      // warm and stronger at golden hour, faint and cool under the moon, dimmed while a cloud covers the sun
      const k = LIFE.beamStrength * Math.min(1.4, dn.lightGain * (1 + 0.6 * dn.golden)) * (dn.moon ? 1.6 : 1.0);
      uBeamCol.value.set(dn.lightColor[0] * k, dn.lightColor[1] * k, dn.lightColor[2] * k);
      beams.visible = k > 0.002;
    },
  };
}
