// What a thumb is shown, and what a visit that never used one is not (PLAN section 6).
//
// The first half of this file is the promise the whole feature rests on: **a keyboard and mouse visit
// sees none of it and is changed by none of it**. It has to be read before anything touches the glass,
// because "has this visit flown on a thumb" is one latch that, once set, stays set for the visit - and
// because the same assertions are the ones `tools/simulate.js`'s byte-identical reference run makes
// for the simulation: this file is the half that covers the picture.
//
// The second half is the picture. There are no pixels here, so "the button is there" is answered the
// way every other painted thing in this game answers it: the word the frame was asked to write, and
// the circle it was asked to stroke - read back through the same `dashButton` arithmetic the input
// layer uses to decide what a finger landed on, which is the only way to prove the ring you see is
// the ring you press.
//
// Every test asks for `running()` - a run being flown is the only moment any of this is painted, and
// a test may be run on its own - and every test that puts a thumb down lifts it again, because one
// live thumb hides the next: the stick belongs to the first finger that claimed it.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { dashButton, stickReach } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const PHONE = { width: 740, height: 360 };
const SEED = 3307;

const game = await bootGame({ root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height });
const world = game.world;

let fingerId = 100;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

function down(x, y) {
  const id = fingerId++;
  game.touchDown(x, y, id);
  return id;
}

function move(id, x, y) {
  game.touchMove(x, y, id);
}

function lift(id) {
  game.touchUp(0, 0, id);
}

function tap(x, y) {
  const id = down(x, y);
  lift(id);
}

function press(code) {
  game.key(code, true);
  game.step(FRAME);
  game.key(code, false);
}

/** A run being flown, launched with the key so that no test in here depends on a thumb having gone before it. */
async function running() {
  if (world.state !== STATE.PLAY || game.stats().paused) {
    await game.resetToTitle(SEED);
    frames(2);
    press('Space');
    frames(4);
  }
  assert.equal(world.state, STATE.PLAY, 'a run is being flown');
  assert.equal(game.stats().paused, false, 'and it is not being held');
}

/** A thumb on the stick, leaned right by `far` px, with a test that must lift it again. */
function thumbOnStick(x, y, far) {
  const id = down(x, y);
  move(id, x + far, y);
  frames(2);
  return id;
}

/** Is a ring of exactly this shape on the glass this frame? */
function ringWasPainted(where, r) {
  return game.circles().some((c) => Math.abs(c.x - where.x) < 1 && Math.abs(c.y - where.y) < 1
    && Math.abs(c.r - r) < 1);
}

/** Is anything painted with its middle on this point? */
function wasPaintedAt(where) {
  return game.circles().some((c) => Math.abs(c.x - where.x) < 1 && Math.abs(c.y - where.y) < 1);
}

// --- a visit that never touched the glass ---------------------------------------------------

test('a keyboard visit is launched, flies, and is shown no thumb controls', async () => {
  await running();
  assert.equal(game.stats().thumbUsed, false, 'nobody has touched a control');

  frames(60);
  assert.equal(game.words().includes('DASH'), false, 'no button was painted');
  assert.equal(game.stats().bullets, 0, 'and no trigger was held by anything');
});

test('a click over a paused run is still nothing, when nobody has used a thumb', async () => {
  await running();
  press('Escape');
  assert.equal(game.stats().paused, true);
  assert.equal(game.screen.pauseHint, 'ESC OR P TO GO BACK TO THE RUN');

  game.pressMouse(VIEW.width / 2, VIEW.height / 2, 0);
  game.releaseMouse(0);
  game.step(FRAME);
  assert.equal(game.stats().paused, true, 'the left button is the gun, so it may not resume');

  press('Escape');
  assert.equal(game.stats().paused, false);
});

// --- a visit that does -----------------------------------------------------------------------

test('the first thumb on the stick is what makes a visit a thumb visit', async () => {
  await running();
  const stick = thumbOnStick(300, 400, 60);
  assert.equal(game.stats().thumbUsed, true);
  lift(stick);
});

test('the button is painted where the input layer says it is, and says what it is', async () => {
  await running();
  const stick = thumbOnStick(300, 400, 60);
  const button = dashButton(VIEW.width, VIEW.height);

  assert.equal(game.words().includes('DASH'), true, 'the word it is worth');
  assert.ok(ringWasPainted(button, button.r),
    'and a ring of ' + button.r + ' px at ' + button.x + ',' + button.y);
  lift(stick);
});

test('the stick is painted where the thumb was put down, and its knob is where the thumb is', async () => {
  await running();
  const reach = stickReach(VIEW.width, VIEW.height);
  const stick = thumbOnStick(300, 400, reach);

  assert.ok(ringWasPainted({ x: 300, y: 400 }, reach), 'the ring the thumb travels round');
  const knob = game.circles().find((c) => Math.abs(c.x - (300 + reach)) < 1 && Math.abs(c.y - 400) < 1);
  assert.ok(knob !== undefined, 'and a knob where the thumb actually is');
  assert.ok(knob.r > 0 && knob.r < reach, 'smaller than the ring it travels inside');

  lift(stick);
  game.step(FRAME);
  assert.equal(ringWasPainted({ x: 300, y: 400 }, reach), false, 'and gone when the thumb is up');
});

test('the word on the button is painted inside the button', async () => {
  await running();
  const stick = thumbOnStick(300, 400, 60);
  const button = dashButton(VIEW.width, VIEW.height);
  const word = game.texts().find((t) => t.text === 'DASH');

  assert.ok(word !== undefined, 'the button is worth a word');
  assert.ok(Math.abs(word.x - button.x) < 1, 'written across its middle');
  assert.ok(Math.abs(word.y - button.y) < button.r, 'and inside it');
  lift(stick);
});

test('a paused run shows no controls, whatever the thumb is doing', async () => {
  await running();
  const stick = thumbOnStick(300, 400, 60);
  assert.equal(game.words().includes('DASH'), true);

  press('Escape');
  assert.equal(game.stats().paused, true);
  assert.equal(game.words().includes('DASH'), false, 'the rack has the window, not the stick');

  tap(VIEW.width * 0.5, VIEW.height * 0.5);
  lift(stick);
});

test('a thumb visit is told how to go back to the run in the words it owns', async () => {
  await running();
  const stick = thumbOnStick(300, 400, 60);
  press('Escape');
  assert.equal(game.stats().paused, true);
  assert.equal(game.screen.pauseHint, 'TAP TO GO BACK TO THE RUN');

  tap(VIEW.width * 0.5, VIEW.height * 0.5);
  assert.equal(game.stats().paused, false, 'and the tap does what the line says');
  lift(stick);
});

test('the button and the stick are a thumb apart on a phone as on a window', async () => {
  await running();
  game.setViewport(PHONE.width, PHONE.height);
  frames(2);

  const button = dashButton(PHONE.width, PHONE.height);
  const reach = stickReach(PHONE.width, PHONE.height);
  assert.ok(button.x + button.r <= PHONE.width, 'the button is on the glass');
  assert.ok(button.y + button.r <= PHONE.height - 34, 'and clear of the XP bar along the bottom');
  assert.ok(button.x - button.r > PHONE.width / 2, 'and all of it on the right half');
  assert.ok(reach >= 46 && reach <= 90, 'a thumb apart, whatever the window: ' + reach);
  assert.ok(button.x - button.r - PHONE.width / 2 > reach, 'stick and button cannot overlap');

  const stick = thumbOnStick(80, 200, reach);
  assert.ok(ringWasPainted(button, button.r), 'and it is the same ring that gets painted');
  assert.ok(wasPaintedAt({ x: 80, y: 200 }), 'with the stick under the thumb, where the thumb is');
  lift(stick);

  game.setViewport(VIEW.width, VIEW.height);
  frames(2);
});
