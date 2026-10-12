// A visit that arrived with a run log already in it (PLAN 3.7, game/history.js).
//
// The rack's first words come from a document and not from anything that happened on this page -
// which is the half of the feature a player meets on most visits: most of them do not add twenty
// runs, they open on a log that is already full and carry on from there. One boot, one save, for the
// usual reason (tools/headless/harness.js): a second `bootGame` here would be a second visit reading
// the first one's world, and not a visit that arrived with anything.
//
// The log it arrives with is longer than this build keeps, so the read is tested as well as the paint,
// and three of its rows are deliberately awkward. One names a ship this build has never heard of - a
// log written by a newer page, holding a ship that has not been invented here yet, which the store
// keeps because it is a well-formed name and it is not the store's business to know the game's ships
// (core/save.js `records`). The rack still has to print that row, and say what it can.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { logKeeps } from '../src/game/history.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const KEEP = logKeeps();
const DOT = '   \u00b7   ';

/** The rows every assertion here is about: a cleared one, one in an unknown ship, an empty, and two
    that were flown under a rule - one of them under a rule this build has never heard of, which the
    store keeps for the same reason it keeps the unknown ship: it is a well-formed name (game/history.js). */
const AWKWARD = [
  { seed: 999, ship: 'volt', seconds: 61, score: 4321, won: true },
  { seed: 3031, ship: 'sandpiper', seconds: 5, score: 10, won: false },
  { seed: 7, ship: 'wisp', seconds: 0, score: 0, won: false },
  { seed: 808, ship: 'wisp', seconds: 40, score: 90000, won: false, rule: 'brittle' },
  { seed: 909, ship: 'volt', seconds: 12, score: 500, won: true, rule: 'upside-down' },
];

/** Enough more rows to arrive past what this build keeps, oldest last (seeds 400 up). */
const FILLER = [];
for (let i = 0; i < KEEP + 6; i++) {
  FILLER.push({ seed: 400 + i, ship: 'wisp', seconds: i, score: i * 10, won: false });
}

const CAME_WITH = { version: 1, runs: { log: AWKWARD.concat(FILLER) } };

const game = await bootGame({
  root: ROOT,
  seed: 11,
  storage: { 'starfall.save': JSON.stringify(CAME_WITH) },
});

function saveIn() {
  return JSON.parse(game.storage['starfall.save']);
}

function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

test('the log it arrived with is the log it opens on, newest first, up to what this build keeps', () => {
  assert.ok(CAME_WITH.runs.log.length > KEEP, 'it has to arrive with more than this build keeps');
  assert.equal(KEEP, BALANCE.history.keep);
  assert.equal(game.stats().runs, KEEP, 'and the visit holds what this build can keep, and no more');

  // Every row is the row that was stored, in the order it was left: nothing is sorted, deduped or
  // skipped, and the rows past this build's number were never read at all.
  assert.deepEqual(game.stats().runLog, CAME_WITH.runs.log.slice(0, KEEP));

  assert.deepEqual(game.screen.pastRuns.slice(0, 5), [
    { name: 'SEED 999', says: 'VOLT' + DOT + '1m01s' + DOT + '4,321' + DOT + 'CLEARED' },
    // The ship this build does not know is named by its own id rather than throwing the rack away,
    // and a run that was not a win says nothing about clearing anything.
    { name: 'SEED 3031', says: 'SANDPIPER' + DOT + '5s' + DOT + '10' },
    // A run that scored nothing in no seconds at all is still a run, and gets its line.
    { name: 'SEED 7', says: 'WISP' + DOT + '0s' + DOT + '0' },
    // A run flown under a rule says which, next to the score it was scored under - the row is not
    // this build's first, and the rack does not get to forget that (game/challenges.js).
    { name: 'SEED 808', says: 'WISP' + DOT + '40s' + DOT + '90,000' + DOT + 'ONE HULL' },
    // ...and a rule this build has never met is named by its own text, the same way an unknown ship
    // is, because the row is the save's and the save is allowed to be newer than the page.
    { name: 'SEED 909', says: 'VOLT' + DOT + '12s' + DOT + '500' + DOT + 'UPSIDE-DOWN' + DOT + 'CLEARED' },
  ]);
  assert.equal(game.screen.pastRuns.length, KEEP, 'and the rack painted no row the visit does not hold');
  assert.equal(game.screen.pastRuns[KEEP - 1].name, 'SEED ' + (400 + KEEP - AWKWARD.length - 1),
    'the last row on the glass is the last one that was read');
});

test('the rack is on the codex, which C puts up over the title', () => {
  press('KeyC');
  assert.equal(game.screen.codexHidden, false, 'the panel came up');
  assert.equal(game.screen.pastRuns.length, KEEP, 'and it is the same rack, painted already');
  press('KeyC');
  assert.equal(game.screen.codexHidden, true);
});

test('the runs of this visit go on top, and the oldest rows finally come off the bottom', async () => {
  playOneRun(game, { maxSeconds: 600, policy: 'naive' });
  const stats = game.stats();
  assert.equal(stats.state, game.STATE.OVER);
  assert.equal(stats.runs, KEEP, 'one in, and as many off the bottom as this build cannot keep');

  assert.equal(game.screen.pastRuns.length, KEEP);
  assert.equal(game.screen.pastRuns[0].name, 'SEED ' + stats.seed, 'the new run is at the top');
  assert.equal(game.screen.pastRuns[1].name, 'SEED 999', 'and the log underneath it is untouched');
  assert.equal(game.screen.pastRuns[KEEP - 1].name, 'SEED ' + (400 + KEEP - AWKWARD.length - 2),
    'and the bottom row is one the visit read in, slid down one and not off the end');

  // The run this visit flew stood under no rule, so its row says the three things a plain row says -
  // the same three a row written before rules existed says, which is the whole trick of the field
  // being an absent one instead of a word for "none" (core/save.js `KINDS.optional`).
  assert.equal(game.screen.pastRuns[0].says.split(DOT).length, 3);
  assert.equal(game.screen.pastRuns[1].says.split(DOT).length, 4, 'and the cleared row keeps its four');

  // The write carries this build's twenty: the new row, nineteen of the ones that came in, and the
  // ship this page cannot name riding along with all of them - a row this build cannot name is still
  // this save's row, and it is not this page's to lose.
  const written = saveIn().runs.log;
  assert.equal(written.length, KEEP);
  assert.equal(written[0].seed, stats.seed);
  assert.deepEqual(written.slice(1), CAME_WITH.runs.log.slice(0, KEEP - 1));
  assert.equal(written.map((run) => run.ship).indexOf('sandpiper') > 0, true, 'it rode along');
  assert.equal(written[5].rule, 'upside-down', 'and so did the rule this page cannot name');
  assert.equal('rule' in written[0], false, 'while the plain run it just flew wrote no rule at all');
});
