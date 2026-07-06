import { listSaves, loadGame } from '../core/saves.js';

/**
 * <title-scene> — the engine's first-ever "Title" scene-stack entry (GDD
 * 2.2's spine diagram opens with `[Title] → [Map] → ...`, but nothing had
 * actually implemented it before now — boot() went straight to the map).
 * Minimal by design: title text, New Game, and Continue (only shown if any
 * save slot has data). Dispatches a bubbling, composed `title:choice`
 * CustomEvent with `{ mode: 'new' | 'continue', save? }` and lets main.js
 * own what happens next (state reset vs. state.fromJSON + position), same
 * "components own DOM, they don't reach into app wiring" split as
 * vn-choices/battle-hud.
 */
export class TitleScene extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
                flex-direction: column; gap: 1.5rem; background: #14110f; color: #f2ede4;
                font-family: system-ui, sans-serif; opacity: 1; transition: opacity 420ms ease; }
        :host([leaving]) { opacity: 0; }
        h1 { margin: 0; font-size: clamp(1.6rem, 6vw, 2.6rem); letter-spacing: 0.02em; text-align: center; }
        .menu { display: flex; flex-direction: column; gap: 0.6rem; width: min(80vw, 260px); }
        button { font: inherit; font-size: 1rem; padding: 0.7rem 1rem; border-radius: 8px; border: 1px solid #7a5c3e;
                 background: #2a2118; color: #f2ede4; cursor: pointer; }
        button:hover { background: #3a2d1e; }
        .version { opacity: 0.5; font-size: 0.75rem; }
      </style>
      <h1></h1>
      <div class="menu">
        <button class="new">New Game</button>
        <button class="continue" hidden>Continue</button>
      </div>
      <div class="version"></div>
    `;
    this._title = this._shadow.querySelector('h1');
    this._continueBtn = this._shadow.querySelector('.continue');
    this._versionEl = this._shadow.querySelector('.version');
  }

  /** Provide the parsed project.json before this element is connected. */
  set project(value) {
    this._project = value;
  }

  connectedCallback() {
    this._title.textContent = this._project?.meta?.title ?? 'Hearthlight';
    this._versionEl.textContent = this._project?.meta?.version ? `v${this._project.meta.version}` : '';

    const saves = listSaves().filter((slot) => slot !== 'quick');
    const mostRecent = saves
      .map((slot) => ({ slot, record: loadGame(slot) }))
      .filter((s) => s.record)
      .sort((a, b) => b.record.savedAt - a.record.savedAt)[0];

    if (mostRecent) {
      this._continueBtn.hidden = false;
      this._continueBtn.addEventListener('click', () => this.#choose('continue', mostRecent.record), { once: true });
    }
    this._shadow.querySelector('.new').addEventListener('click', () => this.#choose('new'), { once: true });
  }

  #choose(mode, save) {
    this.setAttribute('leaving', '');
    setTimeout(() => {
      this.dispatchEvent(new CustomEvent('title:choice', { detail: { mode, save }, bubbles: true, composed: true }));
    }, 420);
  }
}

customElements.define('title-scene', TitleScene);
