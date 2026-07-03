import { bus } from '../events/bus.js';
import { state } from './state.js';

/**
 * Shared command interpreter — GDD 4.2: "VN scenes and map events share a
 * single JSON command list format. This is the engine's most important
 * unification." Map event pages and VN scenes both run their commands
 * through this one function; only the `hooks` differ (a map event usually
 * passes none, since it only needs flag/toast/transfer/scene; a VN scene
 * passes hooks that drive the stage/textbox/choices UI).
 *
 * Supported now: say, choice, if, bg, show, hide, flag, var, rapport,
 * toast, transfer, scene, wait, label, goto, jump, call, end.
 * Deferred — need systems that don't exist yet (items/battle/shops/etc.):
 * move, expr, cg, give, take, gold, battle, shop, cook, tint, flash,
 * weather, music, sfx, save.
 *
 * @param {Array<object>} commands
 * @param {object} [hooks]
 * @param {(who: string, text: string, expr?: string) => Promise<void>} [hooks.say]
 * @param {(optionTexts: string[]) => Promise<number>} [hooks.choice]
 * @param {(src: string) => void} [hooks.bg]
 * @param {(cmd: object) => void} [hooks.show]
 * @param {(who: string) => void} [hooks.hide]
 * @param {(sceneId: string) => Promise<Array<object>>} [hooks.loadScene] required for jump/call
 * @returns {Promise<void>}
 */
export async function runScript(commands, hooks = {}) {
  const labels = new Map();
  commands.forEach((cmd, i) => {
    if (cmd.cmd === 'label') labels.set(cmd.name, i);
  });

  let pc = 0;
  while (pc < commands.length) {
    const cmd = commands[pc];
    const control = await runOne(cmd, hooks);

    if (control?.end) return;

    if (control?.gotoLabel !== undefined) {
      const target = labels.get(control.gotoLabel);
      if (target === undefined) throw new Error(`[interpreter] unknown label: ${control.gotoLabel}`);
      pc = target;
      continue;
    }

    if (control?.jumpScene !== undefined) {
      const nextCommands = await requireLoadScene(hooks)(control.jumpScene);
      return runScript(nextCommands, hooks); // hands off entirely, no return point
    }

    if (control?.callScene !== undefined) {
      const subCommands = await requireLoadScene(hooks)(control.callScene);
      await runScript(subCommands, hooks); // returns here when the sub-scene ends
      pc++;
      continue;
    }

    pc++;
  }
}

function requireLoadScene(hooks) {
  if (!hooks.loadScene) throw new Error('[interpreter] jump/call requires hooks.loadScene');
  return hooks.loadScene;
}

/** @returns {object|undefined} a control signal for the runScript loop, or undefined to just continue */
async function runOne(cmd, hooks) {
  switch (cmd.cmd) {
    case 'say':
      await hooks.say?.(cmd.who, cmd.text, cmd.expr);
      return;
    case 'choice': {
      const idx = await hooks.choice?.(cmd.options.map((o) => o.text));
      const chosen = cmd.options[idx];
      if (chosen?.then) await runScript(chosen.then, hooks);
      return;
    }
    case 'if': {
      const branch = evalCondition(cmd) ? cmd.then : cmd.else;
      if (branch) await runScript(branch, hooks);
      return;
    }
    case 'bg':
      hooks.bg?.(cmd.src);
      return;
    case 'show':
      hooks.show?.(cmd);
      return;
    case 'hide':
      hooks.hide?.(cmd.who);
      return;
    case 'flag':
      state.setFlag(cmd.set, cmd.value !== undefined ? cmd.value : true);
      return;
    case 'var':
      state.setVar(cmd.set, cmd.value);
      return;
    case 'rapport':
      state.addRapport(cmd.who, cmd.add ?? 0);
      return;
    case 'toast':
      bus.emit('toast:show', { text: cmd.text });
      return;
    case 'transfer':
      bus.emit('map:transfer', { map: cmd.map, x: cmd.x, y: cmd.y });
      return;
    case 'scene':
      // A map event's "show scene" (GDD 3.2) — hands off to VN mode.
      bus.emit('vn:play', { scene: cmd.id ?? cmd.scene });
      return;
    case 'wait':
      await new Promise((resolve) => setTimeout(resolve, cmd.ms ?? 0));
      return;
    case 'label':
      return; // marker only, handled by the label index built up-front
    case 'goto':
      return { gotoLabel: cmd.label };
    case 'jump':
      return { jumpScene: cmd.scene };
    case 'call':
      return { callScene: cmd.scene };
    case 'end':
      return { end: true };
    default:
      console.warn(`[interpreter] command "${cmd.cmd}" isn't supported yet`, cmd);
      return;
  }
}

/** @param {object} cmd @returns {boolean} */
function evalCondition(cmd) {
  if (cmd.flag) return state.getFlag(cmd.flag) === true;
  if (cmd.flagNot) return state.getFlag(cmd.flagNot) === false;
  if (cmd.varEquals) return state.getVar(cmd.varEquals.key) === cmd.varEquals.value;
  return false;
}
