/**
 * Save/load. GDD 2.3: "Three localStorage slots plus autosave, and a
 * Download Save / Load Save File button pair." Phase 2 delivers the core
 * mechanism — localStorage slots plus JSON export — used from the map (not
 * mid-VN-scene; GDD 3.2 lists "save prompt" as a map event command, and
 * resuming mid-dialogue is real added complexity with no clear payoff yet).
 * The Studio-facing "download/load file" buttons are a UI concern for a
 * later phase; exportSaveFile()/parseSaveFile() are the primitives they'll
 * call.
 */
const PREFIX = 'hearthlight:save:';

/**
 * @param {string} slot
 * @param {object} snapshot - e.g. { state, map, x, y, version }
 */
export function saveGame(slot, snapshot) {
  const record = { ...snapshot, savedAt: Date.now() };
  localStorage.setItem(PREFIX + slot, JSON.stringify(record));
  return record;
}

/** @param {string} slot @returns {object|null} */
export function loadGame(slot) {
  const raw = localStorage.getItem(PREFIX + slot);
  return raw ? JSON.parse(raw) : null;
}

/** @param {string} slot */
export function deleteSave(slot) {
  localStorage.removeItem(PREFIX + slot);
}

/** @returns {string[]} slot names that currently have a save */
export function listSaves() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) out.push(key.slice(PREFIX.length));
  }
  return out;
}

/** @param {object} snapshot @returns {Blob} for a "Download Save" button */
export function exportSaveFile(snapshot) {
  return new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
}

/** @param {string} text @returns {object} parsed save, for a "Load Save File" input */
export function parseSaveFile(text) {
  return JSON.parse(text);
}
