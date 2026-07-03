# Hearthlight — Game Design Document

**A hybrid turn-based RPG / visual novel engine, editor suite, and complete first game**

| | |
|---|---|
| Engine | **Hearthlight Engine** — vanilla HTML/CSS/JS runtime |
| Editor | **Hearthlight Studio** — browser-based maker (map editor, database, scene editor) |
| First game | ***Wayfarer's Rest*** — a cozy found-family RPG/VN, ~4–6 hours |
| Tech constraints | Zero build step, zero dependencies, ES modules, custom elements, runs from `file://` or any static host |
| Document version | 1.0 — July 2026 |

---

## Part I — Vision

### 1.1 The pitch

RPG Maker gives you tile maps, turn-based combat, and a database of items and monsters, but its dialogue tooling is an afterthought. Ren'Py gives you gorgeous branching conversation, portraits, and expressive scene direction, but no world to walk around in. Hearthlight is the marriage: **the map is where the story breathes, the scenes are where it speaks.**

The engine treats the two modes as equal citizens sharing one state store. A door on the map can open a VN scene; a choice in a VN scene can change what's standing on the map. Neither mode is a "minigame" inside the other.

### 1.2 Design pillars

1. **One JSON to rule them all.** A complete game — maps, database, scenes, assets manifest — serializes to a single project file. The editor edits it; the runtime plays it. Nothing else exists.
2. **The editor is a web page. The game is a web page.** No install, no export wizard, no bundler. "Publishing" means copying a folder.
3. **Data-driven everything.** The runtime contains zero game-specific code. *Wayfarer's Rest* is pure content — the proof that the maker works.
4. **Scenes interrupt, maps persist.** VN scenes are a stack pushed on top of the map state, never a teleport away from it.
5. **Small surface, deep water.** Fewer systems, each composable. (No 40-page plugin API. Emergence over specification.)

### 1.3 What we are explicitly not building (v1)

Real-time combat, pixel-perfect physics, multiplayer, mobile-first touch controls (keyboard/mouse first, touch tolerated), plugin/scripting API for third parties, audio middleware (plain `<audio>` with a tiny channel manager is enough).

---

## Part II — Engine Architecture

### 2.1 Runtime file structure

```
game/
├── index.html                 (player shell)
├── styles/
│   └── main.css               (design tokens, VN UI, menus)
├── js/
│   ├── main.js                (bootstrap: load project.json, fire game:ready)
│   ├── events/bus.js          (singleton EventTarget event bus)
│   ├── core/
│   │   ├── state.js           (GameState: party, flags, vars, inventory, position)
│   │   ├── loader.js          (project.json + asset preloader)
│   │   ├── saves.js           (localStorage slots + JSON file export/import)
│   │   ├── input.js           (keyboard/mouse/touch → semantic actions)
│   │   └── scene-stack.js     (push/pop: Map, Battle, VN, Menu, Title)
│   ├── modes/
│   │   ├── map-mode.js        (canvas tile renderer, movement, event triggers)
│   │   ├── battle-mode.js     (turn engine, action resolution, AI)
│   │   └── vn-mode.js         (script interpreter, DOM-rendered)
│   ├── components/            (custom elements, Shadow DOM)
│   │   ├── vn-stage.js        (<vn-stage>: backgrounds, portraits, transitions)
│   │   ├── vn-textbox.js      (<vn-textbox>: typewriter text, name plate)
│   │   ├── vn-choices.js      (<vn-choices>: branching buttons)
│   │   ├── game-menu.js       (<game-menu>: party/items/save)
│   │   ├── battle-hud.js      (<battle-hud>: commands, gauges, log)
│   │   └── game-toast.js      (<game-toast>: item-get, quest updates)
│   └── data/
│       └── formulas.js        (damage/heal/rapport math, pure functions)
├── data/
│   └── project.json           (THE game — everything below in Part VII)
└── assets/
    ├── tiles/  ├── portraits/  ├── backgrounds/
    ├── sprites/ ├── battlers/  ├── audio/
```

### 2.2 Architectural rules

- **Custom elements own their DOM; the event bus owns communication.** `battle-mode.js` never touches `<vn-textbox>`; it emits `battle:won` and whoever cares listens. This follows the established scaffold pattern (Shadow DOM, `observedAttributes`, cleanup in `disconnectedCallback`, no globals).
- **Two renderers, one screen.** The map/battle layer is a `<canvas>` (tiles, sprites, camera). The VN/UI layer is DOM stacked above it. Canvas for the world, DOM for words — each technology doing what it's best at. VN scenes can optionally dim-but-not-hide the map beneath them, which is the whole hybrid feel.
- **The scene stack is the spine.** `[Title] → [Map] → [Map, VN] → [Map] → [Map, Battle] → [Map, Battle, VN(mid-battle dialogue!)] → ...` Pop always restores exactly what was beneath. Mid-battle story beats come free from this design.
- **State is one serializable object.** `GameState = { party, inventory, gold, flags, vars, rapport, position, questLog, playtime }`. Saving is `JSON.stringify(state)`. Everything mutating state does so through `state.js` methods that emit change events (`state:flag`, `state:item`, `state:rapport`) so UI reacts for free.

### 2.3 Save system

Three localStorage slots plus autosave, and a **Download Save / Load Save File** button pair (JSON file) so saves survive browser storage wipes and can be shared/debugged. Save = GameState + project version + timestamp + a small screenshot-substitute (map name, chapter, party portraits).

---

## Part III — RPG Systems

### 3.1 Maps

Tile-based, orthogonal, 32×32 tiles (configurable per project). Each map is a JSON object:

- **Layers:** `ground`, `decor`, `overhead` (drawn above the player), `collision` (boolean grid), plus an `events` layer.
- **Tilesets:** a spritesheet image + JSON metadata (passability defaults, animation frames for water/lights, terrain tags).
- **Camera:** follows player, clamps to map bounds, smooth-scroll lerp.
- **Movement:** 4-directional grid movement with input buffering; hold-to-repeat; interaction key checks the faced tile.

### 3.2 Map events

Every interactive thing on a map is an **event**: an entity with a position, a sprite (or invisible), a trigger, and a command list.

- **Triggers:** `action` (player presses interact facing it), `touch` (player steps on/into), `auto` (fires once when conditions met), `parallel` (ambient loops — flickering lights, patrols).
- **Pages:** an event has ordered pages, each with conditions (`flag`, `var`, `item`, `rapport`, `chapter`). Highest-priority page whose conditions pass is active — this is how the innkeeper says something new after Chapter 2, RPG-Maker style.
- **Commands** (shared with VN scripts — see 4.2): show scene, start battle, give/take item, set flag/var, move event, transfer player, play sound, shop, save prompt, conditional branch, wait, tint screen.

### 3.3 Party & characters

- Party of up to 4 active members from a roster.
- Stats: `maxHP, maxSP, ATK, DEF, MAG, RES, SPD, LCK` — derived from class curve × level + equipment.
- **Rapport:** a per-companion 0–100 value raised by VN choices, shared meals, and side scenes. Rapport unlocks combo skills in battle and alternate scene branches. This is the primary bridge stat between the two halves of the engine.
- Leveling: XP curve `next = base × level^1.6`; on level-up, learn skills from the class's `learnset`.

### 3.4 Combat

Front-view, turn-based, troop-vs-party — deliberately classic, deliberately readable.

- **Turn order:** all combatants sorted by `SPD × (0.9 + rand·0.2)` each round.
- **Commands:** `Attack`, `Skill`, `Item`, `Guard`, `Serve` (see below), `Flee`.
- **Damage formula:** `max(1, (ATK·pow − DEF·0.7) · variance · element · crit)` with per-skill `pow`, elemental affinities (`ember, frost, gale, root, hearth, umbral`), crit = `5% + LCK/2`.
- **Status effects:** poison, sleep, silence, warm (regen), chilled (SPD down), inspired (ATK/MAG up). Ticks at end of actor's turn.
- **`Serve` — the signature mechanic.** Instead of attacking, a party member can offer a food item to an enemy. Every enemy has a `tastes` table; the right dish converts hostility into a **Befriend** meter. Fill it and the battle ends peacefully — better XP-to-rapport conversion, unique drops, and some befriended creatures show up at the waystation afterward. Violence always works; hospitality works *better*, if you've paid attention to what the world is hungry for. The combat system is thus mechanically about the game's theme.
- **Enemy AI:** weighted action lists with condition gates (`hpBelow: 0.3 → heal`), per-troop formations, optional scripted turns for boss choreography (turn 3: trigger mid-battle VN scene).

### 3.5 Items, weapons, armor, skills

All live in the database (Part VII schemas). Highlights:

- **Item types:** consumable (battle/menu/both), ingredient, dish (usable by `Serve` and as healing), key item, material.
- **Cooking:** a simple recipe system — `2 ingredients → dish` at any hearth on a map. Recipes are learned from scenes and NPCs; cooking is a menu action, not a minigame. Dishes are the ammunition of the `Serve` economy.
- **Weapons/armor:** slots `weapon, armor, charm`. Flat stat mods + optional trait (`element`, `statusOnHit`, `serveBonus`).
- **Skills:** cost SP, target patterns (one/row/all/self/ally), formula reference + params, animation id, learnable or rapport-locked (combo skills require both partners alive and rapport ≥ threshold).

### 3.6 Economy & shops

Gold from battles, quests, and selling materials. Shops are events invoking the `shop` command with an inventory list (optionally condition-gated stock). Prices: database base price × shop multiplier.

---

## Part IV — Visual Novel Systems

### 4.1 Presentation

- **Stage:** background image (or the live map, dimmed), up to 3 portrait slots (`left, center, right`), each portrait = character + expression + pose, with enter/exit transitions (`fade, slide, pop`) and emphasis effects (`shake, bounce, dim-others`).
- **Textbox:** name plate (auto-colored per character), typewriter reveal at configurable CPS, click/key to complete-then-advance, backlog (scroll up for history), auto mode, skip-read-text mode.
- **Screen directives:** tint, flash, weather overlay (rain/snow/embers), letterboxing for "cinematic" beats, CG full-screen illustrations.

### 4.2 Script format — one command language for everything

VN scenes and map events share a single JSON command list format. This is the engine's most important unification: learn one vocabulary, use it everywhere.

```json
{
  "id": "scene.ch1.kettle_awakens",
  "commands": [
    { "cmd": "bg", "src": "waystation_kitchen_night" },
    { "cmd": "show", "who": "maren", "expr": "wary", "at": "left" },
    { "cmd": "say", "who": "maren", "text": "You heard it too. Don't pretend you didn't." },
    { "cmd": "sfx", "src": "kettle_rattle" },
    { "cmd": "say", "who": "kettle", "expr": "steam", "at": "center",
      "text": "…is someone going to take me OFF the fire, or shall I simply become tea myself?" },
    { "cmd": "choice", "options": [
      { "text": "Take the kettle off. Apologize to it.",
        "then": [ { "cmd": "rapport", "who": "kettle", "add": 5 },
                  { "cmd": "flag", "set": "kettle_respected" } ] },
      { "text": "Ask Maren if she's seeing this.",
        "then": [ { "cmd": "rapport", "who": "maren", "add": 3 } ] }
    ]},
    { "cmd": "if", "flag": "kettle_respected",
      "then": [ { "cmd": "say", "who": "kettle", "expr": "pleased", "text": "Manners. How novel." } ],
      "else": [ { "cmd": "say", "who": "kettle", "expr": "huffy", "text": "Typical." } ] },
    { "cmd": "jump", "scene": "scene.ch1.kitchen_aftermath" }
  ]
}
```

Full command vocabulary (~30 commands): `say, bg, show, hide, move, expr, cg, choice, if, jump, call, label, goto, flag, var, rapport, give, take, gold, battle, transfer, shop, cook, tint, flash, weather, music, sfx, wait, toast, save, end`.

### 4.3 Branching & state

- **Flags** (booleans) and **vars** (numbers/strings) are global; `if` supports `flag / var comparisons / item possession / rapport thresholds / chapter`.
- **`call` vs `jump`:** `call` pushes a sub-scene and returns (reusable snippets — a "cook dinner together" scene parameterized by companion); `jump` transfers control.
- **Read-text tracking** per scene node id → enables skip-read and NG+ style fast-forward.
- **Endings:** ordinary flags. The runtime doesn't know what an "ending" is; the content decides (Part VIII: *Wayfarer's Rest* has 4).

---

## Part V — Hybrid Integration (the actual point)

1. **Shared state, shared commands.** A VN choice sets `flag ferry_repaired`; the map's ferry event has a page conditioned on that flag; the ferryman battle has an AI gate on it. No glue code — the data *is* the glue.
2. **Scenes over maps.** Default VN presentation dims the live map 40% behind the textbox rather than cutting to a background — conversations feel like they happen *in the world*. Scene may opt into full backgrounds for interiors/CGs.
3. **Mid-battle scenes.** `battle` troops can trigger `scene` commands on turn/HP conditions (boss monologues, companions talking each other off a ledge, a befriend-critical dialogue when the meter is nearly full).
4. **Rapport is the exchange rate.** VN kindness → combat power (combo skills); combat mercy (`Serve`) → VN content (befriended creatures appear at the inn with scenes). Each mode feeds the other's progression, so neither is skippable filler.
5. **Chapter clock.** A global `chapter` var gates event pages, shop stock, scene availability, and map variants (the waystation map has per-chapter decor layers — it visibly heals as the game proceeds).

---

## Part VI — Hearthlight Studio (the editor)

A separate `studio/` web app, same scaffold pattern (`<app-layout>`, `<app-tabs>`, `<app-modal>`, event bus). It loads/edits/saves `project.json` and can launch the runtime in an iframe with the working copy injected — **playtest is one click, from any map, with any state preset.**

### 6.1 Tabs

**Maps** — the map maker.
- Left: tileset palette (marquee multi-tile selection). Center: canvas with zoom/pan, layer toggles, grid. Right: map properties.
- Tools: paint, rectangle, fill, eyedropper, collision brush (overlay mode), event placement.
- Event editor modal: sprite, trigger, pages with condition rows, and a **command list editor** (see Scenes tab — same component, reused).
- Undo/redo (command pattern over map deltas), copy/paste tile regions, map list with folders.

**Database** — tabbed sub-editors over the shared entity pattern (list pane + form pane + JSON pane, always in sync):
- **Actors** (name, class, portraits/expressions manifest, sprite, starting equipment, learnset, rapport scene table)
- **Classes** (stat curves as editable spark-line tables, learnsets)
- **Skills** (formula picker + params, targeting, animation, SP cost, rapport-combo pairing)
- **Items / Weapons / Armor** (type-specific forms; dishes get a `tastes` tag editor)
- **Enemies** (stats, AI weighted-action editor, `tastes` table, drops, befriend rewards)
- **Troops** (formation canvas: drag battlers; scripted-turn command hooks)
- **Recipes**, **States** (status effects), **System** (elements, terms, starting party, title screen)

**Scenes** — the Ren'Py-side editor.
- Scene list with folder/prefix organization and a flag/var cross-reference panel ("what reads `kettle_respected`? what writes it?" — indispensable for branch debugging).
- Command list editor: keyboard-first, insert-line palette (`/say`, `/choice`…), inline portrait/expression pickers with thumbnail preview, drag to reorder, collapse `choice`/`if` blocks.
- **Live preview pane:** the actual `<vn-stage>` component rendering the selected command — the editor previews with the runtime's own renderer, so preview cannot lie.
- Branch view: read-only graph of `jump/call/choice` edges between scenes (SVG, auto-laid-out) for orientation, not editing.

**Assets** — drag-drop import → files stored via the File System Access API when available (folder-linked project) with graceful fallback to a zip import/export flow. Manifest editor for portrait expression grids and sprite sheet slicing.

**Playtest** — runtime in iframe + a state inspector (live flags/vars/rapport, editable while playing) + "start from map X with state preset Y".

### 6.2 Persistence

Primary: File System Access API against a project folder (Chrome/Edge; Andrew's dev environment). Fallback: import/export single `.hearthlight.json` (project + base64 assets) so the Studio also works as a fully client-side page anywhere.

---

## Part VII — Data Schemas (project.json)

```json
{
  "meta": { "title": "", "version": "", "engine": "1.0", "startMap": "", "startPos": [0,0], "chapterVar": "chapter" },
  "system": { "elements": [], "terms": {}, "party": [], "tileSize": 32 },
  "actors":   { "id": { "name": "", "class": "", "level": 1, "portraits": {}, "sprite": "", "equip": {}, "rapportScenes": [] } },
  "classes":  { "id": { "curves": { "maxHP": [], "ATK": [] }, "learnset": [ { "level": 3, "skill": "" } ] } },
  "skills":   { "id": { "name": "", "cost": 0, "target": "one|row|all|self|ally", "formula": "phys|mag|heal|status", "pow": 1.0, "element": "", "status": null, "comboWith": null, "rapportReq": 0, "anim": "" } },
  "items":    { "id": { "name": "", "type": "consumable|ingredient|dish|key|material", "price": 0, "effect": {}, "tastes": [], "desc": "" } },
  "weapons":  { "id": { "name": "", "atk": 0, "trait": null, "price": 0 } },
  "armors":   { "id": { "name": "", "def": 0, "slot": "armor|charm", "trait": null, "price": 0 } },
  "enemies":  { "id": { "name": "", "stats": {}, "ai": [ { "weight": 5, "skill": "", "if": null } ], "tastes": { "loves": [], "likes": [], "hates": [] }, "befriend": { "meter": 100, "reward": "", "inhabitant": null }, "drops": [], "xp": 0, "gold": 0 } },
  "troops":   { "id": { "members": [], "formation": [], "scripts": [ { "when": { "turn": 3 }, "run": [] } ] } },
  "recipes":  { "id": { "in": ["",""], "out": "" } },
  "states":   { "id": { "name": "", "tick": {}, "mods": {}, "duration": 3 } },
  "maps":     { "id": { "name": "", "size": [30,20], "tileset": "", "layers": {}, "collision": [], "events": [], "music": "", "chapterDecor": {} } },
  "scenes":   { "id": { "commands": [] } },
  "assets":   { "manifest": {} }
}
```

(Full field-level schema doc ships as `SCHEMA.md` alongside the engine; the editor validates against it on save.)

---

## Part VIII — The Game: *Wayfarer's Rest*

### 8.1 Premise

The Wyrd Road runs through the Duskfell Vale, and halfway along it stands a waystation inn that has been shuttered for nine years. You've inherited it from your aunt Petra — not *died*, the letter is careful to say, *departed* — along with her stained recipe book, a locked cellar, and a copper kettle with extremely firm opinions.

Travelers still need the road. The road has gotten strange. Reopen the waystation, escort those who knock between the Vale's waypoints, and learn — one meal, one guest, one small act of stubborn hospitality at a time — where Petra went and why the Vale is hungry.

**Tone:** cozy with teeth. Danger is real, but almost everything hostile in the Vale is hostile because it is hungry, lonely, or cursed — and the game's systems reward figuring out which.

### 8.2 The cast (roster of 5, party of 4)

- **Rowan (player)** — the inheritor. Class: *Keeper* (balanced, best `Serve` bonuses, learns recipes fastest). The audience-surrogate whose defining stat is paying attention.
- **Maren** — ex-caravan-guard who was drinking herself flat in the ruined taproom when you arrived and never quite leaves. Class: *Warden* (tank, taunt, guard-ally). Gruff, competent, allergic to being thanked. Rapport arc: learning her old caravan was lost on this road.
- **Pip** — teenage courier who treats the collapsing postal route as a sacred trust. Class: *Runner* (SPD, steal, flee-guarantee, first-strike). Rapport arc: it's okay to deliver yourself somewhere and stay.
- **The Kettle** — Petra's copper kettle, awake, sarcastic, and refusing to explain itself. Class: *Vessel* (MAG healer/support; skills are teas). Rides in the party inventory-style; portrait is the kettle with expressive steam. Rapport arc: what Petra poured into it, and whether being made of borrowed warmth is a lesser way of being real. *(Yes: consciousness in an unexpected vessel is load-bearing, mechanically and thematically.)*
- **Sorrel** — a traveler wearing a polite smile and a curse that eats names; joins mid-game after you `Serve` them in a boss battle believing they're a monster. Class: *Umbral* (MAG dps, status). Rapport arc: whether a person is what the curse says they are.

### 8.3 Structure — 6 chapters, ~4–6 hours

Each chapter = one **inn phase** (VN-heavy: arrivals, meals, choices, rapport scenes, recipe learning) + one **road phase** (RPG-heavy: escort/expedition across 2–3 maps to a waypoint, dungeon-lite, boss) + a **hearth scene** (chapter-closing ensemble dinner whose composition reflects your choices — the game's signature recurring scene, different every chapter and every playthrough).

1. **Ch. 1 — The Key and the Kettle.** Arrive; clear the cellar (tutorial battles vs. dust-wisps and a very territorial cellar-hob you can befriend with bread); Maren joins; the Kettle wakes. *Boss: the Cellar-Hob (befriendable; becomes the inn's handyman).*
2. **Ch. 2 — The Post Must Move.** Pip crashes through the door pursued by paper-wasps made of undelivered letters. Escort to Millford Bridge. *Boss: the Dead Letter Swarm (befriend = the inn gets a mailbox that matters later).*
3. **Ch. 3 — The Guest Who Wasn't.** A storm strands six travelers at the inn; overlapping VN mystery (something is eating names off the guest ledger). Road phase into the Fogmarsh. *Boss: "The Nameless Thing" — Sorrel. `Serve` route recruits them; kill route locks the true ending and Maren says so, once, quietly.*
4. **Ch. 4 — What Petra Fed the Vale.** The cellar's second door opens. Dungeon: the Root Cellar Stair, descending through preserved seasons. Petra's story in found VN vignettes. *Boss: the Preserved Winter (not befriendable — some things you can only carry, not keep).*
5. **Ch. 5 — The Long Table.** Every befriended creature and rapport-4+ guest is invited to a festival; extended VN chapter where the road phase is *hosting* (event-gauntlet at the inn map). Combo skills unlock. *Boss: none. The chapter's test is the guest list you built.*
6. **Ch. 6 — The Hungry Mile.** The Vale's hunger has a center. Final road, final door, Petra. *Final boss: the Hollow Host — a three-phase fight where phase 3 is only winnable by `Serve`, using the recipe assembled from every hearth scene's leftovers. You do not beat the hunger. You feed it.*

**Endings (4):** *Cold Hearth* (Sorrel killed / low total rapport), *Open Door* (standard), *Full Table* (all befriendables + rapport thresholds), *Keeper's Rest* (Full Table + all of Petra's vignettes → she comes home, and the epilogue seats her at a table where every chair is filled and one of them is a cushion for a kettle).

### 8.4 Content budget (the honest list)

| Content | Count | Notes |
|---|---|---|
| Maps | 14 | Inn (3 chapter-variants via decor layers), Vale overworld, 8 road/dungeon, Millford, festival variant |
| Scenes | ~90 | ~60 story, ~20 rapport, ~10 system/reusables (`call` snippets) |
| Word count | ~35–45k | Ren'Py-comparable "short-medium" |
| Actors / classes | 5 / 5 | |
| Skills | 40 | incl. 6 rapport combos |
| Items | 60 | 20 ingredients, 18 dishes, 12 consumables, 10 key/material |
| Weapons / armor | 20 / 20 | |
| Enemies / troops | 24 / 30 | 10 befriendable |
| Recipes | 18 | |
| Portrait expressions | ~40 | 5 cast × 6–8 + guests |
| Endings | 4 | |

Art strategy for v1: consistent placeholder set generated to a strict style spec (flat-color, heavy-outline "storybook" tiles and portraits), swappable later — the manifest system exists precisely so art is data.

---

## Part IX — Development Roadmap

Each phase ends with something that runs. Order is chosen so the game's content is buildable *in the tools* from Phase 4 onward — the editor gets hardened by dogfooding, which is the same evaluate-then-fix loop as the novels.

| Phase | Deliverable | Exit test |
|---|---|---|
| 0 | Repo, scaffold (per skill), event bus, state store, scene stack | `game:ready` fires; stack push/pop demo |
| 1 | Map mode: renderer, movement, collision, transfer, action events | Walk two hand-written JSON maps |
| 2 | VN mode: interpreter, stage/textbox/choices, flags/vars, save/load | Play a 3-scene branch over a live map |
| 3 | Battle mode: turn engine, commands incl. `Serve`, states, formulas | Win, lose, flee, and befriend in a test troop |
| 4 | **Studio A:** shell, project I/O, Database tabs | Author an item→equip→battle round-trip, no hand-JSON |
| 5 | **Studio B:** map editor (paint/layers/collision/events, undo) | Build the Inn map in-editor |
| 6 | **Studio C:** scene editor + live preview + cross-ref + playtest tab | Author Ch. 1 entirely in Studio |
| 7 | Content: Ch. 1–2 vertical slice, placeholder art set, audio pass | A stranger plays 45 min unaided |
| 8 | Content: Ch. 3–6, balance via batch-simulated battles (headless turn engine — same trick as cell-tactics) | All 4 endings reachable; sim winrates in band |
| 9 | Polish: backlog/skip/auto, settings, accessibility (full keyboard, reduced-motion, dyslexia-friendly font option, text-size), perf | Lighthouse-clean; playtest from cold |
| 10 | Ship: static host, itch-style page via novel-website-adjacent treatment | Public URL |

Suggested sequencing rhythm: Phases 0–3 are engine sprints; 4–6 alternate editor features with authoring attempts (the failed authoring attempt *is* the editor's backlog); 7–8 are content-dominant with engine fixes only as blockers.

### Risks & scope valves

- **Editor gold-plating** is the #1 schedule risk. Valve: any editor feature usable via the JSON pane ships as JSON-pane-only until content demands the form UI.
- **Scene count creep.** Valve: rapport scenes are the cut line; story scenes are not.
- **Battle depth vs. cozy tone.** Valve: difficulty floor stays low; `Serve` puzzles carry the depth. If balance stalls, ship easier.
- **Art.** Valve: the style spec is chosen so placeholder ≈ shippable.

---

## Part X — First Decisions Needed

1. Confirm names (Hearthlight / *Wayfarer's Rest*) or rename before the repo exists.
2. Tile size 32px and 4-dir movement — lock or contest now; both are expensive to change later.
3. Portrait art spec: expression-grid dimensions decide the manifest format.
4. Repo layout: one repo (`/engine`, `/studio`, `/games/wayfarers-rest`) is recommended — the engine has exactly one consumer until it doesn't.

*End of document — v1.0*
