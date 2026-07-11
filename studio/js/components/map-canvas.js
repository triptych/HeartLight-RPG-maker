import { loadTileset } from '../../../engine/js/core/loader.js';
import { MapEditorModel } from '../core/map-editor-model.js';
import { HistoryStack } from '../core/history.js';

const ZOOM_LEVELS = [0.5, 1, 1.5, 2];

/**
 * <map-canvas> — GDD 6.1's "Center: canvas with zoom/pan, layer toggles,
 * grid" plus the tool belt (paint, rectangle, fill, eyedropper, collision
 * brush, event placement) and undo/redo. Mirrors the runtime's map-scene.js
 * split: all the actual editing logic lives in MapEditorModel (pure,
 * canvas-free); this component only draws the result and turns pointer
 * events into model calls pushed through a HistoryStack.
 *
 * Zoom is a fixed preset list rather than smooth wheel-zoom, and pan is
 * plain scroll-container overflow rather than click-drag-to-pan — both
 * are the GDD's own "ship the simple version, editor gold-plating is the
 * #1 schedule risk" valve in action; neither affects whether a map can
 * actually be authored, just how comfortable panning around a big one is.
 */
export class MapCanvas extends HTMLElement {
  #project = null;
  #mapId = null;
  #model = null;
  #history = new HistoryStack();
  #tileset = null;
  #tilesetImage = null;
  #tool = 'paint';
  #activeLayer = 'ground';
  #selectedBlock = [[0]];
  #showCollision = true;
  #dragAnchor = null;
  #pendingRectPreview = null;
  #zoom = 1;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        .scroll { width: 100%; height: 100%; overflow: auto; background: #0c0a09; }
        canvas { display: block; image-rendering: pixelated; cursor: crosshair; }
      </style>
      <div class="scroll"><canvas></canvas></div>
    `;
    this._canvas = this._shadow.querySelector('canvas');
    this._ctx = this._canvas.getContext('2d');

    this._canvas.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    this._canvas.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    window.addEventListener('pointerup', () => this.#onPointerUp());
    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
  }

  set project(value) { this.#project = value; }
  set tool(value) { this.#tool = value; }
  set activeLayer(value) { this.#activeLayer = value; }
  set selectedBlock(value) { this.#selectedBlock = value; }
  set showCollision(value) { this.#showCollision = value; this.#draw(); }
  set zoom(value) { this.#zoom = value; this.#applyCanvasSize(); this.#draw(); }
  get zoom() { return this.#zoom; }

  get model() { return this.#model; }
  get history() { return this.#history; }
  get canUndo() { return this.#history.canUndo; }
  get canRedo() { return this.#history.canRedo; }

  async loadMap(mapId) {
    this.#mapId = mapId;
    const mapData = this.#project.maps[mapId];
    this.#model = new MapEditorModel(mapData);
    this.#history.clear();

    // GDD's repo layout has exactly one game consumer today (games/wayfarers-rest);
    // this hardcodes that path the same pragmatic way Phase 0-4 hardcoded it into
    // the runtime's own main.js — revisit if/when a second game project exists.
    const tilesetUrl = new URL(mapData.tileset, new URL('../games/wayfarers-rest/assets/', window.location.href)).href;
    const { meta, image } = await loadTileset(tilesetUrl);
    this.#tileset = meta;
    this.#tilesetImage = image;

    this.#applyCanvasSize();
    this.#draw();
  }

  undo() { if (this.#history.undo()) { this.#draw(); this.#emitChange(); } }

  /** Resize the backing <canvas> element to match the model's current dimensions (e.g. after an in-place resize() mutation) without rebuilding the model or clearing history. */
  refreshCanvasSize() { this.#applyCanvasSize(); this.#draw(); }
  redo() { if (this.#history.redo()) { this.#draw(); this.#emitChange(); } }

  #applyCanvasSize() {
    if (!this.#model) return;
    const size = this.#tileset.tileSize * this.#zoom;
    this._canvas.width = this.#model.width * size;
    this._canvas.height = this.#model.height * size;
  }

  #onKeyDown(e) {
    if (!this.isConnected) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); this.undo(); }
    else if (meta && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); this.redo(); }
  }

  #tileFromEvent(e) {
    const rect = this._canvas.getBoundingClientRect();
    const size = this.#tileset.tileSize * this.#zoom;
    const px = ((e.clientX - rect.left) / (rect.width || 1)) * this._canvas.width;
    const py = ((e.clientY - rect.top) / (rect.height || 1)) * this._canvas.height;
    return [Math.floor(px / size), Math.floor(py / size)];
  }

  #onPointerDown(e) {
    if (!this.#model) return;
    const [x, y] = this.#tileFromEvent(e);
    this.#dragAnchor = [x, y];

    switch (this.#tool) {
      case 'paint':
        this.#push(this.#model.paint(this.#activeLayer, x, y, this.#selectedBlock));
        break;
      case 'fill':
        this.#push(this.#model.floodFill(this.#activeLayer, x, y, this.#selectedBlock[0][0]));
        break;
      case 'eyedropper': {
        const picked = this.#model.eyedropper(this.#activeLayer, x, y);
        this.dispatchEvent(new CustomEvent('map-canvas:eyedrop', { detail: { block: [[picked]] }, bubbles: true, composed: true }));
        break;
      }
      case 'collision':
        this.#push(this.#model.setCollisionRect(x, y, x, y, !this.#model.collisionAt(x, y)));
        break;
      case 'rect':
        this.#pendingRectPreview = [x, y, x, y];
        break;
      case 'event': {
        const existing = this.#model.eventAt(x, y);
        this.dispatchEvent(new CustomEvent(existing ? 'map-canvas:edit-event' : 'map-canvas:place-event', {
          detail: existing ? { event: existing } : { x, y }, bubbles: true, composed: true,
        }));
        break;
      }
    }
    this.#draw();
  }

  #onPointerMove(e) {
    if (!this.#model || !this.#dragAnchor) return;
    const [x, y] = this.#tileFromEvent(e);

    if (this.#tool === 'paint') {
      this.#push(this.#model.paint(this.#activeLayer, x, y, this.#selectedBlock));
    } else if (this.#tool === 'collision') {
      // Drag paints (doesn't toggle per-cell) so a drag always ends up
      // solid — matches the "collision brush" name (a brush lays paint
      // down, it doesn't flicker per cell it passes over).
      this.#push(this.#model.setCollisionRect(x, y, x, y, true));
    } else if (this.#tool === 'rect') {
      this.#pendingRectPreview = [this.#dragAnchor[0], this.#dragAnchor[1], x, y];
    }
    this.#draw();
  }

  #onPointerUp() {
    if (this.#tool === 'rect' && this.#pendingRectPreview) {
      const [x0, y0, x1, y1] = this.#pendingRectPreview;
      this.#push(this.#model.paintRect(this.#activeLayer, x0, y0, x1, y1, this.#selectedBlock));
      this.#pendingRectPreview = null;
      this.#draw();
    }
    this.#dragAnchor = null;
  }

  #push(command) {
    this.#history.push(command);
    this.#emitChange();
  }

  #emitChange() {
    this.dispatchEvent(new CustomEvent('map-canvas:change', { bubbles: true, composed: true }));
  }

  #draw() {
    if (!this.#model) return;
    const ctx = this._ctx;
    const size = this.#tileset.tileSize * this.#zoom;
    const tileSize = this.#tileset.tileSize;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    for (const layerName of ['ground', 'decor', 'overhead']) {
      const layer = this.#model.mapData.layers[layerName];
      if (!layer) continue;
      for (let y = 0; y < this.#model.height; y++) {
        for (let x = 0; x < this.#model.width; x++) {
          const tileIndex = layer[y * this.#model.width + x];
          if (tileIndex === -1 || tileIndex == null) continue;
          const meta = this.#tileset.tiles[String(tileIndex)];
          const frame = meta?.anim ? meta.anim[0] : tileIndex;
          const sx = (frame % this.#tileset.columns) * tileSize;
          const sy = Math.floor(frame / this.#tileset.columns) * tileSize;
          ctx.drawImage(this.#tilesetImage, sx, sy, tileSize, tileSize, x * size, y * size, size, size);
        }
      }
    }

    if (this.#showCollision) {
      ctx.fillStyle = 'rgba(214, 60, 60, 0.45)';
      for (let y = 0; y < this.#model.height; y++) {
        for (let x = 0; x < this.#model.width; x++) {
          if (this.#model.collisionAt(x, y)) ctx.fillRect(x * size, y * size, size, size);
        }
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let x = 0; x <= this._canvas.width; x += size) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this._canvas.height); ctx.stroke(); }
    for (let y = 0; y <= this._canvas.height; y += size) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this._canvas.width, y); ctx.stroke(); }

    for (const ev of this.#model.mapData.events) {
      ctx.fillStyle = ev.solid ? '#d98e4a' : '#6a9cbf';
      ctx.fillRect(ev.x * size + size * 0.2, ev.y * size + size * 0.2, size * 0.6, size * 0.6);
    }

    if (this.#pendingRectPreview) {
      const [x0, y0, x1, y1] = this.#pendingRectPreview;
      const [minX, maxX] = [Math.min(x0, x1), Math.max(x0, x1)];
      const [minY, maxY] = [Math.min(y0, y1), Math.max(y0, y1)];
      ctx.strokeStyle = '#f2ede4';
      ctx.lineWidth = 2;
      ctx.strokeRect(minX * size, minY * size, (maxX - minX + 1) * size, (maxY - minY + 1) * size);
    }
  }
}

customElements.define('map-canvas', MapCanvas);
