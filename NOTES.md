# Starfall — developer notes

## Session 2 (2026-10-06) — Milestone 0: take stock

### What exists
One playable `index.html` (1186 lines, single IIFE, ~35 KB of JS). Everything is drawn in code;
sound is synthesised; no assets, no libraries, no build step. Verified working with a headless
harness (see "How to verify" below), not just by reading.

**Working:**
- rAF loop with delta-time clamped to 50 ms (a 5 s tab-away spike advances the sim by only 50 ms).
- Player: velocity smoothing toward input direction, mouse aim, hold-to-fire with recoil kick,
  3 hull, 2.2 s blink invulnerability, hit shoves the surrounding crowd away.
- Enemies: chaser / darter / tank (splits into 2 on death), soft mutual separation, edge spawning,
  HP and speed scale with elapsed time, spawn rate ramps.
- Shards → XP → levels (levels only multiply fire rate, cap 15/s); score; `starfall.best` in
  localStorage; game-over screen with stats and a 0.35 s restart guard.
- Feel: particle bursts, expanding rings, floating score text, trauma screen shake, hit flashes.
- Tiny WebAudio synth (oscillator beeps + chords), degrades cleanly when AudioContext is missing,
  M mutes. 3-layer twinkling parallax starfield. DPR-aware canvas.
- Debug hook: `window.STARFALL` exposes `STATE`, `player`, `enemies`, `stats()`. Handy for tests.

**Bugs fixed this session (found by reading, confirmed by running):**
1. `resize()` was only called at boot — no `resize` event listener. Resizing the browser left the
   canvas stale and blurry, mouse mapping wrong, and the player outside the new bounds. Fixed with
   a listener; harness now shrinks the window mid-run and checks the player stays in bounds.
2. Holding M re-fired keydown repeatedly and toggled mute every repeat. Guarded with `!e.repeat`.

### How to verify (no browser here)
- Extract the script and syntax-check:
  `node -e "...match /<script>([\s\S]*?)<\/script>/..." && node --check /tmp/game-extract.js`
- Throwaway harness `/tmp/smoke.mjs` stubs window/document/canvas/localStorage/rAF, boots the real
  script in a `vm` context, and asserts: attract frames → Space starts → bot (aim at nearest enemy,
  hold mouse) plays and dies with rising score → best stored → restart guard → second run survives a
  mid-run resize → blur + 5 s spike → mute toggle without audio. It aims by reading `STARFALL.enemies`.
  **Recreate it if lost; it is not in the repo yet.** Milestone 1 replaces it with `tools/simulate.js`.

### Notable state of the code (tech debt to burn in M1/M2)
- Arena == viewport: no 3000×3000 world, no camera (M2 item).
- Variable timestep with frame-rate-dependent smoothing (`k = dt*11`, `Math.pow(0.02, dt)`);
  fixed 120 Hz step + seeded RNG come in M1. Note: this makes the current sim non-replayable.
- Bullets create a `createLinearGradient` per bullet per frame and set `shadowBlur` per draw call —
  the main perf ceiling; M2 replaces these with pre-rendered glow sprites.
- No pooling; hot loops use `splice`. M1 adds `core/pool.js` + `core/grid.js`.
- Bullets can tunnel through thin fast enemies at low FPS (no swept collision). Fixed timestep helps;
  revisit if it bites after M2.
- No touch input at all — the game cannot start on a phone (M9). `blur` clears inputs; no pause yet.
- Numbers (speeds, HP, rates) are scattered through the file; M1 moves them to `game/balance.js`.
- `starfall.best` key will become the versioned `starfall.save` in M8.
- The sim bot (aim-at-nearest, no dodging) currently dies in 45–60 s. Worth remembering as the
  baseline before the difficulty work of M3/M10.

### Next (Milestone 1: foundations)
1. Split `index.html` into the module layout from PLAN §2 with no behaviour change (biggest item;
   likely 1–2 sessions; commit after each module extracted, keep it playable every step).
2. `core/rng.js`, `core/pool.js`, `core/grid.js` with `node --test` tests.
3. Fixed-step simulation + accumulator, clamp 100 ms.
4. `tools/simulate.js` (port the smoke harness bot). Then balance.js consolidation.
   Order note: balance.js may come early in the split since modules need somewhere to put numbers.
### Outcome of this session
- Milestone 0 fully done. Released **v0.0.1** (`releases/v0.0.1/`, tagged, listed in releases.json).
- Commits: "Take stock: fix window resize handling and M-key auto-repeat, add changelog and notes",
  then the release commit.
- Next session: start Milestone 1 with the module split. Suggested order: create `src/core/rng.js`,
  `src/core/pool.js`, `src/core/grid.js` first (self-contained, testable now), then carve `game/balance.js`
  out of the inline numbers, then move logic in stages, keeping index.html playable after every step.
  The behaviour must not change — the smoke-harness bot's trajectory is the reference.

## Session 3 (2026-10-07) — Milestone 1: the module split, the simulation, the tests

### What I did
`index.html` is now only markup + CSS + `<script type="module" src="src/main.js">`. The game lives in
`src/`, in the layout PLAN section 2 asked for:

- `core/` `math.js` (rand, clamp, lerp, dist2), `palette.js` (every colour), `save.js` (localStorage best).
- `game/` `balance.js` (every tuning number), `state.js` (START/PLAY/OVER), `world.js` (the world object
  and `stepWorld`), `run.js` (reset / start / end / restart guard), `player.js`, `bullets.js`,
  `enemies.js` (kind data, spawning, movement, death, tank split), `pickups.js` (shards),
  `progress.js` (XP and levels), `effects.js` (sparks, rings, floating text, shake), `cues.js`,
  `ambient.js` (the title-screen crowd).
- `render/` `canvas.js` (canvas + view metrics + baked gradients), `background.js` (star layers),
  `shapes.js`, `entities.js`, `effects.js`, `hud.js`, `renderer.js` (one frame).
- `audio/` `engine.js` (context, master gain, mute), `sfx.js` (beeps and chords from cues).
- `input/` `keyboard.js`, `mouse.js`, `index.js` (folds them into one `input` descriptor per step).
- `ui/screens.js` (the two DOM screens).

Three decisions worth remembering:

1. **The palette lives in `core/palette.js`, not `render/palette.js`** as PLAN section 4 says. The
   simulation picks colours too (a dying enemy bursts in its own colour, the level ring is mint) and
   `game/` may not import from `render/`. One definition, both sides read it. Deviation noted here.
2. **Sound is a queue, not a call.** Logic appends a cue (`game/cues.js`); `audio/sfx.js` drains it once
   per frame. That is what keeps `game/` audio-free, and it keeps the random pitch draws in the logic
   stream so the trajectory did not move.
3. **Input is a descriptor.** `stepWorld(dt, input)` gets `{ moveX, moveY, moving, aimX, aimY, firing }`.
   Gamepad and touch will join it in `input/index.js` without touching the simulation.

Also done because the split needed them: `tools/simulate.js` (whole headless run, `--seed --runs
--seconds --trace --audio`), the headless browser in `tools/headless/harness.js`, the bot in
`tools/headless/bot.js`, and `node --test` under `test/` (12 tests, all passing).

### How to verify
- `node --test` → 12 tests: a whole run by the bot, seed reproducibility across processes, title screen,
  mid-run resize, death and the restart guard, blur and the frame clamp, mute with and without a fake
  audio device, and two structural guards (game/ imports nothing presentation-side; no magic numbers
  outside `balance.js`).
- `node tools/simulate.js --runs 5` for a quick balance read. The naive bot now dies around 0m55s on
  average (4 seeds), which is the number to beat when difficulty work starts.
- **The reference run**: `node tools/simulate.js --seed 20261006 --trace` must die at 0m59s with
  score 811, level 3, 55 kills, 33 shards. That is the v0.0.1 trajectory; the split reproduced it
  fingerprint for fingerprint. Introducing `core/rng.js` or the fixed step will change it on purpose —
  rebaseline then and update this line.

### Bugs found on the way
- The best-score key arrived as `'***'` instead of `'starfall.best'` (a mangled literal during the port).
  The test that reads localStorage caught it. Lesson: diff the string literals, not just the code.
- The split is behaviour-identical, verified by hash: same frames (3507), same score, same screen text,
  same stored best.

### Things that surprised me
- **Rendering consumes the random stream** (shake offset, star wrap-around, thruster flicker), so the
  simulation's trajectory depends on the drawing order. It matched exactly because the split kept every
  call in place, but it is fragile. `core/rng.js` should hand out two streams, one for the game and one
  for the eye; then a logic-only simulation will stop depending on the renderer.
- The modules hold the world, so **one game per process**. Multi-run tooling calls `resetToTitle(seed)`;
  each test file boots once. A second `bootGame()` in one process will not re-run `main.js`.
- `node --test` treats *every* file under `test/` as a test file, so shared tooling lives in
  `tools/headless/` instead.
- The harness canvas stub throws on any member it does not know. That is deliberate: it turns a typo in
  drawing code into a failing test. Add members to it as the renderer grows.
- **The game now needs to be served, not double-clicked.** `index.html` loads ES modules, and Chrome
  refuses module scripts over `file://`. That is what PLAN section 2 asks for and the release menu reads
  `releases.json` with fetch anyway, so serving was already assumed - but if the game ever looks like a
  blank page, check how it is being served before hunting for a code bug.

### Next (finish Milestone 1)
1. `core/rng.js`: seeded generator with at least two streams (game, visual) + tests. Rewire `math.rand`
   and the visual randomness through it, then rebaseline the reference run.
2. `core/pool.js` and `core/grid.js` with tests, then use the pool for bullets/particles/enemies.
3. Fixed 120 Hz step + accumulator (clamp per PLAN section 2), interpolated rendering. Note PLAN says
   clamp long frames to 100 ms; today the frame delta is clamped to 50 ms (`BALANCE.maxFrameDt`).
   Decide there and note it.
4. Then release `0.1.0` (nothing released this session: the split is invisible to the player and the
   milestone's release item belongs at its end).
