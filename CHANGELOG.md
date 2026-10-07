# Starfall — changelog

## 0.2.4 — 2026-10-07
The arena is a world now: 3000 × 3000, and a camera to fly it.
- The fight moved off the window and into a world about six screens across. The view follows the ship
  one for one - it never slides around under you - and leans a little towards whatever you are aiming
  at, so you see a touch more of what you are pointing at.
- The edge of the world is a glowing energy wall: a bright line, a soft band, and a row of ticks
  reaching in. Only the edges you can actually see are drawn.
- Nothing arrives in plain sight any more. Enemies come in just off the edge of the screen and never
  within 260 px of the ship, so being cornered against the world's edge no longer means a chaser
  lands on you.
- Shots, sparks, shards and enemies you cannot see are not drawn at all.
- The simple bot now survives about 1m20s where it took 1m00s, because it can back away instead of
  being trapped by the edge of the window. The reference run was rebaselined on purpose.
- Test suite is up to 147: the camera follows, clamps, leans and turns the cursor back into a place in
  the world; every arrival is off-screen, in the world and off the ship; a wall costs four strokes per
  visible edge and nothing for an edge you cannot see.

## 0.2.3 — 2026-10-07
The game stops for the hits that matter: hit-stop is in.
- Killing a big enemy holds the whole world still for 40 ms; taking a hit yourself holds it for 90 ms.
  Sparks hang in the air, the crowd hangs mid-lunge, the screen keeps shaking - and then it all snaps
  back. It is the difference between a number going down and something happening.
- Dying gets the same 90 ms of stillness, with the game-over summary arriving over the top of it.
- A dash pressed during that pause is not lost: the press waits for the world to wake up and is
  answered on its very first step, so mashing while you are stunned gets you moving the moment you can.
- The screen shake and the little guard on restarting still run during a freeze, so a freeze cannot
  steal time from either - it only ever stops the run.
- Test suite is up to 129: the freeze is measured in steps, and what a frozen frame is allowed to move.

## 0.2.2 — 2026-10-07
Every light in the game is now a pre-rendered sprite, and nothing asks the canvas to blur a shape.
- Halos around the ship, the enemies, the shards and the hull pips, the shots' trails, the thruster
  flame, the dash blur and the labels' halos are all baked once into small offscreen images and
  stamped, instead of being blurred or gradient-filled on the spot every frame. They read the same,
  a little brighter where a blur used to eat itself.
- A frame now builds no gradients and no shadows at all: at the plan's target load of 1500 shots in
  the air that is 1500 gradient objects and 1500 blurred strokes per frame gone, replaced by 1500
  stamps of one cached image. This is the ceiling lifted before the crowd is allowed to grow.
- A hit now flashes white as a bloom of light as well as a white outline.
- Test suite is up to 119, including the sprite cache itself and a suite that measures what a frame
  is allowed to build while you watch it.

## 0.2.1 — 2026-10-07
The dash is in: Space or the right mouse button throws the ship 220 px in 0.12 s.
- It is a committed burst on its own rails - the engines cannot fight it halfway - and it goes where
  you are leaning, or wherever the cursor is if nothing is held. You come out of it moving at the
  ship's top speed in that direction, so a dash is a flick, not a teleport.
- Nothing can touch you while it lasts, and it shoulders the crowd aside as it passes through, so a
  dash that ends in the middle of a mob ends somewhere you can stand. The 2.5 s wait starts when the
  dash starts: one stopped dead by a wall still costs all of it.
- You can see all of it: a streak with two afterimages behind the hull, a burst and a ring at the
  start, and a ring around the ship that closes over the wait and breathes once it is ready again.
- One press is one dash. Mashing during the wait buys nothing, a key's auto-repeat is not a second
  press, and the press that launches a run is not also a dash.
- Test suite is up to 102, including the whole control path through the real keyboard and mouse.

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
