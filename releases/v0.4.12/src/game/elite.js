// An elite (PLAN 3.3): not a kind, a flag.
//
// What an elite *is* - four times the hull, a fifth faster, three times the spawn
// budget - is a handful of multipliers on whichever kind the wave director rolled,
// and game/kinds.js applies them as it builds the body. What is left, and all this
// file holds, are the two decisions nobody else can make:
//
//   whether a wave is carrying one at all - one roll of the logic stream, and only
//   once the run is eight minutes old;
//   and what it leaves behind for whoever killed it: a large shard, and the chance
//   of a hull back.
//
// Both are gated on the run's clock, so a seed that ends before 8:00 - which is
// every seed the simulation bot has ever played - cannot notice that any of this
// exists.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { logic } from '../core/rng.js';
import { dropBigShard } from './pickups.js';
import { healPlayer } from './player.js';

/**
 * Is the wave being bought right now carrying an elite? One roll of the stream, and
 * no roll at all before PLAN's 8:00. Exported for the tests, which want to say "the
 * stream does not move before then" without playing eight minutes of a run.
 */
export function rollElite(world) {
  const spec = BALANCE.elite;
  if (world.elapsed < spec.from) return false;
  return logic.next() < spec.chance;
}

/**
 * What an elite's death is worth to whoever did it: a large shard, and a chance of
 * one of the ship's hull back. The heal is only rolled when there is a hull to fill,
 * so an elite never spends its gift on a ship that is already whole. Answers whether
 * the ship was healed, which is what a test asks.
 */
export function eliteSpoils(world, enemy) {
  const spec = BALANCE.elite;
  dropBigShard(world, enemy.x, enemy.y);

  const ship = world.player;
  // A ship that is gone cannot be handed anything, and a whole one has no room for it.
  if (world.state !== STATE.PLAY) return false;
  if (ship.hull >= ship.maxHull) return false;
  if (logic.next() >= spec.heal.chance) return false;
  healPlayer(world, spec.heal.hull);
  return true;
}
