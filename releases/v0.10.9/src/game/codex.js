// The codex (PLAN 3.7): what this save has met, and how much of the arena it has not.
//
// The hangar sells things; the codex remembers them. It is the one between-run panel with no price
// and no rank, which is why it is a panel of its own on a key of its own (`C`) rather than a third
// rack beside the ships and the perks: the number keys are all spoken for - five ships and four
// perks is the whole of 1-9 - and a row nobody can buy has no business in a list of rows that can
// be. It is also the one thing between runs that is *read* rather than spent, so it is filled in by
// what runs did and never by what a key asked for.
//
// Three panels, and the rows come from tables the game already has:
//
//   HOSTS - every body the arena sends (game/kinds.js) and every fight its schedule brings on
//           (game/bosses.js), named and said in one line each;
//   LINES - every card the table deals (game/upgrades.js), said in the card's own words;
//   SYNERGIES - the cards that are not dealt, which is what makes finding one worth a row.
//
// **What counts as having been met.** All four rules read a run that has stopped, from state that
// is already on the world, which is what keeps this file out of the step entirely:
//
//   a body arrived - the run's tally says the world put one of that kind in play (game/tally.js
//   `noteArrival`), which is the same gate the balance tables are built on and for the same reason:
//   the attract screen's crowd and a test's planted body are not meetings;
//   a fight was reached - either its schedule entry has been spent (game/bosses.js moves
//   `world.bossIndex` when a fight comes down) or it was the fight standing when the run ended.
//   A run that walked into the Warden and was beaten by it has met the Warden;
//   a line was taken - the run held at least one rank of it;
//   a synergy was found - it was taken, which is the only way there is to take one.
//
// **It is written once, at an ending.** `recordRun` is called beside the stardust (game/run.js
// `bankRun`) and writes the ledger only when the run actually taught it something. Nothing reads
// the codex back into a run, so no run can be different because it exists - the same promise
// game/tally.js makes about the numbers it keeps, and the reason the reference run does not know
// this file is in the game.

import { remember, section } from '../core/save.js';
import { BALANCE } from './balance.js';
import { isSynergy, LINES } from './upgrades.js';

/**
 * The crowd the codex has a row for: one per kind in game/kinds.js, in that table's order, each
 * said by what its own walk does (the comments in game/kinds.js are where every one of these
 * lines comes from). `test/codex.test.mjs` holds this list against the kind table, so a new kind
 * cannot arrive without a row and cannot be quietly missing from the codex either.
 */
const CROWD = [
  { id: 'drifter', name: 'DRIFTER', says: 'straight at the ship, and no ideas' },
  { id: 'weaver', name: 'WEAVER', says: 'comes at you weaving, so it is hard to lead' },
  { id: 'darter', name: 'DARTER', says: 'stops to take a line, then comes down it' },
  { id: 'spitter', name: 'SPITTER', says: 'holds its distance and spits from there' },
  { id: 'tank', name: 'TANK', says: 'too heavy to turn, and comes apart in two' },
  { id: 'bomber', name: 'BOMBER', says: 'the circle it stands in is the warning' },
  { id: 'shielder', name: 'SHIELDER', says: 'stands off and shields what stands near it' },
  { id: 'swarmling', name: 'SWARMLING', says: 'one of a pack that turns as one' },
  { id: 'sniper', name: 'SNIPER', says: 'bolted down; draws a line, then fires down it' },
];

/**
 * One row of a panel. `key` is what the save remembers it by (see `slugOf`: the store's names are
 * lower case and card ids are not), `panel` is which of the ledger's two lists it lives in, and
 * `boss` is only ever true of a fight, which is the one row `recordRun` asks a different question
 * about when it works out whether the run met it.
 */
function row(id, name, says, panel, boss) {
  return {
    id: id, key: slugOf(id), name: name, says: says,
    panel: panel, boss: boss === true,
  };
}

/** The fights, out of the schedule itself (game/bosses.js), so the codex can never advertise a fight
    the game does not field - and borrowing the name and the one line the fight's own warning shows,
    the same words the win card reads off the same table. */
function fights() {
  return BALANCE.bosses.schedule.map((entry) => {
    const spec = BALANCE.bosses[entry.boss];
    return row(entry.boss, spec.name, spec.blurb, 'hosts', true);
  });
}

/** Every body the codex has a row for: the crowd first, then the fights, which is the order the panel
    prints them in - the crowd a run meets first, and the fights later, in the order they are due. */
export const HOSTS = CROWD.map((entry) => row(entry.id, entry.name, entry.says, 'hosts'))
  .concat(fights());

/**
 * The card lines and the synergies, split out of the deal table (game/upgrades.js) and said in the
 * card's own words, because the card is the best description of a card that exists. A synergy is
 * not a line the deck is holding back, so it gets its own panel and its own refused phrase.
 */
export const CARDS = LINES
  .filter((line) => !isSynergy(line.id))
  .map((line) => row(line.id, line.name, line.flavour, 'lines'));
export const SYNERGIES = LINES
  .filter((line) => isSynergy(line.id))
  .map((line) => row(line.id, line.name, line.flavour, 'lines'));

/** Every row of every panel, which is what "how much of the codex is filled in" counts over. */
export const ENTRIES = HOSTS.concat(CARDS).concat(SYNERGIES);

/**
 * A row's id as the save may hold it: lower case, with a hyphen where a camel case id has its join
 * (`fireRate` becomes `fire-rate`). The store only accepts names of one shape (core/save.js) and the
 * card ids were written as keys into `world.upgrades` and not as save text, so the two need a join
 * and this is the only place that knows it. `test/codex.test.mjs` holds every key to that shape and
 * says so if two rows ever come to share one.
 */
export function slugOf(id) {
  return id.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
}

/** What a body or a fight is called, by its id - or the id itself, upper case.
 *
 * The codex's own table is the one list in the game that names every body and every fight, so it is
 * what the death's card reads a cause off too (game/tally.js `causeWords`): the card and the codex
 * cannot then disagree about what a thing is called. A name this build has never met - a cause label
 * left behind by a build with an enemy this one does not have - is named by its own text rather than
 * throwing the card away, which is the same bargain the run log strikes with a ship it does not know
 * (ui/screens.js `logShip`). */
export function hostName(id) {
  for (const entry of HOSTS) {
    if (entry.id === id) return entry.name;
  }
  return String(id).toUpperCase();
}

/** A codex that has seen nothing: the shape every reader wants whether or not anything is in it. */
export function emptyFound() {
  return { hosts: [], lines: [] };
}

/**
 * What the last visit left behind, read once when the visit opens (main.js) beside the purse and
 * the ships the purse bought. Two lists and not one: which bodies were met and which cards were
 * taken are two questions, and a panel should not have to guess which of a mixed bag its rows are.
 */
export function foundFromSave() {
  const stored = section('codex', { hosts: [], lines: [] });
  return { hosts: stored.hosts.slice(), lines: stored.lines.slice() };
}

/** The same thing, as the save should write it: the visit's two lists, each sorted, deduped. */
export function foundLedger(world) {
  return {
    hosts: sortedKeys(world.found.hosts),
    lines: sortedKeys(world.found.lines),
  };
}

function sortedKeys(list) {
  const kept = [];
  for (const key of list) if (kept.indexOf(key) < 0) kept.push(key);
  return kept.sort();
}

/** Has this save met this row? */
export function wasMet(found, entry) {
  return found[entry.panel].indexOf(entry.key) >= 0;
}

/** How many of the whole codex this save has filled in, as `{ met, of }` for the panel's one line.
    Only rows this build knows about are counted, so a key left behind by a newer build's codex -
    one with more enemies in it than this one - is neither shown nor counted. */
export function metShare(found) {
  let met = 0;
  for (const entry of ENTRIES) if (wasMet(found, entry)) met++;
  return { met: met, of: ENTRIES.length };
}

/**
 * Everything a finished run met, and everything it took, into the visit's ledger - and into the
 * save, once, when there was something new to write. Returns how many rows this run taught, which
 * is what the ending's card prints (game/run.js `bankRun` is the caller and `ui/screens.js` the
 * reader), and 0 for a run that met nothing it had not met before.
 */
export function recordRun(world) {
  const before = world.found.hosts.length + world.found.lines.length;

  for (const host of HOSTS) {
    if (host.boss ? fightWasReached(world, host.id) : bodyArrived(world, host.id)) {
      addOnce(world.found.hosts, host.key);
    }
  }
  for (const card of CARDS.concat(SYNERGIES)) {
    if (rankHeld(world, card.id)) addOnce(world.found.lines, card.key);
  }

  const learned = world.found.hosts.length + world.found.lines.length - before;
  if (learned > 0) {
    world.codexNew += learned;
    remember('codex', foundLedger(world));
  }
  return learned;
}

function addOnce(list, key) {
  if (list.indexOf(key) < 0) list.push(key);
}

/** Did the run's tally see one of these arrive? (game/tally.js is the witness; a body a test or the
    attract screen built never entered its book and so was never met.) */
function bodyArrived(world, id) {
  const rowOfKind = world.tally.kinds[id];
  return rowOfKind !== undefined && rowOfKind.arrived > 0;
}

/** Was this fight got to - either brought down, which is what spends its schedule entry, or still
    standing in the arena when the run stopped? Only one fight is ever standing, so the two together
    are the whole of "met", and neither of them needs a note taken during the run. */
function fightWasReached(world, id) {
  const schedule = BALANCE.bosses.schedule;
  for (let i = 0; i < schedule.length; i++) {
    if (schedule[i].boss !== id) continue;
    if (world.bossIndex > i) return true;
  }
  return world.boss !== null && world.boss !== undefined && world.boss.id === id;
}

/** Did the run hold a rank of this line? */
function rankHeld(world, id) {
  const ranks = world.upgrades[id];
  return typeof ranks === 'number' && ranks > 0;
}


