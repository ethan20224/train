import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { GodRayComposite, GodRayPass } from '../lighting/godrays';
import { ExposureEffect, GoldenGradeEffect } from '../lighting/grade';

/**
 * Post-processing chain (spec section 4), all in HalfFloat linear HDR until tone mapping:
 *   RenderPass -> N8AO (half-res capable) -> [Bloom (mipmap blur) + ToneMapping (AgX) + Vignette + Noise]
 *   -> SMAA (own pass: edge detection must see tone-mapped LDR).
 * The renderer itself uses NoToneMapping; the final EffectPass performs the linear -> sRGB conversion.
 *
 * Verified against postprocessing 6.39.5 typings: ToneMappingMode.AGX exists (needs three >= r160),
 * and n8ao 2.0.1 source: N8AOPostPass requests the composer depth texture (needsDepthTexture) and,
 * when not the last pass, leaves gamma correction off (autosetGamma = renderToScreen).
 */
export class PostFX {
  readonly composer: EffectComposer;
  readonly ao: N8AOPostPass;
  readonly bloom: BloomEffect;
  readonly toneMapping: ToneMappingEffect;
  readonly vignette: VignetteEffect;
  readonly noise: NoiseEffect;
  readonly smaa: SMAAEffect;
  readonly godRays: GodRayPass;
  readonly exposure: ExposureEffect;
  readonly grade: GoldenGradeEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0, // SMAA does the anti-aliasing
    });

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    this.composer.addPass(new RenderPass(scene, camera));

    // Meter-scale scene: 1.2 m radius reads as contact shadow in corners / under cornices / around column bases.
    this.ao = new N8AOPostPass(scene, camera, size.x, size.y);
    this.ao.configuration.aoRadius = 1.2;
    this.ao.configuration.distanceFalloff = 0.9;
    this.ao.configuration.intensity = 2.5;
    this.ao.configuration.aoSamples = 12;
    this.ao.configuration.denoiseSamples = 6;
    this.ao.configuration.denoiseRadius = 10;
    this.ao.configuration.halfRes = true;
    // Glass / beams / dust are transparent: AO ignores them (also avoids N8AO's extra transparency renders).
    this.ao.configuration.transparencyAware = false;
    this.composer.addPass(this.ao);

    // Volumetric sun shafts: half-res march of the sun shadow map, composited (depth-aware) into the HDR frame
    // BEFORE bloom so the brightest beams can glow. See lighting/godrays.ts.
    this.godRays = new GodRayPass(camera);
    this.composer.addPass(this.godRays);
    this.composer.addPass(new EffectPass(camera, new GodRayComposite(this.godRays, camera)));

    // Only genuinely bright pixels (sky through windows, sun, emissives) bloom. Scene is linear HDR here.
    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.9,
      luminanceSmoothing: 0.15,
      intensity: 0.7,
      radius: 0.78,
      levels: 7,
    });
    this.exposure = new ExposureEffect(1);
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.grade = new GoldenGradeEffect();
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.45 });
    this.noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
    this.noise.blendMode.opacity.value = 0.035;

    this.composer.addPass(new EffectPass(camera, this.bloom, this.exposure, this.toneMapping, this.grade, this.vignette, this.noise));

    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.composer.addPass(new EffectPass(camera, this.smaa));
  }

  /** Quality setter: N8AO at half resolution (cheaper) or full. */
  setAOHalfRes(half: boolean): void {
    if (this.ao.configuration.halfRes !== half) this.ao.configuration.halfRes = half;
  }

  /** Quality setter: AO on/off entirely (for the lowest tiers or debugging). */
  setAOEnabled(enabled: boolean): void {
    this.ao.enabled = enabled;
  }

  setBloomEnabled(enabled: boolean): void {
    this.bloom.blendMode.setBlendFunction(enabled ? BlendFunction.SCREEN : BlendFunction.SKIP);
  }

  /** Call after changing renderer pixel ratio or window size (CSS pixels). */
  setSize(width: number, height: number): void {
    this.composer.setSize(width, height, true);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
