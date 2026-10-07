// The controls (PLAN section 6) through the real keyboard and mouse modules:
// Space and the right button dash, the left button fires, and a press is spent
// exactly once however the frames happen to fall.
//
// Where a test needs the dash ready again it winds the ship back by hand (see
// ready() below); what a dash does once it has begun belongs to test/dash.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 41 });
const ship = game.world.player;
const STEP = BALANCE.sim.step;

const FRAME = 1 / 60;                    // what one game.step() advances the clock by, in seconds
const dashed = () => ship.dashCd > 0;
/**
 * Wind the ship back to "the dash is ready". These tests are about the presses;
 * what a dash does once it has begun is test/dash.test.mjs, so a dash still
 * underway is stopped as well as its wait wound up.
 */
function ready() { ship.dashCd = 0; ship.dashLeft = 0; }
/** One frame's worth of a tap: down and up, the way a finger does it. */
function tapSpace() { game.key('Space', true); game.key('Space', false); }

test('the press that launches a run is not also a dash', () => {
  for (let i = 0; i < 30; i++) game.step();
  assert.equal(game.stats().state, game.STATE.START);

  tapSpace();
  assert.equal(game.stats().state, game.STATE.PLAY, 'Space launched the run');

  game.world.spawnTimer = Infinity;        // these tests are about the controls,
  ship.invuln = Infinity;                  // not about dying to the first chaser
  for (let i = 0; i < 20; i++) game.step();
  assert.equal(ship.dashCd, 0, 'the launch spent the dash');
  assert.equal(ship.dashLeft, 0, 'and it did not move the ship out from under itself');
});

test('Space dashes', () => {
  tapSpace();
  game.step();
  assert.ok(dashed(), 'Space did not dash');
  assert.ok(ship.dashLeft > 0, 'and the dash was not underway');
});

test('the wait lasts the 2.5 s the plan asks for, and a press spent in it buys nothing', () => {
  ready();
  const startedAt = game.stats().steps;

  game.key('Space', true);                 // one press, then held: one request, not a stream
  let starts = 0;
  let wasDashing = false;
  let frames = 0;
  // do/while: the frame that answers the press is the first one, and it is the
  // frame that sets the wait, which a plain while would step straight over.
  do {
    game.step();
    frames++;
    const dashing = ship.dashLeft > 0;
    if (dashing && !wasDashing) starts++;
    wasDashing = dashing;
  } while (ship.dashCd > 0 && frames < 1000);
  game.key('Space', false);

  assert.ok(frames < 1000, 'the wait never ended, not in 1000 frames');
  assert.equal(ship.dashCd, 0, 'the wait did not come down to zero');
  assert.equal(starts, 1, 'the one press bought ' + starts + ' dashes');
  const waited = (game.stats().steps - startedAt) * STEP;
  assert.ok(Math.abs(waited - BALANCE.player.dash.cooldown) < 4 * STEP,
    'the wait lasted ' + waited.toFixed(3) + 's, the plan says ' + BALANCE.player.dash.cooldown);
});

test('mashing Space is one dash per press, with nothing queued up behind it', () => {
  ready();

  // A player who hammers the key gets one dash, then the wait, then the next dash
  // they ask for. The request is spent on the frame it lands, whether it was
  // answered or not, so nothing goes off by itself when the cooldown runs out.
  let starts = 0;
  let wasDashing = false;
  const mashFrames = Math.round((BALANCE.player.dash.cooldown - 0.3) / FRAME);
  for (let i = 0; i < mashFrames; i++) {
    tapSpace();
    game.step();
    const dashing = ship.dashLeft > 0;
    if (dashing && !wasDashing) starts++;
    wasDashing = dashing;
  }

  assert.equal(starts, 1, 'mashing began more than the one dash it asked for');
  assert.ok(ship.dashCd > 0, 'and the wait was over before it had been paid');

  let guard = 0;
  while (ship.dashCd > 0 && guard++ < 1000) game.step();
  for (let i = 0; i < 30; i++) game.step();     // nobody is pressing now
  assert.equal(ship.dashLeft, 0, 'a mashed press went off when the wait ended');

  tapSpace();
  game.step();
  assert.ok(ship.dashLeft > 0, 'a press once the wait was over did nothing');
});

test('a key held down does not dash again on its own auto-repeat', () => {
  ready();
  game.fire('keydown', { code: 'Space', repeat: true, preventDefault() {} });
  game.step();
  assert.equal(ship.dashCd, 0, 'an auto-repeat press dashed');

  game.fire('keydown', { code: 'Space', preventDefault() {} });
  game.step();
  assert.ok(dashed(), 'and a real press did not dash either');
  game.key('Space', false);
});

test('the right button dashes, and does not fire', () => {
  ready();
  game.pressMouse(600, 300, 2);
  game.step();
  assert.ok(dashed(), 'the right button did not dash');
  assert.equal(game.stats().bullets, 0, 'the right button also pulled the trigger');
  game.releaseMouse(2);
});

test('the left button fires, and does not dash', () => {
  ready();
  game.moveMouse(700, 300);
  game.pressMouse(700, 300);
  game.step();
  assert.ok(game.stats().bullets > 0, 'the left button did not fire');
  assert.equal(ship.dashCd, 0, 'and it dashed as well');
  game.releaseMouse(0);
});

test('a press on a frame that simulated nothing is kept for the next one', () => {
  ready();

  // On a very quick display a frame can arrive with no simulation step in it. A
  // dash that lands on one of those has to survive to the next frame, or the
  // player pressed the key and the game shrugged.
  let found = 0;
  for (let i = 0; i < 200; i++) {
    const before = game.stats().steps;
    game.step(3);
    if (game.stats().steps === before) {
      tapSpace();
      found++;
      break;
    }
  }
  assert.ok(found, 'no stepless frame turned up at 333 fps');
  assert.equal(ship.dashLeft, 0, 'the press was spent before any step saw it');

  let waited = 0;
  while (!dashed() && waited < 20) { game.step(3); waited++; }
  assert.ok(dashed(), 'the dash never arrived');
});

test('losing focus drops a dash that was on its way', () => {
  ready();
  game.key('Space', true);        // pressed, and then the tab goes away before a step
  game.fire('blur', {});
  for (let i = 0; i < 4; i++) game.step();
  assert.equal(ship.dashCd, 0, 'the dash arrived after all');
  game.key('Space', false);
});

// And what the dash does to the screen. The canvas stub counts every fill and
// stroke and remembers where the frame moved the drawing, so "it is drawn" is
// something a test here can actually check - see tools/headless/harness.js.

/** Nothing but the ship on screen: a difference in the drawing is a difference in the ship. */
function clearTheSky() {
  game.world.enemies.length = 0;
  game.world.particles.clear();
  game.world.rings.clear();
  game.world.texts.clear();
  game.world.bullets.clear();
  game.world.shards.clear();
}

/** How many strokes one frame costs. */
function strokesOfAFrame() {
  const before = game.drawCalls().strokes;
  game.step();
  return game.drawCalls().strokes - before;
}

test('the cooldown ring says how much of the wait is left', () => {
  clearTheSky();
  const readyRing = strokesOfAFrame();

  clearTheSky();
  ship.dashCd = BALANCE.player.dash.cooldown;     // the ring's job is the wait; the wait is dash.test's
  const waiting = strokesOfAFrame();

  assert.equal(waiting, readyRing + 1,
    'a ship with a wait to show drew ' + waiting + ' strokes, a ready one drew ' + readyRing);
});

test('the dash drags afterimages behind the hull', () => {
  clearTheSky();
  game.step();
  const calm = game.translates().length;

  ready();
  clearTheSky();
  tapSpace();
  game.step();
  assert.equal(game.translates().length, calm + 2,
    'the dash painted ' + (game.translates().length - calm) + ' extra things where the ship has been');
});
