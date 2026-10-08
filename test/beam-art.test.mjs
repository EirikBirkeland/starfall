// The sniper's telegraph and its beam, as drawn (PLAN 3.3's "long telegraphed laser").
//
// There is no browser here, so this cannot say what the band of light looks like. What
// it can say is the two things that matter about it:
//
//   It is drawn as wide as it hurts. The widest stroke of a lock is exactly twice
//     `beamHalfWidth`, the number the damage is measured with, and the beam is drawn at
//     the same width as the warning that came before it - so the light never claims a
//     finger's width more or less than the harm (game/beams.js).
//   It is drawn wherever the arena can be seen. The body may be off the glass; the line
//     it holds across the world is still on it, and still painted (test/sniper.test.mjs
//     proves where the line goes; this proves it reaches the screen).
//
// and the ordinary housekeeping: what it costs to draw (three strokes and one light, no
// blur and no gradient), that it is not drawn when there is nothing to say, and that the
// eye on the body is the same countdown the band is brightened by.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { aimProgress, beamHalfWidth, isLocking, makeEnemy } from '../src/game/kinds.js';
import { lockLight } from '../src/render/entities.js';
import { resetIndicators } from '../src/render/indicators.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 42 });
const field = game.world;
const ship = field.player;
const HALF = BALANCE.kinds.sniper.lock.beam.halfWidth;

// The title screen draws the menu crowd and no ship, so get a run going first.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/** Nothing but the ship on screen, and nothing arriving to spoil the count. */
function clearTheSky() {
  field.enemies.length = 0;
  field.beams.clear();
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.spawnTimer = Infinity;
  ship.invuln = Infinity;
  // The arrows at the window edge belong to whatever the last test planted and they
  // fade out over a second or so, which is a second or too long for a frame that is
  // being counted. A cost test counts one thing: the thing it just put on the glass.
  resetIndicators();
}

/** Put one sniper next to the ship, parked in one beat of its lock. */
function plant(x, y, stage) {
  const sniper = makeEnemy(field, 'sniper', x, y);
  sniper.rot = 0;
  sniper.dirX = 1;
  sniper.dirY = 0;
  sniper.stage = stage || '';
  // Mid-beat, so the telegraph has a real countdown to draw and the beat does not run
  // out while the frame is being counted.
  sniper.timer = stage === 'lock' ? BALANCE.kinds.sniper.lock.aim.time * 0.5 : 500;
  sniper.stageTime = BALANCE.kinds.sniper.lock.aim.time;
  field.enemies.push(sniper);
  return sniper;
}

/** Leave one beam in the air, already fired, with two thirds of its light left. */
function beamInAir() {
  const spec = BALANCE.kinds.sniper.lock.beam;
  const beam = field.beams.spawn();
  beam.x = ship.x;
  beam.y = ship.y - 100;
  beam.dirX = 1;
  beam.dirY = 0;
  beam.fore = 900;
  beam.back = 800;
  beam.width = spec.halfWidth;
  beam.weight = spec.damage;
  beam.life = spec.time * 0.66;
  beam.max = spec.time;
  beam.from = 'sniper';
  beam.paid = true;
  beam.spec = spec;
  return beam;
}

/** What one frame cost to draw, and how wide its widest stroke was. */
function frameCost() {
  const before = game.drawCalls();
  game.step();
  const after = game.drawCalls();
  const widths = game.strokeWidths();
  return {
    strokes: after.strokes - before.strokes,
    images: after.images - before.images,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
    widest: widths.length ? Math.max(...widths) : 0,
  };
}

test('a sniper holding a lock draws the band, and the band is as wide as the harm', () => {
  clearTheSky();
  plant(ship.x + 200, ship.y);
  const waiting = frameCost();

  clearTheSky();
  plant(ship.x + 200, ship.y, 'lock');
  const locking = frameCost();

  assert.equal(locking.strokes - waiting.strokes, 3,
    'the band is three passes and nothing else: the width of it, a hotter third, and the axis');
  assert.equal(locking.images - waiting.images, 1, 'and one light at the eye it is drawn from');
  assert.equal(locking.widest, HALF * 2,
    'drawn at exactly twice the distance off the axis at which a centre is hurt');
});

test('the beam is drawn as wide as the warning that promised it', () => {
  clearTheSky();
  const empty = frameCost();

  clearTheSky();
  beamInAir();
  const lit = frameCost();

  assert.equal(lit.strokes - empty.strokes, 3, 'the same three passes as the lock');
  assert.equal(lit.images - empty.images, 1, 'and the same light, left where the eye was');
  assert.equal(lit.widest, HALF * 2, 'and the same width, to the pixel');
});

test('the band is painted, not blurred', () => {
  clearTheSky();
  plant(ship.x + 200, ship.y, 'lock');
  beamInAir();
  const cost = frameCost();

  assert.equal(cost.gradients, 0, 'no gradient was built for it');
  assert.equal(cost.shadows, 0, 'and the canvas was never asked to blur anything');
});

test('a sniper off the glass is not drawn, but the line it holds is', () => {
  // The band reaches the whole arena, so it is on the screen whatever the eye is doing
  // to be - and a player who cannot see the sniper is still entitled to see what it is
  // about to fire down.
  clearTheSky();
  plant(ship.x + 1500, ship.y);
  const farBody = frameCost();

  clearTheSky();
  plant(ship.x + 1500, ship.y, 'lock');
  const farLock = frameCost();

  assert.equal(farLock.strokes - farBody.strokes, 3, 'the band, and no body with it');
  assert.equal(farLock.images - farBody.images, 1, 'and the light at the eye, off the glass');
  assert.equal(farLock.widest, HALF * 2);
});

test('the band gets louder as the lock runs out', () => {
  clearTheSky();
  const sniper = plant(ship.x + 200, ship.y, 'lock');
  sniper.timer = BALANCE.kinds.sniper.lock.aim.time * 0.9;
  const early = frameCost();

  sniper.timer = BALANCE.kinds.sniper.lock.aim.time * 0.1;
  const late = frameCost();

  assert.ok(aimProgress(sniper) > 0.8, 'and the countdown the drawing reads is nearly run');
  assert.ok(late.strokes >= early.strokes, 'the same strokes, brighter');
  assert.equal(late.strokes, early.strokes);
});

test('the eye on the body is the same countdown, not a second one', () => {
  clearTheSky();
  const sniper = plant(ship.x + 200, ship.y);
  const waiting = lockLight(sniper, 1);

  sniper.stage = 'lock';
  sniper.timer = BALANCE.kinds.sniper.lock.aim.time * 0.9;
  const justLocked = lockLight(sniper, 1);
  sniper.timer = 0;
  const aboutToFire = lockLight(sniper, 1);

  assert.ok(justLocked > waiting, 'a lock lights the eye more than the wait does');
  assert.ok(aboutToFire > justLocked, 'and it climbs all the way to the flash');
  assert.ok(aboutToFire <= 1, 'without ever blowing past full');
  assert.ok(isLocking(sniper), 'and it is the same beat the band is drawn from');
});

test('a waiting sniper draws a body and no band', () => {
  clearTheSky();
  const empty = frameCost();

  clearTheSky();
  plant(ship.x + 200, ship.y);
  const waiting = frameCost();

  assert.equal(waiting.strokes - empty.strokes, 1, 'its own outline, and that is all');
  assert.ok(waiting.images > empty.images, 'with its halo and its eye alight');
  assert.ok(waiting.widest < HALF, 'and no band anywhere near the width of one');
});
