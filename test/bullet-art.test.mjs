// A shot's trail, as drawn (render/entities.js), and the two things it has to be honest
// about now that the game has more than one kind of shot in it (game/weapons.js):
//
//   a slower shot has dragged less air behind it, so its streak is shorter - a scatter
//     pellet may not be painted with a pulse shot's trail, or the picture promises a
//     speed the simulation does not have;
//   and a shot that is about to run out visibly runs out, which is the only way a short
//     range can be seen rather than remembered.
//
// Same trick as the other art tests: boot the real game through the stub, put exactly one
// shot in an otherwise empty sky, and compare what the frame asked the canvas to stamp.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { setWeapon } from '../src/game/weapons.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 5, dpr: 1 });
const field = game.world;
const ship = field.player;
const PULSE = BALANCE.weapons.pulse;
const SCATTER = BALANCE.weapons.scatter;

game.pressMouse(640, 360);        // launch: a title screen draws no ship
game.step();
game.releaseMouse();
game.step();
ship.invuln = Infinity;
field.spawnTimer = Infinity;

/** Nothing on the arena but the one shot this test is about. */
function emptySky() {
  field.enemies.length = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.enemyShots.clear();
  field.nova.fronts.clear();
  ship.vx = 0;
  ship.vy = 0;
  ship.thrust = 0;
}

/**
 * Put one shot at the ship's own place, going `vy` px/s with `life` seconds left, and
 * answer how long the frame made its trail. The trail is a stamped sprite, so its width
 * on the canvas is the length it was drawn at (tools/headless/harness.js logs stamps).
 */
function trailWidth(vy, life) {
  emptySky();
  const bullet = field.bullets.spawn();
  bullet.x = ship.x;
  bullet.y = ship.y;
  bullet.px = ship.x;
  bullet.py = ship.y;
  bullet.vx = 0;
  bullet.vy = vy;
  bullet.life = life;
  bullet.dmg = 1;
  bullet.knock = 0;
  bullet.pierce = 0;
  bullet.bounce = 0;
  bullet.charged = false;
  bullet.turret = false;
  // And that it is a plain shot: neither of the two newest fields may be left to whatever the last
  // shot this world fired answered (game/missiles.js).
  bullet.hunts = false;
  bullet.splash = 0;
  bullet.hits.length = 0;

  game.step();
  return game.stamps().map((stamp) => stamp.w);
}

/** The one width that differs between two frames of an otherwise identical sky. */
function theDifference(before, after) {
  assert.equal(before.length, after.length, 'the same things were painted');
  const diff = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) diff.push([before[i], after[i]]);
  }
  assert.equal(diff.length, 1, 'exactly one thing about the frame changed');
  return diff[0];
}

test('a slower shot paints a shorter trail', () => {
  const fast = trailWidth(-PULSE.speed, PULSE.life);
  const slow = trailWidth(-SCATTER.speed, SCATTER.life);
  const [wide, narrow] = theDifference(fast, slow);

  assert.ok(narrow < wide, 'the slow one is the short one: ' + narrow + ' against ' + wide);
  const wanted = SCATTER.speed / PULSE.speed;
  assert.ok(Math.abs(narrow / wide - wanted) < 0.02,
    'and it is short by exactly the speed it is slow by: ' + (narrow / wide).toFixed(3)
    + ' against ' + wanted.toFixed(3));
});

test('a shot that is about to run out paints a shorter trail', () => {
  // Same speed, same place: all that differs is how much air it has left to cross, so the
  // streak collapsing is the shot visibly reaching the end of its range.
  const fresh = trailWidth(-PULSE.speed, PULSE.life);
  const dying = trailWidth(-PULSE.speed, 0.03);
  const [long, short] = theDifference(fresh, dying);

  assert.ok(short < long * 0.5, 'the trail collapses as the shot dies: ' + short + ' against ' + long);
});

test('every gun in the game paints its own trail', () => {
  // The trail is derived from the shot rather than remembered from the gun, so a shot
  // cannot be drawn with another weapon's streak - which is what a cached sprite keyed on
  // the world's current weapon would do to a shot still in the air when a pick changes.
  setWeapon(field, 'pulse');
  const pulse = trailWidth(-PULSE.speed, PULSE.life);
  setWeapon(field, 'scatter');
  const stillPulse = trailWidth(-PULSE.speed, PULSE.life);
  assert.deepEqual(stillPulse, pulse, 'a pulse shot is a pulse shot, whichever gun is picked');
});
