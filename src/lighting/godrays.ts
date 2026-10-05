import * as THREE from 'three';
import { Effect, EffectAttribute, Pass, BlendFunction } from 'postprocessing';
import { CONCOURSE, SHED, VAULT } from '../layout';
import { SUN_COLOR, SUN_DIR, sunShadowTexture, lookShared } from './shared';

/**
 * Volumetric god rays by ray-marching the sun's own static shadow map.
 *
 * Instead of hand-built shaft meshes, every half-resolution pixel marches from the camera to the scene depth and
 * asks the sun shadow map (the same one that lights the floor) "is this point of air in direct sun?". The window
 * openings, mullions, columns, vault and roof glazing therefore carve the beams exactly where the sun pools land,
 * shafts are depth-softened by construction (the march stops at geometry), and they are cheap: one 1/4-pixel pass,
 * 26 taps. A depth-aware (bilateral) composite adds the result to the HDR frame before bloom.
 *
 * GodRayPass       : renders the scattering into its own half-res RT (needsSwap = false, input untouched).
 * GodRayComposite  : Effect that upsamples that RT bilaterally against the full-res depth and adds it.
 */

const STEPS = 26;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDepth;
  uniform sampler2DShadow uShadow;
  uniform mat4 uShadowMatrix;
  uniform mat4 uProjInv;
  uniform mat4 uCamWorld;
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;      // toward the sun
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform float uMaxDist;
  uniform float uDensity;
  uniform float uIntensity;
  uniform float uNear;
  uniform float uFar;
  varying vec2 vUv;

  const vec3 WMIN = vec3(${(CONCOURSE.xMin - 2).toFixed(1)}, -3.0, ${(CONCOURSE.zMin - 0.5).toFixed(1)});
  const vec3 WMAX = vec3(${(SHED.xMax + 2).toFixed(1)}, ${(VAULT.crownY + 2).toFixed(1)}, ${(SHED.zMax + 2).toFixed(1)});

  vec3 worldAt(vec2 uv, float d) {
    vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    v /= v.w;
    return (uCamWorld * v).xyz;
  }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  float hgPhase(float c, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (12.566371 * pow(1.0 + g2 - 2.0 * g * c, 1.5));
  }
  float haze(vec3 p, float t) {
    // Slowly drifting low-frequency density: cheap sine-product noise (no hashing, no textures).
    float a = sin(p.x * 0.21 + p.z * 0.09 + t * 0.045) + sin(p.y * 0.33 - p.z * 0.14 + t * 0.037);
    float b = sin(p.x * 0.53 - p.y * 0.41 + t * 0.06) * sin(p.z * 0.37 + t * 0.03);
    return clamp(0.9 + 0.14 * a + 0.1 * b, 0.4, 1.4);
  }

  void main() {
    float d = texture2D(tDepth, vUv).r;
    vec3 farP = worldAt(vUv, 0.9999);
    vec3 rd = normalize(farP - uCamPos);
    float sceneDist = d < 0.99999 ? length(worldAt(vUv, d) - uCamPos) : 1e5;
    float viewZ = d < 0.99999 ? uNear * uFar / (uFar - d * (uFar - uNear)) : uFar;
    float L = min(sceneDist, uMaxDist);

    float cosT = dot(rd, uSunDir);
    float phase = mix(0.0796, hgPhase(cosT, 0.62), 0.55);

    float j = ign(gl_FragCoord.xy);
    vec3 acc = vec3(0.0);
    float T = 1.0;
    float prevT = 0.0;
    for (int i = 0; i < ${STEPS}; i++) {
      float u = (float(i) + j) / ${STEPS}.0;
      float t = L * pow(u, 1.55);
      float dt = max(t - prevT, 0.0);
      prevT = t;
      vec3 p = uCamPos + rd * t;
      // Only the building volume holds visible sunlit haze (outside is sky; fog handles distance).
      vec3 inb = step(WMIN, p) * step(p, WMAX);
      float inside = inb.x * inb.y * inb.z;
      if (inside > 0.5) {
        vec4 sc = uShadowMatrix * vec4(p, 1.0);
        vec3 s = sc.xyz / sc.w;
        float lit = texture(uShadow, vec3(s.xy, s.z - 0.0003));
        float zone = mix(1.9, 0.55, smoothstep(96.0, 112.0, p.z)); // dusty concourse, airier shed
        float dens = uDensity * zone * haze(p, uTime) * exp(-max(p.y, 0.0) * 0.022);
        acc += uSunColor * (lit * dens * phase * dt) * T;
        T *= exp(-dens * 0.012 * dt);
      }
    }
    gl_FragColor = vec4(acc * uIntensity, viewZ);
  }
`;

export class GodRayPass extends Pass {
  readonly target: THREE.WebGLRenderTarget;
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly camera3: THREE.PerspectiveCamera;
  private time = 0;
  private scale = 0.5;
  private cleared = false;

  constructor(camera: THREE.PerspectiveCamera) {
    super('GodRayPass');
    this.camera3 = camera;
    this.needsSwap = false;
    this.needsDepthTexture = true;
    this.target = new THREE.WebGLRenderTarget(512, 288, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    this.target.texture.name = 'GodRays.volume';
    this.uniforms = {
      tDepth: { value: null },
      uShadow: { value: null },
      uShadowMatrix: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: SUN_COLOR.clone() },
      uTime: { value: 0 },
      uMaxDist: { value: 200 },
      uDensity: { value: 1 },
      uIntensity: { value: 0.1 },
      uNear: { value: 0.1 },
      uFar: { value: 3000 },
    };
    this.fullscreenMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  /** Overall strength (HDR scale of the scattered sunlight). */
  set intensity(v: number) {
    (this.uniforms.uIntensity as THREE.IUniform<number>).value = v;
  }
  get intensity(): number {
    return (this.uniforms.uIntensity as THREE.IUniform<number>).value;
  }

  override setDepthTexture(depthTexture: THREE.Texture): void {
    (this.uniforms.tDepth as THREE.IUniform).value = depthTexture;
  }

  override setSize(width: number, height: number): void {
    this.target.setSize(Math.max(1, Math.ceil(width * this.scale)), Math.max(1, Math.ceil(height * this.scale)));
  }

  override render(renderer: THREE.WebGLRenderer, _input: THREE.WebGLRenderTarget, _output: THREE.WebGLRenderTarget, dt = 0): void {
    const u = this.uniforms;
    const tex = sunShadowTexture();
    const sun = lookShared.sun;
    if (!tex || !sun || !(u.tDepth as THREE.IUniform).value) {
      if (!this.cleared) {
        const prev = renderer.getClearColor(new THREE.Color());
        const prevA = renderer.getClearAlpha();
        renderer.setRenderTarget(this.target);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
        renderer.setClearColor(prev, prevA);
        this.cleared = true;
      }
      return;
    }
    this.cleared = false;
    this.time += dt;
    const cam = this.camera3;
    (u.uShadow as THREE.IUniform).value = tex;
    ((u.uShadowMatrix as THREE.IUniform).value as THREE.Matrix4).copy(sun.shadow.matrix);
    ((u.uProjInv as THREE.IUniform).value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    ((u.uCamWorld as THREE.IUniform).value as THREE.Matrix4).copy(cam.matrixWorld);
    ((u.uCamPos as THREE.IUniform).value as THREE.Vector3).setFromMatrixPosition(cam.matrixWorld);
    (u.uTime as THREE.IUniform).value = this.time;
    (u.uNear as THREE.IUniform).value = cam.near;
    (u.uFar as THREE.IUniform).value = cam.far;
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
  }

  override dispose(): void {
    this.target.dispose();
    super.dispose();
  }
}

/** Depth-aware upsample of the half-res volume, added to the HDR frame (so the beams can still bloom). */
export class GodRayComposite extends Effect {
  private readonly pass: GodRayPass;
  private readonly cam: THREE.PerspectiveCamera;

  constructor(pass: GodRayPass, camera: THREE.PerspectiveCamera) {
    super(
      'GodRayComposite',
      /* glsl */ `
      uniform sampler2D tVol;
      uniform float uNearC;
      uniform float uFarC;
      float linZ(float d) { return d >= 0.99999 ? uFarC : uNearC * uFarC / (uFarC - d * (uFarC - uNearC)); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        ivec2 sz = textureSize(tVol, 0);
        vec2 pos = uv * vec2(sz) - 0.5;
        ivec2 b = ivec2(floor(pos));
        vec2 f = fract(pos);
        float zFull = linZ(readDepth(uv));
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        for (int k = 0; k < 4; k++) {
          ivec2 o = ivec2(k & 1, k >> 1);
          vec4 s = texelFetch(tVol, clamp(b + o, ivec2(0), sz - 1), 0);
          float wb = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
          float wd = 1.0 / (0.0015 + abs(s.a - zFull) / (0.05 * zFull + 0.15));
          float w = wb * wd + 1e-5;
          acc += s.rgb * w;
          wsum += w;
        }
        outputColor = vec4(inputColor.rgb + acc / wsum, inputColor.a);
      }`,
      {
        blendFunction: BlendFunction.NORMAL,
        attributes: EffectAttribute.DEPTH,
        uniforms: new Map<string, THREE.Uniform>([
          ['tVol', new THREE.Uniform(pass.texture)],
          ['uNearC', new THREE.Uniform(camera.near)],
          ['uFarC', new THREE.Uniform(camera.far)],
        ]),
      },
    );
    this.pass = pass;
    this.cam = camera;
  }

  override update(): void {
    (this.uniforms.get('tVol') as THREE.Uniform).value = this.pass.texture;
    (this.uniforms.get('uNearC') as THREE.Uniform).value = this.cam.near;
    (this.uniforms.get('uFarC') as THREE.Uniform).value = this.cam.far;
  }
}
