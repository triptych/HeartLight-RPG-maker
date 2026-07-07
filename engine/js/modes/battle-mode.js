import { state } from '../core/state.js';
import { rollDamage, rollHeal, speedRoll, fleeChance } from '../data/formulas.js';

/**
 * BattleRuntime is pure logic (GDD 2.1: modes/ owns rules, components/ owns
 * DOM) — see MapRuntime for the same split. It resolves one full turn per
 * `act()` call: the acting party member, then every consecutive enemy turn
 * that follows, stopping only when it's a party member's turn again or the
 * battle has ended. That makes it drivable either by a UI (battle-scene.js)
 * or directly by a test with no DOM at all.
 *
 * Turn order (GDD 3.4): all living combatants sorted each round by
 * `SPD * (0.9 + rng()*0.2)`, recomputed at the start of every round so
 * status-effect SPD mods (chilled) can reshuffle order between rounds.
 *
 * Scope note (Phase 3, engine sprint): party stats are read directly off
 * `project.actors[id].stats` — no class-curve leveling or equipment yet
 * (that's Studio/database territory, Phase 4+). Party HP/SP always starts
 * full at battle load; persisting HP across battles is deferred for the
 * same reason. Enemy skills (`ai` entries with a `skill` id) are supported
 * by the resolver but no test content uses one yet, so that path is
 * exercised far less than the plain-attack path — flag if it misbehaves
 * once real content uses it.
 */
export class BattleRuntime {
  /** @param {object} [opts] @param {() => number} [opts.rng] injectable for deterministic tests */
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.log = [];
    this.outcome = null;
    this.party = [];
    this.enemies = [];
    this.turnOrder = [];
    this.turnIndex = 0;
    this.round = 0;
  }

  /**
   * @param {object} p
   * @param {object} p.project the parsed project.json
   * @param {string} p.troopId key into project.troops
   * @param {string[]} p.partyIds actor ids to field, in roster order
   */
  load({ project, troopId, partyIds }) {
    this.project = project;
    this.troopId = troopId;
    this.log = [];
    this.outcome = null;

    this.party = partyIds.map((id) => this.#makeParty(id, project.actors[id]));
    const troop = project.troops[troopId];
    if (!troop) throw new Error(`[battle] unknown troop: ${troopId}`);
    this.enemies = troop.members.map((m, i) => this.#makeEnemy(m.enemy, i, project.enemies[m.enemy]));

    this.round = 0;
    this.#startRound();
    this.#runEnemyTurnsUntilPlayerOrOver();
  }

  #makeParty(id, def) {
    if (!def) throw new Error(`[battle] unknown actor: ${id}`);
    const stats = this.#applyEquipment({ ...def.stats }, def.equip);
    return {
      side: 'party', id, name: def.name,
      stats, hp: stats.maxHP, sp: stats.maxSP,
      statuses: [], guarding: false, skills: def.skills || [],
    };
  }

  /**
   * Layer weapon ATK / armor DEF onto base stats (GDD Part VII schema:
   * `weapons: {atk}`, `armors: {def, slot}`). This is deliberately the
   * whole equipment system for now — `trait` (element/statusOnHit/
   * serveBonus per GDD 3.5) isn't applied yet, since nothing in the engine
   * reads a trait shape yet either; adding trait effects later shouldn't
   * need to touch this method's callers, just this one spot.
   */
  #applyEquipment(stats, equip) {
    if (!equip) return stats;
    const weapon = equip.weapon && this.project.weapons?.[equip.weapon];
    const armor = equip.armor && this.project.armors?.[equip.armor];
    const charm = equip.charm && this.project.armors?.[equip.charm];
    if (weapon?.atk) stats.ATK += weapon.atk;
    if (armor?.def) stats.DEF += armor.def;
    if (charm?.def) stats.DEF += charm.def;
    return stats;
  }

  #makeEnemy(enemyId, index, def) {
    if (!def) throw new Error(`[battle] unknown enemy: ${enemyId}`);
    return {
      side: 'enemy', id: `${enemyId}_${index}`, enemyId, name: def.name,
      stats: { ...def.stats }, hp: def.stats.maxHP,
      statuses: [], guarding: false, ai: def.ai || [], tastes: def.tastes || {},
      befriend: def.befriend ? { meter: def.befriend.meter, current: 0, reward: def.befriend.reward } : null,
      befriended: false,
    };
  }

  /** @returns {object|null} whoever's turn it is; only meaningful to act() on if `.side === 'party'` */
  get currentActor() {
    return this.turnOrder[this.turnIndex] ?? null;
  }

  /** @returns {boolean} whether the battle has reached an end state */
  get isOver() {
    return this.outcome !== null;
  }

  /** @returns {object} a plain snapshot for UI rendering — combatants + recent log, nothing private */
  get snapshot() {
    return { party: this.party, enemies: this.enemies, log: this.log, outcome: this.outcome };
  }

  #isActive(c) {
    return c.hp > 0 && !c.befriended;
  }

  #effectiveStat(c, key) {
    const base = c.stats[key] ?? 0;
    const mod = c.statuses.reduce((sum, s) => sum + (s.mods?.[key] ?? 0), 0);
    return base + mod;
  }

  #startRound() {
    this.round += 1;
    const living = [...this.party, ...this.enemies].filter((c) => this.#isActive(c));
    this.turnOrder = living
      .map((c) => ({ c, roll: speedRoll(this.#effectiveStat(c, 'SPD'), this.rng) }))
      .sort((a, b) => b.roll - a.roll)
      .map((entry) => entry.c);
    this.turnIndex = 0;
  }

  #advance() {
    this.turnIndex += 1;
    while (this.turnOrder[this.turnIndex] && !this.#isActive(this.turnOrder[this.turnIndex])) {
      this.turnIndex += 1;
    }
    if (this.turnIndex >= this.turnOrder.length && !this.isOver) {
      this.#startRound();
    }
  }

  /** Tick `actor`'s own statuses at the end of their turn (GDD 3.4: "ticks at end of actor's turn"). */
  #tickStatuses(actor) {
    const remaining = [];
    for (const s of actor.statuses) {
      if (s.tick?.hp) {
        actor.hp = Math.max(0, Math.min(actor.stats.maxHP, actor.hp + s.tick.hp));
        this.log.push(`${actor.name} ${s.tick.hp < 0 ? 'takes' : 'recovers'} ${Math.abs(s.tick.hp)} HP from ${s.id}.`);
      }
      const duration = s.duration - 1;
      if (duration > 0) remaining.push({ ...s, duration });
    }
    actor.statuses = remaining;
  }

  #applyStatus(target, statusDef) {
    if (!statusDef) return;
    const def = this.project.states?.[statusDef.id];
    if (!def) return;
    if (statusDef.chance !== undefined && this.rng() >= statusDef.chance) return;
    target.statuses = target.statuses.filter((s) => s.id !== statusDef.id);
    target.statuses.push({ id: statusDef.id, duration: statusDef.duration ?? def.duration, tick: def.tick, mods: def.mods });
    this.log.push(`${target.name} is ${def.name}.`);
  }

  #livingEnemies() {
    return this.enemies.filter((e) => this.#isActive(e));
  }

  #livingParty() {
    return this.party.filter((p) => p.hp > 0);
  }

  #findCombatant(id) {
    return this.party.find((c) => c.id === id) || this.enemies.find((c) => c.id === id);
  }

  /**
   * Resolve the current party member's action, then auto-resolve every
   * following enemy turn until it's a party member's turn again (or the
   * battle ends). Always consumes the acting actor's turn, even on a
   * failed/invalid action — a wasted turn is still a turn.
   * @param {object} action { type: 'attack'|'skill'|'item'|'guard'|'serve'|'flee', targetId?, skillId?, itemId? }
   */
  act(action) {
    const actor = this.currentActor;
    if (!actor || actor.side !== 'party' || this.isOver) return this.snapshot;

    actor.guarding = false;
    this.#resolveAction(actor, action);

    if (!this.isOver) {
      this.#tickStatuses(actor);
      this.#checkOutcome();
    }
    if (!this.isOver) {
      this.#advance();
      this.#runEnemyTurnsUntilPlayerOrOver();
    }
    return this.snapshot;
  }

  #resolveAction(actor, action) {
    switch (action?.type) {
      case 'attack': {
        const target = this.#findCombatant(action.targetId);
        if (!target || !this.#isActive(target)) { this.log.push(`${actor.name}'s attack finds nothing to hit.`); return; }
        this.#dealDamage(actor, target, { pow: 1.0 });
        return;
      }
      case 'skill': {
        const skill = this.project.skills?.[action.skillId];
        const target = this.#findCombatant(action.targetId);
        if (!skill) { this.log.push(`${actor.name} fumbles — no such skill.`); return; }
        if (actor.sp < skill.cost) { this.log.push(`${actor.name} doesn't have the SP for ${skill.name}.`); return; }
        actor.sp -= skill.cost;
        if (skill.formula === 'heal') {
          const healTarget = target && target.side === 'party' ? target : actor;
          const amount = rollHeal({ mag: this.#effectiveStat(actor, 'MAG'), pow: skill.pow, rng: this.rng });
          healTarget.hp = Math.min(healTarget.stats.maxHP, healTarget.hp + amount);
          this.log.push(`${actor.name} uses ${skill.name} — ${healTarget.name} recovers ${amount} HP.`);
          return;
        }
        if (!target || !this.#isActive(target)) { this.log.push(`${skill.name} finds nothing to hit.`); return; }
        this.#dealDamage(actor, target, { pow: skill.pow, element: skill.element, skillName: skill.name });
        if (skill.status) this.#applyStatus(target, skill.status);
        return;
      }
      case 'item': {
        const target = this.#findCombatant(action.targetId) || actor;
        if (!this.#consumeInventory(action.itemId)) { this.log.push(`${actor.name} reaches for an item that isn't there.`); return; }
        const item = this.project.items?.[action.itemId];
        const heal = item?.effect?.heal;
        if (heal) {
          target.hp = Math.min(target.stats.maxHP, target.hp + heal);
          this.log.push(`${actor.name} uses ${item.name} — ${target.name} recovers ${heal} HP.`);
        } else {
          this.log.push(`${actor.name} uses ${item?.name ?? action.itemId}.`);
        }
        return;
      }
      case 'guard': {
        actor.guarding = true;
        this.log.push(`${actor.name} guards.`);
        return;
      }
      case 'serve': {
        const target = this.#findCombatant(action.targetId);
        if (!target || target.side !== 'enemy' || !this.#isActive(target)) { this.log.push(`${actor.name} looks for someone to feed, and finds no one.`); return; }
        if (!this.#consumeInventory(action.itemId)) { this.log.push(`${actor.name} reaches for a dish that isn't there.`); return; }
        this.#serve(actor, target, action.itemId);
        return;
      }
      case 'flee': {
        const chance = fleeChance(
          avg(this.#livingParty().map((p) => this.#effectiveStat(p, 'SPD'))),
          avg(this.#livingEnemies().map((e) => this.#effectiveStat(e, 'SPD'))),
        );
        if (this.rng() < chance) {
          this.log.push(`${actor.name} calls the retreat — the party gets away.`);
          this.outcome = 'fled';
        } else {
          this.log.push(`${actor.name} tries to flee, but can't find the gap.`);
        }
        return;
      }
      default:
        this.log.push(`${actor.name} hesitates and does nothing.`);
    }
  }

  #dealDamage(actor, target, { pow, element, skillName }) {
    const atkKey = element ? 'MAG' : 'ATK';
    const defKey = target.side === 'enemy' ? 'DEF' : 'DEF';
    const elementMult = element ? (target.stats.affinities?.[element] ?? 1) : 1;
    const { amount, crit } = rollDamage({
      atk: this.#effectiveStat(actor, atkKey),
      def: this.#effectiveStat(target, defKey),
      pow, elementMult, lck: this.#effectiveStat(actor, 'LCK'), rng: this.rng,
    });
    const guarded = target.guarding ? Math.max(1, Math.round(amount * 0.5)) : amount;
    target.hp = Math.max(0, target.hp - guarded);
    const verb = skillName ? `uses ${skillName} on` : 'attacks';
    this.log.push(`${actor.name} ${verb} ${target.name} for ${guarded}${crit ? ' (critical!)' : ''}${target.guarding ? ' (guarded)' : ''}.`);
    if (target.hp <= 0) this.log.push(`${target.name} is defeated.`);
  }

  #serve(actor, target, itemId) {
    if (!target.befriend) {
      this.log.push(`${target.name} isn't interested in food from you. Not yet, anyway.`);
      return;
    }
    const tier = target.tastes?.loves?.includes(itemId) ? 'loves'
      : target.tastes?.likes?.includes(itemId) ? 'likes'
      : target.tastes?.hates?.includes(itemId) ? 'hates' : 'neutral';
    const gain = { loves: 50, likes: 20, neutral: 5, hates: 0 }[tier];
    const item = this.project.items?.[itemId];
    if (tier === 'loves') this.log.push(`${target.name} loves the ${item?.name ?? itemId}!`);
    else if (tier === 'likes') this.log.push(`${target.name} seems to like the ${item?.name ?? itemId}.`);
    else if (tier === 'hates') this.log.push(`${target.name} recoils from the ${item?.name ?? itemId}.`);
    else this.log.push(`${target.name} regards the ${item?.name ?? itemId} without much interest.`);
    target.befriend.current = Math.min(target.befriend.meter, target.befriend.current + gain);
    if (target.befriend.current >= target.befriend.meter) {
      target.befriended = true;
      this.log.push(`${target.name} isn't fighting anymore.`);
    }
  }

  #consumeInventory(itemId) {
    const entry = state.data.inventory.find((i) => i.id === itemId);
    if (!entry || entry.qty < 1) return false;
    return state.removeItem(itemId, 1);
  }

  #runEnemyTurnsUntilPlayerOrOver() {
    while (!this.isOver && this.currentActor && this.currentActor.side === 'enemy') {
      this.#resolveEnemyTurn(this.currentActor);
      if (!this.isOver) {
        this.#tickStatuses(this.currentActor);
        this.#checkOutcome();
      }
      if (!this.isOver) this.#advance();
    }
  }

  #resolveEnemyTurn(enemy) {
    enemy.guarding = false;
    const targets = this.#livingParty();
    if (targets.length === 0) return;

    const candidates = (enemy.ai.length ? enemy.ai : [{ weight: 1, skill: null }]).filter((entry) =>
      this.#aiConditionPasses(entry.if, enemy),
    );
    const pool = candidates.length ? candidates : [{ weight: 1, skill: null }];
    const choice = weightedPick(pool, this.rng);
    const target = targets[Math.floor(this.rng() * targets.length)];

    if (choice.skill) {
      const skill = this.project.skills?.[choice.skill];
      if (skill && skill.formula !== 'heal') {
        this.#dealDamage(enemy, target, { pow: skill.pow, element: skill.element, skillName: skill.name });
        if (skill.status) this.#applyStatus(target, skill.status);
        return;
      }
    }
    this.#dealDamage(enemy, target, { pow: 1.0 });
  }

  #aiConditionPasses(cond, enemy) {
    if (!cond) return true;
    if (cond.hpBelow !== undefined) return enemy.hp / enemy.stats.maxHP < cond.hpBelow;
    return true;
  }

  /**
   * Win: every hostile enemy is gone and at least one was defeated outright.
   * Befriended (peaceful): every hostile enemy is gone and none were —
   * zero casualties. A mixed troop counts as Won, since some hostiles still
   * had to be fought; "Befriended" is reserved for the fully peaceful case.
   * Lost: the whole party is down.
   */
  #checkOutcome() {
    if (this.#livingParty().length === 0) { this.outcome = 'lost'; this.log.push('The party is down.'); return; }
    const allGone = this.enemies.every((e) => e.hp <= 0 || e.befriended);
    if (allGone) {
      const anyDefeated = this.enemies.some((e) => e.hp <= 0);
      this.outcome = anyDefeated ? 'won' : 'befriended';
      this.log.push(this.outcome === 'won' ? 'Victory.' : 'Not a single blow landed — the whole troop stood down.');
    }
  }
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function weightedPick(entries, rng) {
  const total = entries.reduce((sum, e) => sum + (e.weight ?? 1), 0);
  let roll = rng() * total;
  for (const e of entries) {
    roll -= e.weight ?? 1;
    if (roll <= 0) return e;
  }
  return entries[entries.length - 1];
}
