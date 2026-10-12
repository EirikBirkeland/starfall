// The chip a visit with no fingers is never shown (ui/chips.js, main.js `pressGiveUpChip`).
//
// The other half of test/thumb-giveup.test.mjs, and one boot per process is why it is a second file:
// this visit arrives with a cursor and no fingers reported (input/touch.js `hasFinger`), so nothing on
// its pause rack is a thumb's control. What is proved here is the negative that makes the chip worth
// having - it is put up for the hand that has no `G`, and for nobody else - plus the one thing that must
// not change for a keyboard visit at all: the pause rack is read, the run is let go of with the key, and
// `G` still gives a run up in one press, because a letter is not a careless tap.
//
// The page is laid out the same way it is in the thumb file, so the chip has a real box under the cursor:
// a refusal that only happens because a stub box was empty would prove nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4034;

/** The same box the thumb file gives the chip, so a press here lands on it if it were ever painted. */
const CHIP = { left: 540, top: 566, width: 200, height: 48 };
const ON = { x: CHIP.left + CHIP.width / 2, y: CHIP.top + CHIP.height / 2 };

const game = await bootGame({
  root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height,
  layout: { pauseGiveUp: { rect: CHIP } },
});
const world = game.world;

function frames(howMany) {
  for (let i = 0; i < howMany; i++) game.step(FRAME);
}

function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

const word = () => game.text('pauseGiveUp');
const gone = () => game.classes('pauseGiveUp').includes('gone');
const rackIsUp = () => game.screen.pauseHidden === false;

/** A run flown the way a keyboard flies one, and held with the key. */
async function heldRun() {
  await game.resetToTitle(SEED);
  frames(2);
  press('Space');
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'a run is being flown');
  press('Escape');
  frames(2);
  assert.equal(game.stats().paused, true, 'and it is being held');
  assert.equal(rackIsUp(), true, 'with its rack up over it');
  return world.score;
}

test('the rack of a visit with no fingers has no chip on it', async () => {
  await heldRun();
  assert.equal(gone(), true, 'a keyboard has a letter for this and needs no plate to find it');
  assert.equal(game.screen.pauseHint, 'ESC OR P TO GO BACK TO THE RUN', 'and is told the keys it owns');
});

test('a click on the chip that is not there is nothing at all', async () => {
  const score = await heldRun();
  game.pressMouse(ON.x, ON.y, 0);
  game.releaseMouse(0);
  game.step(FRAME);
  frames(2);

  assert.equal(game.stats().state, STATE.PLAY, 'no run was given up');
  assert.equal(game.stats().paused, true, 'and a click is still not this visit\'s way back into a run');
  assert.equal(rackIsUp(), true, 'the rack is where it was');
  assert.equal(word(), 'GIVE UP', 'and the chip never even got asked');
  assert.equal(world.score, score);
});

test('`G` still gives a run up in one press, because a letter is not a stray tap', async () => {
  const score = await heldRun();
  press('KeyG');
  game.step(FRAME);

  assert.equal(game.stats().state, STATE.OVER, 'the run is over');
  assert.equal(game.stats().paused, false, 'and not being held any more');
  assert.equal(rackIsUp(), false, 'the panel went down with the run');
  assert.equal(game.screen.finalScore, score.toLocaleString('en-US'), 'banked like any death');
});

test('while a run is flying a click on that box is nobody\'s', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  press('Space');
  frames(4);
  assert.equal(world.state, STATE.PLAY);

  game.pressMouse(ON.x, ON.y, 0);
  game.releaseMouse(0);
  frames(2);

  assert.equal(game.stats().state, STATE.PLAY, 'nothing was given up');
  assert.equal(game.stats().paused, false, 'and nothing was held');
});
