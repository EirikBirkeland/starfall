// Score, experience, and levels.

import { BALANCE } from './balance.js';
import { PALETTE } from '../core/palette.js';
import { addText, burst, ring } from './effects.js';
import { cueChord } from './cues.js';

/** XP needed to go from `level` to the next one. */
export function xpNeededFor(level) {
  const p = BALANCE.progression;
  return Math.floor(p.levelBase + level * p.levelLinear + Math.pow(level, p.levelExponent));
}

/** Spends one level's worth of XP and hands out the reward. */
export function levelUp(world) {
  const ship = world.player;
  const prog = BALANCE.progression;
  const burstSpec = BALANCE.levelUp.burst;
  const ringSpec = BALANCE.levelUp.ring;
  const sound = BALANCE.levelUp.sound;

  world.xp -= world.xpNeed;
  ship.level++;
  world.xpNeed = xpNeededFor(ship.level);
  ship.fireRate = Math.min(BALANCE.player.fireRateMax,
    ship.fireRate * prog.fireRateGain + prog.fireRateFlat);

  addText(world, ship.x, ship.y - ship.r - prog.labelOffset, 'LV ' + ship.level + '  ' + prog.label, PALETTE.shard);
  burst(world, ship.x, ship.y, PALETTE.shard, burstSpec.count, burstSpec.speed, burstSpec.life);
  ring(world, ship.x, ship.y, PALETTE.shard, ringSpec.radius, ringSpec.speed, ringSpec.life);
  cueChord(sound.notes, sound.dur, sound.wave, sound.vol);
}
