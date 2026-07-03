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

## Status: Phase 1 (map mode)

Serve the repo root with any static file server and open
`games/wayfarers-rest/index.html` (a plain `file://` open won't work this
phase — the browser blocks `fetch()` of `project.json`/the tileset over
`file://`; e.g. `npx serve .` or `python3 -m http.server` from the repo root,
then visit `/games/wayfarers-rest/index.html`).

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

Next up (Phase 2, GDD Part IX): VN mode — script interpreter, stage/textbox/
choices, flags/vars, save/load — playable as a 3-scene branch over a live map.
