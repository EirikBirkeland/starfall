// The upgrade lines a run is built out of, and the three cards dealt when it levels
// up (PLAN 3.5).
//
// A line is one number and nothing else: its numbers live in BALANCE.upgrades, next to
// every other tuning number, and whatever reads it asks here for that number as it
// stands. Nothing caches a rank into a ship field, so a rank can be taken at any moment
// - between two frames, in the middle of a step - and every system that cares simply
// starts agreeing with it.
//
// There are three kinds of number, and a line is one of them (`unit`). Most lines sell a
// *share* of something, which is a multiplier a caller multiplies with the number it
// already has: `gainOf`. The behaviour lines - split shot, pierce, ricochet, orbitals,
// nova - hand out whole things instead, and a caller counts them: `countOf`. Burn sells
// neither: it sells a *rate*, which is a third question and has its own accessor.
// A card prints whichever of the three it is dealing with, which is why the printing
// lives here.
//
// What a count is then worth is the reader's business: the split line's extras are added
// to a pull by game/weapons.js, the pierce and ricochet ones are spent by
// game/bullets.js, and the two secondary systems read themselves.
//
// The offer is the only place in this file that spends the random stream, so a seed
// decides which cards come up as surely as it decides who arrives in a wave.

import { BALANCE } from './balance.js';
import { STATE } from './state.js';
import { logic } from '../core/rng.js';

const PERCENT = 100;

/**
 * The two things a line's `step` can mean, and so the two ways a card says it out loud:
 * a `percent` line sells a share of something (a step of 0.3 is worth +30%), an `each`
 * line hands out whole things by the piece (a step of 1 is worth "+1 extra shot").
 */
const SHARE_UNIT = 'percent';
const WHOLE_UNIT = 'each';
/**
 * The third kind: a line that is simply *off* until its first rank and then sells so much of
 * something per rank - a share of one shot for every second of burning (burn), a share of a
 * body's walk for every hit landed (chill). `gainOf` cannot read it - `1 + step * 0` is one,
 * and rank 0 has to mean no fire at all, not fire at the strength of nothing - and `countOf`
 * cannot print it, because a rank buys a fraction and not a thing. So it gets asked its own
 * question (`rateOf`) and printed as a share, because what one rank is worth really is a
 * share of what the line was worth before it.
 */
const RATE_UNIT = 'rate';

/**
 * The lines, in the order the cards are dealt from. `id` is the key into
 * BALANCE.upgrades and into `world.upgrades`; `unit` is one of the two words above and
 * `what` is the thing the line sells, so the card can print `step` next to it;
 * `flavour` is the one human sentence under it; `icon` picks the shape drawn on the card
 * (render/cards.js).
 */
export const LINES = [
  {
    id: 'damage',
    name: 'DAMAGE',
    unit: SHARE_UNIT,
    what: 'shot damage',
    flavour: 'Everything you hit feels it more.',
    icon: 'damage',
  },
  {
    id: 'fireRate',
    name: 'FIRE RATE',
    unit: SHARE_UNIT,
    what: 'shots per second',
    flavour: 'Less waiting between one shot and the next.',
    icon: 'fireRate',
  },
  {
    id: 'bulletSpeed',
    name: 'SHOT SPEED',
    unit: SHARE_UNIT,
    what: 'shot velocity',
    flavour: 'Less lead to hold, and less of it missing.',
    icon: 'bulletSpeed',
  },
  {
    id: 'split',
    name: 'SPLIT SHOT',
    unit: WHOLE_UNIT,
    what: 'extra shot',
    flavour: 'One more projectile per pull, in a fan.',
    icon: 'split',
  },
  {
    id: 'pierce',
    name: 'PIERCE',
    unit: WHOLE_UNIT,
    what: 'body passed through',
    flavour: 'A shot goes through one more body, and on to the next.',
    icon: 'pierce',
  },
  {
    id: 'ricochet',
    name: 'RICOCHET',
    unit: WHOLE_UNIT,
    what: 'body turned onto',
    flavour: 'A shot that would die turns on the next body and goes again.',
    icon: 'ricochet',
  },
  {
    id: 'orbitals',
    name: 'ORBITALS',
    unit: WHOLE_UNIT,
    what: 'orbital drone',
    flavour: 'Drones circle the ship and grind whatever they touch.',
    icon: 'orbitals',
  },
  {
    id: 'nova',
    name: 'NOVA',
    unit: WHOLE_UNIT,
    what: 'nova ring',
    flavour: 'Every eight seconds the ship throws off a wave of damage, and one more per rank.',
    icon: 'nova',
  },
  {
    id: 'burn',
    name: 'BURN',
    unit: RATE_UNIT,
    what: 'burning damage',
    flavour: 'A hit sets them alight, and the fire keeps working after the shot has gone.',
    icon: 'burn',
  },
  {
    id: 'chill',
    name: 'CHILL',
    unit: RATE_UNIT,
    what: 'slower',
    flavour: 'A hit takes the speed out of them, and what stops moving cannot reach you.',
    icon: 'chill',
  },
  {
    id: 'leech',
    name: 'LEECH',
    unit: WHOLE_UNIT,
    what: 'fewer kills per hull',
    flavour: 'Bodies you bring down patch the ship. Sixty of them at the first rank, and the leech gets quicker from there.',
    icon: 'leech',
  },
  {
    id: 'afterimage',
    name: 'AFTERIMAGE',
    unit: WHOLE_UNIT,
    what: 'image left behind',
    flavour: 'The dash leaves images of the ship standing where it was, and the bodies next to them chase those for a couple of seconds. One more image per rank, spread down the streak.',
    icon: 'afterimage',
  },
  {
    id: 'overcharge',
    name: 'OVERCHARGE',
    unit: SHARE_UNIT,
    what: 'charged shot',
    flavour: 'Stand still for a second and the gun loads. What it hands you is one heavy pull, and every rank makes that pull heavier.',
    icon: 'overcharge',
  },
  {
    id: 'magnetar',
    name: 'MAGNETAR',
    unit: WHOLE_UNIT,
    what: 'shot off everything in reach',
    flavour: 'The shards you pick up charge the field round the ship, and when it is full it lets go. Everything standing in the field feels it.',
    icon: 'magnetar',
  },
  {
    id: 'mines',
    name: 'MINES',
    unit: WHOLE_UNIT,
    what: 'mine per drop',
    flavour: 'The ship drops mines out of the way it was going, and a body that walks into one pays for the road. One more mine per drop for every rank.',
    icon: 'mines',
  },
  {
    id: 'tether',
    name: 'TETHER',
    unit: WHOLE_UNIT,
    what: 'thread tied',
    flavour: 'A dash ties a line of light from where it started to wherever you get to, and everything standing on it burns for two seconds. It pays for turning: one more thread per dash for every rank.',
    icon: 'tether',
  },
];

/** The line that hands out extra projectiles alongside the gun's own. */
const PIERCE_LINE = 'pierce';
/** The line that hands out extra bodies each projectile may be turned onto. */
const RICOCHET_LINE = 'ricochet';
/** The line that hands out drones to fly around the ship. */
const ORBITALS_LINE = 'orbitals';
/** The line that hands out nova fronts to throw off the ship. */
const NOVA_LINE = 'nova';
/** The line that sets what the ship hits on fire. */
const BURN_LINE = 'burn';
/** The line that takes the speed out of what the ship hits. */
const CHILL_LINE = 'chill';
/** The line that trades bodies brought down for hull back. */
const LEECH_LINE = 'leech';
/** The line that loads the ship's own gun while the ship stands still. */
const OVERCHARGE_LINE = 'overcharge';
/** The line that leaves images of the ship behind a dash. */
const AFTERIMAGE_LINE = 'afterimage';
/** The line that spends collected shards as a discharge round the ship. */
const MAGNETAR_LINE = 'magnetar';
/** The line that leaves mines in the arena behind the ship. */
const MINES_LINE = 'mines';
/** The line that ties a thread of light from a dash to the ship. */
const TETHER_LINE = 'tether';

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

/** What one rank of a line adds - which is what the card prints. */
export function stepOf(id) {
  return BALANCE.upgrades[id].step;
}

/** The plain line under the card's name: what one more rank is worth, in words. */
export function effectOf(id) {
  const line = lineOf(id);
  if (line.unit === WHOLE_UNIT) return '+' + stepOf(id) + ' ' + line.what;
  return '+' + Math.round(stepOf(id) * PERCENT) + '% ' + line.what;
}

/**
 * The multiplier a share line is worth right now: `1 + step * rank`. Callers read this
 * where the number is used - a shot's damage, the gap between two shots - so there
 * is nothing to keep in step with a rank.
 *
 * Asking a line that hands out whole things for a multiplier is a bug, and it throws:
 * `1 + 1 * rank` reads as a plausible number and would quietly multiply the wrong one.
 */
export function gainOf(world, id) {
  const line = lineOf(id);
  if (line.unit !== SHARE_UNIT) throw new Error(id + ' is not a line of shares');
  return 1 + stepOf(id) * rankOf(world, id);
}

/**
 * How many whole things a line of `unit: each` hands out right now: `step * rank`.
 * Asking a line of shares for a count is a bug and says so, exactly the other way round
 * from `gainOf`.
 */
export function countOf(world, id) {
  const line = lineOf(id);
  if (line.unit !== WHOLE_UNIT) throw new Error(id + ' is not a line of whole things');
  return stepOf(id) * rankOf(world, id);
}

/**
 * How much per second a line of `unit: rate` is worth right now: `step * rank`, which is
 * nothing at all at rank 0 - that is the whole reason this is a third kind of number and
 * not one of the two above. Asking a line that is not a rate for one says so.
 */
export function rateOf(world, id) {
  const line = lineOf(id);
  if (line.unit !== RATE_UNIT) throw new Error(id + ' does not sell a rate');
  return stepOf(id) * rankOf(world, id);
}

/**
 * How many bodies past the first one a shot may go through (PLAN 3.5). A shot is
 * handed this when it leaves and spends one of it per body, so it is the count of
 * *extra* bodies, not of bodies in total.
 */
export function pierceOf(world) {
  return countOf(world, PIERCE_LINE);
}

/**
 * How many times one shot may be turned onto a body it was not aimed at (PLAN 3.5). A
 * shot is handed this when it leaves and spends one of it per turn, and a turn is taken
 * only when there is nothing left ahead of the shot for a pass to go through - so pierce
 * buys the body *behind* the one you aimed at and this buys the ones standing beside it.
 */
export function bounceOf(world) {
  return countOf(world, RICOCHET_LINE);
}

/**
 * How many drones are circling the ship right now (PLAN 3.2's orbitals, as a line):
 * a pair per rank, so rank 1 is PLAN's two of them and rank five is ten. This is the
 * ring's whole definition - game/orbitals.js sizes itself to this number every step and
 * the renderer draws whatever is standing on it - so a rank taken between two frames
 * puts two more drones on the ring on the very next step, with nothing to keep in step.
 */
export function dronesOf(world) {
  return countOf(world, ORBITALS_LINE);
}

/**
 * How many nova fronts the ship throws off per cycle (PLAN 3.2's "every 8 s", as a
 * line): one per rank, so rank 1 is PLAN's single ring every eight seconds and rank
 * five is five of them spread across the same eight seconds. The wait itself is
 * `cycle / this`, worked out where the next one is counted down - a rank taken part way
 * through a wait shortens the one after it rather than reaching back into the wait the
 * run has already spent.
 */
export function pulsesOf(world) {
  return countOf(world, NOVA_LINE);
}

/**
 * How hard the fire bites, as a share of one shot of the ship's own gun per second of
 * burning (PLAN 3.5's Burn): `0` until the line is taken, and this much for every body that
 * is alight. Read where the damage is paid out - game/burn.js - so a rank taken in the
 * middle of a burning crowd is felt by the very next bite, and the fire is worth more on a
 * heavy gun for exactly the reason a drone bite is (game/orbitals.js).
 */
export function flameOf(world) {
  return rateOf(world, BURN_LINE);
}

/**
 * How much of a body's own walk one hit takes away (PLAN 3.5's Chill): `0` until the line is
 * taken, and this much per rank after that. Read where a hit lands - game/chill.js - which is
 * what makes the frost a thing a run builds up by hitting a body rather than a multiplier on
 * something it never counts, and why rank 0 has to be *nothing is cold* and not one times
 * nothing.
 */
export function chillOf(world) {
  return rateOf(world, CHILL_LINE);
}

/**
 * How many bodies brought down feed one hull back (PLAN 3.5's Leech): `60` at the first rank,
 * and six fewer for every rank after it - and `0` when the line has not been taken at all,
 * which is not a price of sixty-six but the absence of the whole bargain. Read where a body
 * comes down (game/leech.js), so a rank taken in the middle of a pile of kills is worth what
 * it says the very next time something dies.
 */
export function leechCostOf(world) {
  if (rankOf(world, LEECH_LINE) <= 0) return 0;
  return BALANCE.upgrades[LEECH_LINE].base - countOf(world, LEECH_LINE);
}

/**
 * What a charged pull of the trigger is worth (PLAN 3.5's Overcharge): `2` at the first rank,
 * which is PLAN's doubling read literally, and one more whole copy of the pull for every rank
 * after it. `1` when the line has not been taken at all, which is not a charge that does nothing
 * but the absence of the bargain - the same trap rank 0 has walked into on every conditional
 * line since burn. Read where a pull is thrown (game/weapons.js), so what leaves the ship is
 * worth the ranks standing on it at the moment it leaves and nothing rewrites a shot in the air.
 */
export function pullBoostOf(world) {
  if (rankOf(world, OVERCHARGE_LINE) <= 0) return 1;
  return gainOf(world, OVERCHARGE_LINE);
}

/**
 * How many images one dash leaves standing in the arena (PLAN 3.5's Afterimage): one at the
 * first rank and one more for every rank after it, spread out over the length of the streak.
 * Read where a dash is armed (game/afterimage.js), so a rank taken between two dashes is
 * spent on the next one - and not on the images already standing there, which are the ship as
 * it was and cannot be revised after the fact.
 */
export function imagesOf(world) {
  return countOf(world, AFTERIMAGE_LINE);
}

/**
 * How many shots of the ship's own gun one discharge of the field is worth (PLAN 3.5's
 * Magnetar): one at the first rank and five at the fifth, and `0` when the line has not been
 * taken - which is not a crack that does nothing but the absence of the field, the same trap
 * rank 0 has walked into on every conditional line since burn. Read where the crack is paid out
 * (game/magnetar.js) and multiplied by `bullets.damage` and the damage line there, exactly as a
 * drone's bite and a nova front are, so the field grows with the gun instead of falling behind
 * it.
 */
export function crackShotsOf(world) {
  return countOf(world, MAGNETAR_LINE);
}

/**
 * How many mines one drop lays (PLAN 3.2's "drops a mine every 3 s", as a line): one at the first
 * rank and five at the fifth, on a beat that never changes - so a rank is a wider stretch of the
 * road rather than a quicker one, which is the difference between owning ground and revving. Read
 * where the drop happens (game/mines.js), so a rank taken between two drops is in the next one.
 */
export function minesPerDropOf(world) {
  return countOf(world, MINES_LINE);
}

/**
 * How many threads one dash ties (PLAN 3.2's "a damaging beam links the ship to its last dash
 * position", as a line): one at the first rank and five at the fifth, spread down the streak the dash
 * covered and every one of them tied to the ship. Read where a dash is armed (game/tether.js), so a
 * rank taken between two dashes is in the next one and not in the threads already hanging in the
 * air, which are the places the ship has been and cannot be revised after the fact.
 */
export function cordsOf(world) {
  return countOf(world, TETHER_LINE);
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
 *
 * "Untouched" and "has a rank to give" are not the same thing, and both are needed: a
 * line with no ranks in it (`ranks: 0`, which is how a line is taken out of the game)
 * is untouched forever and would otherwise be dealt every time this fires - and taking
 * it would hand out a rank of a line that has no ranks, which is how a measurement that
 * removed a line ended up measuring one rank of it instead (NOTES session 32).
 */
function guaranteeSomethingNew(world, offer) {
  if (offer.length === 0) return;
  for (const id of offer) if (rankOf(world, id) === 0) return;
  const fresh = [];
  for (const line of LINES) {
    if (rankOf(world, line.id) === 0 && maxRanksOf(line.id) > 0) fresh.push(line.id);
  }
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
