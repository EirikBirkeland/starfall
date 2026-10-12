// The thumb's pause plate (PLAN section 6, input/touch.js, main.js `onPauseKey`).
//
// A run is held by `Esc` or `P` and by nothing else, which leaves a phone stopping a run by putting
// the tab in the background - and the pause is also the rack a run's own numbers are read off. So the
// glass grows a third place: a plate above the dash button that is the pause key, claimed by the touch
// layer the way the dash is and answered by the very handler the key is answered by.
//
// Two promises hold this together and both are tested here. **The plate is the key**: pressing it does
// what pressing Esc does, on the screens Esc is answered on and nowhere else. **The plate you see is
// the plate you press**: the disc that is painted and the disc that is claimed are both asked out of
// `pauseButton`, the same arithmetic `render/touch.js` paints from and `input/touch.js` claims from.
//
// The visit is booted with fingers (`touch: true`), because the plate is put up for a visit that
// arrived with a finger (input/touch.js `hasFinger`) - what a visit without one is shown is held in
// test/thumb-pause-mouse.test.mjs, one boot per process.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { dropShards } from '../src/game/pickups.js';
import { cardLayout } from '../src/render/cards.js';
import { dashButton, pauseButton, stickReach, thumb } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const PHONE = { width: 740, height: 360 };
const SEED = 4029;

const game = await bootGame({
  root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height, touch: true,
});
const world = game.world;
const ship = world.player;

let fingerId = 0;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
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

/** One press of the plate: a finger down on its middle and gone again. */
function pressPlate() {
  const plate = pauseButton(VIEW.width, VIEW.height);
  const id = down(plate.x, plate.y);
  frames(1);
  lift(id);
}

/** A fresh title, then a run being flown - launched with the key, so no test depends on a thumb. */
async function running() {
  await game.resetToTitle(SEED);
  frames(2);
  game.key('Space', true);
  game.step(FRAME);
  game.key('Space', false);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'a run is being flown');
  assert.equal(game.stats().paused, false, 'and it is not being held');
}

/** Was a ring of exactly this shape painted this frame? */
function ringWasPainted(where, r) {
  return game.circles().some((c) => Math.abs(c.x - where.x) < 1 && Math.abs(c.y - where.y) < 1
    && Math.abs(c.r - r) < 1);
}

// --- the plate is on the glass ---------------------------------------------------------------

test('a visit with a finger is shown the plate the moment a run is flying', async () => {
  await running();
  assert.equal(thumb.used, false, 'and nobody has leaned a control yet');
  frames(2);

  const plate = pauseButton(VIEW.width, VIEW.height);
  assert.equal(game.words().includes('PAUSE'), true, 'the plate says what it is worth');
  assert.ok(ringWasPainted(plate, plate.r),
    'and the disc it says it on is ' + plate.r + ' px at ' + plate.x + ',' + plate.y);

  const word = game.texts().find((t) => t.text === 'PAUSE');
  assert.ok(Math.abs(word.x - plate.x) < 1 && Math.abs(word.y - plate.y) < plate.r,
    'its word across the middle of it');
});

test('the plate is not on the title, and not on a run that is already held', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(game.words().includes('PAUSE'), false, 'there is nothing to pause');

  await running();
  assert.equal(game.words().includes('PAUSE'), true, 'now there is');
  game.key('Escape', true);
  game.key('Escape', false);
  frames(1);
  assert.equal(game.words().includes('PAUSE'), false,
    'and the rack that holds the run owns the glass, plate included');
});

test('the plate is the thumb\'s: right half, clear of the stick, the dash and the hull', async () => {
  for (const size of [VIEW, PHONE]) {
    const plate = pauseButton(size.width, size.height);
    const dash = dashButton(size.width, size.height);
    const where = size.width + 'x' + size.height;

    assert.ok(plate.x - plate.r > size.width / 2, where + ': all of it in the right half');
    assert.ok(plate.x - plate.r - size.width / 2 > stickReach(size.width, size.height),
      where + ': a thumb put down for the stick can never land on it');
    assert.ok(plate.y + plate.r <= dash.y - dash.r, where + ': it does not touch the dash');
    assert.ok(plate.y - plate.r >= 96, where + ': and it is below the hull readout');
    assert.ok(plate.r <= dash.r, where + ': the pause is the smaller of the two neighbours');
    assert.ok(plate.x + plate.r <= size.width, where + ': and it is on the glass');
    assert.ok(plate.y + plate.r < size.height - 34, where + ': and clear of the XP bar');
  }
});

// --- the plate is the pause key --------------------------------------------------------------

test('one press holds the run, and the pause rack says so in a thumb\'s words', async () => {
  await running();
  const elapsed = world.elapsed;

  pressPlate();
  frames(4);
  assert.equal(game.stats().paused, true, 'the run is held where it stands');
  assert.equal(game.screen.pauseHidden, false, 'and its rack is up');
  assert.equal(game.screen.pauseHint, 'TAP TO GO BACK TO THE RUN',
    'in the words this hand owns - the plate made this a thumb visit');
  assert.equal(game.classes('pauseKeysKeys').includes('gone'), true,
    'and it is not told about keys it has no fingers for');

  const held = world.elapsed;
  frames(30);
  assert.equal(world.elapsed, held, 'the run is not being stepped');
  assert.equal(world.elapsed, elapsed, 'and not one second of it has gone');
});

test('the next press lets it go again, because the plate is Esc and not a second meaning', async () => {
  await running();
  pressPlate();
  frames(2);
  assert.equal(game.stats().paused, true);

  pressPlate();
  frames(2);
  assert.equal(game.stats().paused, false, 'the run is flying again');
  assert.equal(game.screen.pauseHidden, true, 'and the rack is back down under it');

  const before = world.elapsed;
  frames(10);
  assert.ok(world.elapsed > before, 'and it is really running: the clock is moving');
});

test('a press on the plate is nobody else: no stick, no dash, no ship', async () => {
  await running();
  const before = { x: ship.x, y: ship.y, dashCd: ship.dashCd, dashLeft: ship.dashLeft };

  const plate = pauseButton(VIEW.width, VIEW.height);
  const id = down(plate.x, plate.y);
  game.touchMove(plate.x - 80, plate.y + 60, id);
  frames(4);
  assert.equal(thumb.onStick, false, 'the plate is claimed, so the stick was never put down');
  assert.equal(thumb.onDash, false, 'and neither was the dash');
  assert.equal(ship.dashLeft, before.dashLeft, 'nothing was dashed');
  assert.equal(ship.dashCd, before.dashCd, 'and nothing was paid for a jump');

  lift(id);
  frames(10);
  assert.equal(Math.abs(ship.x - before.x) < 1, true, 'the ship stayed where it was');
  assert.equal(Math.abs(ship.y - before.y) < 1, true, 'in both of its directions');
});

test('the plate is lit while the thumb is on it, and only while it is', async () => {
  await running();
  const plate = pauseButton(VIEW.width, VIEW.height);
  const id = down(plate.x, plate.y);
  frames(1);
  assert.equal(thumb.onPause, true, 'held');
  lift(id);
  assert.equal(thumb.onPause, false, 'and let go');
  // The run it paused is left held, which is what the next test picks up and lets go again.
  assert.equal(game.stats().paused, true);
  game.key('Escape', true);
  game.key('Escape', false);
  frames(1);
});

test('a tap in the right half that misses the plate is nobody\'s', async () => {
  await running();
  const plate = pauseButton(VIEW.width, VIEW.height);
  const beside = { x: plate.x - plate.r - 30, y: plate.y };

  assert.ok(beside.x > VIEW.width / 2, 'still on the right half of the glass');
  const id = down(beside.x, beside.y);
  frames(2);
  lift(id);
  assert.equal(game.stats().paused, false, 'it did not become a pause');
  assert.equal(thumb.onStick, false, 'and it did not become a stick either');
});

test('over a card table the plate is not on the glass, and a press there is nothing', async () => {
  await running();
  // Deal the table the way the thumb file does it: enough shards to take the run up one level.
  world.xp = 0;
  world.shards.clear();
  world.pendingLevels = 0;
  dropShards(world, ship.x, ship.y, Math.ceil(world.xpNeed / BALANCE.shards.xp));
  let guard = 0;
  while (world.state !== STATE.LEVEL && guard < 400) { game.step(FRAME); guard++; }
  assert.ok(guard < 400, 'the run stopped for a choice');

  const plate = pauseButton(VIEW.width, VIEW.height);
  assert.equal(game.words().includes('PAUSE'), false,
    'a run that has stopped for the game is not one a player is being offered a pause on');

  const id = down(plate.x, plate.y);
  frames(2);
  lift(id);
  assert.equal(game.stats().paused, false, 'the press answered nothing');
  assert.equal(world.state, STATE.LEVEL, 'and the table is still the table');

  const offer = world.offer[0];
  const rect = cardLayout(world.offer.length, VIEW.width, VIEW.height).cards[0];
  const card = down(rect.x + rect.w / 2, rect.y + rect.h / 2);
  frames(2);
  lift(card);
  assert.equal(world.upgrades[offer], 1, 'while a press that did land on a card still takes it');
});

test('a cursor may press the plate too, on a machine that has both hands', async () => {
  await running();
  const plate = pauseButton(VIEW.width, VIEW.height);

  game.pressMouse(plate.x, plate.y, 0);
  game.releaseMouse(0);
  game.step(FRAME);
  assert.equal(game.stats().paused, true, 'the same pause, the same handler');

  game.pressMouse(plate.x, plate.y, 0);
  game.releaseMouse(0);
  game.step(FRAME);
  assert.equal(game.stats().paused, false, 'and the same way back out');
});

test('a run launched by a thumb launch still finds its plate', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  // A tap on the title is the launch a click always was (input/touch.js), and the plate has to be
  // there on the very first frame of the run it belongs to.
  const id = down(640, 300);
  lift(id);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'the tap launched the run');
  frames(1);
  assert.equal(game.words().includes('PAUSE'), true, 'and the plate is on the glass at once');
});
