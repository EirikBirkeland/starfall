// The crowd: how the lot of them is stepped, and what a kill pays out. What a
// single kind *is* - its numbers, the way it walks, what its corpse makes - lives
// in game/kinds.js, and who arrives and when lives in game/waves.js. This file is
// the part that is about the crowd as a crowd: it asks a kind to walk, it never asks
// which kind it is.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { STATE } from './state.js';
import { dist2 } from '../core/math.js';
import { addText, burst, hitStop, ring, shakeIt, wreck } from './effects.js';
import { eliteSpoils } from './elite.js';
import { dropShards } from './pickups.js';
import { hitPlayer, isInvulnerable } from './player.js';
import { cueBeep } from './cues.js';
import { noteDeath, noteHit, hurtByBody } from './tally.js';
import { shieldSoak } from './shields.js';
import { isRooted } from './kinds.js';
import { melt, shatterOnDeath } from './chill.js';
import { detonateOnDeath } from './shock.js';
import { feedLeech } from './leech.js';
import { quarryFor } from './afterimage.js';

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
  // Whatever a shielder is holding over this body takes what it can of the hit first
  // (game/shields.js). Everything that hurts a body comes through here - a bullet, a
  // bomber's blast, whatever comes next - so there is no kind of damage that gets
  // past a shield by forgetting to ask.
  const hull = amount - shieldSoak(enemy, amount);
  // Only a hit that reached the hull flashes it white: a shield eating a shot is the
  // shield's news, and the shield is drawn with a light of its own.
  if (hull > 0) enemy.flash = BALANCE.enemies.hitFlash;
  enemy.hp -= hull;
  noteHit(world, enemy, hull);
  if (enemy.hp > 0) return false;
  killEnemy(world, enemy, byPlayer);
  return true;
}

/** Remove one enemy and pay out whatever it is worth. */
export function killEnemy(world, enemy, byPlayer) {
  removeEnemy(world, enemy);
  noteDeath(world, enemy, byPlayer);

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
    // The number that floats up is worth gold when the body that carried it was.
    addText(world, enemy.x, enemy.y - enemy.r - BALANCE.death.labelOffset, '+' + enemy.score,
      enemy.elite ? PALETTE.elite : stats.color);
    cueBeep(stats.sound.freq, stats.sound.dur, death.sound.wave,
      // A kind can ask for a quieter death than the crowd's default: twenty swarmlings
      // can come apart in one frame and the mix has no voice limiting yet (milestone 7).
      stats.sound.vol || death.sound.vol, death.sound.slide);
    // A kill the kind calls big gets the run to hold its breath for a moment.
    if (stats.death.shake) shakeIt(world, stats.death.shake);
    if (stats.death.hitStop) hitStop(world, stats.death.hitStop);
    dropShards(world, enemy.x, enemy.y, enemy.drop);
    // And a gold one is worth more than its score: a large shard, and a chance of a
    // hull back (game/elite.js).
    if (enemy.elite) eliteSpoils(world, enemy);
    // And a run that bought the leech is one body closer to a hull (game/leech.js). It comes
    // in here, with the score and the shards, because this is the one door a credited kill
    // comes through by: however the body came apart - a shot, a bolt, a drone, a nova front,
    // a fire, a corpse that was cold - it counts exactly once, and a body that came apart in a
    // blast nobody lit does not count at all.
    feedLeech(world);
  }

  // And whatever a corpse goes on to make - a tank leaves two hatchlings, a bomber
  // leaves a blast. That belongs to dying and not to being shot, so it happens
  // however the enemy came apart; `byPlayer` is passed on so a chain reaction the
  // player lit still pays out like one.
  //
  // The ice first, because it is the corpse's own doing and it spends itself on whatever was
  // standing there when it came apart - before whatever the kind was carrying (game/chill.js).
  //
  // And a body that wore fire *and* frost does neither of those things, because a run that owns
  // the synergy gets one bigger ending out of one death rather than the two of them stacked
  // (game/shock.js). It is asked first and it says whether it claimed the corpse.
  if (!detonateOnDeath(world, enemy, byPlayer)) shatterOnDeath(world, enemy, byPlayer);
  if (kind.onDeath) kind.onDeath(world, enemy, byPlayer);
}

/**
 * The one `step` handed to every behaviour this step (see game/kinds.js). Refilled
 * and reused, so stepping a crowd of six hundred allocates nothing.
 *
 * `ship` is the body's *quarry* rather than the ship, and is re-asked for every single
 * body just before it is walked: a body standing next to one of the images a dash left
 * behind chases that instead (game/afterimage.js). Nothing else about a step changes for
 * a body that has been fooled - the contact test below, the shoves, the separation and
 * everything that can hurt it all still go by the ship - because a decoy steals a body's
 * direction and none of its rest.
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
    // The frost warming through, one step of it (game/chill.js). It rides along here because
    // it is the body's own fading state, like the flash above, and the crowd is walked once a
    // step anyway - a run that never chills anything pays one compare per body.
    if (enemy.frost > 0) melt(world, enemy, dt);

    // How this one moves, and which way it points while doing it, is the kind's
    // business and nobody else's - but first it is told what it is moving *at*, which is
    // whatever it is standing nearest to out of the ship and the dash's images
    // (game/afterimage.js).
    step.ship = quarryFor(world, enemy);
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
        // Whatever can move absorbs the whole overlap between the pair - half each
        // when both of them can, all of it when only one of them can. A body bolted to
        // the floor (a sniper, game/kinds.js) gives way none of it, or a crowd walking
        // past would shovel it across the arena and the line it had drawn would move
        // with it.
        const free = (isRooted(enemy) ? 0 : 1) + (isRooted(other) ? 0 : 1);
        if (free === 0) continue;
        const share = (push * 2) / free;
        if (!isRooted(enemy)) {
          enemy.x += nx * share;
          enemy.y += ny * share;
        }
        if (!isRooted(other)) {
          other.x -= nx * share;
          other.y -= ny * share;
        }
      }
    }

    if (world.state === STATE.PLAY && !isInvulnerable(ship)) {
      // ship.r is the hit radius, deliberately far smaller than the ship you can
      // see (PLAN 3.1): flying close to the crowd is the game, not a mistake.
      const reach = enemy.r + ship.r;
      if (dist2(enemy.x, enemy.y, ship.x, ship.y) <= reach * reach) {
        hitPlayer(world, hurtByBody(enemy));
        if (world.state !== STATE.PLAY) return false;
      }
    }
  }
  return true;
}
