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
import { rebuildEnemyGrid, killEnemy, widestEnemyRadius } from './enemies.js';
import { burst } from './effects.js';
import { cueBeep } from './cues.js';

/** The shape of a bullet. `fire` writes every field, so nothing leaks between shots. */
export function makeBullet() {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, dmg: 0 };
}

/** The scratch list the grid fills, shared by every bullet in the step. */
const nearby = [];

export function updateBullets(world, dt) {
  const spec = BALANCE.bullets;
  const impact = spec.impact;
  const sound = spec.impactSound;
  const margin = spec.despawnMargin;
  const right = world.arena.w + margin;
  const bottom = world.arena.h + margin;
  const bullets = world.bullets;
  const grid = world.grid;
  // How far a hit can possibly come from: the widest enemy there is, plus the
  // bullet's own reach. A query with it finds everything the exact test below
  // can hit, and nothing much further away than that.
  const broadPhase = widestEnemyRadius() + spec.hitRadius;

  rebuildEnemyGrid(world);

  // Downwards, because killing a bullet drops the last live one into its hole
  // and that one has already been stepped.
  for (let i = bullets.count - 1; i >= 0; i--) {
    const bullet = bullets.items[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (bullet.life <= 0 || bullet.x < -margin || bullet.x > right || bullet.y < -margin || bullet.y > bottom) {
      bullets.killAt(i);
      continue;
    }

    grid.queryCircle(bullet.x, bullet.y, broadPhase, nearby);
    for (let n = 0; n < nearby.length; n++) {
      const enemy = nearby[n];
      // Something killed earlier in this step is still filed in the grid, and it
      // has already paid out its score, its shards and its split. Dead things
      // are not shootable.
      if (enemy.hp <= 0) continue;

      const reach = enemy.r + spec.hitRadius;
      if (dist2(bullet.x, bullet.y, enemy.x, enemy.y) > reach * reach) continue;

      enemy.hp -= bullet.dmg;
      enemy.flash = BALANCE.enemies.hitFlash;
      enemy.ix += bullet.vx * spec.knockback;
      enemy.iy += bullet.vy * spec.knockback;
      burst(world, bullet.x, bullet.y, BALANCE.kinds[enemy.type].color, impact.count, impact.speed, impact.life);
      bullets.killAt(i);

      if (enemy.hp <= 0) {
        killEnemy(world, enemy, true);
      } else {
        cueBeep(logic.range(sound.min, sound.max), sound.dur, sound.wave, sound.vol, sound.slide);
      }
      break;
    }
  }
}
