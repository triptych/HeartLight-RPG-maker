import { runScript } from '../core/interpreter.js';
import { bus } from '../events/bus.js';
import './vn-stage.js';
import './vn-textbox.js';
import './vn-choices.js';

/**
 * <vn-scene scene="scene.demo.intro"> — owns the VN-mode DOM (stage,
 * textbox, choices) and drives the shared interpreter. Pushed on top of
 * whatever's already on the scene stack (usually a map) without removing
 * it — GDD Part V: "Scenes over maps," conversations happen in the world,
 * not instead of it.
 */
export class VnScene extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { position: absolute; inset: 0; display: block; }
      </style>
      <vn-stage></vn-stage>
      <vn-textbox></vn-textbox>
      <vn-choices></vn-choices>
    `;
    this._stage = this._shadow.querySelector('vn-stage');
    this._textbox = this._shadow.querySelector('vn-textbox');
    this._choices = this._shadow.querySelector('vn-choices');
  }

  /** Provide the parsed project.json before this element is connected. */
  set project(value) {
    this._project = value;
  }

  async connectedCallback() {
    const sceneId = this.getAttribute('scene');
    this._stage.reset();

    const hooks = {
      say: (who, text) => this._textbox.say(who, text),
      choice: (options) => this._choices.choose(options),
      bg: (src) => this._stage.setBackground(src),
      show: (cmd) => this._stage.showPortrait(cmd),
      hide: (who) => this._stage.hidePortrait(who),
      loadScene: async (id) => this.#getSceneCommands(id),
    };

    try {
      await runScript(this.#getSceneCommands(sceneId), hooks);
    } catch (err) {
      console.error('[vn-scene] script error in', sceneId, err);
    }

    // Whether the script ran off the end of its command list or hit an
    // explicit `end`, this scene's job is done — the scene stack (main.js)
    // is what actually pops it and resumes the map beneath.
    bus.emit('vn:done', { scene: sceneId });
  }

  #getSceneCommands(sceneId) {
    const commands = this._project?.scenes?.[sceneId]?.commands;
    if (!commands) throw new Error(`[vn-scene] unknown scene id: ${sceneId}`);
    return commands;
  }
}

customElements.define('vn-scene', VnScene);
