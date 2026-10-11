// The gamepad (PLAN section 6): a stick to fly with, a stick to point the guns with, a shoulder to
// dash with, and the two presses every screen already means.
//
// The harness has no hands either, so a pad is a table of axes and buttons that `setPad` puts on the
// browser (tools/headless/harness.js) and the game reads once a frame - which is exactly how a real
// pad is read, and why nothing here has to wait for an event or fire one.
//
// Two things every test has to say to itself before it says anything to the game:
//
//   * **which hand it is using.** A pad joins a keyboard and a mouse rather than replacing them, and
//     the last hand to speak is the one the ship listens to. A test that leans a stick has to have
//     not been holding a key, and a test that measures the pointer has to know whether a stick has
//     been pointed since it moved;
//   * **that the pad it is holding is the one it plugged in.** One boot per process (the harness's
//     note), so every test plugs its own pad in after `resetToTitle`, and a test that wants no pad
//     says so with `unplug()` rather than inheriting the last one's lean.
//
// Everything is measured in seconds and in px of ship, and in the ship's own angles, because a stick
// is a physical thing: how far it went, which way the nose points, and how many shots left the gun.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { stickReach } from '../src/input/touch.js';
import { padTaps } from '../src/input/gamepad.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4031;

// The two buttons a pad presses on this file's behalf, and the axes it leans. Both are the same on
// every pad the game knows about; the two that differ per family - the right trigger and Start - are
// named where the tests that care about them say so.
const A = 0;
const RB = 5;
const LEFT_X = 0;
const LEFT_Y = 1;
const RIGHT_X = 2;
const RIGHT_Y = 3;

const game = await bootGame({ root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height });
const world = game.world;
const ship = world.player;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

/** How many frames `seconds` is, at the frame rate every number here is measured at. */
function framesOf(seconds) {
  return Math.round(seconds * 1000 / FRAME);
}

/** Put a pad on the browser and give the game a frame to notice it. `null` is no pad at all. */
function plug(state) {
  game.setPad(state === undefined ? {} : state);
  frames(1);
}

function unplug() {
  game.setPad(null);
  frames(1);
}

function axis(index, value) {
  game.padAxis(index, value);
}

/** Home both sticks: nothing leaned, nothing held, the pad still in the browser's hands. */
function release() {
  axis(LEFT_X, 0); axis(LEFT_Y, 0); axis(RIGHT_X, 0); axis(RIGHT_Y, 0);
  frames(1);
}

/** One press of one button, held for a frame and let go like a hand would. */
function press(button) {
  game.padButton(button, true);
  frames(1);
  game.padButton(button, false);
  frames(1);
}

/** Lean the left stick (the ship's own lean). */
function lean(x, y) {
  axis(LEFT_X, x);
  axis(LEFT_Y, y === undefined ? 0 : y);
}

/** Lean the right stick (where the guns point, and the trigger with them). */
function point(x, y) {
  axis(RIGHT_X, x);
  axis(RIGHT_Y, y === undefined ? 0 : y);
}

/**
 * A run flown on a pad: a fresh title, a pad with nothing on it, and the A button launching it - the
 * way a hand on a pad launches anything, and the reason the pointer has not been touched and still
 * has nowhere to own.
 */
async function fly() {
  await game.resetToTitle(SEED);
  frames(2);
  plug({});
  press(A);
  frames(2);
  assert.equal(world.state, STATE.PLAY, 'the pad launched the run');
  assert.equal(ship.dashCd, 0, 'and the run is whole: nothing spent before it started');
}

/**
 * The whole run as a test can see it, for the one test that compares two of them. `base` is the
 * shot count when the run began, because a pool counts every life it has ever lived and not just
 * this run's (core/pool.js).
 */
function snapshot(base) {
  return {
    score: world.score,
    kills: world.kills,
    level: ship.level,
    hull: ship.hull,
    t: Math.round(world.elapsed * 1e6),
    x: Math.round(ship.x * 1e6),
    y: Math.round(ship.y * 1e6),
    angle: Math.round(ship.angle * 1e6),
    shots: world.bullets.stats().spawned - base,
    shards: world.shardsCollected,
    seed: world.seed,
  };
}

/** Fly the same twenty seconds of keyboard every time, so two of them can be compared. */
function flyTheSameRun() {
  game.key('KeyD', true);
  frames(framesOf(4));
  game.key('KeyD', false);
  game.key('KeyS', true);
  frames(framesOf(3));
  game.key('KeyS', false);
  game.key('KeyW', true);
  frames(framesOf(6));
  game.key('KeyW', false);
  frames(framesOf(7));
}

test('the pad is seen by name, and is nobody until it is plugged in', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(game.stats().pad, '', 'a visit that never had a pad says so');

  plug({});
  assert.equal(game.stats().pad, 'HEADLESS PAD', 'and a pad is named by what the browser calls it');

  game.setPad({ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 0x045d Product: 0x028f)' });
  frames(1);
  assert.equal(game.stats().pad, 'Wireless Controller', 'the part a human reads, and not the driver');

  unplug();
  assert.equal(game.stats().pad, '', 'and it goes back to nobody when it is taken away');
});

test('A is the launch key, and is not also a dash', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  plug({});
  press(A);
  frames(4);
  assert.equal(world.state, STATE.PLAY, 'A launches');
  assert.equal(ship.dashCd, 0, 'and spends no dash on the way out of the title');
  assert.equal(ship.vx, 0, 'and no lean either');
});

test('A on the wreck is the restart, and Start over a held run lets it go again', async () => {
  await fly();
  // Start holds the run where it stands, and the same press lets it go (game/run.js).
  press(9);
  frames(1);
  assert.equal(game.stats().paused, true, 'the run is being held');
  assert.equal(game.screen.pauseHidden, false, 'and the pause rack is on the glass');
  press(9);
  frames(1);
  assert.equal(game.stats().paused, false, 'and the same press is the way back out');
  assert.equal(game.screen.pauseHidden, true);
});

test('the left stick flies the ship, and its dead zone does not', async () => {
  await fly();

  lean(0.12, 0.05);
  frames(framesOf(0.4));
  assert.equal(ship.vx, 0, 'a stick that is barely off its middle is a stick at rest');

  lean(1, 0);
  frames(framesOf(0.4));
  assert.ok(ship.vx > ship.maxSpeed * 0.9, 'a full lean is the ship at its own top speed: ' + ship.vx);

  const from = ship.x;
  frames(framesOf(0.5));
  assert.ok(ship.x - from > ship.maxSpeed * 0.4, 'and it keeps going while the stick is held there');

  release();
  frames(framesOf(0.4));
  assert.equal(ship.vx, 0, 'a stick back at its middle brakes the ship dead');
});

test('a stick that has only just cleared its dead zone is a nudge and not a lurch', async () => {
  await fly();
  // Just past the line input/gamepad.js draws: the push is remeasured from the zone, so this is a
  // crawl and not a jump to a third of the ship's speed.
  lean(0.26, 0);
  frames(framesOf(0.4));
  const nudge = Math.abs(ship.vx);
  assert.ok(nudge > 0, 'it is a lean, though');
  assert.ok(nudge < ship.maxSpeed * 0.2, 'a crawl: ' + Math.round(nudge) + ' px/s of ' + ship.maxSpeed);

  lean(1, 0);
  frames(framesOf(0.4));
  assert.ok(Math.abs(ship.vx) > nudge * 4, 'and the rest of the stick is the rest of the ship');
  release();
});

test('the right stick points the nose, and holds the trigger open while it is pointed', async () => {
  await fly();

  point(1, 0);
  frames(framesOf(0.2));
  assert.ok(Math.abs(ship.angle) < 0.1, 'a stick right is a nose right: ' + ship.angle);
  point(0, -1);
  frames(framesOf(0.2));
  assert.ok(Math.abs(ship.angle + Math.PI / 2) < 0.1, 'a stick up is a nose up: ' + ship.angle);

  const fired = world.bullets.stats().spawned;
  assert.ok(fired > 0, 'and a gun pointed anywhere at all is a gun that is firing: ' + fired + ' shots');

  point(0, 0);
  frames(framesOf(0.4));
  assert.equal(world.bullets.stats().spawned, fired, 'a stick at rest holds nothing open');
});

test('a stick that comes back to its middle keeps the nose where it left it, until the pointer speaks', async () => {
  await fly();

  point(1, 0);
  frames(framesOf(0.2));
  assert.ok(Math.abs(ship.angle) < 0.1, 'pointed right');

  point(0, 0);
  frames(framesOf(0.4));
  assert.ok(Math.abs(ship.angle) < 0.1,
    'and it is still pointed right after the stick went home: ' + ship.angle);

  // The pointer has been sitting where the page left it since boot and has never been moved. One move
  // is a hand taking the aim back, and the nose follows it (input/index.js keeps the one variable that
  // says which hand spoke last).
  game.moveMouse(200, 600);
  frames(framesOf(0.2));
  assert.ok(ship.angle > 0.4 || ship.angle < -2.4,
    'the pointer took the nose back to the bottom-left corner: ' + ship.angle);
});

test('the shoulder dashes once per press, however hard it is mashed', async () => {
  await fly();

  game.padButton(RB, true);
  frames(1);
  assert.ok(ship.dashLeft > 0, 'the dash is on its rails');
  game.padButton(RB, false);

  // The whole wait, mashed, in a bounded loop (session 9's trap: a mashed dash is never observed at
  // rest, so count the dash *starts* and assert there was exactly one of them).
  let starts = 0;
  let dashing = ship.dashLeft > 0;
  const cap = framesOf(ship.dashWait + 0.3);
  for (let i = 0; i < cap; i++) {
    game.padButton(RB, i % 4 === 0);
    game.step(FRAME);
    const now = ship.dashLeft > 0;
    if (now && !dashing) starts++;
    dashing = now;
  }
  game.padButton(RB, false);
  assert.equal(starts, 1, 'one dash out of the whole mash, when the wait was paid');
  assert.ok(ship.dashCd > 0, 'and its wait is being paid again');
});

test('the right shoulder dashes on both families of pad, wherever its trigger lives', async () => {
  // A four-axis pad reports its triggers as buttons, and the right one is 7.
  await fly();
  press(7);
  frames(2);
  assert.ok(ship.dashLeft > 0 || ship.dashCd > 0, 'a four-axis pad dashes on its right trigger');

  // A six-axis one reports them as axes 4 and 5, and has no button 7 to press at all.
  await fly();
  plug({ axes: [0, 0, 0, 0, 0, -1] });
  assert.equal(ship.dashCd, 0, 'a pad that arrives at rest is at rest');
  axis(5, 0.9);
  frames(2);
  assert.ok(ship.dashLeft > 0, 'a six-axis pad dashes on its right trigger: ' + ship.dashLeft);

  // ...and a trigger held at the end of its pull is one press, not a mash: it is an analog axis, and
  // the dash is a request for a thing to happen, not a state to be in.
  let starts = 0;
  let dashing = true;
  const cap = framesOf(ship.dashWait + 0.3);
  for (let i = 0; i < cap; i++) {
    game.step(FRAME);
    const now = ship.dashLeft > 0;
    if (now && !dashing) starts++;
    dashing = now;
  }
  assert.equal(starts, 0, 'a trigger pulled and held dashes once, not again when it is paid for');
  axis(5, -1);
  frames(2);
  assert.equal(ship.dashLeft, 0, 'and a trigger sitting at its resting value is not held down');
});

test('Start on a six-axis pad is the pause, which is not where a four-axis pad keeps it', async () => {
  await fly();
  plug({ axes: [0, 0, 0, 0, 0, -1] });
  press(7);
  frames(1);
  assert.equal(game.stats().paused, true, 'button 7 is Start here, and Start holds the run');
  press(7);
  frames(1);
  assert.equal(game.stats().paused, false, 'and lets it go again');
});

test('a pad that goes away mid-run stops flying the ship', async () => {
  await fly();
  lean(1, 0);
  point(1, 0);
  frames(framesOf(0.5));
  assert.ok(ship.vx > 100, 'the pad has the ship going right');
  const shots = world.bullets.stats().spawned;

  unplug();
  frames(framesOf(0.4));
  assert.equal(ship.vx, 0, 'and a pad that has left is not still driving');
  assert.equal(world.bullets.stats().spawned, shots, 'nor still firing');
  assert.equal(game.stats().pad, '', 'and the game knows it left');
});

test('a dash asked for as the window goes away is not a dash owed to whatever comes back', async () => {
  await game.resetToTitle(SEED);
  frames(2);
  plug({});
  game.padButton(RB, true);
  game.step(1);      // a frame that runs no step at all: the request is still waiting
  assert.equal(padTaps.dash, true, 'the press is waiting for a step to hand it to');
  game.fire('blur', {});
  assert.equal(padTaps.dash, false, 'and the window losing focus spends it');
  game.padButton(RB, false);
});

test('a pad nobody is holding flies exactly the run a padless visit flies', async () => {
  // The whole point of the feature being a poll that writes two zeroes and a false: a visit with a pad
  // lying on the desk, and a visit that has never seen one, are the same visit. Same seed, same
  // keyboard, and every number a run can be asked about has to agree.
  unplug();
  await game.resetToTitle(SEED);
  const before = world.bullets.stats().spawned;
  frames(2);
  game.key('Space', true);
  frames(2);
  game.key('Space', false);
  frames(2);
  flyTheSameRun();
  const alone = snapshot(before);

  await game.resetToTitle(SEED);
  const again = world.bullets.stats().spawned;
  frames(2);
  plug({});
  game.key('Space', true);
  frames(2);
  game.key('Space', false);
  frames(2);
  flyTheSameRun();
  const watched = snapshot(again);

  assert.deepEqual(watched, alone, 'a pad that was there changed something it should not have');
  game.key('Space', false);
  release();
});

// Last on purpose, and not by taste. A thumb is never picked up again once it has been laid down
// (input/touch.js, and session 105's note on why), which means this test leaves the two assists a
// thumb ships with - held trigger, self-pointing gun - switched on for every test after it in this
// process. Everything above measures a hand that is holding the gun and pointing it itself, so the
// finger comes last.
test('the left stick is the last word for the keys, and a thumb is the last word for it', async () => {
  await fly();
  game.key('KeyA', true);
  frames(framesOf(0.5));
  assert.ok(ship.vx < 0, 'the keyboard has the ship going left first');

  lean(1, 0);
  frames(framesOf(0.6));
  assert.ok(ship.vx > 0, 'and the stick takes it the other way: vx ' + ship.vx);

  // ...and a finger on the glass outranks it: the stick was left leaned, the thumb is the news.
  const reach = stickReach(VIEW.width, VIEW.height);
  const thumb = 7;
  game.touchDown(300, 420, thumb);
  game.touchMove(300 - reach, 420, thumb);
  frames(framesOf(0.6));
  assert.ok(ship.vx < 0, 'the thumb takes it back: vx ' + ship.vx);
  game.touchUp(0, 0, thumb);
  game.key('KeyA', false);
  release();
});
