// The camera: where the window looks, and what the controls mean once the arena is
// bigger than the window (PLAN section 4).
//
// A booted game, because the camera is drawn rather than simulated - but it is the
// controls that make it matter, and those only come through a real frame.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { camera } from '../src/render/camera.js';
import { BALANCE } from '../src/game/balance.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 21 });
const ship = game.world.player;

/** The window the harness boots with, which the tests below measure against. */
const WINDOW = { w: 1280, h: 720 };

function launch() {
  game.pressMouse(WINDOW.w / 2, WINDOW.h / 2);
  game.step();
}

/**
 * Stand the ship somewhere and leave it holding still, with nothing else in the
 * world to look at: the camera then has exactly one thing to follow.
 */
function parkAt(x, y) {
  ship.x = x;
  ship.y = y;
  ship.px = x;
  ship.py = y;
  ship.vx = 0;
  ship.vy = 0;
  game.releaseMouse();          // the launch held the trigger; nothing is firing now
  game.world.enemies.length = 0;
  game.world.spawnTimer = Infinity;
  game.world.player.invuln = Infinity;
  for (let i = 0; i < 5; i++) game.step();
}

const centred = () => ({ x: game.world.arena.w / 2, y: game.world.arena.h / 2 });

test('the window opens on the middle of the arena, where the ship is', () => {
  for (let i = 0; i < 30; i++) game.step();
  assert.equal(game.stats().state, game.STATE.START);

  const middle = centred();
  assert.equal(game.world.arena.w, BALANCE.arena.w, 'the arena is its own size, not the window');
  assert.equal(ship.x, middle.x, 'and a run starts in the middle of it');
  assert.ok(Math.abs(camera.cx - middle.x) < 1e-9 && Math.abs(camera.cy - middle.y) < 1e-9,
    'the view is looking at the same place');
  assert.equal(game.screenOf(middle.x, middle.y).x, WINDOW.w / 2);
  assert.equal(game.screenOf(middle.x, middle.y).y, WINDOW.h / 2);
});

test('the window follows the ship', () => {
  launch();
  game.key('KeyD', true);
  for (let i = 0; i < 120; i++) game.step();

  assert.ok(game.stats().state === game.STATE.PLAY);
  assert.ok(ship.x > centred().x + 200, 'the ship flew right, got ' + ship.x);
  // One for one: the ship stays put on the glass, which is what makes a fast game
  // readable. The only slack is the lean towards the cursor, tested below.
  assert.ok(Math.abs(camera.cx - ship.x) < 160, 'the view did not keep up: ' + camera.cx + ' vs ' + ship.x);
  const onScreen = game.screenOf(ship.x, ship.y);
  assert.ok(onScreen.x > WINDOW.w / 3 && onScreen.x < WINDOW.w * 2 / 3,
    'the ship drifted to ' + onScreen.x + ' across the window');
  game.key('KeyD', false);
});

test('the view never shows more arena than there is', () => {
  const arena = game.world.arena;
  parkAt(BALANCE.player.drawRadius, BALANCE.player.drawRadius);
  assert.equal(camera.x, 0, 'the top-left corner of the arena is the top-left of the window');
  assert.equal(camera.y, 0);
  assert.equal(game.screenOf(ship.x, ship.y).x, BALANCE.player.drawRadius,
    'so the ship sits in the corner of the screen, as it does in the world');

  parkAt(arena.w - BALANCE.player.drawRadius, arena.h - BALANCE.player.drawRadius);
  assert.equal(camera.x + camera.w, arena.w, 'the far corner stops the view too');
  assert.equal(camera.y + camera.h, arena.h);

  // And never a gap on either side, anywhere in between.
  for (const at of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    parkAt(arena.w * at, arena.h * at);
    assert.ok(camera.x >= 0 && camera.y >= 0, 'the view hung off the top-left at ' + at);
    assert.ok(camera.x + camera.w <= arena.w && camera.y + camera.h <= arena.h,
      'the view hung off the bottom-right at ' + at);
  }
});

test('the view leans towards what the ship is aiming at, and only so far', () => {
  const arena = game.world.arena;
  parkAt(arena.w / 2, arena.h / 2);
  const still = camera.cx;

  // The cursor parked way out to the right of the window, held there.
  game.moveMouse(WINDOW.w - 4, WINDOW.h / 2);
  for (let i = 0; i < 120; i++) game.step();

  const leaned = camera.cx - ship.x;
  assert.ok(leaned > 60, 'the view never leaned towards the cursor: ' + leaned);
  assert.ok(leaned < 200, 'and it leaned far too much, taking the ship off screen with it: ' + leaned);
  assert.notEqual(still, camera.cx);

  // Let go of the cursor and the lean eases back rather than snapping.
  game.moveMouse(WINDOW.w / 2, WINDOW.h / 2);
  const before = camera.cx - ship.x;
  game.step();
  const eased = camera.cx - ship.x;
  assert.ok(eased < before, 'the lean did not ease back: ' + before + ' then ' + eased);
  assert.ok(eased > before * 0.2, 'it snapped back instead of easing: ' + eased);
});

test('the cursor points at the arena, not at the glass', () => {
  const arena = game.world.arena;
  parkAt(arena.w / 2, arena.h / 2);
  game.moveMouse(880, 300);

  // A settled frame: the ship is not moving, so the camera is where it will stay.
  for (let i = 0; i < 200; i++) game.step();

  const under = { x: camera.x + 880, y: camera.y + 300 };
  const want = Math.atan2(under.y - ship.y, under.x - ship.x);
  const angle = ship.angle;
  assert.ok(Math.abs(angle - want) < 1e-4,
    'the ship points at ' + angle + ' and the cursor is over ' + want);

  // What it would have pointed at had the pixels been taken for arena coordinates:
  // a different direction entirely, now that the two are not the same thing.
  const naive = Math.atan2(300 - ship.y, 880 - ship.x);
  assert.ok(Math.abs(angle - naive) > 0.5, 'the aim came straight off the glass after all');
});

test('screen and arena turn into one another exactly', () => {
  for (const point of [[0, 0], [640, 360], [1279, 719], [-40, 900]]) {
    const there = game.screenOf(camera.x + point[0], camera.y + point[1]);
    assert.ok(Math.abs(there.x - point[0]) < 1e-9, 'x did not round-trip: ' + there.x);
    assert.ok(Math.abs(there.y - point[1]) < 1e-9, 'y did not round-trip: ' + there.y);
  }
});

test('a window bigger than the arena puts the world in the middle of it', () => {
  // An enormous display, and a world that no longer grows to fill it.
  game.setViewport(3600, 3200);
  game.step();

  assert.equal(game.world.view.w, 3600, 'the simulation heard how big the window is');
  assert.equal(game.world.arena.w, BALANCE.arena.w, 'and not one pixel more world');
  assert.equal(camera.cx, game.world.arena.w / 2, 'the arena floats in the middle of the black');
  assert.equal(camera.x, (game.world.arena.w - 3600) / 2);
  game.stop();
});
