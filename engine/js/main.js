import { bus } from './events/bus.js';
import { state } from './core/state.js';
import { sceneStack } from './core/scene-stack.js';
import './components/scene-placeholder.js';

const VERSION = '0.0.1-phase0';

const SCENE_LABELS = {
  'push-title': 'Title',
  'push-map': 'Map',
  'push-battle': 'Battle',
  'push-vn': 'VN',
};

function boot() {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('main.js expects a #stage element in index.html');

  sceneStack.init(stage);
  wireDevToolbar();
  logBusTraffic();

  bus.emit('game:ready', { version: VERSION });
}

/** Phase 0 exit-test scaffolding: buttons to push/pop scenes by hand. */
function wireDevToolbar() {
  const toolbar = document.getElementById('dev-toolbar');
  if (!toolbar) return;

  const status = document.getElementById('status');
  const depthLabel = document.getElementById('depth');
  const updateDepth = () => {
    if (depthLabel) depthLabel.textContent = 'depth: ' + sceneStack.depth;
  };

  toolbar.addEventListener('click', (event) => {
    const action = event.target && event.target.dataset ? event.target.dataset.action : null;
    if (!action) return;

    if (action === 'pop') {
      sceneStack.pop();
    } else {
      const label = SCENE_LABELS[action];
      if (!label) return;
      const el = document.createElement('scene-placeholder');
      el.setAttribute('type', label);
      sceneStack.push(label, el);
    }
    updateDepth();
  });

  bus.on('game:ready', (event) => {
    if (status) status.textContent = 'game:ready - v' + event.detail.version;
  });
}

function logBusTraffic() {
  bus.on('scene:push', (e) => console.log('[scene:push]', e.detail));
  bus.on('scene:pop', (e) => console.log('[scene:pop]', e.detail));
  bus.on('state:flag', (e) => console.log('[state:flag]', e.detail));
}

// Expose for manual console poking during Phase 0 development only.
window.__hearthlight = { bus, state, sceneStack };

boot();
