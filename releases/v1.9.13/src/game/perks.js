// The perks (PLAN 3.7, the hangar's second rack): what a whole visit remembers, paid for in
// stardust between runs (the money itself is game/hangar.js). A perk is a number of ranks, bought
// one at a time, and every rank changes the run that comes next - never the one flying.
//
// PLAN lists six candidate perks; this table takes four. Two are deliberately not here, and it is
// better to say so where the list is than to let the absence be found:
//
//   a shield at the start - the arena already carries a second life line, hull, and a pip that
//   cannot be spent is a pip the Wisp, flying on three, does not feel one. Ranked hull (below)
//   spends the same dust on something the run can pay back;
//   a level of head start - the card ladder is a build, and a head start is a build someone else
//   played: the first run of a visit is the visit.
//
// The table is ids and names, in the order the hangar prints them: the five ships own keys 1-5,
// and the perks here own the keys that come after them (6-9). Effect and price live on the
// balance sheet (BALANCE.perks), the ranks a visit has bought in the save (`hangar.perks`), and
// the ranks flying out of it on `world.perkRanks` (read at boot, in main.js, out of the save).
// Nothing in this file spends or saves: it only tells what is what, which is the shape the other
// modules can lean on.
import { BALANCE } from './balance.js';

export const PERKS = [
  { id: 'hull', name: 'PLATING', blurb: 'one more pip before the crowd takes one' },
  { id: 'dust', name: 'GLEANER', blurb: 'what a run leaves behind, worth more' },
  { id: 'reroll', name: 'REROLL', blurb: 'the table is dealt again, one more time' },
  { id: 'banish', name: 'BANISH', blurb: 'one card cut from the run for good' },
];

/** The balance-sheet row a perk id names, and a loud answer if there is not one. Same bargain as
    game/ships.js `shipRow`: a row that quietly is not there is a perk that costs `undefined` and
    grants `undefined`, which is the one failure a shop must not be able to have. */
export function perkRow(id) {
  const row = BALANCE.perks[id];
  if (row === undefined) throw new Error('no perk is called ' + id);
  return row;
}

/** The perk a position on the perk rack names, counted the same way game/ships.js `shipAt` counts
    the ships - 0 is the first row after the ships, and its key is one further along than the last
    ship's - so a row added to either rack takes its key without any of these lines moving. Null
    for a position past the table, which is a key no rack owns. */
export function perkAt(index) {
  const perk = PERKS[index];
  return perk === undefined ? null : perk;
}

/** How many ranks a perk's ladder has, which is where its row stops having anything to sell. */
export function maxRankOf(id) {
  return perkRow(id).ranks;
}

/** Every perk id with no ranks bought: the shape `world.perkRanks` starts life in (game/world.js),
    before the save has been read into it. A run that has bought nothing still has one key per row,
    which is what lets the rack, the save and `STARFALL.stats()` all read the same object shape
    whether anything has been bought or not. */
export function newPerkRanks() {
  const ranks = {};
  for (const perk of PERKS) ranks[perk.id] = 0;
  return ranks;
}

/** What this save has of a perk, as a number this build can print: 0 when it has none, and never
    more than the table's ladder, because every reader in the game prices a rank off it. */
export function rankOf(world, id) {
  let rank = 0;
  if (world !== null && world !== undefined &&
      world.perkRanks !== null && world.perkRanks !== undefined) {
    rank = world.perkRanks[id];
  }
  if (typeof rank !== 'number' || !Number.isFinite(rank) || rank < 0) return 0;
  rank = Math.floor(rank);
  return maxRankOf(id) < rank ? maxRankOf(id) : rank;
}

/** What one rank of a perk is worth, in the words the rack prints: `+N UNIT PER RANK`, read off
    the balance sheet so a reprice of the step is a one-line retune. */
export function rankWords(id) {
  const row = perkRow(id);
  return '+' + row.step + (row.percent === true ? '%' : '') + ' ' + row.says + ' PER RANK';
}

/** The purse's ledger as a save should write it: the table's ids, the table's order, clamped to
    the table's ladder. A count the table has never heard of (a key stored by hand, or by a build
    this one has forgotten) does not ride along into the write. */
export function perkLedger(world) {
  const ledger = {};
  for (const perk of PERKS) ledger[perk.id] = rankOf(world, perk.id);
  return ledger;
}

// --- The effects, each one at the gate its perk buys -------------------------------

/** Ranks of Hull (the pips a run starts on top of the ship's own): read once, where the run's
    table is cleared (game/run.js `resetRun`), and added to the hull and the max at the same
    time, which is what keeps the four-pip Bulwark from starting on three. */
export function startingHullOf(world) {
  return rankOf(world, 'hull');
}

/** What a run's dust is worth after the Gleaner ranks have looked at it: `step` hundredths more
    per rank, and exactly 1 when nothing has been bought, so a rank-poor run pays what it always
    paid (game/stardust.js). */
const PERCENT = 100;
export function dustGainOf(world) {
  const row = perkRow('dust');
  if (row.percent !== true) return 1;
  return 1 + (rankOf(world, 'dust') * row.step) / PERCENT;
}

/** Ranks of Reroll: the deals a run may re-roll, beyond the one the table itself has. */
export function extraRerollsOf(world) {
  return rankOf(world, 'reroll');
}

/** Ranks of Banish: the lines a run may cut out of the table for good, beyond none. */
export function extraBanishesOf(world) {
  return rankOf(world, 'banish');
}
