// The hangar as a shop: what the rack costs, and which of it this visit has paid for (PLAN 3.7).
//
// A run pays stardust (game/stardust.js) and the hangar is where it goes: four of the five ships
// are behind a price and the perks that join this screen later will be too. This file owns the
// money side of the rack - the prices, who owns what, and what happens when a number key is
// answered with a purchase - and nothing else about a ship, which stays in game/ships.js.
//
// Two promises:
//
//   **A price is only asked once.** `buyShipByIndex` is the only place dust is spent, and it goes
//   through `spendDust`, so the purse is moved by one function and the write of it is one write.
//   A ship already owned is not for sale again at a second price, and a free ship is never for
//   sale at all: the Wisp costs nothing to fly, in the hangar as in the save.
//
//   **Nobody may fly what nobody bought.** That rule lives *here* and not in game/ships.js, which
//   stays the plain "this is the body the next run arrives in" door the headless tools use to
//   measure any ship without grinding for it (tools/simulate.js --ship needle). Everything the
//   player presses reaches a pick through `pickShipByIndex`, and a locked ship is refused there.
//   The rack dims the row and prints the price; what the number key does about it is main.js's
//   business, not this file's.
//
// The purse is spent outside the step, from a keypress, so no run can be different because this
// file exists - the reference run does not know anyone is buying anything.

import { remember, section } from '../core/save.js';
import { setShip, shipAt, shipRow } from './ships.js';
import { spendDust } from './stardust.js';

/**
 * Which ships this visit has bought, read once when the visit opens (main.js), beside the purse
 * that was read for the same reason. A save that remembers nothing buys nothing, which is the
 * right answer: a first visit flies the ship that is free, and earns the rest.
 */
export function boughtShips() {
  return section('hangar', { ships: [] }).ships;
}

/** What the hangar asks for a ship, in stardust (BALANCE.ships). 0 is free, and free is yours. */
export function priceOf(id) {
  const cost = shipRow(id).cost;
  // A row without a price on it would be locked forever and then bought for `NaN`, which is the one
  // thing a purse must never be, so a missing or fractional price is said out loud (game/ships.js).
  if (!Number.isInteger(cost) || cost < 0) throw new Error('the ship ' + id + ' has no price');
  return cost;
}

/**
 * Does this list of bought ships cover `id`? Every free ship is covered by every list, so a save
 * that has bought nothing still flies the Wisp and a save that has bought everything still flies
 * it too. `game/hangar.js` and the rack both ask this, so both give the same answer.
 */
export function shipIsBought(owned, id) {
  return priceOf(id) === 0 || owned.indexOf(id) >= 0;
}

/** Is this ship this world's to fly? */
export function ownsShip(world, id) {
  return shipIsBought(world.ownedShips, id);
}

/**
 * The number key: "the next run flies this one". Answers 'picked', 'locked', or 'none' for a key
 * past the list, because the three get three different answers on the glass and a key that lies
 * about which one it got is worse than one that says nothing.
 */
export function pickShipByIndex(world, index) {
  const id = shipAt(index);
  if (id === null) return 'none';
  if (!ownsShip(world, id)) return 'locked';
  setShip(world, id);
  return 'picked';
}

/**
 * Shift and the number key: "buy this one". Answers 'bought', 'short' (the purse could not cover
 * it), 'owned' (there was nothing to buy), or 'none' for a key past the list - and only 'bought'
 * moves anything, so the interface has one sound to make and it makes it for that one.
 *
 * Buying is not picking: a purchase does not change what the next run flies, because that is what
 * the number key without the Shift is for and one key may not mean two things. The row lights up
 * when the player asks to fly what they now own.
 */
export function buyShipByIndex(world, index) {
  const id = shipAt(index);
  if (id === null) return 'none';
  if (ownsShip(world, id)) return 'owned';
  if (!spendDust(world, priceOf(id))) return 'short';
  // The order this list is in is the order the ships were bought in, and nothing reads it: the store
  // sorts its own copy on the way out (core/save.js, the `names` kind), so the next visit's list
  // comes out ordered. Nothing may compare the two lists directly.
  world.ownedShips.push(id);
  remember('hangar', { ships: world.ownedShips });
  return 'bought';
}
