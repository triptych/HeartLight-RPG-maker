/**
 * Pure damage/heal/turn math (GDD 3.4, 2.1 file layout). No state, no DOM,
 * no imports — battle-mode.js is the only consumer, and keeping this file
 * side-effect-free is what makes Phase 8's "batch-simulated battles for
 * balance" trick possible later: run these functions in a loop with no
 * engine bootstrap at all.
 */

/** @returns {number} 0..1, biased by rng() so results are reproducible under a fixed rng */
function variance(rng, spread = 0.15) {
  return 1 - spread + rng() * spread * 2;
}

/**
 * @param {object} p
 * @param {number} p.atk attacker's effective ATK or MAG
 * @param {number} p.def defender's effective DEF or RES
 * @param {number} p.pow skill/attack power multiplier (1.0 for a plain Attack)
 * @param {number} [p.elementMult] enemy affinity multiplier for the skill's element, default 1
 * @param {number} p.lck attacker's LCK, used for crit roll
 * @param {() => number} p.rng
 * @returns {{amount: number, crit: boolean}}
 */
export function rollDamage({ atk, def, pow, elementMult = 1, lck = 0, rng }) {
  const crit = rng() < critChance(lck);
  const raw = atk * pow - def * 0.7;
  const amount = Math.max(1, Math.round(Math.max(1, raw) * variance(rng) * elementMult * (crit ? 1.5 : 1)));
  return { amount, crit };
}

/** GDD 3.4: "crit = 5% + LCK/2" — read as 5% base plus half of LCK as a percentage. */
export function critChance(lck) {
  return 0.05 + lck / 200;
}

/**
 * @param {object} p
 * @param {number} p.mag caster's effective MAG
 * @param {number} p.pow skill power multiplier
 * @param {() => number} p.rng
 * @returns {number}
 */
export function rollHeal({ mag, pow, rng }) {
  return Math.max(1, Math.round(mag * pow * variance(rng)));
}

/** @param {number} spd effective SPD @param {() => number} rng @returns {number} this round's turn-order roll (GDD 3.4) */
export function speedRoll(spd, rng) {
  return spd * (0.9 + rng() * 0.2);
}

/**
 * @param {number} partySpd average effective SPD of living party members
 * @param {number} enemySpd average effective SPD of living hostile enemies
 * @returns {number} 0.1..0.95 chance to successfully flee
 */
export function fleeChance(partySpd, enemySpd) {
  return Math.max(0.1, Math.min(0.95, 0.5 + (partySpd - enemySpd) * 0.05));
}
