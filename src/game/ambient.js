// The slow, harmless crowd that drifts behind the title and game-over screens.
// It uses the enemy factory so the menu shows what the game is actually made of.

import { BALANCE } from './balance.js';
import { logic } from '../core/rng.js';
import { TAU } from '../core/math.js';
import { makeEnemy } from './enemies.js';

function makeAmbientEnemy(world, kind) {
  const enemy = makeEnemy(world, kind, logic.range(0, world.arena.w), logic.range(0, world.arena.h));
  enemy.speed *= BALANCE.ambient.speedFactor;
  const angle = logic.range(0, TAU);
  enemy.vx = Math.cos(angle) * enemy.speed;
  enemy.vy = Math.sin(angle) * enemy.speed;
  enemy.ambient = true;
  return enemy;
}

export function resetAmbient(world) {
  world.ambient.length = 0;
  for (let i = 0; i < BALANCE.ambient.kinds.length; i++) {
    world.ambient.push(makeAmbientEnemy(world, BALANCE.ambient.kinds[i]));
  }
}

export function updateAmbient(world, dt) {
  const spec = BALANCE.ambient;
  if (world.ambient.length < spec.target && logic.chance(dt * spec.refillChance)) {
    world.ambient.push(makeAmbientEnemy(world, logic.pick(spec.refillKinds)));
  }

  for (let i = 0; i < world.ambient.length; i++) {
    const enemy = world.ambient[i];
    enemy.px = enemy.x;
    enemy.py = enemy.y;
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.rot += enemy.spin * dt * spec.spinFactor;

    // Wrapping is a jump, not a move: the previous position comes with it, or the
    // renderer would paint the enemy sliding across the whole screen.
    const margin = enemy.r + spec.margin;
    if (enemy.x < -margin) { enemy.x = world.arena.w + margin; enemy.px = enemy.x; }
    else if (enemy.x > world.arena.w + margin) { enemy.x = -margin; enemy.px = enemy.x; }
    if (enemy.y < -margin) { enemy.y = world.arena.h + margin; enemy.py = enemy.y; }
    else if (enemy.y > world.arena.h + margin) { enemy.y = -margin; enemy.py = enemy.y; }
  }
}
