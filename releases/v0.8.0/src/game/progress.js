// Experience and levels. A level is not a number any more: it is the pause where the
// run is built, so all this file does is bank the experience, say that a level
// happened, and hand the choice over to game/upgrades.js.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { addText, burst, ring } from './effects.js';
import { cueChord } from './cues.js';
import { refreshOffer } from './upgrades.js';

/** XP needed to go from `level` to the next one (PLAN 3.6). */
export function xpNeededFor(level) {
  const p = BALANCE.progression;
  return Math.round(p.base + level * p.linear + level * level * p.quad);
}

/** What the next level costs. `resetRun` and `world` both start from here. */
export function firstLevelXp() {
  return xpNeededFor(1);
}

/**
 * One level earned: the bank is settled, the ship is told, the run is noticed, and
 * the cards come out. `pendingLevels` is what a single fat pickup can be worth -
 * a large shard has paid for three levels at once - and each of them gets its own
 * choice, one after the other.
 */
export function levelUp(world) {
  const ship = world.player;
  const prog = BALANCE.progression;
  const burstSpec = BALANCE.levelUp.burst;
  const ringSpec = BALANCE.levelUp.ring;
  const sound = BALANCE.levelUp.sound;

  world.xp -= world.xpNeed;
  ship.level++;
  world.xpNeed = xpNeededFor(ship.level);

  // Above the ship as you see it, not above the much smaller hit radius.
  addText(world, ship.x, ship.y - ship.drawR - prog.labelOffset, 'LEVEL ' + ship.level, PALETTE.shard);
  burst(world, ship.x, ship.y, PALETTE.shard, burstSpec.count, burstSpec.speed, burstSpec.life);
  ring(world, ship.x, ship.y, PALETTE.shard, ringSpec.radius, ringSpec.speed, ringSpec.life);
  cueChord(sound.notes, sound.dur, sound.wave, sound.vol);

  world.pendingLevels++;
  refreshOffer(world);
}
