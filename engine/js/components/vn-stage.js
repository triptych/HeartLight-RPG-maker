/**
 * <vn-stage> — background + up to 3 portrait slots (left/center/right).
 * GDD Part V pillar #2: VN scenes default to dimming the live map 40%
 * behind the textbox rather than cutting away, so conversations feel like
 * they happen in the world. Since the map-scene beneath is never removed
 * from the stack, all vn-stage needs to do for that effect is stay
 * translucent by default; `bg` only opts into an opaque background for
 * interiors/CGs.
 *
 * No portrait art exists yet, so portraits render as labeled placeholder
 * panels (character + expression text) — same placeholder strategy as the
 * map tileset/player in Phase 1.
 */
const SLOTS = ['left', 'center', 'right'];

export class VnStage extends HTMLElement {
  #portraits = new Map(); // who -> slot element

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host {
          position: absolute;
          inset: 0;
          display: block;
          pointer-events: none;
        }
        .dim {
          position: absolute;
          inset: 0;
          background: rgba(10, 8, 7, 0.4);
        }
        .bg {
          position: absolute;
          inset: 0;
          background: #1b1815;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(242, 237, 228, 0.35);
          font: 600 0.85rem/1.4 system-ui, sans-serif;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .bg[hidden] { display: none; }
        .portraits {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          padding: 0 4vw 14vh;
        }
        .slot {
          width: 22vw;
          max-width: 240px;
          min-height: 40vh;
          border-radius: 10px 10px 0 0;
          display: none;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0.5rem;
          font: 600 0.95rem/1.4 system-ui, sans-serif;
          color: #f2ede4;
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.35);
        }
        .slot.visible { display: flex; }
      </style>
      <div class="dim"></div>
      <div class="bg" hidden></div>
      <div class="portraits">
        <div class="slot" data-slot="left"></div>
        <div class="slot" data-slot="center"></div>
        <div class="slot" data-slot="right"></div>
      </div>
    `;
    this._bg = this._shadow.querySelector('.bg');
    this._dim = this._shadow.querySelector('.dim');
    for (const slot of SLOTS) {
      this._shadow.querySelector(`[data-slot="${slot}"]`).__slotName = slot;
    }
  }

  /** @param {string} src — placeholder: just a label, since there's no art yet */
  setBackground(src) {
    if (!src) {
      this._bg.hidden = true;
      this._dim.style.display = '';
      return;
    }
    this._bg.hidden = false;
    this._dim.style.display = 'none';
    this._bg.textContent = src;
  }

  /** @param {{who: string, expr?: string, at?: 'left'|'center'|'right'}} cmd */
  showPortrait({ who, expr, at }) {
    const slotName = SLOTS.includes(at) ? at : 'center';
    const el = this._shadow.querySelector(`[data-slot="${slotName}"]`);
    el.textContent = expr ? `${who}\n(${expr})` : who;
    el.style.background = colorFor(who);
    el.classList.add('visible');
    this.#portraits.set(who, el);
  }

  /** @param {string} who */
  hidePortrait(who) {
    const el = this.#portraits.get(who);
    if (!el) return;
    el.classList.remove('visible');
    this.#portraits.delete(who);
  }

  /** Clear all portraits and background — used when a scene starts fresh. */
  reset() {
    for (const el of this._shadow.querySelectorAll('.slot')) el.classList.remove('visible');
    this.#portraits.clear();
    this.setBackground(null);
  }
}

/** Deterministic placeholder color per character name, so portraits are at least visually distinct. */
function colorFor(who) {
  let hash = 0;
  for (let i = 0; i < (who || '').length; i++) hash = (hash * 31 + who.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 35%, 28%)`;
}

customElements.define('vn-stage', VnStage);
