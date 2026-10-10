// Stardust: what a run leaves behind that the next one can spend (PLAN 3.7).
//
// A score belongs to the run that made it and then goes on the shelf as a best; stardust is the
// same achievement made into money, and it is the first of the between-run numbers. It is stored
// in the save document (`meta.dust`), read once when the visit opens, and it is what the hangar
// buys its ships and perks with (game/hangar.js).
//
// Two promises, which are the whole reason this is a file and not a line in game/run.js:
//
//   **One rule, in one place.** What a run is worth is `dustForRun` and `BALANCE.stardust`, and
//   nothing else is allowed to do stardust arithmetic. A reward that is worked out twice is a
//   reward that pays two different numbers depending on who is asking. And the purse has one
//   door each way: `payForRun` fills it and `spendDust` empties it, which is the only reason
//   `game/hangar.js` can buy a ship without knowing how the purse is kept.
//
//   **A run is paid once for what it earned.** A won run can be handed back and flown on
//   (game/run.js `continueRun`), and the score keeps climbing after the win, so paying "whatever
//   the run is worth" at every ending would pay a continued run for the same score twice.
//   `world.dustPaid` is what this run has already been paid out, and an ending pays the difference
//   and nothing more - which also means a run that wins, flies on for five minutes and then goes
//   down is paid for those five minutes and not for the win again.
//
// Nothing here is written during a step: a run's worth is read at an ending, from numbers that
// only grow (`score`, `bossesDown`, `won`), so no run can be different because this file exists -
// the same bargain game/tally.js makes about the numbers it keeps.

import { BALANCE } from './balance.js';
import { remember, section } from '../core/save.js';
import { dustGainOf } from './perks.js';

/**
 * What the purse stood at when this visit opened, or 0 when the document had nothing to say.
 *
 * Once per visit, next to the best score (main.js): `core/save.js` reads storage again on every
 * call, which is exactly what it should not be asked to do in a frame.
 */
export function storedDust() {
  return section('meta', { dust: 0 }).dust;
}

/**
 * Everything this run has earned, whether or not it has been paid yet. Every number it reads is
 * one a run can only ever add to, which is what makes "pay the difference" a sound rule.
 *
 * The Gleaner's ranks are multiplied in here and nowhere else (game/perks.js), because this is the
 * one line that says what a run is worth: a rank then pays on the score, on the fights and on the
 * win at once, and cannot be forgotten by the next reward somebody adds below. Rounded, because a
 * purse is spent in whole stardust and `payForRun` pays the difference between two of these - a
 * fractional worth would be a purse that pays `NaN` the moment anybody adds it to a price.
 */
export function dustForRun(world) {
  const spec = BALANCE.stardust;
  const fromScore = Math.floor(world.score / spec.perScore);
  const fromBosses = world.bossesDown * spec.perBoss;
  const forWinning = world.won ? spec.won : 0;
  return Math.round((fromScore + fromBosses + forWinning) * dustGainOf(world));
}

/**
 * Pay the run whatever it has earned and has not been paid for, and bank it (core/save.js).
 * Returns what this added to the purse, which is 0 for a run that has already been paid in full -
 * and the caller does not have to care, because the card shows what the run earned as a whole
 * (`dustForRun`), not what the last ending happened to add.
 *
 * A run that earned nothing writes nothing, which keeps a quit-in-one-second run from being a
 * write to storage at all.
 */
export function payForRun(world) {
  const earned = dustForRun(world);
  const owed = earned - world.dustPaid;
  if (owed <= 0) return 0;
  world.dustPaid = earned;
  world.dust += owed;
  remember('meta', { dust: world.dust });
  return owed;
}

/**
 * Pay money *out* of the purse, which is the other half of what a purse is (PLAN 3.7: the dust a
 * run pays is the dust the hangar spends). Answers whether the purse could cover it, and takes
 * nothing when it cannot: a purchase the player cannot afford is not a partial purchase, and it is
 * certainly not a discount.
 *
 * Like the pay, this does not care whether the write got there (core/save.js answers false for a
 * browser that will not store, and for a document from a newer build): the purse for the visit
 * moves either way, so the glass stays honest about what the player has.
 */
export function spendDust(world, amount) {
  if (amount > world.dust) return false;
  world.dust -= amount;
  remember('meta', { dust: world.dust });
  return true;
}
