import { bus } from './events/bus.js';
import { state } from './core/state.js';
import { sceneStack } from './core/scene-stack.js';
import { input } from './core/input.js';
import { loadProject } from './core/loader.js';
import { saveGame, loadGame } from './core/saves.js';
import './components/map-scene.js';
import './components/game-toast.js';
import './components/vn-scene.js';

const PROJECT_URL = './data/project.json';
const ASSETS_BASE = './assets/';

async function boot() {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('main.js expects a #stage element in index.html');

  sceneStack.init(stage);
  input.listen();
  mountToast();
  wireHud();
  wireTransfers();
  wireVn();
  wireSaveLoad();

  const project = await loadProject(PROJECT_URL);
  window.__hearthlight = { bus, state, sceneStack, project };

  bus.emit('game:ready', { version: '0.2.0-phase2' });

  const [startX, startY] = project.meta.startPos ?? [0, 0];
  pushMap(project, project.meta.startMap, startX, startY);
}

function mountToast() {
  if (document.querySelector('game-toast')) return;
  document.body.appendChild(document.createElement('game-toast'));
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
 * (e.g. a VN scene, once that exists). */
function wireTransfers() {
  bus.on('map:transfer', ({ detail }) => {
    const project = window.__hearthlight.project;
    const top = sceneStack.top?.element;
    if (top?.tagName === 'MAP-SCENE') {
      top.switchMap(detail.map, detail.x, detail.y);
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
 * switch fix. */
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
    sceneStack.top?.element?.resumeInput?.();
  });
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

/**
 * Quicksave/quickload (F5/F9) — Phase 2's slice of GDD 2.3's save system.
 * Only meaningful while a map is on top: mid-VN-scene resume is real added
 * complexity (where in the script do you resume?) with no clear payoff yet,
 * so saving there is a no-op. F5 is also the browser refresh key, hence
 * preventDefault().
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
  const { x, y } = top.runtime.player;
  saveGame('quick', {
    state: state.toJSON(),
    map: top.runtime.mapId,
    x,
    y,
    version: window.__hearthlight.project.meta.version,
  });
  bus.emit('toast:show', { text: 'Game saved.' });
}

function quickload() {
  const record = loadGame('quick');
  if (!record) {
    bus.emit('toast:show', { text: 'No save found.' });
    return;
  }
  state.fromJSON(record.state);
  const top = sceneStack.top?.element;
  if (top?.tagName === 'MAP-SCENE') {
    top.switchMap(record.map, record.x, record.y);
  } else {
    sceneStack.clear();
    pushMap(window.__hearthlight.project, record.map, record.x, record.y);
  }
  bus.emit('toast:show', { text: 'Game loaded.' });
}

boot();
