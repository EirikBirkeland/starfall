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

