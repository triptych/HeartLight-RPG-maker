import { SCHEMAS } from '../data/schemas.js';

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let node = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (node[keys[i]] == null || typeof node[keys[i]] !== 'object') node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

/**
 * <entity-editor> — the "shared entity pattern" GDD 6.1 describes: one
 * component, schema-driven (see data/schemas.js), reused for every
 * Database tab. Three panes: a list of ids (collections only — `system`
 * is a singleton with no list), a structured form built from the schema's
 * field list, and a JSON view of the entity currently selected.
 *
 * "Always in sync" (GDD 6.1) is implemented as: every form-field commit
 * immediately re-renders the JSON pane (form → JSON is live, every
 * keystroke's blur/change). JSON → form only happens when the user clicks
 * "Apply JSON" — syncing on every JSON keystroke would fight a person
 * mid-edit typing invalid intermediate JSON, so that direction is
 * deliberate rather than live.
 */
export class EntityEditor extends HTMLElement {
  #project = null;
  #schemaKey = null;
  #selectedId = null;
  #modal = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { display: block; height: 100%; font-family: system-ui, sans-serif; color: #f2ede4; }
        .layout { display: grid; grid-template-columns: 200px 1fr 320px; height: 100%; gap: 1px; background: #3a2d1e; }
        .pane { background: #1c1712; overflow-y: auto; padding: 0.75rem; }
        .list-pane { display: flex; flex-direction: column; gap: 0.3rem; }
        .list-pane .toolbar { display: flex; gap: 0.4rem; margin-bottom: 0.4rem; }
        .list-item { padding: 0.4rem 0.5rem; border-radius: 5px; cursor: pointer; font-size: 0.85rem; }
        .list-item:hover { background: #2a2118; }
        .list-item.selected { background: #4a3626; }
        .form-pane label { display: block; font-size: 0.75rem; opacity: 0.75; margin: 0.7rem 0 0.2rem; }
        .form-pane label:first-child { margin-top: 0; }
        .form-pane input[type="text"], .form-pane input[type="number"], .form-pane select, .form-pane textarea {
          width: 100%; font: inherit; font-size: 0.85rem; padding: 0.35rem 0.5rem; border-radius: 5px;
          border: 1px solid #4a3626; background: #14110f; color: #f2ede4; box-sizing: border-box;
        }
        .form-pane textarea { min-height: 4.5em; font-family: ui-monospace, monospace; resize: vertical; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; }
        .stats-grid div { display: flex; flex-direction: column; gap: 0.15rem; }
        .stats-grid span { font-size: 0.65rem; opacity: 0.7; }
        .stats-grid input { width: 100%; }
        .multiselect { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .multiselect label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; margin: 0; opacity: 1; }
        .json-pane textarea { width: 100%; height: calc(100% - 2.2rem); font-family: ui-monospace, monospace; font-size: 0.8rem;
          background: #14110f; color: #d9cdbc; border: 1px solid #4a3626; border-radius: 5px; box-sizing: border-box; }
        .json-error { color: #e08a6b; font-size: 0.75rem; min-height: 1.2em; }
        button { font: inherit; font-size: 0.8rem; padding: 0.35rem 0.7rem; border-radius: 5px; border: 1px solid #4a3626;
                 background: #2a2118; color: #f2ede4; cursor: pointer; }
        button:hover { background: #3a2d1e; }
        h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; margin: 0 0 0.5rem; }
        .empty-hint { opacity: 0.6; font-size: 0.85rem; padding: 1rem 0; }
      </style>
      <div class="layout">
        <div class="pane list-pane"><h3>Entries</h3><div class="toolbar"></div><div class="list-body"></div></div>
        <div class="pane form-pane"><h3>Fields</h3><div class="form-body"></div></div>
        <div class="pane json-pane"><h3>JSON</h3><div class="json-body"></div></div>
      </div>
    `;
    this._listPane = this._shadow.querySelector('.list-pane');
    this._listToolbar = this._shadow.querySelector('.toolbar');
    this._listBody = this._shadow.querySelector('.list-body');
    this._formBody = this._shadow.querySelector('.form-body');
    this._jsonBody = this._shadow.querySelector('.json-body');
  }

  set project(value) { this.#project = value; }
  set modal(value) { this.#modal = value; }

  /** @param {string} key one of data/schemas.js's SCHEMAS keys */
  setEntityType(key) {
    this.#schemaKey = key;
    this.#selectedId = null;
    this.#renderAll();
  }

  #schema() { return SCHEMAS[this.#schemaKey]; }

  #currentEntity() {
    const schema = this.#schema();
    if (!schema) return null;
    if (schema.kind === 'singleton') return this.#project[this.#schemaKey];
    return this.#selectedId ? this.#project[this.#schemaKey][this.#selectedId] : null;
  }

  #renderAll() {
    const schema = this.#schema();
    if (!schema) return;
    this._listPane.style.display = schema.kind === 'collection' ? '' : 'none';
    this.#renderList();
    this.#renderForm();
    this.#renderJson();
  }

  #renderList() {
    const schema = this.#schema();
    if (schema.kind !== 'collection') return;
    const collection = this.#project[this.#schemaKey] || {};
    const ids = Object.keys(collection).sort();
    if (!this.#selectedId && ids.length) this.#selectedId = ids[0];

    this._listToolbar.innerHTML = `<button class="new-btn">+ New</button><button class="delete-btn" ${this.#selectedId ? '' : 'disabled'}>Delete</button>`;
    this._listToolbar.querySelector('.new-btn').addEventListener('click', () => this.#createNew());
    this._listToolbar.querySelector('.delete-btn').addEventListener('click', () => this.#deleteSelected());

    this._listBody.innerHTML = ids.map((id) => {
      const name = collection[id]?.name;
      return `<div class="list-item ${id === this.#selectedId ? 'selected' : ''}" data-id="${id}">${id}${name ? ` — ${escapeHtml(name)}` : ''}</div>`;
    }).join('') || '<div class="empty-hint">No entries yet.</div>';

    this._listBody.querySelectorAll('.list-item').forEach((el) => {
      el.addEventListener('click', () => {
        this.#selectedId = el.dataset.id;
        this.#renderAll();
      });
    });
  }

  async #createNew() {
    const schema = this.#schema();
    const collection = this.#project[this.#schemaKey];
    const suggested = this.#nextId(schema.idPrefix, collection);
    const id = await this.#modal?.prompt(`New ${schema.label.replace(/s$/, '')} id:`, suggested);
    if (!id) return;
    if (collection[id]) {
      await this.#modal?.alert(`"${id}" already exists.`);
      return;
    }
    collection[id] = schema.blank();
    this.#selectedId = id;
    this.#renderAll();
    this.#emitChange();
  }

  #nextId(prefix, collection) {
    let n = 1;
    while (collection[`${prefix}${n}`]) n++;
    return `${prefix}${n}`;
  }

  async #deleteSelected() {
    if (!this.#selectedId) return;
    const ok = await this.#modal?.confirm(`Delete "${this.#selectedId}"? This can't be undone.`);
    if (!ok) return;
    delete this.#project[this.#schemaKey][this.#selectedId];
    this.#selectedId = null;
    this.#renderAll();
    this.#emitChange();
  }

  #renderForm() {
    const schema = this.#schema();
    const entity = this.#currentEntity();
    if (!entity) {
      this._formBody.innerHTML = '<div class="empty-hint">Select or create an entry.</div>';
      return;
    }
    this._formBody.innerHTML = schema.fields.map((f) => this.#fieldHtml(f, entity)).join('');
    schema.fields.forEach((f) => this.#bindField(f, entity));
  }

  #fieldHtml(field, entity) {
    const value = getPath(entity, field.key);
    switch (field.type) {
      case 'text':
        return `<label>${field.label}</label><input type="text" data-key="${field.key}" value="${escapeAttr(value ?? '')}" />`;
      case 'number':
        return `<label>${field.label}</label><input type="number" data-key="${field.key}" value="${value ?? 0}" />`;
      case 'textarea':
        return `<label>${field.label}</label><textarea data-key="${field.key}">${escapeHtml(value ?? '')}</textarea>`;
      case 'stringlist':
        return `<label>${field.label}</label><input type="text" data-key="${field.key}" data-type="stringlist" value="${escapeAttr((value || []).join(', '))}" placeholder="comma, separated" />`;
      case 'select': {
        const options = field.options(this.#project);
        return `<label>${field.label}</label><select data-key="${field.key}">
          <option value="">—</option>
          ${options.map((o) => `<option value="${escapeAttr(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
        </select>`;
      }
      case 'multiselect': {
        const options = field.options(this.#project);
        const selected = new Set(value || []);
        return `<label>${field.label}</label><div class="multiselect" data-key="${field.key}" data-type="multiselect">
          ${options.map((o) => `<label><input type="checkbox" value="${escapeAttr(o)}" ${selected.has(o) ? 'checked' : ''}/> ${escapeHtml(o)}</label>`).join('') || '<span class="empty-hint">(none defined yet)</span>'}
        </div>`;
      }
      case 'stats': {
        const stats = value || {};
        return `<label>${field.label}</label><div class="stats-grid" data-key="${field.key}" data-type="stats">
          ${field.statKeys.map((k) => `<div><span>${k}</span><input type="number" data-stat="${k}" value="${stats[k] ?? 0}" /></div>`).join('')}
        </div>`;
      }
      case 'json':
        return `<label>${field.label}</label><textarea data-key="${field.key}" data-type="json">${escapeHtml(JSON.stringify(value ?? null, null, 2))}</textarea>`;
      default:
        return '';
    }
  }

  #bindField(field, entity) {
    if (field.type === 'stats') {
      this._formBody.querySelectorAll(`[data-key="${cssEscape(field.key)}"][data-stat]`).forEach((input) => {
        input.addEventListener('input', () => {
          const stats = getPath(entity, field.key) || {};
          stats[input.dataset.stat] = Number(input.value);
          setPath(entity, field.key, stats);
          this.#afterFieldChange();
        });
      });
      return;
    }
    if (field.type === 'multiselect') {
      const container = this._formBody.querySelector(`[data-key="${cssEscape(field.key)}"]`);
      container?.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const chosen = [...container.querySelectorAll('input:checked')].map((c) => c.value);
          setPath(entity, field.key, chosen);
          this.#afterFieldChange();
        });
      });
      return;
    }
    const el = this._formBody.querySelector(`[data-key="${cssEscape(field.key)}"]`);
    if (!el) return;
    const eventName = (field.type === 'select') ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      if (field.type === 'number') setPath(entity, field.key, el.value === '' ? 0 : Number(el.value));
      else if (field.type === 'stringlist') setPath(entity, field.key, el.value.split(',').map((s) => s.trim()).filter(Boolean));
      else if (field.type === 'json') this.#applyJsonField(field, entity, el);
      else setPath(entity, field.key, el.value);
      if (field.type !== 'json') this.#afterFieldChange();
    });
  }

  #applyJsonField(field, entity, el) {
    try {
      const parsed = el.value.trim() === '' ? null : JSON.parse(el.value);
      setPath(entity, field.key, parsed);
      el.style.borderColor = '';
      this.#afterFieldChange({ skipJsonPaneRerender: true });
    } catch {
      el.style.borderColor = '#e08a6b';
    }
  }

  #afterFieldChange({ skipJsonPaneRerender = false } = {}) {
    if (!skipJsonPaneRerender) this.#renderJson();
    if (this.#schema().kind === 'collection') this.#renderListLabelsOnly();
    this.#emitChange();
  }

  #renderListLabelsOnly() {
    // Cheap re-render of just the list text (e.g. a name field changed) —
    // full #renderList() would rebuild toolbar listeners for no reason.
    const collection = this.#project[this.#schemaKey] || {};
    this._listBody.querySelectorAll('.list-item').forEach((el) => {
      const id = el.dataset.id;
      const name = collection[id]?.name;
      el.textContent = `${id}${name ? ` — ${name}` : ''}`;
    });
  }

  #renderJson() {
    const entity = this.#currentEntity();
    this._jsonBody.innerHTML = `<textarea></textarea><div class="json-error"></div><button class="apply-json">Apply JSON →</button>`;
    const textarea = this._jsonBody.querySelector('textarea');
    const errorEl = this._jsonBody.querySelector('.json-error');
    textarea.value = entity ? JSON.stringify(entity, null, 2) : '';
    this._jsonBody.querySelector('.apply-json').addEventListener('click', () => {
      if (!entity) return;
      try {
        const parsed = JSON.parse(textarea.value);
        const schema = this.#schema();
        if (schema.kind === 'singleton') Object.assign(this.#project[this.#schemaKey], parsed);
        else this.#project[this.#schemaKey][this.#selectedId] = parsed;
        errorEl.textContent = '';
        this.#renderForm();
        this.#renderListLabelsOnly();
        this.#emitChange();
      } catch (err) {
        errorEl.textContent = `Invalid JSON: ${err.message}`;
      }
    });
  }

  #emitChange() {
    this.dispatchEvent(new CustomEvent('entity-editor:change', { bubbles: true, composed: true }));
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
function cssEscape(s) {
  return String(s).replace(/[."'\\]/g, '\\$&');
}

customElements.define('entity-editor', EntityEditor);
