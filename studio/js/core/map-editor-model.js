/**
 * MapEditorModel — pure logic over one map's data (GDD Part VII `maps.id`
 * shape), no canvas/DOM at all. Mirrors the engine's MapRuntime split
 * (modes/ owns rules, components/ owns rendering) so every tool operation
 * here is testable head-on, the same way MapRuntime's collision/movement
 * logic is. `<map-canvas>` (Phase 5's component layer) drives this and
 * only ever reads back the resulting arrays to draw them.
 *
 * Every mutating method returns an undo/redo-ready command object
 * `{ apply(), revert() }` (see core/history.js) rather than mutating and
 * returning nothing — the caller decides whether/when to push it onto a
 * HistoryStack, which keeps this class ignorant of undo/redo bookkeeping.
 */
export class MapEditorModel {
  /** @param {object} mapData a project.maps[id] entry — mutated in place */
  constructor(mapData) {
    this.mapData = mapData;
  }

  get width() { return this.mapData.size[0]; }
  get height() { return this.mapData.size[1]; }

  #index(x, y) { return y * this.width + x; }
  #inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

  /** @param {'ground'|'decor'|'overhead'} layerName @param {number} x @param {number} y @returns {number} */
  tileAt(layerName, x, y) {
    if (!this.#inBounds(x, y)) return -1;
    return this.mapData.layers[layerName][this.#index(x, y)];
  }

  /** @returns {number} 0 or 1 */
  collisionAt(x, y) {
    if (!this.#inBounds(x, y)) return 1;
    return this.mapData.collision[this.#index(x, y)] ?? 0;
  }

  /**
   * Paint a single tile (or the top-left of a multi-tile block — palette
   * marquee selections paint their whole footprint, clipped at map edges).
   * @param {'ground'|'decor'|'overhead'} layerName
   * @param {number} x @param {number} y
   * @param {number[][]} block a 2D array of tile indices (1x1 for a single tile)
   */
  paint(layerName, x, y, block) {
    const layer = this.mapData.layers[layerName];
    const before = layer.slice();
    for (let by = 0; by < block.length; by++) {
      for (let bx = 0; bx < block[by].length; bx++) {
        const tx = x + bx, ty = y + by;
        if (!this.#inBounds(tx, ty)) continue;
        layer[this.#index(tx, ty)] = block[by][bx];
      }
    }
    const after = layer.slice();
    return this.#arrayCommand(layer, before, after);
  }

  /** Rectangle fill between two corners (inclusive), tiled with `block` if it's larger than 1x1. */
  paintRect(layerName, x0, y0, x1, y1, block) {
    const layer = this.mapData.layers[layerName];
    const before = layer.slice();
    const [minX, maxX] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [minY, maxY] = [Math.min(y0, y1), Math.max(y0, y1)];
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!this.#inBounds(tx, ty)) continue;
        const bx = (tx - minX) % block[0].length;
        const by = (ty - minY) % block.length;
        layer[this.#index(tx, ty)] = block[by][bx];
      }
    }
    const after = layer.slice();
    return this.#arrayCommand(layer, before, after);
  }

  /** Flood fill (paint bucket) starting at (x,y) with a single tile index, 4-connected, same-tile-only. */
  floodFill(layerName, x, y, tileIndex) {
    const layer = this.mapData.layers[layerName];
    const before = layer.slice();
    const target = this.tileAt(layerName, x, y);
    if (target === tileIndex) return this.#arrayCommand(layer, before, before); // no-op, still returns a valid (empty) command

    const stack = [[x, y]];
    const seen = new Set();
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (!this.#inBounds(cx, cy)) continue;
      const key = `${cx},${cy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.tileAt(layerName, cx, cy) !== target) continue;
      layer[this.#index(cx, cy)] = tileIndex;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    const after = layer.slice();
    return this.#arrayCommand(layer, before, after);
  }

  /** Eyedropper — no undo needed (it's a read), kept here anyway so callers don't reach into mapData directly. */
  eyedropper(layerName, x, y) {
    return this.tileAt(layerName, x, y);
  }

  /** Paint the collision overlay (0/1) as a rectangle, same clipping rules as paintRect. */
  setCollisionRect(x0, y0, x1, y1, value) {
    const layer = this.mapData.collision;
    const before = layer.slice();
    const [minX, maxX] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [minY, maxY] = [Math.min(y0, y1), Math.max(y0, y1)];
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!this.#inBounds(tx, ty)) continue;
        layer[this.#index(tx, ty)] = value ? 1 : 0;
      }
    }
    const after = layer.slice();
    return this.#arrayCommand(layer, before, after);
  }

  #arrayCommand(layerArrayRef, before, after) {
    return {
      apply: () => { for (let i = 0; i < after.length; i++) layerArrayRef[i] = after[i]; },
      revert: () => { for (let i = 0; i < before.length; i++) layerArrayRef[i] = before[i]; },
    };
  }

  // --- Events ---------------------------------------------------------

  /** @param {object} event a full event object (id/x/y/trigger/solid/pages) */
  addEvent(event) {
    const events = this.mapData.events;
    return {
      apply: () => { events.push(event); },
      revert: () => { const i = events.indexOf(event); if (i >= 0) events.splice(i, 1); },
    };
  }

  /** @param {string} id @param {object} patch shallow-merged onto the existing event */
  updateEvent(id, patch) {
    const events = this.mapData.events;
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`[map-editor] unknown event id: ${id}`);
    const before = { ...events[idx] };
    const after = { ...events[idx], ...patch };
    return {
      apply: () => { events[idx] = after; },
      revert: () => { events[idx] = before; },
    };
  }

  /** @param {string} id */
  removeEvent(id) {
    const events = this.mapData.events;
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`[map-editor] unknown event id: ${id}`);
    const removed = events[idx];
    return {
      apply: () => { const i = events.indexOf(removed); if (i >= 0) events.splice(i, 1); },
      revert: () => { events.splice(idx, 0, removed); },
    };
  }

  eventAt(x, y) {
    return this.mapData.events.find((e) => e.x === x && e.y === y) ?? null;
  }

  // --- Resize -----------------------------------------------------------

  /**
   * Resize the map, anchoring existing content at the top-left. Growing
   * pads new cells (0 for ground/collision, -1 for decor/overhead, i.e.
   * "nothing drawn there"); shrinking truncates and drops any event that
   * would fall outside the new bounds (returned in the command so the
   * caller — the properties panel — can warn about it before committing).
   */
  resize(newW, newH) {
    const oldW = this.width, oldH = this.height;
    const before = {
      size: [...this.mapData.size],
      layers: { ground: this.mapData.layers.ground.slice(), decor: this.mapData.layers.decor.slice(), overhead: this.mapData.layers.overhead.slice() },
      collision: this.mapData.collision.slice(),
      events: this.mapData.events.slice(),
    };

    const remap = (arr, fill) => {
      const out = new Array(newW * newH).fill(fill);
      for (let y = 0; y < Math.min(oldH, newH); y++) {
        for (let x = 0; x < Math.min(oldW, newW); x++) {
          out[y * newW + x] = arr[y * oldW + x];
        }
      }
      return out;
    };

    const after = {
      size: [newW, newH],
      layers: {
        ground: remap(this.mapData.layers.ground, 0),
        decor: remap(this.mapData.layers.decor, -1),
        overhead: remap(this.mapData.layers.overhead, -1),
      },
      collision: remap(this.mapData.collision, 0),
      events: this.mapData.events.filter((e) => e.x < newW && e.y < newH),
    };
    const droppedEvents = this.mapData.events.filter((e) => e.x >= newW || e.y >= newH);

    return {
      droppedEvents,
      apply: () => Object.assign(this.mapData, after),
      revert: () => Object.assign(this.mapData, before),
    };
  }
}
