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

## Session 7 (2026-10-07) — Milestone 1: the fixed step, and interpolated rendering

### What landed
Milestone 1's last technical item. The simulation now advances in **fixed 1/120 s steps**
(`BALANCE.sim.step`) and the frame is **drawn between two of them**.

- **`src/core/clock.js`** — `createClock(step, maxFrameDt)`. `frame(now)` returns
  `{ dt, steps, alpha, fps }`: the whole steps this frame owes, and the fraction of the next one
  the frame is drawn at. Long gaps are counted as `maxFrameDt` (**0.1 s now, PLAN's number** — it
  was 0.05; the clamp is also the catch-up limit, 12 steps a frame). `reset()` forgets the past.
  `BALANCE.maxFrameDt` moved into `BALANCE.sim` with the step; the fps readout moved out of
  `main.js` into the clock.
- **`src/render/interp.js`** — `paintX`/`paintY`: `lerp(px, x, alpha)`. `renderFrame(fps, alpha)`
  hands alpha to every draw that moves (ship, bullets, shards, enemies, sparks). Rings and score
  labels are deliberately *not* interpolated: a step of them is a pixel at most.
- **Every mover keeps a `px`/`py`** — the ship, bullets, enemies, shards, sparks. The rule
  (`stepWorld`'s comment says it): a position may only change inside a step, and the system that
  moves something writes `px/py` first. `updateEnemies` snapshots the whole crowd **before** the
  separation pass, or a shoved neighbour would be remembered from after its push. The menu crowd's
  edge wrap snaps `px` with `x`, or a wrapping enemy slides across the arena for a frame. Every
  spawner writes `px/py` too — that is the pool's "write every field" contract, now with teeth.
- `world.steps` counts this run's steps (reset with the run); `STARFALL.stats()` reports
  `steps`, `alpha`, `fps`. Ready for the F3 overlay in M10.
- **`STARFALL.resetClock()`**, and `tools/headless/harness.js` calls it in `resetToTitle`. See the
  surprise below; this is what keeps "the same seed replays the same run" true.
- A real bug found while doing this: **`fire` never wrote `px/py`**, so a bullet's first frame drew
  its trail from (0,0). The contract test caught it before anything saw it. Same for
  `makeEnemy`'s `opts`: `opts.r || default` silently ate a requested **zero** (zero speed, zero
  drop, zero hp). Now a little `chosen(opts, key, fallback)`, and the hatchling's score override
  went through `opts` like every other override.
- `tools/headless/scripted.js`: the scripted world (park a run, plant an enemy, plant a shot, take
  one fixed step), shared by `collision.test.mjs` and the new interp tests instead of duplicated.
- `tools/release.sh` now syntax-checks `.mjs` too (it only ever looked at `.js`, so every test file
  was slipping past the check).

### Tests: 71, all passing (was 54)
- `test/clock.test.mjs` (7): the same wall clock is the same number of steps at 30/60/144/240 Hz; a
  1000 Hz display still gets one second per second; a background tab is the clamp, not the gap;
  alpha stays a fraction and really does cover the range; **steps + carry = wall clock** (nothing
  invented, nothing lost); `reset()` reproduces a fresh page frame for frame; the fps readout counts
  frames, not steps.
- `test/interp.test.mjs` (5): the px/py contract on the world — fresh run, every kind of mover,
  a spark born by a hit, the pile-of-three separation case, the wrapping menu enemy.
- `test/framerate.test.mjs` (5): a booted game. Same simulation for the same seconds at 60 and 240
  fps; a 5 s stutter caught up in at most the clamp; every frame paints the ship between the steps
  (read off the canvas translates the harness now records); a juddering frame rate; frames that run
  no step at all still paint it. `tools/headless/harness.js` gained `translates()` — the frame's
  `translate` calls, which is how a test can see *where* something was drawn.
- `session.test.mjs`: the 5 s tab-away now asserts the 0.1 s clamp (+ one step of slack), and the
  planted killer enemy is built by `makeEnemy` so it is a real enemy.
- `collision.test.mjs` runs at the game's own step now (`BALANCE.sim.step`), not its own 1/60.

### The surprise that taught the most
`test/seed.test.mjs` failed first: the same seed, played twice in one process, diverged. Not a bug
in the step — a **phase** thing. With 16.7 ms frames and an 8.333 ms step the accumulator picks up an
extra step every ~250 frames, and *where a run starts in that cycle* decides which frame's bot input
lands on which step. One step of difference in the bot's aim is a different run. A real browser never
does this: every play session is a page that has never run a frame. So the fake browser now says the
same thing (`resetClock()` in `resetToTitle`) and the promise is testable again. Cross-process
determinism (`tools/simulate.js --seed N` twice) held all along.

Note what that means for 60 Hz: 16.67 ms is exactly two steps, so `alpha` sits near 0 and a 60 Hz
display is effectively drawing one step behind, uniformly. The interpolation earns its keep on
144 Hz displays and during a stutter — which is why the tests that look for it drive 3-4 ms frames.

### Reference run, rebaselined on purpose
`node tools/simulate.js --seed 20261006 --trace` → **dies 1m19s, score 1257, level 5, 82 kills,
78 shards**. Bot over seeds 1-4: **1m05s average** (score 865, level 3.3, 62 kills) — the same
ballpark as the old 1m06s, so the fixed step moved the difficulty, not the balance. The old numbers
(1m03s / 783) are in the session 4 and 6 notes.

### Perf, measured (`/tmp/stepbench.mjs`, throwaway)
At PLAN's extreme load (600 enemies, 1500 bullets, 900 sparks): one step costs ~0.6 ms, and a 60 fps
frame now runs two of them → **~1.2-1.35 ms of simulation per frame, vs ~0.55 before**. That is the
price of the fixed step: 2x the simulation, ~8% of a 60 fps budget, and the game currently caps the
crowd at 100 enemies. If M10's performance pass needs it back, the two halves are the enemy
separation pass and the per-step grid rebuild.

### Released **v0.1.0** — Milestone 1 is done.

### Next (Milestone 2: feel)
Pick one per session. Suggested order and notes:
1. **Player movement to PLAN 3.1** (accel 2400, friction stopping in 0.10 s, hit radius 6 vs a
   16 px ship). Today `updatePlayer` smooths velocity toward the input (`steerSmoothing`), which is
   close but not the numbers; the fixed step makes an honest acceleration trivial. Keep the aim code
   reading `input.aimX/aimY`.
2. **Pre-rendered glow sprites** and no `shadowBlur` per draw (PLAN section 4). Bullets already build
   a gradient per bullet per frame; that is the biggest rendering win, and M2's "600 enemies" target
   needs it before the crowd grows.
3. **Arena 3000×3000 + camera + energy walls.** The camera must read the *interpolated* position
   (`paintX/paintY`), not `x`, or the view will jitter one step out of phase with what it draws. The
   arena stops being the viewport: `world.arena` is already the only thing the sim reads for its
   bounds, and the renderer will need a transform, which the draw calls currently bake into the canvas.
4. **Hit-stop** (freeze 40 ms on big kills, 90 ms on a player hit). With a fixed step: skip the
   `stepWorld` loop while a freeze timer runs, but *drain the accumulator* while frozen or the clock
   will hand back a burst of catch-up steps the moment it unfreezes. Put the timer on the world and
   step it in real time, not in step time.

## Session 8 (2026-10-07) — Milestone 2: the ship flies like the plan says

### What landed
**Player movement to PLAN 3.1** (`accel`, `friction`, small hit radius). The old model smoothed the
velocity toward the input direction (`steerSmoothing: 11`, a per-frame constant); the ship now steers
its **velocity** toward wherever the controls point, at a rate in px/s²:

- `maxSpeed 320` (was 258), `accel 2400` → full speed 0.133 s after you lean; `brake 3200` → a
  standstill 0.100 s after you let go, and *exactly* zero, not an asymptotic creep.
  One rule in `steer()` in `game/player.js`: find the gap between the current velocity and the target,
  close at most `rate × dt` of it, never past the target. Same shape whether the ship was already
  moving that way or the exact opposite, which is what makes a U-turn a slide (0.27 s) rather than a
  pivot or a pole-vault. Because both numbers are accelerations and nothing is smoothed per frame,
  the model is honest at a fixed 1/120 s (the old `dt * 11` was frame-rate maths the fixed step was
  papering over).
- **`hitRadius` 6, `drawRadius` 13** (the drawing is unchanged: its nose still sits 16 px out). The
  world ship keeps `r` = the hit radius and gains `drawR`; everything that draws or measures the ship
  by eye (the hull in `render/entities.js`, the LV label in `progress.js`, the muzzle in `fire()`,
  the wall clamp in `updatePlayer`) reads `drawR`, and the only place `r` is used for anything is the
  contact test in `updateEnemies` - `reach = enemy.r + ship.r`, `contactRadiusFactor` deleted with it.
  You can now fly a chaser's shoulder and live. The wall clamp uses `drawR`, so the ship never sinks
  into the edge of the screen by its nose.
- `shards.collectRadius` is now measured **from the ship's centre** (25 px, which is exactly what
  `r + collectRadius` used to be), because adding the hit radius to it would have quietly halved how
  close you have to fly to be paid. `shards.magnetRadius` stays 145, not PLAN's 70: deliberate - the
  hitbox shrink means leaning into a shard pile is now a thing you *can* do, and next session the
  arena becomes 3000×3000, where a 12-second shard that is 70 px out of your way is a shard nobody sees.
- `hitInvulnerability` 2.2 → **1.5** (PLAN's number). The small hitbox is a gift; this pays for it.
- `steer()` also clamps the *target* to `maxSpeed`, so a control layer that hands over a direction
  longer than 1 (a gamepad stick shoved twice as hard, a future touch pad) buys a normal-speed ship.
  `input/index.js` normalises today; this is the one place that would care if it ever stopped.

### The bug this found, and it is not a movement bug
`test/seed.test.mjs` went red: the same seed, played twice in one process, drifted apart - at frame
690 of seed 4031 one run had taken 1385 steps and the other 1384. **`core/clock.js` was measuring a
frame too precisely.** `(now - last) / 1000` is a difference of two timestamps that grow all session,
so two frames that are both "16.7 ms" come out differing in the 12th decimal depending on how long the
page has been open. That noise is smaller than a step, but `carry` accumulates it, and about 34 seconds
in it tipped one frame over a step boundary - one extra step, one different frame of bot input, a
different run. It never showed up before because nothing had yet run long enough to notice.

Fixed in the clock: a frame's length is rounded to the **microsecond** and no finer
(`Math.round((now - last) * 1000) / 1e6`). Nobody can tell two frames apart below that, and a run must
not be able to either. This was never only a test artifact: a shared `?seed=` played in a tab that has
been open an hour was a different game from one played in a fresh tab. Test: `test/clock.test.mjs`
"the same rhythm an hour into a page asks for the same simulation" (4000 frames, both sequences
bit-identical). Cross-process determinism had held all along - `tools/simulate.js --seed N` twice was
always byte-identical.

### Tests: 79, all passing (was 71)
- `test/movement.test.mjs` (7): the plan's numbers are still the code's numbers (start-up 0.13 s, stop
  0.10 s, hit radius 6, hull 3); a lean reaches full speed when it should and settles on it without
  ringing; letting go stops the ship dead and never past zero; nothing can be held above the top speed,
  including a push of length 2; a U-turn is a 0.27 s slide; the arena holds the ship by its drawn body;
  and an enemy overlapping the *drawing* does not cost hull while one on the core does.
- `tools/headless/scripted.js`: `stepTheWorld(input)` takes what the ship is doing, and `flyFor(seconds,
  input)` holds it and returns the whole path `[{ t, vx, vy, x, y }]` - a movement test should measure
  seconds, not count frames.
- `test/clock.test.mjs` +1 (above).

### Reference run, rebaselined on purpose
`node tools/simulate.js --seed 20261006 --trace` → **dies 1m14s, score 1108, level 4, 74 kills,
64 shards** (was 1m19s / 1257 / level 5 / 82 / 78). Bot over seeds 1-4: **1m00s** average, score 726
(was 1m06s / 865). The bigger hitbox gift and the shorter invulnerability nearly cancel out; the naive
bot comes out 6 s down because it stands still and gets mobbed. Faster ship + a 6 px hitbox is a big
gain for a player who moves, and the bot barely moves. That is the number M3's dodging bot will show.

### Released **v0.2.0**.

### Notes for future sessions
- **Firing no longer shoves the ship.** `recoil: 14` px/s is eaten by the brake in a single step
  (brake × step = 26.7 px/s). If recoil wants to be felt again it has to come back as a visible kick -
  muzzle flash, a small trauma - not as velocity. Not touched this session; it is a feel call and it is
  a small one.
- The dash (next M2 item) wants a burst of velocity, and the brake will fight it: either the dash sets
  the velocity and the ship keeps `moving: false` for its duration, or the dash is a position offset
  applied after `steer()`. Think about which when it comes up; the fixed step makes either cheap.
- `world.player.drawR` is a number, not the balance key's name - `BALANCE.player.drawRadius`. Ships
  (M5) will want both plus a shape, and `resetRun` does not re-derive them from BALANCE, so a ship
  select has to write them.

### Next (Milestone 2)
1. **Dash**: 220 px in 0.12 s, 2.5 s cooldown, invulnerable during it, cooldown ring around the ship,
   Space or right mouse. It is PLAN 3.1's last movement row and it wants `input` to grow a `dash` edge.
2. Pre-rendered glow sprites; drop per-frame `shadowBlur`.
3. Arena 3000×3000 + camera (reading the interpolated position) + energy walls.
4. Hit-stop (freeze 40 ms on big kills, 90 ms on a player hit) - the session-7 note says how to do it
   without the clock biting back: drain the accumulator while frozen.

## Session 9 (2026-10-07) — Milestone 2: the dash

Session 8's notes ended with the dash as "next", and the working tree already held an uncommitted,
half-tested attempt at it. Almost all of this session was finishing and verifying that: the design in
`player.js`/`balance.js` was sound and stayed, the tests were where it fell apart.

### What landed
- **The dash itself** (PLAN 3.1's last movement row, now ticked). `BALANCE.player.dash`:
  220 px in 0.12 s, 2.5 s cooldown, and one committed burst on *rails*: `dashStep()` moves the ship
  by `distance/time * dt` each step and the engines are not consulted until it is over, so the brake
  cannot strangle it halfway (that was session 8's open question - a velocity shove would have been
  eaten by `brake`, exactly like `recoil` is). When it ends the ship keeps the dash's direction at
  `maxSpeed`, which leaves a `v²/2a` = 16 px glide: a flick, not a teleport, and not a slingshot.
  Direction: the lean if one is held, else the cursor, else the nose (cursor sitting on the ship).
  The wait is measured from the **start** of the dash, so one ended early by a wall still costs 2.5 s.
- **Invulnerability became one question**: `player.js` exports `isInvulnerable(ship)`
  (`invuln > 0 || dashLeft > 0`) and `enemies.js` asks that instead of reading `invuln`. Ships (M5)
  will want to add to the same answer.
- **`dashShoulder()`**: while the dash lasts, every enemy within `drawR + r + 26` gets its impulse
  *set* (not added - it is shouldered for ~15 steps and a growing impulse would fling it) to 300 px/s
  outwards. Not just feel: the moment the dash is over the crowd can hurt again, so a dash that ends
  inside a mob has to end somewhere there is room to stand.
- **The input layer grew one-shot requests** (`keyTaps`/`mouseTaps`, `consumeInput()`). Held state is
  read fresh; a dash is a *request* that stays pending until a frame which ran at least one
  simulation step has handed it over (`main.js`: `if (tick.steps > 0) consumeInput()`), so a press on
  a stepless frame - a 240 Hz+ display, or a frame after a long stall - is not swallowed. The request
  is spent whether the dash answered it or not: one press, one dash, nothing buffered behind a wait.
  Space and right mouse dash; the left button only fires; blur drops a pending request.
- **Painted, not simulated** (`render/entities.js`): a tapering gradient streak 46 px along the way
  the ship came with two afterimages in it (drawn rotated back to `ship.angle`, so the ghosts keep
  their facing), a ring + 14-spark burst at the start, 2 sparks sprayed backwards every step, and
  the cooldown as a ring around the hull - one arc closing over the wait, a breathing circle once it
  is ready. `effects.js` grew `spray()` (aimed sparks) next to `burst()`; both now build their sparks
  through one `sparkAt()`, drawing the same numbers in the same order per spark, so neither can be
  told apart by a run.
- `world.player` has `dashLeft/dashCd/dashDirX/dashDirY`, all zeroed by `resetRun`, all in
  `STARFALL.stats()`. `index.html` lists the control on the title screen.

### The bug: the launch press was also a dash
`keyboard.js` set `keyTaps.dash` **after** calling `handlers.onConfirm()`, and `main.js`'s
`pressAction()` retires the request (`consumeInput()`) to stop the launch key dashing. So the
clearing happened first and the flag second: every run begun with Space began with a dash already
spent, one frame in. Fixed by recording the tap before onConfirm is told, which is also the honest
order - the handler is allowed to swallow a press that already happened. (`mouse.js` already had it
right: tap, then `onPress`.) Consequence worth knowing: a press that arrives while the run is already
flying is *not* swallowed, so mashing LMB and Space together on the title screen spends one dash.
That is correct - the second press is a dash request like any other - and it is why the older tests
launch with the mouse alone now.

### The lesson from the broken tests: bound every loop, and count what you think you counted
Predecessor's `controls.test.mjs` never ran to completion, and two failures in it are worth writing
down because either one alone would have been invisible:
1. **It hung the test process.** It mashed Space once per frame `while (ship.dashCd > 0)`, but a
   mashed press fires the instant the wait ends, so `dashCd` was never observed at 0 at the top of the
   loop: infinite. Every wait loop in that file now has a frame guard (`frames < 1000`) and the test
   asserts the guard never tripped. A regression must fail, not hang the box for 16 minutes.
2. **One loop ran zero times** - a `1000/60` (ms) frame length divided into a seconds-scale
   cooldown - and the test still "passed" everything it had asserted, because nothing had counted the
   iterations. So the mashing test counts dash *starts* and asserts `starts === 1`: a loop that does
   not run now fails instead of agreeing. Same for the launch test, which asserts the dash did **not**
   happen by reading both `dashCd` and `dashLeft`.
Both files were also hand-checked against the harness: `ready()` winds the ship back to "dash ready"
(stops an underway dash too), and `tapSpace()` is a real down+up through `window` listeners.

### Tests: 102, all passing (was 79)
- `test/dash.test.mjs` (12) drives the scripted world, so it measures seconds: the whole 220 px and
  no further; the 16 px glide and the standstill after it; the lean beats the cursor; a diagonal dash
  at the cursor; a steady speed through the air while the engines argue with it; the `px/py`
  interpolation contract; the wall case (paid in full, ends at the wall); passing through an enemy for
  free and taking a hull the step after it is over; the shoulder; one press one dash; sparks and ring.
- `test/controls.test.mjs` (11) boots the real game and fires real events at it: launch-not-a-dash,
  Space dashes, the wait lasts 2.5 s and a held press inside it buys nothing, mashing is one dash per
  press with nothing queued, auto-repeat is not a press, right button dashes and does not fire, left
  fires and does not dash, a press on a stepless frame survives, blur drops a pending request.
  The last two check the **drawing** through the canvas stub: the cooldown ring costs one extra stroke
  while waiting, and a dashing frame moves the canvas twice more than a calm one (the two ghosts).
  That trick - `game.drawCalls()` and `game.translates()`, reset each frame - is the only way to prove
  something is painted here, and it is cheap.
- `tools/headless/harness.js`: `pressMouse(x, y, button)` / `releaseMouse(button)`, and
  `scripted.js` carries `dash` in its default input and reports `dashLeft/dashCd` in its tracks.

### Reference run: unchanged, on purpose
`--seed 20261006 --trace` is still 1m14s / 1108 / level 4 / 74 kills / 64 shards, and the trace hash
is identical frame for frame. The bot never dashes, and the dash's own `logic` draws only happen while
dashing, so nothing moved. Good control: it also proves the new drawing code does not touch the sim's
stream (the flame is now driven by `input.moving` alone, not by the dash - the `visual` stream moved
and the `logic` one did not).

### Decisions, so a later session does not relitigate them
- **No input buffering.** A dash request during the wait is dropped, not held for the end of it. It
  reads as honest (the game never moves you that you did not ask for in this instant) and it keeps the
  one-press-one-dash rule one line long. If it ever feels stiff, the buffer belongs in the input layer
  with a lifetime in seconds, not in `beginDash`.
- **The thruster flame follows the engines, not the speed.** During a dash `thrust` decays: the
  engines are off, and the streak is what paints a dash. (A flame at full length while sliding
  sideways, pointed at the cursor, looked wrong.)
- The dash's numbers live in `BALANCE.player.dash`; the *look* constants (`STREAK_LENGTH`, the ring
  colours) are named constants in `render/entities.js`, which `structure.test.mjs` allows.
- `dashShoulder` walks the whole enemy list, not the grid: it runs for ~15 steps and the grid is
  rebuilt by `updateEnemies` after the player. Cheaper than an honest ordering, and it is not the hot
  path the grid was built for.

### Released **v0.2.1**.

### Next (Milestone 2)
1. Pre-rendered glow sprites; drop the per-frame `shadowBlur` (and the per-bullet gradient). Measure
   before and after with a throwaway bench; the numbers from session 7's note are in `framerate.test.mjs`.
2. Arena 3000×3000 + camera (read the interpolated position, `render/interp.js`) + cursor lean +
   energy walls. `dashDirection` uses `input.aimX/aimY` as **arena** coords, so it needs the camera's
   inverse the moment one exists - same for `mouse.js`'s comment about canvas pixels.
3. Hit-stop (freeze 40 ms on big kills, 90 ms on a player hit): drain the accumulator while frozen,
   per session 7's note, or the clock will bite.
4. Then M3: enemies as data, and the dodging bot - session 8's note has the naive baseline
   (1m00s over seeds 1-4) that a dashing bot should beat.

## Session 10 (2026-10-07) — Milestone 2: every glow is a baked sprite
### What landed
PLAN section 4's "glows are pre-rendered sprites; `shadowBlur` every frame is too slow". **`src/render/glow.js`**
is the whole idea: a sprite is baked once into a small offscreen canvas and stamped with `drawImage`.
`src/` now contains no `shadowBlur` at all, and no gradient built during a frame.

- Two sprite kinds. `glowFor(color, radius)` is a round pool of light, **memoised on its arguments**
  (colour → radius → holder) because those come from a handful of kinds, so a draw loop may ask for
  one every frame and get the same pixels. `makeStreak(tip, tail, length, thickness)` is a tapering
  trail with a bright head, pointing +x with its head at the origin: **the caller owns it** and keeps it
  in a module variable (a weapon's trail, the ship's flame, the dash's blur). It is *not* memoised -
  calling it in a frame would build a canvas per frame. That is the one rule to remember.
- A streak is baked as a row of soft blobs along its axis, growing and brightening toward the head, so
  it has no hard edges and needs no `destination-in` tricks. Colours are mixed per blob at bake time.
- **A sprite is always baked at full opacity; `strength` on the stamp dims it** (via `globalAlpha`,
  multiplied into whatever the caller already had). One sprite per colour and size, any brightness.
- **Baked at device resolution, stamped at CSS size**, so a HiDPI screen gets crisp glows.
  `resizeCanvas` calls `setGlowResolution(dpr)`; when the ratio changes every holder is emptied and the
  next stamp rebuilds it. `stats()` reports `{ holders, sprites, pixelRatio }` for the F3 overlay.
- What changed on screen: enemy halos (and a **white bloom while an enemy flashes** - the old flash only
  blurred in the enemy's own colour), the ship's halo and core, the thruster flame, shot trails, shard
  halos, the dash blur, the hull pips. Rings and floating labels got their glow from a **second, wider,
  fainter stroke** instead of a sprite (a ring's radius is continuous; a sprite per radius would be
  silly). The dash's cooldown ring and the XP bar got the same treatment.
- **`core/palette.js` grew the colour arithmetic the bakes need**: `parseColor` (`#abc`, `#aabbcc`,
  `rgb()`, `rgba()`; anything else throws rather than silently becoming black), `withAlpha`,
  `mixColors`. New palette entries for the flame (`flameTip`, `flameTail`) and the dash ring/streak -
  the inline rgba strings that were in `render/entities.js` are gone. `star` was `'200,235,255'`, a
  channel triple no colour function can read; it is `#c8ebff` now and `drawStars` uses `withAlpha`.
  A test asserts every colour in the palette parses, so this cannot happen quietly again.
- `kinds.*.glow` is now honestly documented in `balance.js`: the renderer's halo reach, not a sim number.

### Numbers (throwaway benches, and a `git worktree add /tmp/old-head HEAD` to compare against the
previous commit - that is a good way to measure a rendering change here)
- **1500 shots in flight (PLAN section 2's target load), per frame: 1500 gradients and 1500 blurred
  strokes before; 0 and 0 now, replaced by 1500 stamps of one cached image** (plus a `translate` +
  `rotate` each, which are matrix maths, not a blur).
- Over a 600-frame window 45-55 s into a run: old code built **1372** canvas gradients, new code **0**;
  fills stayed the same, strokes went down, and 18 970 stamps appeared.
- In a whole run the game hands out **13 glow holders** and bakes each once. `test/draw-cost.test.mjs`
  pins that: a busy frame asks for no blur and no gradient, and a steady frame builds nothing at all.

### Proof it moved nothing
`node tools/simulate.js --seed 20261006 --trace` is **byte for byte** the session-8/9 reference run
(1m14s, 1108, level 4, 74 kills, 64 shards, every trace hash equal); the bot over seeds 1-4 is still
1m00s / 726. Rendering reads the `visual` stream and writes no `logic` draw, so it could not have
moved - it is worth remembering that the *numbers* in `render/` are free to change and the sim cannot notice.

### Tests: 119, all passing (was 102)
- `test/glow.test.mjs` (9) - no game boot; the file hands the module a `document` that builds blank
  canvases and a context that writes down every stamp. Baked once then handed out again; stamped
  centred at CSS size and baked at `w*dpr`; the falloff runs to transparent at the edge; a resolution
  change rebuilds each sprite exactly once and still stamps at the same CSS size; a streak's head lands
  on the point it is given (and the row grows toward it); `stretch` lengthens along its own axis only;
  `strength` dims without disturbing the caller's `globalAlpha`; a strength of 0 paints nothing.
- `test/palette.test.mjs` (5) - the colour forms, the errors, `withAlpha`'s clamping, `mixColors`'
  endpoints, and "every colour in the palette parses".
- `test/draw-cost.test.mjs` (3) - the frame-cost promises above, measured on the real game 45 s into a
  run with the simple bot flying.
- `tools/headless/harness.js`: the canvas stub learned `drawImage` and `strokeText`, counts
  `images` and (in the property setter) **every non-zero `shadowBlur` write**, grew `document.createElement`
  for offscreen canvases with their own counters, and reports `bakeCalls()`. So "a frame blurred" and
  "a frame baked a sprite" are both observable now.
- Two counts in `test/controls.test.mjs` moved on purpose: the waiting cooldown ring is 2 extra strokes
  now (base circle, wide faint arc, bright arc) and the dash is 3 extra `translate`s (the blur plus its
  two ghosts). Both still assert an exact number; both say what the number is made of.

### Decisions, so nobody relitigates them
- **No blur anywhere, including the HUD.** Text halos are a wide faint `strokeText` under the fill.
- **Lazy is fine**: a sprite is baked the first time its thing is drawn. The dash blur is never baked
  in a run without a dash. That is why the cost tests measure two windows and assert the *second* one
  builds nothing.
- Sprites are shared and finite; nothing is thrown away at runtime. `makeStreak` allocating a holder per
  call is a footgun, hence the ownership rule in the module header. If M5's ships want per-weapon
  trails, each weapon definition builds its trail once when it is defined.
- Alpha values (`HALO_LIGHT`, `SHIP_LIGHT`, `FLASH_LIGHT`, `SHARD_LIGHT`, `DASH_STREAK_LIGHT`,
  `RING_SOFT`, the `FALLOFF` table) are eyeballed arithmetic - there is no browser here. They are named
  and in one place each. If the screen reads washed out or dim, they are the knobs, in that order.

### Watch out
- Add every new canvas member to the harness stub, or the stub throws "the canvas stub has no member".
- `test/draw-cost.test.mjs` makes the ship invulnerable: a dead ship paints nothing to measure, and a
  measurement window must not end because the bot died.
- The XP bar's gradient is cached by bar width and built the first time the bar has anything in it - for
  the dumb bot that is ~30 s in, which is why the cost test warms up past it.

### Next (Milestone 2)
1. **Hit-stop** (freeze 40 ms on big kills, 90 ms on a player hit). Session 7's note: put the timer on
   the world, step it in *real* time, and drain the accumulator while frozen or the clock hands back a
   burst of catch-up steps the moment it thaws.
2. **Arena 3000×3000 + camera + energy walls + cursor lean.** The camera must read the interpolated
   position (`render/interp.js`); `dashDirection` and `mouse.js` need the camera's inverse; the draw
   calls currently bake the transform in, so the camera wants a `setTransform` at the top of a frame.
   The glow sprites do not care (they are stamped in the current transform).
3. Nebula backdrop for the starfield item; the stars themselves could be stamped sprites too (they
   still build one colour string each, per frame).
4. M2's remaining checkboxes are partly done by earlier sessions: hit flash, trauma shake, pooled
   particle system and enemy knockback all exist. What is genuinely missing is hit-stop, the arena and
   the nebula. Put them right before releasing against that list.

## Session 11 (2026-10-07) — Milestone 2: hit-stop
### What landed
PLAN section 4's "freeze the simulation for 40 ms on big kills and 90 ms when the player is hit".
That was the last thing standing between M2's feedback checkbox and being done - the enemy hit flash
(60-90 ms white) and the trauma shake were already in.

- **`world.freeze`** (seconds left of hit-stop, 0 normally) is the whole feature's state.
  `game/effects.js` gained `hitStop(world, seconds)` next to `shakeIt`: it takes the **max**, so a
  small kill landing inside a player hit cannot cut the longer freeze short.
- **Two things ask for a freeze.** `BALANCE.kinds.tank.death.hitStop = 0.04` (a kind says for how
  long its own death stops the run; a kind that does not ask is simply not big enough) and
  `BALANCE.playerHit.hitStop = 0.09` in `hitPlayer`. Death counts as a hit, so dying gets the 90 ms
  too, with the game-over screen drawn over the top of it. M3 gives the bomber and the elites their
  own numbers by filling in the same per-kind field - no other code will need touching.
- **`stepWorld` spends the freeze, and now answers whether it simulated anything.** A frozen step
  advances nothing but the two clocks that are not the run's, and returns false. `run.js` clears it
  in `resetRun`; `STARFALL.stats()` reports it for the F3 overlay.
- **`tickFrameClocks(world, dt)`** - the trauma decay and the after-death restart guard - is called
  on both paths, so a freeze cannot steal shake from the frame or stretch the guard beyond what the
  player's finger needs. `world.time` (the session clock the eye animates on: the breathing cooldown
  ring, the invulnerability blink, the shard pulse) also keeps ticking. Order on the normal path is
  unchanged from before, so nothing else moved.
- **`main.js` only hands the controls over for a step that ran** (`if (heard) consumeInput()`), so a
  dash pressed during a freeze is *kept* and answered on the first step after the thaw. That is the
  behaviour that matters: 90 ms of being unable to move is exactly when you are mashing the escape key.
  Without it the press vanished (verified: reverting that one line fails the new test).

### The decision session 7's note asked me to make
The note said to put the freeze timer on the world and "step it in real time, not in step time, and
drain the accumulator while frozen". I did the opposite and it is better: **the timer is spent in
steps.** With a fixed 1/120 s step, step time *is* real time, so the freeze lasts the seconds it
asked for either way - but spending it inside `stepWorld` means the clock has already been paid for
those steps (nothing can come back as a burst of catch-up steps), the freeze is deterministic, and
the whole feature is testable through the scripted world with no frame loop involved at all.
40 ms = 5 steps, 90 ms = 11 steps (a freeze always costs a whole number of steps, rounded up).

### Tests: 129, all passing (was 119)
- `test/hitstop.test.mjs` (7, scripted world): a big kill's freeze is exactly `ceil(0.04/step)` steps
  and the run clock does not move during them; a drifter's death stops nothing; a hit is the longest
  freeze in the game; overlapping freezes take the max; a fingerprint of every position in the world
  (ship, crowd, shots, shards, sparks, rings, labels) is **byte-identical** across two frozen steps
  while `world.time` and the trauma do move; the restart guard ticks through a freeze; `resetRun`
  unfreezes.
- `test/frozen-frame.test.mjs` (3, booted game): a frozen frame is still painted (the ship is found
  among the frame's translates at its interpolated spot); the dash-that-waits-for-the-thaw case above;
  and a death - the summary screen arrives, the death burst's first spark is still and not even fading
  across two frames, then the freeze spends itself and a restart works as normal.
- Both files learned the two traps the hard way: a booted game must be *launched* by the test that needs
  it (Space launches one, so a later test "passed" off a run an earlier test had accidentally started),
  and `isInvulnerable` includes a dash in progress, so a test that wants to be hit has to zero
  `dashLeft` first.

### Proof and numbers
Reference run **rebaselined on purpose**: `node tools/simulate.js --seed 20261006 --trace` is now
**1m04s, score 816, level 3, 57 kills, 36 shards** (was 1m14s / 1108 / level 4 / 74 / 64). Bot over
seeds 1-4: **1m04s average, score 828** (was 1m00s / 726). Most of that swing is chaos, not the
freeze: a reference run only contains **7 hit-stops = 43 frozen steps = 358 ms** of the run
(4 player hits, 3 tank kills), but every one of them shifts when the bot's keys land on a step. The
average went slightly *up*, so the naive bot is not being punished; a player who reads a freeze as
"that mattered" is the point. Measured with a throwaway script (`world.steps - elapsed/step` is the
count of frozen steps, which is a nice trick to remember).

### Released **v0.2.3**.

### Next (Milestone 2, what is left)
1. **Arena 3000x3000 + camera + cursor lean + energy walls.** The big one, and the last real gap.
   Session 8/9/10's warnings all still stand: the camera reads the *interpolated* position
   (`render/interp.js`), `dashDirection` and `mouse.js` need the camera's inverse to turn screen pixels
   into arena coords, and the draw calls bake the transform in today, so the camera wants a
   `setTransform` at the top of a frame. `world.arena` is already the only thing the sim reads for its
   bounds. Expect a deliberate rebaseline; consider the grid's cell size and the spawn margins while in
   there (they are in `balance.js` already).
2. **Nebula backdrop** (PLAN section 4's last missing visual): slow drifting clouds drawn once to an
   offscreen canvas, behind the three star layers. `render/background.js` owns the stars; the nebula
   belongs there and must be baked at device resolution like the glow sprites.
3. Then look at M2's last two checkboxes honestly, in one short session:
   - *Knockback on enemies when hit* is genuinely done (bullet impulse, the hit shove, the dash
     shoulder) - tick it or say what is missing.
   - *Particle system on a pool: sparks, debris, shockwave rings, thruster trail* - sparks, rings and
     the pooled plumbing are in; **debris does not exist** (every death spark is the same 1.3-3.4 px
     size range) and the thruster is a drawn flame, not a trail. Either add a real debris particle
     (slower, bigger, longer-lived, spawned by the bigger kinds) and a couple of sparks out of the
     thruster, or [skipped] the parts that are the same thing by another name.

## Session 12 (2026-10-07) — Milestone 2: the arena is a world

### What landed
PLAN section 4's "the arena is larger than the screen, 3000 × 3000, with a camera that follows the
player and leans slightly towards the cursor. The edges are a glowing energy wall". M2's biggest open
item, and the last thing that was really missing from it.

- **`world.arena` is a fixed 3000 × 3000 now** (`BALANCE.arena.w/h`) and `world.view` is the window,
  which the frame loop writes on every resize the way it used to write the arena. That split is the
  whole change on the simulation side: **the sim is allowed to know how big the screen is and nothing
  else about it** - it needs it to put things off the edge of it. It is still display-dependent in the
  same way it always was (a run played on a 1920 window is not the run played on 1280); what is *new*
  is that the world itself no longer changes size when the window does.
- **`src/render/camera.js`** is the whole view. `followCamera(dt, alpha, input)` runs once per frame
  from `renderFrame`, follows the ship's *interpolated* position **one for one** (no smoothing on the
  follow: the ship must not swim), and leans `LEAN_FRACTION` (0.16) of the way from the ship to
  whatever it is aiming at, capped at 150 px, eased with the usual `pow(k, dt)` share-left-over-
  after-a-second rule. `centreOn` clamps so the window never shows more world than there is; if the
  window is bigger than the arena the arena floats in the middle of it. `resolveAim(input)` turns the
  controls' pixels into an arena point (in place, once per frame, in `main.js` before the steps) and
  `screenX/screenY` turn them back - which is how the headless bot aims now.
  The lean is a *fixed point*, not a chase: because the bot (and a player holding the mouse still)
  re-aims from wherever the camera ended up, the feedback converges at `f·d/(1-f)` instead of running
  away. Worth knowing before anybody is tempted to make the lean bigger than ~0.25.
- **Spawning moved from the arena's edge to the screen's.** `arrivalSpot` puts an enemy on the border
  of the view box around the ship (`viewBox`, grown by `radius + spawnMargin`) and rejects anything
  outside the arena or closer than `spawnMinDistance` (260 px), trying `spawnAttempts` (8) times and
  then giving up until the next tick. If the whole arena is on screen there is no "off screen" left,
  so a second pass falls back to the arena's own border. `spawnEnemy` now answers whether one came.
  This is PLAN milestone 3's "spawns happen off-screen, never on top of the player", arrived at early
  because the arena made the old rule wrong.
- **`src/render/walls.js`**: each arena edge the window can see, stroked three times (wide faint →
  medium → thin bright, the house trick for light without a blur) plus one pass of ticks every 48 px
  on the world's own grid so the corners line up, all breathing slowly on `world.time`. Four strokes
  per visible edge, and nothing at all for an edge that is not in sight. Cool blue (`PALETTE.wall`),
  because warm means harm and the wall is not harm.
- **The renderer's frame is now** `renderFrame(tick, input)`: sky in screen space, one
  `translate(-camera.x, -camera.y)`, then every draw call speaks arena coordinates. The vignette
  moved *outside* the shake translate (it was leaving an unvignetted sliver on one edge every time the
  screen shook). The starfield parallaxes off the camera's drift from the arena's centre now, not off
  the ship's offset from the window's.
- **Culling**: `onScreen(x, y, pad)` guards enemies, shots, shards and sparks. Rings and labels are
  left alone (a run holds a handful of each and a ring reaches in from off screen as often as not).
- **The menu crowd keeps to the middle of the world** - the part the title screen is looking at
  (`crowdBox` in `game/ambient.js`), so wrapping happens around the window and not around 3000 px of
  black. Same for where the ambient enemies are first put.
- `STARFALL.camera` (live), `STARFALL.screenOf(x, y)`, and `STARFALL.resetCamera()`. The harness
  calls `resetCamera()` in `resetToTitle` beside `resetClock()`, for the same reason: a second run on
  one boot has to start with a view that has not been looking somewhere else, or "the same seed plays
  the same run" is a lie by 1e-4 px of leftover lean.

### The difficulty moved, and it is the fairness, not a bug
Reference run, rebaselined on purpose: `--seed 20261006 --trace` → **dies 1m28s, score 1361, level 5,
93 kills, 73 shards** (was 1m04s / 816 / level 3 / 57 / 36). Bot over seeds 1-4: **1m20s, score 1012**
(was 1m04s / 828). Two things pay for that, both wanted: the ship has room to back off instead of
being pinned by the edge of the window, and a spawn can no longer land 34 px from a player who is
hugging a wall (the old margin was measured from the *arena*, which was the screen).
Checked that it is not a mistake, two ways: with the arena shrunk back to 1280 × 720 at runtime the bot
comes back down to ~64 s, and the crowd on screen at 60 s is the same as it was (17 of 21 enemies
inside the window), so the density did not thin out.

### Proof and numbers
- **147 tests, all passing** (was 129). `test/camera.test.mjs` (7: opens on the middle of the arena,
  follows, never shows more world than there is at five places along a diagonal, leans and only so far,
  *the cursor points at the arena and not at the glass* - including a check that the naive
  pixels-are-arena answer is a different direction entirely - an exact screen⇄arena round trip, and a
  3600 × 3200 window with the world floating in it), `test/arena.test.mjs` (7: the world is twice the
  window and the ship can leave the window behind but not the world; 300 arrivals all off-screen, in
  the world and > 260 px from the ship; the same from a corner of the world; an enormous window falls
  back to the world's edge; the menu crowd stays in view and wraps around the window),
  `test/walls.test.mjs` (4, counted in strokes: nothing in the open, one edge at a wall, two at a
  corner, nothing for a wall a screen away).
  Three existing tests moved honestly: the resize test now says the *view* changed and the arena did
  not; the pool test lets its shots live out instead of leaving the arena; `simulate.test`'s window is
  240 s because the bot lives longer than 90 now.
- Draw cost at 45-50 s into a bot run, old vs new (throwaway probe against a `git worktree` of HEAD):
  254 fills/frame before, 247 after, and the strokes went *up* by 1.7/frame - the wall ticks. So the
  culling is not a win in the bot's game, where nearly everything happens next to the ship; it is
  insurance for a player who runs across the world. Say so rather than claim a speedup.

### Decisions, so nobody relitigates them
- **No smoothing on the follow, only on the lean.** A lagging camera in a game where you thread
  between enemies is a bug (and it would have made the interpolation fight it).
- The lean comes from the *aim point*, not from the cursor's screen offset, so it does not care where
  on the glass the mouse happens to sit and it cannot feed itself around.
- The camera lives in `render/` (PLAN section 2's layout) and `game/` never reads it. The one bit of
  the screen the sim does read, `world.view`, is written by `main.js` on resize.
- `world.view` is a size, not a position, so a run still cannot depend on where the view happened to
  be looking; only on how big it is. That is the line I did not want to cross.

### Watch out
- `readInput()` returns one shared descriptor and `resolveAim` mutates its `aimX/aimY`. `readInput`
  refills them from the mouse every call, so the pair is safe - but do not call `resolveAim` twice on
  one frame's input.
- Tests that measure strokes per frame: the ship + hull pips + XP bar frame is 6 strokes today. That
  is what `walls.test.mjs` differences are built on.
- The scripted world (`tools/headless/scripted.js`) never renders, so `camera` sits at 0,0 with w=0 and
  every `onScreen` says no. Harmless today (nothing in those files draws); if a test ever wants both,
  call `snapCamera()` after moving the ship.
- The headless bot needs `STARFALL.screenOf` - a bot written against an old release's globals will
  throw. It is in `tools/headless/harness.js`'s controller too.

### Released **v0.2.4**.

### Next (Milestone 2, what is left)
1. **Nebula backdrop** (PLAN section 4's last missing visual): slow drifting clouds on an offscreen
   canvas behind the three star layers, baked at device resolution like the glow sprites. It belongs
   in `render/background.js`, and it has to be drawn in *screen* space with the camera's drift folded
   in, the way `drawStars` does now.
2. The two M2 checkboxes session 11 left: *knockback* (tick it: bullet impulse, the hit shove and the
   dash shoulder are all in) and *particles* - sparks, rings and the pooling exist; **debris does not**
   (every death spark is the same 1.3-3.4 px) and the thruster is a drawn flame rather than a trail.
   Add a real debris particle for the bigger kinds and a couple of sparks off the thruster, or mark
   the duplicated parts [skipped].
3. Then M2's release, and M3: enemies as data, enemy bullets, the wave director (the spawn rule here
   is the seed of it), elites, off-screen indicators - the arena is now big enough to want them.


## Session 13 (2026-10-07) — Milestone 2: wreckage and a wake

### What landed
The particle item is finished: the pool now holds **three shapes** instead of one, and the last
missing piece of PLAN section 4's particle list - debris, and a thruster *trail* rather than a
drawn flame - is in.

- **The shapes are `spark`, `debris`, `smoke`** (`SPARK`/`DEBRIS`/`SMOKE` out of `game/effects.js`,
  which are also the keys of `BALANCE.effects.shapes`). One pool, one list, one update loop; what
  differs is a handful of numbers per shape and the way the renderer draws it. `sparkAt` became
  `emit(world, shape, ...)`, which writes **every** field of the shape - the old contract, now with
  `shape`, `rot` and `spin` added to it. `burst` and `spray` still make sparks; `wreck()` makes
  debris; `engineTrail()` makes the wake.
- **Per-shape physics in `BALANCE.effects.shapes`**: `drag` (share of its own speed left after a
  second), `lifeFloor`, `sizeMin`/`sizeMax`, `spin`. A chip drags at 0.12 where a spark drags at
  0.045, which is the whole reason a chunk ends up somewhere a spark never reaches; chips also live
  0.9 s against a spark's 0.7 and can be dealt 6 px against 3.4. `updateEffects` refills one small
  `dragOf` table with three `pow`s per step so the particle loop allocates nothing and does not
  branch on the shape either (`rot += spin * dt` is free for the shapes that do not turn).
- **Deaths throw chunks, scaled by the body that came apart**: `chipsOf(kind, enemy)` takes the
  kind's count and multiplies by `enemy.r / kind.radius`, so a tank hatchling (r 12 of a tank's 26)
  is a small tank and makes a small mess. Counts: darter 2, chaser 4, tank 14. `endRun` wrecks the
  ship too - the ship came apart, it should leave chunks like anything else that dies.
- **The wake** is `engineTrail(world, ship, dt)`, called from `updatePlayer` right after `thrust`
  is written. `rate` puffs a second (26) through an accumulator on the ship - `ship.exhaustTimer`,
  reset in `resetRun` - so the sim can run at 120 Hz without anybody needing 120 puffs. A puff is
  born at the nozzle, thrown back along the *aim* (the same heading the drawn flame uses) and
  carries `inherit` (0.35) of the ship's own velocity, so the trail hangs behind the ship instead of
  flying off by itself. No wake during a dash: the dash has its streak.
- **The renderer draws the wake apart from the rest and earlier.** `drawParticles` became
  `drawSparks` (sparks and chunks, last, over everything) and `drawSmoke` (right after the walls and
  shards, under the crowd and the ship). That split is a readability decision: ~8 soft puffs
  overlapping along the way you came is exactly the kind of thing that would otherwise sit between
  you and your own ship. A chunk is a `fillRect` under `translate`+`rotate(p.rot)` - `CHIP_LENGTH`
  2.4× as long as it is wide, keeping `CHIP_KEEP` 0.6 of its size before it winks out (a chunk winks
  out, it does not shrink away).
- **`paintGlow` grew a `scale` argument.** The whole wake is one 12 px glow sprite stamped at a
  size that grows as the puff cools (`PUFF_BLOOM` 2, born at `p.size / PUFF_BASE` 6 px), which is
  how a trail of soft blobs costs one bake and one `drawImage` each.
- **`PUFF_LIGHT` came down from 0.34 to 0.16** after writing the numbers down: additive puffs at 26 a
  second overlap three or four deep near the ship, and at 0.34 the sum was in the same class of
  brightness as the ship's own halo and the energy wall. The faint end is the right end.

### The new stream, and the 17% that was not there
`core/rng.js` has a third stream, **`fx`**, seeded from the run like `logic` and read by
`game/effects.js` for every sprinkle. The reason is the same one the `visual` stream exists: a burst
with one more spark in it must not be able to move a shot that was already in flight. `test/structure
.test.mjs` now guards three streams (`game/` may not read `visual`, `render|audio|ui|input` may not
read `logic` or `fx`), and `test/particles.test.mjs` proves it behaviourally: burn 5000 numbers off
`fx`, play two seconds of a scripted run with shots flying and enemies dying, get the identical
fingerprint.

**The surprise, and the lesson.** Moving the particle draws off `logic` changed the bot's average
survival over seeds 1-32 from 1m24s / score 1108 to 1m35s / 1276 - *every* seed better, ~13%, for a
change that is pure output. Two things settled it:

1. A `git worktree` of HEAD with **only** `effects.js` pointed at a second stream reproduced the new
   numbers *exactly* (1m35s, 1276, 92 kills), so nothing but the stream layout had moved.
2. Over **128 seeds** instead of 32: new 1m27s / 1175 / 85 kills, old 1m26s / 1145 / 83. Equal.

So it was seed-set noise all the way down, and 32 runs is not enough to call a difficulty change in
this game: sd across seeds is ~18 s, so a 32-run mean carries about ±6 s and two of them disagree
with each other by more than that routinely. **Measure balance over 128 seeds** (`node
tools/simulate.js --seed 1000 --runs 128`, about 2 min). The single reference run in these notes
(seed 20261006) is now 1m07s / 825 / level 3 / 61 kills where it was 1m28s / 1361 - one sample
against another one sample, and worth nothing on its own. Keep the number for continuity, compare
with the mean.

### Proof and numbers
- **161 tests, all passing** (was 147). `test/particles.test.mjs` (11: a death leaves sparks *and*
  chunks; the bigger the wreck the more chunks, in both shapes; a small body makes a small mess; a
  chunk tumbles and coasts > 1.15× further than a spark on the same shove; the wake appears at the
  configured rate while driving and not otherwise; a drifting ship trails nothing; a dash trails no
  wake but does throw sparks; a puff carries `inherit` of the ship's velocity - measured as the mean
  vx of 40 puffs from a parked ship against a ship doing 200; every live particle has every field
  finite and a known shape; a spray thins out and the pool takes all eight back; and the stream
  test above). `test/particle-art.test.mjs` (2, by differencing a loaded frame against the same
  frame empty: **one fill per chunk and per spark, one sprite stamp per puff, no strokes, no blurs,
  no gradients, and the whole wake bakes one sprite** - which the two tests were written against
  *after* the first version wrongly expected a bare frame to be zero strokes; the ship, its hull pips
  and the XP bar are 6 strokes whatever is flying).
- I checked the two new physics tests bite: with `inherit: 0` and debris drag set to the spark's, the
  pair fails. Good, they are not decoration.
- **Draw cost** at ~45 s into a bot run (seed 7, ship made invulnerable so the window is comparable),
  old vs new from a HEAD worktree: 247 → 249 fills/frame, 30 → 35 sprite stamps/frame (the 5-6 live
  puffs), strokes unchanged. Caveat honestly: the two runs are not the same run - the stream layout
  differs, and the frames held 13 enemies against 11.
- One existing test moved honestly: `pool.test`'s "busy run" bar is now per list, because a label is
  one per kill and so its count is the run's luck (46 this seed), not the pool's busy-ness.

### Decisions, so nobody relitigates them
- The wake is **simulated**, unlike the dash streak, because a trail has to be *left behind in the
  world* and the dash's blur is a property of the dash. Both are honest; they answer different things.
- `engineTrail` lives in `game/effects.js` beside the other sprays rather than in `player.js`: one
  file owns how things spray, and `player.js` just says "the engines are lit, this much time passed".
- Every particle draws **exactly four** `fx` numbers even when it cannot tumble, so that no spray can
  be told from another by how much it asks the stream for. Two wasted numbers a puff is a price I am
  glad to pay against a shape that draws a different amount.
- Debris takes the dead thing's own colour. It is not a new colour and it is not a hazard; it is the
  enemy, afterwards.
- `particleCap` is shared by all three shapes and `trim()` drops the *newest*, so under cap pressure
  the wake goes first. That is the behaviour I want and I left it untested on purpose, because "which
  particles survive a cap" is exactly the thing a run must never depend on.
- Renamed the local `fx = BALANCE.effects` in `effects.js` to `fxSpec`. The name collision with the
  stream is what made my first probe throw, and a later reader deserves the warning.

### Watch out
- `BALANCE.effects` has no `particleDrag` / `particleLifeFloor` / `particleSizeMin` /
  `particleSizeMax` any more: they are per-shape under `effects.shapes`. A fourth shape means three
  edits - the table, a constant in `game/effects.js`, and a branch in whichever of the two draw loops
  in `render/effects.js` wants it (each one skips the shapes that are not its own).
- `drawSmoke` is only called in the run branch of `renderFrame`. The title screen has no particles at
  all, because the ambient crowd never dies. If that ever changes, the wake will need a call there.
- `emit` writes `rot` and `spin` for every shape; the sparks and puffs ignore them. Do not make a
  shape whose look depends on a field some spawner forgets - the whole pool depends on that promise.
- The wake has no "particle amount" setting yet (milestone 9). When it arrives it can now be added
  without moving a single run, which was the point.

### Released **v0.2.5**.

### Next (Milestone 2, what is left)
1. **The nebula backdrop** - PLAN section 4's last missing visual: slow drifting clouds on an
   offscreen canvas behind the three star layers, baked once at device resolution like the glow
   sprites are, and drawn in *screen* space with the camera's drift folded in the way `drawStars`
   does now. That closes milestone 2, so it wants a release of its own afterwards.
2. Then milestone 3: enemy definitions as data, enemy bullets on their own pool, the wave director
   (the off-screen `arrivalSpot` rule from session 12 is the seed of it), elites, off-screen
   indicators - and the bot learning to dodge bullets, with `tools/balance-report.js` beside it.

## Session 14 (2026-10-07) — Milestone 2: the nebula backdrop. Milestone 2 is done.

### What landed
PLAN section 4's "three parallax star layers, plus slow drifting nebula clouds drawn once to an
offscreen canvas". The star layers already existed; the clouds are new, in **`src/render/nebula.js`**,
and they close milestone 2. Released **v0.2.6**.

- **One bake, two passes.** A 1024 px tile of sky is baked once, lazily, on the first frame that
  draws it, and every frame stamps it twice: the *far* pass at 1.7× and alpha 0.5, the *near* pass at
  its own size and alpha 0.8, each additively (`lighter`), each on its own depth (0.004 / 0.009) and
  its own slow drift (1.1 / 2.4 px/s). Two passes because depth is the whole point of a sky; one bake
  because the two differing only in how they are stamped is what keeps it cheap. The depths sit under
  the shallowest star layer's and the drifts under its 5 px/s, which is what puts the clouds behind
  the stars rather than among them.
- **The tile is seamless**: `puffCopies(x, y, radius)` says where a puff that reaches past an edge is
  painted again, so the tile wraps in both directions and the sky never runs out at the join. That is
  also what lets the tile be a fixed size, independent of the window: **resizing never rebakes it**
  (the star field, the sky gradient and the vignette all do; this one does not).
- **Baked at half the size it is drawn at** (512 px source for a 1024 px tile, DPR-independent on
  purpose): a cloud has no detail finer than a pixel to lose, so it is a quarter of the bake and of
  the memory (1 MB) for something that reads the same. The bake is 310 gradient blobs over 1.6 Mpx,
  which measured as a fraction of a frame, once, on the title screen.
- **The clouds are scattered on a jittered grid** (`CLOUD_FIELD` 3×2, `DUST_FIELD` 6×5) and each cloud
  gets a `strength` drawn from a wide range, which multiplies its alpha. Both of those matter: see the
  tuning story below. A cloud is a chain of soft puffs along a random line, so it reads as a filament
  and not a disc, and its colour is a random mix of the palette's two cloud colours
  (`nebulaDeep` #1f3f9c, `nebulaTeal` #1a6f8f - blue, because warm means harm).
- `stats()` reports `{ bakes, layers, tile, baked }` for the F3 overlay (M10). `updateNebula(dt)` is
  called in the frame loop beside `updateStars`, on the frame's clock; the sky is the eye's.
- **The harness can now see stamps.** `tools/headless/harness.js` records every `drawImage`
  destination of the frame just drawn and exposes `stamps()` - the same trick `translates()` was, and
  it is what makes a background's coverage testable at all.

### How I judged the look without a browser, and it is worth keeping
`/tmp/nebula-probe.mjs` (throwaway; rebuild it if you need it). It hands the module a `document` whose
canvas **composites**: a float buffer per pixel, `fillRect` of a radial gradient evaluating the real
colour stops and doing `acc[i] += alpha * colour`, `g.scale` honoured, `globalCompositeOperation`
assumed additive. Then it calls the module's own `drawNebula` and reads the result. What it told me:

- one tile adds 3.54 luminance on average, median 2.46, p90 8.1, p99 19.7, max 28.2;
- over the palette's sky (luminance 21) both passes together give mean 25.6, median 24.2, p99 46.6,
  **max 57.7** - and the scale that matters is: dimmest star ~60, energy wall line ~90, shard ~150,
  ship 255. So the nebula's brightest possible point is under the dimmest star. That is where a
  backdrop belongs.
- where it is bright it is rgb(6,15,32) added: blue, a little green, no red. Cold, as intended.
- and it printed the tile as ASCII in luminance bands, which is the closest thing to looking at it.

Those numbers are written into the module's comment above `CLOUD_FIELD` so nobody has to derive them
again. The knobs, in the order to reach for them: `strength`'s spread (contrast), then `alpha`, then
`LAYERS[].alpha`.

### The tuning story, since the first version was wrong twice
1. Clouds placed at **random**: half the tile came out empty and the other half in a knot - and a knot
   repeats every 1024 px. Fixed by the jittered grid (a repeating tile must dress evenly).
2. Enough clouds to dress the tile evenly: came out as **fog**. Median and mean were nearly equal
   (4.2 vs 4.7), i.e. no dark patches and no cores. Fixed by the wide `strength` range (0.12-1.8),
   which is what makes some clouds nearly invisible and some bright, and by trimming `reach` so they
   stop all overlapping. After: median 2.46 against mean 3.54, p99 19.7 against max 28.2. Contrast is
   the whole difference between gas and fog.
3. Then I tried going brighter still (variant D, sky max 71) and put it back: above the dimmest star is
   the wrong place for a backdrop.

### Draw cost, measured against a `git worktree` of HEAD, same run, same seed
45-50 s into a bot run, 300 frames, per frame: **fills 249.37 both, strokes 36.41 both, stamps
35.37 → 40.37, texts 10.97 both, gradients 0 both, blurs 0 both, bakes 0 both.** So the sky is exactly
**five image stamps a frame and nothing else**. The honest caveat: five stamps of a screen-sized image
is one screen of additive blending per pass - the fill rate is real (the game already fills the screen
twice, for the sky gradient and the vignette). If M10's performance pass needs fill rate back, drop
the far pass first; it is one entry in `LAYERS` and it is the dimmer of the two.

### Proof it moved nothing
`node tools/simulate.js --seed 20261006 --trace` is byte for byte the session-13 reference run
(1m07s, 825, level 3, 61 kills, 26 shards, every trace hash equal). The nebula reads `visual` only,
and all of its randomness is spent in the single bake, which happens on the first frame before any run
exists - so it could not have moved the run, and did not.

### Tests: 168, all passing (was 161)
`test/nebula.test.mjs` (7): baked once, on the first frame that shows it, and nothing after; a puff is
painted again across every edge it reaches (including a 200-case sweep proving a copy is never asked
for twice, is always painted where it stands, and is never asked for somewhere off the tile); every
pass covers the window - corners, a grid of samples, *and* that the stamps' clipped area is exactly
one window, so no gaps and no double painting - in the middle of the world and in both corners of it;
still covered after five minutes of drift; the near pass always slides further than the far one and
both slower than 5 px/s; a frame of sky blurs nothing, builds no gradient, strokes nothing (a frame is
6 strokes: the ship, its hull pips, the XP bar - the same six `walls.test.mjs` and `controls.test.mjs`
count), and tiles the window with 2-12 stamps; and a 2400×1500 window gets more tiles and **no more
baking**.
I mutation-checked the file: starting the stamp grid at 0 instead of `-ox`, making the far pass drift
faster than the near one, `WRAP = [0]` (no wrap copies in the bake), and baking every frame - each one
fails a test on its own. The sky's stamps are found among a frame's by size (`w >= 400`): nothing else
in the game is stamped bigger than a ship and its light. If a future sprite ever is, that filter needs
changing.

### Decisions, so nobody relitigates them
- **No `resetNebula()`.** The clock and the camera are reset between runs because a second run on one
  boot must look like a fresh page; the sky is allowed to have drifted, it is the sky, and nothing a
  run depends on reads it.
- The tile size belongs to the bake, not to the window (see above), and the bake ignores `devicePixelRatio`.
- `puffCopies` is exported for the test and says so in its comment. It is the one part of the bake no
  headless test can otherwise see, because a seam is a line across the sky.
- The nebula is drawn inside the shake translate, so it shakes with everything else behind the arena.

### Watch out
- The bake happens on the first frame that draws the sky. `test/draw-cost.test.mjs`'s "a steady frame
  builds nothing" already covers it, and `particle-art`'s `first.canvases <= 1` still holds only
  because something else always bakes on an earlier frame.
- `LAYERS[].x/y` are mutable module state, wrapped to the tile width every frame so they never grow.
- M9's settings: the "particle amount" knob has nothing to do with this, but a "background detail"
  knob would be `LAYERS.length` (one pass, or none) and it is now a one-line change.

### Next (Milestone 3: enemies and waves)
1. Enemy definitions as data in one table with behaviours as small functions - `BALANCE.kinds` is
   already half of it (colour, radius, hull, speed, score, drop, death spray, hit-stop), so this is
   about the *behaviour* functions and moving the switch that picks between them into the table.
2. Enemy bullets on their own pool, in warm colours (PLAN 3.3's Spitter is the first user).
3. The wave director: a spawn budget that grows with time, spent on the types unlocked so far, using
   the off-screen `arrivalSpot` rule from session 12 as the spawn primitive.
4. Then elites, off-screen indicators, and the bot learning to dodge - with `tools/balance-report.js`
   beside it, and the 128-seed measurement rule from session 13 in mind.

---

## Session 15 (2026-10-07) — Milestone 3 begins: enemy kinds are a table now

No release: nothing moved that a player could see. The reference run is byte for byte what it was, and
this session is the floor the rest of milestone 3 is built on.

### What landed
PLAN milestone 3's first item: "enemy definitions as data in one table, with behaviours as small
functions". **New file: `src/game/kinds.js`.**

- `KINDS` is the one table every enemy is described by. A row is `{ stats, walk, onDeath? }`, where
  `stats` **points at** the kind's entry in `BALANCE.kinds` - it is not a copy. The rule that every
  tuning number lives in balance.js is a hard one, so the table holds behaviour and points at the
  numbers instead of moving them; a test asserts `KINDS.x.stats === BALANCE.kinds.x`, so the two
  halves cannot drift apart and nobody "helpfully" copies a number across.
- `walk(enemy, step)` moves one enemy for one step **and turns it**: which way it faces follows from
  how it moves, so splitting that in two would have cost a second `atan2` per enemy per step for
  nothing. `onDeath(world, enemy)` is the optional second half: `hatch` is the tank's.
- `updateEnemies` no longer asks which kind something is. It says `enemy.kind.walk(enemy, step)` and
  that is the whole of it; the darter's wobble, the tank's slow turn and the tank's split are gone out
  of the crowd loop. `killEnemy` ends with `if (kind.onDeath) kind.onDeath(...)` in exactly the place
  the `if (enemy.type === 'tank')` used to be, so the split still happens after the shards drop.
- `makeEnemy` moved to kinds.js (the module that knows what a kind is builds one) and now stamps
  `enemy.kind` on the enemy - see the performance story. Its importers changed: `ambient.js`,
  `tools/headless/scripted.js`, and two tests. It is no longer exported from enemies.js.
- `hatch` is driven by data now: `BALANCE.kinds.tank.split` gained `type: 'chaser'`, so what a tank
  comes apart into is a number-shaped fact and not a hard-coded enemy.
- `widestEnemyRadius()` is measured once, at module load, instead of `Object.values`ing the kinds and
  allocating an array every step (bullets.js asks for it every step). Same answer, no garbage.
- `rollKind`, `arrivalSpot`, `updateSpawning` stayed: that is the wave director, which is the third
  item of this milestone and should replace them rather than decorate them.

### The `step` object
A behaviour gets one small object per step, refilled and reused by `updateEnemies`
(`{ world, ship, dt, drag }`), so stepping six hundred enemies allocates nothing. A behaviour reads
it and never keeps it. `drag` is the `pow(separationDrag, dt)` that used to be a local in
`updateEnemies`; a walk needs it to carry a shove, and a shove is how knockback already works.

**A behaviour may not draw from `logic` unless its comment says it does.** There is a test for it, and
`hatch` is the one exception (one draw per hatchling, for the direction it flies). This is the rule
that keeps a seed meaning the same run no matter how many kinds exist.

### It was 4% slower until an enemy carried its own row
The first version did `kindOf(enemy.type).walk(...)` per enemy per step. Bench (`/tmp/bench.mjs`,
throwaway: 236 enemies + 40 bullets, 6000 steps, min of 5 runs, against a `git worktree` of HEAD)
put that at **0.0752 ms/step against HEAD's 0.0718** - the extra call and the throw-check per enemy.
So `makeEnemy` now stamps the row on the enemy (`enemy.kind`, taken once when it is built) and the
crowd asks the enemy instead of the table: **0.0720 ms/step, i.e. back to the baseline and inside the
noise**, plus one array per step less. `kindOf` is still there for anything that only has a name
(`spawnEnemy`, `makeEnemy`), and a name nobody defined throws instead of walking nowhere.

### Proof nothing moved
`node tools/simulate.js --seed 20261006 --trace` is **byte for byte** the session-13/14 reference run
(1m07s, 825, level 3, 61 kills, 26 shards, every trace hash equal). That is the point of doing this
before adding nine kinds: a refactor that changed the run at all would have shown up there.

### Tests: 179, all passing (was 168)
`test/kinds.test.mjs` (11): both halves of every kind and no third; `kindOf` throws on a made-up name;
an enemy carries its row; the broad phase is wide enough for the fattest kind; a chaser walks the
straight line exactly one `speed * step` and points along it; a darter swerves up to its `wobble`
amount and to *both* sides of the line while a chaser swerves by less than 1e-9; a darter still closes
200 px in two seconds of weaving; a tank turns `rotateRate * seconds` to the nanosecond; a 300 px/s
shove is worth 76 px of drift and is down to a fiftieth of itself a second later; a tank's death
leaves `split.into` hatchlings with the split's body, offset, impulse, score, drop and a share of the
wound its parent had, where a chaser leaves only its wreck; and walking the crowd spends **no**
draws from `logic` (asserted on `logic.state`).

Mutation-checked eleven of them - stats as a copy, `kind` not carried, no rotation for the tank, the
darter walking straight, `onDeath` skipped, the shove never decaying, the chaser's nose off, `kindOf`
silent, hatchling hp, hatchling radius, and the walk never called - and each one fails a test on its
own. **The one lesson worth keeping: back your new file up before mutating it.** `git checkout -- <file>`
on a file that is not committed yet aborts the whole command ("pathspec ... did not match any file
known to git") and restores *nothing*, so six mutations were quietly stacked on each other before the
climbing failure counts gave it away. `cp` both files to /tmp first, as I ended up doing.

### Decisions
- **Numbers stay in balance.js.** The table points at them (`stats`), which is why an enemy kind is two
  writes in two files and why there is a lockstep test. The alternative - moving the numbers into the
  table - breaks the one-file-for-tuning rule for a tidier import list, and is not worth it.
- **`enemy.kind` duplicates `enemy.type`.** `type` is what the renderer and the tests ask; `kind` is
  what the simulation steps. Kept both because the benchmark says the lookup has to go and `type` is
  used everywhere.
- **The renderer keeps its per-kind art branches** (`render/entities.js`: the darter's arrow, the
  tank's ring and wound arc). A kind's look is not its behaviour and a canvas cannot live in `game/`.
  There is a comment there now: a new kind that is not a plain polygon gets a branch there too.
- `killEnemy` still only runs `onDeath` on a **player** kill, because that is where the old
  `if (enemy.type === 'tank')` sat. When the Bomber arrives and enemies can kill each other, move the
  `onDeath` call above the `if (!byPlayer) return;` - a tank that dies to a bomb should still hatch.

### Next (milestone 3, item 2: the enemies of PLAN 3.3, one per session)
The three kinds that exist are PLAN's **Drifter** (called `chaser`), PLAN's **Tank** (hull and speed
are nowhere near PLAN's 160/45 yet), and a sine-wave weaver that is really PLAN's **Weaver** wearing
the name `darter`. So the first honest session is the real **Darter**: pause, aim, lunge in a line,
with a thin telegraph drawn before it - which wants the first per-enemy *state machine* inside a walk
(a `stage` and a `timer` on the enemy, written by its walk, drawn from it by the renderer) and the
first telegraph in the game. After that, `Spitter` (PLAN 3.3's shooter) is the one that wants item 3
(enemy bullets on their own pool, in warm colours). Renumbering the existing kinds to PLAN's names is
worth doing when there are four of them and not before.

---

## Session 16 (2026-10-07) — Milestone 3: the kind names, and the darter

Two commits and a release (**v0.3.0**). The first is a rename that changed nothing; the
second is the first enemy with a plan.

### Commit 1: the kinds are PLAN 3.3's names now
`chaser` → **`drifter`** (PLAN's Drifter: walks straight at you) and the old `darter` →
**`weaver`** (it was always PLAN's Weaver: a sine-wave weaver wearing the wrong name). That
frees `darter` for the thing that actually lunges. Everything moved with it: `kinds.darter.*`
in balance.js, `weaverChance(Ramp)`, `split.type`, the ambient lists, the renderer's art
branch, and every test that named a kind. **Proved behaviour-free**: the reference run
(`--seed 20261006 --trace`) came out byte for byte the session-13/14/15 one, every hash equal.
Renaming is free with respect to the run because a kind's *name* never reaches the stream.

### Commit 2: the darter, and the game's first telegraph
PLAN 3.3's row: pause, aim, lunge in a line, telegraph with a thin warning line.

**The beats.** `makeEnemy` now gives every enemy `stage`, `timer`, `dirX`, `dirY` ("the small
state machine a kind may keep for itself"; most kinds never touch them). The darter's walk is a
`switch` on `stage`: `''` hunts (creeps at the ship at `speed`), `aim` (stands dead still, turns
its nose onto the line it locked, counts down `aim.time`), `lunge` (the locked line at
`speed × mul`), `rest` (a crawl, nose coming back around), then `''` again with `timer = beat`.
Committing needs both `timer <= 0` **and** the ship inside `hunt.commit`, so a darter that
missed gets another *look*, not another lunge. Being shot cannot make it change its mind: the
aim applies impulse (`glide(enemy, step, 0, 0, 0)` still carries `ix/iy`) but never re-reads the
ship. A lunge into the arena wall is ended by the wall (`heldByTheWall` clamps by its own radius
and returns whether it had to).

**Why the telegraph cannot lie.** The renderer asks `kinds.js` four things - `isAiming`,
`isLunging`, `aimProgress(enemy)` (0..1 out of `timer`), `lungeReach(enemy)` (=
`speed × mul × time`) - and draws the line along the same `dirX/dirY` the lunge travels by, for
exactly `lungeReach` px. `test/darter.test.mjs` then moves the ship to the far corner *after* the
aim locks and measures the actual lunge against `lungeReach`: same length (± one step), same
line (dot product > 0.999 of length). A stage string never leaks into drawing code.

**`advance` split in two.** `glide(enemy, step, dx, dy, pace)` does the arithmetic a walk always
does (own pace along a unit vector + the leftover impulse, then decay it), and `advance` is now
"point at the ship, maybe swerved, then glide" with an optional `pace`. The old kinds' arithmetic
is byte-identical (the trace says so); the new one needed to move along a *locked* direction and
to stand still with a shove still in it, which the ship-direction-only version could not say.

**The numbers**, in `BALANCE.kinds.darter.hunt`: `commit 430`, `beat 0.4`, `turn 9` rad/s,
`aim.time 0.62`, `lunge.mul 5.2` / `lunge.time 0.45` (≈ 541 px/s at the start of a run, so
~1.7x the ship's top speed, for a reach of 243 px), `rest.time 0.55` at `crawl 0.3`. Cycle ≈ 2.02 s,
i.e. a dart every two seconds. `mul` is a *multiple of its own speed* on purpose: `enemy.speed` is
where the run's speed scaling lands, so the lunge scales with the run without a second knob.
Hull 2 (PLAN's darter/drifter ratio is 0.6, and the drifter here is 3 shots). Note again that
PLAN's absolute hull numbers assume Pulse does 10 damage; here a bullet does 1, so hulls are
counted in shots and only the *ratios* carry across.

**It is warm.** New palette entries `red #ff4d6d`, `redFill`, `telegraph #ff9fb0`,
`telegraphHead #ffd9df` - PLAN section 4's "harmful is warm" half, which the comment in the
palette had been promising since milestone 2. The line is two strokes (a wide soft `red` under a
thin `telegraph`) plus a glow at its head and a small charge of light at the dart's nose, so
**2 strokes + 2 stamps per aiming dart, no blur, no gradient** (`test/telegraph.test.mjs` pins
exactly that, and pins that a darter off the window costs nothing at all). A lunging dart stamps
one caller-owned `makeStreak` blur and adds no strokes.

**Death**: `shattersAlongItsAxis`, one `spray` out of the nose and one out of the tail (8 each).
It spends `fx`, not `logic`, so it cannot move a run. The kinds.js header now says that queuing a
sound cue from a behaviour is allowed too - a cue is a note to the audio layer, not a number the
simulation keeps - because the aim and the lunge each queue one (a rising tick 0.6 s before it
comes, a short one as it goes).

**The spawn mix became data.** `BALANCE.enemies.mix` is a list of
`{ type, from, chance, ramp }` plus `mixFallback`, and `rollKind` walks it. Same numbers and the
same order as the hand-written if-chain it replaced, so the run is unchanged up to the moment the
darter unlocks - and it spends exactly **one** `logic.next()` per spawn however many kinds exist,
which is the property the wave director will need. It is the seed of that director, not a
down payment on it: "meant to be replaced by it, not grown into it" says the comment. The darter
unlocks at 60 s (PLAN's 1:00) at `0.10 + 0.10 × difficulty`, taking its share from the drifter
only, so nothing that existed before got rarer.

### Measurements
- 128 bot seeds before the darter: **1m29s, score 1200, level 3.3, 87 kills**. After: **1m28s,
  score 1216, level 3.3, 86 kills**. Noise, as expected for an enemy that unlocks at a minute in
  a run the naive bot survives 89 s of. (Measured against a `git worktree add /tmp/base HEAD`,
  which is the way to do this here; `git worktree remove` it afterwards.)
- The **reference run is byte-identical** - `seed 20261006` dies at 1m07s and no darter ever
  appears in it. That is a nice control and a bad demo: **use `seed 20261007` to look at the new
  enemy** (dies 1m14s, 810 darter-frames, 231 of them aiming, 162 lunging). `seed 5` is the
  darter-rich one: 1m58s, 8114 darter-frames.
- Over 40 bot runs, 39 met at least one darter; a darter is 5.8% of all enemy-frames (drifter
  46%, tank 37%, weaver 11%). The reference run just got unlucky.
- Throwaway tally scripts live in /tmp (`kindcount.mjs`, `findseed.mjs`); they boot the harness
  **once** per process and call `playOneRun` per seed with an `onFrame` hook - a second
  `bootGame` in one process cannot work (one game per process) and `playRuns` has no hook.
  `tools/balance-report.js` will do this properly when it is built.

### Tests: 197, all passing (was 179)
`test/darter.test.mjs` (13, the scripted world, everything measured in seconds with a bounded
`whileBeat` helper so a wedged hunt fails instead of hanging): it does not lunge from across the
arena; it commits the moment you are inside `commit`; the aim is exactly `aim.time`; the countdown
only runs forward and reaches 1; it does not move while aiming (asserted `x === x` - pace 0 and no
impulse is *exactly* still) but its nose comes onto the line; the lunge is the line and exactly
`lungeReach` long even after the ship runs away; a lunge into the wall ends at the wall; the four
beats come in order with the data's durations and exactly 3 lunges in 6 s; the rest turns the nose
back to the ship; a hit shoves it but does not reset it or re-aim it; its death throws exactly
`2 × jet.count` more particles than its own burst and chunks account for; and the mix withholds
it until its minute and then sends everything.
`test/telegraph.test.mjs` (5, the real renderer through the canvas stub): an aiming dart is
+2 strokes and +2 stamps, no gradient and no blur; a lunging one is +1 blur and +0 strokes; the
hunt and the rest draw nothing extra; a dart 1500 px off the window costs nothing at all.
`test/kinds.test.mjs`'s "walking the crowd spends no randomness" now builds its crowd from
`Object.keys(KINDS)` and steps 2 s, so **a new kind cannot slip a `logic` draw into its walk**
without that test saying so.

13 mutations tried; **two survived the first round** and both were real. (1) Dropping the nose
turn in `resting` changed nothing any test could see - hence the "the rest brings its nose back
around" test. (2) My *mutation* for the telegraph cull was wrong (I neutered the `isAiming` line
and left the real `onScreen` guard in place), and after fixing that the cull is caught; removing
the `isAiming` guard itself is caught too. Everything else - never lunge, chase the ship instead
of the locked line, no wall check, no rest timer, commit from anywhere, a wrong `lungeReach`, an
inverted `aimProgress`, one jet missing, no clamp, no thin pass, no blur - failed a test on its own.

### Decisions, so nobody relitigates them
- **PLAN's absolute hull/speed numbers stay unusable**; the ratios are what get copied, because
  damage here is 1 a shot. Written at the top of `BALANCE.kinds` so the next enemy starts from it.
- The **`hunt` table lives in balance.js** and `kinds.js` only points at it (`stats.hunt`), as
  always. Four beats, three named stages and `''` for the walk between them; the fourth name
  would have been a string nothing ever compares against.
- The dart is drawn by its own `dartPath` (all nose, swept wings), so its row's `sides: 3` is
  only the fallback - said in a comment where it is written.
- The title-screen crowd got two darters (`ambient.target` 7 → 8) so the silhouette is visible
  before it ever shoots at you. Menu enemies drift; they never hunt.
- No retune of the drifter/tank/weaver numbers this session. They are still not PLAN's, and now
  is not the session to move three kinds and a reference run on top of a new one.

### Next (milestone 3)
1. **Enemy bullets on their own pool, in warm colours** (PLAN's item under 3.3) - the Spitter is
   the first user, and a `player ↔ enemy-bullet` hit test wants the grid's other direction. Do
   this before the Spitter, not inside it.
2. Then **the Spitter** (keeps its distance, fires slow aimed shots): it will be the second kind
   with a beat structure, so it will show whether `stage`/`timer` generalises or wants a small
   shared vocabulary.
3. Or, if a no-new-systems session is wanted instead: the **Bomber** - telegraphed circle on death,
   hurts other enemies too, which also wants `killEnemy` to run `onDeath` for non-player kills
   (session 15's note about where that call sits).
4. Then the **wave director** consuming `mix` (a spawn budget, off-screen `arrivalSpot` as the
   spawn primitive), elites, off-screen indicators, and the bot learning to dodge - with
   `tools/balance-report.js` beside it and the 128-seed rule from session 13 in mind.

## Session 17 (2026-10-07) — Milestone 3: enemy bullets, and the spitter that uses them

Three commits and a release (**v0.3.1**). Session 16's note said to do the bullet pool *before*
the Spitter, not inside it; in practice they arrived in one piece of work, because a shot system
with nothing that fires one is untestable arithmetic. The pool went in first and the spitter
became its first - and so far only - user.

### Commit 1: the mix has room in it
`enemies.mix` rows cost `chance + ramp` of one roll once the ramp has run out, so a fourth row
had to be paid for: tank 0.12/0.10, weaver 0.24/0.12, darter 0.08/0.08, spitter 0.06/0.05 - the
specials now cost 0.85 between them and about a sixth of a late crowd stays plain chaff. The
reference run **moved** here, as it always does when the mix moves: `--seed 20261006` is now
**1m57s, score 1791, level 4, 123 kills, 54 shards**, and 128 seeds average **1m26s, score 1120,
level 3.2, 81 kills**. Both are the new baseline; `/tmp/trace.A.txt` at that commit is what every
later step in this session was diffed against.

### Commit 2: `src/game/enemyshots.js` - the other direction
`world.enemyShots` is a pool of `{x,y,px,py,vx,vy,life,r,color}`, deliberately *not* part of
`game/bullets.js`: the player's bullets go looking for the crowd (which is why that file owns the
grid), these go looking for one thing, so a shot costs one `dist2` and never touches the grid.
`enemyShotAt(world, x, y, dx, dy, spec)` takes the firing kind's own `shot` numbers (`speed`,
`radius`, `life`, `color`) - what every shot shares is only where it stops existing and what it
costs you. `updateEnemyShots(world, dt)` flies them, kills them at `life <= 0` or
`BALANCE.enemyShots.despawnMargin` (40 px) outside the arena, and answers false if a hit ended
the run mid-loop, so `stepRun` stops there: `updateBullets` → **`updateEnemyShots`** →
`updateEnemies`. A hit is `shot.r + ship.r` (4.5 + 6 px), costs one `hitPlayer(world, null)` and
spends the shot. An invulnerable ship - the grace after a hit, or a dash - is let through with
the shot **unspent**, which is what makes dashing across a volley the right answer instead of a
way to eat two hits. `resetRun` clears the pool. `main.js`'s `stats()` gained `shots`.

### Commit 3: the spitter, and PLAN's second telegraph
PLAN 3.3's row (keeps its distance, fires slow aimed shots, 3:00) as this game does numbers:
`radius 14, speed 66, hull 5, score 26, drop 3`, orange, five sides, `spit.range 200-330`,
`drift 52 px/s at rate 1.3`, `wind.time 0.45` (+ a sawtooth as it fills), `after 1.7`,
`shot { speed 270, radius 4.5, life 2.6 }`. Slower than the ship's 320 on purpose: a slow warm
dot in the air is a threat you can read, and the reading is what makes it fair.

`walksSpacing` has two beats, not four: `''` (hold the band - in from beyond `far`, back off
inside `near`, plus a sideways `sin(elapsed × rate + phase)` shuffle so it is never a sitting
duck; `heldByTheWall` because it walks backwards on purpose) and `'spit'` (stop dead, and at the
end of the wind-up `enemyShotAt` along `dirX/dirY`). **The direction is locked in the *holding*
step, before the wind-up starts** - same rule as the darter's line, and for the same reason:
what you were shown is what arrives. Its mouth points at the ship the whole time it walks
(`rot = atan2(ny, nx)`) and then holds the locked line while it fires, so the tell is literally
"the mouth is pointed at me and filling up".

**`stageTime`, and one shared countdown.** `makeEnemy` gained `stageTime` - how long the beat it
is in was when it began - written at every beat entry of both kinds, and `aimProgress` now reads
`1 - timer / (stageTime || 1)` instead of digging into `stats.hunt.aim.time`. That is the small
generalisation session 16 wondered about: one helper counts down any beat, and the renderer still
only ever asks `isAiming` / `isLunging` / `isSpitting` / `aimProgress`. No stage string appears in
`render/`.

**Drawing.** `drawEnemyShots` is called in `renderer.js` *after* `drawEnemies`, with the reason
in the comment: a shot must never be hidden by the thing that fired it. Per shot: one glow sprite
(halo = `r + 8` px, so the light reaches past the 10.5 px that actually hits you) plus one
`arc`/`fill` core at `r * 0.7`, both culled by `onScreen`. A spitter mid-wind-up costs one extra
glow at `r * 1.3` along its nose, strength = `aimProgress`, so the light starts at nothing and
the *change* is the tell. New palette: `orange`/`orangeFill` (kind), `enemyShot`/
`enemyShotCore`/`spitCharge` (all warm, all said so in a comment - PLAN section 4).

### Verified
`node --check` on everything touched; **218 tests** (was 197: +15 `test/spitter.test.mjs`, +4
`test/enemy-shot-art.test.mjs`, +2 `test/kinds.test.mjs`); `--seed 1 --runs 128` byte-for-byte the
commit-1 baseline, and the reference trace from commit 1 is **identical** after commits 2 and 3 -
the whole spitter is inert in a run that never reaches 3:00, which is exactly what it should
prove before it is believed. The bot dies at 1m26s on average, so nothing about the bot measures
this enemy yet.

18 mutations tried over the two files, and the ones that survived were my tests' fault, twice:
(1) "the shot goes where it was pointed" had the spitter *directly above* the ship, so one
component of its direction was nil and a `vx × 1.1` mutation changed nothing - moved to a
diagonal spot and it is caught; (2) the wall test had the spitter backing away *from* the wall, so
deleting `heldByTheWall` was invisible - the ship now sits between the spitter and the wall and
the test asserts it is stopped there *and* stays pinned. A cadence test that counted spits inside
a fixed 4.3 s window was measuring luck; it now measures the interval between successive spits
(±0.3 s) and pins both `wind.time` and `after`. Everything else failed a test on its own: firing
from the middle instead of the rim, firing out of reach, never backing off, creeping during the
wind-up, re-aiming at the moment of firing, no wait between spits, no invulnerability check, not
spending the shot, no life check, no despawn, no `updateEnemyShots`, no `clear()` on restart, no
core fill, no cull, no mouth light. Still blind, and knowingly: the canvas stub counts draws, it
does not see **colour** or **arc radius**, so swapping `enemyShotCore` for `enemyShot`, or drawing
the core at `r × 4`, is invisible here (same blind spot as the darter's line colours).

### Decisions, so nobody relitigates them
- **Two beats, not four.** The spitter has a hold and a wind-up and nothing else; `SPITTING` is
  the only named stage and `''` means "holding its distance". A `rest` beat would have been a
  number nobody can feel.
- **`stageTime` in the enemy, not a per-kind lookup in `aimProgress`.** The renderer must not
  compare stage strings and it must not need a kind's table to know how far a beat has run.
- **The wind-up's light starts at strength 0** and grows, rather than starting faint. A thing
  appearing is a better tell than a thing being there, and it makes `aimProgress` testable at all
  (the stub sees a stamp or it does not).
- **No lower bound on firing.** It fires whenever `distance <= far`, even hugged, even though the
  warning then shrinks towards the wind-up alone. A spitter in your face is already backing off
  and contact damage is doing the punishing; a `range.min` knob would be one more number to defend.
- **The shot is slower than the ship** (270 vs 320). You can outrun a shot you read late by
  walking the right way. Deliberate.
- **The spitter unlocks at 180 s, per PLAN**, which means the bot never sees one and neither
  will most players yet. It is data in `mix`, not code; moving it earlier is one number and a
  reference-run re-record if the next sessions decide the arena wants it sooner.
- Menu crowd gained a spitter (`ambient.kinds`/`refillKinds`) so the shape is learnable before it
  shoots; menu enemies drift in straight lines and never call a kind's walk, so no menu spitter
  ever fires or makes a sound.

### Next (milestone 3)
1. **The wave director** consuming `mix` - a spawn budget that grows with time, spent on the
   unlocked rows, with off-screen `arrivalSpot` as the spawn primitive. This is the item that
   makes everything so far arrive *well*; currently a wave is one `spawnEnemy` call at a random
   edge point.
2. **The Bomber** (telegraphed circle on death, hurts other enemies too). It wants `killEnemy`'s
   `onDeath` moved above the `if (!byPlayer) return;` line - a death effect is a property of
   dying, not of being shot - so expect a small refactor of `enemies.js` with it.
3. **Off-screen indicators**: with a 3000×3000 arena and a 1280×720 window you already fight
   things you cannot see; a spitter firing from off-screen is worse than a drifter drifting in.
   Probably wants the camera/`render/` edge and an arrow per off-screen enemy, cheap and dim.
4. Then elites, the bot learning to dodge shots (it does not: `tools/headless/bot.js` only avoids
   bodies), and `tools/balance-report.js` with the 128-seed rule from session 13 in mind.

---

## Session 18 (2026-10-07) — Milestone 3: the wave director. Released **v0.3.2**.

### What landed
PLAN milestone 3's "a spawn budget that grows with time, spent on the enemy types
unlocked so far". **New file: `src/game/waves.js`**, which replaces the spawn clock that
used to sit in `enemies.js` and now owns every arrival in the game.

- **One budget, one rule.** `BALANCE.waves.crowdBase/crowdPerMinute/crowdMax` say how
  many *points of enemy* the arena may hold right now (~4 bodies to begin with, ~19
  after a minute, ~45 after three, ~90 from ~6:00). Every kind has a `cost` (drifter 2,
  weaver 3, darter 4, spitter 6, tank 8) and a `weight` (6/5/3/2/3) in its
  `BALANCE.kinds` row, next to its `from` - the three numbers that describe a kind *as
  a spawn* rather than as a fighter. When the crowd is worth less than the budget by at
  least `waveMinPoints`, the director buys a wave with the room: rolls unlocked,
  affordable kinds until the room or `maxMembers` runs out, and stands them on the
  border of the window along **one bearing**, spread evenly across `fan` radians. Then
  it waits `gap` seconds and looks again; when there is nothing worth spending it looks
  again in `retry`.
- So the crowd sits at about the budget and there are exactly two ways to bring the next
  wave sooner: wait (the budget grows) or kill (the room opens). Running away does
  neither. That is what makes it a director rather than a timer, and it is self-limiting
  in a way the old drip was not.
- **`world.waveNumber`** counts the waves (reset with the run, reported by `stats()`, and
  mixed into the bot's trace fingerprint). The HUD can show it when milestone 9 wants it.
- **The arrival rules moved here** (`arrivalSpot`, `viewBox`, `arenaBox`, `arrivalFits`)
  and gained an optional **bearing**: the point on the window's border along a ray out of
  the ship, fanning further round either side when the arena is not there, then the old
  random-edge loop, then the arena's own edge. `spawnEnemy(world, type, bearing)` now
  answers **the enemy it placed, or null** - not `true`/`false` - which is what makes a
  wave measurable from the outside. `BALANCE.enemies` shrank to how-the-crowd-behaves
  numbers; `BALANCE.waves` holds the spawn numbers, arrival margins included.
- **`world.difficulty` is gone.** The mix roll was its only reader; hp and speed scaling
  have their own windows. Removed the field, the write, `difficultyRamp`, and the two
  test lines that set it.

### Two flaws I found by measuring, not by reading
Both would have shipped quietly. Both are about the *shape* of the crowd, not its size.

1. **A small wave can only buy cheap things.** A wave is bought with the room, and the
   room usually opens a few points at a time - so when `waveMinPoints` was 6, nothing
   costing 8 could ever be bought, and tanks (and later spitters) thinned out of the late
   crowd to almost nothing: 11% of on-screen bodies against the old build's 31%. Fixed
   by making `waveMinPoints` (now 12) at least the dearest kind's cost, which is a rule
   worth saying out loud: **a wave is always big enough to afford the biggest thing that
   could arrive in it.** There is a lockstep test for it (`every kind fits in the
   smallest wave the director will send`) and a behavioural one (`a dribble of room is
   not a wave`). After the change: 31% of on-screen bodies were tanks again.
2. **The refill rate is a real ceiling.** `waveMaxPoints / gap` is how fast the director
   can put bodies back; if it is below the player's kill rate the crowd simply thins out
   and the game gets easier however big the budget is. Measured at 30 points per ~1.15 s
   ≈ 6 bodies/s, against a bot that kills ~1.5/s and a player who can maybe manage 4.
   That is why the gap is 0.9-1.4 s and a wave can be worth 30 points / 8 bodies: the
   budget, not the refill, has to be the binding constraint.

### Why the bot's survival moved: 1m26s → 2m12s
Deliberate, and measured both ways with a `git worktree` of the old HEAD (`/tmp/density.mjs
<root> <seconds> <seeds>` prints the mean bodies on screen at a moment of the run - keep
it, it is the only way to see what a spawn change does):

| | bodies @ 1:00 | bodies @ 1:40 | seeds reaching 2:30 |
|---|---|---|---|
| old (drip) | 18.4 | 52.5 | 0 of 12 |
| new (waves) | 18.7 | 31.0 | 8 of 12 |

The old spawn rate hit its floor at ~2.4 min and drove the crowd into the 95-body cap,
which is why every old seed was dead inside 2.5 min. The budget curve takes about six
minutes to reach its ceiling, so the crowd keeps growing instead of pinning - which is
the shape PLAN's 15-minute arc needs (and milestone 10 wants the bot dying at 4-9 min,
not 1.5). Density at one minute was held on purpose; everything after it is the change.
Remember the inversion when tuning: **a bigger budget means the bot dies sooner.**
Reference run (seed 20261006) is now **2m43s, score 2160, level 3, 157 kills, 35 shards**.

### The flaky test this exposed, and the lesson about "builds nothing" windows
`test/draw-cost.test.mjs` measured 45-60 s and asserted the last 5 s baked no new sprite.
A glow sprite is baked when a kind is first *drawn*, and the darter unlocks at exactly
1:00 - so as soon as the wave director brought a darter a second earlier than the old
system had, its bake landed in the measured window and the test failed at random. Fixed
by moving the windows to 100-115 s: after the darter's minute, before the spitter's
three. **Any test that promises "nothing new was built" has to sit in a gap between kind
unlocks, and moving an unlock moves that gap.** `test/audio.test.mjs` had the same class
of problem for a different reason (a ship standing still can now die, and a dead ship
makes no sound): it makes the ship invulnerable, like the other measurement tests.

### Tests: 243, all passing (was 218)
`test/waves.test.mjs` (25) drives the director directly, with the run's clock wound on by
hand: the budget grows, never shrinks and levels off; the crowd tracks it and never
overshoots; later runs get bigger crowds; killing opens the room and the next wave is no
later than the gap; the body ceiling holds whatever the budget says; a wave spends the
room down to less than the cheapest body and never more than `waveMaxPoints`; the dribble
rule; the affordability rule; every kind fits in the smallest wave; the roll can bring
anything unlocked and nothing locked, is weighted to within 4 points of its share over
6000 rolls, and costs exactly **one** number out of `logic` per member whatever the roster
holds; waves are counted and a fresh run forgets them; the members arrive across the whole
fan, from many different bearings, off the window, inside the world and never on the ship
(including a ship tucked in a corner, and an arena so small that nothing fits and the wave
is not counted); and the same seed buys the same waves.
**Mutation battery: 19 of 19 caught** (`/tmp/mutate-waves.mjs`, throwaway). Two mutants I
wrote turned out to be *equivalent* - making the second eligibility pass ignore the clock
or the cost changed nothing, because the second pass could disagree with the first only
for a kind that sits earlier in the roster than an eligible one. So I deleted the
duplicated predicate instead of testing it: `pickMember` now collects the eligible rows
into one module-level scratch list (`ELIGIBLE`, refilled per call, no allocation) and
walks that. Better outcome than a test: the bug became unexpressible.

### Decisions, so nobody relitigates them
- **`cost` and `weight` sit on the kind's row, not in a `waves` table**, because they
  describe the kind as a spawn. `weight` is a share of the *arrivals* and nothing else
  ("for every six drifters, five weavers, three darters, three tanks, two spitters");
  `cost` is what makes an expensive kind rare. Making a kind commoner: raise its weight,
  lower its cost - the comment above `BALANCE.kinds` says this.
- **`world.spawnTimer` keeps its old name** as "how long until the director may spend
  again", because `= Infinity` is the switch a dozen tests and `tools/headless/scripted.js`
  use to park the director, and renaming it would have touched ten files for a word.
- **A wave that brings nobody is not a wave**: `sendWave` answers null when no member
  found somewhere to stand (only reachable on a window that already shows the whole
  arena) and nothing is counted or spent.
- **`crowdCost` charges a hatchling its kind's cost**, not a smaller one: two hatchlings
  are a tank's worth of dying to do, and reading `enemy.kind.stats.cost` never needs a
  second rule.
- The fan is 0.9 rad and the retries step by `fanRetry` (0.45) either way before falling
  back to the old random edge. A wave keeps its shape near a wall, which is where a
  cornered player most needs it not to collapse into noise.

### Watch out
- `test/waves.test.mjs` shares one world across the file, and one test shrinks the arena
  to 300 px; `runAged` puts `arena` and the ship back like new for exactly that reason.
  A new test that mutates the world has to expect the next one to reset it.
- Adding an enemy kind is now *five* numbers, not three: `from`, `cost`, `weight` next to
  the stats, and the roster picks them up by itself (`ROSTER` is built once from `KINDS`).
  `waves.test.mjs`'s distribution test will tell you if the weights are silly.
- The crowd's *bodies* depend on the mix: ~4.5 points a body with the current weights, so
  the ceiling of 400 points is ~90 bodies and `maxBodies: 100` stays the perf guard.
  Change a cost and you change the density; that is the coupling.
- The wave director spends from `logic` one roll per member, plus one for the bearing and
  the arrival draws - so a wave's worth of arrivals moves the stream a lot. That is fine
  (a spawn *is* gameplay), but it means every knob above moves the reference run. Re-record
  it after any change: `node tools/simulate.js --seed 20261006 --trace`.

### Next (milestone 3)
1. **The Bomber** (PLAN 3.3: explodes on death in a telegraphed circle, hurts other
   enemies too). It wants `killEnemy`'s `onDeath` moved above the `if (!byPlayer) return;`
   line - a death effect belongs to dying, not to being shot - and it is the first chance
   for enemies to damage each other, which the wave director makes sensible: a wave that
   arrives next to a tank now matters.
2. **Off-screen indicators.** More valuable now that a whole wave arrives off one side:
   the bearing is already a thing the simulation knows (`world.waveNumber` and the fan),
   so an arrow at the window edge has something honest to point along.
3. **Elite variants** (×4 hull, gold outline, `from: 8:00`): the budget wants an elite
   multiplier on `cost`, which is a one-line change in `crowdCost`/`pickMember` once the
   elite flag exists on the enemy.
4. Then the bot learning to dodge, and `tools/balance-report.js` - which should print
   bodies-on-screen over the run and the kind mix, because that is what had to be measured
   by hand this time (`/tmp/density.mjs` is a working sketch of it).

---

## Session 19 (2026-10-07) — Milestone 3: the bomber. Released **v0.3.3**.

PLAN 3.3's sixth enemy: "explodes on death in a telegraphed circle; hurts other
enemies too", 6:00. Two commits, because the first one is a refactor the second one
needed and they are easy to tell apart.

### Commit 1: a death effect belongs to dying, not to being shot
- `killEnemy`'s `kind.onDeath(world, enemy, byPlayer)` moved out of the `byPlayer`
  branch: a tank that comes apart in somebody else's blast still hatches. `byPlayer`
  is passed on, because a chain reaction the player lit should pay the player. No
  behaviour change today (nothing but bullets killed anything) and the reference run
  and all 128 seeds were byte-identical afterwards.
- **`damageEnemy(world, enemy, amount, byPlayer)`** is now the one place an enemy takes
  damage and maybe dies (`bullets.js` had the only two lines of it; `blast.js` needed a
  third). It answers whether the target died, which is how the caller knows to play the
  death rather than the impact.
- **`widestEnemyRadius()` moved from `enemies.js` to `kinds.js`, and `enemies.js` no
  longer imports `kinds.js` at all.** Not tidiness - necessity: `kinds.js` was about to
  need `blast.js`, `blast.js` needs `killEnemy`/`damageEnemy` from `enemies.js`, and
  `enemies.js` ran `measureWidestEnemy()` at module scope, so the cycle would have had
  it reading `KINDS` while `kinds.js` was still being evaluated (a TDZ crash depending on
  which module the import graph reached first). The measure belongs with the table it
  measures anyway. `test/kinds.test.mjs` imports it from its new home and now also
  checks that a hatchling is thinner than the fattest body, which is the promise that
  number makes.

### Commit 2: the bomber, and `src/game/blast.js`
Numbers, in the game's own units (`hull` is counted in player shots, at the ratio the
drifter already sets): `radius 18, speed 96, hull 7, score 32, drop 4`, `from 360`,
`cost 7, weight 3`, an octagon in a new `ember` with a lit `blastFlash` core.
`blast: { radius 108, damage 6, arm 0.45, rush 1.4, shove 260, ring/flash/shake 9/
hitStop 0.05, a low 84 Hz sawtooth }`.

**`blast(world, x, y, spec, byPlayer)` is an event, not a system.** There is no list of
blasts and nothing steps one: the effects are left behind, the damage is done inside the
step that called it. The two things that make it safe to do that:
- **the crowd is picked out first and hurt afterwards.** Hurting it can start another
  blast - a bomber caught in one detonates - and that happens inside the call, so a
  chain would splice `world.enemies` under a loop that was walking it. The victims list
  is allocated per blast on purpose; a bomber dying is not a per-frame loop.
- a victim already dead (`hp <= 0`) is skipped, which is what makes "everything dies
  exactly once" true through a chain, and `killEnemy` still throws if it is handed
  something that is not in the crowd.

**The circle is the whole of the rule**: a *centre* inside the radius is hurt, and a
centre outside is not, for the ship exactly as for the crowd - so the drawn ring is the
honest edge rather than an approximation of it (I chose this over `radius + enemy.r`:
one number, one line, learnable). Standing exactly on the line counts as inside, and a
`>` → `>=` mutation is caught by a victim planted at precisely `radius`.

**The walk is nothing; the death is everything.** `walksBomber` walks the straight line
at `speed`, and below `arm` of its hull left it walks it at `rush` times that - the one
about to go off is the one in a hurry. Both the walk and the renderer's warning read
`blastPressure(enemy)` = the share of its hull it has lost out of the share it can lose
before it turns, so the tell and the behaviour cannot disagree; the test asserts
`pressure === 1` exactly when `isCritical`. `blastRadius(enemy)` is 0 for a kind with no
blast, which is how the renderer draws a ring for a bomber without ever naming one.

`damage` (6) sits **under** a bomber's own hull (7) on purpose: one blast cannot set off
another bomber outright. It leaves it on 1 hull, which makes it critical, which sends it
at you. A test says so explicitly - a knot of bombers is something to pick apart, not a
screen-clearing lottery. Chains do happen through anything cheaper, and a chain carries
`byPlayer`, so the player is paid for the whole of it.

**Drawing** (`render/entities.js`): `drawBlastZones` is called in `renderer.js` first
after the walls, because a death zone is paint on the arena floor and nothing standing
on the floor should be drawn under it. Two strokes (a wide soft pass under a thin bright
one, the house idiom) on a `setLineDash` circle whose `lineDashOffset` crawls round,
pulsing at a rate that climbs with the pressure. Culled by `radius + 30`, not by the
body - a test proves a ring whose circle touches the window is drawn while none of the
body or the fuse is, which is the difference between a warning and a decoration.

### The trick worth keeping: extract a look as a function of time, then test it
The canvas stub counts draws; it cannot see alpha or colour, so "the ring breathes, and
breathes faster as it dies" was untestable while it was inline. `zoneLight(enemy, at)`
and `fuseLight(enemy, at)` are now exported pure functions of the enemy and the frame
clock, the drawing calls them, and `test/blast-art.test.mjs` measures their **turning
points in a second** (a steady light turns zero times, a dying one about seven) and their
min and max over four seconds. Same for the fuse, which never goes out: both bottoms are
the same `FUSE_CALM`, only the ceiling rises - which is what the test says.

### Tests: 266, all passing (was 243)
`test/bomber.test.mjs` (15, scripted world, seconds and px measured not guessed): the
straight walk and the rush; the pressure ramp; `blastRadius` against the data and the
0.5 s-of-full-speed rule that makes the circle dodgeable; the exact boundary in and out;
the shove's direction in both axes; the ship's hull inside, outside, and dashing through;
the hit-stop and the particle count (`death.particles + death.debris + flash.count`, so
"the blast made light" is a number); credit both ways; a chain paying once and only once;
a shot finishing a bomber **inside a live step** with a stale grid; the roster keeping it
off before 360 s; and the cost/score locksteps with the director.
`test/blast-art.test.mjs` (6, real booted game): the ring's cost in strokes/lights/dashes
and that nothing else in the roster draws one; the cull; the pulse and the fuse above.
**`test/waves.test.mjs` no longer hard-codes 300 s**: two of its tests needed "every kind
unlocked" and now say `ALL_UNLOCKED = max(from) + 30`. Before the change the weighted-roll
test would have "failed" on the new kind for the wrong reason, and after it the tests
cannot silently measure a locked kind as noise again.

**Mutation battery: 23 of 23 caught** (`/tmp/mutate-bomber.mjs` over a `git worktree`,
throwaway). Three survived the first pass and all three were my tests' fault: (1) the
shove mutant only zeroed `ix` and I only asserted `iy` - now both axes are checked with a
victim beside the blast; (2) "no flash particles" survived because the death's own burst
also makes particles - the count is now asserted exactly; (3) the pulse was invisible, as
above, which is what the `zoneLight`/`fuseLight` extraction fixed. Still knowingly blind:
the *colour* of a ring or a core (same blind spot as the darter's line and the spitter's
mouth).

### Proof of what did and did not move
- Reference run (`--seed 20261006 --trace`): **byte-identical**, 2m43s / 2160. It dies
  before 6:00, so the whole bomber is inert in it - which is exactly the claim a new
  `from: 360` kind should be held to.
- 128 seeds: **exactly one seed moved**, seed 45, the only one that lives past 6:00
  (6m30 → 6m17, 337 kills against 340). Verified rather than assumed: the trace first
  differs at frame 21840 = 364.7 s, i.e. after the unlock, and a bomber was standing in
  the arena at the end of that run. **When a kind unlocks inside the survival range,
  expect the long tail to move and check where the divergence starts before believing
  it.** (The bot averages 2m09s over 128 seeds, so nothing about the bot measures this
  enemy yet - same situation as the spitter.)
- Soak (`/tmp/soak.mjs`, throwaway): 300 s of a live game with a bomber planted every 20
  frames (898 of them), fake audio on - no throw, 867 frozen frames (the hit-stop), ~11
  zones on screen at a time, 0 blurs, ~70 strokes and 60 stamps a frame.

### Decisions, so nobody relitigates them
- Centre-in-circle, not radius + body radius. Said out loud in `blast.js` and in
  `BALANCE.kinds.bomber.blast`'s comment, because it is the rule the player is learning.
- The rush instead of a fuse timer or an arming countdown: one more number that would
  only be felt as a delay. `arm`/`rush` are the whole state and neither needs a `stage`.
- The blast spends **no `logic` numbers at all** (only `fx`, for its sparks), so a bomber
  changes a run only through the bodies it kills and the ring the director chose for it.
- No sound on arming. The ring and the fuse are the tell; a second one would be a drone.
- The menu crowd swapped its second tank for a bomber (`ambient.kinds` still has exactly
  `target` entries - a ninth would mean the refiller never runs again, which is worth
  knowing before adding to it).
- A blast is not a world object. When milestone 4's nova wants an expanding area effect
  that takes time, that one *will* need to be, and it should not reuse `blast()`.

### Watch out
- `widestEnemyRadius` is imported from `game/kinds.js` now, not `game/enemies.js`.
- `onDeath` takes `(world, enemy, byPlayer)`; a kind that does not care says so in its
  comment (the tank's `hatch` ignores it).
- If a kind's unlock time ever moves past the bot's survival, the 128-seed baseline will
  not notice. That is a measurement gap, not a stability problem - `tools/balance-report.js`
  should print the kind mix so it stops being one.

### Next (milestone 3)
1. **Off-screen indicators.** More justified now: a wave arrives off one bearing and a
   bomber's circle is useless if the bomber is not on screen. The director already knows
   the bearing, so an arrow at the window edge has something honest to point along. PLAN
   section 4 asks for arrows to bosses and elites; start with that rule and keep it small.
2. **Elite variants** (×4 hull, ×1.15 speed, gold outline, 8:00, drops a large shard and
   a chance of a heal). Session 18's note: an elite multiplier on `cost` in
   `crowdCost`/`pickMember` is a one-liner once the flag exists on the enemy.
3. Then **the bot learning to dodge shots** and `tools/balance-report.js` (bodies on
   screen over the run, the kind mix, and time-to-kill by kind).
4. The remaining enemies in order: shielder (7:30), splitter swarm (9:00 - arrives in
   packs of 20, which will want a look at `waves.maxMembers`), sniper (10:30). The bomber
   was the last one whose death could be expressed as one blast; the shielder is the
   first that needs a relationship between enemies.

---

## Session 20 (2026-10-07) — Milestone 3: the arrows at the edge of the window. Released **v0.3.4**

### What landed
PLAN section 4's "an arrow at the screen edge", milestone 3's off-screen indicators.
**New file: `src/render/indicators.js`**, called from `renderFrame` once per frame after the
vignette. It is entirely the eye's: it reads no random stream and no game state beyond where
the crowd stands, and the reference run came out byte for byte what it was.

- **Two questions decide whether a body gets an arrow.** *Is it off the window* - the same
  `onScreen` test every draw call uses, so an arrow appears exactly when the body behind it
  stops being drawn and not a moment sooner. *Is it worth one* - a body is worth what the
  wave director already says it is worth, its spawn `cost` (drifter 2, tank 8), faded out by
  how far away it stands: full weight to half a window diagonal, nothing by 1.2 of them. So
  the numbers that decide an arrow's loudness are already in `balance.js` under a different
  job, and a far crowd is a rumour while one at the edge of the glass is a shout - and gets
  louder as it walks in, which is the useful half.
- **One arrow per direction, not per body.** Twelve slices of the compass; a slice's worth is
  the sum of its bodies' weights and it points at their *weighted middle*, not at the slice's
  own centre, so a cluster straddling two slices points at the cluster. Forty enemies off to
  the left are one bright arrow and not forty of them. Over a real 6-minute bot run the count
  never went above 4 and averaged ~1.1 per frame, which is the noise level this was aiming at.
- **It arrives and leaves instead of blinking.** One eased 0..1 `level` per slice, about a
  tenth of a second to a tenth of its way, drives both brightness and size; a body crossing
  back over the cull line does not make the edge of the screen strobe.
- **Pinned to the glass, not painted in the arena.** Drawn after the vignette and outside the
  shake translate, so a shaking frame cannot slide an arrow off the edge it is warning you
  about, and the vignette cannot dim the one warning that has to be visible in a corner. The
  rim point is a ray from the ship's painted position to the window rect, inset 26 px, with
  the ship itself pulled inside that inset first (against a wall of the world the ship can
  stand closer to the edge of the window than an arrow wants to be, and the answer then is the
  edge beside it rather than nowhere at all).
- Two tones of the darter's warm red (wide soft pass under a thin bright one) plus one glow
  sprite: **2 strokes + 1 stamp + 1 translate per arrow, no blur, no gradient**. Measured on
  one identical 9211-frame run against a `git worktree` of HEAD: 43.36 → 45.60 strokes/frame,
  44.82 → 45.94 stamps, fills/texts/gradients/blurs unchanged.
- `STARFALL.stats().arrows` reports the count for the F3 overlay (milestone 10), and
  `STARFALL.resetIndicators()` - which the harness calls in `resetToTitle` beside
  `resetClock`/`resetCamera`, same reasoning: a new run is played by a window that has not
  been pointing anywhere.

### The harness learned to say where a draw call actually landed
The promise "pinned to the glass, not painted out in the arena" was **not testable** before
this: the canvas stub recorded the *arguments* of each `translate`, so an arrow drawn in arena
coordinates looked exactly like one drawn in screen coordinates. I proved it by mutation - a
mutant that moved the call inside the camera transform survived every test I had.

So `tools/headless/harness.js` now carries a real 2×3 current transform in the stub:
`translate`/`rotate`/`scale`/`setTransform` compose it and `save`/`restore` stack it, and every
logged `translate` and `drawImage` carries `at` - where that point lands on the canvas, in
device pixels. Existing tests read the raw `x`/`y` and did not move. That is how
`test/indicators.test.mjs` can say "the arrow is 26 px in from the right edge, level with the
ship" and "it did not move when the frame shook", and how a future test can ask the same of any
draw call the camera is between it and the player. Worth keeping in mind for the boss telegraphs
of milestone 6.

### Two things that were wrong before they were right
1. **A fading arrow had forgotten which way it pointed.** `collectIndicators` zeroes each
   slice's accumulator every frame, so on the frame after the threat left there was nothing to
   take a direction from and the arrow simply vanished - the fade was silently a no-op. Fixed
   by keeping a settled, normalised `aimX/aimY` per slice alongside the accumulators: the
   arrow is drawn from the direction, and the direction is kept while the arrow fades out.
2. **The scratch slots bit the tests.** `indicatorSlots()` hands back the live list, so
   `theDirection(sight(a)).threat` read *after* a second `collectIndicators` was the second
   crowd's number and a "the pair is worth twice the lone one" test was comparing a number
   with twice itself. Said out loud in the test file now: read the numbers out of the slots
   before collecting again.

`test/blast-art.test.mjs` moved honestly and for a good reason: a bomber parked off the window
is precisely the body these arrows exist for, so its "nothing else was drawn" assertions now
subtract the arrows (`lights(cost)`). One arrow's worth of stamps is what that costs.

### Tests: 282, all passing (was 266)
`test/indicators.test.mjs` (16) splits in half. The pure half calls `collectIndicators` with a
hand-built crowd at arena points and measures seconds-free numbers: nothing lit for a crowd the
window can see; one body off the right edge is one arrow pointing right and worth exactly its
kind's `cost`; the same body 40 px further in earns nothing (the shared cull rule); a body on
the far side of the world earns nothing and the same body gets strictly louder at 800/1000/1300/1600
px, with the arrow floor pinned to lie between the first and the last of those; two bodies on
one ring are one arrow worth exactly twice either; opposite sides get opposite arrows; a tank is
`tank.cost / drifter.cost` times as much arrow as a drifter in the same spot. The drawn half
counts what a frame asks the canvas for and where it put it: 2 strokes + 1 stamp + no fill,
gradient or blur; the exact rim point right and up; unmoved by a shake of 14; a cornered ship
still gets its arrow on the inset corner; nothing at all for a visible body or a far one; the
fade lingers for a frame and cannot outlast a fifth of a second; a fresh run starts flat; and
the edge says nothing on the title screen.
**Mutation battery: 16 of 16 caught** (`/tmp/mutate-indicators.mjs`, throwaway, over
`src/render/indicators.js` and its call site in `renderer.js`). The survivors were the tests'
fault both times and one of them is the reason the harness can see transforms now; the other was
a mutation whose text had drifted after I edited `rimPoint` - which the script now reports
loudly instead of counting as a pass.

### Proof and numbers
- Reference run `node tools/simulate.js --seed 20261006 --trace`: **byte for byte identical**,
  every hash equal, twice (before and after the harness change). 4 bot seeds average 2m08s, as
  before. It is pure output, and it is worth having the trace prove it rather than arguing it.
- A throwaway histogram over a full bot run: 0 arrows on 24% of frames, 1 on 53%, 2 on 17%,
  3 on 3%, 4 on 1% - and the same late in a 6m17s run with 89 bodies in the world, because
  bodies far away are faded and bodies near you are on screen.
- **Do not mix `stats().arrows` into the bot's fingerprint.** It is a draw count; the trace is
  supposed to be the simulation's fingerprint, and `fingerprint()` mixes named fields only -
  keep it that way or a rendering change will look like a balance change.

### Decisions, so nobody relitigates them
- **`cost` is the arrow's currency.** It is the game's existing opinion of how much a body
  matters, so the arrows cannot drift from the difficulty curve. The cost of that is a coupling
  worth knowing: change a kind's spawn cost and its arrows change too. An elite is going to want
  an arrow, and session 18's note already says an elite will be a multiplier on `cost`.
- **12 slices.** Coarse enough that a wave is one arrow, fine enough that "behind you and to the
  left" is distinguishable. Nothing depends on the number except the tests above.
- **No arrow for an enemy's shot yet.** A spitter firing from off-glass is the worst case and a
  shot is a moving thing with a life of its own; the honest version weighs the *incoming* ones
  only (one dot product) and belongs with the spitter's follow-up, not smuggled in here.
- **No arrows on the title or game-over screens.** The title has an ambient crowd of its own and
  a run that is over needs no warnings; the state check is in `renderer.js`, one place.
- `indicatorSlots()` and `EDGE_INSET` are exported for the tests and say so in their comments.
  The stub's `at` is in device pixels, which is why the indicator test boots with `dpr: 1`.
- Still knowingly blind: the *colour* and alpha of an arrow (the same blind spot as the darter's
  line, the spitter's mouth and the bomber's ring), and whether an arrow is drawn *under* the
  vignette - the stub cannot see compositing.

### Watch out
- `collectIndicators` is the only door; `drawIndicators` calls it and ignores its answer, which
  is only the count of slices worth an arrow. The slots are scratch, every frame, all of them.
- `arrowCount()` reports the last frame that drew arrows; outside a run it is whatever the last
  one did. Nothing may depend on it but the F3 overlay.
- If a future setting turns the arrows off, turn them off at the call site in `renderer.js`
  (`if (world.state === STATE.PLAY)`) so `arrowCount` and the fade both stop together.
- The new transform in the stub is the honest one: if a draw call's `at` is wrong, the code is
  wrong, not the stub. Sprites stamped by `paintGlow` are logged at their top-left, not their
  middle - `nebula.test.mjs` relies on that.

### Next (milestone 3)
1. **Elite variants** (×4 hull, gold outline, 8:00, drops a large shard and a chance of a
   heal): the flag on the enemy, an elite multiplier on `cost` in `crowdCost`/`pickMember`
   (session 18's note), the gold outline in `render/entities.js`, and they are exactly what
   PLAN wants an arrow for - which is now a `cost` change and not a new system.
2. **The bot learning to dodge shots**, and `tools/balance-report.js` (bodies on screen over
   the run, the kind mix, time-to-kill by kind). Two sessions of notes have asked for it, and
   the 128-seed rule from session 13 is the reason.
3. The remaining enemies: shielder (7:30, "projects a shield onto nearby enemies" - the first
   kind that needs a relationship between enemies), splitter swarm (9:00, packs of 20, which
   will want a look at `waves.maxMembers`), sniper (10:30, a telegraphed laser across the whole
   arena - which wants the harness transform this session grew, and probably an off-screen arrow
   of its own).

---

## Session 21 (2026-10-07) — Milestone 3: elite variants. Released **v0.3.5**

### What landed
PLAN 3.3's last row of the enemy table: **any type can arrive gold from 8:00** - four
times the hull, 1.15 the speed, a gold outline, a large shard and a chance of a heal.

**An elite is a flag on an enemy, never a kind.** `BALANCE.elite` is multipliers
(`hullMul`, `speedMul`, `costMul`, `scoreMul`, `dropMul`) and `makeEnemy` applies them
through one `PLAIN` object of ones, so "four of its kind" is written once. Every kind
in the game is elite for free, a gold tank still hatches, a gold bomber still blasts,
and `test/kinds.test.mjs` never had to know. A new file **`src/game/elite.js`** holds
only the two decisions nobody else can make: whether a wave is carrying one at all, and
what it leaves behind.

- **Arrival: one gold body per wave, bought out of the wave's own room.** Two rolls in
  `sendWave` - whether this wave wants one, and which member of it - and the member at
  that seat is bought with `pickMember(world, left / costMul)` and charged
  `cost × costMul` from the room, so `wave.points` still means what it says and a wave
  can never overspend. The seat is random so a gold body stands anywhere in the fan
  instead of always leading it; a wave that never grows that big carries none (that is
  the discount noted under `chance`). `spawnEnemy(world, type, bearing, elite)` is the
  door, so an arrival asked for by name can be gold too.
- **`crowdCost` now reads `enemy.cost`, not `kind.stats.cost`** - the one number that
  means "what this body is worth to fight", set once in `makeEnemy`. `crowdCost` and
  `collectIndicators` both read it, which is how an elite is worth an arrow at the
  window edge where its plain self is not, with no new system: session 19's note said
  exactly this and it was true.
- **Spoils** (`eliteSpoils`, only on a player's kill, after the kind's own scatter): one
  **large shard** - the same mint pickup with `worth: 6` in it, so `xp`, `score`, the
  burst and the ring all follow from one number instead of a second pickup type - and
  **the chance of a hull back**. The heal is only rolled when the ship is actually hurt,
  so an elite never wastes its gift, and `healPlayer` (new, in `player.js`) clamps to
  `player.maxHull` (new: `BALANCE.player.maxHull`, reset with the run, and the HUD pips
  now count `max(ship.maxHull, ship.hull)`). Mint sparks, a mint ring, a rising chord
  and a `+1 HULL` label: the only good news the run hands out by itself.
- **The look**: gold twice over - a wide soft pass under the thin outline (the house
  idiom) plus one glow sprite - and, once it is hurt, a gold ring closing round it as
  its hull drains. That ring is the important half: four times the hull of a thing has
  to be seen going down or an elite reads as an enemy that cannot be hurt. The kill
  label is gold too. `PALETTE.elite` is PLAN's `#ffd76a`; the shards stayed mint, so
  nothing else in the arena wears gold and warm-still-means-harm holds.

### Numbers, measured rather than guessed
- Realised rate: **15.1% of waves** carry a gold body at `chance: 0.2` (a wave that
  never reaches the rolled seat carries none). Over 4000 waves the gold kinds came out
  drifter 270, weaver 166, darter 77, bomber 33, spitter 34, tank 24 - a gold tank is
  rare because at 24 points it fits in almost no wave, which is the right outcome.
- A live 3m50s soak parked at 7:50 (immortal bot): 6 gold bodies born, peak 3 on screen,
  big shards collected, ~4 heals, 0 blurs, 3 gradients (the XP bar's), no throw.
- **`crowdCost` at 3x an elite's kind** is what keeps the crowd honest: elites displace
  cheap bodies rather than being added on top of them.

### Proof of what did and did not move
- Reference run `--seed 20261006 --trace`: **byte for byte identical**, and the whole
  **128-seed baseline is byte for byte identical too** (every one of them dies before
  8:00). That is the `from` gate doing its job: a run that ends before the eighth minute
  cannot notice any of this exists, and `test/elite.test.mjs` says so directly
  ("none of it moves a run that ends before the eighth minute", and one that measures
  the stream not moving at all: 500 rolls, zero numbers spent).
- **Tests: 304, all passing** (was 282). `test/elite.test.mjs` (16) drives the scripted
  world: the multipliers for every kind, the gold price in the crowd budget, a gold
  tank's hatchlings coming out plain, the roll spending nothing before 8:00, the realised
  rate, at most one per wave, no wave overspending its room (with the room pinned near
  `waveMinPoints`, where a gold body least fits), large-shard worth and collection,
  spoils only for a player's kill, the heal's rate and its clamp, and that a whole ship
  is never healed. `test/elite-art.test.mjs` (6) counts draws: gold is one stroke and
  one light over its own kind, the hull ring appears only when there is hull to show,
  a plain wounded body grows nothing, a large shard is both a bigger light *and* a
  bigger body, an off-window body paints nothing and an off-window **elite earns an
  arrow its plain self does not**, and a heal speaks mint.
- **Mutation battery: 28 of 28 caught** (`/tmp/mutate-elite.mjs`, throwaway) across
  elite.js, kinds.js, waves.js, pickups.js, player.js, entities.js and indicators.js.

### The trick worth keeping: the stub can now measure a drawn shape's size
One mutant survived the first pass - the large shard's *body* radius, which the canvas
stub could not see (it logged stamps and translates, and `moveTo`/`lineTo` were noops).
So `tools/headless/harness.js` now logs every path point through the same transform it
already carried, and `game.points()` hands them back in device pixels. `bodyReach()`
in the elite-art test drops a shard, pins it still, and measures how far the drawn
points reach from its middle - 5.4 px against 9 px, which is the mutant caught. Same
reasoning as last session's `at`: if the promise is about what is drawn, the stub has to
be able to look at what is drawn.

### Decisions, so nobody relitigates them
- **Flag, not kind.** A `kindOf('elite')` would have meant a second table, a second
  roster, and every new kind forgetting to be elite.
- **One per wave, seat rolled.** Per-body rolls would have made a wave of gold possible
  (and the budget would have allowed it); "a wave with a leader" is the thing a player
  can read. The seat is rolled over `waves.maxMembers`, which is why the arriving rate
  lands under `chance` - said in the balance comment, with the measured number.
- **`costMul` (3) under `hullMul` (4)** deliberately: at 4 a gold tank costs 32, more
  than `waves.waveMaxPoints`, and would be unbuyable. If a kind's `cost` ever rises past
  ~10, say so out loud in the balance note or gold ones of it will quietly stop arriving.
- **Spoils belong to a player's kill**, like shards and score: a bomber chain that happens
  to finish a gold body is not something the player chose to bring down.
- **The big shard is one shard with `worth` in it**, not a new pickup. `worth > 1` is
  the only test anywhere, in the sim and in the drawing.
- **`healPlayer` itself is unconditional** - it gives hull, clamps, and says how much it
  gave. Whether a heal is *owed* is `elite.js`'s business (state, hull room, the roll),
  and keeping the two apart is what makes both testable without a fake roll.
- The elite's `r` is unchanged on purpose: the outline is the tell, not the size, and
  keeping the radius identical means no collision or cull rule had to change.

### Watch out
- `enemy.cost` is now the one cost every reader uses (crowd budget, window-edge arrows).
  Anything that builds an enemy outside `makeEnemy` must set it; nothing does.
- Nothing in the bot's 2m9s measures the elite - the whole feature lives past its death.
  `chance`, `costMul` and `heal.chance` are judgement until either the bot dodges or
  `tools/balance-report.js` can print a run that reaches 8:00. That is now the strongest
  argument for those two items.
- Still knowingly blind: the *hue* of the gold (an elite drawn in the enemy reds would
  pass), the alpha of the hull ring, and the HUD pip count - `max(maxHull, hull)` equals
  3 today, so no test could tell a mutant there. Say so again if it stops being true.
- A gold body could also shine in the title-screen ambient crowd (`ambient.js` builds
  its enemies with `makeEnemy`, so `{ elite: true }` would work). Deliberately not done:
  the menu crowd is decoration and its RNG spend would move the attract screen.

### Next (milestone 3)
1. **Extend the simulation bot to dodge, and add `tools/balance-report.js`** - bodies on
   screen over the run, the kind mix, time-to-kill by kind, and now the elite share too.
   Three sessions of notes have asked, and for the first time there is late-game content
   that no measurement reaches. A dodging bot that can live past 8:00 is also the only way
   the 128-seed baseline will ever stop being blind to a kind that unlocks at 8:00.
2. Then the remaining enemies: **shielder** (7:30, "projects a shield onto nearby
   enemies" - the first kind that needs a *relationship* between enemies: think about
   where the link lives, and note that the grid is rebuilt per step and is a snapshot),
   **splitter swarm** (9:00, packs of 20, which will want a look at `waves.maxMembers`
   and at the per-body budget), **sniper** (10:30, a telegraphed laser across the whole
   arena - it wants the harness transforms and probably an arrow of its own).
3. Small thing to fold into one of those: the elite's gold is unseen by the tests, so if
   a future session touches the palette, a `PALETTE.elite !== any kind colour` assertion
   in `test/palette.test.mjs` is cheap and would catch a collision.

---

## Session 22 (2026-10-07) — Milestone 3: the simulation bot learns to read danger

No release: nothing in `src/` changed, so the player's game is byte-for-byte v0.3.5.
This was all in `tools/` and `test/`.

`tools/headless/threats.js` is the bot's eyes, and `test/dodge.test.mjs` is the proof it
says what it claims. Read those two files before touching either. The short version: a
threat is a *push* (which way to get out of the way, and how loudly), the pushes are summed,
and the sum is the direction the ship wants. Nothing else. It reads only what a player is
shown - shots in the air, a darter holding a line, a spitter's mouth filling, the circle a
bomber stands in, the crowd's proximity, the walls - never a number the HUD withholds.

Two ideas did all the real work, and both came from measurement rather than thought:

- **Urgency is time to arrival, not distance.** A shot three seconds out is not what hurts
  you. With `lands = across / speed` feeding the weight, the bot went from flailing to
  stepping aside at the last moment.
- **Stepping off a line means getting clear of it.** Every line threat keeps pushing until
  the ship is at `shotClear` (95px) off it, easing out from `shotRoom` (30px). A ship that
  stops the instant it technically survives is standing on the same line when the next
  volley is aimed. Without that rule it still died at 3m with everything else in place.

What each step bought, four seeds, so the next session can tell whether a change helped:
naive 2m29s -> dodge shots in the air 2m52s -> plus give ground to anything that can touch
the ship 4m05s -> plus read the four telegraphs 5m21s -> plus `personalSpace` 130 instead
of 90 -> ~6m. That last one is a measured sweep, not a hunch: 90px gets walked down by the
crowd, 130px kites it, 170px never dies at all and so makes a useless ruler. `PLAN` M10
wants the bot dying between 4:00 and 9:00 with no upgrade choices; ~6m is where it should
sit. The cause-of-death table has **zero shot deaths** left - every death is a body
touching the ship, mostly drifters, then tanks, weavers, darters - which is this item done.

The naive bot stays in the file as `--bot naive`, and `test/simulate.test.mjs` asserts the
aware one outlives it. That sentence is the whole reason the tool exists.

What surprised me:

- **I wrote a fence rule, measured it, and deleted it.** Two bodies closing from opposite
  sides sum to nothing, and standing still in a pinch is the one answer that is always
  wrong. The rule (commit to the loudest single ask when the sum falls far below it) was a
  wash on 24 seeds *and* oscillated in a synthetic pinch - with no memory between frames
  the loudest body flickers between two equals, and the ship twitched in place while
  drifters ate it. Then I measured how often the raw sum actually cancels in real play:
  **not once in 64 000 busy frames across six runs.** A paper limit. Gone, `pressure` is
  just the size of the sum again, and the module comment records the whole episode so
  nobody reinvents it.
- **Three test windows had to grow from 240s to 900s** (`seed`, `restart`, `pool`). They
  promise "a run ends", and they play the run with the bot - which now survives 240s on
  most seeds. Right failure, right fix, but the suite went from 5s to 47s. Only those
  three files need the long window; if the suite ever has to get quick again, that is the
  lever, and `--bot naive` is the other one.
- **`bootGame()` twice in one process throws** ("the game booted but did not expose
  window.STARFALL"), and `scriptedRun()` hands back the *same* world every time. One
  harness of one world per test file; a test that wants two situations measures one,
  re-parks, then measures the other. My first bomber-versus-drifter test held both worlds
  at once and quietly compared a thing with itself - and it still passed three mutations
  that ought to have killed it.
- **The mutation battery is the piece I trust most.** 24 deliberate mistakes in the model
  (a line that reaches forever, no urgency ramp, no commitment, a reversed dodge, melee
  read as a push *toward* the body, each telegraph unread, each constant zeroed), each
  applied in turn and run against the new tests; the battery prints which test catches
  which. It found the broken test above, several tests passing for the wrong reason, and
  one mutation nothing caught - a wounded bomber pushing no harder than a whole one -
  because two knobs encoded the same threshold, which is why `criticalBlastWeight` is now
  gone and `blastPressure` carries that idea alone. Not in the repo (it lives in `/tmp`);
  rewrite and run it after any real change to `threats.js`.
- **`lungeReach()` is a balance constant, not a function of the enemy in front of you**,
  so a parked darter with `speed = 0` appears to hold a 243px line it cannot run down, and
  its arrival time is a division by zero. `telegraphed()` now requires `enemy.speed > 0`
  and a test says a darter that cannot walk is not a threat at all.
- On the reference seed alone, `aware` still sometimes dies *before* `naive` (2m25s vs
  2m43s early on): a dodging ship walks further and finds more corners. The averages are
  not close (6m vs 2m30s), but one seed is one seed, which is why the plan asks for 20.

Numbers for the next session to compare against: reference `--seed 20261006` aware 3m17s /
2988 / level 5 (naive: 2m43s / 2160). 24 seeds: mean 6.2-6.6 minutes, 4 capped at 10m,
~360 kills, score ~5300, ~2 elite capacity spent per run. Suite: 334 tests, 47s.
`tools/simulate.js` prints which policy played each run.

Still to do here, next session: `tools/balance-report.js`, the other half of this PLAN
line - per-kind time to first appearance, kills, damage dealt and taken over N runs. That
is what M4's tuning will be argued from, and it is worth writing before the bosses arrive
to change the shape of every run.
