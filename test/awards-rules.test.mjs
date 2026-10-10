// The awards' rules (PLAN 3.7, game/awards.js).
//
// Three things are proved here, and none of them needs a browser:
//
//   **The table is honest.** Every award has a price row, every price row has an award, every id is
//   something the save would take, and the numbers the rules read are the numbers in the table -
//   including the one row whose number is a copy of the boss schedule's length.
//
//   **Every award can be earned.** Each of the thirty gets a world state that earns it, and the
//   test asserts *that award* was paid for it. A rule that reads a field nobody ever writes, or a
//   threshold no run can reach, is an award that will never be given and never be noticed missing.
//
//   **The two passes do their two jobs.** The live pass announces once and only once and spends
//   nothing; the ending pays what the run earned, pays it once per save, and pays the rules that
//   only mean something about a run that has stopped.
//
// The glass - the plate, the card, the purse on the title - is test/awards.test.mjs. Nothing here
// has a browser: `core/save.js` finds no storage in a bare Node process and writes nothing, which
// is its own test (the same bargain test/codex-rules.test.mjs strikes).

import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { SHIPS } from '../src/game/ships.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';
import { world } from '../src/game/world.js';
import { newRanks } from '../src/game/upgrades.js';
import { clearCues, drainCues } from '../src/game/cues.js';
import {
  AWARDS, AWARD_IDS, bankAwards, dustOf, dustTotal, nameOf, resetAwards,
  takeAwardToasts, updateAwards, wasWon, wonFromSave, wonShare,
} from '../src/game/awards.js';

/** What the store will accept as a name (core/save.js). An award id that is not one is an award
    that can never be remembered, and would be won again and again for nothing. */
const SAVE_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

/**
 * A visit with nothing won, and a run that has earned nothing.
 *
 * `world.awards` is the save's ledger and would otherwise carry over from the last test in this
 * file, which is the one piece of visit state the scripted door does not reset for us.
 */
function visit(seed) {
  const field = scriptedRun(seed);
  field.awards.length = 0;
  field.upgrades = newRanks();
  resetAwards(field);
  clearCues();
  return field;
}

/** What the price sheet says this row has to reach. */
function need(id) {
  return BALANCE.awards.rows[id].need;
}

/** Run the live pass the way the step does, and say what it announced. */
function announce(field, times) {
  const count = times === undefined ? 1 : times;
  for (let i = 0; i < count; i++) updateAwards(field);
  return takeAwardToasts(field).map((plate) => plate.name);
}

// --- The table ------------------------------------------------------------------------

test('the table and the price sheet are the same list', () => {
  const priced = Object.keys(BALANCE.awards.rows);
  assert.deepEqual(AWARD_IDS.slice().sort(), priced.slice().sort(),
    'every award has a price, and every price has an award');
  assert.equal(new Set(AWARD_IDS).size, AWARD_IDS.length, 'no id is in the table twice');
});

test('every award is a row a save could remember and a plate could print', () => {
  for (const award of AWARDS) {
    assert.ok(SAVE_NAME.test(award.id), award.id + ' is not a save name');
    assert.ok(award.name.length > 0, award.id + ' has a name');
    assert.ok(award.says.length > 0, award.id + ' says something');
    assert.ok(award.live !== null || award.last !== null,
      award.id + ' has a rule, or nothing will ever give it');
    // The prose spells its threshold out ("a thousand bodies"), so a digit in it is a sentence
    // that has already drifted from the number in BALANCE.
    assert.doesNotMatch(award.says, /[0-9]/, award.id + ' spells its number in words');
    // ...and it is a sentence and not a shout. A proper name borrowed from another table (a ship's,
    // which is written in capitals there) is allowed to keep its own face.
    assert.equal(award.says[0], award.says[0].toLowerCase(), award.id + ' starts in lower case');
  }
  // The whole table has to fit in the save's ceiling for a list of names (core/save.js), and PLAN
  // asks for "around thirty": too few is an empty hangar and too many is a list nobody finishes.
  assert.ok(AWARDS.length >= 25, 'there are ' + AWARDS.length + ' awards, and that is too few');
  assert.ok(AWARDS.length <= 64, 'there are ' + AWARDS.length + ' and the save holds 64');
});

test('every price is a whole of stardust, and one award is a run and not a fortune', () => {
  let all = 0;
  for (const id of AWARD_IDS) {
    const line = BALANCE.awards.rows[id];
    assert.ok(Number.isInteger(line.need) && line.need >= 0, id + ' has a threshold');
    assert.ok(Number.isInteger(line.dust) && line.dust > 0, id + ' pays something');
    all += line.dust;
  }
  // The whole table is worth less than the hangar's dearest ship plus a ladder of perks: an award
  // is a bonus on the way to the things you can buy, and not a way to buy them (BALANCE.stardust
  // and BALANCE.ships are where both sides of that are written).
  assert.ok(all < BALANCE.ships.brood.cost * 2,
    'the whole table pays ' + all + ', which is too much next to a ship');
  assert.equal(dustTotal([]), 0);
  assert.equal(dustTotal(['century', 'reaper']),
    BALANCE.awards.rows.century.dust + BALANCE.awards.rows.reaper.dust);
});

test('the fight awards are the schedule the game actually fields', () => {
  // One row of the price sheet is a copy of a fact that lives somewhere else - how many fights are
  // scheduled - and a copy is only honest while something checks it.
  assert.equal(need('every-fight'), BALANCE.bosses.schedule.length);
  assert.equal(need('first-fight'), 1);
  // And the five "win it in this ship" rows are named after the ships, so a ship added to the
  // hangar cannot be left out of the awards, and a ship taken away cannot be an award for nothing.
  const wins = AWARDS.filter((award) => award.id.endsWith('-cleared')
    && award.id !== 'arena-cleared');
  assert.equal(wins.length, SHIPS.length, 'one win award per ship on the rack');
  for (const award of wins) {
    const ship = award.id.slice(0, -'-cleared'.length);
    assert.equal(award.name, BALANCE.ships[ship].name + ' CLEARED');
    assert.ok(award.says.indexOf(BALANCE.ships[ship].name) > 0, 'and says which one it is');
  }
});

test('an unknown award is said out loud, not answered with undefined', () => {
  assert.throws(() => dustOf('not-an-award'), /no price row/);
  assert.throws(() => nameOf('not-an-award'), /no award is called/);
});

// --- The live pass --------------------------------------------------------------------

test('a live rule is announced once, spends nothing, and queues its chime', () => {
  const field = visit(2);
  field.kills = need('century');
  assert.deepEqual(announce(field), ['CENTURY']);

  // The chime went out with the plate: the run asked for the sound (game/cues.js) and the audio
  // layer has not even been involved yet.
  const cues = [];
  drainCues((cue) => cues.push(cue));
  assert.equal(cues.length, 1);
  assert.equal(cues[0].kind, 'chord');

  // Nothing was spent or changed except the two lists.
  assert.equal(field.dust, 0, 'the purse is the ending\'s business');
  assert.equal(field.awards.length, 0, 'the save is not written on the way');
  assert.deepEqual(field.runAwards, ['century']);

  // And the same rule, still true a step later, says nothing twice.
  updateAwards(field);
  updateAwards(field);
  assert.equal(field.runAwards.length, 1);
  assert.equal(takeAwardToasts(field).length, 0);
  assert.equal(cues.length, 1, 'and no second chime either');
});

test('an award the save already has is never announced again', () => {
  const field = visit(3);
  field.awards.push('century');
  field.kills = need('century');
  assert.deepEqual(announce(field), []);
  assert.equal(field.runAwards.length, 0);
  assert.equal(bankAwards(field), 0, 'and it is not paid for twice either');
});

test('the step runs the live pass, so a run cannot be played without it', () => {
  // `updateAwards` is called from game/world.js `stepRun`. That is the wiring this asserts: the
  // scripted world steps the real step, and the award arrives on its own.
  const field = visit(4);
  field.shardStreak.count = need('magnet');
  stepTheWorld();
  assert.deepEqual(field.runAwards, ['magnet']);
  assert.equal(takeAwardToasts(field).length, 1);
});

test('what a run announced is cleared with the run, and what the save has is not', () => {
  const field = visit(5);
  field.kills = need('century');
  announce(field);
  bankAwards(field);
  assert.equal(wasWon(field, 'century'), true);
  resetAwards(field);
  assert.equal(field.runAwards.length, 0);
  assert.equal(field.awardNews.length, 0);
  assert.equal(field.awardToasts.length, 0);
  assert.deepEqual(field.awards, ['century'], 'the save keeps what it won');
  assert.deepEqual(wonFromSave(), [], 'and a visit with no storage reads an empty ledger');
});

// --- The ending -----------------------------------------------------------------------

test('the ending pays what the run earned, and only once per save', () => {
  const field = visit(6);
  field.kills = need('century');
  field.score = need('bright-spark');
  updateAwards(field);
  assert.deepEqual(field.runAwards.slice().sort(), ['bright-spark', 'century']);
  assert.equal(takeAwardToasts(field).length, 2, 'both were announced while it was flying');

  const purse = field.dust;
  const paid = bankAwards(field);
  assert.equal(paid, 2);
  assert.deepEqual(field.awardNews.slice().sort(), ['bright-spark', 'century']);
  assert.equal(field.dust, purse + dustTotal(['bright-spark', 'century']),
    'the purse grew by exactly what the two pay');
  assert.deepEqual(takeAwardToasts(field), [], 'and the ending queued no plate of its own');

  // The same run, ending again: won, handed back and finally beaten is one run (game/stardust.js
  // argues the identical case about the score).
  assert.equal(bankAwards(field), 0);
  assert.equal(field.awardNews.length, 0, 'and the second ending has nothing to say about it');
  assert.equal(field.dust, purse + dustTotal(['bright-spark', 'century']));
});

test('an award earned on the step that ends the run is still paid', () => {
  // The live pass runs at the end of the step, and the fights run before it: the last fight coming
  // down *is* the run ending, so the ending could not rely on the pass having seen it.
  const field = visit(7);
  field.bossesDown = need('first-fight');
  assert.equal(field.runAwards.length, 0, 'no step happened after it became true');
  assert.equal(bankAwards(field), 1);
  assert.deepEqual(field.awardNews, ['first-fight']);
});

test('the awards that only an ending can know are paid there, and never announced', () => {
  const field = visit(8);
  field.won = true;
  field.tally.dashes = 0;
  field.tally.hullLost = 0;
  const paid = bankAwards(field);
  assert.equal(paid, 4, 'the win, in this ship, without a dash, and without a scratch');
  assert.deepEqual(field.awardNews.slice().sort(),
    ['arena-cleared', 'flawless', 'no-dashing', 'wisp-cleared']);
  assert.deepEqual(takeAwardToasts(field), [], 'and not one plate, because the card says it');
});

test('an ending that was not a win pays for what it was, and not for a win', () => {
  const field = visit(9);
  field.tally.dashes = 0;
  field.tally.hullLost = 0;
  field.elapsed = need('untouched');
  bankAwards(field);
  // UNTOUCHED needs the clock as well as the hull, and the clock it needs is the one five minutes
  // is, so FIVE MINUTES rides along with it. What is *not* in here is any of the four awards a win
  // is worth, because this run only stopped.
  assert.ok(field.awardNews.indexOf('untouched') >= 0, 'the five clean minutes were earned');
  assert.ok(field.awardNews.indexOf('five-minutes') >= 0);
  for (const id of ['arena-cleared', 'flawless', 'no-dashing', 'wisp-cleared']) {
    assert.ok(field.awardNews.indexOf(id) < 0, id + ' is a win, and this was not one');
  }
});

test('UNTOUCHED needs the clock and the hull, and not one of them', () => {
  const short = visit(10);
  short.elapsed = need('untouched') - 1;
  assert.equal(bankAwards(short), 0, 'a clean run that was not long is not UNTOUCHED');

  const scratched = visit(11);
  scratched.elapsed = need('untouched') * 2;
  scratched.tally.hullLost = 1;
  bankAwards(scratched);
  assert.ok(scratched.awardNews.indexOf('five-minutes') >= 0, 'the minutes were earned');
  assert.ok(scratched.awardNews.indexOf('untouched') < 0,
    'five minutes with a pip lost is not UNTOUCHED');
});

// --- Every rule -----------------------------------------------------------------------

/**
 * One world state per award, and the award it is supposed to earn. Each case is `field -> nothing`,
 * then either the live pass or the ending has to hand that id over.
 *
 * Some of these earn more than one award (a level fifty run has also been level ten), which is why
 * they assert that the one being tested is there and not that nothing else is.
 */
const CASES = [
  ['century', (f) => { f.kills = need('century'); }],
  ['thousandfold', (f) => { f.kills = need('thousandfold'); }],
  ['reaper', (f) => { f.kills = need('reaper'); }],
  ['bright-spark', (f) => { f.score = need('bright-spark'); }],
  ['supernova', (f) => { f.score = need('supernova'); }],
  ['starfall', (f) => { f.score = need('starfall'); }],
  ['warmed-up', (f) => { f.player.level = need('warmed-up'); }],
  ['built-different', (f) => { f.player.level = need('built-different'); }],
  ['old-hand', (f) => { f.player.level = need('old-hand'); }],
  ['five-minutes', (f) => { f.elapsed = need('five-minutes'); }],
  ['quarter-hour', (f) => { f.elapsed = need('quarter-hour'); }],
  ['collector', (f) => { f.shardsCollected = need('collector'); }],
  ['magnet', (f) => { f.shardStreak.count = need('magnet'); }],
  ['gold-touch', (f) => { f.tally.eliteKilled = need('gold-touch'); }],
  ['swarm-breaker', (f) => { f.tally.kinds.swarmling = { arrived: 900, killed: need('swarm-breaker') }; }],
  ['first-fight', (f) => { f.bossesDown = need('first-fight'); }],
  ['every-fight', (f) => { f.bossesDown = need('every-fight'); }],
  ['arena-cleared', (f) => { f.won = true; }],
  ['wisp-cleared', (f) => { f.won = true; f.ship = 'wisp'; }],
  ['bulwark-cleared', (f) => { f.won = true; f.ship = 'bulwark'; }],
  ['volt-cleared', (f) => { f.won = true; f.ship = 'volt'; }],
  ['needle-cleared', (f) => { f.won = true; f.ship = 'needle'; }],
  ['brood-cleared', (f) => { f.won = true; f.ship = 'brood'; }],
  ['no-dashing', (f) => { f.won = true; f.tally.dashes = 0; }],
  ['untouched', (f) => { f.elapsed = need('untouched'); }],
  ['flawless', (f) => { f.won = true; f.tally.hullLost = 0; }],
  ['streaked', (f) => { f.tally.dashes = need('streaked'); }],
  ['in-combination', (f) => { f.upgrades.thermalShock = 1; }],
  ['full-kit', (f) => { f.upgrades.damage = need('full-kit'); }],
  ['past-the-end', (f) => {
    f.endless = true;
    f.elapsed = need('past-the-end');
    f.endlessAt = 0;
  }],
];

test('every award on the table can be earned by the thing it describes', () => {
  const ids = CASES.map((entry) => entry[0]);
  assert.deepEqual(ids.slice().sort(), AWARD_IDS.slice().sort(),
    'the cases below are the table: none missing, none extra');

  for (const [id, seedTheWorld] of CASES) {
    const field = visit(20 + ids.indexOf(id));
    seedTheWorld(field);
    // Live rules are announced by the pass; the rest are only true of a run that has stopped, so
    // they are asked at the ending. Either way the award has to arrive.
    if (updateAwardsDoesEarn(id)) {
      updateAwards(field);
      const plates = takeAwardToasts(field).map((plate) => plate.name);
      assert.ok(plates.indexOf(nameOf(id)) >= 0, id + ' was not announced: ' + plates);
    }
    // ...and the ending is what credits it, whichever pass noticed it first.
    bankAwards(field);
    assert.ok(field.awardNews.indexOf(id) >= 0 || field.awards.indexOf(id) >= 0,
      id + ' was never credited');
    assert.ok(wasWon(field, id), id + ' was not left in the ledger');
  }
});

/** Is this award's rule one the live pass asks? (Read off the table, not guessed from the case.) */
function updateAwardsDoesEarn(id) {
  for (const award of AWARDS) if (award.id === id) return award.live !== null;
  throw new Error('no award is called ' + id);
}

test('a rule that is not reached is not paid, and says nothing', () => {
  const field = visit(60);
  field.kills = need('century') - 1;
  field.player.level = need('warmed-up') - 1;
  assert.deepEqual(announce(field), []);
  assert.equal(bankAwards(field), 0);
  assert.deepEqual(wonShare(field), { won: 0, of: AWARDS.length });
});

test('the ledger counts what the save has, which is what a title line prints', () => {
  const field = visit(61);
  assert.deepEqual(wonShare(field), { won: 0, of: AWARDS.length });
  field.awards.push('century', 'warmed-up');
  assert.deepEqual(wonShare(field), { won: 2, of: AWARDS.length });
});
