/**
 * Field schemas for the interpreter's command vocabulary (engine/js/core/
 * interpreter.js) — the command-list-editor's equivalent of data/schemas.js
 * for entities. Only commands the interpreter actually implements are
 * listed; `say`/`choice`/`if` are here even though no map event uses them
 * yet, since event pages and VN scenes share this exact vocabulary (GDD
 * 4.2) and the Scenes tab (Phase 6) needs `say`/`choice` immediately.
 */
export const COMMAND_TYPES = [
  'say', 'choice', 'if', 'bg', 'show', 'hide', 'flag', 'var', 'rapport',
  'toast', 'transfer', 'scene', 'battle', 'wait', 'label', 'goto', 'jump', 'call', 'end',
];

/** Plain (non-nesting) commands: field list per type. `if`/`choice` are handled specially (nested sub-lists). */
export const COMMAND_FIELDS = {
  say: [{ key: 'who', label: 'Who', type: 'text' }, { key: 'expr', label: 'Expression', type: 'text' }, { key: 'text', label: 'Text', type: 'textarea' }],
  bg: [{ key: 'src', label: 'Background', type: 'text' }],
  show: [{ key: 'who', label: 'Who', type: 'text' }, { key: 'expr', label: 'Expression', type: 'text' }, { key: 'at', label: 'Position', type: 'select', options: () => ['left', 'center', 'right'] }],
  hide: [{ key: 'who', label: 'Who', type: 'text' }],
  flag: [{ key: 'set', label: 'Flag name', type: 'text' }, { key: 'value', label: 'Value (blank = true)', type: 'json' }],
  var: [{ key: 'set', label: 'Var name', type: 'text' }, { key: 'value', label: 'Value', type: 'json' }],
  rapport: [{ key: 'who', label: 'Who', type: 'text' }, { key: 'add', label: 'Amount', type: 'number' }],
  toast: [{ key: 'text', label: 'Message', type: 'text' }],
  transfer: [{ key: 'map', label: 'Map id', type: 'text' }, { key: 'x', label: 'X', type: 'number' }, { key: 'y', label: 'Y', type: 'number' }],
  scene: [{ key: 'id', label: 'Scene id', type: 'text' }],
  battle: [{ key: 'troop', label: 'Troop id', type: 'text' }],
  wait: [{ key: 'ms', label: 'Milliseconds', type: 'number' }],
  label: [{ key: 'name', label: 'Label name', type: 'text' }],
  goto: [{ key: 'label', label: 'Target label', type: 'text' }],
  jump: [{ key: 'scene', label: 'Scene id', type: 'text' }],
  call: [{ key: 'scene', label: 'Scene id', type: 'text' }],
  end: [],
};

export function blankCommand(type) {
  switch (type) {
    case 'say': return { cmd: 'say', who: '', text: '' };
    case 'choice': return { cmd: 'choice', options: [{ text: 'Option 1', then: [] }] };
    case 'if': return { cmd: 'if', flag: '', then: [], else: [] };
    default: {
      const fields = COMMAND_FIELDS[type] || [];
      const cmd = { cmd: type };
      for (const f of fields) {
        // json-type fields (e.g. flag/var's "value") are deliberately left
        // absent rather than defaulted to '' — the interpreter treats an
        // absent flag value as `true` (see interpreter.js's `flag` case),
        // and #bindField's own "blank = delete the key" behavior only
        // fires on a user edit, so a never-touched field must start in
        // that same absent state or a fresh flag command would silently
        // set the flag to '' (falsy) instead of true.
        if (f.type === 'json') continue;
        cmd[f.key] = f.type === 'number' ? 0 : '';
      }
      return cmd;
    }
  }
}

/** A short one-line label for the row header (used before/instead of full field editing). */
export function summarize(cmd) {
  switch (cmd.cmd) {
    case 'say': return `say ${cmd.who ? `${cmd.who}: ` : ''}"${(cmd.text || '').slice(0, 40)}${(cmd.text || '').length > 40 ? '…' : ''}"`;
    case 'choice': return `choice (${(cmd.options || []).length} options)`;
    case 'if': return `if ${cmd.flag ? `flag:${cmd.flag}` : cmd.flagNot ? `!flag:${cmd.flagNot}` : 'condition'}`;
    case 'transfer': return `transfer → ${cmd.map} (${cmd.x},${cmd.y})`;
    case 'scene': return `scene → ${cmd.id}`;
    case 'battle': return `battle → ${cmd.troop}`;
    case 'flag': return `flag ${cmd.set} = ${cmd.value ?? 'true'}`;
    case 'toast': return `toast "${cmd.text}"`;
    default: return cmd.cmd;
  }
}
