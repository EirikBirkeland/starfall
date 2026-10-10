// The awards (PLAN 3.7): what a run did that this save will remember, and the little stardust it
// pays for doing it.
//
// The hangar sells and the codex remembers; an award is the third thing a save can do with a run,
// which is to *credit* it. Thirty of them, each a sentence about one run ("bring down a thousand
// bodies in one run"), each paying a little stardust once and only once per save. The table is
// below, the price sheet is `BALANCE.awards`, and the ids are what the save stores
// (`awards.won`, core/save.js) beside the purse, the ships and the codex.
//
// The whole table is read on the back of the hangar (ui/screens.js `showAwards`), which is the panel
// stardust is spent from: the purse above, and the thirty ways it was earned under it, on one panel,
// so nobody has to die for it to find out what they are saving up for. Not the codex, whose racks
// are what a save has *met* and whose tally would otherwise have started meaning two things.
//
// **Two moments, because an award is earned at one and paid at the other.**
//
//   The **live pass** (`updateAwards`) runs once a step while the run is flying and asks each row
//   still unclaimed whether its rule is true *now*. When one turns true the award is announced -
//   a plate on the glass (render/toast.js) and a chime - and remembered for the run. That is the
//   only thing the step does with an award: it puts the id in a queue for the frame and spends no
//   money and no hull and reads nothing else, so no run can be different because this file exists,
//   which is the promise game/tally.js makes about the numbers it keeps and this file keeps too.
//
//   The **ending** (`bankAwards`, called from game/run.js `bankRun`) is where an award is *won*.
//   It re-asks every row against a run that has stopped and pays out the ones this save has not
//   won yet - the stardust (game/stardust.js `grantDust`), the save, and the line on the card.
//   Two reasons it asks everything again instead of trusting the live pass: half the rows only
//   mean something once a run has stopped ("win without a single dash" is not true of a run that
//   is still flying), and a rule can turn true on the very step that ends the run, after the live
//   pass has already been and gone (the last fight coming down *is* the run ending).
//
// **Every live rule has to stay true once it is true.** A level reached, a body count, a stretch
// of time: the pass only ever looks at the world as it stands this step, so a rule that could be
// true and then false again would be a rule that needs luck to be caught. The two exceptions in
// the table - the shard row and the endless clock - are true for as long as the thing they count
// keeps its shape, and both are also re-asked at the ending, which is where being paid is decided.
//
// An id is stored in the shape `core/save.js` allows (lower case, a hyphen where two words meet),
// and every id in the table has a row in the price sheet - `test/awards.test.mjs` holds the two
// lists against each other in both directions, so a row cannot be added without a price and a
// price cannot be left behind without a row.

import { remember, section } from '../core/save.js';
import { cueChord } from './cues.js';
import { endlessTime } from './endless.js';
import { grantDust } from './stardust.js';
import { BALANCE } from './balance.js';
import { SHIPS } from './ships.js';
import { isSynergy } from './upgrades.js';

/**
 * One award. `live` is the rule the step asks while the run is flying, and `last` the rule the
 * ending asks once it has stopped; a row has one or the other or both. Both are handed the world
 * and the row's own `need` from the price sheet, so that no threshold is written in a game module
 * (test/structure.test.mjs would rightly call that hard-coding).
 */
function row(id, name, says, live, last) {
  return {
    id: id, name: name, says: says,
    live: live === undefined ? null : live,
    last: last === undefined ? null : last,
  };
}

/** The five "win it in this ship" rows, out of the ship table so the awards cannot fall behind it
    and cannot advertise a body the hangar does not sell. */
function shipWins() {
  return SHIPS.map((ship) => {
    const name = BALANCE.ships[ship.id].name;
    return row(ship.id + '-cleared', name + ' CLEARED', 'win the arena in the ' + name,
      null, (world) => world.won && world.ship === ship.id);
  });
}

/**
 * The table. The order is the order a catalogue would print them in - what a run is made of first
 * and what it amounts to last - and nothing else reads it as a ranking.
 */
export const AWARDS = [
  // Bodies brought down in one run.
  row('century', 'CENTURY', 'bring down a hundred bodies in one run',
    (world, need) => world.kills >= need),
  row('thousandfold', 'THOUSANDFOLD', 'bring down a thousand bodies in one run',
    (world, need) => world.kills >= need),
  row('reaper', 'REAPER', 'bring down five thousand bodies in one run',
    (world, need) => world.kills >= need),
  // Score in one run. The last of the three is the game's own name, which is the point of it.
  row('bright-spark', 'BRIGHT SPARK', 'score ten thousand in one run',
    (world, need) => world.score >= need),
  row('supernova', 'SUPERNOVA', 'score fifty thousand in one run',
    (world, need) => world.score >= need),
  row('starfall', 'STARFALL', 'score a hundred and fifty thousand in one run',
    (world, need) => world.score >= need),
  // Levels reached in one run.
  row('warmed-up', 'WARMED UP', 'reach level ten in one run',
    (world, need) => world.player.level >= need),
  row('built-different', 'BUILT DIFFERENT', 'reach level twenty-five in one run',
    (world, need) => world.player.level >= need),
  row('old-hand', 'OLD HAND', 'reach level fifty in one run',
    (world, need) => world.player.level >= need),
  // Time survived.
  row('five-minutes', 'FIVE MINUTES', 'survive five minutes',
    (world, need) => world.elapsed >= need),
  row('quarter-hour', 'QUARTER HOUR', 'survive a quarter of an hour',
    (world, need) => world.elapsed >= need),
  // The loot, and the row it arrives in.
  row('collector', 'COLLECTOR', 'swallow five hundred shards in one run',
    (world, need) => world.shardsCollected >= need),
  row('magnet', 'MAGNET', 'swallow twenty-five shards in one unbroken row',
    (world, need) => world.shardStreak.count >= need),
  // The crowd's gold, and the pack that turns as one.
  row('gold-touch', 'GOLD TOUCH', 'bring down twenty-five gold bodies in one run',
    (world, need) => world.tally.eliteKilled >= need),
  row('swarm-breaker', 'SWARM BREAKER', 'bring down five hundred swarmlings in one run',
    (world, need) => killedOf(world, 'swarmling') >= need),
  // The fights the schedule sends.
  row('first-fight', 'FIRST FIGHT', 'bring down your first fight',
    (world, need) => world.bossesDown >= need),
  row('every-fight', 'EVERY FIGHT', 'bring down every fight the schedule sends',
    (world, need) => world.bossesDown >= need),
  // The run that finished, and the five bodies it could have been flown in.
  row('arena-cleared', 'ARENA CLEARED', 'outlast the whole schedule and still be standing',
    null, (world) => world.won),
  ...shipWins(),
  // How it was flown.
  row('no-dashing', 'NO DASHING', 'win the arena without a single dash',
    null, (world) => world.won && world.tally.dashes === 0),
  row('untouched', 'UNTOUCHED', 'go five minutes without losing a pip',
    null, (world, need) => world.tally.hullLost === 0 && world.elapsed >= need),
  row('flawless', 'FLAWLESS', 'win the arena without losing a pip',
    null, (world) => world.won && world.tally.hullLost === 0),
  row('streaked', 'STREAKED', 'dash two hundred and fifty times in one run',
    (world, need) => world.tally.dashes >= need),
  // The build: the cards taken, and the one kind of card that is only dealt by accident.
  row('in-combination', 'IN COMBINATION', 'take a synergy off the table',
    (world, need) => synergiesHeld(world) >= need),
  row('full-kit', 'FULL KIT', 'take twenty-five cards in one run',
    (world, need) => ranksTaken(world) >= need),
  // And the stretch only a won run can fly.
  row('past-the-end', 'PAST THE END', 'fly five minutes beyond the win',
    (world, need) => endlessTime(world) >= need),
];

/** Every award id, which is what the tests hold against the price sheet. */
export const AWARD_IDS = AWARDS.map((award) => award.id);

/** The price sheet's row for an award, and a loud answer if there is not one (game/perks.js
    `perkRow` makes the same bargain: a row that quietly is not there is a threshold of
    `undefined`, which every body in the arena then clears on the first step). */
function sheetRow(id) {
  const line = BALANCE.awards.rows[id];
  if (line === undefined) throw new Error('the awards have no price row for ' + id);
  return line;
}

/** What a rule has to reach. */
function need(id) {
  return sheetRow(id).need;
}

/** What an award pays. */
export function dustOf(id) {
  return sheetRow(id).dust;
}

/** The award an id names, or null. The toast and the card both ask this, so they cannot disagree. */
export function awardOf(id) {
  for (const award of AWARDS) if (award.id === id) return award;
  return null;
}

/** What an award is called, said out loud once rather than in two places. */
export function nameOf(id) {
  const award = awardOf(id);
  if (award === null) throw new Error('no award is called ' + id);
  return award.name;
}

/** What a list of awards pays between them. */
export function dustTotal(ids) {
  let dust = 0;
  for (const id of ids) dust += dustOf(id);
  return dust;
}

// --- What the run and the save hold ---------------------------------------------------

/**
 * What the last visit left behind: the ids it won. Read once when the visit opens (main.js),
 * beside the purse, the ships and the codex, for the same reason and in the same shape - a list,
 * and an empty one is a first visit and not a broken save.
 */
export function wonFromSave() {
  return section('awards', { won: [] }).won;
}

/** Has this save won this award? */
export function wasWon(world, id) {
  return world.awards.indexOf(id) >= 0;
}

/** Has this *run* earned it, announced or not? */
function earnedThisRun(world, id) {
  return world.runAwards.indexOf(id) >= 0;
}

/**
 * How much of the whole table a list of won ids covers, as `{ won, of }` for whatever says so.
 *
 * An id the list holds that this table does not know is not counted, because there is no row of
 * this build's to light up for it - the same bargain `ui/screens.js` strikes with a ship name it
 * has never met. The `of` is always this build's table, which is the only one the panel can print.
 */
export function shareOf(won) {
  let count = 0;
  for (const award of AWARDS) if (won.indexOf(award.id) >= 0) count++;
  return { won: count, of: AWARDS.length };
}

/** How many of the whole table this save has won. */
export function wonShare(world) {
  return shareOf(world.awards);
}

// --- The counters the rules read ------------------------------------------------------

/** How many bodies of one kind this run brought down. Zero for a kind it never saw. */
function killedOf(world, type) {
  const line = world.tally.kinds[type];
  return line === undefined ? 0 : line.killed;
}

/** How many ranks of cards this run has taken, synergies and all. */
function ranksTaken(world) {
  let ranks = 0;
  for (const id of Object.keys(world.upgrades)) ranks += world.upgrades[id];
  return ranks;
}

/** How many *synergies* this run holds a rank of. They are not dealt on purpose (game/upgrades.js),
    which is the whole reason taking one is worth an award and a row in the codex. */
function synergiesHeld(world) {
  let held = 0;
  for (const id of Object.keys(world.upgrades)) {
    if (world.upgrades[id] > 0 && isSynergy(id)) held++;
  }
  return held;
}

// --- The two passes -------------------------------------------------------------------

/**
 * The live pass: one step's look at every award this save has not won yet. Called from
 * game/world.js `stepRun`, and it is the only thing here that runs inside a step.
 *
 * What it changes is two lists of ids and one queued chime. Nothing in the game reads either list
 * to decide anything - the ending re-asks the rules from the world itself rather than trusting
 * this pass - so the run cannot tell whether it was watched, which is the same bargain the tally
 * and the codex keep and the reason the reference run does not know this file is in the game.
 *
 * A rule is only asked while it can still be won: an award this save has, or this run has already
 * announced, is skipped, so the pass gets cheaper as a run goes on and never announces twice.
 */
export function updateAwards(world) {
  for (const award of AWARDS) {
    if (award.live === null) continue;
    if (wasWon(world, award.id) || earnedThisRun(world, award.id)) continue;
    if (!award.live(world, need(award.id))) continue;
    world.runAwards.push(award.id);
    world.awardToasts.push(award.id);
    const sound = BALANCE.awards.sound;
    cueChord(sound.notes, sound.dur, sound.wave, sound.vol);
  }
}

/**
 * The ending: every award this run has earned and this save has not won yet, paid out once, and
 * the list of them left on the world for the card to read (game/run.js `bankRun` is the caller,
 * after the stardust and the codex, in that order: the purse is filled, the codex is filled, and
 * then the awards are credited and their own stardust goes on top of the purse).
 *
 * It asks **every** rule, live ones included, and counts anything the live pass had already
 * announced. That is deliberate and it is the whole of the ordering: a rule can turn true on the
 * step that ends the run - the last fight coming down *is* the run ending, and the live pass runs
 * after the fights - and an award that was earned and not announced is still earned.
 *
 * Returns how many were new to the save, which is 0 for the second ending of a run that was won
 * and then handed back and finally went down: those awards were paid at the win and this run is
 * one run, not two (game/stardust.js argues the same case about the score).
 */
export function bankAwards(world) {
  const news = world.awardNews;
  news.length = 0;
  for (const award of AWARDS) {
    if (wasWon(world, award.id)) continue;
    if (!wonThisRun(world, award)) continue;
    news.push(award.id);
  }
  if (news.length === 0) return 0;

  for (const id of news) world.awards.push(id);
  remember('awards', { won: world.awards });
  grantDust(world, dustTotal(news));
  return news.length;
}

/** Did this run win this award, either by announcing it on the way or by ending up true? */
function wonThisRun(world, award) {
  if (earnedThisRun(world, award.id)) return true;
  const value = need(award.id);
  if (award.live !== null && award.live(world, value)) return true;
  if (award.last !== null && award.last(world, value)) return true;
  return false;
}

/**
 * The awards the frame has yet to put on the glass, as what a plate needs to say, and the queue
 * emptied (render/toast.js draws them and audio drains the chime beside them). The shape of
 * `drainCues`: the game queues, a presentation layer takes them away once per frame, and nothing
 * here knows what a plate looks like.
 */
export function takeAwardToasts(world) {
  const out = [];
  for (const id of world.awardToasts) {
    const award = awardOf(id);
    out.push({ name: award.name, says: award.says, dust: dustOf(id) });
  }
  world.awardToasts.length = 0;
  return out;
}

/** The names of a list of awards, in the order they were won (the card's line is built from this). */
export function namesOf(ids) {
  return ids.map((id) => nameOf(id));
}

/**
 * Clear what a run owns. Called from game/run.js `resetRun`: the save's list is not this run's to
 * forget, but what this run announced, what the last ending paid out, and anything still waiting
 * to be announced all belong to a run that has stopped being this one.
 */
export function resetAwards(world) {
  world.runAwards.length = 0;
  world.awardNews.length = 0;
  world.awardToasts.length = 0;
}
