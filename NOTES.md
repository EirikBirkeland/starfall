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
- **The reference run**: `node tools/simulate.js --seed 20261006 --trace` must die at 1m03s with
  score 783, level 3, 56 kills, 33 shards (rebaselined in session 4 when `core/rng.js` landed;
  the old v0.0.1 numbers were 0m59s / 811 with 55 kills). The fixed step will move it again on purpose — rebaseline then.

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

## Session 4 (2026-10-07) — Milestone 1: seeded RNG, two streams

Found a finished-but-uncommitted `core/rng.js` work-in-progress in the tree (an earlier session
ended before it could verify and commit). I reviewed it end to end, kept it, fixed one real bug in
it (below), verified everything, and committed it.

### What landed
- **`src/core/rng.js`** — mulberry32 with a golden-ratio seed scramble and 4-number warmup.
  Two named streams: `logic` (everything that can move the simulation) and `visual` (star twinkle,
  thruster flicker, shake). `setSeed(seed)` restarts both; `randomSeed()` is the one unseeded draw
  in the game (clock ^ `Math.random`), and a structure test asserts `Math.random` appears nowhere
  else in `src/`.
- Every `Math.random` / `rand()` call site now reads a stream. `core/math.js` lost `rand`/`randi`.
  Enemy per-instance `seed` field renamed to `phase` (its place in the wobble cycle) — it collided
  with the word for the run seed.
- **The fragility from session 3 is gone**: the renderer draws from `visual`, so consuming more (or
  less) eye-candy can no longer move a run. Test: "drawing cannot move the simulation".
- `world.seed` exists; `startRun` reseeds the logic stream from it, so **a seed replays a run**.
  The headless harness now seeds through `core/rng.js` too (it deleted its private mulberry32).
- Address bar seeds: `?seed=42` fixes the run for the visit (how runs get shared; the groundwork
  for the M10 daily run). Game-over screen shows `SEED <n>`.
- New tests: `test/rng.test.mjs` (9 tests: repeatability, ranges, distribution, neighbouring seeds,
  stream independence), `test/seed.test.mjs` (address-bar seed; same seed replays, different seed
  doesn't), `test/restart.test.mjs` (see the bug), 2 new structure tests (only the seed chooser
  calls `Math.random`; `game/` never reads `visual`, `render|audio|ui|input` never read `logic`).
  Suite is now 27 tests, all passing.

### The bug I found in the unfinished work
As drafted, `world.seed` was picked once per page visit and `startRun` reseeds from it — so every
restart in a browser replayed **the exact same arena**. Fixed in `main.js`: the visit's seed is
*pinned* only when the address bar asked for one or the headless tools fixed one before boot;
otherwise `pressAction` draws a fresh `randomSeed()` for each run. The harness pin keeps simulate
deterministic; `test/restart.test.mjs` plays two runs on one unpinned boot and asserts different
seeds and traces.

### Reference run rebaselined
`node tools/simulate.js --seed 20261006 --trace` → dies 1m03s, score 783, level 3, 56 kills,
33 shards. Bot over 4 seeds now averages ~1m06s (was ~0m55s pre-RNG: different stream, luckier
spawn layout — not a balance change). Old numbers live in the session 3 note.

### Notes for future sessions
- `game/` modules import the `logic` stream from `core/rng.js` directly (no rng passed around).
  If a future item needs deterministic replay *within* a run (recording), that's still fine —
  the whole run is a function of the seed as long as nobody calls `visual` from logic.
- `simulate.js --seed N --runs R` plays seeds N..N+R-1. `bootGame({ seed: null })` emulates a
  real browser (unpinned); `{ url: '?seed=42' }` emulates a pinned address bar.

### Next (finish Milestone 1)
1. `core/pool.js` and `core/grid.js` with tests, then use the pool for bullets/particles (and the
   grid for bullet↔enemy collision — today `updateBullets` scans the enemy array).
2. Fixed 120 Hz step + accumulator in `main.js` (clamp long frames per PLAN; today `BALANCE.maxFrameDt`
   clamps the frame delta to 50 ms — decide 50 vs 100 there and note it). Rebaseline the reference run.
3. Then release `0.1.0` (last item of M1). Not released this session: M1's release sits at its end.

## Session 5 (2026-10-07) — Milestone 1: the object pool

### What landed
- **`src/core/pool.js`** — one class, `Pool`. It owns its live list (`items`) plus a
  drawer of dead objects: `spawn()` recycles or (only when the drawer is empty) builds
  one from the factory, `killAt(i)` removes by swapping the **last** live object into the
  hole, `trim(n)` and `clear()` give objects back, `stats()` reports
  `{ live, free, made, spawned }`. Removal is O(1) and a warm pool allocates nothing.
  `killAt` throws `RangeError` on a fractional or out-of-range index, so an off-by-one is
  a failing test rather than a silently corrupt list.
- **The three effect lists now live in pools**: `world.particles`, `world.rings`,
  `world.texts` (they are the busiest things in the game — one death sprays 30 sparks, and
  the caps are 900 / none / 40). `game/effects.js` owns the shapes via `makeParticle` /
  `makeRing` / `makeLabel`, and every spawner writes **every** field, which is what keeps a
  recycled object from leaking a value from its previous life. `run.js` resets them with
  `clear()` instead of `length = 0`, so a restart keeps the objects it already built.
  The renderer reads `pool.count` / `pool.items`; the score labels' `t` field is now `text`.
- **`test/pool.test.mjs`** — 11 tests: shape comes from the factory, killed objects come
  back instead of new ones, the recycle contract that the spawner must overwrite everything,
  the swap-remove ordering contract stated as a test, `killAt` rejections, `trim`, `clear`,
  a backwards sweep visiting every live object exactly once, the `made === peak live`
  invariant under 200 rounds of churn, `stats()` honesty, and one real run proving the
  game reuses its fx objects. Suite is now **38 tests, all passing**.

### Proof it changed nothing
`node tools/simulate.js --seed 20261006 --trace` reproduces the session-4 reference run
**byte for byte** (1m03s, score 783, level 3, 56 kills, 33 shards, every trace hash equal).
That is the point of pooling only the three cosmetic lists: they never feed back into the
simulation and the pool preserves how many are alive at any moment, so the logic stream is
untouched. Bot average over seeds 1-4 is still 1m06s.

### Why the pool is unordered, and what that blocks
Swap-remove is what makes removal O(1), and any list that must keep its order (a queue, a
back-to-front paint list, the enemy array whose separation pass walks pairs by index) does
not belong in a pool. So:
- **bullets, enemies and shards are still plain arrays with `splice`.** They join the pool in
  the `core/grid.js` session, when the collision order changes anyway and the reference run
  gets rebaselined on purpose — one deliberate rebaseline instead of two.
- A loop that removes from a pool must count **downwards**; `updateEffects` does, and there
  is a test for exactly that pattern.
- `burst()` used to drop the *oldest* sparks over the cap and now drops an arbitrary handful
  (the pool has no order). Same count, and nothing may depend on it. Noted in the code.

### Numbers
Throwaway benchmark (900 frames, 40 spawns/frame, cap 1200, ~72 000 lives): array with
`splice` 42.8 ms, pool 2.2 ms — most of the win is not the allocation, it is that removal
stopped shifting the tail of the array. In a real bot run the particle pool built **142**
objects for **2 939** lives (~20x reuse), rings 3 for 66, labels 5 for 61. `stats()` is
ready for the F3 debug overlay (M10).

### Next (finish Milestone 1)
1. `core/grid.js`: spatial grid with insert, clear, query-by-circle, with tests. Wire it into
   `updateBullets` (today every bullet scans every enemy) and pool **bullets** with it;
   rebaseline the reference run and say why.
2. Fixed 120 Hz step + accumulator in `main.js`, interpolated rendering, clamp long frames
   (PLAN says 100 ms; `BALANCE.maxFrameDt` is 0.05 — decide and note it). Rebaseline again.
3. Then release `0.1.0` (last item of M1). Still nothing released: pooling is invisible to
   the player and M1's release sits at its end.

## Session 6 (2026-10-07) — Milestone 1: the collision grid, and bullets on a pool

### What landed
- **`src/core/grid.js`** — `Grid`, a uniform spatial grid: `insert(item)` files it in the one cell
  holding its centre, `clear()` empties the grid while keeping every cell array, `queryCircle(x, y, r, out)`
  appends every item in the cells overlapping the circle's bounding box into a scratch array the caller
  owns. No dedup is needed (an item lives in exactly one cell) and rebuilding allocates nothing. Cells are
  keyed by one integer (`cx * 1000003 + cy`) in a Map, so negative cells work — enemies spawn outside the
  arena on purpose — and no string is built per lookup. Bad numbers throw (`insert({x: NaN})`, an infinite
  query radius): a silent miss here would be a bullet walking through an enemy.
  **Contract, and it is a broad phase**: the result is a superset — everything whose centre is inside the
  circle, plus whatever shares a cell with that box — so the caller still makes the exact test, and the
  radius must cover the item's own size (a bullet asks with the widest enemy + its hit radius).
- **`updateBullets` runs on it.** `rebuildEnemyGrid(world)` files the crowd once per step, then each
  bullet queries `widestEnemyRadius() + hitRadius` and makes the old exact test against the handful that
  came back. The bullets are no longer compared to every enemy (PLAN section 2's rule).
- **Bullets and shards are pooled** (`world.bullets`, `world.shards`, factories `makeBullet` / `makeShard`;
  every spawner writes every field). That killed the last `splice` calls in the two hottest loops. The
  **crowd stays a plain array**: the separation pass walks its pairs by index, which an unordered pool
  cannot promise, and `killEnemy` wanted an index. Deferred, not forgotten.
- **`killEnemy(world, enemy, byPlayer)` takes the enemy, not an index** — the grid hands back objects, and
  `indexOf` beats threading indices through a snapshot. It throws if the enemy is not in the crowd: the old
  `splice(-1, 1)` would have silently removed somebody else.
- Two rules fall out of the grid being a **snapshot**, both now tested:
  1. an enemy killed mid-step stays filed in it until the next rebuild, so a bullet skips anything with
     `hp <= 0` — one enemy dies once, no double score or doubled shards;
  2. tank hatchlings join the collision world on the next step (they are flung clear as they appear).
- Tests: `test/grid.test.mjs` (9: cell validation, empty grid, found-where-it-stands, *never misses* a
  thing inside the circle over 60 probes against brute force, negatives, a rebuild that allocates nothing,
  `stats()` honesty, nonsense inputs, and a "600 enemies, one query looks at ≤ a handful" perf promise)
  and `test/collision.test.mjs` (7 real-simulation tests that drive `stepWorld` on a scripted world:
  the grid mirrors the crowd each step, a shot that lands, a shot that stops 4 px short, one-death-once,
  the hatchling rule, shots returning to the pool, the despawn margin). `test/pool.test.mjs`'s real-run
  test now watches bullets and shards too. **54 tests, all passing.**

### Proof it changed nothing
`node tools/simulate.js --seed 20261006 --trace` is **byte for byte the session-4 reference run** again
(1m03s, 783, level 3, 56 kills, 33 shards, all 31 trace hashes equal). No rebaseline was needed after
all: two bullets competing for one enemy in one step, and a bullet reaching two enemies in one step, turn
out not to happen in this run. Bot average over seeds 1-4 is still 1m06s. Don't read that as a guarantee
that collision order never matters — read it as "it does not matter in this run".

### Numbers (throwaway benchmarks, `/tmp/bench-*.mjs`, not in the repo)
- Target load, 600 enemies + 1500 bullets in 1600x900: broad phase **0.25 ms/frame with the grid,
  1.66 ms/frame scanning every enemy from every bullet** (~6.6x). Distance tests per frame drop from
  ~730 000 to ~7 200; the rest of the grid's time is Map lookups and filling the candidate list.
- Where the step goes now at that load: `updateBullets` 0.41 ms, `updateEnemies` 0.38 ms — so the enemy
  **separation pass is now the other half of the frame** and the next thing worth putting on the grid.
- In a real bot run the bullet pool built **5 objects for 277 lives**, shards 25 for 102 (peak live, so
  those pools are tiny and stay warm). `world.grid` allocated 261 cells for a 1280x720 view.

### Notes for future sessions
- `world.grid` is derived state: rebuilt at the top of `updateBullets`, cleared by `resetRun`, and stale on
  the title and game-over screens. Nothing may read it between rebuilds, and nothing in the renderer should
  need it. If a system needs it later (nova damage, blast radius, enemy separation), rebuild it where it is
  needed or move the rebuild up into `stepRun` — but then say what reads it.
- `BALANCE.grid.cellSize` (64) is a performance knob, not balance; it wants to be about twice the widest
  hit test. It sits in `balance.js` only because that is where numbers live and `game/` may not hard-code one.
- A flat typed-array-indexed grid (arena-sized, with clamped border cells) would beat the Map if the M10
  performance pass ever needs it. Not today: 0.25 ms/frame is 1.5% of a 60 fps budget.
- The grid can be shared with the separation pass later; that changes pair order and *will* need a
  deliberate rebaseline. Do it in its own session, or with the fixed step, not as a side quest.

### Next (finish Milestone 1)
1. Fixed 120 Hz step + accumulator in `main.js`, interpolated rendering, clamp long frames (PLAN says
   100 ms; `BALANCE.maxFrameDt` is 0.05 — decide and note it). This will move the reference run on purpose:
   record the new one. Interpolation needs previous positions for the player, bullets, and enemies, so
   plan where `px, py` live (the pools' factories are the place).
2. Then release `0.1.0` (last item of M1): CHANGELOG entry + `tools/release.sh 0.1.0 "..."`. The script
   already copies `src/`, runs the tests and the simulation, and refuses a dirty tree.
