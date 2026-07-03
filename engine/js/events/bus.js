/**
 * Singleton event bus for decoupled communication between engine systems.
 * Map mode, battle mode, VN mode, and UI components never call each other
 * directly — they emit and listen here. This is the only allowed coupling
 * mechanism between modules (see GDD 2.2, Architectural rules).
 */
class EventBus extends EventTarget {
  /**
   * Emit a named event with an optional detail payload.
   * @param {string} name
   * @param {*} [detail]
   */
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /**
   * Subscribe to a named event.
   * @param {string} name
   * @param {(event: CustomEvent) => void} callback
   * @returns {() => void} unsubscribe function
   */
  on(name, callback) {
    this.addEventListener(name, callback);
    return () => this.removeEventListener(name, callback);
  }

  /**
   * Subscribe to a named event for a single invocation.
   * @param {string} name
   * @param {(event: CustomEvent) => void} callback
   */
  once(name, callback) {
    this.addEventListener(name, callback, { once: true });
  }
}

/** The single shared bus instance. Import this, never instantiate EventBus yourself. */
export const bus = new EventBus();
