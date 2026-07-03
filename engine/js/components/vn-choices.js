/**
 * <vn-choices> — branching option buttons (GDD 4.1/4.2 `choice` command).
 * Mouse/touch only for now; keyboard navigation is a nice-to-have deferred
 * alongside the broader accessibility pass (GDD Part IX, Phase 9).
 */
export class VnChoices extends HTMLElement {
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
          display: none;
          flex-direction: column;
          gap: 0.5rem;
        }
        :host([open]) { display: flex; }
        button {
          background: rgba(36, 31, 58, 0.92);
          color: #f2ede4;
          border: 1px solid rgba(242, 237, 228, 0.25);
          border-radius: 8px;
          padding: 0.7rem 1rem;
          font: 500 1rem/1.3 system-ui, sans-serif;
          text-align: left;
          cursor: pointer;
        }
        button:hover, button:focus-visible {
          background: rgba(217, 142, 74, 0.85);
          outline: none;
        }
      </style>
      <div class="list"></div>
    `;
    this._list = this._shadow.querySelector('.list');
  }

  /**
   * @param {string[]} optionTexts
   * @returns {Promise<number>} resolves with the chosen option's index
   */
  choose(optionTexts) {
    return new Promise((resolve) => {
      this._list.innerHTML = '';
      optionTexts.forEach((text, i) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.addEventListener('click', () => {
          this.removeAttribute('open');
          resolve(i);
        });
        this._list.appendChild(btn);
      });
      this.setAttribute('open', '');
    });
  }
}

customElements.define('vn-choices', VnChoices);
