// The thumb's way to give a run up (PLAN section 6, ui/chips.js, main.js `pressGiveUpChip`).
//
// A run is held from the glass now (test/thumb-pause.test.mjs) and let go of from it, which left one
// thing on the pause rack that a finger could read and could not do: `G`, the one press in the game that
// costs the run. So the pause rack carries a chip, and the chip takes **two presses**. That is the whole
// reason it exists: this is a screen whose every other pixel means "tap to go back into the run", so a
// single careless tap must not be able to end one, and a confirm that only *looks* like the thing it
// confirms is no confirm at all. The word on the chip is the confirm - it changes, and it says what the
// next press does.
//
// Three promises, and all three are about one press or two:
//
//   **The chip is `G`.** The second press is answered by the very handler the letter is answered by,
//   guards included, so a run given up from a chip is banked and carded exactly as one given up from a
//   key is (test/pause.test.mjs holds the same facts about the key).
//   **One press never ends a run.** Not on the first tap, not from anywhere near the chip, and not from a
//   chip left asking while the rack went down some other way.
//   **The box you read is the box you press.** The chip is painted by the page and hit-tested by the box
//   the browser laid out (ui/chips.js), so a tap beside it is an ordinary tap back into the run.
//
// The visit is booted with fingers and with a laid-out page, for the two things the stub has neither of:
// `touch: true` reports fingers (input/touch.js `hasFinger`) and `LAYOUT` says where the browser put the
// chip (tools/headless/harness.js). What a visit with no fingers is *not* shown is in
// test/thumb-giveup-mouse.test.mjs - one boot per process, so one boot shape per file.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { pauseButton, thumb } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4033;

/** Where the browser laid the pause rack's chip out, in the window's own pixels. */
const CHIP = { left: 540, top: 566, width: 200, height: 48 };
const LAYOUT = { pauseGiveUp: { rect: CHIP } };

/** The middle of the chip - where a thumb lands when it is aiming for it. */
const ON = { x: CHIP.left + CHIP.width / 2, y: CHIP.top + CHIP.height / 2 };
/** Just outside it: above its own top edge, on the rack, and nowhere near another control. */
const BESIDE = { x: ON.x, y: CHIP.top - 6 };
/** Anywhere else on the rack at all: the tap that goes back into the run. */
const AWAY = { x: 640, y: 180 };

/** The chip's two words, both of them written in ui/chips.js and nowhere else. */
const PLAIN = 'GIVE UP';
const ASKING = 'TAP AGAIN TO GIVE UP';

const game = await bootGame({
  root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height,
  touch: true, audio: true, layout: LAYOUT,
});
const world = game.world;
const UI = BALANCE.ui;

/** Where the pitch log stands right now (tools/headless/harness.js, the same ruler test/ui-sound.test.mjs
    reads a tick with: a pitch is logged when a voice is asked for one, so "the chip answered with the
    note its row says" is a fact that is read here and not hoped). */
function mark() { return game.audio.ramps.length; }

function notesSince(at) {
  return game.audio.ramps.slice(at)
    .filter((r) => r.name === 'pitch' && r.op === 'set')
    .map((r) => r.v);
}

function heard(at, hz) {
  return notesSince(at).some((v) => Math.abs(v - hz) < 0.001);
}

/** Did any voice slide up to `hz` since `at`? (What the rising half of a tick is made of.) */
function sweptTo(at, hz) {
  return game.audio.ramps.slice(at).some((r) => r.name === 'pitch' && r.op === 'exp'
    && Math.abs(r.v - hz) < 0.001);
}

let fingerId = 0;

function frames(howMany) {
  for (let i = 0; i < howMany; i++) game.step(FRAME);
}

function down(x, y) {
  const id = fingerId++;
  game.touchDown(x, y, id);
  return id;
}

function lift(id) {
  game.touchUp(0, 0, id);
  frames(1);
}

/** One press of the glass pause plate: the thumb's way to hold a run (test/thumb-pause.test.mjs). */
function pressPlate() {
  const plate = pauseButton(VIEW.width, VIEW.height);
  const id = down(plate.x, plate.y);
  frames(1);
  lift(id);
}

/** One press of the chip, wherever the page put it. */
function pressChip() {
  const at = mark();
  const id = down(ON.x, ON.y);
  frames(1);
  lift(id);
  return at;
}

/** One press of a key, and the frame that answers it. */
function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

const word = () => game.text('pauseGiveUp');
const asking = () => game.classes('pauseGiveUp').includes('asking');
const onTheRack = () => !game.classes('pauseGiveUp').includes('gone');
const rackIsUp = () => game.screen.pauseHidden === false;

/** A title, a run flown on a thumb, and that run held: the rack is up and its chip is on it. */
async function heldRun() {
  await game.resetToTitle(SEED);
  frames(2);
  game.key('Space', true);
  game.step(FRAME);
  game.key('Space', false);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'a run is being flown');

  pressPlate();                       // the lean that makes this a thumb visit, and the pause
  frames(2);
  assert.equal(thumb.used, true, 'the run was held by a finger');
  assert.equal(game.stats().paused, true, 'and it is being held');
  assert.equal(rackIsUp(), true, 'with its rack up over it');
  return world.score;
}

// --- the chip is on the rack ------------------------------------------------------------------

test('a thumb\'s rack carries the chip, and it says what it is', async () => {
  await heldRun();
  assert.equal(onTheRack(), true, 'a visit with no keyboard is given the way out of a run');
  assert.equal(word(), PLAIN, 'and it starts plain, asking nothing');
  assert.equal(asking(), false);
});

test('the chip is a chip: the page\'s own plate and the thumb\'s own floor', () => {
  // The promise is that this control is not a special case of the styling: it wears `.chip`, so the
  // min-height the title's rail is measured by (test/thumb-rail.test.mjs) is its min-height too, and the
  // shipped markup has it gone until a rack is painted for a thumb.
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const markup = /<div class="([^"]*)" id="pauseGiveUp">/.exec(page);
  assert.ok(markup !== null, 'the page has no give-up chip on the pause rack');
  assert.equal(markup[1].split(' ').includes('chip'), true, 'it is a .chip, not a one-off plate');
  assert.equal(markup[1].split(' ').includes('gone'), true, 'and the page ships it gone');
});

test('both of its words are the interface\'s own voice', async () => {
  await heldRun();
  pressChip();
  const both = [PLAIN, word()];
  assert.equal(both[1], ASKING, 'a first press leaves the question on the chip');

  for (const line of both) {
    assert.equal(line, line.toUpperCase(), line + ' is not spoken in caps');
    assert.equal(/\./.test(line), false, line + ' is a label and not a sentence');
    assert.ok(line.length <= 22, line + ' is ' + line.length + ' characters of chip');
  }
});

// --- one press is never enough ----------------------------------------------------------------

test('one press asks and ends nothing', async () => {
  const score = await heldRun();
  pressChip();
  frames(4);

  assert.equal(word(), ASKING, 'the chip is asking now, in its own word');
  assert.equal(asking(), true, 'and wears the colour of it');
  assert.equal(game.stats().state, STATE.PLAY, 'the run is not over');
  assert.equal(game.stats().paused, true, 'it is still being held');
  assert.equal(rackIsUp(), true, 'and its rack is still up');
  assert.equal(game.screen.overHidden, true, 'no card came up');
  assert.equal(world.score, score, 'and not one point of it changed');
});

test('the second press gives the run up, and it is the very thing `G` does', async () => {
  const score = await heldRun();
  pressChip();
  frames(2);
  pressChip();
  game.step(FRAME);

  assert.equal(game.stats().state, STATE.OVER, 'the run is over');
  assert.equal(game.stats().paused, false, 'and it is not being held any more, either');
  assert.equal(rackIsUp(), false, 'the card a run ends on is not for a panel to sit under');
  assert.equal(game.screen.overHidden, false, 'and the card went up on the frame after the press');
  assert.equal(game.screen.finalScore, score.toLocaleString('en-US'), 'banked like any death');
  assert.ok(game.stats().hull > 0, 'with the hull it had left: nothing killed this run');
  assert.equal(game.stats().killedBy, '', 'and the tally says so instead of inventing a cause');
});

test('a chip left asking is not a chip the next rack is still asking on', async () => {
  await heldRun();
  pressChip();
  frames(2);
  assert.equal(asking(), true);

  press('Escape');                    // the other way out of a held run, on a machine with both hands
  frames(2);
  assert.equal(game.stats().paused, false, 'the run is flying again');

  pressPlate();                       // and held again, by the same finger
  frames(2);
  assert.equal(rackIsUp(), true);
  assert.equal(word(), PLAIN, 'the new rack asks nothing');
  assert.equal(asking(), false);

  pressChip();                        // so this one press cannot be the second of the last rack's two
  frames(2);
  assert.equal(game.stats().state, STATE.PLAY, 'the run is still flying');
});

test('any other press goes back into the run instead, and takes the question with it', async () => {
  const score = await heldRun();
  pressChip();
  frames(2);
  assert.equal(asking(), true);

  const id = down(AWAY.x, AWAY.y);
  frames(1);
  lift(id);
  frames(2);

  assert.equal(game.stats().state, STATE.PLAY, 'the run is flying again - the tap meant what the rack says');
  assert.equal(game.stats().paused, false);
  assert.equal(game.screen.overHidden, true, 'and nothing was ended on the way');
  assert.equal(world.score, score, 'not even the score the run had got to');

  pressPlate();
  frames(2);
  assert.equal(word(), PLAIN, 'and the next rack is a plain one');
});

test('a press beside the chip is an ordinary press, not a first one', async () => {
  await heldRun();
  const id = down(BESIDE.x, BESIDE.y);
  frames(1);
  lift(id);
  frames(2);

  assert.equal(asking(), false, 'nothing was asked');
  assert.equal(game.stats().paused, false, 'and the tap did what every other tap on this rack does');
  assert.equal(game.stats().state, STATE.PLAY, 'the run went back to flying');
});

test('the rack going up another way leaves the chip plain too', async () => {
  await heldRun();
  pressChip();
  frames(2);
  assert.equal(asking(), true);

  press('KeyO');                      // the settings, over a run that is being held
  frames(2);
  assert.equal(game.screen.settingsHidden, false, 'the settings rack took the pause rack down');
  assert.equal(game.stats().paused, true, 'and the run is still held under it');

  press('KeyO');                      // ...and back out the same way
  frames(2);
  assert.equal(rackIsUp(), true, 'the pause rack came back up');
  assert.equal(word(), PLAIN, 'unasked');
  assert.equal(game.stats().state, STATE.PLAY);
});

test('a chip under the settings rack answers nothing, wherever its box is', async () => {
  await heldRun();
  pressChip();                        // asked, while the chip was the pause rack's own
  frames(2);
  assert.equal(asking(), true);

  press('KeyO');                      // ...then the settings rack came up over the held run, and the
  frames(2);                          // pause rack - the chip with it - went down under it
  assert.equal(game.screen.settingsHidden, false);

  pressChip();                        // the same box, now behind a panel that is not its own
  frames(2);
  assert.equal(game.stats().state, STATE.PLAY, 'no run was given up from behind a panel');
  assert.equal(game.stats().paused, true, 'and the tap was not a resume either - the rack owns the screen');
  assert.equal(game.screen.settingsHidden, false, 'the settings are still what the player is looking at');
});

test('the ask is heard, and the give-up is answered by the run and not by a second tick', async () => {
  await heldRun();

  let at = pressChip();
  frames(2);
  assert.ok(heard(at, UI.ask.freq), 'the chip asked, and said so: ' + notesSince(at).join(', '));
  assert.ok(sweptTo(at, UI.ask.slide), 'and the note rises, which is what a question sounds like');

  at = pressChip();
  game.step(FRAME);
  assert.equal(game.stats().state, STATE.OVER, 'the run is over');
  assert.equal(heard(at, UI.ask.freq), false,
    'nothing asked in sound over the top of the run going down: ' + notesSince(at).join(', '));
  assert.ok(heard(at, BALANCE.ui.card.freq), 'the run went down, and its card landed with its own knock');

  at = mark();
  frames(20);
  assert.equal(heard(at, UI.ask.freq), false, 'and the chip is done asking, whatever the card does next');
});

// --- and a cursor is allowed the same two presses ---------------------------------------------

test('a cursor may press the chip too, on a machine that has both hands', async () => {
  const score = await heldRun();

  game.pressMouse(ON.x, ON.y, 0);
  game.releaseMouse(0);
  game.step(FRAME);
  assert.equal(asking(), true, 'the ask');
  assert.equal(game.stats().state, STATE.PLAY, 'and nothing more than the ask');

  game.pressMouse(ON.x, ON.y, 0);
  game.releaseMouse(0);
  game.step(FRAME);
  assert.equal(game.stats().state, STATE.OVER, 'the second press, from a cursor, ends it');
  assert.equal(game.screen.finalScore, score.toLocaleString('en-US'), 'banked the same way');
});

test('while a run is flying the chip answers nothing, and a tap there is not a pause', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  game.key('Space', true);
  game.step(FRAME);
  game.key('Space', false);
  frames(4);
  assert.equal(world.state, STATE.PLAY);

  const id = down(ON.x, ON.y);
  frames(2);
  lift(id);
  frames(2);

  assert.equal(game.stats().paused, false, 'it is not the pause plate, and it claimed no control');
  assert.equal(game.stats().state, STATE.PLAY, 'and it certainly gave nothing up');
  assert.equal(thumb.onStick, false, 'it is not the stick either');
});

test('the run after a given-up one is not born half-given-up', async () => {
  await heldRun();
  pressChip();
  frames(2);
  pressChip();
  game.step(FRAME);
  assert.equal(game.stats().state, STATE.OVER);

  frames(130);                        // the wreck's restart guard, spent
  game.key('Space', true);
  game.step(FRAME);
  game.key('Space', false);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'a new run is being flown');

  const id = down(ON.x, ON.y);
  frames(1);
  lift(id);
  frames(2);
  assert.equal(game.stats().state, STATE.PLAY, 'a tap where the chip was is nobody\'s during a fight');
  assert.equal(game.stats().paused, false, 'and the new run is not being held');
});
