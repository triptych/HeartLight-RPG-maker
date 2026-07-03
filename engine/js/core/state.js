import { bus } from '../events/bus.js';

/** @returns {object} a fresh, empty GameState shape (GDD 2.2) */
function createInitialState() {
  return {
    party: [],
    inventory: [],
    gold: 0,
    flags: {},
    vars: {},
    rapport: {},
    position: { map: null, x: 0, y: 0 },
    questLog: [],
    playtime: 0,
  };
}

/**
 * The single serializable game state object. Every mutation goes through a
 * method here so the UI can react via bus events instead of polling —
 * see GDD 2.2: "State is one serializable object."
 */
class GameState {
  #data = createInitialState();

  get data() {
    return this.#data;
  }

  reset() {
    this.#data = createInitialState();
    bus.emit('state:reset', {});
  }

  /** @param {string} key @param {boolean} [value] */
  setFlag(key, value = true) {
    this.#data.flags[key] = value;
    bus.emit('state:flag', { key, value });
  }

  /** @param {string} key @returns {boolean} */
  getFlag(key) {
    return Boolean(this.#data.flags[key]);
  }

  /** @param {string} key @param {number|string} value */
  setVar(key, value) {
    this.#data.vars[key] = value;
    bus.emit('state:var', { key, value });
  }

  /** @param {string} key */
  getVar(key) {
    return this.#data.vars[key];
  }

  /** @param {string} id @param {number} [qty] */
  addItem(id, qty = 1) {
    const entry = this.#data.inventory.find((i) => i.id === id);
    if (entry) entry.qty += qty;
    else this.#data.inventory.push({ id, qty });
    bus.emit('state:item', { id, qty, action: 'add' });
  }

  /** @param {string} id @param {number} [qty] @returns {boolean} whether removal succeeded */
  removeItem(id, qty = 1) {
    const entry = this.#data.inventory.find((i) => i.id === id);
    if (!entry || entry.qty < qty) return false;
    entry.qty -= qty;
    if (entry.qty <= 0) {
      this.#data.inventory = this.#data.inventory.filter((i) => i.id !== id);
    }
    bus.emit('state:item', { id, qty, action: 'remove' });
    return true;
  }

  /** @param {string} who @param {number} amount */
  addRapport(who, amount) {
    const next = (this.#data.rapport[who] || 0) + amount;
    this.#data.rapport[who] = Math.max(0, Math.min(100, next));
    bus.emit('state:rapport', { who, value: this.#data.rapport[who] });
  }

  /** @returns {string} JSON-serialized state, suitable for a save slot */
  toJSON() {
    return JSON.stringify(this.#data);
  }

  /** @param {string} json */
  fromJSON(json) {
    this.#data = JSON.parse(json);
    bus.emit('state:loaded', {});
  }
}

/** The single shared state instance. */
export const state = new GameState();
