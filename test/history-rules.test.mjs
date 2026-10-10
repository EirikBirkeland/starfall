// The run log's rules (PLAN 3.7, game/history.js): one row per run, newest first, and as many of
// them as the game keeps and no more.
//
// This is the simulation's half, driven through the real doors - `endRun` and `winRun` in
// game/run.js, which are the only places a run is banked and so the only places a row can come
// from. What the panel says about the rows is test/history.test.mjs; that a wrecked log in somebody's
// storage is read as no log at all is test/save.test.mjs.
//
// The world is the scripted one (tools/headless/scripted.js): one run at a time, no crowd, and the
// numbers a row is made of are set here rather than earned, because this file is about what a row
// records and not about how a run comes by those numbers. One world per process, so each test also
// says "this visit has flown nothing yet" - the log belongs to the save and `resetRun` rightly leaves
// it alone, which is the one thing a test about the log has to undo on its own.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import {
  continueRun, endRun, resetRun, victoryCardIsAnswerable, winRun,
} from '../src/game/run.js';
import { logKeeps, runLedger } from '../src/game/history.js';
import { setShip } from '../src/game/ships.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const KEEP = BALANCE.history.keep;

// How many steps to stand waiting for a win's card to become answerable. The guard is a couple of
// seconds and a step is a 1/120th of one, so this is a good deal more than it needs - and the wait
// is bounded, because a regression has to fail and not hang the box (session 9's lesson).
const GUARD_WAIT = 4000;

/** A world on a visit that has flown nothing yet. See the note above about whose list the log is. */
function freshVisit(seed) {
  const world = scriptedRun(seed);
  world.pastRuns.length = 0;
  return world;
}

/** Say what this run was worth and how long it flew, which is all a row is made of. The run is ended
    by whichever door is being tested - `endRun` or `winRun` - because that is where rows come from. */
function flyTheRun(world, seed, score, seconds) {
  world.seed = seed;
  world.score = score;
  world.elapsed = seconds;
}

test('a finished run writes one row, and the row is the run', () => {
  const world = freshVisit(1);
  flyTheRun(world, 4242, 12345, 95.6);
  endRun(world);

  assert.equal(world.state, STATE.OVER);
  assert.equal(world.pastRuns.length, 1, 'the first run of a save is the first row');
  assert.deepEqual(world.pastRuns[0], {
    seed: 4242, ship: 'wisp', seconds: 95, score: 12345, won: false,
  }, 'the seed, the ship, the clock, the score, and no win');
  // The seconds are the run's own clock rounded down: a run is as long as the whole seconds it flew.
  assert.equal(world.pastRuns[0].seconds, Math.floor(95.6));
});

test('the row names the ship the run flew, not the one the next run will', () => {
  const world = freshVisit(2);
  setShip(world, 'needle');
  flyTheRun(world, 8, 500, 30);
  endRun(world);
  assert.equal(world.pastRuns[0].ship, 'needle');

  // ...and the next run flies whatever it is given, so the log can hold five different ships.
  resetRun(world);
  setShip(world, 'bulwark');
  flyTheRun(world, 9, 500, 30);
  endRun(world);
  assert.deepEqual(world.pastRuns.map((run) => run.ship), ['bulwark', 'needle'],
    'newest first, each row keeping the body it was flown in');
});

test('a run that was won, flown on and finally buried is one row, not two', () => {
  // The case the whole design turns on: a win banks the run, and the death afterwards banks the same
  // run again (game/run.js `bankRun`). Two rows would say the run happened twice; keeping the first
  // would say it ended at the win, which is the one thing that turned out not to be true of it.
  const world = freshVisit(3);
  flyTheRun(world, 77, 50000, 900);
  winRun(world);
  assert.equal(world.state, STATE.WON);
  assert.equal(world.pastRuns.length, 1);
  assert.equal(world.pastRuns[0].won, true, 'a cleared run says so');
  assert.equal(world.pastRuns[0].score, 50000);

  // The card goes up, the guard is spent, and the arena is handed back (game/run.js `continueRun`).
  let waited = 0;
  while (!victoryCardIsAnswerable(world) && waited < GUARD_WAIT) {
    stepTheWorld();
    waited += 1;
  }
  assert.ok(victoryCardIsAnswerable(world), "the win's card never became answerable");
  assert.equal(continueRun(world), true);
  assert.equal(world.pastRuns.length, 1, 'the hand-back wrote nothing');

  flyTheRun(world, 77, 90000, 1200);
  endRun(world);
  assert.equal(world.pastRuns.length, 1, 'one run, one row, however many times it stopped');
  assert.deepEqual(world.pastRuns[0], {
    seed: 77, ship: 'wisp', seconds: 1200, score: 90000, won: true,
  }, 'and the row tells the truth about how the run actually ended');
});

test('the log keeps the last twenty runs, newest first', () => {
  const world = freshVisit(4);
  for (let i = 1; i <= KEEP + 5; i++) {
    resetRun(world);              // the same door a new run comes in by (game/run.js)
    flyTheRun(world, 1000 + i, i * 100, i * 10);
    endRun(world);
  }

  assert.equal(logKeeps(), KEEP, 'and the game says how many it keeps');
  assert.equal(world.pastRuns.length, KEEP, 'five runs fell off the end, and no more');
  assert.equal(world.pastRuns[0].seed, 1000 + KEEP + 5, 'the run that just ended is at the top');
  assert.equal(world.pastRuns[KEEP - 1].seed, 1006, 'and the sixth run is not on the list at all');

  // Twenty rows, each one the run it names: nothing bled from one into the next.
  const rows = runLedger(world);
  assert.equal(rows.length, KEEP);
  for (let i = 0; i < KEEP; i++) {
    const number = KEEP + 5 - i;
    assert.equal(rows[i].seed, 1000 + number, 'row ' + i + ' is run ' + number);
    assert.equal(rows[i].score, number * 100);
    assert.equal(rows[i].seconds, number * 10);
  }
});

test('the same seed flown twice is two rows', () => {
  // A pinned address bar plays one arena over and over, and the log is a record of the playing and
  // not of the arena: nothing here is deduped, and the two rows say which run was the later one.
  const world = freshVisit(5);
  for (const score of [100, 200]) {
    resetRun(world);
    flyTheRun(world, 20261006, score, 20);
    endRun(world);
  }
  assert.deepEqual(world.pastRuns.map((run) => run.seed), [20261006, 20261006]);
  assert.deepEqual(world.pastRuns.map((run) => run.score), [200, 100]);
});

test('the ledger is the log, and not the log itself', () => {
  const world = freshVisit(6);
  flyTheRun(world, 1, 10, 1);
  endRun(world);
  const ledger = runLedger(world);
  ledger.push({ seed: 'nonsense' });
  assert.equal(world.pastRuns.length, 1, 'a caller writing on the ledger cannot write on the log');
  assert.equal(world.pastRuns[0].seed, 1);
});

test('the log goes to the save document, in the shape the next visit reads', () => {
  // The store is the point of the whole exercise, so the write is checked from the outside: a fake
  // browser's storage, and what the game put in it at the ending.
  const store = {};
  globalThis.window = {
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
    },
  };
  try {
    const world = freshVisit(7);
    flyTheRun(world, 5150, 6000, 180);
    endRun(world);

    const doc = JSON.parse(store['starfall.save']);
    assert.equal(doc.runs.log.length, 1);
    assert.deepEqual(doc.runs.log[0], {
      seed: 5150, ship: 'wisp', seconds: 180, score: 6000, won: false,
    });

    // A second ending of the same run rewrites that row and does not add one.
    flyTheRun(world, 5150, 7000, 200);
    endRun(world);
    assert.equal(JSON.parse(store['starfall.save']).runs.log.length, 1, 'still one row');
    assert.equal(JSON.parse(store['starfall.save']).runs.log[0].score, 7000);
  } finally {
    delete globalThis.window;
  }
});
