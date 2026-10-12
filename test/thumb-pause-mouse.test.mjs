// The pause plate, on the visit it is not for (PLAN section 6, input/touch.js `hasFinger`).
//
// The plate is put up for a visit that arrived with a finger, and a control a player never asked for
// is a thing in the way of the game: a desktop with a mouse has `Esc` already, and a tablet running a
// trackpad does not need a second way to stop a run painted over its arena. So this file boots the
// same game with a browser that reports no touch points at all and holds the other half of the
// promise - no plate, no press where one would have been, and a pause rack that still prints its keys.
//
// One boot per process (tools/headless/harness.js), which is why this is a second file and not a second
// section of test/thumb-pause.test.mjs: "did this visit arrive with a finger" is decided once, at boot.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { pauseButton, thumbUsed } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4030;

const game = await bootGame({ root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height });
const world = game.world;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

async function running() {
  await game.resetToTitle(SEED);
  frames(2);
  game.key('Space', true);
  game.step(FRAME);
  game.key('Space', false);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'a run is being flown');
}

test('a visit with no fingers is shown no plate over its arena', async () => {
  await running();
  frames(4);
  assert.equal(thumbUsed(), false, 'nobody has touched the glass');
  assert.equal(game.words().includes('PAUSE'), false, 'and nothing was painted for a thumb to press');
  assert.equal(game.words().includes('DASH'), false, 'any more than the dash button is');
});

test('a click where the plate would have been is still the click it always was - nothing', async () => {
  await running();
  const plate = pauseButton(VIEW.width, VIEW.height);

  game.pressMouse(plate.x, plate.y, 0);
  game.releaseMouse(0);
  game.step(FRAME);
  assert.equal(game.stats().paused, false, 'an invisible plate is not a plate');

  const before = world.elapsed;
  frames(10);
  assert.ok(world.elapsed > before, 'and the run never stopped');
});

test('the pause rack of a keyboard visit still prints its keys', async () => {
  await running();
  game.key('Escape', true);
  game.key('Escape', false);
  frames(1);
  assert.equal(game.stats().paused, true);
  assert.match(game.screen.pauseHint, /^ESC OR P TO GO BACK/, 'the way back is the way it always was');
  assert.equal(game.classes('pauseKeysKeys').includes('gone'), false,
    'and so are the two clauses that name a letter');

  game.key('KeyG', true);
  game.key('KeyG', false);
  frames(2);
  assert.notEqual(world.state, STATE.PLAY, 'and the G those clauses name really does end the run');
});
