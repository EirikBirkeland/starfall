// What the particle system costs to paint, and that it is painted at all.
//
// A frame is measured twice: once on a clean sky with the ship alone on it, then
// again with a known number of chunks, sparks and puffs alive. The difference is
// the particles and nothing else, so it can be counted exactly - which is the house
// way of proving a draw path is real rather than merely reachable (see
// test/walls.test.mjs and test/draw-cost.test.mjs).
//
// What that difference is allowed to contain: one fill per chunk and per spark, one
// sprite stamp per puff, and no stroke, no blur, and no gradient anywhere. The wake
// is one baked sprite stamped at different sizes, so a whole trail may never bake
// more than that one.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { DEBRIS, SMOKE, SPARK, burst, engineTrail, wreck } from '../src/game/effects.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 31 });
const field = game.world;
const ship = field.player;

const countShape = (shape) => field.particles.items.filter((p) => p.shape === shape).length;

/** The ship alone in a clean sky, engines off, with nothing on its way in. */
function clearTheSky() {
  field.enemies.length = 0;
  field.bullets.clear();
  field.shards.clear();
  field.rings.clear();
  field.texts.clear();
  field.particles.clear();
  field.spawnTimer = Infinity;
  ship.invuln = Infinity;
  ship.thrust = 0;
  ship.dashLeft = 0;
  ship.x = field.arena.w / 2;            // middle of the world, so nothing is off screen
  ship.y = field.arena.h / 2;
  ship.px = ship.x;
  ship.py = ship.y;
}

/** A whole second's worth of spray and wake, all of it alive and at the ship. */
function loadTheSky() {
  wreck(field, ship.x, ship.y, BALANCE.kinds.tank.color, 9, 200, 30);
  burst(field, ship.x, ship.y, BALANCE.kinds.tank.color, 5, 200, 30);
  ship.thrust = 1;                      // long enough for the wake to fill in at once
  engineTrail(field, ship, 1);
  ship.thrust = 0;                      // and now the engines are off, as during a frame
}

/** One frame's worth of drawing calls. */
function frameCost() {
  const before = game.drawCalls();
  const bakes = game.bakeCalls();
  game.step();
  const after = game.drawCalls();
  const bakedAfter = game.bakeCalls();
  return {
    fills: after.fills - before.fills,
    strokes: after.strokes - before.strokes,
    images: after.images - before.images,
    shadows: after.shadows - before.shadows,
    gradients: after.gradients - before.gradients,
    canvases: bakedAfter.canvases - bakes.canvases,
  };
}

/** What one frame costs, alongside how many of each shape it is about to paint. */
function paintedFrame() {
  const live = {
    chips: countShape(DEBRIS),
    sparks: countShape(SPARK),
    puffs: countShape(SMOKE),
  };
  return Object.assign(live, frameCost());
}

function launch() {
  game.pressMouse(640, 360);
  game.step();
  game.releaseMouse();
}

/**
 * One frame with the sky loaded, next to the same frame with it empty. The bare
 * frame is measured too because a frame is never empty - the ship, its hull pips
 * and the bar at the bottom of the screen are stroking away whatever is flying -
 * and it is the difference between the two that belongs to the particles.
 */
function measuredFrames() {
  clearTheSky();
  frameCost();                       // whatever a launch shows first, it bakes here
  const bare = frameCost();
  loadTheSky();
  const first = paintedFrame();      // and the wake's sprite gets baked on this one
  return { bare, first, withParticles: paintedFrame() };
}

test('the particles are painted, and cost exactly what they are', () => {
  launch();
  const { bare, first, withParticles: settled } = measuredFrames();
  assert.ok(bare.fills > 10, 'a bare frame still paints the ship and the HUD: ' + bare.fills);
  assert.equal(first.chips, 9, 'the wreck left ' + first.chips + ' chunks');
  assert.equal(first.sparks, 5, 'and ' + first.sparks + ' sparks');
  assert.equal(first.puffs, BALANCE.player.exhaust.rate, 'the wake filled in: ' + first.puffs);
  assert.ok(first.canvases <= 1, 'the wake baked ' + first.canvases + ' sprites, and one is plenty');

  assert.ok(settled.chips > 0 && settled.puffs > 0, 'the spray is still alight to be drawn');
  assert.equal(settled.fills - bare.fills, settled.chips + settled.sparks,
    'a chunk and a spark are one fill each, and ' + (settled.fills - bare.fills) + ' were painted');
  assert.equal(settled.images - bare.images, settled.puffs,
    'a puff is one sprite stamp, and ' + (settled.images - bare.images) + ' were stamped');
  assert.equal(settled.canvases, 0, 'a second frame of the same particles bakes nothing');
});

test('a frame of particles asks the canvas for nothing slow', () => {
  const { bare, withParticles: frame } = measuredFrames();
  assert.ok(frame.chips + frame.puffs > 0, 'there had better still be something alive');
  assert.equal(frame.strokes, bare.strokes, 'nothing about a particle is stroked');
  assert.equal(frame.shadows, 0, 'nothing asked the canvas for a blur');
  assert.equal(frame.gradients, 0, 'and nothing built a gradient this frame');
  game.stop();
});
