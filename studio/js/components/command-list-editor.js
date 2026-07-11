import { COMMAND_TYPES, COMMAND_FIELDS, blankCommand, summarize } from '../data/command-schemas.js';

/**
 * <command-list-editor> — GDD 6.1: "a command list editor (see Scenes
 * tab — same component, reused)." Built now, in Phase 5, for map event
 * pages; Phase 6's Scenes tab reuses this unchanged for whole VN scenes —
 * both are just "an array of interpreter commands" (GDD 4.2's shared
 * vocabulary), so one editor genuinely serves both without knowing which
 * context it's in.
 *
 * Each row shows a one-line summary with an expand toggle for its fields;
 * `choice` and `if` additionally nest child `<command-list-editor>`
 * instances for their sub-command-lists (`option.then`, `then`/`else`) —
 * GDD 6.1's "collapse choice/if blocks" done via those same expand
 * toggles rather than a separate collapse mechanism.
 */
export class CommandListEditor extends HTMLElement {
  #commands = [];
  #expanded = new Set();

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, sans-serif; font-size: 0.82rem; color: #f2ede4; }
        .row { border: 1px solid #3a2d1e; border-radius: 6px; margin-bottom: 0.35rem; background: #1c1712; }
        .row-head { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.5rem; }
        .row-head .summary { flex: 1; cursor: pointer; font-family: ui-monospace, monospace; }
        .row-body { padding: 0.5rem; border-top: 1px solid #3a2d1e; display: none; }
        .row-body.open { display: block; }
        label { display: block; font-size: 0.72rem; opacity: 0.75; margin: 0.4rem 0 0.15rem; }
        input, select, textarea { width: 100%; font: inherit; padding: 0.3rem 0.4rem; border-radius: 4px;
          border: 1px solid #4a3626; background: #14110f; color: #f2ede4; box-sizing: border-box; }
        textarea { min-height: 3em; }
        button { font: inherit; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid #4a3626;
          background: #2a2118; color: #f2ede4; cursor: pointer; }
        button:hover { background: #3a2d1e; }
        .toolbar { display: flex; gap: 0.4rem; margin-top: 0.4rem; align-items: center; }
        .nested-block { margin: 0.4rem 0; padding: 0.4rem; border-left: 2px solid #4a3626; }
        .nested-block h4 { margin: 0 0 0.3rem; font-size: 0.72rem; opacity: 0.7; text-transform: uppercase; }
        .option-row { display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.3rem; }
        .option-row input { flex: 1; }
        .empty-hint { opacity: 0.55; font-size: 0.78rem; padding: 0.3rem 0; }
      </style>
      <div class="list"></div>
      <div class="toolbar">
        <select class="add-type">${COMMAND_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
        <button class="add-btn">+ Add command</button>
      </div>
    `;
    this._listEl = this._shadow.querySelector('.list');
    this._addType = this._shadow.querySelector('.add-type');
    this._shadow.querySelector('.add-btn').addEventListener('click', () => this.#addCommand());
  }

  /** @param {Array<object>} arr the live commands array — mutated in place */
  set commands(arr) {
    this.#commands = arr;
    this.#render();
  }
  get commands() { return this.#commands; }

  #addCommand() {
    this.#commands.push(blankCommand(this._addType.value));
    this.#expanded.add(this.#commands.length - 1);
    this.#render();
    this.#emitChange();
  }

  #render() {
    if (!this.#commands.length) {
      this._listEl.innerHTML = '<div class="empty-hint">No commands yet.</div>';
      return;
    }
    this._listEl.innerHTML = this.#commands.map((cmd, i) => this.#rowHtml(cmd, i)).join('');
    this.#commands.forEach((cmd, i) => this.#bindRow(cmd, i));
  }

  #rowHtml(cmd, i) {
    const open = this.#expanded.has(i);
    return `
      <div class="row" data-i="${i}">
        <div class="row-head">
          <button class="toggle" data-i="${i}">${open ? '▾' : '▸'}</button>
          <span class="summary" data-i="${i}">${escapeHtml(summarize(cmd))}</span>
          <button class="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="down" data-i="${i}" ${i === this.#commands.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="delete" data-i="${i}">✕</button>
        </div>
        <div class="row-body ${open ? 'open' : ''}" data-body="${i}"></div>
      </div>`;
  }

  #bindRow(cmd, i) {
    const row = this._listEl.querySelector(`.row[data-i="${i}"]`);
    row.querySelector('.toggle').addEventListener('click', () => this.#toggle(i));
    row.querySelector('.summary').addEventListener('click', () => this.#toggle(i));
    row.querySelector('.up').addEventListener('click', () => this.#move(i, -1));
    row.querySelector('.down').addEventListener('click', () => this.#move(i, 1));
    row.querySelector('.delete').addEventListener('click', () => this.#delete(i));

    const body = row.querySelector(`[data-body="${i}"]`);
    if (this.#expanded.has(i)) this.#renderBody(body, cmd, i);
  }

  #toggle(i) {
    if (this.#expanded.has(i)) this.#expanded.delete(i); else this.#expanded.add(i);
    this.#render();
  }

  #move(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= this.#commands.length) return;
    [this.#commands[i], this.#commands[j]] = [this.#commands[j], this.#commands[i]];
    const wasOpen = this.#expanded.has(i);
    this.#expanded.delete(i);
    if (wasOpen) this.#expanded.add(j); else this.#expanded.delete(j);
    this.#render();
    this.#emitChange();
  }

  #delete(i) {
    this.#commands.splice(i, 1);
    this.#expanded = new Set([...this.#expanded].filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)));
    this.#render();
    this.#emitChange();
  }

  #renderBody(body, cmd, i) {
    if (cmd.cmd === 'if') return this.#renderIfBody(body, cmd, i);
    if (cmd.cmd === 'choice') return this.#renderChoiceBody(body, cmd, i);

    const fields = COMMAND_FIELDS[cmd.cmd] || [];
    body.innerHTML = fields.map((f) => this.#fieldHtml(f, cmd)).join('') || '<div class="empty-hint">No fields for this command.</div>';
    fields.forEach((f) => this.#bindField(body, f, cmd));
  }

  #fieldHtml(field, cmd) {
    const value = cmd[field.key];
    if (field.type === 'select') {
      const options = field.options();
      return `<label>${field.label}</label><select data-key="${field.key}">${options.map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    }
    if (field.type === 'textarea') return `<label>${field.label}</label><textarea data-key="${field.key}">${escapeHtml(value ?? '')}</textarea>`;
    if (field.type === 'number') return `<label>${field.label}</label><input type="number" data-key="${field.key}" value="${value ?? 0}" />`;
    if (field.type === 'json') return `<label>${field.label}</label><input type="text" data-key="${field.key}" data-json="1" value="${escapeAttr(value === undefined ? '' : JSON.stringify(value))}" placeholder="JSON (blank = true for flags)" />`;
    return `<label>${field.label}</label><input type="text" data-key="${field.key}" value="${escapeAttr(value ?? '')}" />`;
  }

  #bindField(body, field, cmd) {
    const el = body.querySelector(`[data-key="${field.key}"]`);
    const eventName = field.type === 'select' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      if (field.type === 'number') cmd[field.key] = el.value === '' ? 0 : Number(el.value);
      else if (field.type === 'json') {
        if (el.value.trim() === '') { delete cmd[field.key]; }
        else { try { cmd[field.key] = JSON.parse(el.value); el.style.borderColor = ''; } catch { el.style.borderColor = '#e08a6b'; return; } }
      } else cmd[field.key] = el.value;
      this.#refreshSummary(cmd);
      this.#emitChange();
    });
  }

  #renderIfBody(body, cmd, i) {
    body.innerHTML = `
      <label>Flag is true</label><input type="text" data-k="flag" value="${escapeAttr(cmd.flag ?? '')}" />
      <label>Flag is false (flagNot)</label><input type="text" data-k="flagNot" value="${escapeAttr(cmd.flagNot ?? '')}" />
      <div class="nested-block"><h4>Then</h4><div class="then-slot"></div></div>
      <div class="nested-block"><h4>Else</h4><div class="else-slot"></div></div>
    `;
    body.querySelector('[data-k="flag"]').addEventListener('input', (e) => { cmd.flag = e.target.value || undefined; this.#refreshSummary(cmd); this.#emitChange(); });
    body.querySelector('[data-k="flagNot"]').addEventListener('input', (e) => { cmd.flagNot = e.target.value || undefined; this.#refreshSummary(cmd); this.#emitChange(); });

    cmd.then = cmd.then || [];
    cmd.else = cmd.else || [];
    this.#mountNested(body.querySelector('.then-slot'), cmd.then);
    this.#mountNested(body.querySelector('.else-slot'), cmd.else);
  }

  #renderChoiceBody(body, cmd, i) {
    cmd.options = cmd.options || [];
    body.innerHTML = `<div class="options"></div><button class="add-option">+ Add option</button>`;
    const optionsEl = body.querySelector('.options');
    optionsEl.innerHTML = cmd.options.map((opt, oi) => `
      <div class="nested-block">
        <div class="option-row">
          <input type="text" data-oi="${oi}" value="${escapeAttr(opt.text ?? '')}" placeholder="Option text" />
          <button class="del-option" data-oi="${oi}">✕</button>
        </div>
        <div class="opt-then-slot" data-oi="${oi}"></div>
      </div>
    `).join('');

    cmd.options.forEach((opt, oi) => {
      optionsEl.querySelector(`input[data-oi="${oi}"]`).addEventListener('input', (e) => {
        opt.text = e.target.value;
        this.#emitChange();
      });
      optionsEl.querySelector(`.del-option[data-oi="${oi}"]`).addEventListener('click', () => {
        cmd.options.splice(oi, 1);
        this.#render();
        this.#emitChange();
      });
      opt.then = opt.then || [];
      this.#mountNested(optionsEl.querySelector(`.opt-then-slot[data-oi="${oi}"]`), opt.then);
    });

    body.querySelector('.add-option').addEventListener('click', () => {
      cmd.options.push({ text: `Option ${cmd.options.length + 1}`, then: [] });
      this.#render();
      this.#emitChange();
    });
  }

  #mountNested(slotEl, arr) {
    const nested = document.createElement('command-list-editor');
    nested.commands = arr;
    slotEl.appendChild(nested);
  }

  #refreshSummary(cmd) {
    const idx = this.#commands.indexOf(cmd);
    if (idx === -1) return;
    const span = this._listEl.querySelector(`.summary[data-i="${idx}"]`);
    if (span) span.textContent = summarize(cmd);
  }

  #emitChange() {
    this.dispatchEvent(new CustomEvent('command-list-editor:change', { bubbles: true, composed: true }));
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

customElements.define('command-list-editor', CommandListEditor);
