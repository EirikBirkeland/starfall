// The energy wall at the edge of the arena (PLAN section 4), checked by counting
// what a frame strokes.
//
// A wall is drawn as one line stroked three times - wide and faint, medium, thin
// and bright - and one more pass for the row of ticks along it: four strokes per
// visible edge. Nothing else about a frame changes between one ship position and
// the next, so the difference between two frames *is* the wall, and it says which
// edges of the world the window was near enough to see.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 61 });
const ship = game.world.player;
const ARENA = game.world.arena;
const MIDDLE = { x: ARENA.w / 2, y: ARENA.h / 2 };
const STROKES_PER_EDGE = 4;

function launch() {
  game.pressMouse(640, 360);
  game.step();
  game.releaseMouse();
}

/** Nothing in the world but the ship, and no spawn clock to put anything back. */
function clearTheSky() {
  game.world.enemies.length = 0;
  game.world.bullets.clear();
  game.world.shards.clear();
  game.world.particles.clear();
  game.world.rings.clear();
  game.world.texts.clear();
  game.world.spawnTimer = Infinity;
  game.world.player.invuln = Infinity;
}

/** Stand the ship somewhere, let the view arrive, and hold the cursor dead centre. */
function parkAt(x, y) {
  game.moveMouse(640, 360);
  ship.x = x;
  ship.y = y;
  ship.px = x;
  ship.py = y;
  ship.vx = 0;
  ship.vy = 0;
  for (let i = 0; i < 60; i++) game.step();
}

/** How many strokes one frame costs at wherever the ship is standing now. */
function strokesOfAFrame() {
  clearTheSky();
  const before = game.drawCalls().strokes;
  game.step();
  return game.drawCalls().strokes - before;
}

/** What a frame costs out in the open, where no edge of the world is in sight. */
function openSky() {
  parkAt(MIDDLE.x, MIDDLE.y);
  return strokesOfAFrame();
}

/** How many strokes the wall is costing where the ship is standing. */
function wallStrokes() {
  return strokesOfAFrame() - openSky();
}

test('a frame is worth the same twice, so the differences below mean something', () => {
  launch();
  parkAt(MIDDLE.x, MIDDLE.y);
  const cost = strokesOfAFrame();
  assert.ok(cost > 4, 'a frame paints the ship, its hull pips and the bar: ' + cost);
  assert.equal(strokesOfAFrame(), strokesOfAFrame());
  assert.equal(wallStrokes(), 0, 'out in the middle of the world there is no wall to draw');
});

test('one edge of the world, once you reach it', () => {
  parkAt(BALANCE.player.drawRadius, MIDDLE.y);
  const atTheWall = wallStrokes();
  assert.equal(atTheWall, STROKES_PER_EDGE,
    'the left wall painted ' + atTheWall + ' strokes, not one edge worth');

  parkAt(ARENA.w - BALANCE.player.drawRadius, MIDDLE.y);
  assert.equal(wallStrokes(), STROKES_PER_EDGE, 'and the same on the far side');
});

test('a corner of the world shows two edges', () => {
  parkAt(BALANCE.player.drawRadius, BALANCE.player.drawRadius);
  const inTheCorner = wallStrokes();
  assert.equal(inTheCorner, STROKES_PER_EDGE * 2,
    'the corner painted ' + inTheCorner + ' strokes, not two edges worth');

  parkAt(ARENA.w - BALANCE.player.drawRadius, ARENA.h - BALANCE.player.drawRadius);
  assert.equal(wallStrokes(), STROKES_PER_EDGE * 2, 'and the same in the far corner');
});

test('a wall the window cannot reach is not drawn at all', () => {
  // A screen and a half from the edge: the world is still not in sight, and
  // stroking where the black starts would be painting nothing.
  parkAt(BALANCE.player.drawRadius + game.world.view.w, MIDDLE.y);
  assert.equal(wallStrokes(), 0, 'a wall out of sight cost strokes');
  game.stop();
});
