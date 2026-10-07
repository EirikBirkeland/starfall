// The arena as a world of its own, bigger than the window (PLAN section 4), and
// the one rule that matters once it is: everything still has to arrive where the
// player can see it coming, and nothing may leave the world.
//
// These drive the scripted world, which sees no camera and no canvas: `world.view`
// is the window's size as the frame loop leaves it, and that is all the simulation
// is allowed to know about the screen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { spawnEnemy } from '../src/game/enemies.js';
import { resetAmbient } from '../src/game/ambient.js';
import { STATE } from '../src/game/state.js';
import { scriptedRun, stepTheWorld, flyFor } from '../tools/headless/scripted.js';

const ARENA = BALANCE.arena;
const DRAW = BALANCE.player.drawRadius;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** How far a point is from the nearest edge of the world. */
function fromEdge(enemy) {
  return Math.min(enemy.x - enemy.r, enemy.y - enemy.r,
    ARENA.w - enemy.r - enemy.x, ARENA.h - enemy.r - enemy.y);
}

/** Fill the crowd one at a time, and hand back everyone who arrived. */
function arrivals(field, count) {
  const came = [];
  for (let i = 0; i < count * 3 && came.length < count; i++) {
    field.enemies.length = 0;
    if (spawnEnemy(field)) came.push(field.enemies[0]);
  }
  return came;
}

test('the world is a good deal bigger than the window', () => {
  const field = scriptedRun(90);
  assert.ok(ARENA.w >= 2000 && ARENA.h >= 2000, 'PLAN section 4 asks for 3000 x 3000');
  assert.ok(ARENA.w >= field.view.w * 2, 'and at least twice the window across');
  assert.equal(field.view.w, ARENA.viewW, 'until a real resize lands, it assumes the balance default');
});

test('the ship can leave the window behind, and cannot leave the world', () => {
  const field = scriptedRun(91);
  flyFor(10, { moveX: 1, moveY: 0, moving: true });

  assert.equal(field.player.x, ARENA.w - DRAW, 'the world holds it by its drawn body');
  assert.ok(field.player.x > field.view.w,
    'it is a whole window and more away from where the run began: ' + field.player.x);

  flyFor(12, { moveX: -1, moveY: 0, moving: true });
  flyFor(6, { moveX: 0, moveY: -1, moving: true });
  assert.equal(field.player.x, DRAW);
  assert.equal(field.player.y, DRAW);
});

test('everything arrives off the edge of the window, inside the world, off the ship', () => {
  const field = scriptedRun(92);
  const ship = field.player;
  const came = arrivals(field, 300);
  assert.equal(came.length, 300, 'the spawn rule gave up too often');

  for (const enemy of came) {
    assert.ok(fromEdge(enemy) >= -1e-9, 'it arrived outside the world at ' + enemy.x + ',' + enemy.y);

    const inPlainSight = Math.abs(enemy.x - ship.x) <= field.view.w / 2
      && Math.abs(enemy.y - ship.y) <= field.view.h / 2;
    assert.ok(!inPlainSight, 'it arrived in plain sight at ' + enemy.x + ',' + enemy.y);

    assert.ok(distance(enemy, ship) > BALANCE.enemies.spawnMinDistance,
      'it arrived on top of the ship: ' + Math.round(distance(enemy, ship)) + ' px away');
  }
});

test('a ship in the corner of the world gets no easier arrival', () => {
  const field = scriptedRun(93);
  const ship = field.player;
  ship.x = DRAW + 4;
  ship.y = ARENA.h - DRAW - 4;

  const came = arrivals(field, 200);
  assert.equal(came.length, 200, 'there was nowhere to put them');

  for (const enemy of came) {
    assert.ok(fromEdge(enemy) >= -1e-9, 'it arrived outside the world');
    assert.ok(distance(enemy, ship) > BALANCE.enemies.spawnMinDistance,
      'it landed on the ship in the corner: ' + Math.round(distance(enemy, ship)) + ' px');
  }
});

test('when the whole world is on screen, they come from its edge', () => {
  const field = scriptedRun(94);
  field.view.w = 4000;
  field.view.h = 4000;
  const ship = field.player;

  const came = arrivals(field, 150);
  assert.equal(came.length, 150, 'an enormous window stopped the spawning altogether');

  for (const enemy of came) {
    assert.ok(fromEdge(enemy) >= -1e-9, 'it arrived outside the world');
    assert.ok(fromEdge(enemy) < 60, 'it did not come from the edge of the world: ' + fromEdge(enemy));
    assert.ok(distance(enemy, ship) > BALANCE.enemies.spawnMinDistance);
  }
});

test('the menu crowd keeps to the middle of the world, where the view is', () => {
  const field = scriptedRun(95);
  field.state = STATE.START;
  resetAmbient(field);

  assert.ok(field.ambient.length >= BALANCE.ambient.target, 'the menu has a crowd to drift');
  const margin = BALANCE.ambient.margin;
  for (const enemy of field.ambient) {
    assert.ok(Math.abs(enemy.x - ARENA.w / 2) <= field.view.w / 2 + margin + enemy.r,
      'a menu enemy wandered out of the view: ' + enemy.x);
    assert.ok(Math.abs(enemy.y - ARENA.h / 2) <= field.view.h / 2 + margin + enemy.r,
      'a menu enemy wandered out of the view: ' + enemy.y);
  }
});

test('the menu crowd wraps inside the view, not around the whole world', () => {
  const field = scriptedRun(96);
  field.state = STATE.START;
  resetAmbient(field);

  const wanderer = field.ambient[0];
  wanderer.vx = -200;
  wanderer.vy = 0;
  // A little past the left edge of where the crowd is allowed to wander.
  wanderer.x = ARENA.w / 2 - field.view.w / 2 - 2 * BALANCE.ambient.margin - wanderer.r - 1;

  stepTheWorld({});

  assert.ok(wanderer.x > ARENA.w / 2, 'it did not come back around: ' + wanderer.x);
  assert.ok(wanderer.x < ARENA.w / 2 + field.view.w,
    'it came back on the far side of the world instead of the window: ' + wanderer.x);
  assert.equal(wanderer.px, wanderer.x, 'and the jump is not slid across the screen');
});
