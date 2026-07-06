import { bus } from '../events/bus.js';
import { input } from '../core/input.js';
import { sceneStack } from '../core/scene-stack.js';

const DPAD = [
  { action: 'up', label: '▲', area: 'up' },
  { action: 'left', label: '◀', area: 'left' },
  { action: 'right', label: '▶', area: 'right' },
  { action: 'down', label: '▼', area: 'down' },
];

/**
 * <touch-controls> — an on-screen d-pad + interact button so map movement
 * works without a keyboard (GDD 1.3: "keyboard/mouse first, touch
 * tolerated"). VN choices and the battle/menu command buttons are already
 * real DOM `<button>`s, so taps work on them for free; this component only
 * covers the one thing that had zero touch affordance — walking around a
 * map — so it hides itself outside Map scenes instead of cluttering VN/
 * Battle/Menu/Title.
 *
 * Hidden entirely on fine-pointer/mouse-primary devices via a CSS media
 * query (`(hover: hover) and (pointer: fine)`) rather than one-time JS
 * feature detection, so a hybrid device (touch laptop with a mouse
 * attached) reacts correctly if its input mode changes.
 *
 * Uses Pointer Events (not touch events) so mouse/touch/pen all work the
 * same way, with pointer capture so a finger sliding off a button still
 * releases cleanly instead of leaving a direction stuck "down".
 */
export class TouchControls extends HTMLElement {
  #unsubs = [];

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host {
          position: fixed; inset: 0; pointer-events: none; z-index: 900;
          padding-bottom: env(safe-area-inset-bottom, 0);
        }
        @media (hover: hover) and (pointer: fine) { :host { display: none; } }
        .dpad {
          position: absolute; left: 1rem; bottom: 1rem; width: 132px; height: 132px;
          display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
          pointer-events: auto;
        }
        .dpad button { grid-column: 2; grid-row: 2; }
        .dpad button[data-area="up"] { grid-column: 2; grid-row: 1; }
        .dpad button[data-area="left"] { grid-column: 1; grid-row: 2; }
        .dpad button[data-area="right"] { grid-column: 3; grid-row: 2; }
        .dpad button[data-area="down"] { grid-column: 2; grid-row: 3; }
        button {
          font-size: 1.3rem; color: #f2ede4; background: rgba(36, 31, 26, 0.55);
          border: 1px solid rgba(122, 92, 62, 0.7); border-radius: 10px; touch-action: none;
          user-select: none; -webkit-user-select: none;
        }
        .interact {
          position: absolute; right: 1.2rem; bottom: 1.4rem; width: 68px; height: 68px;
          border-radius: 50%; pointer-events: auto; font-size: 0.95rem;
        }
      </style>
      <div class="dpad">
        ${DPAD.map((d) => `<button data-area="${d.area}" data-action="${d.action}">${d.label}</button>`).join('')}
      </div>
      <button class="interact" data-action="interact">●</button>
    `;
  }

  connectedCallback() {
    this._shadow.querySelectorAll('button[data-action]').forEach((btn) => {
      const action = btn.dataset.action;
      const press = (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); input.simulateDown(action); };
      const release = (e) => { input.simulateUp(action); };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    });

    this.#unsubs.push(bus.on('scene:push', () => this.#syncVisibility()));
    this.#unsubs.push(bus.on('scene:pop', () => this.#syncVisibility()));
    this.#syncVisibility();
  }

  disconnectedCallback() {
    this.#unsubs.forEach((off) => off());
    this.#unsubs = [];
  }

  #syncVisibility() {
    this.hidden = sceneStack.top?.type !== 'Map';
  }
}

customElements.define('touch-controls', TouchControls);
