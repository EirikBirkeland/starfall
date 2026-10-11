// The thumb (PLAN section 6): one finger flies the ship, one presses the dash, and the gun looks
// after itself.
//
// This is the driving half of the feature - what a finger on the glass does to a run. The picture
// half, and the promise that a visit which never touched the glass is the visit it always was, is in
// test/touch-art.test.mjs.
//
// The harness has no fingers, so `down`/`move`/`lift` below build the touch events a browser would
// have built (tools/headless/harness.js `touchDown`), with an identifier each so a test can put a
// second thumb down beside the first. Everything is measured in seconds and in px of ship, because a
// lean is a physical thing: how far the ship went, how fast it was going, and how long the dash took
// to come round again.
//
// One boot per process (tools/headless/harness.js), so every test starts with `await fly()` - a
// fresh title screen, a run launched the way a thumb launches one, and a thumb already leaned the way
// that test wants it. A test that does not want a lean lifts the thumb first; what no test does is
// inherit a moving ship, or a spent dash, from the one before it.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { dropShards } from '../src/game/pickups.js';
import { enemyAt } from '../tools/headless/scripted.js';
import { cardLayout } from '../src/render/cards.js';
import { dashButton, stickReach, thumb } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4021;

const game = await bootGame({ root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height });
const world = game.world;
const ship = world.player;

/** Where a thumb is put down, well inside the left half, and how far a full lean travels. */
const STICK_X = 260;
const STICK_Y = 420;
const REACH = stickReach(VIEW.width, VIEW.height);
const BUTTON = dashButton(VIEW.width, VIEW.height);

let fingerId = 0;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

/** How many frames `seconds` is, at the frame rate every number here is measured at. */
function framesOf(seconds) {
  return Math.round(seconds * 1000 / FRAME);
}

/** Put a thumb down and leave it there. Returns its identifier, so it can be moved and lifted. */
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

/** One tap: down and up without moving. A screen answers it; no control sees it. */
function tap(x, y) {
  const id = down(x, y);
  lift(id);
}

function press(code) {
  game.key(code, true);
  game.step(FRAME);
  game.key(code, false);
}

/**
 * A run flown on a thumb: a tap launches it, and one thumb is laid on the stick and leaned right at
 * full. The tap is not what makes it a thumb visit - a tap is a tap on any screen - the stick is.
 */
async function fly() {
  await game.resetToTitle(SEED);
  frames(2);
  tap(VIEW.width * 0.7, VIEW.height * 0.5);
  frames(2);
  assert.equal(world.state, STATE.PLAY, 'the tap launched the run');
  assert.equal(ship.dashCd, 0, 'and the run is whole: nothing spent before it started');
  const stick = down(STICK_X, STICK_Y);
  move(stick, STICK_X + REACH, STICK_Y);
  frames(1);
  return stick;
}

/** The middle of the first card on a table that has stopped the run for a choice. */
function firstCard() {
  const rect = cardLayout(world.offer.length, VIEW.width, VIEW.height).cards[0];
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

test('a tap on the title is the launch, and is not a control', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(world.state, STATE.START);
  assert.equal(game.stats().thumbUsed, false, 'nobody has touched a control yet');

  tap(VIEW.width * 0.7, VIEW.height * 0.4);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'the tap launched the run');
  assert.equal(game.stats().thumbUsed, false, 'and was only ever a press');
  assert.equal(ship.dashCd, 0, 'a launch is never also a dash');
  assert.equal(ship.vx, 0, 'and never also a lean');
});

test('a thumb on the left half flies the ship, and stopping it brakes the ship', async () => {
  const stick = await fly();
  const from = ship.x;
  frames(framesOf(0.6));
  const travelled = ship.x - from;
  assert.ok(travelled > 120, 'the ship went right by ' + Math.round(travelled) + ' px');
  assert.ok(ship.vx > ship.maxSpeed * 0.9, 'and was up to its own speed when the clock was read');

  lift(stick);
  const braked = ship.x;
  frames(framesOf(0.4));
  assert.equal(ship.vx, 0, 'lifting the thumb brakes the ship dead');
  assert.ok(ship.x - braked < ship.maxSpeed * 0.1,
    'and it coasts about its own braking distance, not further');
});

test('a half lean is a half ship, and the far end of the stick is the ship\'s own top speed', async () => {
  const stick = await fly();
  move(stick, STICK_X + 2, STICK_Y);
  frames(framesOf(0.6));
  assert.equal(ship.vx, 0, 'a thumb that lands and does not move is not a lean');

  move(stick, STICK_X + REACH * 0.5, STICK_Y);
  frames(framesOf(0.6));
  const halfSpeed = Math.abs(ship.vx);
  assert.ok(halfSpeed > ship.maxSpeed * 0.35,
    'half the stick is most of the ship: ' + Math.round(halfSpeed));

  move(stick, STICK_X + REACH * 4, STICK_Y);
  frames(framesOf(0.6));
  assert.ok(Math.abs(ship.vx) <= ship.maxSpeed + 1,
    'past the end of the stick is still the top speed: ' + Math.round(ship.vx));
  assert.ok(Math.abs(ship.vx) > halfSpeed * 1.4, 'and the stick is a lever the whole way along');
  lift(stick);
});

test('a thumb in the dead zone of the stick does not drive the ship', async () => {
  const stick = await fly();
  move(stick, STICK_X + 4, STICK_Y + 3);
  frames(framesOf(0.4));
  assert.equal(ship.vx, 0, 'a resting thumb is not a lean, even a slightly wandering one');
  lift(stick);
});

test('the thumb is the last word: a stick leaning left beats a keyboard holding right', async () => {
  const stick = await fly();
  game.key('KeyD', true);
  frames(framesOf(0.5));
  assert.ok(ship.vx > 0, 'the keyboard has the ship going right first');

  move(stick, STICK_X - REACH, STICK_Y);
  frames(framesOf(0.6));
  assert.ok(ship.vx < 0, 'and the thumb takes it back the other way: vx ' + ship.vx);

  game.key('KeyD', false);
  lift(stick);
});

test('the button on the right dashes once per press, however hard it is mashed', async () => {
  const stick = await fly();
  lift(stick);

  const pressed = down(BUTTON.x, BUTTON.y);
  frames(1);
  assert.ok(ship.dashLeft > 0, 'the dash is on its rails');
  lift(pressed);

  // Mash it every frame through the whole wait and a little past it. A hand that mashes gets exactly
  // one dash out of it - the one that answers the instant the wait is paid - and nothing behind it,
  // because a request is spent whether or not it was answered (input/index.js).
  let starts = 0;
  let dashing = ship.dashLeft > 0;
  const cap = framesOf(ship.dashWait + 0.3);
  for (let i = 0; i < cap; i++) {
    const mash = down(BUTTON.x, BUTTON.y);
    lift(mash);
    game.step(FRAME);
    const now = ship.dashLeft > 0;
    if (now && !dashing) starts++;
    dashing = now;
  }
  assert.equal(starts, 1, 'one dash out of the whole mash, when the wait was done');
  assert.ok(ship.dashCd > 0, 'and its wait is being paid again');
});

test('the dash waits its ship\'s own wait, then answers a second thumb', async () => {
  const stick = await fly();
  const first = down(BUTTON.x, BUTTON.y);
  lift(first);
  frames(framesOf(0.05));
  assert.ok(ship.dashLeft > 0, 'the first dash is away');

  let waited = 0;
  const cap = framesOf(ship.dashWait + 1);
  while (ship.dashCd > 0 && waited < cap) { game.step(FRAME); waited++; }
  assert.ok(waited < cap, 'the wait ended, and in about its own seconds: ' + waited + ' frames');
  assert.ok(Math.abs(waited - framesOf(ship.dashWait)) <= framesOf(0.1),
    'the wait is the ship\'s own, not a second one: ' + (waited * FRAME / 1000).toFixed(2) + 's');

  const second = down(BUTTON.x, BUTTON.y);
  frames(1);
  assert.ok(ship.dashLeft > 0, 'the next press gets its dash');
  assert.ok(ship.vx > 0, 'and the thumb on the stick never stopped flying');
  lift(second);
  lift(stick);
});

test('a thumb on the right that misses the button is nothing at all', async () => {
  const stick = await fly();
  lift(stick);
  frames(framesOf(0.2));
  assert.equal(ship.vx, 0, 'the ship was stood still first');

  const far = down(VIEW.width - 30, BUTTON.y - BUTTON.r - 60);
  frames(framesOf(0.2));
  assert.equal(ship.dashLeft, 0, 'no dash from a thumb outside the button');
  assert.equal(ship.vx, 0, 'and no ship either, because it is not the stick');
  lift(far);
});

test('a thumb run holds its own trigger and finds its own target', async () => {
  const stick = await fly();
  world.enemies.length = 0;
  // One tank, planted out in front and given four times the hull it would have at this minute, so
  // that the whole test can be watched on one body. One body matters: the crowd is emptied by hand
  // here, and a lock left pointing at a body taken out that way is a lock the world itself would have
  // dropped the moment that body went out of the crowd for real.
  const body = enemyAt('tank', ship.x + 400, ship.y - 120, 40);
  frames(framesOf(0.9));

  assert.equal(world.aimLock, body, 'the gun found a body with nobody aiming for one');
  const afterFirst = body.hp;
  assert.ok(afterFirst < body.maxhp,
    'and the hull came off it: ' + Math.round(body.maxhp - afterFirst) + ' worth');
  assert.equal(game.stats().assists.fire, 'on', 'the held trigger, which the pause rack can let go of');
  assert.equal(game.stats().assists.aim, 'on', 'and the aimed gun, same row down two');

  // The two switches belong to the visit, not to the finger that opened them. Lift the thumb and the
  // run goes on shooting on its own, because what a thumb cannot do is hold a trigger while it is
  // steering - and where it is argued with is the pause rack, which `test/assists.test.mjs` covers.
  lift(stick);
  frames(framesOf(0.9));
  assert.ok(body.hp < afterFirst,
    'the gun went for it with both hands off the glass: '
    + Math.round(afterFirst - body.hp) + ' more');

  assert.equal(game.stats().thumbUsed, true);
});

test('a tap on a card takes the card', async () => {
  const stick = await fly();
  world.xp = 0;
  world.shards.clear();
  world.pendingLevels = 0;
  dropShards(world, ship.x, ship.y, Math.ceil(world.xpNeed / BALANCE.shards.xp));
  let guard = 0;
  while (world.state !== STATE.LEVEL && guard < 400) { game.step(FRAME); guard++; }
  assert.ok(guard < 400, 'the run stopped for a choice');
  assert.equal(world.pendingLevels, 1, 'and only for one');
  const ask = game.texts().find((t) => t.text.startsWith('CHOOSE ONE'));
  assert.ok(ask !== undefined, 'the cards say what they are asking for');
  assert.ok(ask.text.endsWith('OR TAP'),
    'and they ask for the thing a thumb owns: ' + ask.text);

  const taken = world.offer[0];
  const at = firstCard();
  tap(at.x, at.y);
  frames(2);
  assert.equal(world.upgrades[taken], 1, 'the card under the thumb was taken');
  lift(stick);
});

test('a thumb comes back to a paused run with a tap', async () => {
  const stick = await fly();
  press('Escape');
  assert.equal(game.stats().paused, true);
  assert.equal(game.screen.pauseHint, 'TAP TO GO BACK TO THE RUN');

  tap(VIEW.width * 0.5, VIEW.height * 0.5);
  assert.equal(game.stats().paused, false, 'the tap went back into the fight');
  assert.ok(ship.vx !== 0, 'and the thumb that was still on the stick is still flying');
  lift(stick);
});

test('a phone put down under a thumb comes back with nothing leaning', async () => {
  const stick = await fly();
  assert.equal(thumb.onStick, true);

  game.fire('blur', {});
  assert.equal(thumb.onStick, false, 'the stick was let go of');
  assert.equal(thumb.onDash, false, 'and the button with it');
  assert.equal(game.stats().paused, true, 'as the run was, which is what the blur is for');

  tap(VIEW.width * 0.5, VIEW.height * 0.5);
  frames(framesOf(0.4));
  assert.equal(ship.vx, 0, 'and nothing was driving the ship when it came back');
  lift(stick);
});

test('every touch the game is handed is told not to scroll the page', async () => {
  await fly();
  const before = game.touchPrevented;
  let asked = 0;
  const stick = down(STICK_X + 40, STICK_Y);
  asked++;
  for (let i = 0; i < 6; i++) { move(stick, STICK_X + i * 8, STICK_Y); asked++; }
  lift(stick);
  assert.ok(game.touchPrevented - before >= asked,
    (game.touchPrevented - before) + ' of ' + asked + ' touch gestures were stopped');
});
