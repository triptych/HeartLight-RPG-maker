import { bus } from './events/bus.js';
import { state } from './core/state.js';
import { sceneStack } from './core/scene-stack.js';
import { input } from './core/input.js';
import { loadProject } from './core/loader.js';
import { saveGame, loadGame, exportSaveFile, parseSaveFile } from './core/saves.js';
import './components/map-scene.js';
import './components/game-toast.js';
import './components/vn-scene.js';
import './components/battle-scene.js';
import './components/title-scene.js';
import './components/game-menu.js';
import './components/touch-controls.js';

const PROJECT_URL = './data/project.json';
const ASSETS_BASE = './assets/';

async function boot() {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('main.js expects a #stage element in index.html');

  sceneStack.init(stage);
  input.listen();
  mountToast();
  mountTouchControls();
  wireHud();
  wireTransfers();
  wireVn();
  wireBattle();
  wireMenu();
  wireSaveLoad();

  const project = await loadProject(PROJECT_URL);
  window.__hearthlight = { bus, state, sceneStack, project };

  bus.emit('game:ready', { version: '0.3.1' });

  pushTitle(project);
}

function mountToast() {
  if (document.querySelector('game-toast')) return;
  document.body.appendChild(document.createElement('game-toast'));
}

function mountTouchControls() {
  if (document.querySelector('touch-controls')) return;
  document.body.appendChild(document.createElement('touch-controls'));
}

/** Push the title screen — GDD 2.2's scene-stack spine opens `[Title] →
 * [Map] → ...`, which nothing had actually implemented before now (boot()
 * used to go straight to the map). New Game resets state and starts at
 * meta.startMap/startPos; Continue applies the most recently saved
 * snapshot (any named slot, not the F5/F9 'quick' one). */
function pushTitle(project) {
  const el = document.createElement('title-scene');
  el.project = project;
  el.addEventListener('title:choice', ({ detail }) => {
    sceneStack.pop();
    if (detail.mode === 'continue' && detail.save) {
      applySnapshot(detail.save);
    } else {
      state.reset();
      const [startX, startY] = project.meta.startPos ?? [0, 0];
      pushMap(project, project.meta.startMap, startX, startY);
    }
  }, { once: true });
  sceneStack.push('Title', el);
}

function pushMap(project, mapId, x, y) {
  const el = document.createElement('map-scene');
  el.project = project;
  el.setAttribute('map', mapId);
  el.setAttribute('start-x', String(x));
  el.setAttribute('start-y', String(y));
  el.setAttribute('assets-base', ASSETS_BASE);
  sceneStack.push('Map', el);
}

/** A map event's `transfer` command asks for a map swap; handled here since
 * map-scene stays ignorant of the scene stack (GDD 2.2: bus, not direct refs).
 * If a <map-scene> is already on top, swap its map in place (switchMap) rather
 * than pop+push — that avoids tearing down and recreating the canvas on every
 * door, which caused a visible flash between the old frame and the new one's
 * first draw. Pop+push is still the right move if something else is on top
 * (e.g. a VN scene). Autosaves once the new map has actually loaded. */
function wireTransfers() {
  bus.on('map:transfer', ({ detail }) => {
    const project = window.__hearthlight.project;
    const top = sceneStack.top?.element;
    if (top?.tagName === 'MAP-SCENE') {
      top.switchMap(detail.map, detail.x, detail.y).then(() => autosave(top));
    } else {
      pushMap(project, detail.map, detail.x, detail.y);
    }
  });
}

/** A map event's "show scene" command (GDD 3.2) starts a VN scene on top of
 * whatever's on the stack — normally the map, which stays mounted and
 * visible-but-paused underneath (GDD Part V: scenes over maps, not instead
 * of them). `vn:done` fires when the VN script runs out of commands or
 * hits `end`; input.reset() on both ends keeps a stray held key or queued
 * press from leaking across the transition, same reasoning as the map
 * switch fix. Autosaves once control returns to the map. */
function wireVn() {
  bus.on('vn:play', ({ detail }) => {
    const mapEl = sceneStack.top?.element;
    mapEl?.pauseInput?.();
    input.reset();

    const el = document.createElement('vn-scene');
    el.project = window.__hearthlight.project;
    el.setAttribute('scene', detail.scene);
    sceneStack.push('VN', el);
  });

  bus.on('vn:done', () => {
    sceneStack.pop();
    input.reset();
    const mapEl = sceneStack.top?.element;
    mapEl?.resumeInput?.();
    if (mapEl?.tagName === 'MAP-SCENE') autosave(mapEl);
  });
}

/** A map event's `battle` command (GDD 3.2/3.4) starts a fight on top of
 * whatever's on the stack — same "scenes stack, they don't replace" pattern
 * as VN scenes, so a mid-battle VN beat (GDD Part V point 3) will one day
 * just be another push on top of THIS. `battle:done` carries the outcome
 * (won/lost/fled/befriended); the toast is a placeholder for a real result
 * screen (XP/gold/rewards) once leveling exists. Autosaves once control
 * returns to the map. */
function wireBattle() {
  bus.on('battle:start', ({ detail }) => {
    const top = sceneStack.top?.element;
    top?.pauseInput?.();
    input.reset();

    const el = document.createElement('battle-scene');
    el.project = window.__hearthlight.project;
    el.setAttribute('troop', detail.troop);
    sceneStack.push('Battle', el);
  });

  bus.on('battle:done', ({ detail }) => {
    sceneStack.pop();
    input.reset();
    const mapEl = sceneStack.top?.element;
    mapEl?.resumeInput?.();
    bus.emit('toast:show', { text: battleOutcomeMessage(detail.outcome) });
    if (mapEl?.tagName === 'MAP-SCENE') autosave(mapEl);
  });
}

function battleOutcomeMessage(outcome) {
  switch (outcome) {
    case 'won': return 'Victory!';
    case 'lost': return 'The party was defeated...';
    case 'fled': return 'Got away safely.';
    case 'befriended': return 'A new friend, not a fight.';
    default: return 'The battle ends.';
  }
}

/**
 * Escape opens/closes <game-menu> (GDD 2.1) over the map — same pause/
 * resume pattern as VN/Battle, only reachable from the map itself (not
 * mid-VN-scene or mid-battle, same reasoning saves.js already documents:
 * resuming mid-script is real complexity with no clear payoff yet).
 * Bypasses input.js's semantic 'menu' action and reads the raw key
 * directly, same as F5/F9, since nothing outside map-mode polls input.
 */
function wireMenu() {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    const top = sceneStack.top?.element;
    if (top?.tagName === 'GAME-MENU') {
      closeMenu();
    } else if (top?.tagName === 'MAP-SCENE') {
      openMenu(top);
    }
  });
}

function openMenu(mapEl) {
  mapEl.pauseInput?.();
  input.reset();

  const el = document.createElement('game-menu');
  el.addEventListener('game-menu:resume', () => closeMenu());
  el.addEventListener('game-menu:save', ({ detail }) => {
    saveGame(detail.slot, snapshotOf(mapEl));
    el.refresh();
    bus.emit('toast:show', { text: `Saved to ${detail.slot}.` });
  });
  el.addEventListener('game-menu:load', ({ detail }) => {
    const record = loadGame(detail.slot);
    if (!record) return;
    closeMenu();
    applySnapshot(record);
    bus.emit('toast:show', { text: 'Game loaded.' });
  });
  el.addEventListener('game-menu:download', () => {
    const blob = exportSaveFile(snapshotOf(mapEl));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hearthlight-save.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  el.addEventListener('game-menu:load-file', ({ detail }) => {
    try {
      const record = parseSaveFile(detail.text);
      closeMenu();
      applySnapshot(record);
      bus.emit('toast:show', { text: 'Game loaded from file.' });
    } catch {
      bus.emit('toast:show', { text: "That file isn't a valid save." });
    }
  });

  sceneStack.push('Menu', el);
}

function closeMenu() {
  sceneStack.pop();
  input.reset();
  sceneStack.top?.element?.resumeInput?.();
}

/** Minimal Phase 1 dev readout: map name + tile position, for eyeballing state. */
function wireHud() {
  const hud = document.getElementById('hud');
  if (!hud) return;

  bus.on('scene:push', () => updateHud(hud));
  bus.on('game:ready', (e) => {
    hud.dataset.version = e.detail.version;
  });

  setInterval(() => updateHud(hud), 200);
}

function updateHud(hud) {
  const scene = sceneStack.top?.element;
  if (!scene || scene.tagName !== 'MAP-SCENE' || !scene.runtime?.mapData) return;
  const { x, y } = scene.runtime.player;
  hud.textContent = `${scene.runtime.mapName} — (${x}, ${y})`;
}

/** @param {object} mapEl a connected, loaded &lt;map-scene&gt; @returns {object} a save snapshot */
function snapshotOf(mapEl) {
  const { x, y } = mapEl.runtime.player;
  return {
    state: state.toJSON(),
    map: mapEl.runtime.mapId,
    x,
    y,
    version: window.__hearthlight.project.meta.version,
  };
}

/** Apply a save snapshot: restore state, then move (or create) the map scene to match. */
function applySnapshot(record) {
  state.fromJSON(record.state);
  const top = sceneStack.top?.element;
  if (top?.tagName === 'MAP-SCENE') {
    top.switchMap(record.map, record.x, record.y);
  } else {
    sceneStack.clear();
    pushMap(window.__hearthlight.project, record.map, record.x, record.y);
  }
}

/** Autosave checkpoint — GDD 2.3's "plus autosave". Fired after map
 * transfers and after returning to the map from VN/Battle; not on a timer,
 * since those are exactly the moments where losing progress would sting. */
function autosave(mapEl) {
  if (!mapEl?.runtime?.mapData) return;
  saveGame('auto', snapshotOf(mapEl));
}

/**
 * Quicksave/quickload (F5/F9) — a power-user shortcut into the 'quick'
 * slot, independent of the named slot1/2/3 + autosave slots the game-menu
 * exposes. Only meaningful while a map is directly on top (not while the
 * menu itself is open — that's what the menu's own Save/Load buttons are
 * for). F5 is also the browser refresh key, hence preventDefault().
 */
function wireSaveLoad() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F5') {
      e.preventDefault();
      quicksave();
    } else if (e.code === 'F9') {
      e.preventDefault();
      quickload();
    }
  });
}

function quicksave() {
  const top = sceneStack.top?.element;
  if (top?.tagName !== 'MAP-SCENE' || !top.runtime?.mapData) return;
  saveGame('quick', snapshotOf(top));
  bus.emit('toast:show', { text: 'Game saved.' });
}

function quickload() {
  const record = loadGame('quick');
  if (!record) {
    bus.emit('toast:show', { text: 'No save found.' });
    return;
  }
  applySnapshot(record);
  bus.emit('toast:show', { text: 'Game loaded.' });
}

boot();
