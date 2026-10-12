// The bot's dash habit (tools/headless/bot.js): when it presses the dash, and which way it sends
// it.
//
// This is a test about the *instrument* and not about the game: what a dash does once it has begun
// is test/dash.test.mjs, and the keys that make a dash request are test/controls.test.mjs. What
// lives here is the claim that a bot given `--dash` dashes *out* of trouble, because the habit that
// shipped up to 0.10.19 dashed at whatever it was running from and moved the guns to do it, and
// every dash line in the deck was priced against it. `tools/dash-habit.js` is the ladder that made
// that a measurement; these are the tests that keep it from quietly coming back.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import {
  dashEscape, dashDive, dashAlongTheEscape, DASH_HABITS, DEFAULT_DASH_HABIT, dashHabitOf,
  setDashDial, DASH, playOneRun, FRAME_MS,
} from '../tools/headless/bot.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 61 });
const world = game.world;
const ship = world.player;
const ARENA = BALANCE.arena;
const CENTRE = { x: ARENA.w / 2, y: ARENA.h / 2 };
const REACH = BALANCE.player.dash.distance;
const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

/**
 * A run with the ship parked where the test wants it and nothing in the arena but what the test
 * plants. Spawn is stopped and the ship made immortal: these tests are about a press and a
 * direction, and a weaver wandering in would decide both.
 */
function park(x, y) {
  if (world.state !== game.STATE.PLAY) {
    game.pressMouse(CENTRE.x, CENTRE.y - 200);       // the left button launches the run
    game.step(FRAME_MS);
  }
  for (const code of KEYS) game.key(code, false);
  world.spawnTimer = Infinity;
  world.enemies.length = 0;
  ship.invuln = Infinity;
  ship.hull = 3;
  ship.x = x === undefined ? CENTRE.x : x;
  ship.y = y === undefined ? CENTRE.y : y;
  ship.px = ship.x;
  ship.py = ship.y;
  ship.vx = 0;
  ship.vy = 0;
  ship.dashLeft = 0;
  ship.dashCd = 0;
  // The pointer is put on the glass: a bot that dashes without moving its aim has to have an aim to
  // keep, and tapDash refuses to invent a place to press (harness.js).
  game.moveMouse(ship.x + 200, ship.y);
}

/** A body standing still at a place of the test's choosing. */
function plant(type, x, y) {
  const enemy = makeEnemy(world, type, x, y, { hp: 1e6, speed: 0, drop: 0, score: 0 });
  world.enemies.push(enemy);
  return enemy;
}

/** One frame, and the direction the ship is throwing itself, or null if it never went. */
function frameAndDirection() {
  game.step(FRAME_MS);
  if (ship.dashLeft <= 0) return null;
  return { x: ship.dashDirX, y: ship.dashDirY };
}

/** How much a dash direction agrees with a vector from the ship to where the trouble was. */
function agreement(dir, to) {
  const length = Math.hypot(to.x, to.y) || 1;
  return (dir.x * to.x + dir.y * to.y) / length;
}

test('the get-out sends the ship the way the crowd is not', () => {
  park();
  const trouble = { x: 40, y: 12 };
  plant('drifter', ship.x + trouble.x, ship.y + trouble.y);
  dashEscape(game);
  const dir = frameAndDirection();
  assert.ok(dir, 'the habit never dashed with a body within reach');
  assert.ok(agreement(dir, trouble) < -0.3, 'the dash went (' + dir.x.toFixed(2) + ','
    + dir.y.toFixed(2) + ') - that is towards the body, not away from it');
});

test('the press does not move where the guns are pointed', () => {
  park();
  const trouble = { x: -38, y: -20 };
  plant('drifter', ship.x + trouble.x, ship.y + trouble.y);
  game.moveMouse(ship.x + 300, ship.y - 300);       // the policy's own aim
  const before = game.pointer;
  dashEscape(game);
  const dir = frameAndDirection();
  assert.ok(dir, 'the habit never dashed');
  assert.ok(agreement(dir, trouble) < -0.3, 'the dash went at the body instead of off it');
  assert.deepEqual(game.pointer, before,
    'the press moved the pointer, and with it the guns - that is the old habit');
});

test('a dash is a get-out, so nothing is pressed for a body that is not on top of the ship', () => {
  park();
  plant('drifter', ship.x + 120, ship.y);           // nearer than the walk's panic, further than a reach
  dashEscape(game);
  game.step(FRAME_MS);
  assert.equal(ship.dashCd, 0, 'the habit spent a dash on a body that could not touch it yet');
  assert.equal(ship.dashLeft, 0);
  world.enemies.length = 0;
  plant('drifter', CENTRE.x + 900, CENTRE.y);       // a body across the arena
  dashEscape(game);
  game.step(FRAME_MS);
  assert.equal(ship.dashCd, 0, 'the habit spent a dash on an empty arena');
  assert.equal(ship.dashLeft, 0);
});

test('a press inside the wait is spent, and buys no second dash', () => {
  park();
  plant('drifter', ship.x + 40, ship.y);
  dashDive(game);                                    // any dash will do; this one is one frame of it
  game.step(FRAME_MS);
  assert.ok(ship.dashCd > 0, 'the first dash never happened');
  const granted = world.tally.dashes;
  ship.dashLeft = 0;                                 // end the dash here and keep the wait
  for (let frame = 0; frame < 30; frame++) {
    dashEscape(game);
    game.step(FRAME_MS);
  }
  assert.equal(world.tally.dashes, granted, 'the wait let a second dash through');
  assert.ok(ship.dashCd > 0, 'and the wait was over before its 2.5 s were up');
});

test('the dive habit still dives, because that is what it is for', () => {
  // Pinned, not endorsed: tools/dash-habit.js measures against this habit, and its report is only
  // worth anything while `dive` means "at the thing you are running from".
  park();
  const trouble = { x: 40, y: 12 };
  plant('drifter', ship.x + trouble.x, ship.y + trouble.y);
  dashDive(game);
  const dir = frameAndDirection();
  assert.ok(dir, 'the dive habit never dashed');
  assert.ok(agreement(dir, trouble) > 0.3, 'the dive habit went (' + dir.x.toFixed(2) + ','
    + dir.y.toFixed(2) + '), which is not a dive');
});

test('the third habit walks the threat model out of the same scrape', () => {
  park();
  const trouble = { x: 40, y: 12 };
  plant('drifter', ship.x + trouble.x, ship.y + trouble.y);
  dashAlongTheEscape(game);
  const dir = frameAndDirection();
  assert.ok(dir, 'the habit never dashed');
  assert.ok(agreement(dir, trouble) < -0.3, 'the dash did not follow the way out the threats say');
});

test('a wall vetoes the axis it stands on, and the dash goes along it', () => {
  // The ship flat against the west wall, the crowd east of it and a little north: straight out is
  // into the wall, so the west component is the wall's and what is left is the length of the wall.
  park(60, CENTRE.y);
  plant('drifter', ship.x + 38, ship.y - 20);
  dashEscape(game);
  const dir = frameAndDirection();
  assert.ok(dir, 'the habit never dashed along the wall');
  assert.ok(Math.abs(dir.x) < 0.01, 'it kept ' + dir.x.toFixed(2) + ' of a wall the dash could not cross');
  assert.ok(dir.y > 0.9, 'and it found no way along it');
});

test('a dash with nowhere to go is kept and not spent', () => {
  // One body due east of a ship flat on the west wall: the only way the crowd says is out is the
  // wall. Spending the press would buy a wait and no ground, so the habit holds it.
  park(60, CENTRE.y);
  plant('drifter', ship.x + 40, ship.y);
  dashEscape(game);
  game.step(FRAME_MS);
  assert.equal(ship.dashCd, 0, 'the habit spent a dash against a wall');
  assert.equal(ship.dashLeft, 0);
});

test('a balanced crowd still gets an answer, and not a NaN', () => {
  // Two equal bodies on opposite sides: their pushes cancel exactly, which is the case the crowd's
  // opinion cannot answer and the fallback has to.
  park();
  plant('drifter', ship.x + 35, ship.y);
  plant('drifter', ship.x - 35, ship.y);
  dashEscape(game);
  const dir = frameAndDirection();
  assert.ok(dir, 'the habit never dashed out of a pinch');
  assert.ok(Number.isFinite(dir.x) && Number.isFinite(dir.y), 'the dash direction is not a number');
  assert.ok(Math.abs(Math.hypot(dir.x, dir.y) - 1) < 1e-6, 'the dash direction is not a direction');
});

test('the habits by name, and the one --dash means', () => {
  assert.equal(dashHabitOf(undefined), DASH_HABITS[DEFAULT_DASH_HABIT]);
  assert.equal(dashHabitOf(true), DASH_HABITS[DEFAULT_DASH_HABIT]);
  assert.equal(dashHabitOf('dive'), dashDive);
  assert.throws(() => dashHabitOf('sideways'), /no dash habit is called sideways/);
});

test('how cornered the bot has to be before it spends a dash', () => {
  // Pinned against tools/dash-habit.js's sweep, which is the only reason the number is what it is:
  // pressing whenever a body is 170 px out - the walk's own panic distance, which is where the first
  // habit borrowed it from - lost more runs than not having the habit at all, and pressing at a
  // reach won it. Widen this back towards the panic distance and the sweep says you are measuring a
  // bot that dashes itself into the ground.
  assert.equal(DASH.trigger, 45);
  assert.ok(DASH.trigger < 170, 'the press is a panic, not a reflex');
  // The direction wants the whole neighbourhood even though the press wants the one body that nearly
  // has me, so the ring that votes is wider than the ring that decides.
  assert.ok(DASH.push > DASH.trigger, 'the way out was measured off a wider ring than the press');
});

test("the habit's dials can be put over, and refuse a number that is not one", () => {
  const before = { trigger: DASH.trigger, push: DASH.push };
  try {
    assert.equal(setDashDial({ trigger: 60 }).trigger, 60);
    assert.throws(() => setDashDial({ panic: 3 }), /no number called panic/);
    assert.throws(() => setDashDial({ push: 'wide' }), /push wants a finite number/);
  } finally {
    setDashDial(before);
  }
  assert.equal(DASH.trigger, before.trigger);
  assert.equal(DASH.push, before.push);
});

test('tapDash presses where the pointer was put and nowhere else', () => {
  // The stub remembers the last place a hand or a bot put the pointer, which is what makes a dash
  // that leaves the aim alone possible at all; before anything did, there is no answer and the
  // harness says so instead of pressing a corner of the window.
  game.moveMouse(411, 233);
  assert.deepEqual(game.pointer, { x: 411, y: 233 });
  game.pressMouse(80, 90, 2);
  assert.deepEqual(game.pointer, { x: 80, y: 90 });
});

test('a bot told to dash dashes, and one not told does not', async () => {
  // The same two minutes twice, on the same seed: the only difference is the habit. This is the
  // claim that `--dash` does anything at all, and that leaving it out still means the bot that
  // never touches the dash, which is what every number already in NOTES.md was measured with. Two
  // minutes and not thirty seconds because the shipped trigger is a reach, and a bot that dodges
  // as well as this one does has to be properly cornered before it presses.
  await game.resetToTitle(61);
  const withHabit = playOneRun(game, { maxSeconds: 120, dash: true });
  assert.ok(withHabit.tally.dashes > 0, 'a run with the habit never dashed');
  await game.resetToTitle(61);
  const without = playOneRun(game, { maxSeconds: 120 });
  assert.equal(without.tally.dashes, 0, 'a run without the habit dashed anyway');
});
