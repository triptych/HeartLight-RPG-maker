import './app-tabs.js';
import './app-modal.js';
import './entity-editor.js';
import { bus } from '../events/bus.js';
import { openProject, blankProject, projectIoSupportsFSAccess } from '../core/project-io.js';
import { SCHEMAS, TAB_ORDER } from '../data/schemas.js';

const TOP_TABS = ['Database', 'Maps', 'Scenes', 'Assets', 'Playtest'];

/**
 * <app-layout> — the Studio shell (GDD 6.0/6.1): header with Open/Save,
 * the top-level tab strip (only "Database" is live this phase — Maps is
 * Phase 5, Scenes/Playtest are Phase 6, Assets is later), and inside
 * Database a second `<app-tabs>` strip for the 11 Part VII collections,
 * all driven by one persistent `<entity-editor>` whose entity type gets
 * swapped rather than recreating the editor per tab.
 */
export class AppLayout extends HTMLElement {
  #project = null;
  #saveFn = null;
  #dirty = false;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { position: absolute; inset: 0; display: flex; flex-direction: column; background: #14110f; color: #f2ede4; font-family: system-ui, sans-serif; }
        header { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 1rem; border-bottom: 1px solid #3a2d1e; }
        header h1 { font-size: 1rem; margin: 0; flex: 1; }
        header button { font: inherit; font-size: 0.85rem; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #4a3626;
                        background: #2a2118; color: #f2ede4; cursor: pointer; }
        header button:hover { background: #3a2d1e; }
        header .dirty { color: #d98e4a; font-size: 0.8rem; }
        .db-tabs { padding: 0.4rem 0.75rem 0; }
        main { flex: 1; min-height: 0; position: relative; }
        .placeholder { padding: 2rem; opacity: 0.65; }
      </style>
      <header>
        <h1>Hearthlight Studio<span class="project-name"></span></h1>
        <span class="dirty" hidden>unsaved changes</span>
        <button class="open-btn">Open Project</button>
        <button class="new-btn">New Project</button>
        <button class="save-btn" disabled>Save</button>
      </header>
      <app-tabs class="top-tabs" tabs="${TOP_TABS.join(',')}" active="Database" enabled="Database"></app-tabs>
      <main></main>
      <app-modal></app-modal>
    `;
    this._modal = this._shadow.querySelector('app-modal');
    this._main = this._shadow.querySelector('main');
    this._saveBtn = this._shadow.querySelector('.save-btn');
    this._dirtyEl = this._shadow.querySelector('.dirty');
    this._projectNameEl = this._shadow.querySelector('.project-name');

    this._shadow.querySelector('.open-btn').addEventListener('click', () => this.#openProject());
    this._shadow.querySelector('.new-btn').addEventListener('click', () => this.#newProject());
    this._saveBtn.addEventListener('click', () => this.#save());
  }

  connectedCallback() {
    this.#renderDatabasePlaceholder();
    this.addEventListener('entity-editor:change', () => this.#markDirty());
  }

  async #openProject() {
    try {
      const { project, save } = await openProject();
      this.#project = project;
      this.#saveFn = save;
      this.#markClean();
      this.#projectNameEl.textContent = ` — ${project.meta?.title ?? 'untitled'}`;
      bus.emit('project:loaded', { project });
      this.#mountDatabase();
    } catch (err) {
      if (err?.name !== 'AbortError') await this._modal.alert(`Couldn't open that file: ${err.message}`);
    }
  }

  async #newProject() {
    if (this.#dirty && !(await this._modal.confirm('Discard unsaved changes and start a new project?'))) return;
    this.#project = blankProject();
    this.#saveFn = null;
    this.#markClean();
    this._projectNameEl.textContent = ' — untitled (unsaved)';
    bus.emit('project:loaded', { project: this.#project });
    this.#mountDatabase();
  }

  async #save() {
    if (!this.#project) return;
    try {
      if (this.#saveFn) {
        await this.#saveFn(this.#project);
      } else {
        const blob = new Blob([JSON.stringify(this.#project, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'project.json'; a.click();
        URL.revokeObjectURL(url);
      }
      this.#markClean();
    } catch (err) {
      await this._modal.alert(`Save failed: ${err.message}`);
    }
  }

  #markDirty() {
    this.#dirty = true;
    this._dirtyEl.hidden = false;
    this._saveBtn.disabled = false;
  }
  #markClean() {
    this.#dirty = false;
    this._dirtyEl.hidden = true;
    this._saveBtn.disabled = false; // Save stays available even when clean (harmless re-save)
  }

  #renderDatabasePlaceholder() {
    this._main.innerHTML = `<div class="placeholder">Open or create a project to edit its database.${projectIoSupportsFSAccess ? '' : ' (Your browser lacks the File System Access API — Open/Save will use file picker + download instead of writing in place.)'}</div>`;
  }

  #mountDatabase() {
    this._main.innerHTML = `
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;">
        <app-tabs class="db-tabs" tabs="${TAB_ORDER.map((k) => SCHEMAS[k].label).join(',')}" active="${SCHEMAS[TAB_ORDER[0]].label}"></app-tabs>
        <div style="flex:1;min-height:0;"><entity-editor style="height:100%;display:block;"></entity-editor></div>
      </div>
    `;
    const editor = this._main.querySelector('entity-editor');
    editor.project = this.#project;
    editor.modal = this._modal;
    editor.setEntityType(TAB_ORDER[0]);

    const labelToKey = Object.fromEntries(TAB_ORDER.map((k) => [SCHEMAS[k].label, k]));
    this._main.querySelector('.db-tabs').addEventListener('tab-change', (e) => {
      editor.setEntityType(labelToKey[e.detail.tab]);
    });
  }
}

customElements.define('app-layout', AppLayout);
