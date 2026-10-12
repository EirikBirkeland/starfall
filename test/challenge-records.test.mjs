// A best under each rule (PLAN, After 1.0): what this save has scored under every challenge, the way
// the day keeps its own.
//
// Three halves. The first is the ledger on its own - what comes back out of the save, what the store
// refuses to put into it, and what `bankChallenge` decides to write. The second is one visit through the
// real game: a run under a rule banks its score at its ending, and an ordinary run banks nothing at
// all. The third is what the game says about the number - the title's rule line, the ending's card, and
// the codex's fifth rack, which is the one place all three rules can be read at once.
//
// The promise underneath all of it is the one the rules themselves make: a run flown under no rule pays
// for none of this. No bank, no word on any line, and the rack says NOT FLOWN YET about every row, which
// is what an ordinary save looked like before this file existed.
//
// One boot reads one save (tools/headless/harness.js), and `core/save.js` reads storage on every call
// and never caches, so a test can rewrite `game.storage` between two questions and the game reads the
// new document on the next one.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { remember } from '../src/core/save.js';
import { makeEnemy } from '../src/game/kinds.js';
import { STATE } from '../src/game/state.js';
import { refreshOffer } from '../src/game/upgrades.js';
import {
  CHALLENGES, bankChallenge, bestOf, bestsFromSave, cardWords, nameOf, saysOf, titleWords,
} from '../src/game/challenges.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SAVE_KEY = 'starfall.save';
const GUARD = 40;             // long enough for an ending's restart guard to be spent

const game = await bootGame({ root: ROOT, seed: 43, width: 1280, height: 720, audio: true });
const world = game.world;

const IDS = CHALLENGES.map((c) => c.id);

/** The rule's own sentence, out of the module that owns the words. */
const sentenceOf = (id) => titleWords({ challenge: id }).split('  \u00b7  ')[1];

function press(code) {
  game.key(code, true);
  game.key(code, false);
}

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

/** Put a body on the ship and run one frame: the run is over afterwards. */
function killTheShip() {
  const ship = game.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.dashLeft = 0;          // a dash is grace too, and a test can leave one running
  ship.fireTimer = 5;
  game.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.OVER);
}

/** Take the cards off the table, so a run stopped for a choice is flying again. */
function letTheRunGo() {
  world.pendingLevels = 0;
  world.offer.length = 0;
  refreshOffer(world);
}

/** Get to a screen a launch is answered on, whatever the run before was doing. */
function toAnEnding() {
  if (world.state === STATE.LEVEL) letTheRunGo();
  if (world.state === STATE.PLAY) killTheShip();
  frames(GUARD);
}

/**
 * Fly a run under `rule` (or under none), score exactly `score` on it, and end it. Answers what the
 * ending left on the world, which is where the card got its numbers from.
 */
function fly(score, rule) {
  toAnEnding();
  game.chooseChallenge(rule);
  press('Space');
  frames(2);
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run launched');
  world.score = score;
  killTheShip();
  return game.stats();
}

/** The save's own `challenges` section, written raw the way the game writes it. */
function writeBests(bests) {
  const doc = JSON.parse(game.storage[SAVE_KEY] || '{}');
  doc.version = 1;
  doc.challenges = { bests: bests };
  game.storage[SAVE_KEY] = JSON.stringify(doc);
}

/** Clear every record, so a test about one rule is not reading another rule's number. */
function clearRecords() {
  writeBests({});
}

/** One row of the codex's rack, by rule id. */
function rackRow(id) {
  return game.screen.rules[CHALLENGES.findIndex((c) => c.id === id)];
}

// ---------------------------------------------------------------------------
// The ledger: what comes back, and what the store will put in
// ---------------------------------------------------------------------------

test('a save that has flown nothing has no number for any rule', () => {
  clearRecords();
  assert.deepEqual(bestsFromSave(), {});
  for (const id of IDS) {
    assert.equal(bestOf(id), 0, nameOf(id) + ' has nothing to beat yet');
  }
  // ...and no rule at all has no record either, which is what makes an ordinary run's line empty.
  assert.equal(bestOf(''), 0);
});

test('a record comes back as the number that was put in, for the rule it was put under', () => {
  clearRecords();
  remember('challenges', { bests: { brittle: 1234 } });
  assert.equal(bestOf('brittle'), 1234);
  assert.equal(bestsFromSave().brittle, 1234, 'and the whole ledger sees it');
  for (const id of IDS) {
    if (id === 'brittle') continue;
    assert.equal(bestOf(id), 0, nameOf(id) + ' keeps its own record and none of this one');
  }
});

test('nonsense in the ledger is no record, and does not spoil its neighbours', () => {
  writeBests({ brittle: 'a lot', swift: 900 });
  assert.equal(bestOf('swift'), 900, 'the good entry survived the bad one');
  assert.equal(bestOf('brittle'), 0, 'a score that is a sentence is not a score');

  writeBests({ 'NOT A RULE ID': 100, grounded: 7 });
  assert.equal(bestOf('grounded'), 7);
  assert.equal(bestsFromSave()['NOT A RULE ID'], undefined, 'an id the game cannot name is not stored');

  writeBests({ brittle: 1.5 });
  assert.equal(bestOf('brittle'), 0, 'and a score is a whole number');

  writeBests({ brittle: -5 });
  assert.equal(bestOf('brittle'), 0, 'and it is not below nothing');

  writeBests('the whole thing is a word');
  assert.deepEqual(bestsFromSave(), {}, 'a ledger that is not a ledger is no ledger');
});

test('the store will not write a record it cannot read back', () => {
  clearRecords();
  assert.throws(() => remember('challenges', { bests: 'all of them' }),
    /refusing to remember challenges/);
  assert.throws(() => remember('challenges', { bests: { brittle: 'a lot' } }),
    /refusing to remember challenges/);
  assert.equal(remember('challenges', { bests: { brittle: 5 } }), true, 'and a real one goes in fine');
  assert.equal(bestOf('brittle'), 5);
});

test('banking follows the rule the run was flown under, and nothing else', () => {
  clearRecords();
  assert.equal(bankChallenge({ challenge: '', score: 1000 }), false,
    'a run under no rule banks nothing on any rule');
  assert.deepEqual(bestsFromSave(), {}, 'and the ledger is exactly as it was');

  const first = { challenge: 'brittle', score: 500 };
  assert.equal(bankChallenge(first), true, 'the first run under a rule sets its record');
  assert.equal(bestOf('brittle'), 500);

  // The same bargain the all-time best and the day keep: a run that is won, handed back and finally goes
  // down is banked twice, and the second ending only wins if the run came out bigger.
  const again = { challenge: 'brittle', score: 400 };
  assert.equal(bankChallenge(again), false, 'a smaller second ending does not');
  assert.equal(bestOf('brittle'), 500, 'and the rule keeps the bigger number');
  again.score = 900;
  assert.equal(bankChallenge(again), true, 'a bigger one is paid out');
  assert.equal(bestOf('brittle'), 900);

  // ...and a rule that has never been flown is not beaten by a number belonging to another one.
  assert.equal(bestOf('swift'), 0, 'the swift crowd has heard none of this');
});

test('a run that scored nothing banks nothing', () => {
  clearRecords();
  assert.equal(bankChallenge({ challenge: 'brittle', score: 0 }), false,
    'there is no zero to beat yet');
  assert.deepEqual(bestsFromSave(), {}, 'and no line says 0 as though somebody had scored it');
});

// ---------------------------------------------------------------------------
// The words the record is said in
// ---------------------------------------------------------------------------

test('a rule with no record says nothing about one', () => {
  clearRecords();
  for (const challenge of CHALLENGES) {
    assert.equal(sentenceOf(challenge.id), saysOf(challenge.id));
    assert.equal(titleWords({ challenge: challenge.id }),
      'CHALLENGE  ' + challenge.name + '  \u00b7  ' + saysOf(challenge.id));
    assert.doesNotMatch(cardWords({ challenge: challenge.id }), /BEST/,
      challenge.id + "'s card invented a number");
  }
});

test('a rule with a record says the number, and says whose it is', () => {
  clearRecords();
  writeBests({ brittle: 1234 });
  assert.equal(titleWords({ challenge: 'brittle' }),
    'CHALLENGE  ONE HULL  \u00b7  one touch and the run is over  \u00b7  1,234 BEST FOR THIS RULE');
  // The card, for a run that did not beat it: the standing number, so a player knows what they were
  // short of (game/daily.js's card line makes the same pair about the day).
  assert.equal(cardWords({ challenge: 'brittle', newChallengeBest: false }),
    'CHALLENGE \u00b7 ONE HULL \u00b7 one touch and the run is over \u00b7 1,234 BEST FOR THIS RULE');
  // ...and for one that did: the fact rather than the number, which is on the card already.
  assert.equal(cardWords({ challenge: 'brittle', newChallengeBest: true }),
    'CHALLENGE \u00b7 ONE HULL \u00b7 one touch and the run is over \u00b7 NEW BEST FOR THIS RULE');
  // A rule with no record is not said about at all, and an ordinary run says nothing anywhere.
  assert.equal(cardWords({ challenge: 'swift', newChallengeBest: false }),
    'CHALLENGE \u00b7 SWIFT CROWD \u00b7 ' + saysOf('swift'));
  assert.equal(titleWords({ challenge: '' }), '');
  assert.equal(cardWords({ challenge: '' }), '');
});

test('the record is a claim about the rule, not about the save or the day', () => {
  // A number nowhere near the all-time best can still be the rule's own best, which is the whole reason
  // it is kept separately and said separately.
  clearRecords();
  writeBests({ swift: 250 });
  assert.equal(cardWords({ challenge: 'swift', newChallengeBest: false }),
    'CHALLENGE \u00b7 SWIFT CROWD \u00b7 ' + saysOf('swift') + ' \u00b7 250 BEST FOR THIS RULE');
});

// ---------------------------------------------------------------------------
// The visit: an ending banks, and three places say it
// ---------------------------------------------------------------------------

test('a run under a rule banks its score at its ending, and says so', () => {
  clearRecords();
  const stats = fly(4321, 'brittle');
  assert.equal(stats.challenge, 'brittle');
  assert.equal(world.newChallengeBest, true, 'and the ending knew it was a new one');
  assert.equal(bestOf('brittle'), 4321, 'the number is in the save, not just on the card');
  assert.match(game.screen.finalChallenge, /NEW BEST FOR THIS RULE$/,
    'the death card says so: ' + game.screen.finalChallenge);

  const worse = fly(100, 'brittle');
  assert.equal(worse.challenge, 'brittle');
  assert.equal(world.newChallengeBest, false, 'a smaller run did not beat it');
  assert.equal(bestOf('brittle'), 4321);
  assert.match(game.screen.finalChallenge, /4,321 BEST FOR THIS RULE$/,
    'and the card says what it was short of: ' + game.screen.finalChallenge);

  const better = fly(99999, 'brittle');
  assert.equal(better.challenge, 'brittle');
  assert.equal(world.newChallengeBest, true);
  assert.equal(bestOf('brittle'), 99999);
});

test('an ordinary run banks nothing and says nothing about a rule', () => {
  clearRecords();
  const before = bestsFromSave();
  const stats = fly(5000, '');
  assert.equal(stats.challenge, '', 'no rule was flying');
  assert.equal(world.newChallengeBest, false, 'so nothing was beaten');
  assert.deepEqual(bestsFromSave(), before, 'and the ledger was not even asked');
  assert.equal(game.screen.finalChallenge, '', 'the card is the card it always was');
  assert.equal(game.screen.titleChallenge, '', 'and so is the title');
});

test('the rule that was flown is the rule that is banked', () => {
  clearRecords();
  fly(700, 'swift');
  assert.equal(bestOf('swift'), 700);
  assert.equal(bestOf('brittle'), 0, 'the other rules kept their nothing');
  fly(800, 'grounded');
  assert.equal(bestOf('swift'), 700, 'and a run under one of them did not move this one');
  assert.equal(bestOf('grounded'), 800);
});

test('a new run forgets that the last one beat the rule', () => {
  clearRecords();
  fly(600, 'brittle');
  assert.equal(world.newChallengeBest, true, 'that ending did beat it');
  toAnEnding();                  // the restart guard, so the next launch is answered
  press('Space');
  frames(2);
  assert.equal(game.stats().state, game.STATE.PLAY, 'and this run launched');
  assert.equal(world.newChallengeBest, false,
    'which has not beaten anything yet - the flag is per run');
  killTheShip();
});

test('the title says what the rule it was set to is worth', () => {
  clearRecords();
  fly(4321, 'brittle');           // the ending banks 4,321 under ONE HULL
  // The key is the only hand that paints this line, so the test uses the key. One press from nothing
  // lands on ONE HULL, which is the ladder the table is written in.
  game.chooseChallenge('');
  press('KeyX');
  assert.equal(game.stats().challenge, 'brittle');
  assert.equal(game.screen.titleChallenge, titleWords(world), 'the glass says what the module says');
  assert.match(game.screen.titleChallenge, /4,321 BEST FOR THIS RULE$/,
    'the title kept the number quiet: ' + game.screen.titleChallenge);
  // A rule with no record is set without a number being invented for it.
  press('KeyX');
  press('KeyX');
  assert.equal(game.stats().challenge, 'swift');
  assert.equal(game.screen.titleChallenge, 'CHALLENGE  SWIFT CROWD  \u00b7  ' + saysOf('swift'));
  // The last rule on the ladder is said the same way, its own sentence built out of its own number.
  const last = CHALLENGES[CHALLENGES.length - 1];
  press('KeyX');
  assert.equal(game.stats().challenge, last.id);
  assert.equal(game.screen.titleChallenge,
    'CHALLENGE  ' + last.name + '  \u00b7  ' + saysOf(last.id),
    'the last rule on the ladder is not said: ' + game.screen.titleChallenge);
  press('KeyX');                  // ...and back to no rule, which says nothing at all
  assert.equal(game.screen.titleChallenge, '');
});

test('the codex rack says what every rule is worth, and which have never been flown', () => {
  clearRecords();
  fly(4321, 'brittle');
  toAnEnding();
  press('KeyC');
  frames(1);
  const rows = game.screen.rules;
  assert.equal(rows.length, CHALLENGES.length, 'one row per rule, and no more');
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].name, CHALLENGES[i].name, 'in the order the key cycles them');
    // Every row says what the rule does, flown or not: this is the one place all three can be read
    // without cycling them blind.
    assert.ok(rows[i].says.indexOf(saysOf(CHALLENGES[i].id)) >= 0,
      rows[i].name + ' does not say what it does: ' + rows[i].says);
  }
  assert.equal(rackRow('brittle').says.indexOf('4,321'), 0,
    'the rule that was flown leads with its number');
  assert.equal(rackRow('brittle').unknown, false, 'and it is lit');
  for (const id of IDS) {
    if (id === 'brittle') continue;
    const row = rackRow(id);
    assert.match(row.says, /^NOT FLOWN YET/, nameOf(id) + ' has no record and says so: ' + row.says);
    assert.equal(row.unknown, true, 'and gives up its glow till it has');
  }
  press('KeyC');
});

test('the rack is repainted by the ending that changed it, without being opened again', () => {
  clearRecords();
  fly(1000, 'brittle');
  toAnEnding();
  press('KeyC');
  frames(1);
  assert.equal(rackRow('brittle').says.indexOf('1,000'), 0);
  press('KeyC');
  fly(2000, 'brittle');
  // The panel is closed and the number still moved under it, so the card had to repaint the rack the
  // same way it repaints the codex, the log and the purse.
  assert.equal(rackRow('brittle').says.indexOf('2,000'), 0,
    'the rack is one run behind its own card: ' + rackRow('brittle').says);
  assert.equal(rackRow('brittle').unknown, false);
});

test('the ledger travels with the card, so the rack cannot disagree with it', () => {
  clearRecords();
  fly(3500, 'swift');
  assert.equal(bestOf('swift'), 3500);
  // The card said this run's number was new; the rack the same ending painted says it is what there is.
  assert.match(game.screen.finalChallenge, /NEW BEST FOR THIS RULE$/);
  assert.equal(rackRow('swift').says.indexOf('3,500'), 0);
});

test('the ledger is written at an ending and never while a run is flying', () => {
  // Say it in a test because the alternative is a record written from inside a step, which would be a
  // storage write sixty times a second (core/save.js reads the document on every call, on purpose).
  clearRecords();
  toAnEnding();
  game.chooseChallenge('brittle');
  press('Space');
  frames(2);
  const before = game.storage[SAVE_KEY];
  frames(120);
  assert.equal(game.storage[SAVE_KEY], before, 'a flying run writes nothing');
  if (world.state === STATE.LEVEL) letTheRunGo();
  world.score = 100;            // a run that scored nothing has nothing to bank, and that is a fact
  killTheShip();
  assert.notEqual(game.storage[SAVE_KEY], before, 'and its ending does');
  assert.ok(bestOf('brittle') > 0, 'and what it wrote was the record');
  game.chooseChallenge('');
});
