// The handful of things about the balance table that more than one test file needs to
// know without writing a number in for it.
//
// (test/balance-tools.mjs would be the natural home, but `node --test` treats every
// file under test/ as a test file, so shared tooling lives here - NOTES, session 2.)
//
// Every one of these used to be written out per file, which meant that adding a kind
// updated four files or - the quieter version of the same bug - updated none of them
// and left a file asserting an arrangement the table no longer has. A kind that
// arrives as a pack is what finally proved it: the cheapest cost, the last unlock, and
// the longest wave all moved at once.

import { BALANCE } from '../../src/game/balance.js';
import { makeEnemy } from '../../src/game/kinds.js';
import { roomToSpare } from '../../src/game/waves.js';

/** The cheapest body the director can buy, however far the run has got. */
export const CHEAPEST = Math.min(...Object.values(BALANCE.kinds).map((kind) => kind.cost));

/** Which kind that is. A cost of 1 is only useful to a test that knows what it buys. */
export const CHEAPEST_KIND = Object.keys(BALANCE.kinds)
  .find((key) => BALANCE.kinds[key].cost === CHEAPEST);

/** The last second any kind unlocks at, which is what "late enough for anything" means. */
export const LAST_UNLOCK = Math.max(...Object.values(BALANCE.kinds).map((kind) => kind.from));

/** A moment past the last `from` in the table, in seconds. */
export function anyKindUnlockedAt() {
  return LAST_UNLOCK + 1;
}

/** Every kind that can arrive at `seconds`, as keys a crowd can be built out of. */
export function kindsAt(seconds) {
  return Object.keys(BALANCE.kinds).filter((key) => BALANCE.kinds[key].from <= seconds);
}

/**
 * What the cheapest body costs at `seconds`. This is the floor on what a wave can leave
 * unspent, which is a different question from what the cheapest body in the whole table
 * costs - a cheap kind that has not unlocked yet buys nothing.
 */
export function cheapestCostAt(seconds) {
  return Math.min(...kindsAt(seconds).map((key) => BALANCE.kinds[key].cost));
}

/**
 * Fill the crowd until the room left for the next wave is `want` points, or as near to
 * it as bodies come: the room left is always in [`want`, `want` + the cheapest cost).
 *
 * The dearest kind goes in first, so the crowd that does the filling is small enough
 * not to bump the ceiling on bodies on the way; the cheapest kind closes the last couple
 * of points, which is what makes the number exact rather than nearly.
 */
export function crowdUntilRoomIs(field, want) {
  const byPrice = Object.keys(BALANCE.kinds)
    .sort((a, b) => BALANCE.kinds[b].cost - BALANCE.kinds[a].cost);
  for (const kind of byPrice) {
    const cost = BALANCE.kinds[kind].cost;
    let guard = 0;
    while (roomToSpare(field) - cost >= want) {
      field.enemies.push(makeEnemy(field, kind, 300 + field.enemies.length * 6, 300));
      if (++guard > 4000) throw new Error('the crowd cannot be filled, so the costs are wrong');
    }
  }
  return roomToSpare(field);
}
