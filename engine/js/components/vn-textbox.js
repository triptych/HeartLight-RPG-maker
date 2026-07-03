/**
 * <vn-textbox> — name plate + typewriter text reveal + click/key to
 * complete-then-advance (GDD 4.1). Backlog, auto mode, and skip-read-text
 * mode are explicitly deferred — not needed for the Phase 2 exit test and
 * each is its own small feature to design properly later.
 */
export class VnTextbox extends HTMLElement {
  #resolveAdvance = null;
  #typing = false;
  #fullText = '';
  #cps = 40;
  #typeTimer = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host {
          position: absolute;
          left: 4vw;
          right: 4vw;
          bottom: 3vh;
          display: block;
        }
        .box {
          background: rgba(20, 17, 15, 0.92);
          border: 1px solid rgba(242, 237, 228, 0.2);
          border-radius: 10px;
          padding: 1rem 1.25rem;
          min-height: 5rem;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          cursor: pointer;
        }
        .name {
          font: 700 0.9rem/1 system-ui, sans-serif;
          color: var(--vn-name-color, #d98e4a);
          margin-bottom: 0.4rem;
          min-height: 0.9rem;
        }
        .text {
          font: 500 1.05rem/1.5 system-ui, sans-serif;
          color: #f2ede4;
          white-space: pre-wrap;
        }
        .advance {
          text-align: right;
          font-size: 0.8rem;
          opacity: 0.5;
          margin-top: 0.3rem;
        }
      </style>
      <div class="box">
        <div class="name"></div>
        <div class="text"></div>
        <div class="advance">▼</div>
      </div>
    `;
    this._nameEl = this._shadow.querySelector('.name');
    this._textEl = this._shadow.querySelector('.text');
    this._box = this._shadow.querySelector('.box');
  }

  connectedCallback() {
    this._box.addEventListener('click', this.#onAdvance);
    this._keyHandler = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') this.#onAdvance();
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  disconnectedCallback() {
    this._box.removeEventListener('click', this.#onAdvance);
    window.removeEventListener('keydown', this._keyHandler);
    if (this.#typeTimer) clearTimeout(this.#typeTimer);
  }

  /**
   * @param {string} who
   * @param {string} text
   * @returns {Promise<void>} resolves once the player advances past this line
   */
  say(who, text) {
    return new Promise((resolve) => {
      this._nameEl.textContent = who ?? '';
      this.#fullText = text ?? '';
      this._textEl.textContent = '';
      this.#typing = true;
      this.#resolveAdvance = resolve;
      this.#typeStep(0);
    });
  }

  #typeStep = (i) => {
    if (!this.#typing) return;
    if (i >= this.#fullText.length) {
      this.#typing = false;
      return;
    }
    this._textEl.textContent = this.#fullText.slice(0, i + 1);
    this.#typeTimer = setTimeout(() => this.#typeStep(i + 1), 1000 / this.#cps);
  };

  #onAdvance = () => {
    if (this.#typing) {
      if (this.#typeTimer) clearTimeout(this.#typeTimer);
      this.#typing = false;
      this._textEl.textContent = this.#fullText;
      return;
    }
    const resolve = this.#resolveAdvance;
    this.#resolveAdvance = null;
    resolve?.();
  };
}

customElements.define('vn-textbox', VnTextbox);
