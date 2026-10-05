/**
 * Intro / pause / debug overlays (markup lives in index.html).
 *  - Intro: black, title, thin gold progress line, then "Click to enter" -> 2 s fade from black.
 *  - Pause: shown when pointer lock is released after entering (Esc); click resumes.
 *  - Debug (`&debug=1`): fps, frame ms, draw calls, triangles, geometries/textures, pixel ratio, tier.
 */

export interface DebugStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  tier: string;
  textureMB: number;
}

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing from index.html`);
  return e as T;
}

export class UI {
  private readonly intro = el<HTMLDivElement>('intro');
  private readonly bar = el<HTMLElement>('intro').querySelector<HTMLElement>('.rule i');
  private readonly prompt = el<HTMLElement>('intro').querySelector<HTMLButtonElement>('.prompt');
  private readonly pause = el<HTMLDivElement>('pause');
  private readonly debug = el<HTMLPreElement>('debug');
  private enterHandler: (() => void) | null = null;

  constructor() {
    if (!this.bar || !this.prompt) throw new Error('intro markup incomplete');
    this.prompt.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fire();
    });
    this.intro.addEventListener('click', () => {
      if (this.intro.classList.contains('ready')) this.fire();
    });
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Enter' || e.code === 'Space') && this.intro.classList.contains('ready')) this.fire();
    });
  }

  /** 0..1 while loading. */
  setProgress(p: number): void {
    if (this.bar) this.bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
  }

  /** Loading done: show "Click to enter". `onEnter` runs inside the user gesture (click / key). */
  ready(onEnter: () => void): void {
    this.enterHandler = onEnter;
    this.setProgress(1);
    this.intro.classList.add('ready');
    if (this.prompt) this.prompt.disabled = false;
    this.prompt?.focus({ preventScroll: true });
  }

  showError(message: string): void {
    const p = document.createElement('div');
    p.className = 'fail';
    p.textContent = message;
    this.intro.querySelector('.content')?.appendChild(p);
  }

  private fire(): void {
    const h = this.enterHandler;
    if (!h) return;
    this.enterHandler = null;
    h();
  }

  /** Start the 2 s fade from black; resolves when it is done and removes the overlay. */
  fadeIn(): Promise<void> {
    this.intro.classList.add('entering');
    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.intro.remove();
        resolve();
      }, 2050);
    });
  }

  /** Skip the intro instantly (`&autostart=1`). */
  skipIntro(): void {
    this.intro.remove();
  }

  showPause(show: boolean, onResume?: () => void): void {
    this.pause.classList.toggle('show', show);
    this.pause.onclick = show && onResume ? onResume : null;
  }

  enableDebug(): void {
    this.debug.classList.add('show');
  }

  updateDebug(s: DebugStats): void {
    this.debug.textContent =
      `fps        ${s.fps.toFixed(0).padStart(4)}\n` +
      `frame ms   ${s.frameMs.toFixed(1).padStart(6)}\n` +
      `draw calls ${String(s.drawCalls).padStart(6)}\n` +
      `triangles  ${s.triangles.toLocaleString('en-US').padStart(10)}\n` +
      `geometries ${String(s.geometries).padStart(6)}\n` +
      `textures   ${String(s.textures).padStart(6)}  (~${s.textureMB.toFixed(0)} MB est.)\n` +
      `pixelRatio ${s.pixelRatio.toFixed(2).padStart(6)}\n` +
      `quality    ${s.tier}`;
  }
}
