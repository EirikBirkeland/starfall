// The enemy's shots: travel, despawn, and what one costs the ship.
//
// These are the mirror of game/bullets.js and deliberately not part of it. The
// player's bullets go out and look for the crowd, which is why that file owns the
// collision grid; these go out and look for one thing - the ship - so a shot costs
// one distance test and never needs the grid at all. They are also warm, always:
// anything that can hurt you is (PLAN section 4).
//
// Every number that says how fast and how big a particular shot is belongs to the
// kind that fired it (see `spit.shot` in balance.js), because a spitter's spit and
// whatever comes later are not the same bullet. What lives here is only what every
// enemy shot shares: where it stops existing, and what it does when it lands.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { dist2 } from '../core/math.js';
import { burst } from './effects.js';
import { hitPlayer, isInvulnerable } from './player.js';
import { hurtByShot } from './tally.js';
import { crowdSpeedOf } from './challenges.js';

/** The shape of an enemy shot. Every spawner writes every one of these fields. */
export function makeEnemyShot() {
  return { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, life: 0, r: 0, color: '', from: '', caged: false };
}

/**
 * Send one enemy shot out of (x, y) along the unit vector (dx, dy). `spec` is the
 * firing kind's own `shot` numbers: `speed`, `radius`, `life`, `color`, and `caged`.
 * `from` is the kind that fired it, which is the only way anybody can say afterwards who put a
 * hole in the ship (game/tally.js); a shot nobody claims is blamed on nothing.
 *
 * `caged` says whose room the shot belongs to. A boss fights you inside a cage it closed round
 * the duel (game/field.js) and the ship cannot leave it, so a wall of the boss's own making that
 * sailed straight through that wall would be a promise with a hole in it: the far side of the
 * room would be free for nothing and half the ring would be wandering about outside the fight.
 * A caged shot stops at the live box. A spitter's spit is not caged, because the spitter was
 * never kept in it either.
 */
export function enemyShotAt(world, x, y, dx, dy, spec, from) {
  const shot = world.enemyShots.spawn();
  shot.x = x;
  shot.px = x;
  shot.y = y;
  shot.py = y;
  shot.vx = dx * spec.speed * crowdSpeedOf(world);
  shot.vy = dy * spec.speed * crowdSpeedOf(world);
  shot.life = spec.life;
  shot.r = spec.radius;
  shot.color = spec.color;
  shot.from = from || '';
  shot.caged = spec.caged === true;
  return shot;
}

/** Is this shot's centre outside the live box. Only ever asked about a caged shot. */
function pastTheRoom(world, shot) {
  const box = world.field;
  return shot.x < box.x0 || shot.x > box.x1 || shot.y < box.y0 || shot.y > box.y1;
}

/**
 * Fly every enemy shot, drop the ones that came to the end of the world or of their
 * life, and see if any of them reached the ship. Answers false when the run ended
 * part way through, so the caller can stop the rest of the frame.
 *
 * A ship that is invulnerable - the grace after a hit, or a dash - lets a shot
 * through without spending it: you can dash across a volley and both sides of that
 * are the thing you meant to do.
 */
export function updateEnemyShots(world, dt) {
  const spec = BALANCE.enemyShots;
  const margin = spec.despawnMargin;
  const left = -margin;
  const top = -margin;
  const right = world.arena.w + margin;
  const bottom = world.arena.h + margin;
  const ship = world.player;
  const shots = world.enemyShots;

  for (let i = shots.count - 1; i >= 0; i--) {
    const shot = shots.items[i];
    shot.px = shot.x;
    shot.py = shot.y;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;

    if (shot.life <= 0 || shot.x < left || shot.x > right || shot.y < top || shot.y > bottom) {
      shots.killAt(i);
      continue;
    }

    if (shot.caged && pastTheRoom(world, shot)) {
      // The room's own edge, and not the arena's: light does not go through a wall the ship
      // cannot (game/field.js, and game/beams.js clips to the same box for the same reason).
      const wall = spec.wall;
      burst(world, shot.x, shot.y, shot.color, wall.count, wall.speed, wall.life);
      shots.killAt(i);
      continue;
    }

    const reach = shot.r + ship.r;
    if (isInvulnerable(ship) || dist2(shot.x, shot.y, ship.x, ship.y) > reach * reach) continue;

    shots.killAt(i);
    const impact = spec.impact;
    burst(world, shot.x, shot.y, shot.color, impact.count, impact.speed, impact.life);
    hitPlayer(world, hurtByShot(shot));
    if (world.state !== STATE.PLAY) return false;
  }
  return true;
}
