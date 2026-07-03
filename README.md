# Hearthlight

Repo layout (per `hearthlight-gdd.md`, Part X decision):

- `engine/` — Hearthlight Engine. Vanilla HTML/CSS/JS runtime (map, battle, VN
  modes, custom elements, event bus). One consumer today (`games/wayfarers-rest`),
  designed to support more later.
- `studio/` — Hearthlight Studio, the browser-based editor. Not started (Phase 4+).
- `games/wayfarers-rest/` — *Wayfarer's Rest*, the first game: `data/project.json`
  (the database/maps/scenes) and `assets/`. References the engine via relative
  path rather than bundling a copy.

Locked decisions (2026-07-03): names as-is, 32px tiles, 4-directional movement,
single-repo layout as above.

## Status: Phase 2 (VN mode)

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

Next up (Phase 3, GDD Part IX): battle mode.
