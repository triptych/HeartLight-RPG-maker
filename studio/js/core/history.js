/**
 * Generic undo/redo command stack (GDD 6.1: "Undo/redo (command pattern
 * over map deltas)"). Deliberately not map-specific — anything with an
 * `{ apply(), revert() }` shape (see MapEditorModel's methods) can go
 * through this, so it's equally usable if a later editor (Scenes,
 * Database) ever wants real undo instead of just re-editing a field.
 */
export class HistoryStack {
  #undoStack = [];
  #redoStack = [];

  /** Run a command's apply() immediately and push it onto the undo stack. */
  push(command) {
    command.apply();
    this.#undoStack.push(command);
    this.#redoStack = [];
  }

  /** @returns {boolean} whether an undo was performed */
  undo() {
    const command = this.#undoStack.pop();
    if (!command) return false;
    command.revert();
    this.#redoStack.push(command);
    return true;
  }

  /** @returns {boolean} whether a redo was performed */
  redo() {
    const command = this.#redoStack.pop();
    if (!command) return false;
    command.apply();
    this.#undoStack.push(command);
    return true;
  }

  get canUndo() { return this.#undoStack.length > 0; }
  get canRedo() { return this.#redoStack.length > 0; }

  clear() {
    this.#undoStack = [];
    this.#redoStack = [];
  }
}
