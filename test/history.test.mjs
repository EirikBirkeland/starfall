// The run log on the glass (PLAN 3.7, game/history.js): the codex's fourth rack, and the runs that
// fill it in as they end.
//
// This is the whole visit: a first visit that has flown nothing, a run that writes its row, the rack
// that says it, the save that holds it, and the second run that joins it at the top. *What* a row is
// made of and how many of them are kept is test/history-rules.test.mjs, which drives the world
// directly; what is proved here is that the rows are wired to the endings and to the panel, and that
// the panel is honest before anything has been flown.
//
// The rack is painted at boot and at every ending rather than when C opens it - the same bargain the
// codex's other three panels strike - so none of the assertions below has to press the key to read it.
// One run is the naive bot on a fixed seed; the visit that *arrived* with a log is
// test/history-saved.test.mjs, because one boot reads one save (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { logKeeps } from '../src/game/history.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

/** The join between a row's two halves and between the facts on its second line. */
const DOT = '   \u00b7   ';

function saveIn(game) {
  const text = game.storage['starfall.save'];
  return text === undefined ? null : JSON.parse(text);
}

function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

/** The rack as the player reads it: one line per run flown, or the one line that says none have. */
function rack() {
  return game.screen.pastRuns;
}

const game = await bootGame({ root: ROOT, seed: 3, width: 1280, height: 720, storage: {} });

test('the codex has a rack for the runs this save has flown, and a first visit has flown none', () => {
  assert.equal(game.stats().runs, 0, 'nothing has been flown yet');
  assert.deepEqual(rack(), [{ name: 'NO RUNS YET', says: 'THE LAST ' + logKeeps() + ' ARE KEPT HERE' }],
    'an empty column under a heading would read as a panel that broke, so it says what fills it');

  // And it is part of the codex: C puts the whole panel up, the rack with it, and C again takes it
  // away. It is not a fifth screen on a fifth key (game/history.js, game/codex.js).
  press('KeyC');
  assert.equal(game.screen.codexHidden, false);
  assert.equal(game.screen.pastRuns.length, 1);
  press('KeyC');
  assert.equal(game.screen.codexHidden, true, 'the same key is the way out of all four racks');
});

test('a run that ends writes its row, and its rack says it', async () => {
  playOneRun(game, { maxSeconds: 600, policy: 'naive' });
  const stats = game.stats();
  assert.equal(stats.state, game.STATE.OVER, 'the naive bot goes down eventually');

  // The row is the run, field for field, out of the same world the card was written from.
  assert.equal(stats.runs, 1);
  const row = stats.runLog[0];
  assert.equal(row.seed, stats.seed, 'the seed the run was a function of');
  assert.equal(row.ship, stats.ship, 'the body it was flown in');
  assert.equal(row.score, stats.score, 'what it scored');
  assert.equal(row.won, false, 'and no win, because it went down');
  assert.equal(row.seconds, Math.floor(game.world.elapsed), 'and how long it lasted');
  assert.ok(row.seconds > 0, 'a run that wrote a row was flying at some point');

  // The rack the codex will print, painted already and one row long.
  assert.equal(rack().length, 1);
  assert.equal(rack()[0].name, 'SEED ' + row.seed);
  const says = rack()[0].says.split(DOT);
  assert.equal(says[0], BALANCE.ships[row.ship].name, 'named by the ship it was flown in');
  assert.match(says[1], /^\d+s$|^\d+m\d\ds$/, 'the same clock a card reads');
  assert.equal(says[2], row.score.toLocaleString('en-US'));
  assert.equal(says.length, 3, 'a wreck says nothing about clearing anything');

  // The seed on the row is the seed on the card, so a run that looks worth flying again can be asked
  // for by number (main.js puts the same number on both, out of the same world).
  assert.match(game.screen.stats, new RegExp('SEED ' + row.seed + '$'));

  // ...and the save has it, newest first, in the shape the next visit reads it in.
  assert.deepEqual(saveIn(game).runs.log, [row]);
});

test('a second run joins the rack at the top and leaves the first where it was', async () => {
  // A different seed, so a different arena and a different row: two runs of the same seed are their
  // own case, and it is in test/history-rules.test.mjs.
  const older = game.stats().runLog[0];
  await game.resetToTitle(4321);
  assert.equal(game.stats().runs, 1, 'a visit back to its title forgets none of its own log');
  assert.equal(rack().length, 1, 'and the rack says the same thing the world does');

  playOneRun(game, { maxSeconds: 600, policy: 'naive' });
  const stats = game.stats();
  assert.equal(stats.state, game.STATE.OVER);
  assert.equal(stats.runs, 2);
  assert.equal(stats.seed, 4321, 'and this run was flown on the seed this visit asked for');

  assert.equal(rack().length, 2);
  assert.equal(rack()[0].name, 'SEED 4321', 'newest first');
  assert.equal(rack()[1].name, 'SEED ' + older.seed, 'with the run before it under it');
  assert.deepEqual(saveIn(game).runs.log, stats.runLog, 'and the save has both, in that order');
});

test('launching a run takes the rack down with the rest of the panel and keeps every row', () => {
  for (let i = 0; i < 40; i++) game.step(FRAME);    // the wreck's restart guard, spent (game/run.js)
  press('KeyC');
  assert.equal(game.screen.codexHidden, false);
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY, 'the launch key still means launch');
  assert.equal(game.screen.codexHidden, true, 'and the panel went down for the run');
  assert.equal(game.stats().runs, 2, 'the log is the save\'s, not the run\'s, and it stayed whole');
});
