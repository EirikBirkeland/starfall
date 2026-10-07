// A world parked in the middle of a run, for tests that need to put exactly one
// thing in exactly one place. The other door into the game is the fake browser
// (tools/headless/harness.js); this one skips it and drives `stepWorld` directly.
//
// One world per process, as ever: a test file that uses this plays in that world.

import { world, stepWorld } from '../../src/game/world.js';
import { STATE } from '../../src/game/state.js';
import { BALANCE } from '../../src/game/balance.js';
import { resetRun } from '../../src/game/run.js';
import { makeEnemy } from '../../src/game/kinds.js';
import { setSeed } from '../../src/core/rng.js';

/** Start a run with nothing in it but what the test adds. */
export function scriptedRun(seed) {
  setSeed(seed);
  resetRun(world);
  world.state = STATE.PLAY;
  // The ship is not what these tests are about: it cannot be hurt, and no crowd
  // arrives unless the test calls for one.
  world.player.invuln = Infinity;
  world.spawnTimer = Infinity;
  return world;
}

/** Put an enemy of `type` at (x, y), standing still. */
export function enemyAt(type, x, y, hp) {
  const enemy = makeEnemy(world, type, x, y, hp === undefined ? null : { hp: hp });
  enemy.speed = 0;
  enemy.spin = 0;
  world.enemies.push(enemy);
  return enemy;
}

/** A shot that is already in flight, written field by field like any spawner must. */
export function bulletFlyingToward(x, y, vx, vy) {
  const bullet = world.bullets.spawn();
  bullet.x = x;
  bullet.y = y;
  bullet.px = x;
  bullet.py = y;
  bullet.vx = vx;
  bullet.vy = vy;
  bullet.life = BALANCE.bullets.life;
  bullet.dmg = BALANCE.bullets.damage;
  return bullet;
}

/** One step of the game's own fixed step. `input` says what the ship is doing. */
export function stepTheWorld(input) {
  return stepWorld(BALANCE.sim.step, Object.assign({
    moveX: 0, moveY: 0, moving: false,
    aimX: world.player.x, aimY: world.player.y - 100, firing: false, dash: false,
  }, input));
}

/**
 * Hold the same controls for `seconds` of fixed steps and report the ship after
 * every one of them: [{ t, vx, vy, x, y }]. Tests that care about how long a
 * maneuver takes read the answer instead of guessing a number of frames.
 */
export function flyFor(seconds, input) {
  const track = [];
  let t = 0;
  while (t < seconds - 1e-9) {
    stepTheWorld(input);
    t += BALANCE.sim.step;
    const ship = world.player;
    track.push({
      t, vx: ship.vx, vy: ship.vy, x: ship.x, y: ship.y,
      dashLeft: ship.dashLeft, dashCd: ship.dashCd,
    });
  }
  return track;
}
