import { bus } from './events/bus.js';
import { state } from './core/state.js';
import { sceneStack } from './core/scene-stack.js';
import { input } from './core/input.js';
import { loadProject } from './core/loader.js';
import './components/map-scene.js';
import './components/game-toast.js';

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

  const project = await loadProject(PROJECT_URL);
  window.__hearthlight = { bus, state, sceneStack, project };

  bus.emit('game:ready', { version: '0.1.0-phase1' });

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

boot();
