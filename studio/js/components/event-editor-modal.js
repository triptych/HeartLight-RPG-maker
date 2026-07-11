import './command-list-editor.js';

/**
 * <event-editor-modal> — GDD 6.1's "Event editor modal: sprite, trigger,
 * pages with condition rows, and a command list editor." Edits one map
 * event object in place (id/x/y/trigger/solid + an array of pages, each
 * with optional conditions and a command list). "Sprite" isn't a real
 * field yet — events don't have a sprite reference anywhere in the Part
 * VII schema or the runtime (which draws a placeholder marker for any
 * solid/action event, see map-mode.js's #drawEvents) — so this omits it
 * rather than inventing a field the engine wouldn't read.
 */
export class EventEditorModal extends HTMLElement {
  #event = null;
  #resolve = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
                background: rgba(10, 8, 7, 0.65); z-index: 1500; font-family: system-ui, sans-serif; color: #f2ede4; }
        :host([open]) { display: flex; }
        .box { background: #1c1712; border: 1px solid #4a3626; border-radius: 10px; padding: 1rem;
               width: min(94vw, 640px); max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; }
        h2 { margin: 0; font-size: 1rem; }
        .row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .row > div { display: flex; flex-direction: column; gap: 0.2rem; }
        label { font-size: 0.75rem; opacity: 0.75; }
        input, select { font: inherit; padding: 0.35rem 0.5rem; border-radius: 5px; border: 1px solid #4a3626;
          background: #14110f; color: #f2ede4; }
        .checkbox-row { display: flex; align-items: center; gap: 0.4rem; }
        .page { border: 1px solid #3a2d1e; border-radius: 8px; padding: 0.6rem; }
        .page h3 { margin: 0 0 0.4rem; font-size: 0.85rem; }
        .cond-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
        .footer { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.4rem; }
        .footer .right { display: flex; gap: 0.5rem; }
        button { font: inherit; font-size: 0.85rem; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #4a3626;
          background: #2a2118; color: #f2ede4; cursor: pointer; }
        button:hover { background: #3a2d1e; }
        button.primary { background: #6b4a2a; }
        button.danger { background: #6b2a2a; }
      </style>
      <div class="box">
        <h2>Event</h2>
        <div class="row">
          <div><label>Id</label><input class="f-id" type="text" /></div>
          <div><label>X</label><input class="f-x" type="number" style="width:5em" /></div>
          <div><label>Y</label><input class="f-y" type="number" style="width:5em" /></div>
          <div><label>Trigger</label><select class="f-trigger"><option>action</option><option>touch</option><option>auto</option><option>parallel</option></select></div>
          <div class="checkbox-row" style="align-self:flex-end;"><input class="f-solid" type="checkbox" id="solid-cb" /><label for="solid-cb">Solid</label></div>
        </div>
        <div class="pages"></div>
        <button class="add-page">+ Add page</button>
        <div class="footer">
          <button class="delete danger">Delete event</button>
          <div class="right">
            <button class="cancel">Cancel</button>
            <button class="save primary">Save</button>
          </div>
        </div>
      </div>
    `;
    this._pagesEl = this._shadow.querySelector('.pages');
    this._shadow.querySelector('.add-page').addEventListener('click', () => this.#addPage());
    this._shadow.querySelector('.save').addEventListener('click', () => this.#finish('save'));
    this._shadow.querySelector('.cancel').addEventListener('click', () => this.#finish('cancel'));
    this._shadow.querySelector('.delete').addEventListener('click', () => this.#finish('delete'));
  }

  /**
   * @param {object} event the event to edit — mutated in place if the user saves
   * @returns {Promise<'save'|'cancel'|'delete'>}
   */
  open(event) {
    this.#event = event;
    this._shadow.querySelector('.f-id').value = event.id;
    this._shadow.querySelector('.f-x').value = event.x;
    this._shadow.querySelector('.f-y').value = event.y;
    this._shadow.querySelector('.f-trigger').value = event.trigger;
    this._shadow.querySelector('.f-solid').checked = !!event.solid;
    event.pages = event.pages || [{ commands: [] }];
    this.#renderPages();
    this.setAttribute('open', '');
    return new Promise((resolve) => { this.#resolve = resolve; });
  }

  #renderPages() {
    this._pagesEl.innerHTML = this.#event.pages.map((_, i) => `
      <div class="page" data-i="${i}">
        <h3>Page ${i + 1} ${this.#event.pages.length > 1 ? `<button class="del-page" data-i="${i}" style="float:right;">✕</button>` : ''}</h3>
        <div class="cond-row">
          <div><label>Requires flag</label><input class="cond-flag" data-i="${i}" type="text" /></div>
          <div><label>Requires flag = false</label><input class="cond-flagnot" data-i="${i}" type="text" /></div>
        </div>
        <div class="cmds" data-i="${i}"></div>
      </div>
    `).join('');

    this.#event.pages.forEach((page, i) => {
      const flagInput = this._pagesEl.querySelector(`.cond-flag[data-i="${i}"]`);
      const flagNotInput = this._pagesEl.querySelector(`.cond-flagnot[data-i="${i}"]`);
      flagInput.value = page.conditions?.flag ?? '';
      flagNotInput.value = page.conditions?.flagNot ?? '';
      flagInput.addEventListener('input', () => this.#setCondition(page, 'flag', flagInput.value));
      flagNotInput.addEventListener('input', () => this.#setCondition(page, 'flagNot', flagNotInput.value));

      const delBtn = this._pagesEl.querySelector(`.del-page[data-i="${i}"]`);
      delBtn?.addEventListener('click', () => { this.#event.pages.splice(i, 1); this.#renderPages(); });

      page.commands = page.commands || [];
      const cmdsEl = this._pagesEl.querySelector(`.cmds[data-i="${i}"]`);
      const cmdEditor = document.createElement('command-list-editor');
      cmdEditor.commands = page.commands;
      cmdsEl.appendChild(cmdEditor);
    });
  }

  #setCondition(page, key, value) {
    if (!value) {
      if (page.conditions) delete page.conditions[key];
      if (page.conditions && Object.keys(page.conditions).length === 0) delete page.conditions;
      return;
    }
    page.conditions = page.conditions || {};
    page.conditions[key] = value;
  }

  #addPage() {
    this.#event.pages.push({ commands: [] });
    this.#renderPages();
  }

  #finish(action) {
    if (action === 'save') {
      this.#event.id = this._shadow.querySelector('.f-id').value;
      this.#event.x = Number(this._shadow.querySelector('.f-x').value);
      this.#event.y = Number(this._shadow.querySelector('.f-y').value);
      this.#event.trigger = this._shadow.querySelector('.f-trigger').value;
      this.#event.solid = this._shadow.querySelector('.f-solid').checked;
    }
    this.removeAttribute('open');
    this.#resolve?.(action);
    this.#resolve = null;
  }
}

customElements.define('event-editor-modal', EventEditorModal);
