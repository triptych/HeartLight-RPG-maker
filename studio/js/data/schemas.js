/**
 * Field schemas for the generic entity-editor (GDD 6.1: "tabbed
 * sub-editors over the shared entity pattern"). One config object per
 * Part VII collection, consumed by `<entity-editor>` to render its form
 * pane — the editor component itself has no per-entity-type code at all.
 *
 * Per the GDD's own risk valve ("any editor feature usable via the JSON
 * pane ships as JSON-pane-only until content demands the form UI"): Actors,
 * Items, Weapons, and Armors get full structured fields since Phase 4's
 * exit test (item → equip → battle) runs straight through them. Classes,
 * Skills, Enemies, Troops, Recipes, and States get enough structured
 * fields to be genuinely useful, but lean on the `json` field type for
 * their more open-ended sub-shapes (ai lists, learnsets, curves) rather
 * than bespoke widgets for every nested shape in Part VII.
 */

const PARTY_STAT_KEYS = ['maxHP', 'maxSP', 'ATK', 'DEF', 'MAG', 'RES', 'SPD', 'LCK'];
const ENEMY_STAT_KEYS = ['maxHP', 'ATK', 'DEF', 'MAG', 'RES', 'SPD', 'LCK'];

const ids = (obj) => Object.keys(obj || {});

export const SCHEMAS = {
  actors: {
    kind: 'collection',
    label: 'Actors',
    idPrefix: 'actor',
    blank: () => ({
      name: 'New Actor', class: '', level: 1,
      stats: { maxHP: 20, maxSP: 5, ATK: 5, DEF: 5, MAG: 5, RES: 5, SPD: 5, LCK: 5 },
      portraits: {}, sprite: '', equip: {}, rapportScenes: [], skills: [],
    }),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'class', label: 'Class', type: 'select', options: (p) => ids(p.classes) },
      { key: 'level', label: 'Level', type: 'number' },
      { key: 'stats', label: 'Stats', type: 'stats', statKeys: PARTY_STAT_KEYS },
      { key: 'skills', label: 'Skills', type: 'multiselect', options: (p) => ids(p.skills) },
      { key: 'equip.weapon', label: 'Weapon', type: 'select', options: (p) => ids(p.weapons) },
      { key: 'equip.armor', label: 'Armor', type: 'select', options: (p) => ids(p.armors).filter((id) => p.armors[id].slot !== 'charm') },
      { key: 'equip.charm', label: 'Charm', type: 'select', options: (p) => ids(p.armors).filter((id) => p.armors[id].slot === 'charm') },
      { key: 'sprite', label: 'Sprite path', type: 'text' },
      { key: 'portraits', label: 'Portraits (manifest)', type: 'json' },
      { key: 'rapportScenes', label: 'Rapport scenes', type: 'json' },
    ],
  },

  classes: {
    kind: 'collection',
    label: 'Classes',
    idPrefix: 'class',
    blank: () => ({ curves: { maxHP: [], ATK: [] }, learnset: [] }),
    fields: [
      { key: 'curves', label: 'Stat curves', type: 'json' },
      { key: 'learnset', label: 'Learnset', type: 'json' },
    ],
  },

  skills: {
    kind: 'collection',
    label: 'Skills',
    idPrefix: 'skill',
    blank: () => ({ name: 'New Skill', cost: 0, target: 'one', formula: 'phys', pow: 1.0, element: null, status: null, comboWith: null, rapportReq: 0, anim: '' }),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'cost', label: 'SP cost', type: 'number' },
      { key: 'target', label: 'Target', type: 'select', options: () => ['one', 'row', 'all', 'self', 'ally'] },
      { key: 'formula', label: 'Formula', type: 'select', options: () => ['phys', 'mag', 'heal', 'status'] },
      { key: 'pow', label: 'Power', type: 'number' },
      { key: 'element', label: 'Element', type: 'select', options: (p) => ['', ...(p.system?.elements || [])] },
      { key: 'rapportReq', label: 'Rapport required', type: 'number' },
      { key: 'comboWith', label: 'Combo with (actor id)', type: 'text' },
      { key: 'anim', label: 'Animation id', type: 'text' },
      { key: 'status', label: 'Status effect on hit', type: 'json' },
    ],
  },

  items: {
    kind: 'collection',
    label: 'Items',
    idPrefix: 'item',
    blank: () => ({ name: 'New Item', type: 'consumable', price: 0, effect: {}, tastes: [], desc: '' }),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'type', label: 'Type', type: 'select', options: () => ['consumable', 'ingredient', 'dish', 'key', 'material'] },
      { key: 'price', label: 'Price', type: 'number' },
      { key: 'tastes', label: 'Taste tags', type: 'stringlist' },
      { key: 'effect', label: 'Effect', type: 'json' },
      { key: 'desc', label: 'Description', type: 'textarea' },
    ],
  },

  weapons: {
    kind: 'collection',
    label: 'Weapons',
    idPrefix: 'weapon',
    blank: () => ({ name: 'New Weapon', atk: 0, trait: null, price: 0 }),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'atk', label: 'ATK bonus', type: 'number' },
      { key: 'price', label: 'Price', type: 'number' },
      { key: 'trait', label: 'Trait', type: 'json' },
    ],
  },

  armors: {
    kind: 'collection',
    label: 'Armor',
    idPrefix: 'armor',
    blank: () => ({ name: 'New Armor', def: 0, slot: 'armor', trait: null, price: 0 }),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'def', label: 'DEF bonus', type: 'number' },
      { key: 'slot', label: 'Slot', type: 'select', options: () => ['armor', 'charm'] },
      { key: 'price', label: 'Price', type: 'number' },
      { key: 'trait', label: 'Trait', type: 'json' },
    ],
  },

  enemies: {
    kind: 'collection',
    label: 'Enemies',
    idPrefix: 'enemy',
    blank: () => ({
      name: 'New Enemy', stats: { maxHP: 15, ATK: 5, DEF: 2, MAG: 0, RES: 2, SPD: 4, LCK: 2 },
      ai: [{ weight: 10, skill: null }], tastes: { loves: [], likes: [], hates: [] }, befriend: null, drops: [], xp: 0, gold: 0,
    }),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'stats', label: 'Stats', type: 'stats', statKeys: ENEMY_STAT_KEYS },
      { key: 'xp', label: 'XP reward', type: 'number' },
      { key: 'gold', label: 'Gold reward', type: 'number' },
      { key: 'ai', label: 'AI action list', type: 'json' },
      { key: 'tastes', label: 'Tastes (Serve)', type: 'json' },
      { key: 'befriend', label: 'Befriend (null if not befriendable)', type: 'json' },
      { key: 'drops', label: 'Drops', type: 'json' },
    ],
  },

  troops: {
    kind: 'collection',
    label: 'Troops',
    idPrefix: 'troop',
    blank: () => ({ members: [], formation: [], scripts: [] }),
    fields: [
      { key: 'members', label: 'Members', type: 'json' },
      { key: 'formation', label: 'Formation', type: 'json' },
      { key: 'scripts', label: 'Scripted turns', type: 'json' },
    ],
  },

  recipes: {
    kind: 'collection',
    label: 'Recipes',
    idPrefix: 'recipe',
    blank: () => ({ in: ['', ''], out: '' }),
    fields: [
      { key: 'in', label: 'Ingredients (2 item ids)', type: 'stringlist' },
      { key: 'out', label: 'Result', type: 'select', options: (p) => ids(p.items) },
    ],
  },

  states: {
    kind: 'collection',
    label: 'States',
    idPrefix: 'state',
    blank: () => ({ name: 'New State', tick: {}, mods: {}, duration: 3 }),
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'duration', label: 'Duration (turns)', type: 'number' },
      { key: 'tick', label: 'Per-turn tick effect', type: 'json' },
      { key: 'mods', label: 'Stat mods while active', type: 'json' },
    ],
  },

  system: {
    kind: 'singleton',
    label: 'System',
    fields: [
      { key: 'tileSize', label: 'Tile size (px)', type: 'number' },
      { key: 'elements', label: 'Elements', type: 'stringlist' },
      { key: 'party', label: 'Starting roster (actor ids)', type: 'stringlist' },
      { key: 'terms', label: 'Terms', type: 'json' },
    ],
  },
};

export const TAB_ORDER = ['actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'troops', 'recipes', 'states', 'system'];
