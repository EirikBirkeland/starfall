// The ship's flight, measured (PLAN 3.1): how quickly it answers a lean, how
// quickly it stands still again, and how much of it an enemy can actually hit.
//
// These drive the scripted world, holding one direction for as long as it takes
// and reading the whole path back. A movement feel is a matter of seconds, so a
// test that counts frames instead would never notice a number being moved.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { enemyAt, scriptedRun, flyFor, stepTheWorld } from '../tools/headless/scripted.js';

const spec = BALANCE.player;
const STEP = BALANCE.sim.step;

const right = { moveX: 1, moveY: 0, moving: true };
const left = { moveX: -1, moveY: 0, moving: true };
const still = { moveX: 0, moveY: 0, moving: false };

/** The ship, parked in the open with room to fly. */
function openSky(seed) {
  const field = scriptedRun(seed);
  const ship = field.player;
  ship.x = field.arena.w / 2;
  ship.y = field.arena.h / 2;
  ship.px = ship.x;
  ship.py = ship.y;
  ship.vx = 0;
  ship.vy = 0;
  return field;
}

const speed = (sample) => Math.sqrt(sample.vx * sample.vx + sample.vy * sample.vy);

/** The first sample whose speed reaches `want`, or null if none does. */
function whenReaching(track, want) {
  return track.find((sample) => speed(sample) >= want) || null;
}

test('the numbers in balance.js are still the ones the plan asks for', () => {
  // PLAN 3.1 quotes the feel in seconds; these check the code says the same.
  assert.equal(spec.hull, 3);
  assert.ok(spec.maxSpeed / spec.accel > 0.11 && spec.maxSpeed / spec.accel < 0.145,
    'full speed arrives ' + (spec.maxSpeed / spec.accel).toFixed(3) + 's after you lean, the plan says about 0.13');
  assert.ok(spec.maxSpeed / spec.brake > 0.08 && spec.maxSpeed / spec.brake < 0.115,
    'the ship stands still ' + (spec.maxSpeed / spec.brake).toFixed(3) + 's after you let go, the plan says about 0.10');
  assert.equal(spec.hitRadius, 6, 'a bullet-hell-sized target');
  assert.ok(spec.drawRadius >= spec.hitRadius * 2, 'with much more of it on screen than that');
});

test('leaning into it puts the whole engine on in about a tenth of a second', () => {
  const field = openSky(61);
  const track = flyFor(0.5, right);

  const ninetyFive = whenReaching(track, spec.maxSpeed * 0.95);
  assert.ok(ninetyFive, 'the ship never got up to speed');
  assert.ok(Math.abs(ninetyFive.t - spec.maxSpeed * 0.95 / spec.accel) < 2 * STEP,
    'full speed arrived at ' + ninetyFive.t.toFixed(3) + 's, not when the plan says');
  assert.ok(track.every((sample) => sample.vy === 0), 'a lean to the right slid the ship somewhere else');
  assert.ok(track.every((sample, i) => i === 0 || speed(sample) >= speed(track[i - 1]) - 1e-9),
    'the ship overshot its speed and rang back down instead of settling on it');
  assert.ok(track.some((sample) => sample.vx === spec.maxSpeed), 'it settles exactly on the top speed');
  assert.equal(field.player.vx, spec.maxSpeed);
});

test('letting go stops it, and stopped means stopped', () => {
  const field = openSky(62);
  field.player.vx = spec.maxSpeed;

  const track = flyFor(0.4, still);
  const halt = track.find((sample) => sample.vx === 0);
  assert.ok(halt, 'the ship never came to a standstill on its own');
  assert.ok(Math.abs(halt.t - spec.maxSpeed / spec.brake) < 2 * STEP,
    'it took ' + halt.t.toFixed(3) + 's to stop, the plan says about 0.10');
  assert.ok(track.every((sample) => sample.vx >= 0), 'braking shoved the ship backwards past zero');
  assert.equal(field.player.vx, 0, 'and it is not creeping');
});

test('the engines cannot hold the ship above its top speed', () => {
  const field = openSky(63);
  // What the input layer actually hands over: a direction, never longer than 1.
  const lean = (x, y) => {
    const length = Math.sqrt(x * x + y * y);
    return { moveX: x / length, moveY: y / length, moving: true };
  };
  const steering = [right, lean(1, 1), lean(0, 1), left, lean(-1, -1), lean(0, -1)];

  let fastest = 0;
  for (const held of steering) {
    for (const sample of flyFor(0.4, held)) fastest = Math.max(fastest, speed(sample));
  }
  assert.ok(fastest <= spec.maxSpeed + 1e-9, 'something flew at ' + fastest.toFixed(2) + ' px/s');
  assert.ok(field.player.x > 0 && field.player.x < field.arena.w, 'and it stayed in the arena doing it');

  // A control layer that hands over a direction longer than 1 - a stick shoved
  // twice as hard, a future touch pad - cannot buy a faster ship.
  for (const sample of flyFor(1, { moveX: 2, moveY: 2, moving: true })) {
    assert.ok(speed(sample) <= spec.maxSpeed + 1e-9, 'a push of 2 flew at ' + speed(sample).toFixed(2));
  }
});

test('turning around is a lean, not a flip', () => {
  const field = openSky(64);
  flyFor(0.5, right);
  assert.equal(field.player.vx, spec.maxSpeed);

  const track = flyFor(0.5, left);
  const reverse = track.find((sample) => sample.vx <= -spec.maxSpeed * 0.95);
  assert.ok(reverse, 'the ship never came back around');
  // It has to lose 320 px/s and earn them back on the other side.
  assert.ok(reverse.t > 0.2 && reverse.t < 0.32,
    'a U-turn took ' + reverse.t.toFixed(3) + 's - a slide, not a pivot and not a pole-vault');
  assert.ok(track.every((sample) => speed(sample) <= spec.maxSpeed + 1e-9), 'the turn overshot the top speed');
});

test('the arena holds the ship by what you can see of it', () => {
  const field = openSky(65);
  flyFor(6, right);
  assert.equal(field.player.x, field.arena.w - spec.drawRadius,
    'the ship rests against the wall by its drawn body, not by its much smaller hit radius');

  flyFor(6, { moveX: 0, moveY: -1, moving: true });
  assert.equal(field.player.y, spec.drawRadius);
});

test('an enemy has to touch the ship to hurt it', () => {
  const field = scriptedRun(66);
  const ship = field.player;
  ship.invuln = 0;
  const foe = enemyAt('drifter', 0, 0);

  // Overlapping the drawing of the ship and nowhere near the part that can be
  // hurt. This is the whole point of a small hit radius.
  foe.x = ship.x + foe.r + ship.r + 2;
  foe.y = ship.y;
  for (let i = 0; i < 30; i++) stepTheWorld(still);
  assert.equal(ship.hull, spec.hull, 'brushing the paint cost a hull');

  foe.x = ship.x + foe.r + ship.r - 1;      // on top of the core now
  stepTheWorld(still);
  assert.equal(ship.hull, spec.hull - 1, 'and being touched should');
  assert.ok(ship.invuln > 0 && ship.invuln <= spec.hitInvulnerability,
    'a moment of grace, as long as the plan says');
});
