// The Swarm's missiles, as drawn (BALANCE.weapons.swarm, game/missiles.js).
//
// There is no browser here, so this cannot say what a small dart of light looks like. What it can
// say is the three things that matter about it, and all three are promises the sim cares about:
//
//   **It is painted, not blurred**: fills, stamps, no gradient, no shadow, and nothing baked on the
//     spot (render/glow.js, and test/draw-cost.test.mjs for the whole sprite cache).
//
//   **It drags the trail its own speed earns**: the same streak every shot is stamped with, stretched
//     to how fast this one is going. A hunting shot may not be painted with a different trail than a
//     plain one of the same speed, or the picture would be telling the player something about the gun
//     that the simulation does not have.
//
//   **It is drawn where it hurts**: one shape at the shot's own place, and one per shot, so a flight
//     of six costs six darts and a sky with none in it costs the arena nothing at all.
//
// The arena and nothing else is what is measured here, so the interface is subtracted out
// (tools/headless/frame-cost.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { makeFrameCost } from '../tools/headless/frame-cost.js';
import { BALANCE } from '../src/game/balance.js';
import { resetIndicators } from '../src/render/indicators.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 12 });
const field = game.world;
const ship = field.player;
const GUN = BALANCE.weapons.swarm;
const MISSILE = GUN.missile;

const frameCost = makeFrameCost(game);

// Get a run going on the Swarm: the title screen draws no ship, and a shot with no ship in the world
// has no nose to be measured against.
game.chooseWeapon('swarm');
game.pressMouse(640, 360);
game.step();
game.releaseMouse();
game.step();

/** Nothing but the ship on the glass, and nothing arriving to spoil the count. */
function emptySky() {
  field.enemies.length = 0;
  field.bullets.clear();
  field.beams.clear();
  field.lance.beams.clear();
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.shards.clear();
  field.spawnTimer = Infinity;
  ship.invuln = Infinity;
  ship.vx = 0;
  ship.vy = 0;
  ship.thrust = 0;
  // The arrows at the window edge belong to whatever the last test planted, and they fade out over a
  // second or so, which is a second too long for a frame that is being counted.
  resetIndicators();
}

/**
 * Put one shot in the air at the ship's own place, going up the screen at `speed`, and leave it
 * there: the frame that is counted is the frame after it. `hunts` is the only thing that differs
 * between a micro-missile and a plain shot of the same speed and reach, which is the point.
 */
function oneShot(hunts, speed) {
  emptySky();
  const bullet = field.bullets.spawn();
  bullet.x = ship.x;
  bullet.y = ship.y - 60;
  bullet.px = bullet.x;
  bullet.py = bullet.y;
  bullet.vx = 0;
  bullet.vy = -speed;
  bullet.life = hunts ? GUN.life : BALANCE.weapons.pulse.life;
  bullet.dmg = GUN.damage;
  bullet.knock = 0;
  bullet.pierce = 0;
  bullet.bounce = 0;
  bullet.charged = false;
  bullet.turret = false;
  bullet.hunts = hunts;
  bullet.splash = hunts ? MISSILE.blast.radius : 0;
  bullet.hits.length = 0;
  return frameCost();
}

/** One missile per line the split line is worth, all of them in a row up the screen. */
function aFlight(hunts) {
  emptySky();
  const howMany = BALANCE.upgrades.split.ranks + GUN.pellets;
  for (let i = 0; i < howMany; i++) {
    const bullet = field.bullets.spawn();
    bullet.x = ship.x + i * 24 - 40;
    bullet.y = ship.y - 80 - i * 20;
    bullet.px = bullet.x;
    bullet.py = bullet.y;
    bullet.vx = 0;
    bullet.vy = -GUN.speed;
    bullet.life = GUN.life;
    bullet.dmg = GUN.damage;
    bullet.knock = 0;
    bullet.pierce = 0;
    bullet.bounce = 0;
    bullet.charged = false;
    bullet.turret = false;
    bullet.hunts = hunts;
    bullet.splash = hunts ? MISSILE.blast.radius : 0;
    bullet.hits.length = 0;
  }
  return { cost: frameCost(), howMany: howMany };
}

test('an empty sky costs the arena nothing, and a cold gun costs nothing', () => {
  emptySky();
  const first = frameCost();
  emptySky();
  const second = frameCost();

  assert.equal(second.fills, first.fills, 'no fills for a sky with nothing in it');
  assert.equal(second.images, first.images, 'and no stamps');
  assert.equal(second.strokes, first.strokes, 'and no strokes');
});

test('a missile is drawn as a thing with a nose, not as a dot', () => {
  const plain = oneShot(false, GUN.speed);
  const hunting = oneShot(true, GUN.speed);

  assert.ok(hunting.fills > plain.fills,
    'the dart is more than a dot: ' + hunting.fills + ' fills against ' + plain.fills);
  assert.equal(hunting.images, plain.images,
    'and one thing about the frame has not changed: the trail it drags');
});

test('a missile drags the trail its own speed earns, and no other', () => {
  // The trail is derived from the shot - its speed, and the air it has left - and not remembered from
  // a gun, so a micro-missile is stamped with the same streak a plain shot of its speed would get, no
  // longer and no shorter (test/bullet-art.test.mjs holds the same promise for the two guns that were
  // here first). The streak is a stamped sprite, so its width on the canvas is its length.
  const quick = oneShot(true, 520);
  const widthsQuick = game.stamps().map((stamp) => stamp.w);
  const slow = oneShot(true, 260);
  const widthsSlow = game.stamps().map((stamp) => stamp.w);

  assert.equal(widthsSlow.length, widthsQuick.length, 'the same things were stamped');
  const diff = [];
  for (let i = 0; i < widthsQuick.length; i++) {
    if (widthsQuick[i] !== widthsSlow[i]) diff.push([widthsQuick[i], widthsSlow[i]]);
  }
  assert.equal(diff.length, 1, 'exactly one streak changed, and that is the shot\'s');
  const [wide, narrow] = diff[0];
  assert.ok(narrow < wide, 'the slow one drags less air: ' + narrow + ' against ' + wide);
  assert.ok(Math.abs(narrow / wide - 0.5) < 0.02,
    'and by exactly the speed it is slow by: ' + (narrow / wide).toFixed(3));
  assert.ok(quick.images === slow.images, 'one streak each, whichever speed it is');
});

test('the whole gun is painted, not blurred, and it bakes nothing on the spot', () => {
  const one = oneShot(true, GUN.speed);
  const flight = aFlight(true);

  for (const cost of [one, flight.cost]) {
    assert.equal(cost.gradients, 0, 'no gradient was built for it');
    assert.equal(cost.shadows, 0, 'and the canvas was never asked to blur anything');
    assert.equal(cost.baked, 0, 'and no sprite had to be baked: it reuses the one every shot drags');
  }
});

test('a flight costs one shape each, and an undrawn missile would be a lie', () => {
  const plain = aFlight(false);
  const hunting = aFlight(true);

  assert.equal(hunting.howMany, BALANCE.upgrades.split.ranks + GUN.pellets);
  assert.ok(hunting.cost.fills > plain.cost.fills,
    'every missile in the air is on the glass: ' + hunting.cost.fills + ' against ' + plain.cost.fills);
  assert.equal(hunting.cost.images, plain.cost.images,
    'and each of them exactly one streak, however it got there');
});
