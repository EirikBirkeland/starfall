// The point vacuum as it is drawn (game/vacuum.js, render/hud.js).
//
// There is no browser here, so this cannot say the moment *looks* like a reward. What it can say is
// the five promises that make it an honest piece of the picture:
//
//   **the mouth is drawn where the pull is.** The ring that opens the well is born a long way out and
//     falls in - the only honest light for a pull, because it says how much floor is coming and never
//     claims a wider circle than the one it came from (game/magnetar.js argued the same case). So it
//     must start inside the arena it is emptying, and it must be *shrinking*;
//   **the HUD says nothing at all until the well opens** - a gold bar in the corner of the screen
//     with no name on it is a riddle, and ranks the player does not have are not a meter;
//   **when it does speak, it speaks the row's word** and not one this file made up, and it stops the
//     moment the well shuts, without being asked;
//   **the meter costs a word, two fills and a stroke, and no blur and no gradient** - a bar glows the
//     way the XP bar does (render/glow.js);
//   **and the bar is the well's own clock**, through the one layout function that both the painter and
//     this file read (the `bossBarLayout` bargain).
//
// Same trick as test/leech-art.test.mjs and test/dash.test.mjs: count what a frame asks the canvas
// for, and read the words it was given (tools/headless/harness.js). The run is *held* for all of it,
// which is what makes the counts exact rather than approximate: nothing but the meter changes between
// one frame and the next.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { isVacuuming } from '../src/game/vacuum.js';
import { vacuumLayout } from '../src/render/hud.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const VAC = BALANCE.vacuum;
const WORD = VAC.start.word;
const game = await bootGame({ root: ROOT, seed: 91, dpr: 1 });
const field = game.world;

// A run under way: the title screen draws no HUD. The press comes from the mouse, because Space
// would also spend a dash (test/controls.test.mjs).
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();
assert.notEqual(field.state, STATE.START, 'the run is flying');

// Held, so that the only thing a frame can be asked for differently is the meter itself.
field.paused = true;
field.vacuum.left = 0;

/** Paint one frame and report what it asked the canvas for, plus the words it was given. */
function paintFrame(left) {
  field.vacuum.left = left === undefined ? field.vacuum.left : left;
  const before = game.drawCalls();
  game.step();
  const after = game.drawCalls();
  return {
    texts: after.texts - before.texts,
    strokes: after.strokes - before.strokes,
    fills: after.fills - before.fills,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
    words: game.words(),
  };
}

/** How many times a word made it onto the glass - a haloed word is stroked and then filled. */
function said(frame, word) {
  return frame.words.filter((seen) => seen === word).length;
}

test('nothing is said about a well that has not opened', () => {
  assert.equal(isVacuuming(field), false);
  const frame = paintFrame();
  assert.equal(said(frame, WORD), 0, 'the word is not on the glass before there is a well');
  assert.equal(vacuumLayout(0).open, false);
});

test('the HUD names the moment in the row\'s own word, while it lasts', () => {
  const open = paintFrame(VAC.duration);
  assert.equal(said(open, WORD), 2, 'a haloed word is one stroke and one fill');

  const shut = paintFrame(0);
  assert.equal(said(shut, WORD), 0, 'and it goes away with the well, without being asked');
});

test('the meter costs a word, two fills and a stroke, and no blur and no gradient', () => {
  const shut = paintFrame(0);
  const open = paintFrame(VAC.duration);

  assert.equal(open.fills - shut.fills, 2, 'the track and the fill');
  assert.equal(open.strokes - shut.strokes, 1, 'and one wide faint glow under the fill');
  assert.equal(open.texts - shut.texts, 2, 'and the word, haloed');
  assert.equal(open.gradients, shut.gradients, 'and it builds no gradient to do it');
  assert.equal(open.shadows, shut.shadows, 'and asks for no blur either');
});

test('a well with nothing left to show costs nothing at all', () => {
  // The fill is drawn only when there is a bar of it to draw, so the last frame of the ten seconds is
  // not a fat gold line and then nothing.
  const empty = paintFrame(0.05);
  const half = paintFrame(VAC.duration / 2);
  assert.equal(empty.fills, half.fills - 1, 'a bar too thin to see is not stroked and filled');
  assert.equal(said(empty, WORD), 2, 'and the word is still there, because the well is');
});

test('the bar is the well\'s own clock, and the row\'s whole ten seconds', () => {
  const full = vacuumLayout(VAC.duration);
  const half = vacuumLayout(VAC.duration / 2);
  const spent = vacuumLayout(0);

  assert.equal(full.frac, 1, 'the moment it opens the bar is full');
  assert.equal(half.frac, 0.5, 'half the time left is half the bar');
  assert.equal(spent.frac, 0);
  assert.ok(half.filled < full.filled && half.filled > 0, 'and the bar it draws is that fraction');
  assert.ok(full.filled <= full.w, 'and it never runs out of the box it was drawn in');
  // Held to the row and not to a number of this file's: change `duration` and the bar changes with it.
  assert.equal(vacuumLayout(BALANCE.vacuum.duration).frac, 1);
});

test('the ring that opens the well falls in, and never claims more arena than there is', () => {
  // Two things follow from the mouth being a pull and not a blast, and both are in the row: it may
  // not start wider than the world, and its speed must be negative, or the light would be lying
  // about which circle was emptied.
  const mouth = VAC.start.mouth;
  assert.ok(mouth.speed < 0, 'the ring travels inwards: ' + mouth.speed);
  assert.ok(mouth.radius * 2 < Math.min(BALANCE.arena.w, BALANCE.arena.h),
    'and the mouth it draws fits inside the arena it is emptying: ' + mouth.radius + ' px');
  assert.ok(mouth.radius + mouth.speed * mouth.life > 0,
    'and it reaches the ship before it goes out, rather than collapsing past it');
});
