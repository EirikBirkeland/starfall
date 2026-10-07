// The shielder (PLAN 3.3: "projects a shield onto nearby enemies; kill it first"),
// as the simulation does it.
//
// This kind is the first in the game whose behaviour is a relationship between two
// bodies rather than the way one of them walks, so most of what there is to promise is
// about the relation (game/shields.js) and not about a walk:
//
//   the field is a distance, and it is the same distance the renderer draws;
//   a shield is a pool of points that comes off before the hull, so a body is never
//   hurt by a fraction and the tally still counts hull and not damage aimed;
//   it grows back only when it is left alone, and only while the field still reaches;
//   and the whole point of the kind: take the shielder out and every shield it held
//   comes down at once, which is what makes "kill it first" worth the trip.
//
// Everything here runs on the scripted world (tools/headless/scripted.js) at the
// game's own step, next to test/kinds.test.mjs, which already proves the general kind
// promises for every kind including this one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { makeEnemy } from '../src/game/kinds.js';
import { damageEnemy, killEnemy } from '../src/game/enemies.js';
import { guardOf, isGuarded, shieldShare, shieldWaiting } from '../src/game/shields.js';
import { spawnEnemy } from '../src/game/waves.js';
import { scriptedRun, stepTheWorld, bulletFlyingToward } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const STATS = BALANCE.kinds.shielder;
const G = STATS.guard;
const SHIP = { x: BALANCE.arena.w / 2, y: BALANCE.arena.h / 2 };

/** How many steps `seconds` of the game's own clock is. */
function stepsOf(seconds) {
  return Math.round(seconds / STEP);
}

/**
 * Step the world for `seconds`, pinning each of `props` back where the test put it.
 * A band-walker shuffles sideways even with no speed to walk with, so a test that is
 * about geometry has to hold the geometry; the walk has its own tests below.
 */
function holdFor(seconds, props) {
  const held = props || [];
  const spots = held.map((e) => [e.x, e.y]);
  for (let i = 0; i < stepsOf(seconds); i++) {
    stepTheWorld();
    for (let j = 0; j < held.length; j++) {
      held[j].x = spots[j][0];
      held[j].y = spots[j][1];
    }
  }
}

/** Stand a body at (x, y) and keep it out of the way of everything else. */
function standing(field, type, x, y) {
  const enemy = makeEnemy(field, type, x, y);
  enemy.speed = 0;
  field.enemies.push(enemy);
  return enemy;
}

/**
 * A run with one shielder at (x, y) - held still, because these tests are about the
 * field it holds and not about how it gets anywhere.
 */
function fieldAt(seed, x, y) {
  const field = scriptedRun(seed);
  const shielder = makeEnemy(field, 'shielder', x, y);
  shielder.speed = 0;
  field.enemies.push(shielder);
  return { field, shielder };
}

/** One body `gap` px away from a shielder, with its shield filled right up. */
function covered(seed, gap, type) {
  const at = fieldAt(seed, SHIP.x, SHIP.y - 400);
  const body = standing(at.field, type || 'drifter', at.shielder.x + gap, at.shielder.y);
  holdFor((G.cap / G.rate) + 0.5, [at.shielder, body]);
  return { ...at, body };
}

/** How far apart two things are. */
function apart(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The ship, as the crow and the bulwark both see it. */
function bearing(enemy) {
  return Math.atan2(SHIP.y - enemy.y, SHIP.x - enemy.x);
}

// --- who is covered ----------------------------------------------------------

test('a body inside the field is covered, and one step beyond it is not', () => {
  const { field, shielder } = fieldAt(1, SHIP.x, SHIP.y - 400);
  const inside = standing(field, 'drifter', shielder.x + G.radius, shielder.y);
  const outside = standing(field, 'drifter', shielder.x + G.radius + 1, shielder.y);

  holdFor(0.1, [shielder, inside, outside]);

  assert.equal(isGuarded(inside), true, 'a centre standing exactly on the line is inside it');
  assert.equal(guardOf(inside), shielder, 'and it knows whose cover it is standing in');
  assert.equal(isGuarded(outside), false, 'and the one a px further out is on its own');
});

test('a shielder does not cover itself', () => {
  const { field, shielder } = fieldAt(2, SHIP.x, SHIP.y - 400);
  standing(field, 'drifter', shielder.x + 20, shielder.y);

  holdFor(3, [shielder]);

  assert.equal(isGuarded(shielder), false, 'the one holding the field stands outside it');
  assert.equal(shielder.shield, 0, 'so there is nothing over it to shoot through');
  assert.equal(shieldShare(shielder), 0);
});

test('the nearer field is the one a body is linked to', () => {
  const field = scriptedRun(3);
  const near = fieldAt(3, SHIP.x, SHIP.y - 400).shielder;
  const far = makeEnemy(field, 'shielder', SHIP.x + 190, SHIP.y - 400);
  far.speed = 0;
  field.enemies.push(far);
  const body = standing(field, 'drifter', SHIP.x + 60, SHIP.y - 400);

  holdFor(0.2, [near, far, body]);

  assert.ok(apart(body, near) < apart(body, far), 'the setup has it nearer one of them');
  assert.equal(isGuarded(body), true);
  assert.ok(G.radius > apart(body, far), 'and both of them reach it, so the choice is real');
  assert.equal(guardOf(body), near, 'the link goes to the short one, which is what gets drawn');
});

test('two fields cover more of the crowd; they never make one body thicker', () => {
  const field = scriptedRun(4);
  const a = fieldAt(4, SHIP.x, SHIP.y - 400).shielder;
  const b = makeEnemy(field, 'shielder', a.x + 60, a.y);
  b.speed = 0;
  field.enemies.push(b);
  const between = standing(field, 'drifter', a.x + 30, a.y);
  const lonely = standing(field, 'drifter', a.x - 400, a.y);

  holdFor(4, [a, b, between, lonely]);

  assert.equal(isGuarded(between), true, 'the one both fields reach is covered...');
  assert.equal(between.shield, G.cap, '...by exactly one shield, not by two');
  assert.equal(isGuarded(lonely), false, 'and the one neither reaches is paying for nothing');
});

// --- what a hit costs --------------------------------------------------------

test('a shield eats a shot and the hull never hears about it', () => {
  const { field, shielder, body } = covered(5, 60);
  const was = body.hp;
  assert.ok(Math.abs(body.shield - G.cap) < 1e-9, 'it came up to the cap its field was given');

  assert.equal(damageEnemy(field, body, 1, true), false);

  assert.equal(body.hp, was, 'not one point of hull');
  assert.ok(Math.abs(body.shield - (G.cap - 1)) < 1e-9, 'the shot came off the shield');
  assert.equal(body.flash, 0, 'and a hit that never reached the hull does not light it up');
});

test('what the shield cannot eat goes on through to the hull', () => {
  const { field, shielder, body } = covered(6, 60);
  const was = body.hp;

  damageEnemy(field, body, G.cap - 1, true);
  assert.equal(body.hp, was, 'a point of shield still in the way, and it took the lot');

  damageEnemy(field, body, 5, true);
  assert.equal(body.hp, was - (5 - 1), 'four of the five reached the hull, one did not');
  assert.ok(body.flash > 0, 'and the body shows the hit it actually had');
  assert.equal(body.shield, 0);
});

test('a shot that lands on a shield is eaten by the shield', () => {
  // The same promise through the real thing: a bullet in flight, the collision grid,
  // and the step that puts them together - which is where a shield would be missed if
  // anything that hurts a body remembered to ask about it and something else did not.
  const { field, shielder, body } = covered(7, 60);
  const was = body.hp;
  bulletFlyingToward(body.x, body.y, 0, 1);

  stepTheWorld();

  assert.equal(body.hp, was, 'the shot is gone and the hull is whole');
  assert.equal(field.bullets.count, 0, 'it was spent on the shield');
  assert.ok(body.shield < G.cap);
});

test('a body that left the field this step is not covered for a shot that lands this step', () => {
  // What the order of the step is for: `updateShields` runs before anything is shot at,
  // so a shot is answered by the cover that had come off, not by the one it wore last
  // step. Move the body out of reach and fire in the same breath.
  const { field, shielder, body } = covered(22, 60);
  const hull = body.hp;
  body.x = shielder.x + G.radius + 40;
  bulletFlyingToward(body.x, body.y, 0, 1);

  stepTheWorld();

  assert.equal(body.hp, hull - BALANCE.bullets.damage,
    'the field had gone, so the shot landed on the hull and not on a shield');
});

test('a blast is soaked the same as a bullet', () => {
  // A bomber's blast comes at a body from the other direction entirely (game/blast.js
  // calls the same `damageEnemy` a bullet does), so it pays for the shield too.
  const { field, shielder, body } = covered(8, 40, 'tank');
  const bomber = standing(field, 'bomber', shielder.x + 140, shielder.y);
  const outside = standing(field, 'tank', shielder.x + 200, shielder.y);
  assert.ok(apart(outside, bomber) < BALANCE.kinds.bomber.blast.radius,
    'both tanks are inside the circle');
  assert.ok(apart(outside, shielder) > G.radius, 'and only one of them is under cover');
  holdFor(0.1, [shielder, body, bomber, outside]);
  const coveredWas = body.hp;
  const plainWas = outside.hp;

  killEnemy(field, bomber, true);

  assert.equal(outside.hp, plainWas - BALANCE.kinds.bomber.blast.damage,
    'the plain one took all of it');
  assert.equal(body.hp, coveredWas - (BALANCE.kinds.bomber.blast.damage - G.cap),
    'and the covered one is worth exactly one shield more');
});

test('the tally is told what the hull cost, not what was aimed at it', () => {
  const { field, shielder, body } = covered(9, 60);
  const hull = body.hp;

  damageEnemy(field, body, 1, true);
  damageEnemy(field, body, G.cap - 1 + hull, true);

  const row = field.tally.kinds.drifter;
  assert.equal(row.hits, 2, 'both shots landed on it, whatever they did afterwards');
  assert.equal(row.damage, hull,
    'and between them they cost it its hull and no more');
  assert.equal(row.killed, 1);
  assert.equal(row.shotsOnKilled, 2, 'two shots to bring it down, one of which did nothing');
});

// --- what a shield is worth when it grows back -------------------------------

test('the shield fills back after being left alone, and not one moment before', () => {
  const { field, shielder, body } = covered(10, 60);
  damageEnemy(field, body, G.cap, true);
  assert.equal(body.shield, 0, 'soaked flat');

  holdFor(G.after - 0.2, [shielder, body]);
  assert.equal(body.shield, 0, 'nothing has come back yet, and it will not while the wait lasts');
  assert.ok(shieldWaiting(body) > 0, 'and the wait is visible while it runs');

  holdFor(0.4, [shielder, body]);
  assert.ok(body.shield > 0, 'the moment the wait is up it starts to come back');
  assert.equal(shieldWaiting(body), 0, 'and the wait is over');

  holdFor(G.cap / G.rate, [shielder, body]);
  assert.ok(Math.abs(body.shield - G.cap) < 1e-9, 'up to the cap the field was given, and no further');
  assert.ok(Math.abs(shieldShare(body) - 1) < 1e-9, 'which is the whole of the ring drawn over it');
});

test('a body that is being shot at never gets its shield back', () => {
  // Every hit the shield eats restarts the wait, so steady fire keeps it below the top
  // of its ring for as long as it is being fired at - which is the whole reason
  // focusing one body is the move and spraying the crowd is not.
  const { field, shielder, body } = covered(11, 60, 'tank');
  const hull = body.hp;
  let highest = 0;

  for (let i = 1; i <= 6; i++) {
    damageEnemy(field, body, 1, true);
    holdFor(0.5, [shielder, body]);        // two points a second, more than it can refill
    highest = Math.max(highest, body.shield);
  }

  assert.ok(highest < G.cap,
    'the most it ever got back was ' + highest.toFixed(2) + ' of ' + G.cap);
  assert.ok(body.hp < hull, 'and the hull paid for the rest: ' + (hull - body.hp));
});

// --- the field going out -----------------------------------------------------

test('killing the shielder takes every shield it held down at once', () => {
  const { field, shielder } = fieldAt(12, SHIP.x, SHIP.y - 400);
  const one = standing(field, 'drifter', shielder.x + 20, shielder.y);
  const two = standing(field, 'drifter', shielder.x + 90, shielder.y);
  const three = standing(field, 'tank', shielder.x - 110, shielder.y);
  holdFor(3, [shielder, one, two, three]);
  assert.equal(one.shield, G.cap, 'the three of them are standing under cover');
  assert.equal(two.shield, G.cap);
  assert.equal(three.shield, G.cap);

  killEnemy(field, shielder, true);
  assert.equal(one.shield, G.cap, 'the moment of the death itself changes nothing...');

  stepTheWorld();

  assert.equal(isGuarded(one), false, '...but the next step finds the field gone');
  assert.equal(one.shield, 0, 'and what was over the body went with it');
  assert.equal(two.shield, 0);
  assert.equal(three.shield, 0, 'the tank had more hull in front of it and lost the same of it');
});

test('a shield going out is something you can see', () => {
  const { field, shielder } = fieldAt(13, SHIP.x, SHIP.y - 400);
  const one = standing(field, 'drifter', shielder.x + 20, shielder.y);
  const two = standing(field, 'drifter', shielder.x + 90, shielder.y);
  holdFor(3, [shielder, one, two]);
  const rings = field.rings.count;
  const sparks = field.particles.count;
  const shake = field.shake;

  killEnemy(field, shielder, true);
  stepTheWorld();

  // One ring closing in on the body that held the field, one pop per body that lost a
  // shield over it, and the sparks of both.
  assert.ok(field.rings.count >= rings + 1 + 2,
    'the field collapses with a ring of its own and each body pops one: ' + (field.rings.count - rings));
  assert.ok(field.particles.count > sparks, 'and there is light in it');
  assert.ok(field.shake > shake, 'and it is felt');
  const closing = field.rings.items.filter((r) => r.vr < 0);
  assert.equal(closing.length, 1, 'one ring, and it runs inwards rather than out');
});

test('the collapse never asks the canvas for a circle with no radius', () => {
  // A ring that closes in has to be watched: `arc` refuses a radius of nil, and the
  // numbers that decide it are tuning numbers, which means somebody may change them.
  const { field, shielder } = fieldAt(14, SHIP.x, SHIP.y - 400);
  const life = BALANCE.kinds.shielder.guard.collapse.ring.life;

  killEnemy(field, shielder, true);

  let smallest = Infinity;
  for (let i = 0; i <= stepsOf(life) + 2; i++) {
    for (const ring of field.rings.items) smallest = Math.min(smallest, ring.r);
    stepTheWorld();
  }
  assert.ok(smallest > 0, 'every ring on the arena kept a radius to the end: ' + smallest.toFixed(3));
});

test('a body that walks out of the field loses its cover too', () => {
  const { field, shielder, body } = covered(15, 60);
  const rings = field.rings.count;

  body.x = shielder.x + G.radius + 40;
  stepTheWorld();

  assert.equal(isGuarded(body), false, 'the field does not reach it any more');
  assert.equal(body.shield, 0, 'and neither does what was over it');
  assert.equal(field.rings.count, rings + 1, 'and it says so, small and quiet');
});

// --- the walk ----------------------------------------------------------------

test('it holds the band it likes and never walks into your face', () => {
  const field = scriptedRun(16);
  const fromFar = makeEnemy(field, 'shielder', SHIP.x + G.stand.far + 300, SHIP.y);
  field.enemies.push(fromFar);
  const was = apart(fromFar, SHIP);
  holdFor(2, []);
  assert.ok(apart(fromFar, SHIP) < was - 40,
    'from beyond its band it came in: ' + was.toFixed(0) + ' to ' + apart(fromFar, SHIP).toFixed(0));

  const field2 = scriptedRun(17);
  const fromNear = makeEnemy(field2, 'shielder', SHIP.x + G.stand.near - 80, SHIP.y);
  field2.enemies.push(fromNear);
  const too = apart(fromNear, SHIP);
  holdFor(2, []);
  assert.ok(apart(fromNear, SHIP) > too + 40,
    'from inside it it gave ground back: ' + too.toFixed(0) + ' to ' + apart(fromNear, SHIP).toFixed(0));
});

test('it never closes the last hundred px, however long it is left alone', () => {
  const field = scriptedRun(18);
  const shielder = makeEnemy(field, 'shielder', SHIP.x + G.stand.far + 200, SHIP.y);
  field.enemies.push(shielder);

  let closest = Infinity;
  for (let i = 0; i < stepsOf(20); i++) {
    stepTheWorld();
    closest = Math.min(closest, apart(shielder, SHIP));
  }

  assert.ok(closest > 100, 'the closest it ever came was ' + closest.toFixed(0) + ' px');
  assert.ok(closest > G.stand.near * 0.6,
    'which is nowhere near a thing that could touch the ship, at all');
});

test('the flat face of it is always turned to the ship', () => {
  const field = scriptedRun(19);
  const shielder = makeEnemy(field, 'shielder', SHIP.x + 400, SHIP.y - 300);
  field.enemies.push(shielder);

  for (let i = 0; i < 240; i++) {
    // The line it takes its bearing from is the one the step started with, so that is
    // the one its face has to be on - the ship has not moved, and nothing else may.
    const want = bearing(shielder);
    stepTheWorld();
    let diff = (want - shielder.rot) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    assert.ok(Math.abs(diff) < 1e-9,
      'step ' + i + ': it is looking ' + (diff * 57.3).toFixed(3) + ' deg off the ship');
  }
});

// --- the roster --------------------------------------------------------------

test('the roster keeps the shielder off the stage for seven and a half minutes', () => {
  const field = scriptedRun(20);
  assert.equal(STATS.from, 450, 'PLAN 3.3 puts it at 7:30');

  const roll = (seconds) => {
    field.elapsed = seconds;
    const seen = new Set();
    for (let i = 0; i < 600; i++) {
      field.enemies.length = 0;
      if (spawnEnemy(field)) seen.add(field.enemies[0].type);
    }
    return seen;
  };

  assert.equal(roll(STATS.from - 1).has('shielder'), false, 'not one before its minute');
  assert.equal(roll(STATS.from + 60).has('shielder'), true, 'and one after it');
});

test('it is worth more than anything that came before, and no dearer to the director', () => {
  // The lockstep with the wave director again (test/waves.test.mjs, test/bomber.test.mjs):
  // the shielder is the most valuable body in the arena and it must still fit into a
  // wave, and into a wave *with* an escort - which is the whole idea of it.
  const dearest = Math.max(...Object.values(BALANCE.kinds).map((kind) => kind.cost));
  assert.equal(STATS.cost, dearest, 'a shielder is worth as much crowd as a tank, no more');
  assert.ok(STATS.cost <= BALANCE.waves.waveMinPoints, 'and the smallest wave can still afford one');
  assert.ok(STATS.score > BALANCE.kinds.tank.score, 'and it pays the player for the trip');
});

test('an elite shielder holds the same field for four times the hull', () => {
  // It is worth saying out loud, because it falls out of the kind being ordinary: a
  // wave that spends itself on a gold shielder is a wave whose whole escort is
  // armoured and whose kill is the biggest single thing a run can do.
  const field = scriptedRun(21);
  const plain = makeEnemy(field, 'shielder', SHIP.x - 600, SHIP.y - 400);
  plain.speed = 0;
  field.enemies.push(plain);
  const gold = makeEnemy(field, 'shielder', SHIP.x, SHIP.y - 400, { elite: true });
  gold.speed = 0;
  field.enemies.push(gold);
  const body = standing(field, 'drifter', gold.x + 40, gold.y);
  holdFor(3, [gold, plain, body]);

  assert.equal(gold.elite, true);
  assert.equal(gold.hp, plain.hp * BALANCE.elite.hullMul, 'four of itself, and nothing else');
  assert.equal(body.shield, G.cap, 'and it covers the crowd exactly as well while it lasts');
});
