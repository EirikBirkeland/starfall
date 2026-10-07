// The simulation's half of the interpolated rendering: everything that moves
// keeps the place it came from in px/py, so a frame can be drawn between the step
// just taken and the next one. If a mover is added to the game and forgets this,
// these tests are where it turns up - render/interp.js is the other half.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { resetRun } from '../src/game/run.js';
import { resetAmbient } from '../src/game/ambient.js';
import { burst } from '../src/game/effects.js';
import { dropShards } from '../src/game/pickups.js';
import { fire } from '../src/game/player.js';
import { PALETTE } from '../src/core/palette.js';
import {
  scriptedRun, enemyAt, bulletFlyingToward, stepTheWorld,
} from '../tools/headless/scripted.js';

/** Every kind of mover the world can hold, with whatever is alive of it. */
function eachMover(field, run) {
  const groups = [
    ['the ship', [field.player]],
    ['a bullet', field.bullets.items],
    ['an enemy', field.enemies],
    ['a shard', field.shards.items],
    ['a spark', field.particles.items],
  ];
  for (const [what, list] of groups) {
    assert.ok(list.length > 0, 'this test never made ' + what);
    for (const thing of list) run(thing, what);
  }
}

test('a fresh run starts with nothing in between the steps', () => {
  const field = scriptedRun(41);
  assert.equal(field.player.px, field.player.x);
  assert.equal(field.player.py, field.player.y);
});

test('everything that moves keeps the place it came from', () => {
  const field = scriptedRun(42);
  field.player.vx = 200;                // the ship is coasting; the scripted step gives no input
  field.player.vy = -150;
  fire(field);
  const foe = enemyAt('drifter', 480, 200);
  foe.speed = 90;                       // a drifter on its way to the ship
  dropShards(field, 400, 300, 3);
  burst(field, 300, 300, PALETTE.spark, 6, 140, 0.5);

  // Whatever was made during this step starts out where it was put.
  eachMover(field, (thing, what) => {
    assert.equal(thing.px, thing.x, what + ' appeared without a previous position');
    assert.equal(thing.py, thing.y, what + ' appeared without a previous position');
  });

  stepTheWorld();

  eachMover(field, (thing, what) => {
    assert.ok(Number.isFinite(thing.px) && Number.isFinite(thing.py), what + ' has a broken previous position');
    assert.notEqual(thing.px, thing.x, what + ' moved without remembering where from');
    assert.notEqual(thing.py, thing.y, what + ' moved without remembering where from');
  });
});

test('a spark made by a hit has no past of its own', () => {
  const field = scriptedRun(43);
  bulletFlyingToward(480, 214, 0, -600);
  const target = enemyAt('drifter', 480, 200, 1);

  stepTheWorld();

  assert.equal(target.hp, 0, 'the shot landed');
  for (const spark of field.particles.items) {
    assert.equal(spark.px, spark.x, 'a spark born this step is drawn where it was born');
    assert.equal(spark.py, spark.y);
  }
});

test('the crowd remembers where the step began, not where the shoving left it', () => {
  // The separation pass walks the crowd by pairs and moves both of each pair, so
  // the whole crowd has to be told where the step started before any of it moves.
  // A pile of three is where that shows up.
  const field = scriptedRun(44);
  const pile = [
    enemyAt('drifter', 480, 200), enemyAt('drifter', 484, 204), enemyAt('drifter', 478, 205),
  ];
  const where = pile.map((enemy) => ({ x: enemy.x, y: enemy.y }));

  stepTheWorld();

  pile.forEach((enemy, i) => {
    assert.equal(enemy.px, where[i].x, 'enemy ' + i + ' was remembered from after somebody else was pushed');
    assert.equal(enemy.py, where[i].y, 'enemy ' + i + ' was remembered from after somebody else was pushed');
    assert.notEqual(enemy.x, where[i].x, 'and the pile did spread out');
  });
});

test('a menu enemy that wraps does not slide across the screen', () => {
  const field = scriptedRun(45);
  resetRun(field);
  field.state = STATE.START;
  resetAmbient(field);

  const wanderer = field.ambient[0];
  wanderer.vx = -100;                       // walking off the left edge
  wanderer.x = -(wanderer.r + BALANCE.ambient.margin) - 1;

  stepTheWorld();

  assert.ok(wanderer.x > field.arena.w / 2, 'it came back around the right edge');
  assert.equal(wanderer.px, wanderer.x, 'it is drawn there, not mid-slide across the arena');
});
