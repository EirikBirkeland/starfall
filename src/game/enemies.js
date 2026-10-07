// The crowd: how the lot of them is stepped, and what a kill pays out. What a
// single kind *is* - its numbers, the way it walks, what its corpse makes - lives
// in game/kinds.js, and who arrives and when lives in game/waves.js. This file is
// the part that is about the crowd as a crowd: it asks a kind to walk, it never asks
// which kind it is.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { dist2 } from '../core/math.js';
import { addText, burst, hitStop, ring, shakeIt, wreck } from './effects.js';
import { dropShards } from './pickups.js';
import { hitPlayer, isInvulnerable } from './player.js';
import { cueBeep } from './cues.js';

/**
 * File the whole crowd in the world's collision grid. This is a snapshot for one
 * step, rebuilt before anything queries it; an enemy killed after the rebuild
 * stays in it until the next one, so callers skip what is already dead.
 */
export function rebuildEnemyGrid(world) {
  const grid = world.grid;
  grid.clear();
  for (let i = 0; i < world.enemies.length; i++) grid.insert(world.enemies[i]);
}

/** Take one enemy out of the crowd. Not finding it is a bug, not a no-op. */
function removeEnemy(world, enemy) {
  const at = world.enemies.indexOf(enemy);
  if (at < 0) throw new Error('that enemy is not in the crowd, so it cannot be killed twice');
  world.enemies.splice(at, 1);
}

/**
 * How many chunks a wreck throws: what its kind says, scaled by the body that
 * actually came apart. A tank hatchling is a small tank, so it makes a small mess.
 */
function chipsOf(stats, enemy) {
  return Math.max(1, Math.round(stats.death.debris * enemy.r / stats.radius));
}

/**
 * Wound one enemy by `amount`, and let it die if that was the last of its hull.
 * Answers whether it died, which is how a caller tells a hit from a kill: a shot
 * that killed plays the death and one that bounced off plays the impact.
 *
 * `byPlayer` says whose doing the death is, and it carries through to whatever the
 * corpse goes on to do - a chain reaction started by the player pays the player.
 */
export function damageEnemy(world, enemy, amount, byPlayer) {
  enemy.hp -= amount;
  enemy.flash = BALANCE.enemies.hitFlash;
  if (enemy.hp > 0) return false;
  killEnemy(world, enemy, byPlayer);
  return true;
}

/** Remove one enemy and pay out whatever it is worth. */
export function killEnemy(world, enemy, byPlayer) {
  removeEnemy(world, enemy);

  const kind = enemy.kind;
  const stats = kind.stats;
  const death = BALANCE.death;
  burst(world, enemy.x, enemy.y, stats.color, stats.death.particles, stats.death.speed, death.particleLife);
  wreck(world, enemy.x, enemy.y, stats.color, chipsOf(stats, enemy), stats.death.debrisSpeed, death.debrisLife);
  ring(world, enemy.x, enemy.y, stats.color, enemy.r * death.ringScale,
    stats.death.ringSpeed || death.ringSpeed, death.ringLife);

  if (byPlayer) {
    world.score += enemy.score;
    world.kills++;
    addText(world, enemy.x, enemy.y - enemy.r - BALANCE.death.labelOffset, '+' + enemy.score, stats.color);
    cueBeep(stats.sound.freq, stats.sound.dur, death.sound.wave, death.sound.vol, death.sound.slide);
    // A kill the kind calls big gets the run to hold its breath for a moment.
    if (stats.death.shake) shakeIt(world, stats.death.shake);
    if (stats.death.hitStop) hitStop(world, stats.death.hitStop);
    dropShards(world, enemy.x, enemy.y, enemy.drop);
  }

  // And whatever a corpse goes on to make - a tank leaves two hatchlings, a bomber
  // leaves a blast. That belongs to dying and not to being shot, so it happens
  // however the enemy came apart; `byPlayer` is passed on so a chain reaction the
  // player lit still pays out like one.
  if (kind.onDeath) kind.onDeath(world, enemy, byPlayer);
}

/**
 * The one `step` handed to every behaviour this step (see game/kinds.js). Refilled
 * and reused, so stepping a crowd of six hundred allocates nothing.
 */
const step = { world: null, ship: null, dt: 0, drag: 1 };

/**
 * Move the crowd, keep it from piling into one blob, and see if it touched the
 * ship. Returns false when the run ended part way through, so the caller can
 * stop the rest of the frame.
 */
export function updateEnemies(world, dt) {
  const ship = world.player;
  step.world = world;
  step.ship = ship;
  step.dt = dt;
  step.drag = Math.pow(BALANCE.enemies.separationDrag, dt);

  // Everyone starts the step where they stand, before anything is moved or shoved,
  // so that the renderer can put them between here and wherever this step ends up.
  for (const starting of world.enemies) {
    starting.px = starting.x;
    starting.py = starting.y;
  }

  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const enemy = world.enemies[i];
    if (enemy.flash > 0) enemy.flash -= dt;

    // How this one moves, and which way it points while doing it, is the kind's
    // business and nobody else's.
    enemy.kind.walk(enemy, step);

    // Soft separation, so the crowd spreads out instead of stacking.
    for (let j = i - 1; j >= 0; j--) {
      const other = world.enemies[j];
      const dx = enemy.x - other.x;
      const dy = enemy.y - other.y;
      const radii = enemy.r + other.r;
      const d2 = dx * dx + dy * dy;
      if (d2 > BALANCE.enemies.separationEpsilon && d2 < radii * radii) {
        const dist = Math.sqrt(d2);
        const push = (radii - dist) * BALANCE.enemies.separationPush;
        const nx = dx / dist;
        const ny = dy / dist;
        enemy.x += nx * push;
        enemy.y += ny * push;
        other.x -= nx * push;
        other.y -= ny * push;
      }
    }

    if (world.state === STATE.PLAY && !isInvulnerable(ship)) {
      // ship.r is the hit radius, deliberately far smaller than the ship you can
      // see (PLAN 3.1): flying close to the crowd is the game, not a mistake.
      const reach = enemy.r + ship.r;
      if (dist2(enemy.x, enemy.y, ship.x, ship.y) <= reach * reach) {
        hitPlayer(world, enemy);
        if (world.state !== STATE.PLAY) return false;
      }
    }
  }
  return true;
}
