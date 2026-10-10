// The hangar, fitted to the window it was given (index.html's `.hangar-body`, ui/screens.js).
//
// Five ships and four perks are nine rows of three lines each, and there is a second rack now
// precisely so that the column is not as tall as all of them - but "so that" is not "because it
// cannot be". Every screen in this game is click-through and none of it scrolls, so a panel that is
// taller than the window is not a panel you can scroll down to: its last rows, and the prices on
// them, are simply not in the game. So the panel is measured and, when it does not fit, the whole of
// it is shrunk as one picture.
//
// There is no layout engine here, so the measurements are given to the stub (the `layout` option of
// `bootGame`) and the promise tested is the arithmetic and the moment it is asked: on the way up,
// after a purchase repaints the rows, and when the window changes size.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame, everyShipBought } from '../tools/headless/harness.js';
import { scaleToFit } from '../src/ui/screens.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

// A panel that wants 900 px of a 720 px window, and 1,200 of a 1,280 of a window: it is the height
// that runs out, and by a tenth, which is the case a player notices as "the perks are cut off".
const NEED = { offsetWidth: 1200, offsetHeight: 900 };

const game = await bootGame({
  root: ROOT,
  seed: 5,
  width: 1280,
  height: 720,
  layout: { hangarBody: NEED, codexBody: NEED, pauseBody: NEED },
  storage: {
    'starfall.save': JSON.stringify({ version: 1, hangar: { ships: everyShipBought() } }),
  },
});

const H = 720, W = 1280;

function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

function scale() { return game.screen.hangarScale; }

test('the arithmetic: fit, floor, and nothing to measure', () => {
  assert.equal(scaleToFit({ w: 100, h: 100 }, { w: 100, h: 100 }), 1, 'it fits, so nothing is done');
  assert.equal(scaleToFit({ w: 400, h: 500 }, { w: 400, h: 400 }), 0.8, 'the tight axis is the one');
  assert.equal(scaleToFit({ w: 400, h: 500 }, { w: 400, h: 400 }), 0.8, 'and it is the smaller ratio');
  assert.equal(scaleToFit({ w: 10, h: 10 }, { w: 1000, h: 1000 }), 1, 'a window with room to spare');

  // A box that has not been laid out answers nothing at all, and dividing by nothing is how a whole
  // screen of text is turned into `NaN` and lost.
  for (const nothing of [0, -4, NaN, undefined, null]) {
    assert.equal(scaleToFit({ w: 100, h: nothing }, { w: W, h: H }), 1, 'no height ' + nothing);
    assert.equal(scaleToFit({ w: nothing, h: 100 }, { w: W, h: H }), 1, 'no width ' + nothing);
    assert.equal(scaleToFit({ w: 100, h: 100 }, { w: W, h: nothing }), 1, 'no window ' + nothing);
  }

  // And never below the floor: a window half the size of the rack is not a rack to be shrunk into,
  // because type that small is not readable and a clipped one still is.
  assert.equal(scaleToFit({ w: 100, h: 10000 }, { w: 1000, h: 500 }), 0.6);
  assert.equal(scaleToFit({ w: 100, h: 10000 }, { w: 1000, h: 601 }), 0.6, 'just under it is it too');
  assert.equal(scaleToFit({ w: 100, h: 1000 }, { w: 1000, h: 750 }), 0.75, 'and over it is the ratio');
});

test('a panel that does not fit the window is shrunk to fit it', () => {
  assert.equal(scale(), '', 'the title is not the panel, and nothing has been measured yet');
  press('KeyH');
  assert.equal(game.screen.hangarHidden, false, 'the rack is up');
  assert.equal(scale(), 'scale(' + (H / NEED.offsetHeight).toFixed(3) + ')',
    'and the whole panel came down to the height the window had');
});

test('a window that has room again gets the panel back at full size', () => {
  game.setViewport(1600, 1200);
  assert.equal(scale(), '', 'a bigger window needs no transform at all');
  game.setViewport(1280, 600);
  assert.equal(scale(), 'scale(' + (600 / NEED.offsetHeight).toFixed(3) + ')',
    'and a smaller one does the moment the resize says so');
  game.setViewport(W, H);
});

test('a panel that needs more than the floor will not be shrunk past it', () => {
  // Nothing can be done about a window that small, and pretending otherwise would be a screen of
  // type nobody can read: the floor is the honest answer, and the clip it leaves is on the rows
  // below the fold rather than on every word in the game.
  game.setViewport(640, 360);
  assert.equal(scale(), 'scale(0.600)');
  game.setViewport(W, H);
});

test('the codex is fitted the same way, because it needs it more', () => {
  // Three columns of the longest sentences in the game (game/codex.js), so this is the panel most
  // likely to run out of window - and it is fitted by the same arithmetic on the same three moments
  // (ui/screens.js `fitPanel`).
  const codex = () => game.screen.codexScale;
  assert.equal(codex(), '', 'the title is not the panel, and nothing has been measured yet');
  press('KeyC');
  assert.equal(game.screen.codexHidden, false, 'the codex is up');
  assert.equal(codex(), 'scale(' + (H / NEED.offsetHeight).toFixed(3) + ')',
    'and it came down to the height the window had');

  game.setViewport(1600, 1200);
  assert.equal(codex(), '', 'a window with room needs no transform');
  game.setViewport(640, 360);
  assert.equal(codex(), 'scale(0.600)', 'and the same floor holds it up here');
  game.setViewport(W, H);

  press('KeyC');
  assert.equal(game.screen.codexHidden, true, 'and it does not matter which panel is up, only that one is');
});

test('the two panels never both ask for the window', () => {
  // Only one of them is ever up (ui/screens.js `raisePanel`), so only one of them is ever being
  // fitted: two panels of rows over one title is a screen that has stopped being either of them.
  press('KeyC');
  assert.equal(game.screen.codexHidden, false);
  assert.equal(game.screen.hangarHidden, true);
  press('KeyH');
  assert.equal(game.screen.hangarHidden, false, 'the hangar came up');
  assert.equal(game.screen.codexHidden, true, 'and the codex went down to let it');
  assert.notEqual(scale(), '', 'and the hangar was fitted on the way');
  assert.equal(codexScale(), '', 'the codex keeps no transform of its own while it is away');
  press('KeyH');
});

function codexScale() { return game.screen.codexScale; }

test('the pause is fitted the same way, because it is a third panel and not a different kind of thing', () => {
  // A run to pause, and then the same arithmetic on the same three moments (ui/screens.js
  // `fitOpenPanel`): the panel is a rack of rows like the other two, and a window too short for it
  // loses its last rows in exactly the same way.
  const pause = () => game.screen.pauseScale;
  press('Space');
  game.world.spawnTimer = Infinity;      // this test is about the panel, not the crowd
  game.world.player.invuln = Infinity;
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY, 'a run, so that there is something to hold');

  press('Escape');
  assert.equal(game.screen.pauseHidden, false, 'the pause went up over the run');
  assert.equal(pause(), 'scale(' + (H / NEED.offsetHeight).toFixed(3) + ')',
    'and it came down to the height the window had');

  game.setViewport(1600, 1200);
  assert.equal(pause(), '', 'a window with room needs no transform');
  game.setViewport(640, 360);
  assert.equal(pause(), 'scale(0.600)', 'and the same floor holds it up here');
  game.setViewport(W, H);

  // One panel at a time, and so one panel at a time asking for the window: H and C are refused over a
  // run, which is the same rule that keeps the hangar off a paused one (main.js `rackMayOpen`).
  press('KeyH');
  press('KeyC');
  assert.equal(game.screen.hangarHidden, true);
  assert.equal(game.screen.codexHidden, true);
  assert.equal(game.screen.pauseHidden, false, 'and the pause stayed up, because nothing took it down');

  press('Escape');
  assert.equal(game.screen.pauseHidden, true, 'the run is on its own again');
  assert.equal(pause(), '', 'and a panel keeps no transform of its own while it is away');
});
