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

## Status: Phase 0 (repo, event bus, state store, scene stack)

Open `games/wayfarers-rest/index.html` directly in a browser (or serve the repo
root with any static file server — no build step). The dev toolbar at the
bottom lets you push/pop Title, Map, Battle, and VN placeholder scenes to
confirm the stack behaves per spec: pushing stacks a new panel on top without
removing what's beneath (VN panels render translucent so the map "shows
through," per GDD Part V), and popping restores exactly what was there before.
Open the browser console to see `game:ready` fire on load and `scene:push`
/ `scene:pop` events as you click.

Next up (Phase 1, GDD Part IX): map mode — canvas tile renderer, movement,
collision, transfer events — playable against two hand-written test maps.
