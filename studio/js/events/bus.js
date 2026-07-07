/**
 * Studio's own singleton event bus — deliberately a separate, tiny copy of
 * the engine's `engine/js/events/bus.js` rather than a shared import.
 * Studio and the runtime are two independent web apps (GDD 2.1's repo
 * layout: `/engine`, `/studio`, `/games/wayfarers-rest`) that only ever
 * touch the same *data* (project.json), never the same running process —
 * even once the Playtest tab (Phase 6) puts the runtime in an iframe, that
 * iframe is a separate document with its own bus instance. Cross-importing
 * would just be a coincidence of file layout, not a real coupling need.
 */
class EventBus extends EventTarget {
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
  on(name, callback) {
    this.addEventListener(name, callback);
    return () => this.removeEventListener(name, callback);
  }
}

export const bus = new EventBus();
