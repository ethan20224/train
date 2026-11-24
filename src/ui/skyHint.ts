import { THRESHOLD } from '../layoutMetro';

/**
 * One-time Meridian Deep discovery prompt: appears for 7 seconds when the player first reaches
 * Threshold depth (around the speed gates and MERIDIAN DEEP entrance), showing that N cycles
 * Day / Golden hour / Night. Pure state machine (`SkyHintController`) is DOM-free for Node tests;
 * `SkyHintUI` injects its own scoped styles matching intro / TicketUI.
 */

export const SKY_HINT_DURATION_MS = 7000;
/** Trigger feet height: 1 m above the Threshold deck (-29 m), catching both F3 escalators and the Sinking Floor disc. */
export const SKY_HINT_TRIGGER_Y = THRESHOLD.y + 1.0;

export type SkyHintState = 'armed' | 'showing' | 'dismissed';
export type SkyHintEvent = 'show' | 'pause' | 'resume' | null;

/** Pure lifecycle state machine (no DOM / Three.js) so Node tests can verify every transition. */
export class SkyHintController {
  private _state: SkyHintState;
  private _paused = false;

  constructor(disabled = false) {
    this._state = disabled ? 'dismissed' : 'armed';
  }

  get state(): SkyHintState {
    return this._state;
  }

  get paused(): boolean {
    return this._paused;
  }

  /** Call once per frame with player feet Y and whether the session is actively running (locked & tab visible). */
  update(feetY: number, active: boolean): SkyHintEvent {
    if (this._state === 'dismissed') return null;
    if (this._state === 'armed') {
      if (!active || feetY > SKY_HINT_TRIGGER_Y) return null;
      this._state = 'showing';
      this._paused = false;
      return 'show';
    }
    if (!active && !this._paused) {
      this._paused = true;
      return 'pause';
    }
    if (active && this._paused) {
      this._paused = false;
      return 'resume';
    }
    return null;
  }

  /** Call when the user presses N. Returns true if the prompt was visible and should dismiss immediately. */
  onKeyN(): boolean {
    if (this._state !== 'showing') return false;
    this._state = 'dismissed';
    this._paused = false;
    return true;
  }

  /** Call when the 7-second countdown completes. Returns true if the prompt transitioned to dismissed. */
  onTimeout(): boolean {
    if (this._state !== 'showing') return false;
    this._state = 'dismissed';
    this._paused = false;
    return true;
  }
}

const CSS = `
#gm-sky-hint {
  position: fixed;
  left: 50%;
  bottom: clamp(24px, 4.2vh, 44px);
  z-index: 12;
  display: inline-flex;
  align-items: center;
  gap: 0.95rem;
  padding: 0.68rem 1.18rem 0.78rem 0.85rem;
  border-radius: 2px;
  border: 1px solid rgba(212, 176, 106, 0.28);
  background: linear-gradient(180deg, rgba(16, 12, 8, 0.88) 0%, rgba(10, 7, 4, 0.92) 100%);
  box-shadow:
    inset 0 1px 0 rgba(235, 206, 145, 0.12),
    0 12px 32px rgba(0, 0, 0, 0.48),
    0 2px 6px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  opacity: 0;
  visibility: hidden;
  transform: translate3d(-50%, 10px, 0) scale(0.96);
  will-change: transform, opacity;
  transition:
    opacity 280ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 280ms cubic-bezier(0.23, 1, 0.32, 1),
    visibility 0ms 280ms;
}

#gm-sky-hint.show {
  opacity: 1;
  visibility: visible;
  transform: translate3d(-50%, 0, 0) scale(1);
  transition:
    opacity 280ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 280ms cubic-bezier(0.23, 1, 0.32, 1),
    visibility 0ms;
}

#gm-sky-hint.leaving {
  opacity: 0;
  visibility: hidden;
  transform: translate3d(-50%, 6px, 0) scale(0.98);
  transition:
    opacity 220ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 220ms cubic-bezier(0.23, 1, 0.32, 1),
    visibility 0ms 220ms;
}

#gm-sky-hint.leaving-fast {
  opacity: 0;
  visibility: hidden;
  transform: translate3d(-50%, 4px, 0) scale(0.97);
  transition:
    opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1),
    visibility 0ms 180ms;
}

#gm-sky-hint .key {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.15rem;
  height: 2.15rem;
  border: 1px solid rgba(212, 176, 106, 0.56);
  border-radius: 2px;
  background: linear-gradient(180deg, rgba(28, 20, 11, 0.72) 0%, rgba(12, 8, 4, 0.78) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 238, 198, 0.16),
    inset 0 -1px 0 rgba(0, 0, 0, 0.45);
  font-family: var(--display, 'Italiana', 'Didot', 'Bodoni 72', serif);
  font-size: 1.08rem;
  line-height: 1;
  color: #ebd08f;
  transition:
    transform 95ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 95ms ease-out,
    border-color 95ms ease-out,
    color 95ms ease-out;
}

#gm-sky-hint.ack .key {
  transform: scale(0.92);
  background: rgba(212, 176, 106, 0.24);
  border-color: #ecd194;
  color: #fff6e0;
}

#gm-sky-hint .copy {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  white-space: nowrap;
}

#gm-sky-hint .title {
  font-family: var(--display, 'Italiana', 'Didot', 'Bodoni 72', serif);
  font-size: 0.96rem;
  line-height: 1.1;
  letter-spacing: 0.23em;
  text-transform: uppercase;
  color: #e4c37b;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.72);
}

#gm-sky-hint .modes {
  font-family: 'Cormorant Garamond', 'Cormorant', 'Didot', Georgia, serif;
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.15;
  letter-spacing: 0.05em;
  color: rgba(238, 222, 188, 0.86);
}

#gm-sky-hint .timer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(212, 176, 106, 0.15);
  overflow: hidden;
}

#gm-sky-hint .timer i {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, rgba(212, 176, 106, 0.72), #ebd08f);
  transform-origin: left center;
  transform: scaleX(1);
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  #gm-sky-hint,
  #gm-sky-hint.show,
  #gm-sky-hint.leaving,
  #gm-sky-hint.leaving-fast {
    transform: translate3d(-50%, 0, 0);
    transition: opacity 180ms ease, visibility 0ms 180ms;
  }
  #gm-sky-hint.show {
    transition: opacity 180ms ease, visibility 0ms;
  }
  #gm-sky-hint.ack .key {
    transform: none;
  }
}
`;

export interface SkyHintOptions {
  /** Disable entirely (e.g. `?cam=` fixed-camera screenshot mode). */
  disabled?: boolean;
}

export class SkyHintUI {
  private readonly ctrl: SkyHintController;
  private readonly el: HTMLDivElement;
  private readonly bar: HTMLElement;
  private anim: Animation | null = null;
  private timers: number[] = [];

  constructor(opts: SkyHintOptions = {}) {
    this.ctrl = new SkyHintController(!!opts.disabled);

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.id = 'gm-sky-hint';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-atomic', 'true');
    this.el.innerHTML =
      '<span class="key" aria-hidden="true">N</span>' +
      '<div class="copy">' +
      '<span class="title">Change the sky</span>' +
      '<span class="modes">Day / Golden hour / Night</span>' +
      '</div>' +
      '<div class="timer" aria-hidden="true"><i></i></div>';
    document.body.appendChild(this.el);
    this.bar = this.el.querySelector<HTMLElement>('.timer i')!;

    // Immediately pause/resume the compositor countdown when tab visibility changes (rAF is throttled while hidden).
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onVisibilityChange = (): void => {
    if (this.ctrl.state !== 'showing' || !this.anim) return;
    if (document.hidden) {
      this.anim.pause();
    } else if (!this.ctrl.paused) {
      this.anim.play();
    }
  };

  /** Per frame from the main loop: evaluates height trigger and pause/resume state. */
  update(feetY: number, active: boolean): void {
    const ev = this.ctrl.update(feetY, active);
    if (ev === 'show') this.show();
    else if (ev === 'pause') this.anim?.pause();
    else if (ev === 'resume' && !document.hidden) this.anim?.play();
  }

  /** Notify when the user presses N. Dismisses immediately with tactile keycap feedback if showing. */
  notifyKeyN(): void {
    if (!this.ctrl.onKeyN()) return;
    this.freezeBar();
    this.clearTimers();
    this.el.classList.add('ack');
    this.later(() => this.beginExit(true), 95);
  }

  private show(): void {
    this.clearTimers();
    this.cancelAnim();
    this.el.classList.remove('ack', 'leaving', 'leaving-fast');
    void this.el.offsetWidth;
    this.el.classList.add('show');

    if (typeof this.bar.animate === 'function') {
      const anim = this.bar.animate(
        [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration: SKY_HINT_DURATION_MS, easing: 'linear', fill: 'forwards' },
      );
      this.anim = anim;
      anim.onfinish = () => {
        if (this.anim !== anim) return;
        this.anim = null;
        if (this.ctrl.onTimeout()) this.beginExit(false);
      };
    } else {
      this.later(() => {
        if (this.ctrl.onTimeout()) this.beginExit(false);
      }, SKY_HINT_DURATION_MS);
    }
  }

  private beginExit(fast: boolean): void {
    this.el.classList.remove('show');
    this.el.classList.add(fast ? 'leaving-fast' : 'leaving');
    this.later(() => {
      this.el.classList.remove('ack', 'leaving', 'leaving-fast');
      this.cancelAnim();
    }, fast ? 200 : 240);
  }

  private freezeBar(): void {
    if (!this.anim) return;
    this.anim.onfinish = null;
    this.anim.pause();
  }

  private cancelAnim(): void {
    if (!this.anim) return;
    this.anim.onfinish = null;
    this.anim.cancel();
    this.anim = null;
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
  }

  /** Test / debug introspection. */
  get debugState(): { state: SkyHintState; visible: boolean; paused: boolean } {
    return {
      state: this.ctrl.state,
      visible: this.el.classList.contains('show'),
      paused: this.ctrl.paused,
    };
  }
}
