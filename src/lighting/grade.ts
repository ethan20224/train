import * as THREE from 'three';
import { BlendFunction, Effect } from 'postprocessing';

/** Scene-linear exposure, applied before the tone mapper (so it behaves like a camera exposure). */
export class ExposureEffect extends Effect {
  constructor(exposure = 1) {
    super(
      'ExposureEffect',
      /* glsl */ `
      uniform float uExposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = vec4(inputColor.rgb * uExposure, inputColor.a);
      }`,
      { blendFunction: BlendFunction.NORMAL, uniforms: new Map([['uExposure', new THREE.Uniform(exposure)]]) },
    );
  }
  get exposure(): number {
    return (this.uniforms.get('uExposure') as THREE.Uniform<number>).value;
  }
  set exposure(v: number) {
    (this.uniforms.get('uExposure') as THREE.Uniform<number>).value = v;
  }
}

/**
 * Golden-hour film grade, applied AFTER tone mapping (display-referred, still linear before the sRGB encode):
 * gentle S-curve contrast, split toning (cool shadows, warm highlights), saturation, lift / gain.
 * Cheap: one pass of ALU, no textures.
 */
export class GoldenGradeEffect extends Effect {
  constructor() {
    super(
      'GoldenGradeEffect',
      /* glsl */ `
      uniform vec3 uShadowTint;
      uniform vec3 uHighlightTint;
      uniform float uSplit;
      uniform float uContrast;
      uniform float uSaturation;
      uniform vec3 uLift;
      uniform vec3 uGain;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = max(inputColor.rgb, 0.0);
        c = c * uGain + uLift;
        vec3 g = pow(max(c, 0.0), vec3(1.0 / 2.2));          // perceptual-ish space
        float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
        // S-curve about mid grey, preserving black and white.
        vec3 s = g * g * (3.0 - 2.0 * g);
        g = mix(g, s, uContrast);
        // Split toning: multiplicative tints weighted by luminance.
        float wS = 1.0 - smoothstep(0.0, 0.55, l);
        float wH = smoothstep(0.38, 0.95, l);
        g *= mix(vec3(1.0), uShadowTint, wS * uSplit);
        g *= mix(vec3(1.0), uHighlightTint, wH * uSplit);
        float l2 = dot(g, vec3(0.2126, 0.7152, 0.0722));
        g = mix(vec3(l2), g, uSaturation);
        outputColor = vec4(pow(max(g, 0.0), vec3(2.2)), inputColor.a);
      }`,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, THREE.Uniform>([
          ['uShadowTint', new THREE.Uniform(new THREE.Color(0.8, 0.94, 1.22))],
          ['uHighlightTint', new THREE.Uniform(new THREE.Color(1.1, 1.0, 0.84))],
          ['uSplit', new THREE.Uniform(1.15)],
          ['uContrast', new THREE.Uniform(0.4)],
          ['uSaturation', new THREE.Uniform(1.1)],
          ['uLift', new THREE.Uniform(new THREE.Color(0.0, 0.0, 0.004))],
          ['uGain', new THREE.Uniform(new THREE.Color(1, 1, 1))],
        ]),
      },
    );
  }
  u<T>(name: string): THREE.Uniform<T> {
    return this.uniforms.get(name) as THREE.Uniform<T>;
  }
}
