// Bullets: travel, despawn, and the one test that matters, bullet against enemy.
//
// The hit test runs on the world's collision grid (core/grid.js): the crowd is
// filed into it once per step and every bullet asks it who is nearby, so a shot
// costs what is around it instead of the whole screen. Bullets themselves live in
// a pool - they are the most numerous thing in the game and nothing cares about
// their order.

import { BALANCE } from './balance.js';
import { logic } from '../core/rng.js';
import { dist2 } from '../core/math.js';
import { PALETTE } from '../core/palette.js';
import { damageEnemy, rebuildEnemyGrid } from './enemies.js';
import { widestEnemyRadius } from './kinds.js';
import { burst, spray } from './effects.js';
import { cueBeep } from './cues.js';

/**
 * The shape of a bullet. `shoot` writes every field, so nothing leaks between shots.
 *
 * `pierce` is what the shot has left of the pierce line when it leaves: one body past
 * the first, per rank, and one of them is spent on every body it goes through. `hits`
 * is who it has already touched - a shot at 620 px/s is inside a body for several steps
 * and a passed-through body it kept meeting would be shaved once per step otherwise.
 */
export function makeBullet() {
  return { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, life: 0, dmg: 0, pierce: 0, hits: [] };
}

/** The scratch list the grid fills, shared by every bullet in the step. */
const nearby = [];

/** Has this shot already been through this body? Small list, walked by identity. */
function alreadyThrough(bullet, enemy) {
  for (let i = 0; i < bullet.hits.length; i++) {
    if (bullet.hits[i] === enemy) return true;
  }
  return false;
}

export function updateBullets(world, dt) {
  const spec = BALANCE.bullets;
  const impact = spec.impact;
  const sound = spec.impactSound;
  const margin = spec.despawnMargin;
  const right = world.arena.w + margin;
  const bottom = world.arena.h + margin;
  const bullets = world.bullets;
  const grid = world.grid;
  const pierceShare = BALANCE.upgrades.pierce.share;
  // How far a hit can possibly come from: the widest enemy there is, plus the
  // bullet's own reach. A query with it finds everything the exact test below
  // can hit, and nothing much further away than that.
  const broadPhase = widestEnemyRadius() + spec.hitRadius;

  rebuildEnemyGrid(world);

  // Downwards, because killing a bullet drops the last live one into its hole
  // and that one has already been stepped.
  for (let i = bullets.count - 1; i >= 0; i--) {
    const bullet = bullets.items[i];
    bullet.px = bullet.x;
    bullet.py = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (bullet.life <= 0 || bullet.x < -margin || bullet.x > right || bullet.y < -margin || bullet.y > bottom) {
      bullets.killAt(i);
      continue;
    }

    grid.queryCircle(bullet.x, bullet.y, broadPhase, nearby);
    // A shot that is out of pierce is spent by the first body it meets and the loop is
    // done with it. One that is not keeps flying and may well find a second body in the
    // very same step, so the walk carries on over the candidates - which is why nothing
    // a kill can trigger is allowed to ask the grid a question here: `nearby` holds this
    // loop's answer until it is finished with it. (Nothing does: `blast` walks the crowd
    // directly, and it is the only thing a death goes on to do.)
    for (let n = 0; n < nearby.length; n++) {
      const enemy = nearby[n];
      // Something killed earlier in this step is still filed in the grid, and it
      // has already paid out its score, its shards and its split. Dead things
      // are not shootable.
      if (enemy.hp <= 0) continue;
      // A body this shot has already been through is not a target twice over.
      if (alreadyThrough(bullet, enemy)) continue;

      const reach = enemy.r + spec.hitRadius;
      if (dist2(bullet.x, bullet.y, enemy.x, enemy.y) > reach * reach) continue;

      bullet.hits.push(enemy);
      enemy.ix += bullet.vx * spec.knockback;
      enemy.iy += bullet.vy * spec.knockback;
      burst(world, bullet.x, bullet.y, BALANCE.kinds[enemy.type].color, impact.count, impact.speed, impact.life);
      const killed = damageEnemy(world, enemy, bullet.dmg, true);
      // Only a hit that did not kill makes the impact sound; a kill plays its own.
      if (!killed) cueBeep(logic.range(sound.min, sound.max), sound.dur, sound.wave, sound.vol, sound.slide);

      if (bullet.pierce <= 0) {
        bullets.killAt(i);
        break;
      }
      // The shot is through it and still flying, lighter for the trouble (the pierce
      // line's share, so a rank buys depth into a column rather than multiplying the
      // gun), and it remembers this body on its way past.
      bullet.pierce -= 1;
      bullet.dmg *= pierceShare;
      const pass = BALANCE.upgrades.pierce.pass;
      spray(world, bullet.x, bullet.y, PALETTE.bullet, pass.count, pass.speed, pass.life,
        Math.atan2(bullet.vy, bullet.vx), pass.spread);
    }
  }
}
