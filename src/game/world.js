// The world: every piece of simulation state in one object, plus the step that
// advances it. Nothing in this file touches the canvas, the DOM, or audio; a
// headless run can import this and play with no browser at all.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { Pool } from '../core/pool.js';
import { Grid } from '../core/grid.js';
import { updateEffects, makeParticle, makeRing, makeLabel } from './effects.js';
import { updatePlayer } from './player.js';
import { updateBullets, makeBullet } from './bullets.js';
import { updateEnemyShots, makeEnemyShot } from './enemyshots.js';
import { updateEnemies } from './enemies.js';
import { updateWaves } from './waves.js';
import { updateShards, makeShard } from './pickups.js';
import { updateAmbient } from './ambient.js';

function createWorld() {
  const spec = BALANCE.player;
  return {
    state: STATE.START,
    seed: 0,          // the seed this run is a function of; see core/rng.js
    time: 0,          // wall clock of the session, for animations
    elapsed: 0,       // this run's clock
    steps: 0,         // how many fixed steps this run has been asked for (a hit-stop step counts)
    overTimer: 0,     // time since the run ended
    // How long until the wave director is next allowed to spend (game/waves.js).
    spawnTimer: BALANCE.runStart.spawnDelay,
    // How many waves this run has seen. The HUD will want it (PLAN section 4).
    waveNumber: 0,
    newBest: false,
    // Hit-stop: how long the run still has to hold still for, in seconds (0 when
    // nothing is frozen). game/effects.js `hitStop` sets it, `stepWorld` spends it.
    freeze: 0,

    best: 0,
    score: 0,
    xp: 0,
    xpNeed: BALANCE.progression.firstLevelXp,
    kills: 0,
    shardsCollected: 0,
    shake: 0,

    // The world the run happens in, and the window it is watched through. The
    // arena is the size of the game; the view is the size of the screen, which is
    // all the simulation ever needs to know about the screen (it is how spawning
    // knows what is off it). The frame loop writes the second on every resize.
    arena: { w: BALANCE.arena.w, h: BALANCE.arena.h },
    view: { w: BALANCE.arena.viewW, h: BALANCE.arena.viewH },

    player: {
      x: 0, y: 0, vx: 0, vy: 0,
      // Where the ship stood when the current step started. Every moving thing in
      // the world keeps a px/py of its own: the renderer paints between the two,
      // which is what makes a 120 Hz simulation look smooth on any display.
      px: 0, py: 0,
      r: spec.hitRadius,
      drawR: spec.drawRadius,   // the ship on screen is bigger than the ship that gets hurt
      maxSpeed: spec.maxSpeed,
      angle: -Math.PI / 2,
      thrust: 0,
      // How close the engines are to dropping their next puff of exhaust. The
      // wake is simulated (game/effects.js `engineTrail`), so it belongs to the
      // ship like its velocity does.
      exhaustTimer: 0,
      hull: spec.hull,
      invuln: 0,
      // The dash: how far it has left to cover, how long until the next one is
      // allowed, and which way it is going. All three are 0 on a fresh ship.
      dashLeft: 0,
      dashCd: 0,
      dashDirX: 0,
      dashDirY: 0,
      fireRate: spec.fireRate,
      fireTimer: 0,
      level: 1,
    },

    // Bullets and shards churn the most and nobody reads them in order, so they
    // live in pools. The crowd stays a plain array: its separation pass walks
    // pairs by index, which an unordered pool cannot promise.
    bullets: new Pool(makeBullet),
    shards: new Pool(makeShard),
    // The enemy's shots, pooled separately: they travel the other way and only ever
    // look for the ship. See game/enemyshots.js.
    enemyShots: new Pool(makeEnemyShot),
    enemies: [],
    // The collision broad phase. Rebuilt from the crowd every step, so it is
    // derived state that no run depends on.
    grid: new Grid(BALANCE.grid.cellSize),
    // The effect lists are pooled for the same reason: a single death sprays 30 sparks.
    particles: new Pool(makeParticle),
    rings: new Pool(makeRing),
    texts: new Pool(makeLabel),
    ambient: [],
  };
}

/** The one world this process plays with. */
export const world = createWorld();

/**
 * The two clocks that are not the run's, so they keep ticking through a hit-stop:
 * the trauma the frame is shaken by, and the guard on restarting after a death -
 * one belongs to the frame being drawn, the other to the player's finger.
 */
function tickFrameClocks(world, dt) {
  world.shake = Math.max(0, world.shake - BALANCE.screen.shakeDecay * dt);
  if (world.state === STATE.OVER) world.overTimer += dt;
}

/**
 * Advance the simulation by `dt` seconds - always `BALANCE.sim.step`, in the
 * browser; the tests are allowed to dial it. `input` is the descriptor from
 * input/index.js. Star layers are updated by the renderer, not here.
 *
 * Every system below writes px/py before it moves something, which is the whole
 * interpolation contract: a position may only change inside a step.
 *
 * Answers whether the step actually simulated anything. A hit-stop step does not,
 * and the frame loop has to know that: input handed to a frozen step was never
 * heard, so a dash pressed during one is still waiting when the world wakes up.
 */
export function stepWorld(dt, input) {
  world.steps++;
  world.time += dt;      // the session clock, which the eye animates on and a freeze does not stop

  if (world.freeze > 0) {
    // The freeze is spent here rather than in the frame loop on purpose: the
    // clock has already been paid for these steps, and a timer it did not pay for
    // would come back as a burst of catch-up steps the moment the world thawed.
    world.freeze = Math.max(0, world.freeze - dt);
    tickFrameClocks(world, dt);
    return false;
  }

  updateEffects(world, dt);
  if (world.state === STATE.PLAY) stepRun(dt, input);
  else updateAmbient(world, dt);

  tickFrameClocks(world, dt);
  return true;
}

function stepRun(dt, input) {
  world.elapsed += dt;

  updatePlayer(world, dt, input);
  updateWaves(world, dt);
  updateBullets(world, dt);
  if (!updateEnemyShots(world, dt)) return;   // a shot ended the run
  if (!updateEnemies(world, dt)) return;   // a contact ended the run
  updateShards(world, dt);
}
