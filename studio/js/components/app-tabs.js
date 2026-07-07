/**
 * <app-tabs tabs="Database,Maps,Scenes,Assets,Playtest" active="Database">
 * A plain tab strip; owns only which tab is selected, not what renders —
 * emits a bubbling, composed `tab-change` CustomEvent and lets app-layout
 * decide what content to show. Tabs not built yet in this phase (Maps,
 * Scenes, Assets, Playtest — Phases 5/6) still appear, disabled, so the
 * eventual shape of the app is visible from day one instead of tabs
 * popping into existence phase by phase.
 */
export class AppTabs extends HTMLElement {
  static get observedAttributes() { return ['tabs', 'active', 'enabled']; }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { display: block; }
        .strip { display: flex; gap: 0.25rem; border-bottom: 1px solid #3a2d1e; padding: 0 0.5rem; }
        button { font: inherit; font-size: 0.9rem; padding: 0.6rem 1rem; border: none; background: none;
                 color: #cbbfae; cursor: pointer; border-bottom: 2px solid transparent; }
        button:hover:not(:disabled) { color: #f2ede4; }
        button.active { color: #f2ede4; border-bottom-color: #d98e4a; }
        button:disabled { opacity: 0.35; cursor: default; }
      </style>
      <div class="strip"></div>
    `;
    this._strip = this._shadow.querySelector('.strip');
  }

  connectedCallback() {
    this.#render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  #render() {
    const tabs = (this.getAttribute('tabs') || '').split(',').map((t) => t.trim()).filter(Boolean);
    const active = this.getAttribute('active') || tabs[0];
    const enabled = new Set((this.getAttribute('enabled') || tabs.join(',')).split(',').map((t) => t.trim()));

    this._strip.innerHTML = tabs.map((tab) => {
      const isActive = tab === active;
      const isEnabled = enabled.has(tab);
      return `<button data-tab="${tab}" class="${isActive ? 'active' : ''}" ${isEnabled ? '' : 'disabled'}>${tab}</button>`;
    }).join('');

    this._strip.querySelectorAll('button:not(:disabled)').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setAttribute('active', btn.dataset.tab);
        this.dispatchEvent(new CustomEvent('tab-change', { detail: { tab: btn.dataset.tab }, bubbles: true, composed: true }));
      });
    });
  }
}

customElements.define('app-tabs', AppTabs);
