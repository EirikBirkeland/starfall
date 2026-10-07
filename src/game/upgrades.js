// The upgrade lines a run is built out of, and the three cards dealt when it levels
// up (PLAN 3.5).
//
// A line is one multiplier and nothing else: its numbers live in BALANCE.upgrades,
// next to every other tuning number, and whatever reads it asks here for the
// multiplier as it stands. Nothing caches a rank into a ship field, so a rank can be
// taken at any moment - between two frames, in the middle of a step - and every
// system that cares simply starts agreeing with it.
//
// The offer is the only place in this file that spends the random stream, so a seed
// decides which cards come up as surely as it decides who arrives in a wave.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { logic } from '../core/rng.js';

const PERCENT = 100;

/**
 * The lines, in the order the cards are dealt from. `id` is the key into
 * BALANCE.upgrades and into `world.upgrades`; `what` is the plain line PLAN 3.5 asks
 * each card for, printed after the percentage that `step` is worth; `flavour` is the
 * one human sentence under it; `icon` picks the shape drawn on the card
 * (render/cards.js).
 */
export const LINES = [
  {
    id: 'damage',
    name: 'DAMAGE',
    what: 'shot damage',
    flavour: 'Everything you hit feels it more.',
    icon: 'damage',
  },
  {
    id: 'fireRate',
    name: 'FIRE RATE',
    what: 'shots per second',
    flavour: 'Less waiting between one shot and the next.',
    icon: 'fireRate',
  },
  {
    id: 'bulletSpeed',
    name: 'SHOT SPEED',
    what: 'shot velocity',
    flavour: 'Less lead to hold, and less of it missing.',
    icon: 'bulletSpeed',
  },
];

const BY_ID = new Map(LINES.map((line) => [line.id, line]));

/** The line definition for an id. An unknown id is a bug, not a silent nothing. */
export function lineOf(id) {
  const line = BY_ID.get(id);
  if (line === undefined) throw new Error('no upgrade line is called ' + id);
  return line;
}

/** A fresh, empty set of ranks, for the world's first build. */
export function newRanks() {
  const ranks = {};
  for (const line of LINES) ranks[line.id] = 0;
  return ranks;
}

/** Put every line back to no ranks. Called with the rest of the run's resetting. */
export function resetRanks(world) {
  for (const line of LINES) world.upgrades[line.id] = 0;
}

/** How many ranks of a line the ship has. */
export function rankOf(world, id) {
  return world.upgrades[id];
}

/** How deep a line goes: how many ranks it has to give in total. */
export function maxRanksOf(id) {
  return BALANCE.upgrades[id].ranks;
}

/** What one rank of a line adds, as a share - which is what the card prints. */
export function stepOf(id) {
  return BALANCE.upgrades[id].step;
}

export function effectOf(id) {
  return '+' + Math.round(stepOf(id) * PERCENT) + '% ' + lineOf(id).what;
}

/**
 * The multiplier a line is worth right now: `1 + step * rank`. Callers read this
 * where the number is used - a shot's damage, the gap between two shots - so there
 * is nothing to keep in step with a rank.
 */
export function gainOf(world, id) {
  return 1 + stepOf(id) * rankOf(world, id);
}

/** Lines with a rank still to give. */
function linesWithRoom(world) {
  const room = [];
  for (const line of LINES) {
    if (rankOf(world, line.id) < maxRanksOf(line.id)) room.push(line);
  }
  return room;
}

/** PLAN 3.5: weighted towards what the player already has. */
function weightOf(world, line) {
  return 1 + BALANCE.cards.bias * rankOf(world, line.id);
}

/**
 * PLAN 3.5's other half: while any line is untouched, at least one of the cards must
 * be one. Without this a build that has been going a while stops ever seeing a new
 * line, which is how a game of choices quietly stops offering choices.
 */
function guaranteeSomethingNew(world, offer) {
  if (offer.length === 0) return;
  for (const id of offer) if (rankOf(world, id) === 0) return;
  const fresh = [];
  for (const line of LINES) if (rankOf(world, line.id) === 0) fresh.push(line.id);
  if (fresh.length === 0) return;
  offer[offer.length - 1] = logic.pick(fresh);
}

/** Deal the next set of cards. Empty when every line is maxed. */
function dealOffer(world) {
  const room = linesWithRoom(world);
  const offer = [];
  while (offer.length < BALANCE.cards.offer && room.length > 0) {
    let total = 0;
    for (const line of room) total += weightOf(world, line);

    let roll = logic.next() * total;
    let chosen = room.length - 1;
    for (let i = 0; i < room.length; i++) {
      roll -= weightOf(world, room[i]);
      if (roll <= 0) {
        chosen = i;
        break;
      }
    }
    offer.push(room[chosen].id);
    room.splice(chosen, 1);
  }
  guaranteeSomethingNew(world, offer);
  // Presented in table order, so that the same set of lines always fills the same
  // places and key 2 is always the middle card. The draw above decides *which* lines
  // come up; it has no business deciding where they are printed.
  offer.sort(byTableOrder);
  return offer;
}

function byTableOrder(a, b) {
  return LINES.findIndex((line) => line.id === a) - LINES.findIndex((line) => line.id === b);
}

/**
 * Put the next choice on the table, or hand the run back if there is nothing left to
 * offer. Called when a level has been earned and every time a card is taken: the pause
 * lasts exactly as long as there is a level owed *and* a card that can pay for it.
 *
 * The pause is only as big as what there is to choose: with every line maxed a level
 * is still a level - the score, the label and the chime are earned - but the run does
 * not stop for a card that could not be dealt. The lines grow with the milestones;
 * three of them is the start of the game, not the whole of it.
 */
export function refreshOffer(world) {
  if (world.offer.length > 0) return;         // a choice is already on the table
  if (world.pendingLevels <= 0) { world.state = STATE.PLAY; return; }

  world.offer = dealOffer(world);
  if (world.offer.length === 0) {
    // Nothing left to give: the levels are still earned, they just have nowhere to go.
    world.pendingLevels = 0;
    world.state = STATE.PLAY;
    return;
  }
  world.offerTime = world.time;
  world.state = STATE.LEVEL;
}

/**
 * Take card `index` of the three on the table, and either deal the next set or start
 * the run again. Answers false for a card that is not there - a click between two
 * frames, a fourth key - so a caller never has to know which.
 */
export function takeOffer(world, index) {
  const id = world.offer[index];
  if (id === undefined || world.pendingLevels <= 0 || world.state !== STATE.LEVEL) return false;

  world.upgrades[id]++;
  world.pendingLevels--;
  world.offer.length = 0;
  refreshOffer(world);
  return true;
}

/** What a run was built out of, for the game-over card. */
export function describeRanks(world) {
  const taken = [];
  for (const line of LINES) {
    if (world.upgrades[line.id] > 0) taken.push(line.name + ' ' + world.upgrades[line.id]);
  }
  return taken.length > 0 ? taken.join('   \u00b7   ') : 'NO UPGRADES';
}
