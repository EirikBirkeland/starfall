// The awards on the glass (PLAN 3.7): what a run that won one is told, and what the visit is
// remembered with.
//
// The rules are test/awards-rules.test.mjs, which drives the world directly. What this file drives
// is the whole game in a fake browser: the plate that lands mid-run, the card that names what an
// ending won, the purse that got the stardust, the title line that says how much of the table is
// left, and the save that has to remember all of it for the next visit.
//
// Two runs are played here on one seed, and that is the point: the second is the first again
// (test/seed.test.mjs), which is the one situation in which "this taught the save nothing" can be
// proved rather than assumed.
//
// The mid-run tests park a run that cannot be hurt and is not mobbed (`sitStill`), because they are
// about a plate and a plate has to be looked at while nothing else is happening. The two runs that
// end are played by the naive bot, the way every other whole-run test plays one.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { AWARDS, nameOf } from '../src/game/awards.js';
import { toastCount } from '../src/render/toast.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

const game = await bootGame({ root: ROOT, seed: 4101, width: 1280, height: 720, storage: {} });

/** The save document as it stands right now, or null when nothing has been written. */
function saveIn() {
  const text = game.storage['starfall.save'];
  return text === undefined ? null : JSON.parse(text);
}

/** Every word the last frame put on the canvas, joined into one string to search. */
function painted() {
  return game.texts().map((word) => word.text).join('\n');
}

/** Launch a run, then park it: nothing arrives, nothing hurts, and the clock runs. */
function sitStill() {
  game.pressMouse(640, 300);
  game.step(FRAME);
  game.releaseMouse();
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY);
  game.world.spawnTimer = Infinity;
  game.world.player.invuln = Infinity;
}

/**
 * Walk the run past a kill threshold, which is how a body count becomes an award: the step's own
 * live pass notices (game/awards.js `updateAwards`) and the frame puts up the plate.
 */
function reachKillAward(id) {
  game.world.kills = Math.max(game.world.kills, BALANCE.awards.rows[id].need);
  game.step(FRAME);
}

/** What a list of award ids pays, out of the price sheet rather than out of a test. */
function sumOf(ids) {
  let dust = 0;
  for (const id of ids) dust += BALANCE.awards.rows[id].dust;
  return dust;
}

test('a first visit has won nothing, and says so where it says everything else', () => {
  assert.deepEqual(game.stats().awards, []);
  assert.equal(game.screen.titleAwards, 'AWARDS 0 OF ' + AWARDS.length);
  assert.equal(toastCount(), 0, 'nothing is on the glass before anything has been won');
  // The purse line on the death's card exists; the award line does not, because nothing won it.
  assert.equal(game.screen.finalAwards, '');
});

test('a calm frame paints no plate at all', () => {
  game.step(FRAME);
  assert.doesNotMatch(painted(), /STARDUST/, 'the plate is not drawn when there is nothing to say');
});

test('an award won mid-run lands a plate, and the plate goes away', () => {
  sitStill();
  reachKillAward('century');
  assert.equal(toastCount(), 1, 'the plate landed');
  const words = painted();
  assert.match(words, /CENTURY/, 'the plate says what was won');
  assert.match(words, /\+20 STARDUST/, 'and what it paid');
  assert.match(words, /bring down a hundred bodies in one run/, 'and why');

  // The plate belongs to a moment and not to the run: it holds, fades, and is gone with nothing
  // having to be pressed (render/toast.js).
  for (let i = 0; i < 300; i++) game.step(FRAME);
  assert.equal(toastCount(), 0, 'and it left by itself');
  assert.doesNotMatch(painted(), /CENTURY/);
});

test('a new run is a window that has been told nothing', async () => {
  reachKillAward('thousandfold');
  assert.equal(toastCount(), 1);
  await game.resetToTitle(4101);
  game.step(FRAME);
  assert.equal(toastCount(), 1, 'the end of a run may still be finishing its plate');
  sitStill();
  assert.equal(toastCount(), 0, 'and the new run starts with none of it on the glass');
});

test('a run that ends credits what it won, on the card, in the purse and in the save', async () => {
  await game.resetToTitle(4102);
  playOneRun(game, { maxSeconds: 600, policy: 'naive' });
  const stats = game.stats();
  assert.equal(stats.state, game.STATE.OVER, 'the naive bot goes down eventually');
  assert.ok(stats.awardsNew.length > 0, 'and not before it won something: ' + stats.awardsNew);

  // The card names the awards and what they paid.
  assert.match(game.screen.finalAwards, /^AWARDS /);
  assert.match(game.screen.finalAwards, /\+\d[\d,]* STARDUST$/);
  if (stats.awardsNew.length <= 3) {
    for (const id of stats.awardsNew) {
      assert.ok(game.screen.finalAwards.indexOf(nameOf(id)) >= 0, id + ' is named on the card');
    }
  } else {
    assert.match(game.screen.finalAwards, /MORE/, 'and the ones past three are counted');
  }
  assert.equal(stats.awardsWon.won, stats.awards.length);
  assert.equal(stats.awardsWon.of, AWARDS.length);

  // The purse got the run's own stardust *and* the awards' - two lines, one sum.
  assert.equal(stats.dust, stats.dustEarned + sumOf(stats.awardsNew));
  assert.equal(game.screen.titleAwards, 'AWARDS ' + stats.awards.length + ' OF ' + AWARDS.length);

  // And the save has the ids, in the shape the next visit reads them in.
  assert.deepEqual(saveIn().awards.won, stats.awards.slice().sort());
});

test('the same run played again wins nothing new, and says nothing about it', async () => {
  const known = game.stats().awards.slice();
  const before = JSON.stringify(saveIn().awards);
  const purse = game.stats().dust;
  await game.resetToTitle(4102);
  playOneRun(game, { maxSeconds: 600, policy: 'naive' });
  const stats = game.stats();

  assert.equal(stats.awardsNew.length, 0, 'the second ending had nothing to add');
  assert.deepEqual(stats.awards, known);
  assert.equal(game.screen.finalAwards, '', 'and its card keeps quiet about awards');
  assert.equal(JSON.stringify(saveIn().awards), before, 'the save wrote the same thing again');
  // The run still paid its own stardust; it just did not repeat itself.
  assert.ok(stats.dust > purse, 'the purse still grew, on the score and not on awards');
  assert.equal(stats.dust, purse + stats.dustEarned);
  assert.equal(game.screen.titleAwards, 'AWARDS ' + known.length + ' OF ' + AWARDS.length);
});
