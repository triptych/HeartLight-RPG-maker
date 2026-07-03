/**
 * Keyboard/mouse/touch → semantic action mapping. Stubbed in Phase 0; the
 * real input layer (movement, interact, menu navigation, buffering) lands
 * in Phase 1 alongside map mode (GDD Part IX). Placeholder kept here so
 * scene modules can already import a stable `input` object.
 */
class InputManager {
  /** @returns {boolean} always false until Phase 1 wires real key state */
  isDown(_action) {
    return false;
  }
}

export const input = new InputManager();
