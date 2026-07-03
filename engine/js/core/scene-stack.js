import { bus } from '../events/bus.js';

/**
 * The scene stack is the engine's spine (GDD 2.2): Title, Map, Battle, VN,
 * and Menu are all just entries pushed on top of one another. Pop always
 * restores exactly what was beneath it — this is what makes mid-battle VN
 * beats and map-dimmed VN scenes free instead of special-cased.
 */
class SceneStack {
  #stack = [];
  #root = null;

  /**
   * Attach the DOM container scenes mount into. Call once at boot.
   * @param {HTMLElement} root
   */
  init(root) {
    this.#root = root;
  }

  /** @returns {{type: string, element: HTMLElement}|null} the top entry */
  get top() {
    return this.#stack[this.#stack.length - 1] ?? null;
  }

  /** @returns {number} current stack depth */
  get depth() {
    return this.#stack.length;
  }

  /**
   * Push a new scene element on top of the stack. Does not remove or hide
   * whatever is beneath it — a Map scene stays mounted under a VN scene so
   * it can be dimmed-but-visible per GDD Part V.
   * @param {'Title'|'Map'|'Battle'|'VN'|'Menu'} type
   * @param {HTMLElement} element
   */
  push(type, element) {
    if (!this.#root) throw new Error('SceneStack.init(root) must be called before push()');
    element.dataset.sceneType = type;
    this.#root.appendChild(element);
    this.#stack.push({ type, element });
    bus.emit('scene:push', { type, depth: this.depth });
  }

  /**
   * Remove the top scene and restore whatever was beneath it.
   * @returns {{type: string, element: HTMLElement}|null} the popped entry
   */
  pop() {
    const entry = this.#stack.pop();
    if (!entry) return null;
    entry.element.remove();
    bus.emit('scene:pop', { type: entry.type, depth: this.depth, restored: this.top?.type ?? null });
    return entry;
  }

  /** Pop every scene down to an empty stack. */
  clear() {
    while (this.#stack.length) this.pop();
  }
}

/** The single shared scene stack instance. */
export const sceneStack = new SceneStack();
