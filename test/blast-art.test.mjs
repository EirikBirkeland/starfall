// A bomber's death zone, and its fuse, as drawn (PLAN 3.3's "telegraphed circle").
//
// There is no browser here, so this cannot say what the ring looks like. What it can
// say is the three things that make it a telegraph rather than decoration: it is
// drawn for a bomber and for nothing else, it costs strokes and dashes and never a
// blur or a gradient, and - the one that matters most - it is culled by its own
// reach, so a ring whose circle touches the window is drawn even when the body that
// owns it is not. A warning you can only see once the danger is on screen is not one.
//
// Same trick as test/telegraph.test.mjs: count what a frame asks the canvas for.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { fuseLight, zoneLight } from '../src/render/entities.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 44 });
const field = game.world;
const ship = field.player;
const RADIUS = BALANCE.kinds.bomber.blast.radius;

// The title screen draws the menu crowd and no ship, so get a run going first.
game.pressMouse(640, 360);
game.step();
game.releaseMouse();

/** Nothing on the arena but what a test puts there, and nothing arriving. */
function clearTheSky() {
  field.enemies.length = 0;
  field.particles.clear();
  field.rings.clear();
  field.texts.clear();
  field.bullets.clear();
  field.shards.clear();
  field.enemyShots.clear();
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
    dashes: after.dashes - before.dashes,
    gradients: after.gradients - before.gradients,
    shadows: after.shadows - before.shadows,
  };
}

/** Put one enemy of `type` at (x, y) for the next frame only. */
function planted(type, x, y) {
  const enemy = makeEnemy(field, type, x, y);
  enemy.speed = 0;          // it is scenery for one frame; it must not walk anywhere
  field.enemies.push(enemy);
  return enemy;
}

/** How far past the right edge of the window an arena point sits, in px. */
function pastTheEdge(x) {
  const camera = game.camera;
  return x - (camera.x + camera.w);
}

test('a bomber draws a ring and a fuse, and asks for no blur', () => {
  clearTheSky();
  planted('drifter', ship.x + 200, ship.y);
  const plain = frameCost();

  clearTheSky();
  planted('bomber', ship.x + 200, ship.y);
  const bomber = frameCost();

  assert.equal(bomber.dashes, 1, 'one dash pattern, for the ring');
  assert.equal(bomber.strokes - plain.strokes, 2,
    'two passes for it - a wide soft one under a thin bright one - and that is all');
  assert.equal(bomber.images - plain.images, 1, 'one light for the fuse at its core');
  assert.equal(bomber.gradients, 0, 'no gradient built for any of it');
  assert.equal(bomber.shadows, 0, 'and the canvas was never asked to blur it');
});

test('nothing else in the arena draws one', () => {
  clearTheSky();
  game.step();
  const empty = game.drawCalls().dashes;

  clearTheSky();
  for (const type of ['drifter', 'weaver', 'darter', 'spitter', 'tank']) {
    planted(type, ship.x - 300 + 60 * type.length, ship.y - 100);
  }
  game.step();

  assert.equal(game.drawCalls().dashes, empty, 'not one ring for the whole rest of the roster');
});

test('the ring reaches the window from further off than the body does', () => {
  // The point of a floor marking: the circle is what you are reading, so the circle
  // is what decides whether any of it is visible. A bomber standing just off the
  // edge still shows its ring, and a bomber nowhere near shows nothing at all.
  clearTheSky();
  game.step();
  const empty = frameCost();

  clearTheSky();
  const near = planted('bomber', ship.x + 500, ship.y);
  const onScreen = frameCost();
  assert.ok(pastTheEdge(near.x) < 0, 'that one is inside the window: ' + pastTheEdge(near.x).toFixed(0));
  assert.equal(onScreen.dashes, 1);

  clearTheSky();
  const off = planted('bomber', game.camera.x + game.camera.w + RADIUS * 0.9, ship.y);
  const ringOnly = frameCost();
  assert.ok(pastTheEdge(off.x) > off.r, 'its body is off the window by '
    + pastTheEdge(off.x).toFixed(0) + ' px');
  assert.equal(ringOnly.dashes, 1, 'and still the ring is drawn');
  assert.equal(ringOnly.images, empty.images, 'with none of the body, and none of its fuse');

  clearTheSky();
  planted('bomber', game.camera.x + game.camera.w + RADIUS + 200, ship.y);
  const far = frameCost();
  assert.equal(far.dashes, empty.dashes, 'a circle that touches nothing is not drawn');
  assert.equal(far.images, empty.images, 'and neither is anything else of it');
});

test('a wounded bomber is the same drawing, only louder', () => {
  clearTheSky();
  planted('bomber', ship.x + 200, ship.y);
  const whole = frameCost();

  clearTheSky();
  const wounded = planted('bomber', ship.x + 200, ship.y);
  wounded.hp = 1;
  const critical = frameCost();

  // The tell is opacity and pulse rate, which the counters above cannot see; what they
  // can say is that the warning costs no more to draw as it gets louder, so it is
  // never the first thing dropped on a busy frame.
  assert.deepEqual(critical, whole);
});

/**
 * How many times a bomber's light turns around in one second - how many times it
 * reaches a top or a bottom. A light that does not breathe turns zero times, and one
 * that breathes twice as fast turns about twice as often, which is the only honest
 * way to measure a pulse from a function of time.
 */
function turns(light, enemy) {
  let turnCount = 0;
  let direction = 0;
  let previous = light(enemy, 0);
  for (let t = 0.0005; t <= 1.0001; t += 0.0005) {
    const now = light(enemy, t);
    if (now > previous + 1e-12) {
      if (direction < 0) turnCount++;
      direction = 1;
    } else if (now < previous - 1e-12) {
      if (direction > 0) turnCount++;
      direction = -1;
    }
    previous = now;
  }
  return turnCount;
}

/** The brightest and the quietest a light gets across `seconds` of the frame clock. */
function range(light, enemy, seconds) {
  const span = seconds === undefined ? 1 : seconds;
  let low = Infinity;
  let high = -Infinity;
  for (let t = 0; t <= span + 1e-9; t += 0.001) {
    const now = light(enemy, t);
    if (now < low) low = now;
    if (now > high) high = now;
  }
  return { low, high };
}

function aBomber(hullLeft) {
  const field = game.world;
  const bomber = makeEnemy(field, 'bomber', ship.x + 200, ship.y);
  bomber.hp = hullLeft === undefined ? bomber.maxhp : hullLeft;
  return bomber;
}

test('the ring breathes, and breathes harder the closer the bomber is to going', () => {
  const whole = aBomber();
  const hurt = aBomber(Math.round(whole.maxhp * 0.6));
  const critical = aBomber(1);

  const calm = range(zoneLight, whole);
  assert.equal(calm.low, calm.high, 'a whole one is a steady circle, not a blinking one');

  const half = range(zoneLight, hurt);
  assert.ok(half.high > half.low, 'a wounded one breathes');
  assert.ok(half.low > calm.high, 'and is never as quiet as a whole one');

  const shouting = range(zoneLight, critical);
  assert.ok(shouting.low > calm.high, 'the near-dead one is louder still at the bottom of its breath');
  assert.ok(turns(zoneLight, whole) === 0, 'the steady one turns ' + turns(zoneLight, whole) + ' times');
  assert.ok(turns(zoneLight, hurt) >= 2, 'the wounded one turns ' + turns(zoneLight, hurt) + ' times');
  assert.ok(turns(zoneLight, critical) > turns(zoneLight, hurt),
    'and the dying one breathes fastest: ' + turns(zoneLight, critical) + ' against ' + turns(zoneLight, hurt));
});

test('the fuse is never out, and it strobes harder too', () => {
  const whole = aBomber();
  const critical = aBomber(1);

  // Four seconds, so that even the slow breath of a whole bomber is watched through
  // more than a whole cycle and the two bottoms are really being compared.
  const calm = range(fuseLight, whole, 4);
  assert.ok(calm.low > 0, 'a whole bomber still shows a lit fuse: ' + calm.low.toFixed(2));
  assert.ok(calm.high > calm.low, 'and it breathes, however gently');

  const shouting = range(fuseLight, critical, 4);
  assert.ok(Math.abs(shouting.low - calm.low) < 1e-3,
    'every breath bottoms out on the same lit fuse, so it never goes out: '
    + shouting.low.toFixed(3) + ' against ' + calm.low.toFixed(3));
  assert.ok(shouting.high > calm.high, 'and it burns brighter at the top of each breath');
  assert.ok(turns(fuseLight, critical) > turns(fuseLight, whole),
    turns(fuseLight, critical) + ' strobes against ' + turns(fuseLight, whole));
});
