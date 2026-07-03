/**
 * Keyboard -> semantic action mapping. Map/battle/menu code asks
 * "isDown('up')" or "consumePressed('interact')" and never touches a
 * KeyboardEvent directly (GDD 2.1: input.js turns raw input into actions).
 */
const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'interact', Enter: 'interact', KeyZ: 'interact',
  Escape: 'menu',
};

class InputManager {
  #down = new Set();
  #pressedEdge = new Set();
  #listening = false;

  /** Attach keydown/keyup listeners. Call once at boot. */
  listen(target = window) {
    if (this.#listening) return;
    this.#listening = true;
    target.addEventListener('keydown', this.#onKeyDown);
    target.addEventListener('keyup', this.#onKeyUp);
  }

  /** Remove listeners (tests / teardown). */
  stop(target = window) {
    this.#listening = false;
    target.removeEventListener('keydown', this.#onKeyDown);
    target.removeEventListener('keyup', this.#onKeyUp);
  }

  #onKeyDown = (event) => {
    const action = KEY_MAP[event.code];
    if (!action) return;
    if (!this.#down.has(action)) this.#pressedEdge.add(action);
    this.#down.add(action);
  };

  #onKeyUp = (event) => {
    const action = KEY_MAP[event.code];
    if (!action) return;
    this.#down.delete(action);
    this.#pressedEdge.delete(action);
  };

  /** @param {string} action @returns {boolean} true while the mapped key is held */
  isDown(action) {
    return this.#down.has(action);
  }

  /**
   * @param {string} action
   * @returns {boolean} true exactly once per fresh keydown (edge-triggered),
   * then clears — used for interact and menu so holding doesn't repeat.
   */
  consumePressed(action) {
    if (this.#pressedEdge.has(action)) {
      this.#pressedEdge.delete(action);
      return true;
    }
    return false;
  }

  /** Simulate a key event directly (tests, or virtual/touch controls later). */
  simulateDown(action) {
    if (!this.#down.has(action)) this.#pressedEdge.add(action);
    this.#down.add(action);
  }

  simulateUp(action) {
    this.#down.delete(action);
  }

  /**
   * Clear all held and pending-press state. Called when a map switch starts
   * (see map-scene.js #loadMap) so a direction held or an interact queued
   * right before crossing a door can't leak into the new map's first frame
   * as a stray move or a stray event trigger. Trade-off: since held state is
   * only updated by keydown/keyup events (not polled), a key physically
   * still held through the transition will read as "up" until the player
   * releases and presses it again — walking through a door won't carry
   * momentum into the new map. That's an intentional bias toward
   * predictability over seamlessness for now; revisit if it feels bad in
   * playtesting.
   */
  reset() {
    this.#down.clear();
    this.#pressedEdge.clear();
  }
}

export const input = new InputManager();
