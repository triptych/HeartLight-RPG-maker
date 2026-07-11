import './tileset-palette.js';
import './map-canvas.js';
import './event-editor-modal.js';
import { loadTileset } from '../../../engine/js/core/loader.js';

const TOOLS = [
  { id: 'paint', label: 'Paint' },
  { id: 'rect', label: 'Rectangle' },
  { id: 'fill', label: 'Fill' },
  { id: 'eyedropper', label: 'Eyedropper' },
  { id: 'collision', label: 'Collision' },
  { id: 'event', label: 'Event' },
];
const LAYERS = ['ground', 'decor', 'overhead'];
const ZOOMS = [0.5, 1, 1.5, 2];

/**
 * <map-editor-view> — the Maps tab (GDD 6.1). Ties together the map list
 * (left, "with folders" — see note below), the tileset palette + tool
 * belt, the canvas, an event editor modal, and map properties (right:
 * name/size/tileset/music). New Map / resize / the modal all go through
 * `<app-modal>`'s prompt/confirm, passed in the same way entity-editor
 * receives one.
 *
 * "Map list with folders": the Part VII schema has no folder field on
 * `maps.id` entries, and adding one would mean inventing schema the
 * runtime doesn't read — so this ships as a flat, sorted list. A real
 * folder scheme (e.g. `/`-prefixed ids treated as a tree) is a
 * genuinely separate design decision better made when there are enough
 * maps for folders to matter, not invented speculatively here.
 */
export class MapEditorView extends HTMLElement {
  #project = null;
  #modal = null;
  #mapId = null;
  #tool = 'paint';
  #layer = 'ground';

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { display: block; height: 100%; font-family: system-ui, sans-serif; color: #f2ede4; }
        .layout { display: grid; grid-template-columns: 220px 1fr 240px; height: 100%; gap: 1px; background: #3a2d1e; }
        .pane { background: #1c1712; overflow-y: auto; padding: 0.7rem; }
        h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; margin: 0 0 0.5rem; }
        .map-item { padding: 0.35rem 0.5rem; border-radius: 5px; cursor: pointer; font-size: 0.85rem; margin-bottom: 0.2rem; }
        .map-item:hover { background: #2a2118; }
        .map-item.selected { background: #4a3626; }
        .toolbar { display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0.5rem; border-bottom: 1px solid #3a2d1e; }
        .toolbar button { font: inherit; font-size: 0.78rem; padding: 0.3rem 0.55rem; border-radius: 5px; border: 1px solid #4a3626;
          background: #2a2118; color: #f2ede4; cursor: pointer; }
        .toolbar button.active { background: #6b4a2a; }
        .toolbar button:disabled { opacity: 0.4; cursor: default; }
        .toolbar select { font: inherit; font-size: 0.78rem; padding: 0.25rem 0.4rem; border-radius: 5px; border: 1px solid #4a3626; background: #14110f; color: #f2ede4; }
        .center { display: flex; flex-direction: column; height: 100%; }
        .canvas-wrap { flex: 1; min-height: 0; }
        .props label { display: block; font-size: 0.72rem; opacity: 0.75; margin: 0.6rem 0 0.2rem; }
        .props label:first-child { margin-top: 0; }
        .props input, .props select { width: 100%; font: inherit; font-size: 0.85rem; padding: 0.3rem 0.5rem;
          border-radius: 5px; border: 1px solid #4a3626; background: #14110f; color: #f2ede4; box-sizing: border-box; }
        .props .dims { display: flex; gap: 0.4rem; }
        .props button { margin-top: 0.6rem; font: inherit; font-size: 0.8rem; padding: 0.35rem 0.7rem; border-radius: 5px;
          border: 1px solid #4a3626; background: #2a2118; color: #f2ede4; cursor: pointer; }
        .empty-hint { opacity: 0.6; font-size: 0.85rem; padding: 1rem 0; }
      </style>
      <div class="layout">
        <div class="pane list-pane">
          <h3>Maps</h3>
          <div class="map-list"></div>
          <button class="new-map-btn">+ New Map</button>
          <h3 style="margin-top:1rem;">Palette</h3>
          <tileset-palette></tileset-palette>
        </div>
        <div class="pane center">
          <div class="toolbar">
            ${TOOLS.map((t) => `<button class="tool-btn" data-tool="${t.id}">${t.label}</button>`).join('')}
            <select class="layer-select">${LAYERS.map((l) => `<option value="${l}">${l}</option>`).join('')}</select>
            <select class="zoom-select">${ZOOMS.map((z) => `<option value="${z}">${Math.round(z * 100)}%</option>`).join('')}</select>
            <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.78rem;"><input type="checkbox" class="show-collision" checked /> Collision</label>
            <button class="undo-btn">Undo</button>
            <button class="redo-btn">Redo</button>
          </div>
          <div class="canvas-wrap"><map-canvas></map-canvas></div>
        </div>
        <div class="pane props">
          <h3>Map Properties</h3>
          <div class="props-body"></div>
        </div>
      </div>
      <event-editor-modal></event-editor-modal>
    `;
    this._listEl = this._shadow.querySelector('.map-list');
    this._palette = this._shadow.querySelector('tileset-palette');
    this._canvas = this._shadow.querySelector('map-canvas');
    this._eventModal = this._shadow.querySelector('event-editor-modal');
    this._propsBody = this._shadow.querySelector('.props-body');
    this._undoBtn = this._shadow.querySelector('.undo-btn');
    this._redoBtn = this._shadow.querySelector('.redo-btn');

    this._shadow.querySelector('.new-map-btn').addEventListener('click', () => this.#createMap());
    this._shadow.querySelectorAll('.tool-btn').forEach((btn) => btn.addEventListener('click', () => this.#setTool(btn.dataset.tool)));
    this._shadow.querySelector('.layer-select').addEventListener('change', (e) => { this.#layer = e.target.value; this._canvas.activeLayer = this.#layer; });
    this._shadow.querySelector('.zoom-select').addEventListener('change', (e) => { this._canvas.zoom = Number(e.target.value); });
    this._shadow.querySelector('.show-collision').addEventListener('change', (e) => { this._canvas.showCollision = e.target.checked; });
    this._undoBtn.addEventListener('click', () => { this._canvas.undo(); this.#refreshUndoRedo(); });
    this._redoBtn.addEventListener('click', () => { this._canvas.redo(); this.#refreshUndoRedo(); });

    this._palette.addEventListener('palette:select', (e) => { this._canvas.selectedBlock = e.detail.block; });
    this._canvas.addEventListener('map-canvas:eyedrop', (e) => { this._canvas.selectedBlock = e.detail.block; });
    this._canvas.addEventListener('map-canvas:change', () => { this.#refreshUndoRedo(); this.#emitChange(); });
    this._canvas.addEventListener('map-canvas:place-event', (e) => this.#onPlaceEvent(e.detail));
    this._canvas.addEventListener('map-canvas:edit-event', (e) => this.#onEditEvent(e.detail));

    this.#setTool('paint');
  }

  set project(value) { this.#project = value; this._canvas.project = value; this.#renderMapList(); }
  set modal(value) { this.#modal = value; }

  #setTool(tool) {
    this.#tool = tool;
    this._canvas.tool = tool;
    this._shadow.querySelectorAll('.tool-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tool === tool));
  }

  #refreshUndoRedo() {
    this._undoBtn.disabled = !this._canvas.canUndo;
    this._redoBtn.disabled = !this._canvas.canRedo;
  }

  #renderMapList() {
    const ids = Object.keys(this.#project.maps || {}).sort();
    this._listEl.innerHTML = ids.map((id) => `<div class="map-item ${id === this.#mapId ? 'selected' : ''}" data-id="${id}">${id}</div>`).join('') || '<div class="empty-hint">No maps yet.</div>';
    this._listEl.querySelectorAll('.map-item').forEach((el) => {
      el.addEventListener('click', () => this.#selectMap(el.dataset.id));
    });
  }

  async #selectMap(mapId) {
    this.#mapId = mapId;
    this.#renderMapList();
    await this._canvas.loadMap(mapId);
    const { meta, image } = await loadTileset(new URL(this.#project.maps[mapId].tileset, new URL('../games/wayfarers-rest/assets/', window.location.href)).href);
    this._palette.setTileset({ meta, image });
    this._canvas.tool = this.#tool;
    this._canvas.activeLayer = this.#layer;
    this.#refreshUndoRedo();
    this.#renderProps();
  }

  async #createMap() {
    const id = await this.#modal?.prompt('New map id:', this.#nextMapId());
    if (!id) return;
    if (this.#project.maps[id]) { await this.#modal?.alert(`"${id}" already exists.`); return; }
    const existingTileset = Object.values(this.#project.maps)[0]?.tileset ?? 'tiles/test-tileset.json';
    this.#project.maps[id] = {
      name: id, size: [10, 8], tileset: existingTileset,
      layers: { ground: new Array(80).fill(0), decor: new Array(80).fill(-1), overhead: [] },
      collision: new Array(80).fill(0), events: [], music: '', chapterDecor: {},
    };
    this.#renderMapList();
    await this.#selectMap(id);
    this.#emitChange();
  }

  #nextMapId() {
    let n = 1;
    while (this.#project.maps[`map${n}`]) n++;
    return `map${n}`;
  }

  #renderProps() {
    const map = this.#project.maps[this.#mapId];
    this._propsBody.innerHTML = `
      <label>Name</label><input class="p-name" type="text" value="${escapeAttr(map.name)}" />
      <label>Size</label>
      <div class="dims"><input class="p-w" type="number" value="${map.size[0]}" min="1" /><input class="p-h" type="number" value="${map.size[1]}" min="1" /></div>
      <label>Tileset</label><input class="p-tileset" type="text" value="${escapeAttr(map.tileset)}" />
      <label>Music</label><input class="p-music" type="text" value="${escapeAttr(map.music || '')}" />
      <button class="apply-resize">Apply size</button>
    `;
    this._propsBody.querySelector('.p-name').addEventListener('input', (e) => { map.name = e.target.value; this.#renderMapList(); this.#emitChange(); });
    this._propsBody.querySelector('.p-tileset').addEventListener('input', (e) => { map.tileset = e.target.value; this.#emitChange(); });
    this._propsBody.querySelector('.p-music').addEventListener('input', (e) => { map.music = e.target.value; this.#emitChange(); });
    this._propsBody.querySelector('.apply-resize').addEventListener('click', () => this.#applyResize());
  }

  async #applyResize() {
    const w = Number(this._propsBody.querySelector('.p-w').value);
    const h = Number(this._propsBody.querySelector('.p-h').value);
    const command = this._canvas.model.resize(w, h);
    if (command.droppedEvents.length) {
      const ok = await this.#modal?.confirm(`Shrinking will drop ${command.droppedEvents.length} event(s) that fall outside the new size. Continue?`);
      if (!ok) return;
    }
    this._canvas.history.push(command);
    this._canvas.refreshCanvasSize(); // resize the <canvas> element to match the model's new size, without rebuilding the model or clearing history
    this.#refreshUndoRedo();
    this.#emitChange();
  }

  async #onPlaceEvent({ x, y }) {
    const id = await this.#modal?.prompt('New event id:', `event_${x}_${y}`);
    if (!id) return;
    const event = { id, x, y, trigger: 'action', solid: true, pages: [{ commands: [] }] };
    const result = await this._eventModal.open(event);
    if (result === 'save') {
      this._canvas.history.push(this._canvas.model.addEvent(event));
      this.#emitChange();
    }
  }

  async #onEditEvent({ event }) {
    // Edit a *copy* so Cancel truly discards changes; Save re-applies via
    // updateEvent (which is itself undoable) rather than having left the
    // live object half-mutated by the modal regardless of outcome.
    const draft = JSON.parse(JSON.stringify(event));
    const result = await this._eventModal.open(draft);
    if (result === 'save') {
      this._canvas.history.push(this._canvas.model.updateEvent(event.id, draft));
      this.#emitChange();
    } else if (result === 'delete') {
      const ok = await this.#modal?.confirm(`Delete event "${event.id}"?`);
      if (ok) { this._canvas.history.push(this._canvas.model.removeEvent(event.id)); this.#emitChange(); }
    }
    this.#refreshUndoRedo();
  }

  #emitChange() {
    this.dispatchEvent(new CustomEvent('map-editor-view:change', { bubbles: true, composed: true }));
  }
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

customElements.define('map-editor-view', MapEditorView);
