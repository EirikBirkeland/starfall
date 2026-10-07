// The slow, harmless crowd that drifts behind the title and game-over screens.
// It uses the enemy factory so the menu shows what the game is actually made of.

import { BALANCE } from './balance.js';
import { rand, randi, TAU } from '../core/math.js';
import { makeEnemy } from './enemies.js';

function makeAmbientEnemy(world, kind) {
  const enemy = makeEnemy(world, kind, rand(0, world.arena.w), rand(0, world.arena.h));
  enemy.speed *= BALANCE.ambient.speedFactor;
  const angle = rand(0, TAU);
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
  if (world.ambient.length < spec.target && Math.random() < dt * spec.refillChance) {
    const kind = spec.refillKinds[randi(0, spec.refillKinds.length - 1)];
    world.ambient.push(makeAmbientEnemy(world, kind));
  }

  for (let i = 0; i < world.ambient.length; i++) {
    const enemy = world.ambient[i];
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.rot += enemy.spin * dt * spec.spinFactor;

    const margin = enemy.r + spec.margin;
    if (enemy.x < -margin) enemy.x = world.arena.w + margin;
    else if (enemy.x > world.arena.w + margin) enemy.x = -margin;
    if (enemy.y < -margin) enemy.y = world.arena.h + margin;
    else if (enemy.y > world.arena.h + margin) enemy.y = -margin;
  }
}
