// The three lines that send a visitor off, on a visit that arrived on a finger (PLAN section 6).
//
// The title, the wreck's card and the win's card each carry one line saying *press to go*, and for a
// hundred and twenty-four sessions all three were written as a letter and a mouse: `PRESS SPACE OR CLICK
// TO RESTART · O SETTINGS`. A thumb has no letter and no click - it taps the glass, and the tap is answered
// by the very launch key everywhere - so those three lines told a phone visitor to hunt for keys its
// machine does not have. `paintLaunchHints` (ui/screens.js) writes the clause that means "go" as a tap and
// puts the clause that names a key away. Three things are held here:
//
//   **The words are the tap's.** Each line says TAP, and says it once: the key clause is `gone`, and its
//     separator goes with it because the separator lives inside the clause.
//   **The words are true.** A tap on the title flies a run and a tap on the wreck's card flies another,
//     which is exactly what the two lines now promise - and a hint that lies is worse than no hint.
//   **The letters are only put away, not lost**, so a rebound key still has somewhere to land.
//
// The other half - what a visit with a keyboard is shown - is in test/thumb-hints-mouse.test.mjs; a
// process boots one game, so a boot shape gets a file.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4041;

/** Anywhere on the glass, well clear of the thumb's rail at the bottom of the page. */
const GLASS = { x: 640, y: 300 };

const game = await bootGame({
  root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height, touch: true,
});
const world = game.world;

let fingerId = 0;

function frames(howMany) {
  for (let i = 0; i < howMany; i++) game.step(FRAME);
}

/** One tap on the glass, the way a thumb makes it: a finger down, a frame, the finger gone. */
function tap(at = GLASS) {
  const id = fingerId++;
  game.touchDown(at.x, at.y, id);
  frames(1);
  game.touchUp(0, 0, id);
  frames(1);
}

/** One press of a key, and the frame that answers it. */
function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

/** What a visitor reads on one of the three lines: the clauses that were not put away, in order. */
function lineRead(launch, keys) {
  if (game.classes(keys).includes('gone')) return game.text(launch).trim();
  return (game.text(launch) + ' ' + game.text(keys)).trim();
}

const line = () => ({
  title: lineRead('titleHintLaunch', 'titleHintKeys'),
  over: lineRead('overHintLaunch', 'overHintKeys'),
  win: lineRead('winHintLaunch', 'winHintKeys'),
});

test('the three lines are in the tap’s own words, and in nothing else', () => {
  assert.equal(game.text('titleHintLaunch'), 'TAP TO LAUNCH');
  assert.equal(game.text('overHintLaunch'), 'TAP TO FLY AGAIN');
  assert.equal(game.text('winHintLaunch'), 'TAP TO KEEP FLYING');

  for (const clause of ['titleHintKeys', 'overHintKeys', 'winHintKeys']) {
    assert.ok(game.classes(clause).includes('gone'), clause + ' names a key this hand does not own');
  }

  // And what that adds up to as a line: no dangling separator, no orphan letter, no second clause.
  assert.deepEqual(line(), {
    title: 'TAP TO LAUNCH',
    over: 'TAP TO FLY AGAIN',
    win: 'TAP TO KEEP FLYING',
  });
});

test('the key clauses are written and only put away, so a rebind still has somewhere to land', () => {
  // `gone` is a display decision and not a hole in the page: the letters are painted by `paintKeyWords`,
  // which is the one place the page writes a key (core/keymap.js). The mouse half of this file proves
  // they are the whole of the line for a hand that has them.
  assert.equal(game.text('titleKeysToday'), 'T');
  assert.equal(game.text('overKeysSettings'), 'O');
  assert.equal(game.text('winKeysReroll'), 'R');
});

test('TAP TO LAUNCH is true: a tap on the glass flies the run the line offers', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(world.state, STATE.START);

  tap();
  assert.equal(world.state, STATE.PLAY, 'the tap was the launch the line says it is');
});

test('TAP TO FLY AGAIN is true: a tap on the wreck’s card starts the next run', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  press('Space');
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'a run is being flown');

  press('KeyP');                        // held first: `G` gives a run up from the pause rack and nowhere else
  press('KeyG');                        // given up, and the card comes up over the wreck
  assert.equal(world.state, STATE.OVER);
  frames(40);                           // past the restart guard, so the tap is taken and not swallowed

  tap();
  assert.equal(world.state, STATE.PLAY, 'the tap meant the line, and not the card behind it');
});

