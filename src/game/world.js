// The world: every piece of simulation state in one object, plus the step that
// advances it. Nothing in this file touches the canvas, the DOM, or audio; a
// headless run can import this and play with no browser at all.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { clamp } from '../core/math.js';
import { Pool } from '../core/pool.js';
import { updateEffects, makeParticle, makeRing, makeLabel } from './effects.js';
import { updatePlayer } from './player.js';
import { updateBullets } from './bullets.js';
import { updateEnemies, updateSpawning } from './enemies.js';
import { updateShards } from './pickups.js';
import { updateAmbient } from './ambient.js';

function createWorld() {
  const spec = BALANCE.player;
  return {
    state: STATE.START,
    seed: 0,          // the seed this run is a function of; see core/rng.js
    time: 0,          // wall clock of the session, for animations
    elapsed: 0,       // this run's clock
    difficulty: 0,    // 0..1, driven by elapsed
    overTimer: 0,     // time since the run ended
    spawnTimer: BALANCE.runStart.spawnDelay,
    newBest: false,

    best: 0,
    score: 0,
    xp: 0,
    xpNeed: BALANCE.progression.firstLevelXp,
    kills: 0,
    shardsCollected: 0,
    shake: 0,

    /** The arena is the viewport for now; milestone 2 makes it a real world. */
    arena: { w: BALANCE.arena.defaultW, h: BALANCE.arena.defaultH },

    player: {
      x: 0, y: 0, vx: 0, vy: 0,
      r: spec.radius,
      speed: spec.speed,
      angle: -Math.PI / 2,
      thrust: 0,
      hull: spec.hull,
      invuln: 0,
      fireRate: spec.fireRate,
      fireTimer: 0,
      level: 1,
    },

    bullets: [],
    enemies: [],
    shards: [],
    // The effect lists live in pools: they are the most churn-heavy things in
    // the game, and nothing reads them in order.
    particles: new Pool(makeParticle),
    rings: new Pool(makeRing),
    texts: new Pool(makeLabel),
    ambient: [],
  };
}

/** The one world this process plays with. */
export const world = createWorld();

/**
 * Advance the simulation by `dt` seconds. `input` is the descriptor from
 * input/index.js. Star layers are updated by the renderer, not here.
 */
export function stepWorld(dt, input) {
  world.time += dt;
  updateEffects(world, dt);

  if (world.state === STATE.PLAY) stepRun(dt, input);
  else updateAmbient(world, dt);

  world.shake = Math.max(0, world.shake - BALANCE.screen.shakeDecay * dt);
  if (world.state === STATE.OVER) world.overTimer += dt;
}

function stepRun(dt, input) {
  world.elapsed += dt;
  world.difficulty = clamp(world.elapsed / BALANCE.enemies.difficultyRamp, 0, 1);

  updatePlayer(world, dt, input);
  updateSpawning(world, dt);
  updateBullets(world, dt);
  if (!updateEnemies(world, dt)) return;   // a contact ended the run
  updateShards(world, dt);
}
