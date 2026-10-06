import * as THREE from 'three';
import { trainControl } from '../../trains/scheduler';
import { SIGNALS } from './data';
import { at, box, cyl, strut, type Bags, type Geo } from './kit';

const BLACK = 0x111315;
const WHITE = 0xe6e1d2;
const BASE_Y = -1.38; // ballast top
const POST_TOP = 3.75;
const HEAD_Y = 3.1;
const RED_Y = HEAD_Y + 0.3;
const GRN_Y = HEAD_Y - 0.3;
const PLATFORM_Y = 2.4;

/** HDR lens colours (lit) -- the lens material is basic + vertex colours, so these drive the bloom. */
const RED_ON = new THREE.Color(1.0, 0.04, 0.02).multiplyScalar(3.4);
const GRN_ON = new THREE.Color(0.18, 1.0, 0.5).multiplyScalar(3.0);
const OFF = 0.045;

interface LensRef {
  readonly start: number;
  readonly count: number;
}

/** Period colour-light starter signals (red / green), one per track, on the driver's left beyond the platform ends. */
export function buildSignals(b: Bags): { bind(lensGeo: Geo): (dt: number) => void } {
  const refs: { red: LensRef; green: LensRef }[] = [];
  for (const s of SIGNALS) {
    const px = s.x;
    const pz = s.z;
    // concrete foot and a black-and-white banded tubular post
    b.stone.add(box(px - 0.26, px + 0.26, BASE_Y - 0.3, BASE_Y + 0.28, pz - 0.26, pz + 0.26));
    const band = 0.5;
    for (let y = BASE_Y + 0.28, i = 0; y < POST_TOP; y += band, i++) {
      const top = Math.min(POST_TOP, y + band);
      b.paint.add(cyl(0.085, top - y, px, y, pz, 12), i % 2 ? WHITE : BLACK);
    }
    b.paint.add(cyl(0.11, 0.08, px, POST_TOP, pz, 12), BLACK);
    // lamp head: black case, white-edged backing plate, two hooded lenses
    const hz = pz - 0.34;
    b.paint.add(box(px - 0.21, px + 0.21, HEAD_Y - 0.5, HEAD_Y + 0.5, hz, pz - 0.06), BLACK);
    b.paint.add(box(px - 0.27, px + 0.27, HEAD_Y - 0.58, HEAD_Y + 0.58, pz - 0.075, pz - 0.055), WHITE);
    b.paint.add(box(px - 0.245, px + 0.245, HEAD_Y - 0.55, HEAD_Y + 0.55, pz - 0.085, pz - 0.07), BLACK);
    for (const ly of [RED_Y, GRN_Y]) {
      // hood: open tube
      const hood = new THREE.CylinderGeometry(0.15, 0.15, 0.16, 20, 1, true);
      hood.rotateX(Math.PI / 2);
      b.paint.add(hood, BLACK, at(px, ly, hz - 0.085));
      b.paint.add(new THREE.RingGeometry(0.12, 0.155, 20), BLACK, at(px, ly, hz - 0.002, Math.PI));
    }
    const lens = (ly: number, hex: number): LensRef => {
      const g = new THREE.CircleGeometry(0.125, 20);
      g.rotateY(Math.PI);
      g.translate(px, ly, hz - 0.012);
      const start = b.lens.add(g, hex, undefined, OFF);
      return { start, count: g.getAttribute('position').count };
    };
    refs.push({ red: lens(RED_Y, 0xff1a0d), green: lens(GRN_Y, 0x2dff80) });

    // ladder on the back of the post (+z), up to a small platform with a rail
    const lz = pz + 0.2;
    for (const sx of [-1, 1]) b.paint.add(box(px + sx * 0.2 - 0.016, px + sx * 0.2 + 0.016, BASE_Y + 0.7, PLATFORM_Y + 0.9, lz - 0.016, lz + 0.016), BLACK);
    for (let y = BASE_Y + 0.9; y < PLATFORM_Y; y += 0.3) b.paint.add(box(px - 0.2, px + 0.2, y - 0.01, y + 0.01, lz - 0.011, lz + 0.011), BLACK);
    for (const y of [BASE_Y + 1.2, PLATFORM_Y - 0.4]) b.paint.add(box(px - 0.012, px + 0.012, y - 0.012, y + 0.012, pz + 0.07, lz), BLACK);
    b.paint.add(box(px - 0.38, px + 0.38, PLATFORM_Y - 0.03, PLATFORM_Y + 0.02, pz - 0.22, pz + 0.26), BLACK);
    for (const sx of [-1, 1]) {
      b.paint.add(box(px + sx * 0.37 - 0.012, px + sx * 0.37 + 0.012, PLATFORM_Y, PLATFORM_Y + 0.85, pz - 0.2, pz - 0.18), BLACK);
      b.paint.add(box(px + sx * 0.37 - 0.012, px + sx * 0.37 + 0.012, PLATFORM_Y, PLATFORM_Y + 0.85, pz + 0.24, pz + 0.26), BLACK);
      b.paint.add(strut([px + sx * 0.37, PLATFORM_Y + 0.8, pz - 0.19], [px + sx * 0.37, PLATFORM_Y + 0.8, pz + 0.25], 0.025), BLACK);
    }
    b.paint.add(strut([px - 0.37, PLATFORM_Y + 0.8, pz + 0.25], [px + 0.37, PLATFORM_Y + 0.8, pz + 0.25], 0.025), BLACK);
    // post-to-platform brace and a small relay box at the foot
    b.paint.add(box(px + 0.12, px + 0.42, BASE_Y + 0.28, BASE_Y + 0.75, pz - 0.1, pz + 0.12), 0x2a2f2c);
  }

  const green = new Float32Array(SIGNALS.length);
  const shown = new Float32Array(SIGNALS.length).fill(-1);
  const FADE = 0.65; // seconds for the red/green cross-fade

  return {
    bind(lensGeo: Geo) {
      const col = lensGeo.getAttribute('color') as THREE.BufferAttribute;
      const arr = col.array as Float32Array;
      const fill = (ref: LensRef, c: THREE.Color, amt: number): void => {
        const k = OFF + (1 - OFF) * amt;
        const r = c.r * k;
        const g = c.g * k;
        const bl = c.b * k;
        for (let v = ref.start; v < ref.start + ref.count; v++) {
          arr[v * 3] = r;
          arr[v * 3 + 1] = g;
          arr[v * 3 + 2] = bl;
        }
      };
      for (const r of refs) {
        fill(r.red, RED_ON, 1);
        fill(r.green, GRN_ON, 0);
      }
      col.needsUpdate = true;
      return (dt: number): void => {
        const states = trainControl.trackStates();
        let dirty = false;
        for (let i = 0; i < SIGNALS.length; i++) {
          const ph = states[SIGNALS[i]!.track]?.phase;
          const target = ph === 'accel' || ph === 'cruiseOut' ? 1 : 0;
          const cur = green[i]!;
          const step = dt / FADE;
          const next = cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
          green[i] = next;
          if (Math.abs(next - shown[i]!) > 0.003) {
            shown[i] = next;
            // smoothstep for a lamp-filament feel
            const e = next * next * (3 - 2 * next);
            fill(refs[i]!.red, RED_ON, 1 - e);
            fill(refs[i]!.green, GRN_ON, e);
            dirty = true;
          }
        }
        if (dirty) col.needsUpdate = true;
      };
    },
  };
}
