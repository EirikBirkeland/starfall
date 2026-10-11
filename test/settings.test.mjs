// The settings (PLAN section 6): the four things the game does to its own picture, the panel that
// shows them, and the one rule that holds the whole feature together - **not one of them may change
// what happens in a run**.
//
// Three of the four change the drawing and nothing else, one stops a number from being put on the
// screen at all, and all four are kept for the next visit, which is a shape that makes exactly one
// mistake easy: a "shake" row implemented by moving the camera inside the simulation, or a "fewer
// sparks" row implemented by making a death drop fewer chips. So the last test here plays one seed
// twice, once with every row at the top of its travel and once with every row at the bottom, and
// compares what the world *did* rather than what it looked like. That test is the reason the rest of
// this is allowed to exist.
//
// What lives where: the rows and their steps are game/settings.js; the mixer's own three rows and the
// keys that step them are test/volume.test.mjs; the panel's furniture is ui/screens.js and the keys
// that move the cursor are input/keyboard.js, both walked here through the real game.
//
// One note on the shape of these tests. A row is only ever *set* by a player, and setting it writes it
// into the save (game/settings.js `stepRow`), so there is no way to put the rows somewhere that does
// not go through the save - which is the point, and the reason `leftThemAt` and `shippedAgain` below go
// through storage rather than calling anything directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { SAVE_KEY } from '../src/core/save.js';
import {
  ROWS, loadFromSave, stepRow, wordsOf, stepIdOf,
  shakeShare, flashShare, particleStride, numbersShown,
} from '../src/game/settings.js';
import { playOneRun } from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

const game = await bootGame({ root: ROOT, seed: 4404, width: 1280, height: 720, storage: {} });

/** One press of a key, and the frame that answers it. */
function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

function frames(howMany) {
  for (let i = 0; i < howMany; i++) game.step(FRAME);
}

const up = () => game.stats().settingsUp;

/** The row the cursor is on, or -1 when the panel is not on the glass. */
function cursorOn() {
  return game.screen.settingsRows.findIndex((row) => row.chosen);
}

/**
 * Back to the shipped game: no save at all, and the rows read from it.
 *
 * This is the only honest way to reset, because a stored row outranks every default (see the note at
 * the top of the file) - so a test that wants the shipped game has to take the save away first.
 * `game.storage` is the map the harness's fake localStorage is made of, so emptying it is what a
 * first visit on a fresh machine is.
 */
function shippedAgain() {
  delete game.storage[SAVE_KEY];
  loadFromSave();
}

/** Put the rows where a previous visit left them, which is the only way there is of putting them. */
function leftThemAt(steps) {
  delete game.storage[SAVE_KEY];
  loadFromSave(steps);
}

/** Write a save document into the browser this game is running against, as a previous visit left it. */
function storedView(view) {
  game.storage[SAVE_KEY] = JSON.stringify({ version: 1, view: view });
}

test('every row ships at the end the game was built and balanced at', () => {
  // The whole point of the panel: the game as it was made is one press away from being a quieter game,
  // and it has to be *quieter*, not a different game wearing the same arena. So the last step of every
  // row is the shipped one, and no number below is allowed to be named twice.
  assert.deepEqual(ROWS.map((row) => row.steps[row.steps.length - 1].id),
    ['full', 'full', 'on', 'all'], 'the last step of every row is the shipped one');
  assert.deepEqual(ROWS.map((row) => row.default),
    ['full', 'full', 'on', 'all'], 'and it is the step the row says it ships at');

  shippedAgain();
  assert.equal(shakeShare(), 1, 'the window is moved by all of the trauma');
  assert.equal(flashShare(), 1, 'every hurt body is flashed');
  assert.equal(particleStride(), 1, 'every spark of every spray is let out');
  assert.equal(numbersShown(), true, 'and every number is painted');

  // Every row is worth reading by a person: a name, one plain line, and steps with words of their own.
  for (const row of ROWS) {
    assert.ok(row.steps.length >= 2, row.name + ' has steps to choose between');
    assert.equal(row.says, row.says.toUpperCase());
    for (const step of row.steps) {
      assert.ok(step.id.length > 0 && step.words.length > 0);
    }
  }
});

test('a row walks its own steps and stops at both ends', () => {
  shippedAgain();
  assert.equal(stepRow('shake', -1).id, 'half');
  assert.equal(stepRow('shake', -1).id, 'low');
  assert.equal(stepRow('shake', -1).id, 'off');
  assert.equal(stepRow('shake', -1), null, 'off the bottom it refuses rather than wrapping');
  assert.equal(wordsOf('shake'), 'NONE');
  assert.equal(shakeShare(), 0, 'refused means nothing moved, not one step further');

  // A cursor that came back round would put the shake under a hand that was trying to take it off, on
  // the very press the player took for a stop.
  for (let i = 0; i < 8; i++) stepRow('shake', 1);
  assert.equal(stepRow('shake', 1), null, 'and off the top');
  assert.equal(wordsOf('shake'), 'FULL');
  assert.equal(stepRow('shake', 0), null, 'zero is not a direction');

  // The rows are one row each: moving the sparks is not moving the flash.
  const flash = flashShare();
  stepRow('particles', -1);
  assert.equal(flashShare(), flash, 'one row is one row');
  assert.throws(() => stepRow('no-such-row', 1), /no setting called/, 'a row the game has not got');

  // The particles row counts, it does not gamble: one spark in `stride`, so two identical sprays stay
  // two identical sprays. A share asked of the number stream would move every surviving spark to
  // wherever the next draw landed, which is a setting changing what a spray looks like.
  leftThemAt({ particles: 'few' });
  assert.equal(particleStride(), 3);
  stepRow('particles', 1);
  assert.equal(particleStride(), 2);
  stepRow('particles', 1);
  assert.equal(particleStride(), 1, 'and the top of the row is every spark there is');
  leftThemAt({ particles: 'none' });
  assert.equal(particleStride(), 0, 'the bottom is none of them');
  shippedAgain();
});

test('what a row is set to is answered by the row, in words, and nowhere else', () => {
  // The panel prints these words and `stats()` prints the step ids beside them; there is no third copy
  // of either to fall out of date (main.js `settingRows`).
  for (const row of ROWS) {
    for (const step of row.steps) {
      const steps = {};
      steps[row.id] = step.id;
      leftThemAt(steps);
      assert.equal(wordsOf(row.id), step.words, row.name + ' at ' + step.id);
      assert.equal(stepIdOf(row.id), step.id);
    }
  }
  shippedAgain();
  assert.deepEqual(ROWS.map((row) => wordsOf(row.id)), ['FULL', 'FULL', 'ON', 'ALL']);
});

test('the one default that is not the shipped one is the one the player already asked for', () => {
  // `prefers-reduced-motion` (render/canvas.js `calmMotion`): a visitor who has told their machine
  // they do not want things lurching starts with the window held still, until they say otherwise.
  shippedAgain();
  loadFromSave(undefined, true);
  assert.equal(shakeShare(), 0);
  assert.equal(flashShare(), 1, 'and only the shake, which is the only row that moves the window');

  // But a save that has got a shake in it is that player's own answer to the same question, given
  // later and on purpose, and it outvotes a standing preference of their operating system. This is the
  // difference between a default and a demand.
  storedView({ shake: 'full' });
  loadFromSave(undefined, true);
  assert.equal(shakeShare(), 1, 'an explicit answer wins over a standing request');
  shippedAgain();

  // And the boot is what passes the request in - the one part of this that cannot be proved by calling
  // anything, so the line that does it is read instead (test/game-mutes.test.mjs reads the source for
  // the same reason).
  const boot = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  assert.match(boot, /loadPicture\(undefined, calmMotion\(\)\)/,
    'the boot hands the calm request to the rows');
});

test('a step this build has never heard of is no setting at all', () => {
  // The argument core/save.js makes about every field it reads, applied to a row: a value from
  // somewhere else is not this build's value trimmed a little, so it is dropped and the row ships.
  storedView({ shake: 'mild', flash: 'off', numbers: 'off', particles: 3 });
  loadFromSave();
  assert.equal(stepIdOf('shake'), 'full', 'a step name this build has not got is not a shake');
  assert.equal(stepIdOf('flash'), 'off', 'and one it has got is kept');
  assert.equal(stepIdOf('numbers'), 'off');
  assert.equal(stepIdOf('particles'), 'all', 'and a number is not a step name');

  // ...and the words the panel would print are the words the game believes, because the panel is asked
  // and not told (ui/screens.js `showSettings` is painted from these rows).
  assert.equal(wordsOf('shake'), 'FULL');
  shippedAgain();
});

test('the panel is put up by O, over the two screens a run is chosen from and over a run that is held', async () => {
  shippedAgain();
  await game.resetToTitle(4404);
  frames(4);
  assert.equal(up(), false, 'not until it is asked for');
  assert.equal(game.screen.settingsHidden, true);

  press('KeyO');
  assert.equal(up(), true);
  assert.equal(game.screen.settingsHidden, false, 'and the glass says so too');
  assert.equal(game.screen.settingsScale, '', 'a window this tall is a panel this tall');
  assert.equal(cursorOn(), 0, 'the cursor starts on the top row');
  assert.ok(game.screen.settingsNote.length > 0, 'and it says where a change goes');

  // The launch key and the ship numbers are refused over it: the panel owns the screen it is on, and a
  // press meant for the row under the cursor is not also a press that starts a run (main.js).
  press('Space');
  press('Digit1');
  assert.equal(game.stats().state, game.STATE.START, 'nothing launched and nothing was picked');
  assert.equal(up(), true, 'and the panel is still up');

  press('KeyO');
  assert.equal(up(), false);
  assert.equal(game.stats().state, game.STATE.START, 'closing it did not launch anything either');

  // Over a run that is flying it is refused outright. A settings panel over a flying run would be a
  // pause the run never agreed to.
  press('Space');
  frames(30);
  assert.equal(game.stats().state, game.STATE.PLAY);
  press('KeyO');
  assert.equal(up(), false, 'no settings over a run that is being played');
  press('Escape');
  frames(2);
  assert.equal(game.stats().paused, true, 'and now the run is being held');

  press('KeyO');
  assert.equal(up(), true, 'which is a state a settings panel belongs in');
  assert.equal(game.screen.pauseHidden, true, 'one panel at a time');
  press('KeyO');
  assert.equal(up(), false);
  assert.equal(game.screen.pauseHidden, false, 'and the pause comes back, because the run is held');
  assert.equal(game.stats().paused, true, 'the panel never let the run go on its own account');
  press('Escape');
  frames(2);
  await game.resetToTitle(4404);
  frames(4);
});

test('the cursor walks the panel and the rows step under it', async () => {
  shippedAgain();
  await game.resetToTitle(4404);
  frames(4);
  press('KeyO');
  assert.deepEqual(game.screen.settingsRows.map((row) => row.name), [
    'SCREEN SHAKE', 'HIT FLASH', 'SCORE NUMBERS', 'PARTICLES', 'MUSIC', 'SOUND', 'MUTE',
    'AUTO-FIRE', 'AUTO-AIM',
  ], 'four things it does to the eyes, three it does to the ears, and the two it does to the hand');
  assert.deepEqual(game.screen.settingsRows.map((row) => row.chosen),
    [true, false, false, false, false, false, false, false, false], 'one cursor, on the first row');
  for (const row of game.screen.settingsRows) {
    assert.ok(row.says.length > 0, row.name + ' says what it does');
  }

  // Up and down move the cursor and nothing else; twelve presses each way and it has not left.
  for (let i = 0; i < 12; i++) press('ArrowDown');
  assert.equal(cursorOn(), 8, 'the bottom row is the last one');
  for (let i = 0; i < 12; i++) press('ArrowUp');
  assert.equal(cursorOn(), 0);
  assert.deepEqual(game.stats().settings, { shake: 'full', flash: 'full', numbers: 'on',
    particles: 'all' }, 'walking the cursor changed no row');
  assert.deepEqual(game.stats().assists, { fire: 'off', aim: 'off' },
    'and not one of the two switches either - a cursor is not an answer');

  // Left and right step the row under it, and the value on the glass is the value in the game.
  press('ArrowLeft');
  assert.equal(game.stats().settings.shake, 'half');
  assert.equal(game.screen.settingsRows[0].value, 'HALF');
  press('ArrowRight');
  assert.equal(game.stats().settings.shake, 'full');
  press('ArrowRight');
  assert.equal(game.stats().settings.shake, 'full', 'refused at the end of the row, in silence');

  // Down to the second row, and it is the one that moves.
  press('ArrowDown');
  press('ArrowLeft');
  assert.equal(game.stats().settings.flash, 'soft');
  assert.equal(game.screen.settingsRows[1].value, 'SOFT');
  assert.equal(game.stats().settings.shake, 'full', 'and the row above it did not move');

  press('KeyO');
  const saved = JSON.parse(game.storage[SAVE_KEY]);
  assert.deepEqual(saved.view, { shake: 'full', flash: 'soft', numbers: 'on', particles: 'all' },
    'the row that was moved is kept, by name, for the next visit');
  assert.deepEqual(saved.assists, {}, 'and the two switches were not walked over on the way');
  shippedAgain();
});

/**
 * One whole run, played to a fixed script, and the numbers the world made while it was flying.
 *
 * `playOneRun` with a fixed seed, a fixed policy and the level-up choice the bot always takes is as
 * repeatable as a test gets - and it has to be *awaited* back to the title first, because
 * `resetToTitle` is a promise and a run played over the top of the reset it never happened is a run
 * that inherits the last one's score, which is the mistake this helper was written around.
 *
 * What is sampled is the run's own numbers and where the ship got to, and deliberately not the spark
 * count or the hit-stop: those are two of the things the rows are allowed to change, and comparing them
 * would be comparing the settings with themselves.
 */
async function playAFullRun(seed) {
  await game.resetToTitle(seed);
  frames(4);
  const marks = [];
  const out = playOneRun(game, {
    maxSeconds: 45,
    policy: 'aware',
    onFrame: (g, at) => {
      if (at % 30 !== 0) return;
      const s = g.stats();
      marks.push([at, s.score, s.kills, s.level, s.wave, s.bullets, s.enemies,
        Math.round(g.player.x), Math.round(g.player.y)].join('/'));
    },
  });
  return { marks: marks, out: out };
}

test('none of it changes what happens in a run', async () => {
  // The claim of the whole feature, in one comparison: one seed, one bot, every picture row at the top
  // of its travel, then every one at the bottom, and the world has to do exactly what it did. The
  // shake, the flash, the sparks and the floating numbers are the game's *report* about a run, and a
  // report that changes the thing it reports on is not a report.
  //
  // Why it holds rather than merely appears to hold, in two places: the cosmetics draw their numbers
  // from a stream of their own (core/rng.js `fx`, and the note at the top of game/effects.js), and
  // every gate sits in a painter or in a spawner that hands nothing back to the run.
  shippedAgain();
  const loud = await playAFullRun(20260717);
  leftThemAt({ shake: 'off', flash: 'off', numbers: 'off', particles: 'none' });
  assert.equal(shakeShare(), 0);
  assert.equal(flashShare(), 0);
  assert.equal(particleStride(), 0);
  assert.equal(numbersShown(), false);
  const quiet = await playAFullRun(20260717);
  shippedAgain();

  assert.ok(loud.marks.length > 20,
    'the run has to be long enough to be evidence, and it was ' + loud.marks.length + ' samples');
  assert.deepEqual(quiet.marks, loud.marks, 'every sample of the run, the same numbers');
  assert.equal(quiet.out.stats.score, loud.out.stats.score, 'the same score with all of it off');
  assert.equal(quiet.out.stats.kills, loud.out.stats.kills, 'the same kills');
  assert.equal(quiet.out.frames, loud.out.frames, 'and the run lasted the same time');
});
