// The darter's telegraph, and its blur, as drawn (PLAN 3.3: "telegraph with a thin
// warning line").
//
// There is no browser here, so this cannot say what the line looks like. What it can
// say is what it costs - two strokes and two lights, no blur and no gradient - and
// when it is not there at all: an aiming darter draws a line, any other beat of the
// hunt draws none, and a darter off the window draws nothing whatever. Where the
// line goes and how long it is is the simulation's promise, and test/darter.test.mjs
// measures that from the state it is drawn out of.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 42 });
const field = game.world;
const ship = field.player;

// The title screen draws the menu crowd and no ship, so get a run going first.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/** Nothing but the ship on screen, and nothing arriving to spoil the count. */
function clearTheSky() {
  field.enemies.length = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.spawnTimer = Infinity;
  ship.invuln = Infinity;
}

/** Put one darter next to the ship, parked in one beat of its hunt. */
function plant(stage, x, y) {
  const darter = makeEnemy(field, 'darter', x, y);
  darter.rot = 0;
  darter.dirX = 1;
  darter.dirY = 0;
  darter.stage = stage;
  // Mid-beat, so the telegraph has a real countdown to draw and the beat does not
  // run out while the frame is being counted.
  darter.timer = stage === 'aim' ? BALANCE.kinds.darter.hunt.aim.time * 0.5 : 5;
  field.enemies.push(darter);
  return darter;
}

/** What one frame cost to draw. */
function frameCost() {
  const before = game.drawCalls();
  game.step();
  const after = game.drawCalls();
  return {
    strokes: after.strokes - before.strokes,
    images: after.images - before.images,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
  };
}

test('a darter taking aim draws its warning line', () => {
  clearTheSky();
  game.step();
  const plain = frameCost();

  clearTheSky();
  plant('', ship.x + 120, ship.y);
  const walking = frameCost();
  assert.equal(walking.strokes, plain.strokes + 1, 'an enemy is its own outline');

  clearTheSky();
  plant('aim', ship.x + 120, ship.y);
  const aiming = frameCost();

  assert.equal(aiming.strokes - walking.strokes, 2,
    'the line is a soft pass and a thin one, and nothing else: ' + aiming.strokes + ' vs ' + walking.strokes);
  assert.equal(aiming.images - walking.images, 2,
    'and two lights, the head of the line and the charge building at its nose');
});

test('the warning line is painted, not blurred', () => {
  clearTheSky();
  plant('aim', ship.x + 120, ship.y);
  const cost = frameCost();

  assert.equal(cost.gradients, 0, 'no gradient was built for it');
  assert.equal(cost.shadows, 0, 'and the canvas was never asked to blur anything');
});

test('a lunging darter drags a blur and draws no line', () => {
  clearTheSky();
  plant('', ship.x + 120, ship.y);
  const walking = frameCost();

  clearTheSky();
  plant('lunge', ship.x + 120, ship.y);
  const lunging = frameCost();

  assert.equal(lunging.strokes, walking.strokes, 'the lunge adds no strokes');
  assert.ok(lunging.images > walking.images,
    'and one blur at least: ' + lunging.images + ' against ' + walking.images);
});

test('a darter off the window draws nothing at all', () => {
  clearTheSky();
  game.step();
  const empty = frameCost();

  // The view is a little over a thousand pixels across, and the camera sits on the
  // ship, so a darter this far out is not on the glass and its line is not either.
  clearTheSky();
  plant('aim', ship.x + 1500, ship.y);
  const offscreen = frameCost();

  assert.equal(offscreen.strokes, empty.strokes, 'no line, no outline');
  assert.equal(offscreen.images, empty.images, 'and no light for it either');
});

test('only the aim draws a line: the rest of the beats keep it to themselves', () => {
  clearTheSky();
  plant('rest', ship.x + 120, ship.y);
  const resting = frameCost();

  clearTheSky();
  plant('', ship.x + 120, ship.y);
  const walking = frameCost();

  assert.equal(resting.strokes, walking.strokes, 'a darter that is not aiming promises nothing');
  assert.equal(resting.images, walking.images);
});
