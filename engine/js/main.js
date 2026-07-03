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
 * map-scene stays ignorant of the scene stack (GDD 2.2: bus, not direct refs). */
function wireTransfers() {
  bus.on('map:transfer', ({ detail }) => {
    const project = window.__hearthlight.project;
    sceneStack.pop();
    pushMap(project, detail.map, detail.x, detail.y);
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
