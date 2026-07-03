/**
 * <scene-placeholder type="Map"> — a stand-in scene panel used to prove
 * the scene stack works before Phase 1-3 build the real Map/Battle/VN
 * renderers. Shadow DOM, reactive `type` attribute, cleanup on removal —
 * the pattern every real scene component will follow.
 */
const PRESETS = {
  Title: { bg: '#241f3a', opacity: 1, label: 'TITLE SCREEN' },
  Map: { bg: '#1f3a2e', opacity: 1, label: 'MAP' },
  Battle: { bg: '#3a1f1f', opacity: 1, label: 'BATTLE' },
  VN: { bg: '#1f2b3a', opacity: 0.6, label: 'VN SCENE (map dimmed beneath)' },
  Menu: { bg: '#3a331f', opacity: 0.85, label: 'MENU' },
};

export class ScenePlaceholder extends HTMLElement {
  static get observedAttributes() {
    return ['type'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    this._render();
  }

  disconnectedCallback() {
    this._shadow.innerHTML = '';
  }

  _render() {
    const type = this.getAttribute('type') || 'Map';
    const { bg, opacity, label } = PRESETS[type] || PRESETS.Map;
    this._shadow.innerHTML = `
      <style>
        :host {
          position: absolute;
          inset: 0;
          display: block;
          pointer-events: none;
        }
        .panel {
          position: absolute;
          inset: 0;
          background: ${bg};
          opacity: ${opacity};
          color: #f2ede4;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          font: 600 1.1rem/1.4 system-ui, sans-serif;
          letter-spacing: 0.06em;
          border: 2px solid rgba(242, 237, 228, 0.15);
        }
      </style>
      <div class="panel">${label}</div>
    `;
  }
}

customElements.define('scene-placeholder', ScenePlaceholder);
