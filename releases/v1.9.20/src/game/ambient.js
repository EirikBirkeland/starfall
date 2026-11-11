// The slow, harmless crowd that drifts behind the title and game-over screens.
// It uses the enemy factory so the menu shows what the game is actually made of.
//
// It keeps to the part of the arena the screen can see - the camera parks in the
// middle of the arena on the title screen - so the logo always has something
// living behind it without spreading decoration over a world of empty black.

import { BALANCE } from './balance.js';
import { logic } from '../core/rng.js';
import { TAU } from '../core/math.js';
import { makeEnemy } from './kinds.js';

/** Where the menu crowd may wander: the screen's worth of arena, with a gap. */
function crowdBox(world) {
  const margin = BALANCE.ambient.margin;
  const halfW = world.view.w / 2 + margin;
  const halfH = world.view.h / 2 + margin;
  return {
    x0: world.arena.w / 2 - halfW, x1: world.arena.w / 2 + halfW,
    y0: world.arena.h / 2 - halfH, y1: world.arena.h / 2 + halfH,
  };
}

function makeAmbientEnemy(world, kind) {
  const box = crowdBox(world);
  const enemy = makeEnemy(world, kind, logic.range(box.x0, box.x1), logic.range(box.y0, box.y1));
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
    const box = crowdBox(world);
    const margin = enemy.r + BALANCE.ambient.margin;
    if (enemy.x < box.x0 - margin) { enemy.x = box.x1 + margin; enemy.px = enemy.x; }
    else if (enemy.x > box.x1 + margin) { enemy.x = box.x0 - margin; enemy.px = enemy.x; }
    if (enemy.y < box.y0 - margin) { enemy.y = box.y1 + margin; enemy.py = enemy.y; }
    else if (enemy.y > box.y1 + margin) { enemy.y = box.y0 - margin; enemy.py = enemy.y; }
  }
}
