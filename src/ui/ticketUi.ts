import type { Ticket } from '../core/ticket';

/**
 * Phase 4 overlays: the contextual interaction prompt, the printed railway-ticket card (slides up, holds, then shrinks
 * into a corner badge that stays while a ticket is held) and the one-line message above it.
 * Pure DOM/CSS, injected here (index.html is not touched). Typography matches the intro: Italiana (Deco display)
 * with Cormorant Garamond for the small print; both fall back to Didot / Georgia offline.
 */

const CARD_W = 560;
const CARD_H = 252;

const INK = '#5d4373'; // violet printing ink
const INK_RED = '#9c3a3a';
const STAMP = '#8a2d52';

const CSS = `
#gm-prompt {
  position: fixed; left: 50%; bottom: 17%; z-index: 12; transform: translate(-50%, 6px); opacity: 0; pointer-events: none;
  display: flex; align-items: center; gap: 0.8rem; white-space: nowrap; padding: 0.55rem 1.35rem 0.55rem 0.8rem;
  background: radial-gradient(ellipse at center, rgba(12, 7, 3, 0.74), rgba(12, 7, 3, 0.5)); border: 1px solid rgba(212, 176, 106, 0.22);
  border-radius: 2px; backdrop-filter: blur(5px);
  font-family: var(--display, 'Italiana', 'Didot', serif); color: var(--gold, #d4b06a); font-size: 1.12rem; letter-spacing: 0.26em; text-transform: uppercase;
  text-shadow: 0 1px 14px rgba(8, 5, 2, 0.85), 0 0 3px rgba(8, 5, 2, 0.6);
  transition: opacity 0.38s ease, transform 0.38s ease;
}
#gm-prompt.show { opacity: 1; transform: translate(-50%, 0); }
#gm-prompt .key {
  display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; letter-spacing: 0; padding-left: 0;
  border: 1px solid var(--gold-dim, rgba(212, 176, 106, 0.55)); background: rgba(14, 9, 4, 0.42); backdrop-filter: blur(2px); font-size: 1rem;
}
#gm-prompt .dot { opacity: 0.55; letter-spacing: 0; }
#gm-prompt.nokey { color: #ecc9ae; font-size: 1rem; letter-spacing: 0.22em; padding: 0.55rem 1.35rem; }
#gm-prompt.nokey .key, #gm-prompt.nokey .dot { display: none; }

#gm-note {
  position: fixed; left: 50%; top: calc(50% + ${CARD_H * 0.5 + 44}px); z-index: 13; transform: translate(-50%, 8px); opacity: 0; pointer-events: none;
  width: min(90vw, 640px); text-align: center; font-family: 'Cormorant Garamond', 'Cormorant', 'Didot', Georgia, serif; font-style: italic; font-weight: 500;
  font-size: clamp(1.05rem, 2.2vw, 1.4rem); letter-spacing: 0.04em; color: #f3dfb0;
  text-shadow: 0 1px 18px rgba(10, 6, 2, 0.95), 0 0 4px rgba(10, 6, 2, 0.7);
  transition: opacity 0.7s ease, transform 0.7s ease;
}
#gm-note.show { opacity: 1; transform: translate(-50%, 0); }
#gm-note.solo { top: auto; bottom: 22%; }

#gm-ticket-card {
  position: fixed; left: 50%; top: 47%; z-index: 14; width: ${CARD_W}px; height: ${CARD_H}px; margin: 0; pointer-events: none;
  transform-origin: 50% 50%; opacity: 0; will-change: transform, opacity;
  filter: drop-shadow(0 22px 34px rgba(8, 4, 1, 0.55)) drop-shadow(0 4px 8px rgba(8, 4, 1, 0.4));
}
#gm-ticket-card.hidden { visibility: hidden; }
.gm-paper {
  position: absolute; inset: 0; border-radius: 7px; overflow: hidden; color: ${INK};
  background:
    radial-gradient(ellipse at 28% 18%, rgba(255, 252, 238, 0.85), rgba(255, 252, 238, 0) 55%),
    radial-gradient(ellipse at 90% 100%, rgba(166, 126, 70, 0.28), rgba(166, 126, 70, 0) 60%),
    linear-gradient(172deg, #f6ecd2 0%, #eddfbd 100%);
  box-shadow: inset 0 0 0 1px rgba(120, 90, 50, 0.35), inset 0 0 38px rgba(139, 101, 52, 0.28);
}
.gm-paper::after { /* paper fibre */
  content: ''; position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply; opacity: 0.55;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.18  0 0 0 0.5 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>");
}
.gm-paper svg.art { position: absolute; inset: 0; width: 100%; height: 100%; }
.gm-f { position: absolute; font-family: 'Cormorant Garamond', 'Cormorant', 'Didot', Georgia, serif; font-weight: 600; text-transform: uppercase; white-space: nowrap; }
.gm-d { font-family: 'Italiana', 'Didot', 'Bodoni 72', serif; font-weight: 400; }
.gm-lbl { font-size: 9.5px; letter-spacing: 0.3em; color: ${INK_RED}; }
.gm-val { font-size: 27px; letter-spacing: 0.06em; color: #3a2a4a; line-height: 1; }
.gm-brand { left: 34px; top: 30px; font-size: 12.5px; letter-spacing: 0.27em; color: ${INK}; }
.gm-class { left: 272px; top: 26px; font-size: 12px; letter-spacing: 0.34em; color: ${INK_RED}; padding: 4px 9px 3px 12px; border: 1px solid ${INK_RED}; }
.gm-stamp { position: absolute; left: 346px; top: 122px; width: 132px; height: 132px; transform: rotate(-13deg); mix-blend-mode: multiply; opacity: 0.82; }
.gm-stub-serial { position: absolute; right: 12px; top: 26px; bottom: 26px; width: 20px; writing-mode: vertical-rl; text-align: center; font-size: 11px; letter-spacing: 0.34em; color: ${INK_RED}; }

#gm-ticket-badge {
  position: fixed; top: 20px; right: 20px; z-index: 11; width: 196px; padding: 9px 12px 9px 14px; border-radius: 3px; pointer-events: none;
  background: linear-gradient(172deg, #f6ecd2, #e9d9b3); color: #3a2a4a; opacity: 0; transform: translateY(-6px);
  box-shadow: 0 0 0 1px rgba(120, 90, 50, 0.45), inset 0 0 0 3px rgba(246, 236, 210, 1), inset 0 0 0 4px ${INK}55, 0 8px 22px rgba(8, 4, 1, 0.42);
  transition: opacity 0.7s ease, transform 0.7s ease; font-family: 'Cormorant Garamond', 'Didot', Georgia, serif; text-transform: uppercase;
}
#gm-ticket-badge.show { opacity: 0.94; transform: none; }
#gm-ticket-badge .t { font-size: 8.5px; letter-spacing: 0.34em; color: ${INK_RED}; font-weight: 600; }
#gm-ticket-badge .d { font-family: 'Italiana', 'Didot', serif; font-size: 15.5px; letter-spacing: 0.08em; line-height: 1.15; margin: 2px 0 3px; }
#gm-ticket-badge .p { font-size: 11px; letter-spacing: 0.2em; font-weight: 600; color: ${INK}; }
@media (prefers-reduced-motion: reduce) { #gm-prompt, #gm-note, #gm-ticket-badge { transition-duration: 0.01s; } }
`;

function wavePath(kind: 'h' | 'v', fixed: number, length: number, start: number, amp: number, wl: number, phase: number): string {
  const pts: string[] = [];
  const n = Math.ceil(length / 2);
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * length;
    const w = amp * Math.sin(((u / wl) + phase) * Math.PI * 2);
    pts.push(kind === 'h' ? `${(start + u).toFixed(1)},${(fixed + w).toFixed(2)}` : `${(fixed + w).toFixed(2)},${(start + u).toFixed(1)}`);
  }
  return `M${pts.join('L')}`;
}

/** Guilloche-style engine-turned border, a faint rosette and the perforation, as one SVG string. */
function cardArt(): string {
  const W = CARD_W;
  const H = CARD_H;
  const inset = 11;
  const paths: string[] = [];
  for (let k = 0; k < 3; k++) {
    const ph = k / 3;
    const col = k === 1 ? INK_RED : INK;
    const op = k === 1 ? 0.55 : 0.6;
    const attrs = `fill="none" stroke="${col}" stroke-opacity="${op}" stroke-width="0.7"`;
    paths.push(`<path ${attrs} d="${wavePath('h', inset + 3, W - 2 * inset - 6, inset + 3, 2.6, 11, ph)}"/>`);
    paths.push(`<path ${attrs} d="${wavePath('h', H - inset - 3, W - 2 * inset - 6, inset + 3, 2.6, 11, ph + 0.5)}"/>`);
    paths.push(`<path ${attrs} d="${wavePath('v', inset + 3, H - 2 * inset - 6, inset + 3, 2.6, 11, ph)}"/>`);
    paths.push(`<path ${attrs} d="${wavePath('v', W - inset - 3, H - 2 * inset - 6, inset + 3, 2.6, 11, ph + 0.5)}"/>`);
  }
  // rosette (rotated ellipses) behind the destination
  const rosette: string[] = [];
  const n = 30;
  for (let i = 0; i < n; i++) {
    rosette.push(`<ellipse cx="0" cy="0" rx="86" ry="${22 + (i % 2) * 10}" transform="rotate(${((i * 180) / n).toFixed(2)})"/>`);
  }
  const px = 418; // perforation x
  return `<svg class="art" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${inset}" y="${inset}" width="${W - 2 * inset}" height="${H - 2 * inset}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-opacity="0.8"/>
    <rect x="${inset - 4}" y="${inset - 4}" width="${W - 2 * inset + 8}" height="${H - 2 * inset + 8}" fill="none" stroke="${INK}" stroke-width="0.5" stroke-opacity="0.55"/>
    ${paths.join('')}
    <g transform="translate(206 138)" fill="none" stroke="${INK}" stroke-opacity="0.11" stroke-width="0.6">${rosette.join('')}</g>
    <line x1="${px}" y1="${inset + 6}" x2="${px}" y2="${H - inset - 6}" stroke="${INK}" stroke-opacity="0.65" stroke-width="1" stroke-dasharray="1.5 5" stroke-linecap="round"/>
    <circle cx="${px}" cy="${inset - 1}" r="7" fill="#1c130c" fill-opacity="0.0"/>
  </svg>`;
}

function stampSvg(time: string): string {
  return `<svg class="gm-stamp" viewBox="0 0 132 132" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="gm-ink" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="9" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 1.75" result="holes"/>
        <feComposite in="SourceGraphic" in2="holes" operator="in" result="rough"/>
        <feDisplacementMap in="rough" in2="n" scale="1.3"/>
      </filter>
      <path id="gm-stamp-arc" d="M 66,66 m -45,0 a 45,45 0 1,1 90,0 a 45,45 0 1,1 -90,0"/>
    </defs>
    <g filter="url(#gm-ink)" fill="none" stroke="${STAMP}" stroke-width="2.2">
      <circle cx="66" cy="66" r="60"/><circle cx="66" cy="66" r="55" stroke-width="0.9"/><circle cx="66" cy="66" r="31" stroke-width="0.9"/>
      <text fill="${STAMP}" stroke="none" font-family="Cormorant Garamond, Didot, Georgia, serif" font-weight="700" font-size="10.3" letter-spacing="2.4">
        <textPath href="#gm-stamp-arc" startOffset="0">GRAND MERIDIAN · ISSUED · FIRST CLASS ·</textPath>
      </text>
      <text x="66" y="63" text-anchor="middle" fill="${STAMP}" stroke="none" font-family="Italiana, Didot, serif" font-size="17">${time}</text>
      <text x="66" y="77" text-anchor="middle" fill="${STAMP}" stroke="none" font-family="Cormorant Garamond, Didot, serif" font-weight="700" font-size="7.5" letter-spacing="2">VALID</text>
    </g>
  </svg>`;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function cardHtml(t: Ticket): string {
  const dest = t.destination.toUpperCase();
  const size = Math.max(21, Math.min(40, 320 / (dest.length * 0.6)));
  const car = String(t.car);
  const seat = String(t.seat).padStart(2, '0');
  return `<div class="gm-paper">
    ${cardArt()}
    <div class="gm-f gm-d gm-brand">Grand Meridian Limited</div>
    <div class="gm-f gm-class">First Class</div>
    <div class="gm-f gm-lbl" style="left:36px;top:64px">From</div>
    <div class="gm-f gm-d" style="left:36px;top:78px;font-size:17px;letter-spacing:0.2em;color:#3a2a4a">Grand Meridian</div>
    <div class="gm-f gm-lbl" style="left:36px;top:110px">To</div>
    <div class="gm-f gm-d" style="left:34px;top:122px;font-size:${size.toFixed(1)}px;letter-spacing:0.06em;color:#2c1d3c">${esc(dest)}</div>
    <div class="gm-f" style="left:36px;top:182px"><div class="gm-lbl">Platform</div><div class="gm-val gm-d" style="margin-top:5px">${t.platform}</div></div>
    <div class="gm-f" style="left:122px;top:182px"><div class="gm-lbl">Departs</div><div class="gm-val gm-d" style="margin-top:5px">${esc(t.departs)}</div></div>
    <div class="gm-f" style="left:218px;top:182px"><div class="gm-lbl">Car</div><div class="gm-val gm-d" style="margin-top:5px">${car}</div></div>
    <div class="gm-f" style="left:282px;top:182px"><div class="gm-lbl">Seat</div><div class="gm-val gm-d" style="margin-top:5px">${seat}</div></div>
    <div class="gm-f gm-lbl" style="left:436px;top:34px;line-height:1.7;color:${INK}">Admit<br>One</div>
    <div class="gm-f gm-d" style="left:436px;top:92px;font-size:15px;letter-spacing:0.08em;color:#3a2a4a;line-height:1.35;white-space:normal;width:96px">${esc(dest)}</div>
    <div class="gm-f gm-lbl gm-stub-serial" style="right:10px">${esc(t.serial)}</div>
    ${stampSvg(esc(t.departs))}
  </div>`;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, id: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.id = id;
  document.body.appendChild(e);
  return e;
}

type CardState = 'idle' | 'entering' | 'holding' | 'leaving';

export class TicketUI {
  private readonly prompt: HTMLDivElement;
  private readonly note: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly badge: HTMLDivElement;
  private state: CardState = 'idle';
  private timers: number[] = [];
  private promptKey = '';

  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap';
    document.head.appendChild(font);

    this.prompt = make('div', 'gm-prompt');
    this.note = make('div', 'gm-note');
    this.card = make('div', 'gm-ticket-card');
    this.card.classList.add('hidden');
    this.card.setAttribute('aria-hidden', 'true');
    this.badge = make('div', 'gm-ticket-badge');
    window.addEventListener('resize', () => {
      if (this.state === 'holding') this.card.style.transform = this.restTransform();
    });
  }

  /** True while the big ticket card is on screen (entering or holding): E / click dismisses it. */
  get cardVisible(): boolean {
    return this.state === 'entering' || this.state === 'holding';
  }

  /** Contextual prompt. `key`: show the E key cap (an actionable prompt); `text` null hides. */
  setPrompt(text: string | null, key: boolean): void {
    const sig = text === null ? '' : `${key ? 'k' : 'n'}|${text}`;
    if (sig === this.promptKey) return;
    this.promptKey = sig;
    if (text === null) {
      this.prompt.classList.remove('show');
      return;
    }
    this.prompt.classList.toggle('nokey', !key);
    this.prompt.innerHTML = `<span class="key">E</span><span class="dot">·</span><span class="txt">${esc(text)}</span>`;
    if (!key) this.prompt.innerHTML = `<span class="txt">${esc(text)}</span>`;
    this.prompt.classList.add('show');
  }

  private scale(): number {
    return Math.min(1.25, (window.innerWidth * 0.92) / CARD_W, (window.innerHeight * 0.6) / CARD_H);
  }

  private restTransform(): string {
    return `translate(-50%, -50%) rotate(-1.4deg) scale(${this.scale().toFixed(3)})`;
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }

  /** The message, then the printed ticket sliding up; it holds ~4.5 s (or until dismiss()) and shrinks to the badge. */
  showTicket(t: Ticket, message = 'The window is unattended. A ticket is already waiting for you.'): void {
    this.clearTimers();
    this.badge.classList.remove('show');
    const s = this.scale();
    this.card.innerHTML = cardHtml(t);
    this.card.classList.remove('hidden');
    this.card.style.transition = 'none';
    this.card.style.opacity = '0';
    this.card.style.transform = `translate(-50%, ${Math.round(window.innerHeight * 0.75)}px) rotate(5deg) scale(${(s * 0.94).toFixed(3)})`;
    void this.card.offsetWidth; // commit the start pose
    this.state = 'entering';
    this.setBadge(t); // fills the badge; it stays hidden until the card has flown to it
    this.note.textContent = message;
    this.note.classList.remove('solo');
    this.note.classList.add('show');
    this.setPrompt(null, false);

    this.later(() => {
      this.card.style.transition = 'transform 1.25s cubic-bezier(0.16, 0.84, 0.24, 1), opacity 0.5s ease';
      this.card.style.opacity = '1';
      this.card.style.transform = this.restTransform();
    }, 700);
    this.later(() => {
      if (this.state === 'entering') this.state = 'holding';
    }, 700 + 1100);
    this.later(() => this.dismiss(), 700 + 1250 + 4500);
  }

  /** Shrink the card into the corner badge now (no-op unless it is showing). */
  dismiss(): void {
    if (this.state !== 'entering' && this.state !== 'holding') return;
    this.clearTimers();
    this.state = 'leaving';
    this.note.classList.remove('show');
    // Fly toward the badge: translate the card's centre onto the badge centre, shrinking.
    const b = this.badge.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.47;
    const sc = (b.width / CARD_W) * 0.95;
    this.card.style.transition = 'transform 0.95s cubic-bezier(0.55, 0, 0.25, 1), opacity 0.35s ease 0.6s';
    this.card.style.transform = `translate(calc(-50% + ${(bx - cx).toFixed(1)}px), calc(-50% + ${(by - cy).toFixed(1)}px)) rotate(0deg) scale(${sc.toFixed(3)})`;
    this.card.style.opacity = '0';
    this.later(() => this.badge.classList.add('show'), 650);
    this.later(() => {
      this.card.classList.add('hidden');
      this.state = 'idle';
    }, 1000);
  }

  /** Corner badge: persistent while a ticket is held. */
  setBadge(t: Ticket | null): void {
    if (!t) {
      this.badge.classList.remove('show');
      this.badge.innerHTML = '';
      return;
    }
    this.badge.innerHTML = `<div class="t">First Class · ${esc(t.serial)}</div><div class="d">${esc(t.destination)}</div><div class="p">Platform ${t.platform} · ${esc(t.departs)}</div>`;
    // While the big card is up (or sliding in) the badge appears only after it lands.
    if (this.state === 'idle') this.badge.classList.add('show');
  }

  /** Test / debug introspection. */
  get debugState(): { card: CardState; badge: boolean; prompt: string } {
    return { card: this.state, badge: this.badge.classList.contains('show'), prompt: this.prompt.classList.contains('show') ? this.prompt.textContent ?? '' : '' };
  }
}
