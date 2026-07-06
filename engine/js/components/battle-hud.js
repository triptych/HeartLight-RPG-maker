/**
 * <battle-hud> — DOM-only front-view battle UI: combatant rows (name, HP/SP
 * bars, status badges), the command menu, and a scrolling log. GDD 2.1
 * lists this as its own component; GDD 2.2's "canvas for the world, DOM for
 * words" is bent slightly here — there's no canvas at all yet, since
 * placeholder battler "art" is just colored name-tags, same spirit as the
 * map's placeholder prop markers. Swapping in real battler sprites later
 * means adding a canvas layer without touching battle-mode.js or this
 * component's menu/log logic.
 */
export class BattleHud extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._shadow.innerHTML = `
      <style>
        :host { position: absolute; inset: 0; display: block; font-family: system-ui, sans-serif; color: #f4ede4; }
        .field { position: absolute; inset: 0; background: #241a14; padding: 16px; box-sizing: border-box; }
        .combatants { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .row { display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.25); padding: 4px 8px; border-radius: 4px; }
        .row.dead { opacity: 0.4; text-decoration: line-through; }
        .row.befriended { opacity: 0.7; font-style: italic; }
        .name { min-width: 90px; font-weight: 600; }
        .bar { width: 120px; height: 8px; background: #000; border-radius: 4px; overflow: hidden; }
        .bar .fill { height: 100%; background: #7bbf6a; }
        .bar.sp .fill { background: #6a9cbf; }
        .statuses { font-size: 0.75em; opacity: 0.8; }
        .menu { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .menu button { background: #4a3626; color: #f4ede4; border: 1px solid #7a5c3e; border-radius: 4px; padding: 6px 12px; font: inherit; cursor: pointer; }
        .menu button:hover { background: #5c4530; }
        .log { position: absolute; bottom: 16px; left: 16px; right: 16px; max-height: 110px; overflow-y: auto; font-size: 0.85em; background: rgba(0,0,0,0.35); border-radius: 4px; padding: 6px 10px; }
        .log .line { padding: 1px 0; }
        .result { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; background: rgba(0,0,0,0.55); font-size: 1.4em; cursor: pointer; text-align: center; padding: 0 1rem; }
        /* Narrow viewports (phones in portrait): rows wrap instead of overflowing,
           bars shrink so name + HP + SP + status tags all still fit. */
        @media (max-width: 480px) {
          .field { padding: 10px; }
          .name { min-width: 56px; font-size: 0.85em; }
          .bar { width: 70px; }
          .row { flex-wrap: wrap; row-gap: 2px; }
          .menu button { padding: 8px 10px; font-size: 0.9em; }
          .log { font-size: 0.78em; max-height: 90px; }
        }
      </style>
      <div class="field">
        <div class="combatants enemies"></div>
        <div class="combatants party"></div>
        <div class="menu" hidden></div>
        <div class="log"></div>
      </div>
    `;
    this._field = this._shadow.querySelector('.field');
    this._enemiesEl = this._shadow.querySelector('.enemies');
    this._partyEl = this._shadow.querySelector('.party');
    this._menuEl = this._shadow.querySelector('.menu');
    this._logEl = this._shadow.querySelector('.log');
  }

  /** @param {{party: object[], enemies: object[], log: string[]}} snap */
  render(snap) {
    this._partyEl.innerHTML = snap.party.map((c) => this.#row(c, true)).join('');
    this._enemiesEl.innerHTML = snap.enemies.map((c) => this.#row(c, false)).join('');
    this._logEl.innerHTML = snap.log.slice(-6).map((line) => `<div class="line">${esc(line)}</div>`).join('');
    this._logEl.scrollTop = this._logEl.scrollHeight;
  }

  #row(c, showSp) {
    const hpPct = Math.max(0, Math.round((c.hp / c.stats.maxHP) * 100));
    const spPct = showSp ? Math.max(0, Math.round((c.sp / c.stats.maxSP) * 100)) : null;
    const dead = c.hp <= 0;
    const befriended = !!c.befriended;
    const tags = (c.statuses || []).map((s) => s.id).join(', ');
    return `
      <div class="row ${dead ? 'dead' : ''} ${befriended ? 'befriended' : ''}" data-id="${c.id}">
        <span class="name">${esc(c.name)}</span>
        <div class="bar hp"><div class="fill" style="width:${hpPct}%"></div></div>
        ${spPct !== null ? `<div class="bar sp"><div class="fill" style="width:${spPct}%"></div></div>` : ''}
        ${tags ? `<span class="statuses">${esc(tags)}</span>` : ''}
        ${befriended ? '<span class="statuses">befriended</span>' : ''}
      </div>`;
  }

  /**
   * Present the command menu for `actor`, resolving once the player has
   * clicked through to a fully-specified action. Guard and Flee need no
   * target and resolve on the first click.
   * @param {object} actor
   * @param {{enemies: object[], party: object[], items: object[], dishes: object[]}} ctx
   * @returns {Promise<object>}
   */
  choose(actor, ctx) {
    return new Promise((resolve) => {
      const finish = (action) => {
        this._menuEl.hidden = true;
        this._menuEl.innerHTML = '';
        resolve(action);
      };
      const buttons = (entries, onPick, backTo) => {
        this._menuEl.innerHTML =
          entries.map((e, i) => `<button data-i="${i}">${esc(e.label)}</button>`).join('') +
          (backTo ? '<button data-back="1">Back</button>' : '');
        this._menuEl.querySelectorAll('button[data-i]').forEach((btn, i) => {
          btn.addEventListener('click', () => onPick(entries[i]), { once: true });
        });
        const back = this._menuEl.querySelector('button[data-back]');
        back?.addEventListener('click', () => backTo(), { once: true });
      };
      const livingEnemies = ctx.enemies.filter((e) => e.hp > 0 && !e.befriended);
      const livingParty = ctx.party.filter((p) => p.hp > 0);

      const showRoot = () => {
        this._menuEl.hidden = false;
        const root = [{ label: 'Attack', cmd: 'attack' }];
        if (actor.skills?.length) root.push({ label: 'Skill', cmd: 'skill' });
        root.push({ label: 'Item', cmd: 'item' }, { label: 'Guard', cmd: 'guard' }, { label: 'Serve', cmd: 'serve' }, { label: 'Flee', cmd: 'flee' });
        buttons(root, (picked) => onRootPick(picked.cmd), null);
      };

      const onRootPick = (cmd) => {
        if (cmd === 'guard') return finish({ type: 'guard' });
        if (cmd === 'flee') return finish({ type: 'flee' });
        if (cmd === 'attack') {
          buttons(livingEnemies.map((e) => ({ label: e.name, id: e.id })), (t) => finish({ type: 'attack', targetId: t.id }), showRoot);
          return;
        }
        if (cmd === 'skill') {
          buttons((actor.skills || []).map((id) => ({ label: id, id })), (s) =>
            buttons(livingEnemies.map((e) => ({ label: e.name, id: e.id })), (t) => finish({ type: 'skill', skillId: s.id, targetId: t.id }), showRoot),
          showRoot);
          return;
        }
        if (cmd === 'item') {
          if (!ctx.items.length) { buttons([{ label: '(none carried)' }], () => showRoot(), showRoot); return; }
          buttons(ctx.items.map((i) => ({ label: `${i.name} x${i.qty}`, id: i.id })), (it) =>
            buttons(livingParty.map((p) => ({ label: p.name, id: p.id })), (t) => finish({ type: 'item', itemId: it.id, targetId: t.id }), showRoot),
          showRoot);
          return;
        }
        if (cmd === 'serve') {
          if (!ctx.dishes.length) { buttons([{ label: '(no dishes carried)' }], () => showRoot(), showRoot); return; }
          buttons(ctx.dishes.map((i) => ({ label: `${i.name} x${i.qty}`, id: i.id })), (it) =>
            buttons(livingEnemies.map((e) => ({ label: e.name, id: e.id })), (t) => finish({ type: 'serve', itemId: it.id, targetId: t.id }), showRoot),
          showRoot);
          return;
        }
      };

      showRoot();
    });
  }

  /** Show a full-field result banner; resolves when the player clicks past it. */
  showResult(outcome) {
    const text = { won: 'Victory!', lost: 'The party was defeated...', fled: 'Got away safely.', befriended: 'Not a single blow landed.' }[outcome] || 'Battle over.';
    return new Promise((resolve) => {
      const banner = document.createElement('div');
      banner.className = 'result';
      banner.innerHTML = `<div>${esc(text)}</div><div style="font-size:0.5em;opacity:0.7;">click to continue</div>`;
      banner.addEventListener('click', () => { banner.remove(); resolve(); }, { once: true });
      this._field.appendChild(banner);
    });
  }
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

customElements.define('battle-hud', BattleHud);
