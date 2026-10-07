// The enemy's shots and a spitter's wind-up, as drawn.
//
// The rule these hold the renderer to is the one PLAN section 4 cares about: a shot
// that can hurt you is warm, it is bigger than its hitbox's worth of light and no
// bigger, and it is never hidden behind the thing that fired it. What they can say
// without a browser is what each of them costs - a halo and a core, no stroke, no
// blur, no gradient - and that something off the window costs nothing at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { enemyShotAt } from '../src/game/enemyshots.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 43 });
const field = game.world;
const ship = field.player;
const SPIT = BALANCE.kinds.spitter.spit;

// A run has to be in progress for the arena to be drawn at all.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/** Nothing on the arena but what a test puts there, and nothing arriving. */
function clearTheSky() {
  field.enemies.length = 0;
  field.enemyShots.clear();
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.spawnTimer = Infinity;
  ship.invuln = Infinity;
}

/** What one frame cost to draw. */
function frameCost() {
  const before = game.drawCalls();
  game.step();
  const after = game.drawCalls();
  return {
    fills: after.fills - before.fills,
    strokes: after.strokes - before.strokes,
    images: after.images - before.images,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
  };
}

/** One spitter, parked in one beat, `progress` of the way through that beat. */
function plantSpitter(stage, progress) {
  const spitter = makeEnemy(field, 'spitter', ship.x + 260, ship.y);
  spitter.stage = stage;
  spitter.stageTime = SPIT.wind.time;
  spitter.timer = stage === 'spit'
    ? SPIT.wind.time * (1 - (progress === undefined ? 0.5 : progress))
    : 5;
  spitter.dirX = -1;
  spitter.dirY = 0;
  field.enemies.push(spitter);
  return spitter;
}

test('an enemy shot is a halo and a hot core, and nothing else', () => {
  clearTheSky();
  game.step();
  const empty = frameCost();

  clearTheSky();
  enemyShotAt(field, ship.x - 200, ship.y - 200, 1, 0, SPIT.shot);
  const withOne = frameCost();

  assert.equal(withOne.images - empty.images, 1, 'one light for the shot');
  assert.equal(withOne.fills - empty.fills, 1, 'and one fill for its core');
  assert.equal(withOne.strokes - empty.strokes, 0, 'no stroke anywhere');
  assert.equal(withOne.gradients, 0, 'no gradient built for it');
  assert.equal(withOne.shadows, 0, 'and the canvas was never asked to blur it');
});

test('a shot off the window is not drawn at all', () => {
  clearTheSky();
  game.step();
  const empty = frameCost();

  clearTheSky();
  enemyShotAt(field, ship.x + 1500, ship.y, -1, 0, SPIT.shot);
  const offscreen = frameCost();

  assert.equal(offscreen.images, empty.images, 'no light for a shot nobody can see');
  assert.equal(offscreen.fills, empty.fills, 'and no core either');
});

test('the mouth light is the only thing a wind-up costs to draw', () => {
  clearTheSky();
  plantSpitter('');
  const holding = frameCost();

  clearTheSky();
  plantSpitter('spit');
  const winding = frameCost();

  assert.equal(winding.images - holding.images, 1,
    'one light for the mouth, and that is the whole warning: '
    + winding.images + ' against ' + holding.images);
  assert.equal(winding.strokes, holding.strokes, 'no strokes for it');
});

test('every shot on screen costs what one shot costs, times that', () => {
  clearTheSky();
  game.step();
  const empty = frameCost();

  clearTheSky();
  for (let i = 0; i < 5; i++) {
    enemyShotAt(field, ship.x - 300 + i * 60, ship.y - 150, 1, 0, SPIT.shot);
  }
  const five = frameCost();

  assert.equal(five.images - empty.images, 5, 'five lights');
  assert.equal(five.fills - empty.fills, 5, 'five cores');
  assert.equal(five.strokes - empty.strokes, 0, 'and still no strokes at all');
});
