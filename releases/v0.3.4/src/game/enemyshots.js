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

/** The shape of an enemy shot. Every spawner writes every one of these fields. */
export function makeEnemyShot() {
  return { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, life: 0, r: 0, color: '' };
}

/**
 * Send one enemy shot out of (x, y) along the unit vector (dx, dy). `spec` is the
 * firing kind's own `shot` numbers: `speed`, `radius`, `life`, `color`.
 */
export function enemyShotAt(world, x, y, dx, dy, spec) {
  const shot = world.enemyShots.spawn();
  shot.x = x;
  shot.px = x;
  shot.y = y;
  shot.py = y;
  shot.vx = dx * spec.speed;
  shot.vy = dy * spec.speed;
  shot.life = spec.life;
  shot.r = spec.radius;
  shot.color = spec.color;
  return shot;
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

    const reach = shot.r + ship.r;
    if (isInvulnerable(ship) || dist2(shot.x, shot.y, ship.x, ship.y) > reach * reach) continue;

    shots.killAt(i);
    const impact = spec.impact;
    burst(world, shot.x, shot.y, shot.color, impact.count, impact.speed, impact.life);
    hitPlayer(world);
    if (world.state !== STATE.PLAY) return false;
  }
  return true;
}
