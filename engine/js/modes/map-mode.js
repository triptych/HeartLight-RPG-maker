import { bus } from '../events/bus.js';
import { state } from '../core/state.js';
import { input } from '../core/input.js';
import { loadTileset } from '../core/loader.js';

const DIR_VECTORS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIRECTIONS = ['up', 'down', 'left', 'right'];
const STEP_MS = 140;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** @param {object} page @returns {boolean} whether a page's conditions currently pass */
function pageConditionsPass(page) {
  const c = page.conditions;
  if (!c) return true;
  if (c.flag && !state.getFlag(c.flag)) return false;
  if (c.flagNot && state.getFlag(c.flagNot)) return false;
  return true;
}

/**
 * MapRuntime is pure logic: it owns no DOM. <map-scene> (components/map-scene.js)
 * instantiates one, drives it with update()/draw() each frame, and owns the
 * actual <canvas>. This split mirrors the engine's modes/ vs components/
 * separation (GDD 2.1) — the same runtime could be tested or driven headless.
 *
 * Implements GDD Part III: tile layers, collision, camera follow/clamp/lerp,
 * 4-directional grid movement with buffering + hold-to-repeat, and map events
 * (action/touch triggers, ordered pages with flag conditions). The command
 * executor here is intentionally minimal (transfer/flag/toast) — the full
 * ~30-command vocabulary shared with VN scenes (GDD 4.2) lands in Phase 2/3
 * and will supersede this switch statement.
 */
export class MapRuntime {
  animT = 0;

  /**
   * @param {object} opts
   * @param {object} opts.project - full project.json, already parsed
   * @param {string} opts.mapId
   * @param {string} opts.assetsBaseUrl - e.g. 'assets/' resolved against the page URL
   * @param {number} [opts.startX]
   * @param {number} [opts.startY]
   * @returns {Promise<MapRuntime>}
   */
  async load({ project, mapId, assetsBaseUrl, startX, startY }) {
    const mapData = project.maps && project.maps[mapId];
    if (!mapData) throw new Error(`Unknown map id: ${mapId}`);

    const tilesetUrl = new URL(mapData.tileset, new URL(assetsBaseUrl, window.location.href)).href;
    const { meta: tileset, image: tilesetImage } = await loadTileset(tilesetUrl);

    this.mapId = mapId;
    this.mapData = mapData;
    this.tileset = tileset;
    this.tilesetImage = tilesetImage;
    this.tileSize = tileset.tileSize;
    this.animT = 0;

    const [sx, sy] = [startX ?? 0, startY ?? 0];
    this.player = {
      x: sx,
      y: sy,
      pixelX: sx * this.tileSize,
      pixelY: sy * this.tileSize,
      facing: 'down',
      moving: false,
      moveFrom: { x: sx, y: sy },
      moveT: 0,
    };
    this.camera = { x: 0, y: 0 };

    return this;
  }

  get mapName() {
    return this.mapData?.name ?? this.mapId;
  }

  /**
   * @param {number} dt milliseconds since last frame
   * @param {{width: number, height: number}} viewport
   */
  update(dt, viewport) {
    this.animT += dt;

    if (this.player.moving) {
      this.#advanceMove(dt);
    } else {
      this.#tryInteract();
      this.#tryStartMove();
    }

    this.#updateCamera(dt, viewport);
  }

  #tryStartMove() {
    let dir = null;
    for (const d of DIRECTIONS) {
      if (input.consumePressed(d)) {
        dir = d;
        break;
      }
    }
    if (!dir) {
      for (const d of DIRECTIONS) {
        if (input.isDown(d)) {
          dir = d;
          break;
        }
      }
    }
    if (!dir) return;

    this.player.facing = dir;
    const [dx, dy] = DIR_VECTORS[dir];
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    if (!this.#isPassable(nx, ny)) return;

    this.player.moveFrom = { x: this.player.x, y: this.player.y };
    this.player.x = nx;
    this.player.y = ny;
    this.player.moving = true;
    this.player.moveT = 0;
  }

  #advanceMove(dt) {
    this.player.moveT += dt;
    const t = clamp(this.player.moveT / STEP_MS, 0, 1);
    this.player.pixelX = lerp(this.player.moveFrom.x * this.tileSize, this.player.x * this.tileSize, t);
    this.player.pixelY = lerp(this.player.moveFrom.y * this.tileSize, this.player.y * this.tileSize, t);
    if (t >= 1) {
      this.player.moving = false;
      this.#onArrive();
    }
  }

  #onArrive() {
    const ev = this.#eventAt(this.player.x, this.player.y);
    if (ev && ev.trigger === 'touch') this.#runEvent(ev);
  }

  #tryInteract() {
    if (!input.consumePressed('interact')) return;
    const [dx, dy] = DIR_VECTORS[this.player.facing];
    const ev = this.#eventAt(this.player.x + dx, this.player.y + dy);
    if (ev && ev.trigger === 'action') this.#runEvent(ev);
  }

  /** @returns {object|undefined} the event at a tile, if any */
  #eventAt(x, y) {
    return this.mapData.events?.find((e) => e.x === x && e.y === y);
  }

  /** @param {object} ev @returns {object|null} highest-priority page whose conditions pass */
  #activePage(ev) {
    for (let i = ev.pages.length - 1; i >= 0; i--) {
      if (pageConditionsPass(ev.pages[i])) return ev.pages[i];
    }
    return null;
  }

  #runEvent(ev) {
    const page = this.#activePage(ev);
    if (!page) return;
    this.#runCommands(page.commands || []);
  }

  #runCommands(commands) {
    for (const cmd of commands) {
      switch (cmd.cmd) {
        case 'transfer':
          bus.emit('map:transfer', { map: cmd.map, x: cmd.x, y: cmd.y });
          return; // a transfer ends this map's runtime; don't run anything after it
        case 'flag':
          state.setFlag(cmd.set, cmd.value !== undefined ? cmd.value : true);
          break;
        case 'toast':
          bus.emit('toast:show', { text: cmd.text });
          break;
        default:
          console.warn(`[map-mode] command "${cmd.cmd}" isn't supported until the shared Phase 2/3 interpreter lands`, cmd);
      }
    }
  }

  #isPassable(x, y) {
    const [w, h] = this.mapData.size;
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = y * w + x;
    if (this.mapData.collision && this.mapData.collision[i]) return false;
    if (!this.#tilePassable('ground', i)) return false;
    if (!this.#tilePassable('decor', i)) return false;
    const ev = this.#eventAt(x, y);
    if (ev && ev.solid) return false;
    return true;
  }

  #tilePassable(layerName, i) {
    const layer = this.mapData.layers[layerName];
    if (!layer) return true;
    const tileIndex = layer[i];
    if (tileIndex === -1 || tileIndex === null || tileIndex === undefined) return true;
    const meta = this.tileset.tiles[String(tileIndex)];
    if (!meta) return true;
    return meta.passable !== false;
  }

  #animFrame(meta) {
    const frameIdx = Math.floor(this.animT / meta.animSpeed) % meta.anim.length;
    return meta.anim[frameIdx];
  }

  #updateCamera(dt, viewport) {
    const [w, h] = this.mapData.size;
    const mapPxW = w * this.tileSize;
    const mapPxH = h * this.tileSize;
    const targetX = clamp(this.player.pixelX + this.tileSize / 2 - viewport.width / 2, 0, Math.max(0, mapPxW - viewport.width));
    const targetY = clamp(this.player.pixelY + this.tileSize / 2 - viewport.height / 2, 0, Math.max(0, mapPxH - viewport.height));
    const lerpFactor = 1 - Math.pow(0.001, dt / 1000);
    this.camera.x += (targetX - this.camera.x) * lerpFactor;
    this.camera.y += (targetY - this.camera.y) * lerpFactor;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{width: number, height: number}} viewport
   */
  draw(ctx, viewport) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    ctx.save();
    ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));
    this.#drawLayer(ctx, 'ground');
    this.#drawLayer(ctx, 'decor');
    this.#drawEvents(ctx);
    this.#drawPlayer(ctx);
    this.#drawLayer(ctx, 'overhead');
    ctx.restore();
  }

  /**
   * Placeholder prop marker for events that have no sprite yet (GDD 3.2:
   * events can have "a sprite (or invisible)" — nothing wires a real sprite
   * in until content/assets exist). Without this, a solid event like a
   * signpost is a plain ground tile you mysteriously can't walk onto.
   * Touch-only, non-solid events (doors) are skipped — those are meant to
   * read as part of the floor, cued by the ground tile itself.
   */
  #drawEvents(ctx) {
    const s = this.tileSize;
    for (const ev of this.mapData.events ?? []) {
      if (ev.trigger === 'touch' && !ev.solid) continue;
      const px = ev.x * s;
      const py = ev.y * s;
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(px + s * 0.44, py + s * 0.3, s * 0.12, s * 0.55);
      ctx.fillStyle = '#8a6a45';
      ctx.fillRect(px + s * 0.22, py + s * 0.2, s * 0.56, s * 0.22);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + s * 0.22, py + s * 0.2, s * 0.56, s * 0.22);
    }
  }

  #drawLayer(ctx, name) {
    const layer = this.mapData.layers[name];
    if (!layer) return;
    const [w, h] = this.mapData.size;
    const cols = this.tileset.columns;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let idx = layer[y * w + x];
        if (idx === -1 || idx === null || idx === undefined) continue;
        const meta = this.tileset.tiles[String(idx)];
        if (meta && meta.anim) idx = this.#animFrame(meta);
        const sx = (idx % cols) * this.tileSize;
        const sy = Math.floor(idx / cols) * this.tileSize;
        ctx.drawImage(this.tilesetImage, sx, sy, this.tileSize, this.tileSize, x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
      }
    }
  }

  #drawPlayer(ctx) {
    const { pixelX: px, pixelY: py, facing } = this.player;
    const s = this.tileSize;
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(px + s * 0.2, py + s * 0.15, s * 0.6, s * 0.7);
    ctx.fillStyle = '#3a2e22';
    const [dx, dy] = DIR_VECTORS[facing];
    ctx.fillRect(px + s / 2 + dx * s * 0.3 - 2, py + s / 2 + dy * s * 0.3 - 2, 4, 4);
  }
}
