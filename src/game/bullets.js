// Bullets: travel, despawn, and the one test that matters, bullet against enemy.

import { BALANCE } from './balance.js';
import { logic } from '../core/rng.js';
import { dist2 } from '../core/math.js';
import { burst } from './effects.js';
import { cueBeep } from './cues.js';
import { killEnemy } from './enemies.js';

export function updateBullets(world, dt) {
  const spec = BALANCE.bullets;
  const impact = spec.impact;
  const sound = spec.impactSound;
  const margin = spec.despawnMargin;
  const right = world.arena.w + margin;
  const bottom = world.arena.h + margin;

  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const bullet = world.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (bullet.life <= 0 || bullet.x < -margin || bullet.x > right || bullet.y < -margin || bullet.y > bottom) {
      world.bullets.splice(i, 1);
      continue;
    }

    for (let j = world.enemies.length - 1; j >= 0; j--) {
      const enemy = world.enemies[j];
      const reach = enemy.r + spec.hitRadius;
      if (dist2(bullet.x, bullet.y, enemy.x, enemy.y) > reach * reach) continue;

      enemy.hp -= bullet.dmg;
      enemy.flash = BALANCE.enemies.hitFlash;
      enemy.ix += bullet.vx * spec.knockback;
      enemy.iy += bullet.vy * spec.knockback;
      burst(world, bullet.x, bullet.y, BALANCE.kinds[enemy.type].color, impact.count, impact.speed, impact.life);
      world.bullets.splice(i, 1);

      if (enemy.hp <= 0) {
        killEnemy(world, j, true);
      } else {
        cueBeep(logic.range(sound.min, sound.max), sound.dur, sound.wave, sound.vol, sound.slide);
      }
      break;
    }
  }
}
