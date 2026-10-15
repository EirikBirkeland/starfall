// The hangar as a shop: what the rack costs, and which of it this visit has paid for (PLAN 3.7).
//
// A run pays stardust (game/stardust.js) and the hangar is where it goes: four of the five ships
// are behind a price and the four perks standing next to them are behind ranks of prices - plating
// on the hull, a richer dust, a table dealt again, a line cut out (the table in game/perks.js).
// This file owns the money side of both racks - the prices, who owns what, and what happens when
// a number key is answered with a purchase - and nothing else about a ship or a perk, which stay
// in game/ships.js and game/perks.js.
//
// Two promises:
//
//   **A price is only asked once.** `buyRackByIndex` is the single door the purchase keys come
//   through, and it goes through `spendDust`, so the purse is moved by one function and the write
//   of it is one write. A ship already owned is not for sale again at a second price, a perk at
//   the top of its ladder has nothing left on its row to sell, and a free ship is never for sale
//   at all: the Wisp costs nothing to fly, in the hangar as in the save.
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
import { maxRankOf, perkAt, perkLedger, perkRow, rankOf } from './perks.js';
import { SHIPS, setShip, shipAt, shipRow } from './ships.js';
import { spendDust } from './stardust.js';

/**
 * Which ships this visit has bought, read once when the visit opens (main.js), beside the purse
 * that was read for the same reason. A save that remembers nothing buys nothing, which is the
 * right answer: a first visit flies the ship that is free, and earns the rest.
 */
export function boughtShips() {
  return section('hangar', { ships: [] }).ships;
}

/**
 * Which of the perk ranks this visit has bought, the same way: read once when the visit opens,
 * straight from the save, name to rank count. Nothing here knows how many ranks a row may hold -
 * the table in game/perks.js does, and it is the one who turns this into `world.perkRanks`,
 * clamping any count a newer page may have written.
 */
export function boughtPerks() {
  return section('hangar', { ships: [], perks: {} }).perks;
}

/** What the hangar asks for a ship, in stardust (BALANCE.ships). 0 is free, and free is yours. */
export function priceOf(id) {
  const cost = shipRow(id).cost;
  // A row without a price on it would be locked forever and then bought for `NaN`, which is the one
  // thing a purse must never be, so a missing or fractional price is said out loud (game/ships.js).
  if (!Number.isInteger(cost) || cost < 0) throw new Error('the ship ' + id + ' has no price');
  return cost;
}

/** What the hangar asks for the next rank of a perk, in stardust (BALANCE.perks). The ladder is
    a price per rank - `cost[held]` is what the row asks for once it holds `held` ranks - and a
    row without a price for the rank being asked would spend the purse for `NaN`, which is the one
    thing a purse must never be, so it is said out loud the way `priceOf` says it. */
export function perkPriceOf(id, held) {
  const row = perkRow(id);
  if (typeof held !== 'number' || !Number.isInteger(held) || held < 0)
    throw new Error('the perk ' + id + ' holds no rank ' + held);
  const cost = row.cost[held];
  if (cost === undefined || !Number.isInteger(cost) || cost < 0)
    throw new Error('the perk ' + id + ' has no price for rank ' + (held + 1));
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
 * Shift and the number key: "buy the row it names". The rack is one numbered list - the ships in
 * the order the hangar prints them and the perks in the order the table lists them after them -
 * so one number reaches one row through one door, and the words it answers with are the same on
 * either side of it: 'bought' moved the purse and saved the row, 'short' kept the purse and the
 * row exactly where they were, and 'none' is a key no rack owns a row for. Two answers belong to
 * one side each: 'owned' is a ship already bought (the purse does not sell it twice) and 'maxed'
 * is a perk's ladder reached, where there is nothing left on the row to sell.
 *
 * Buying is not picking: a purchase of a ship does not change what the next run flies (that is
 * the number key without the Shift, and one key may not mean two things), and a purchase of a
 * perk changes the run that comes *next* (game/run.js clears the table it flies on) and never
 * the one flying.
 */
export function buyRackByIndex(world, index) {
  if (index < SHIPS.length) return buyShipRow(world, index);
  return buyPerkRow(world, index - SHIPS.length);
}

/**
 * What the row a rack index names would cost, or null when there is nothing on it to sell: a ship the
 * purse already has, a ladder reached, a row no rack has.
 *
 * This is the question the shop asks *before* it asks the player. A tap on a row that costs stardust puts
 * the row into "tap again to buy" (main.js `pressHangarPanel`), and an ask that could not have been paid
 * for is a question the shop knew the answer to - so it asks only when the price is real, and the price it
 * would charge is the same number the row is already printing.
 */
export function priceAt(world, index) {
  if (index < SHIPS.length) {
    const id = shipAt(index);
    if (id === null || ownsShip(world, id)) return null;
    return priceOf(id);
  }
  const perk = perkAt(index - SHIPS.length);
  if (perk === null) return null;
  const held = rankOf(world, perk.id);
  if (held >= maxRankOf(perk.id)) return null;
  return perkPriceOf(perk.id, held);
}

/** The ship half of the rack: what `buyRackByIndex` used to be, for the rows that have a price
    and an owner instead of a ladder. */
function buyShipRow(world, index) {
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

/** The perk half of the rack: a rank off the ladder the purse can cover. The count the save held
    the moment the purse was paid is what the save is written again with - and it is written in
    the shape the ledger prints it (game/perks.js `perkLedger`: the table's ids, the table's
    order, clamped to the table's ladder), so a count the table has never heard of does not ride
    along into the write. */
function buyPerkRow(world, index) {
  const perk = perkAt(index);
  if (perk === null) return 'none';
  const held = rankOf(world, perk.id);
  if (held >= maxRankOf(perk.id)) return 'maxed';
  if (!spendDust(world, perkPriceOf(perk.id, held))) return 'short';
  world.perkRanks[perk.id] = held + 1;
  remember('hangar', { perks: perkLedger(world) });
  return 'bought';
}
