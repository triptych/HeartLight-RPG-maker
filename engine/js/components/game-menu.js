import { loadGame } from '../core/saves.js';

const NAMED_SLOTS = ['slot1', 'slot2', 'slot3'];
const SLOT_LABELS = { slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3', auto: 'Autosave' };

/**
 * <game-menu> — GDD 2.1's `game-menu.js (<game-menu>: party/items/save)`;
 * Phase 3.5 only builds the save/load slice (party/items menus need
 * inventory UI that doesn't exist yet). Opened over the map with Escape,
 * same "scene stacks, pauses what's beneath" pattern as VN/Battle.
 *
 * This component only *reads* slots (via saves.js's listSaves/loadGame) to
 * render labels — it doesn't know how to build or apply a snapshot, since
 * that needs the live map's position, which only the host (main.js) has a
 * reference to. Every action instead dispatches a bubbling, composed
 * CustomEvent (`game-menu:save`, `:load`, `:download`, `:load-file`,
 * `:resume`) and waits for the host to call `refresh()` afterward — same
 * split as title-scene's `title:choice`.
 */
export class GameMenu extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
                background: rgba(10, 8, 7, 0.75); font-family: system-ui, sans-serif; color: #f2ede4; }
        .panel { background: #241f1a; border: 1px solid #7a5c3e; border-radius: 10px; padding: 1.25rem;
                 width: min(92vw, 420px); max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem; }
        h2 { margin: 0; font-size: 1.1rem; }
        .slot-row { display: flex; align-items: center; gap: 0.5rem; background: rgba(0,0,0,0.25); border-radius: 6px; padding: 0.4rem 0.6rem; }
        .slot-name { min-width: 72px; font-weight: 600; font-size: 0.9rem; }
        .slot-info { flex: 1; font-size: 0.8rem; opacity: 0.8; }
        button { font: inherit; font-size: 0.85rem; padding: 0.4rem 0.7rem; border-radius: 6px; border: 1px solid #7a5c3e;
                 background: #3a2d1e; color: #f2ede4; cursor: pointer; }
        button:disabled { opacity: 0.4; cursor: default; }
        button:hover:not(:disabled) { background: #4a3626; }
        .row { display: flex; gap: 0.5rem; }
        .resume { align-self: stretch; }
      </style>
      <div class="panel">
        <h2>Save</h2>
        <div class="save-slots"></div>
        <h2>Load</h2>
        <div class="load-slots"></div>
        <div class="row">
          <button class="download">Download Save</button>
          <button class="load-file">Load Save File</button>
          <input type="file" class="file-input" accept="application/json" hidden />
        </div>
        <button class="resume">Resume</button>
      </div>
    `;
    this._saveSlotsEl = this._shadow.querySelector('.save-slots');
    this._loadSlotsEl = this._shadow.querySelector('.load-slots');
    this._fileInput = this._shadow.querySelector('.file-input');

    this._shadow.querySelector('.resume').addEventListener('click', () => this.#emit('resume'));
    this._shadow.querySelector('.download').addEventListener('click', () => this.#emit('download'));
    this._shadow.querySelector('.load-file').addEventListener('click', () => this._fileInput.click());
    this._fileInput.addEventListener('change', () => {
      const file = this._fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this.#emit('load-file', { text: String(reader.result) });
      reader.readAsText(file);
    });
  }

  connectedCallback() {
    this.refresh();
  }

  /** Re-render slot labels — call after any save/load so info stays current. */
  refresh() {
    // Each section renders only its own action button — a slot row used to
    // always render *both* Save and Load markup regardless of which list it
    // was in, which meant the Save section had a stray, silently-unbound
    // Load button sitting right next to the real one in the Load section
    // (a shadow-root-wide query would hit the wrong one first). Each
    // section now only ever contains buttons it also binds listeners for.
    this._saveSlotsEl.innerHTML = NAMED_SLOTS.map((slot) => this.#row(slot, 'save')).join('');
    this._loadSlotsEl.innerHTML = [...NAMED_SLOTS, 'auto'].map((slot) => this.#row(slot, 'load')).join('');

    this._saveSlotsEl.querySelectorAll('button[data-save]').forEach((btn) => {
      btn.addEventListener('click', () => this.#emit('save', { slot: btn.dataset.save }));
    });
    this._loadSlotsEl.querySelectorAll('button[data-load]').forEach((btn) => {
      btn.addEventListener('click', () => this.#emit('load', { slot: btn.dataset.load }));
    });
  }

  /** @param {string} slot @param {'save'|'load'} mode */
  #row(slot, mode) {
    const record = loadGame(slot);
    const info = record ? `${record.map ?? '?'} — ${timeAgo(record.savedAt)}` : '(empty)';
    const button = mode === 'save'
      ? `<button data-save="${slot}">Save</button>`
      : `<button data-load="${slot}" ${record ? '' : 'disabled'}>Load</button>`;
    return `
      <div class="slot-row">
        <span class="slot-name">${SLOT_LABELS[slot] ?? slot}</span>
        <span class="slot-info">${info}</span>
        ${button}
      </div>`;
  }

  #emit(action, detail = {}) {
    this.dispatchEvent(new CustomEvent(`game-menu:${action}`, { detail, bubbles: true, composed: true }));
  }
}

function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

customElements.define('game-menu', GameMenu);
