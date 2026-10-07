// The dash (PLAN 3.1): 220 px in 0.12 s, a 2.5 s wait, and nothing able to
// touch you while it lasts.
//
// These drive the scripted world, so they can put one enemy in exactly one place
// and measure the ship in seconds. The key presses themselves - the real keyboard
// and mouse modules - are test/controls.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { enemyAt, scriptedRun, flyFor, stepTheWorld } from '../tools/headless/scripted.js';

const spec = BALANCE.player.dash;
const STEP = BALANCE.sim.step;
const DASH_SPEED = spec.distance / spec.time;
const GLIDE = BALANCE.player.maxSpeed * BALANCE.player.maxSpeed / (2 * BALANCE.player.brake);

const still = { moveX: 0, moveY: 0, moving: false };
const right = { moveX: 1, moveY: 0, moving: true };

/**
 * What a dash aimed to the right asks for: nothing held, the cursor out to the
 * right. A dash request is one step's worth, which is what the input layer
 * promises (see test/controls.test.mjs for the keys that make one).
 */
function pressDash(field, input) {
  const ship = field.player;
  return Object.assign({ dash: true, aimX: ship.x + 100, aimY: ship.y }, input);
}

/** The ship, in the open, standing still, and unprotected. */
function openSky(seed, x, y) {
  const field = scriptedRun(seed);
  const ship = field.player;
  ship.x = x === undefined ? field.arena.w / 2 : x;
  ship.y = y === undefined ? field.arena.h / 2 : y;
  ship.px = ship.x;
  ship.py = ship.y;
  ship.vx = 0;
  ship.vy = 0;
  ship.invuln = 0;
  return field;
}

/** Fly until the dash is over, and hand back the sample it ended on. */
function finishDash(input) {
  const track = flyFor(2, input || still);
  const end = track.find((sample) => sample.dashLeft === 0);
  assert.ok(end, 'the dash never finished');
  return end;
}

/** Step until the ship may dash again, and report how long that took. */
function waitOutOfDash(field) {
  let waited = 0;
  while (field.player.dashCd > 0 && waited < 10) {
    stepTheWorld(still);
    waited += STEP;
  }
  return waited;
}

test('the plan asks for 220 px in 0.12 s out of a 2.5 s wait', () => {
  assert.equal(spec.distance, 220);
  assert.equal(spec.time, 0.12);
  assert.equal(spec.cooldown, 2.5);
  assert.ok(DASH_SPEED > BALANCE.player.maxSpeed * 4, 'a dash has to be far quicker than the ship');
});

test('a dash covers its whole distance and no further', () => {
  const field = openSky(71);
  const ship = field.player;
  const from = ship.x;

  stepTheWorld(pressDash(field));
  const end = finishDash();

  assert.ok(Math.abs(end.x - (from + spec.distance)) < 1e-9,
    'the dash carried the ship ' + (end.x - from) + ' px, not ' + spec.distance);
  // 14.4 steps of distance is 15 steps of clock - the last one only covers what
  // is left, which is what makes the distance exact. The step that began the
  // dash is not in the track, so it is added back here.
  const endedAt = end.t + STEP;
  assert.ok(endedAt > spec.time && endedAt < spec.time + 2 * STEP,
    'the dash took ' + endedAt.toFixed(3) + 's, the plan says ' + spec.time);
});

test('what a dash leaves behind is a short glide, and then a standstill', () => {
  const field = openSky(72);
  const ship = field.player;
  const from = ship.x;

  stepTheWorld(pressDash(field));
  flyFor(1, still);

  // The burst hands the ship back to the engines at the dash's direction and the
  // ship's own top speed, so it slides on for a moment and then brakes to nothing.
  assert.equal(ship.vx, 0, 'the ship is standing still, not creeping');
  const glide = ship.x - from - spec.distance;
  assert.ok(Math.abs(glide - GLIDE) < 3,
    'it slid on ' + glide.toFixed(1) + ' px, about ' + GLIDE.toFixed(1) + ' was expected');
});

test('the dash goes where you are leaning', () => {
  const field = openSky(73);
  const ship = field.player;
  const from = ship.x;
  const lean = { moveX: -1, moveY: 0, moving: true };

  // Leaning left with the cursor to the right: the lean wins, because that is the
  // way the ship was already being driven.
  stepTheWorld(pressDash(field, lean));
  const end = finishDash(lean);
  assert.ok(Math.abs(end.x - (from - spec.distance)) < 1e-9, 'the dash went the wrong way');
  assert.equal(end.y, ship.y, 'and it drifted sideways doing it');
});

test('with nothing held it goes where you are looking, diagonally and all', () => {
  const field = openSky(74);
  const ship = field.player;
  const from = { x: ship.x, y: ship.y };

  stepTheWorld({ dash: true, aimX: ship.x - 30, aimY: ship.y - 40 });
  const end = finishDash();
  const covered = Math.hypot(end.x - from.x, end.y - from.y);
  assert.ok(Math.abs(covered - spec.distance) < 1e-9,
    'a dash at the cursor covered ' + covered.toFixed(2) + ' px');
  assert.ok(end.x < from.x && end.y < from.y, 'it did not go where the cursor was');
});

test('the engines are ignored while the dash lasts', () => {
  const field = openSky(75);
  const ship = field.player;
  flyFor(0.5, right);
  assert.equal(ship.vx, BALANCE.player.maxSpeed, 'the ship was flat out to the right');
  const from = ship.x;
  const back = { moveX: -0.5, moveY: 0, moving: true };

  // Dash backwards at half throttle: the ship goes backwards, at the dash's own
  // steady speed, whatever the engines are asking for meanwhile.
  stepTheWorld(pressDash(field, back));
  let last = ship.x;
  while (ship.dashLeft > 0) {
    stepTheWorld(back);
    if (ship.dashLeft > 0) {
      assert.ok(Math.abs((last - ship.x) - DASH_SPEED * STEP) < 1e-9,
        'the dash did not hold a steady speed through the air');
    }
    last = ship.x;
  }
  assert.ok(Math.abs(ship.x - (from - spec.distance)) < 1e-9, 'the dash came up short');
  assert.equal(ship.vx, -BALANCE.player.maxSpeed, 'it came back to the engines at full speed');
});

test('the dash paints between where it was and where it is', () => {
  // The interpolation contract (render/interp.js): a position may only change
  // inside a step, and whatever moved it remembers where the step began.
  const field = openSky(76);
  const ship = field.player;
  stepTheWorld(pressDash(field));
  assert.ok(Math.abs((ship.x - ship.px) - DASH_SPEED * STEP) < 1e-9,
    'a dash step did not remember where it started');
  assert.equal(ship.y, ship.py);
});

test('the arena holds the ship through a dash, and the wait is still paid', () => {
  const wall = BALANCE.arena.w - BALANCE.player.drawRadius;
  const field = openSky(77, wall - 20);
  const ship = field.player;

  stepTheWorld(pressDash(field));
  assert.equal(ship.dashCd, spec.cooldown, 'a dash stopped dead by a wall still costs its wait');
  assert.ok(ship.x < wall, 'the dash was still underway when the wall stopped it');

  const waited = waitOutOfDash(field);
  assert.ok(Math.abs(waited - spec.cooldown) < 2 * STEP,
    'the wait from the press to being ready again lasted ' + waited.toFixed(3) + 's');
  assert.equal(ship.dashCd, 0);

  flyFor(1, still);
  assert.equal(ship.x, wall, 'a dash into a wall goes no further than the wall');
  assert.equal(ship.dashLeft, 0, 'and it is over, wall or no wall');
});

test('nothing can touch you while you dash', () => {
  const field = openSky(78);
  const ship = field.player;
  const hull = ship.hull;
  const foe = enemyAt('chaser', ship.x + 90, ship.y);
  const reach = foe.r + ship.r;

  stepTheWorld(pressDash(field));
  let passedThrough = false;
  while (ship.dashLeft > 0) {
    stepTheWorld(still);
    if (Math.abs(foe.x - ship.x) <= reach) passedThrough = true;
  }
  assert.ok(passedThrough, 'the dash never actually went through the enemy');
  assert.equal(ship.hull, hull, 'dashing through something costs nothing');

  // The same contact, one step after the dash is over, costs a hull as usual.
  foe.x = ship.x;
  foe.y = ship.y;
  foe.ix = 0;                    // standing still now, not still fleeing the dash
  foe.iy = 0;
  stepTheWorld(still);
  assert.equal(ship.hull, hull - 1, 'and the crowd can hurt again the moment it is over');
});

test('a dash shoulders the crowd out of the way', () => {
  const field = openSky(79);
  const ship = field.player;
  const foe = enemyAt('chaser', ship.x + 40, ship.y);
  const before = foe.x;

  stepTheWorld(pressDash(field));
  assert.ok(foe.ix > 100, 'the crowd was not shoved at all');
  stepTheWorld(still);
  assert.ok(foe.x > before, 'and it did not move out of the way');
});

test('one press is one dash, and a press spent on the wait buys nothing', () => {
  const field = openSky(80);
  const ship = field.player;

  stepTheWorld(pressDash(field));
  assert.ok(ship.dashLeft > 0, 'the first press began a dash');
  flyFor(0.3, still);
  assert.equal(ship.dashLeft, 0, 'and it is over');

  stepTheWorld(pressDash(field));
  assert.equal(ship.dashLeft, 0, 'a second press during the wait began another dash');
  assert.ok(ship.dashCd > 0, 'the wait is still running');

  const waited = waitOutOfDash(field);
  assert.ok(Math.abs(waited - (spec.cooldown - 0.3)) < 3 * STEP,
    'the wait gave up after ' + waited.toFixed(3) + 's of waiting');
  stepTheWorld(pressDash(field));
  assert.ok(ship.dashLeft > 0, 'a press once it is ready dashes again');
});

test('a dash throws sparks and a ring', () => {
  const field = openSky(81);
  const before = field.particles.count;
  const rings = field.rings.count;

  stepTheWorld(pressDash(field));
  assert.ok(field.rings.count > rings, 'no ring marked the moment it started');
  assert.ok(field.particles.count > before + 10, 'no burst marked it either');

  const after = field.particles.count;
  for (let i = 0; i < 5; i++) stepTheWorld(still);
  assert.ok(field.particles.count > after, 'the dash dragged no streak behind it');
});
