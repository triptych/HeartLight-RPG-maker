import { MapRuntime } from '../modes/map-mode.js';
import { input } from '../core/input.js';

/**
 * <map-scene map="test-outside" start-x="5" start-y="9"> — owns the canvas
 * and the rAF loop; all actual map logic lives in MapRuntime so it stays
 * testable without a DOM. Pushed onto the scene stack like any other scene.
 */
export class MapScene extends HTMLElement {
  #runtime = new MapRuntime();
  #raf = null;
  #lastTime = 0;
  #ready = false;
  #resizeObserver = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { position: absolute; inset: 0; display: block; background: #0c0a09; }
        canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
      </style>
      <canvas></canvas>
    `;
    this._canvas = this._shadow.querySelector('canvas');
    this._ctx = this._canvas.getContext('2d');
  }

  /** Provide the parsed project.json before this element is connected. */
  set project(value) {
    this._project = value;
  }

  async connectedCallback() {
    this.#resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.#resize());
      this.#resizeObserver.observe(this);
    }

    const mapId = this.getAttribute('map');
    const startX = Number(this.getAttribute('start-x') ?? 0);
    const startY = Number(this.getAttribute('start-y') ?? 0);
    await this.#loadMap(mapId, startX, startY);

    this.#lastTime = performance.now();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  disconnectedCallback() {
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#resizeObserver?.disconnect();
  }

  /**
   * Load a different map into this same element/canvas/rAF loop — used for
   * in-place map-to-map transfers (a door) so the element is never torn down
   * and recreated. Tearing it down meant a real (if brief) gap between the
   * old canvas disappearing and the new one's first draw(), during which the
   * shadow host's background showed through as a flash — worse the faster
   * you cross back and forth. update() is paused (#ready = false) for the
   * duration so the canvas just keeps showing its last frame instead of
   * going blank, then swaps cleanly to the new map's first draw().
   * @param {string} mapId
   * @param {number} startX
   * @param {number} startY
   */
  async switchMap(mapId, startX, startY) {
    await this.#loadMap(mapId, startX, startY);
  }

  async #loadMap(mapId, startX, startY) {
    this.#ready = false;
    // A direction held or an interact queued right as the player crosses a
    // door shouldn't carry over and fire against the new map (stray moves,
    // stray event triggers) — see engine/js/core/input.js reset().
    input.reset();
    await this.#runtime.load({
      project: this._project,
      mapId,
      assetsBaseUrl: this.getAttribute('assets-base') ?? 'assets/',
      startX,
      startY,
    });
    this.setAttribute('map', mapId);
    this.#ready = true;
  }

  #resize() {
    const rect = this.getBoundingClientRect();
    this._canvas.width = Math.max(1, Math.round(rect.width || window.innerWidth));
    this._canvas.height = Math.max(1, Math.round(rect.height || window.innerHeight));
  }

  #tick = (now) => {
    const dt = Math.min(100, now - this.#lastTime);
    this.#lastTime = now;
    if (this.#ready) {
      const viewport = { width: this._canvas.width, height: this._canvas.height };
      this.#runtime.update(dt, viewport);
      this.#runtime.draw(this._ctx, viewport);
    }
    this.#raf = requestAnimationFrame(this.#tick);
  };

  /** Exposed for HUD/dev overlays and tests. */
  get runtime() {
    return this.#runtime;
  }
}

customElements.define('map-scene', MapScene);
