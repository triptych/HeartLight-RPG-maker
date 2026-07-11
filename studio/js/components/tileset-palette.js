/**
 * <tileset-palette> — GDD 6.1: "Left: tileset palette (marquee multi-tile
 * selection)." Renders a tileset's spritesheet as a clickable grid; a
 * click selects one tile, a click-drag selects a rectangular block of
 * tiles. Emits `palette:select` with `{ block }`, a 2D array of tile
 * indices — `paint`/`paintRect` on MapEditorModel already accept exactly
 * that shape, so the palette and the model agree on "a selection" without
 * either one knowing about the other.
 *
 * Placeholder-art era note: this draws the tileset PNG directly (flat-
 * color placeholder tiles, same as the runtime), so there's no separate
 * "icon" concept to build — what you see in the palette is what you get
 * on the map, same file the engine already loads.
 */
export class TilesetPalette extends HTMLElement {
  #tileset = null;
  #image = null;
  #dragStart = null;
  #selection = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { display: block; }
        canvas { display: block; image-rendering: pixelated; cursor: crosshair; border: 1px solid #3a2d1e; }
      </style>
      <canvas></canvas>
    `;
    this._canvas = this._shadow.querySelector('canvas');
    this._ctx = this._canvas.getContext('2d');

    this._canvas.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    this._canvas.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    window.addEventListener('pointerup', () => this.#onPointerUp());
  }

  /** @param {{meta: object, image: HTMLImageElement}} value from core/loader.js's loadTileset() shape */
  setTileset({ meta, image }) {
    this.#tileset = meta;
    this.#image = image;
    this._canvas.width = image.width || meta.columns * meta.tileSize;
    this._canvas.height = image.height || Math.ceil(Object.keys(meta.tiles).length / meta.columns) * meta.tileSize;
    this.#selection = { x0: 0, y0: 0, x1: 0, y1: 0 };
    this.#draw();
  }

  #tileXY(index) {
    const cols = this.#tileset.columns;
    return [index % cols, Math.floor(index / cols)];
  }

  #pointToTile(e) {
    const rect = this._canvas.getBoundingClientRect();
    const size = this.#tileset.tileSize;
    const px = ((e.clientX - rect.left) / (rect.width || 1)) * this._canvas.width;
    const py = ((e.clientY - rect.top) / (rect.height || 1)) * this._canvas.height;
    return [Math.floor(px / size), Math.floor(py / size)];
  }

  #onPointerDown(e) {
    const [tx, ty] = this.#pointToTile(e);
    this.#dragStart = [tx, ty];
    this.#selection = { x0: tx, y0: ty, x1: tx, y1: ty };
    this.#draw();
  }

  #onPointerMove(e) {
    if (!this.#dragStart) return;
    const [tx, ty] = this.#pointToTile(e);
    this.#selection = { x0: this.#dragStart[0], y0: this.#dragStart[1], x1: tx, y1: ty };
    this.#draw();
  }

  #onPointerUp() {
    if (!this.#dragStart) return;
    this.#dragStart = null;
    this.dispatchEvent(new CustomEvent('palette:select', { detail: { block: this.selectedBlock() }, bubbles: true, composed: true }));
  }

  /** @returns {number[][]} the currently selected block of tile indices, row-major */
  selectedBlock() {
    const s = this.#selection;
    const cols = this.#tileset.columns;
    const [minX, maxX] = [Math.min(s.x0, s.x1), Math.max(s.x0, s.x1)];
    const [minY, maxY] = [Math.min(s.y0, s.y1), Math.max(s.y0, s.y1)];
    const block = [];
    for (let y = minY; y <= maxY; y++) {
      const row = [];
      for (let x = minX; x <= maxX; x++) row.push(y * cols + x);
      block.push(row);
    }
    return block;
  }

  #draw() {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    if (this.#image) ctx.drawImage(this.#image, 0, 0);

    const size = this.#tileset.tileSize;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    for (let x = 0; x <= this._canvas.width; x += size) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this._canvas.height); ctx.stroke(); }
    for (let y = 0; y <= this._canvas.height; y += size) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this._canvas.width, y); ctx.stroke(); }

    if (this.#selection) {
      const s = this.#selection;
      const [minX, maxX] = [Math.min(s.x0, s.x1), Math.max(s.x0, s.x1)];
      const [minY, maxY] = [Math.min(s.y0, s.y1), Math.max(s.y0, s.y1)];
      ctx.strokeStyle = '#d98e4a';
      ctx.lineWidth = 2;
      ctx.strokeRect(minX * size, minY * size, (maxX - minX + 1) * size, (maxY - minY + 1) * size);
    }
  }
}

customElements.define('tileset-palette', TilesetPalette);
