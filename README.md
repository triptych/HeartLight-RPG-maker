# Hearthlight

Repo layout (per `hearthlight-gdd.md`, Part X decision):

- `engine/` — Hearthlight Engine. Vanilla HTML/CSS/JS runtime (map, battle, VN
  modes, custom elements, event bus). One consumer today (`games/wayfarers-rest`),
  designed to support more later.
- `studio/` — Hearthlight Studio, the browser-based editor. Shell + Database
  tabs as of Phase 4; Maps/Scenes/Assets/Playtest tabs are later phases.
- `games/wayfarers-rest/` — *Wayfarer's Rest*, the first game: `data/project.json`
  (the database/maps/scenes) and `assets/`. References the engine via relative
  path rather than bundling a copy.

Locked decisions (2026-07-03): names as-is, 32px tiles, 4-directional movement,
single-repo layout as above.

## Status: Phase 5 (Hearthlight Studio B: map editor)

Needs to be served over http(s), not opened via `file://` — the browser
blocks `fetch()` of `project.json`/the tileset under the file protocol.
Andrew's workflow: VS Code's Live Server extension, right-click
`games/wayfarers-rest/index.html` → "Open with Live Server" (or Go Live from
the status bar with that file open). Any other static server works too
(`npx serve .`, `python -m http.server` on Windows) if Live Server isn't
handy.

Arrow keys/WASD to walk, Space/Enter/Z to interact. You spawn outside the
waystation; walk down the path and through the door to go inside, interact
with the signpost or the kettle (interact twice — it has two pages, the
second only available once a flag from the first is set), and walk back out
through the south door. The HUD in the top-left shows the current map and
tile position.

Engine additions this phase: `engine/js/core/input.js` (keyboard → semantic
actions, held + edge-triggered), `engine/js/modes/map-mode.js` (the
`MapRuntime`: tile rendering incl. animated water, camera follow/clamp/lerp,
4-dir grid movement with buffering + hold-to-repeat, collision, and map
events — action/touch triggers with ordered/flag-gated pages),
`engine/js/components/map-scene.js` (`<map-scene>`, owns the canvas + render
loop), `engine/js/components/game-toast.js` (`<game-toast>`, listens for
`toast:show` on the bus). The command executor inside map-mode only handles
`transfer`/`flag`/`toast` — the full ~30-command vocabulary shared with VN
scenes is Phase 2/3 and will supersede it.

Test content: `games/wayfarers-rest/assets/tiles/test-tileset.json` +
`test-tileset.png` (placeholder flat-color tiles: grass/wall/animated
water/floor/path/tree), and two maps embedded in `project.json`
(`test-outside`, `test-inside`) connected by the door.

`engine/js/components/scene-placeholder.js.unused` is the old Phase 0 demo
component, superseded by `map-scene.js` — safe to delete, left renamed
rather than removed.

### Known-fixed issues

- Solid events (signpost, kettle) had no sprite and looked like plain
  ground tiles you mysteriously couldn't walk onto — `map-mode.js` now
  draws a placeholder prop marker for any solid/action event (doors stay
  marker-free, cued by their floor tile instead).
- Crossing a door caused a visible flash. Root cause: every transfer tore
  down and recreated the whole `<map-scene>` element, and there's an async
  gap (tileset fetch) before the new canvas's first draw — during that gap
  the canvas was blank, showing the shadow host's dark background through.
  Fixed: `map-scene.js` now has a `switchMap()` that swaps map data in
  place on the same element/canvas, so the last frame just stays on screen
  until the new one's first draw. `main.js`'s transfer handler uses it
  instead of pop+push when a `<map-scene>` is already on top.
- Alongside that, `input.js` gained `reset()`, called at the start of every
  map switch: clears held keys and queued presses so a direction held or an
  interact queued right as you cross a door can't fire against the new map
  (stray moves, stray event triggers). Trade-off: holding a direction
  through a door won't carry momentum into the new map — you'll need to
  press again. Revisit if that feels bad in practice.

### Phase 2: VN mode

Walk outside to Maren (the NPC standing near the waystation, a couple tiles
right of the door) and interact — she plays a 3-scene branching VN
conversation on top of the map. The map stays mounted and visible (dimmed)
underneath, per GDD Part V "scenes over maps"; it's paused (no input) while
the VN scene is on top.

New engine pieces: `engine/js/core/interpreter.js` (`runScript()` — the
shared command interpreter GDD 4.2 calls out as "the most important
unification," now used by both map events and VN scenes instead of
map-mode's old one-off `transfer`/`flag`/`toast` switch), `engine/js/core/
saves.js` (localStorage save/load, GDD 2.3), and the VN component trio:
`vn-stage.js` (background + up to 3 portrait slots, hash-colored
placeholders since there's no art pipeline yet), `vn-textbox.js`
(typewriter reveal, click/Space/Enter/Z to complete-then-advance),
`vn-choices.js` (branching prompts), unified under `vn-scene.js`
(`<vn-scene>`, drives the interpreter against those three).

`map-scene.js` gained `pauseInput()`/`resumeInput()` so a map underneath a
VN scene keeps drawing (dimmed, visible) but stops calling `update()`.
`main.js` wires `vn:play`/`vn:done` bus events to push/pop the VN scene, and
F5/F9 for quicksave/quickload (state + current map + position; a no-op
mid-VN-scene since there's no defined resume point for that yet).

Interpreter commands implemented: `say`, `choice`, `if`/`else` (flag,
flagNot, varEquals conditions), `bg`, `show`/`hide` (portraits), `flag`,
`var`, `rapport`, `toast`, `transfer`, `scene` (trigger a VN scene from a
map event), `wait`, `label`/`goto`, `jump`/`call` (scene-to-scene), `end`.

Deferred (GDD 4.1 / full command vocabulary) — not yet built: backlog, auto
mode, skip-read mode, `move`, `expr`, `cg`, `give`/`take`/`gold`, `battle`,
`shop`, `cook`, `tint`/`flash`, `weather`, `music`/`sfx`, and a `save`
command (save/load exists but only as the F5/F9 quickslot, not
scriptable).

Exit test (jsdom + local static server + fake Image/canvas harness):
17 new assertions — map event triggers `vn:play` with the right scene id,
`<vn-scene>` mounts on top of the map (stack depth 2), map input is frozen
while it's up, both typewriter lines render correctly, the two-option
choice presents and branches correctly, rapport/flag from the chosen
branch apply in the right order relative to the blocking `say` before them,
`vn:done` pops the VN scene cleanly, map input resumes afterward, and a
quicksave/mutate/quickload round-trip restores flag + map + position.
Plus the full 13-assertion Phase 0/1 regression suite re-run clean against
the refactored map-mode.js (no `bus`/old `#runCommands` switch — it now
calls the shared interpreter too).

### Phase 3: battle mode

Two more interactables outside the waystation trigger test fights: the
training dummies (a couple tiles up-left of spawn) start a straight fight
against two Dust-wisps; the cellar hatch (down-right, near the water)
starts a fight against a lone Cellar-Hob who can be talked down instead of
beaten — feed it Bread (loved) with the Serve command and its hostility
meter fills instead of its HP draining. You'll need Bread in inventory
first; there's no shop/pickup wired up yet, so for now that's a
`state.addItem('bread', 1)` from the console if you want to try it
in-browser rather than through the automated test.

New engine pieces: `engine/js/data/formulas.js` (pure damage/heal/crit/
turn-order/flee-chance functions — deliberately side-effect-free so Phase
8's "batch-simulated battles for balance" can run them in a loop with no
engine bootstrap), `engine/js/modes/battle-mode.js` (`BattleRuntime`: SPD-
based turn order recomputed each round, Attack/Skill/Item/Guard/Serve/Flee
commands, status effects that tick at the end of the affected combatant's
own turn, weighted enemy AI with `hpBelow`-style condition gates, the
Befriend meter, and an injectable `rng` for deterministic testing),
`engine/js/components/battle-hud.js` (`<battle-hud>`: combatant rows with
HP/SP bars and status badges, the command menu, a scrolling log — pure DOM,
no canvas yet; placeholder battler "art" is just name tags, same spirit as
the map's placeholder prop markers), `engine/js/components/battle-scene.js`
(`<battle-scene>`, owns the runtime + hud and pushes 'Battle' onto the
scene stack, pausing/resuming whatever's beneath exactly like `vn-scene`
does). The interpreter gained a `battle` command that fires `battle:start`
the same non-blocking way `scene` fires `vn:play`.

Test data added to `project.json`: actors Rowan and Maren with flat combat
stats (no class-curve leveling or equipment yet — that's Studio/database
territory, Phase 4+), one skill (Maren's Warden's Bash, which also applies
Chilled), two items (Bread — a dish — and a Travel Biscuit consumable),
two enemies (Dust-wisp, plain; Cellar-Hob, befriendable via Bread), two
troops, and the four status defs referenced by GDD 3.4 (poison, warm,
chilled, inspired) — only `chilled` is actually triggered by current
content, the other three are implemented and tick correctly but untested
by real content yet.

Deferred (GDD 3.3–3.6, Studio/content territory) — not yet built: XP and
leveling, persistent party HP/SP across battles, equipment/weapons/armor
effects, the full skill roster and rapport-combo skills, cooking/recipes,
shops, scripted/boss troop turns (`troops[].scripts`, incl. mid-battle VN
beats — the architecture already supports stacking a VN scene on top of a
Battle scene, just nothing triggers one yet), elemental affinities beyond
a bare multiplier lookup, and a real result screen (rewards currently
collapse to a single toast).

Exit test: two suites. A pure-logic unit suite (`BattleRuntime` imported
directly, no DOM) — 17 assertions covering win-by-defeat, loss, a rigged
flee success, befriending the Cellar-Hob with the right dish, a wrong-dish
offering barely moving the meter, status application (Chilled) and its
turn-order effect, and guard's damage reduction. Plus a full-stack DOM
integration test — walk to the training dummies, interact, confirm
`battle:start` fires and `<battle-scene>` mounts (stack depth 2, map
paused), click through the real HUD's Attack menu turn by turn to defeat
both Dust-wisps, confirm the victory banner, `battle:done`, the scene
popping, and map input resuming. Both suites green, plus the full
Phase 0–2 regression suite (30 assertions) re-run clean.

### Phase 3.5: title screen, save/load menu, touch support

Not a GDD roadmap phase — infrastructure Andrew asked for before moving on
to Phase 4, since a few real gaps had built up: the scene stack's spine
(GDD 2.2) always started `[Title] → [Map] → ...` but boot() went straight
to the map; save/load only existed as an invisible F5/F9 quickslot; and
there was no way to play on a touch device at all.

**Title screen.** `engine/js/components/title-scene.js` (`<title-scene>`):
game title, New Game, and Continue (shown only once a named save exists).
boot() now pushes this first; New Game resets state and starts at
meta.startMap/startPos, Continue applies the most recently-saved named
snapshot. Kept deliberately minimal — no Settings/slot-picker on the title
screen itself, just the entry point.

**Save/load menu.** Escape now opens `engine/js/components/game-menu.js`
(`<game-menu>`) over the map — same pause/resume pattern as VN/Battle,
GDD 2.1's `game-menu.js`, save/load slice only (party/items menus need
inventory UI that doesn't exist yet). Three named slots plus a read-only
Autosave slot, Download Save (exports the live state as a `.json` file)
and Load Save File (reads one back), built on `saves.js`'s
already-existing `exportSaveFile`/`parseSaveFile` primitives from Phase 2
— those just weren't wired to anything before. Autosave fires after every
map transfer and whenever control returns to the map from a VN scene or
battle — checkpointed at meaningful moments, not on a timer. F5/F9
quicksave/quickload still work independently, writing to their own
`quick` slot.

**Touch support.** `engine/js/components/touch-controls.js`
(`<touch-controls>`): an on-screen d-pad + interact button, visible only
while a Map scene is on top (VN/Battle/Menu/Title already have real DOM
buttons, which take taps for free) and hidden entirely on mouse-primary
desktops via `@media (hover: hover) and (pointer: fine)` rather than
one-time JS feature detection, so a hybrid device reacts correctly if its
input mode changes. Uses Pointer Events with pointer capture so a finger
sliding off a button releases cleanly. Alongside it, a responsive-CSS pass:
`battle-hud.js` rows wrap instead of overflowing under 480px, `#hud` picks
up safe-area insets and shrinks on small phones, and `#stage` uses `100dvh`
so mobile browser chrome (the address bar showing/hiding) doesn't cause
layout jumps. VN/battle/menu/title were already built with `vw`/`clamp()`
sizing from the start, so those needed no changes.

Exit test: 21 new assertions — title screen hides Continue with no saves
and shows the right title, New Game reaches the start map, touch-controls
is hidden/shown correctly across scene types, a d-pad tap actually drives
movement (via the same `input.simulateDown/Up` the keyboard uses — proven
by tracing the real event path, not by calling it directly), Escape opens
the menu and pauses the map, save-to-slot and load-from-slot round-trip
correctly, Download Save doesn't throw, a simulated Load-Save-File
round-trips state and position, and a fresh `<title-scene>` correctly
offers and applies Continue once a named save exists. One real bug caught
here: the save-slot rows were also rendering a silently-unbound Load
button (copy-paste in `#row()`), invisible until a test queried the whole
shadow root instead of scoping to the Load section specifically — fixed
by only rendering the button each section actually binds a listener for.
Plus the full existing 59-assertion Phase 0–3 regression suite re-run
clean (all four harnesses updated to click through the new title screen
first, since boot() no longer lands directly on the map).

### Phase 4: Hearthlight Studio A

A second web app, `studio/index.html` — same scaffold pattern as the
runtime (GDD 6.0/6.1): its own tiny event bus (a deliberate separate copy,
not a shared import — Studio and the runtime never share a running
process, even once Playtest puts the runtime in an iframe), `<app-modal>`
(prompt/confirm/alert, used instead of native dialogs), `<app-tabs>` (top
level: Database/Maps/Scenes/Assets/Playtest — only Database is live this
phase, the rest render disabled so the eventual shape of the app is
visible from day one), and `<app-layout>` tying it together with Open
Project / New Project / Save in the header.

**Project I/O** (`studio/js/core/project-io.js`, GDD 6.2): the File System
Access API when available (Chrome/Edge — Andrew's dev environment) keeps a
live file handle so repeated saves write straight back into the project
folder; a file-input-plus-download fallback covers browsers without it.
The File System Access path itself needs a real browser to verify (jsdom
has no polyfill for it) — everything downstream of "here's a project
object" is covered by the automated suite instead.

**Database tabs** (`studio/js/components/entity-editor.js` +
`studio/js/data/schemas.js`): one generic, schema-driven component — list
pane (create/select/delete entries) + form pane (typed fields per Part VII
schema) + JSON pane (mirrors the form live; a "Apply JSON →" button pushes
edits back the other direction, deliberately not live-synced on every
keystroke so it doesn't fight someone mid-edit typing invalid JSON) —
reused across all 11 collections (Actors, Classes, Skills, Items, Weapons,
Armor, Enemies, Troops, Recipes, States, System) rather than one bespoke
editor per type. Per the GDD's own editor-gold-plating risk valve, Actors/
Items/Weapons/Armor get full structured fields (they're what the exit test
runs through); Classes/Skills/Enemies/Troops/Recipes/States lean on the
`json` field type for their more open-ended sub-shapes (AI lists,
learnsets, stat curves) rather than bespoke widgets for every nested
shape.

**Equipment now does something in battle.** `battle-mode.js` gained
`#applyEquipment()`: an actor's equipped weapon's `atk` and armor/charm's
`def` now layer onto base stats when a battle loads. This was a real gap
from Phase 3 (equipment effects were explicitly deferred) — the exit test
needs equipping something to actually matter, so this is the one engine
change that came with the editor.

Exit test: author a weapon and equip it on Rowan entirely by driving the
real `<entity-editor>` component — click "+ New", type into the rendered
Name/ATK form fields, switch to the Actors tab, pick the new weapon from
Rowan's equip dropdown — with zero hand-written JSON anywhere. Confirm the
JSON pane mirrors the form-authored weapon live. Then feed that exact
in-memory project object into a real `BattleRuntime` and confirm Rowan's
effective ATK includes the weapon bonus and that an equipped Rowan clears
the same test fight in no more turns than an unequipped one. 12 new
assertions, plus the full existing 80-assertion Phase 0–3.5 regression
suite re-run clean (the equipment change is additive — no equip data means
no stat change, so nothing already built could have broken).

Deferred (Studio, GDD Part VI) — not yet built: Maps tab (Phase 5), Scenes
tab + live preview + playtest-in-iframe (Phase 6), Assets tab, weapon/armor
`trait` effects (element/statusOnHit/serveBonus — the stat-bonus half of
equipment works, the trait half doesn't yet), and any schema validation
beyond "is this JSON parseable."

### Phase 5: Hearthlight Studio B — map editor

The Maps tab (GDD 6.1) is now live alongside Database, and both stay
mounted at once — switching tabs just hides/shows a pane rather than
tearing it down, so map-editor undo history and in-progress database
edits both survive a tab switch.

**Core editing model** (`studio/js/core/map-editor-model.js`,
`studio/js/core/history.js`): the same split as the runtime's own
modes-vs-components pattern — `MapEditorModel` is pure logic (paint,
paintRect, floodFill, eyedropper, collision brush, event add/update/
remove/lookup, resize with top-left anchoring and out-of-bounds event
dropping), no DOM or canvas. Every mutating method returns
`{apply(), revert()}`, pushed through a generic `HistoryStack`
(undo/redo/canUndo/canRedo) that isn't map-specific — any future editor
can reuse it.

**Palette + canvas** (`studio/js/components/tileset-palette.js`,
`studio/js/components/map-canvas.js`): `<tileset-palette>` renders the
tileset image as a clickable/marquee-selectable grid. `<map-canvas>`
owns the actual editing surface — six tools (paint, rectangle, fill,
eyedropper, collision brush, event placement), four zoom presets
(50/100/150/200%, not smooth wheel-zoom), Ctrl+Z/Ctrl+Y — and mirrors
`map-scene.js`'s split by keeping all the editing logic in
`MapEditorModel`, not the canvas component.

**Command list editor** (`studio/js/components/command-list-editor.js`):
GDD 6.1 calls for the same editor to serve both map event pages and, in
Phase 6, whole VN scenes — both are just "an array of interpreter
commands" (the same shared vocabulary from Phase 2). Built once, here,
against the 19-command interpreter vocabulary; row-level expand/
collapse, reorder, delete; `if` and `choice` recursively nest child
`<command-list-editor>` instances for their `then`/`else`/per-option
sub-lists.

**Event editor** (`studio/js/components/event-editor-modal.js`):
id/x/y/trigger/solid fields plus an arbitrary number of pages, each with
flag/flagNot conditions and a mounted command-list-editor. No "sprite"
field — events don't have one anywhere in the Part VII schema or the
runtime (which draws a placeholder marker for any solid/action event),
so this doesn't invent one.

**Maps tab shell** (`studio/js/components/map-editor-view.js`): left
pane (flat, sorted map list — Part VII's `maps.id` has no folder field,
so "map list with folders" ships as a flat list rather than inventing
schema the runtime wouldn't read — plus New Map and the tileset
palette), center (tool/layer/zoom/collision-toggle/undo/redo toolbar
over the canvas), right pane (name/size/tileset/music properties, with
an Apply-size button that confirms first if shrinking would drop any
events off the edge).

Deferred, same "ship the simple version" valve used throughout this
project: smooth wheel-zoom and click-drag pan (fixed zoom presets +
scroll-container panning instead), map folders, and weapon/armor
`trait` effects (still just the Phase 4 stat-bonus half).

### Bugs found and fixed this phase

- **Critical, pre-existing since Phase 4:** `app-layout.js` referenced
  `this.#projectNameEl` (a private field) in `#openProject()` but had
  only ever declared `this._projectNameEl` — a parse-time error that
  broke the entire Studio shell on load, not just the Open Project
  button. Never caught because the Phase 4 exit test drove
  `<entity-editor>` directly rather than importing `<app-layout>`.
  Fixed by using the already-declared `_projectNameEl` consistently.
- Resizing a map called a full `loadMap()` reload purely to resize the
  `<canvas>` element to match — which also cleared the undo/redo
  history (and re-fetched the tileset) as an unwanted side effect.
  `<map-canvas>` gained a `refreshCanvasSize()` method that just resizes
  the element and redraws, leaving the model/history alone.
- `<map-editor-view>`'s `project` setter never propagated to the
  mounted `<map-canvas>`, so `loadMap()` threw on a null project the
  first time any map was selected. Fixed to set `_canvas.project` too.
- `blankCommand()` defaulted every non-number field — including
  `json`-typed ones like `flag`'s `value` — to `''`. Since the
  interpreter treats an absent `value` as `true` but a stored `''` as a
  real (falsy) value, a freshly-added `flag` command that nobody
  touched silently set the flag to `''` instead of `true`. Fixed by
  leaving `json`-type fields absent by default, matching the "blank =
  delete the key" behavior the field already has once a user edits it.

Exit test: build "The Wanderer's Inn" entirely through the real Studio
UI — New Map (prompted id), resize to 8×6 via the properties panel,
rect-fill the floor, wall the room with the collision brush (the
collision layer itself, independent of tile passability), paint a decor
tile and prove undo/redo on it, place an event via the canvas's event
tool and configure it through the real `<event-editor-modal>` +
`<command-list-editor>` (a `flag` command and a `toast` command, zero
hand-written JSON anywhere in the map or its event). Then feed that
exact in-memory project object into a real `MapRuntime` and confirm it
plays correctly: the player walks across the authored floor, is blocked
by the collision-brushed wall, is blocked by the solid event, and
interacting with the event actually runs its authored script (the flag
gets set, the toast fires with the authored text). 23 assertions, plus
120 more across the editor's individual pieces (model/history, canvas,
command-list-editor, event-editor-modal, the Maps-tab wiring in
app-layout) — 143 total, all green. `engine/` and `games/` are
untouched this phase (diffed byte-identical against the pre-Phase-5
tree), so the existing Phase 0–4 regression risk is effectively zero.

Next up (Phase 6, GDD Part IX): Scenes tab (reusing
`command-list-editor.js` for whole VN scenes) + live preview +
playtest-in-iframe.
