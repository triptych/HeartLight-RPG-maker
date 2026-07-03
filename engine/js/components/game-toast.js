import { bus } from '../events/bus.js';

/**
 * <game-toast> — transient message popup for item-gets, quest updates, and
 * (for now) map-event flavor text. Lives once at the app-shell level, not
 * on the scene stack, so it survives scene transitions. Other code never
 * references this element directly; it triggers messages by emitting
 * `toast:show` on the bus (GDD 2.2: components own their DOM, the bus owns
 * communication).
 */
export class GameToast extends HTMLElement {
  #queue = [];
  #showing = false;
  #timer = null;
  #unsubscribe = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          left: 50%;
          bottom: 4.5rem;
          transform: translateX(-50%) translateY(12px);
          opacity: 0;
          transition: opacity 200ms ease, transform 200ms ease;
          pointer-events: none;
          z-index: 2000;
        }
        :host([visible]) {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
        .toast {
          background: rgba(20, 17, 15, 0.92);
          color: #f2ede4;
          border: 1px solid rgba(242, 237, 228, 0.2);
          border-radius: 8px;
          padding: 0.6rem 1rem;
          font: 500 0.95rem/1.4 system-ui, sans-serif;
          max-width: 28rem;
          text-align: center;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        }
      </style>
      <div class="toast"></div>
    `;
    this._text = this._shadow.querySelector('.toast');
  }

  connectedCallback() {
    this.#unsubscribe = bus.on('toast:show', (e) => this.#enqueue(e.detail));
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
    if (this.#timer) clearTimeout(this.#timer);
  }

  #enqueue({ text, duration = 2600 }) {
    this.#queue.push({ text, duration });
    if (!this.#showing) this.#advance();
  }

  #advance() {
    const next = this.#queue.shift();
    if (!next) {
      this.#showing = false;
      return;
    }
    this.#showing = true;
    this._text.textContent = next.text;
    this.setAttribute('visible', '');
    this.#timer = setTimeout(() => {
      this.removeAttribute('visible');
      this.#timer = setTimeout(() => this.#advance(), 200);
    }, next.duration);
  }
}

customElements.define('game-toast', GameToast);
