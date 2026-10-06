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
