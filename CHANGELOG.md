# Starfall — changelog

## 0.2.0 — 2026-10-07
The ship answers like you expect now.
- New flight model, on the design numbers: top speed 320, full speed about 0.13 s after you lean, a
  standstill about 0.10 s after you let go. Turning around is a slide, not a pivot, and the ship stops
  dead instead of coasting to a crawl.
- The ship's hitbox is now 6 px instead of the 16 px you can see: brush the crowd's shoulder and live.
  Hit invulnerability is 1.5 s to match.
- Fixed: a run could depend on how long the browser tab had been open. A frame is now measured to the
  microsecond and no finer, so a shared seed plays the same run in a fresh tab and an old one.
- Test suite is up to 79, including a suite that measures the ship's acceleration, braking and hitbox.

## 0.1.0 — 2026-10-07
The foundations release: the game is now modules, and its clock belongs to the game, not the display.
- Fixed 120 Hz simulation with interpolated rendering: a run plays out identically on a 30 Hz netbook
  and a 240 Hz monitor, a stutter no longer teleports the ship, and a background tab neither
  fast-forwards nor stalls it.
- Seeded runs: every seed replays exactly, and `?seed=42` in the address bar fixes the arena for the
  visit. The game-over screen shows the seed.
- A spatial collision grid (shots only meet the enemies near them) and object pools for shots, shards
  and every particle - no allocation in the hot loops.
- Tooling: `node --test` suite (71 tests), and `tools/simulate.js` plays a whole run headless with a
  simple bot and reports the outcome.

## 0.0.1 — 2026-10-06
The starting point: the whole game as one `index.html`, no libraries, no build step.
- Neon arena survival: fly with WASD, aim with the mouse, hold click to fire, collect shards, level up.
- Three enemy types (chaser, darter, splitting tank) with time-based difficulty ramp.
- Particles, shockwave rings, screen shake, parallax starfield, synthesised sound effects, best-score saving.
- Fixes found taking stock: the game now reacts to window resizes (before, a resized window left a
  stale, blurry canvas and wrong mouse coordinates), and holding M no longer toggles mute on every
  key repeat.
