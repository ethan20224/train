// STUB — owned by Phase 2
import type * as THREE from 'three';
import type { AudioEngine, FrameInfo, TrainVoice } from '../core/types';

/** Placeholder audio engine: every method is a no-op. Phase 2 implements procedural Web Audio. */
export function createAudioEngine(_camera: THREE.PerspectiveCamera): AudioEngine {
  const voice: TrainVoice = {
    setSpeed: () => undefined,
    brake: () => undefined,
    depart: () => undefined,
    dispose: () => undefined,
  };
  return {
    start: async () => undefined,
    footstep: () => undefined,
    createTrainVoice: (_obj: THREE.Object3D) => voice,
    update: (_f: FrameInfo) => undefined,
  };
}
