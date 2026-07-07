import './components/app-layout.js';

function boot() {
  const root = document.getElementById('app');
  if (!root) throw new Error('studio main.js expects an #app element in index.html');
  root.appendChild(document.createElement('app-layout'));
}

boot();
