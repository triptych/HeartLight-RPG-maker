import { BattleRuntime } from '../modes/battle-mode.js';
import { state } from '../core/state.js';
import { bus } from '../events/bus.js';
import './battle-hud.js';

/**
 * <battle-scene troop="test_dust_wisps"> — owns a BattleRuntime and the
 * <battle-hud> that renders it, drives the turn loop, and emits
 * `battle:done` when the fight ends (main.js pops the stack and resumes
 * whatever was beneath, same pattern as vn-scene's `vn:done`).
 *
 * `window.__hearthlight.battleRng`, if set, overrides the runtime's rng —
 * a deliberate, documented test-only seam (see input.js's simulateDown for
 * the same idea applied to input) so headless tests can force deterministic
 * turn order/damage/flee/crit rolls without touching game code.
 */
export class BattleScene extends HTMLElement {
  #runtime = null;
  #started = false;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>:host { position: absolute; inset: 0; display: block; }</style>
      <battle-hud></battle-hud>
    `;
    this._hud = this._shadow.querySelector('battle-hud');
  }

  /** Provide the parsed project.json before this element is connected. */
  set project(value) {
    this._project = value;
  }

  connectedCallback() {
    if (this.#started) return;
    this.#started = true;
    this.#run();
  }

  async #run() {
    const troopId = this.getAttribute('troop');
    const partyIds = (this._project.system.party || []).filter((id) => this._project.actors[id]);
    const rng = (typeof window !== 'undefined' && window.__hearthlight?.battleRng) || Math.random;

    this.#runtime = new BattleRuntime({ rng });
    this.#runtime.load({ project: this._project, troopId, partyIds });

    while (!this.#runtime.isOver) {
      this._hud.render(this.#runtime.snapshot);
      const actor = this.#runtime.currentActor;
      if (!actor) break; // defensive — shouldn't happen while the battle isn't over
      const action = await this._hud.choose(actor, this.#buildContext());
      this.#runtime.act(action);
    }

    this._hud.render(this.#runtime.snapshot);
    await this._hud.showResult(this.#runtime.outcome);
    bus.emit('battle:done', { outcome: this.#runtime.outcome, troop: troopId });
  }

  #buildContext() {
    const itemDef = (id) => this._project.items?.[id];
    const items = state.data.inventory
      .filter((i) => itemDef(i.id)?.type === 'consumable' && i.qty > 0)
      .map((i) => ({ id: i.id, name: itemDef(i.id).name, qty: i.qty }));
    const dishes = state.data.inventory
      .filter((i) => itemDef(i.id)?.type === 'dish' && i.qty > 0)
      .map((i) => ({ id: i.id, name: itemDef(i.id).name, qty: i.qty }));
    return { enemies: this.#runtime.enemies, party: this.#runtime.party, items, dishes };
  }

  /** Exposed for HUD/dev overlays and tests, same convention as map-scene's `runtime`. */
  get runtime() {
    return this.#runtime;
  }
}

customElements.define('battle-scene', BattleScene);
