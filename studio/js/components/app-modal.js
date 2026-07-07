/**
 * <app-modal> — generic modal dialog (GDD 6.0 scaffold: `<app-layout>`,
 * `<app-tabs>`, `<app-modal>`). Used for "new entity id" prompts and
 * JSON-parse-error alerts instead of native `prompt()`/`alert()`, so the
 * UI stays consistent and — more importantly — still works once Playtest
 * (Phase 6) puts this app inside contexts where native dialogs get weird
 * (e.g. some iframe embeddings suppress them entirely).
 */
export class AppModal extends HTMLElement {
  #resolve = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
                background: rgba(10, 8, 7, 0.6); z-index: 2000; font-family: system-ui, sans-serif; }
        :host([open]) { display: flex; }
        .box { background: #241f1a; border: 1px solid #7a5c3e; border-radius: 10px; padding: 1.25rem;
               width: min(90vw, 380px); color: #f2ede4; display: flex; flex-direction: column; gap: 0.8rem; }
        .message { white-space: pre-wrap; }
        input { font: inherit; padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid #7a5c3e;
                background: #14110f; color: #f2ede4; }
        .row { display: flex; gap: 0.5rem; justify-content: flex-end; }
        button { font: inherit; padding: 0.4rem 0.9rem; border-radius: 6px; border: 1px solid #7a5c3e;
                 background: #3a2d1e; color: #f2ede4; cursor: pointer; }
        button:hover { background: #4a3626; }
        button.primary { background: #6b4a2a; }
      </style>
      <div class="box">
        <div class="message"></div>
        <input hidden />
        <div class="row">
          <button class="cancel" hidden>Cancel</button>
          <button class="ok primary">OK</button>
        </div>
      </div>
    `;
    this._messageEl = this._shadow.querySelector('.message');
    this._inputEl = this._shadow.querySelector('input');
    this._cancelBtn = this._shadow.querySelector('.cancel');
    this._okBtn = this._shadow.querySelector('.ok');

    this._okBtn.addEventListener('click', () => this.#finish(this._inputEl.hidden ? true : this._inputEl.value));
    this._cancelBtn.addEventListener('click', () => this.#finish(this._inputEl.hidden ? false : null));
  }

  /** @param {string} message @returns {Promise<void>} */
  alert(message) {
    this._messageEl.textContent = message;
    this._inputEl.hidden = true;
    this._cancelBtn.hidden = true;
    return this.#open();
  }

  /** @param {string} message @returns {Promise<boolean>} */
  confirm(message) {
    this._messageEl.textContent = message;
    this._inputEl.hidden = true;
    this._cancelBtn.hidden = false;
    return this.#open();
  }

  /** @param {string} message @param {string} [defaultValue] @returns {Promise<string|null>} */
  prompt(message, defaultValue = '') {
    this._messageEl.textContent = message;
    this._inputEl.hidden = false;
    this._inputEl.value = defaultValue;
    this._cancelBtn.hidden = false;
    const result = this.#open();
    queueMicrotask(() => this._inputEl.focus());
    return result;
  }

  #open() {
    this.setAttribute('open', '');
    return new Promise((resolve) => { this.#resolve = resolve; });
  }

  #finish(value) {
    this.removeAttribute('open');
    this.#resolve?.(value);
    this.#resolve = null;
  }
}

customElements.define('app-modal', AppModal);
