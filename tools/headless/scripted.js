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
import { defaultWeapon, setWeapon, weaponOf } from '../../src/game/weapons.js';
import { setSeed } from '../../src/core/rng.js';

/**
 * Start a run with nothing in it but what the test adds.
 *
 * The primary is put back on the rack too: a scripted run flies the default gun whatever
 * the last test in this file chose, because a test that inherits another test's weapon is
 * a test that changes when the file is reordered. A test that wants a different gun says
 * so with `setWeapon`.
 */
export function scriptedRun(seed) {
  setSeed(seed);
  resetRun(world);
  setWeapon(world, defaultWeapon());
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

/**
 * A shot that is already in flight, written field by field like any spawner must.
 *
 * Its numbers are the ship's own weapon's, because that is what a shot in the air is:
 * `speed`, `life` and `knock` came out of the gun, and a recycled shot that forgot one of
 * them would hand a plain shot the last one's - which is the contract every spawner in
 * the game signs, and the reason this is a function and not an object literal (the same
 * trap caught `pierce` and `bounce` when they were new).
 */
export function bulletFlyingToward(x, y, vx, vy, pierce, turns) {
  const gun = weaponOf(world);
  // A bullet planted in the air is a bullet gun's bullet: its speed, its reach and its shove
  // come from the gun being flown, and a gun that throws no bullets has none of them to give.
  if (gun.chain !== undefined) throw new Error('the arc throws no bullets to plant');
  const bullet = world.bullets.spawn();
  bullet.x = x;
  bullet.y = y;
  bullet.px = x;
  bullet.py = y;
  bullet.vx = vx;
  bullet.vy = vy;
  bullet.life = gun.life;
  bullet.dmg = gun.damage;
  bullet.knock = gun.knockback;
  // Including what the gun had of the two lines that let a shot survive a hit, which a
  // recycled shot would otherwise bring with it from whatever the gun last fired.
  bullet.pierce = pierce === undefined ? 0 : pierce;
  bullet.bounce = turns === undefined ? 0 : turns;
  // And that it was not thrown by a loaded gun, which is the one field of a shot a test is
  // unlikely to set on purpose and the one a recycled shot would otherwise bring with it.
  bullet.charged = false;
  // And that it did not come off a turret, which is the one other thing that throws a shell in this
  // game and the one field of a shot a test is unlikely to set on purpose (game/bullets.js).
  bullet.turret = false;
  bullet.hits.length = 0;
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
