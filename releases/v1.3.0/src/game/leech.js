// Leech (PLAN 3.5): every body the ship brings down is worth something back, and what it
// gives back is the one thing a run cannot buy anywhere else - a hull.
//
// Everything else in the deck makes the ship hurt the crowd better. This is the first card
// that gives anything *to* the ship, and the second thing in the game to hand out hull after
// an elite's gift (game/elite.js), which it borrows the light and the sound of on purpose:
// a hull coming back looks the same whoever paid for it.
//
// Four decisions live here, and each of them has a test:
//
//   **Kills buy it, and only the run's own kills.** `feedLeech` is called from `killEnemy`
//     (game/enemies.js) where the kill is credited, which is the same door the score and the
//     shards come in by: a drifter that came apart in a bomber's blast is not the run's doing
//     and feeds nothing, and however the run lit the fuse - a shot, a bolt, a drone, a nova
//     front, a fire, a body that came apart cold - it counts exactly once.
//
//   **Counting and paying are different jobs.** `feedLeech` only counts; `updateLeech`, run at
//     the end of every step of the run (game/world.js), is the one place a hull changes hands.
//     That is what makes a rank taken in the middle of a pile worth itself at once - the new,
//     cheaper price is read on the next step and the bodies already in hand buy it - and it
//     means a hull is always handed back at the same point in a step, after everything that
//     could have hurt the ship has had its turn, rather than wherever a kill happened to land.
//
//   **A charge that comes due while the ship is whole is held, not wasted.** The alternative -
//     "the leech only feeds a wounded ship" - leaves a run at full hull staring at a meter that
//     never moves, and healing at full hull throws the charge away after the run paid a level
//     for it. So the leech holds **one** charge and spends it on the next hull the arena takes
//     off you, which reads on screen as the hit being refunded: the pip goes down, the mint
//     light goes up, and the pip comes back on the step it was lost on. One charge and not
//     three, because more than one is hull the run is carrying rather than hull the run has
//     earned, and because the meter under the hull pips is one honest bar.
//
//   **The wait is measured in bodies, so it scales with the run's own gun.** A sixty-body wait
//     is three minutes of a slow first minute and eight seconds of a fifteen-minute crowd,
//     which sounds like a card that tunes itself. It does not, and the number that keeps it
//     honest is the cut per rank - `60 - 54 - 48 - 42 - 36` rather than PLAN's literal
//     `60 / rank` - because at twelve kills to a hull a late run would be paid back faster than
//     the crowd can take hull off it, and that is not an upgrade but a different game. See
//     `BALANCE.upgrades.leech` for the measurement, and NOTES session 40 for the two bots it
//     was measured on: this is a card a run that is being pushed around wants and a run that is
//     not has no use for, which is the right shape for a thing paid for in bodies.
//
// The arithmetic here spends no number out of the `logic` stream - the light of a heal does,
// through game/player.js `healPlayer`, like every other tell in the game - so the count, the
// price and the hold are all pure, and a run that heals is exactly as reproducible from its
// seed as one that never took the card.

import { BALANCE } from './balance.js';
import { healPlayer } from './player.js';
import { leechCostOf, rankOf } from './upgrades.js';

/** One hull, which is all a charge is ever worth, and all a wound ever costs. */
const ONE_HULL = 1;

/** A fresh, empty leech: no bodies counted, nothing held. */
export function newLeech() {
  return { kills: 0, held: 0 };
}

/** Put the leech back to empty. Called with the rest of the run's resetting. */
export function resetLeech(world) {
  world.leech.kills = 0;
  world.leech.held = 0;
}

/** Has this run taken the line at all. The meter under the hull pips says nothing until it has. */
export function hasLeech(world) {
  return rankOf(world, 'leech') > 0;
}

/**
 * One more body came down. Called by `killEnemy` with the kill already credited, so a run that
 * has not taken the line pays one compare here and nothing else.
 *
 * It only counts. And a charge already being held is not topped up: that charge is waiting for a
 * wound, and bodies brought down while it waits are the run's own business - which is what
 * `BALANCE.upgrades.leech.held` is, and what stops a run that never gets clipped from banking a
 * row of free hits.
 */
export function feedLeech(world) {
  if (leechCostOf(world) <= 0) return;
  const leech = world.leech;
  if (leech.held >= BALANCE.upgrades.leech.held) return;
  leech.kills++;
}

/**
 * One step of the leech, at the end of a step in which everything that could hurt the ship has
 * had its turn (game/world.js). Two things happen here and in this order: a charge that has
 * been paid for is taken, and a charge that is being held is spent.
 *
 * Every whole price in the count is a hull, which is normally one and more only when a crowd
 * came down at once - a nova front through a knot, a shatter chain - and a run sitting at one
 * of three hull can genuinely be owed two of them. What it cannot be owed is a pile: once the
 * ship is whole the rest of the count is thrown away with the one charge it is holding, which
 * is the same rule `feedLeech` applies while a charge is held. A hull is never handed back above
 * the cap, and never to a run that has ended - stepRun is not called once the ship is gone, and
 * the dead are not owed a refund.
 */
export function updateLeech(world) {
  const leech = world.leech;
  const cost = leechCostOf(world);
  if (cost <= 0) return;

  while (leech.kills >= cost) {
    // The price, not the whole count: sixty-one bodies is a hull and one body towards the next.
    leech.kills -= cost;
    if (healPlayer(world, ONE_HULL) > 0) continue;
    // Whole, so there was nothing to fill: hold it, and let the bodies past this price go.
    leech.held += 1;
    leech.kills = 0;
    break;
  }

  if (leech.held > 0 && healPlayer(world, ONE_HULL) > 0) leech.held = 0;
}
