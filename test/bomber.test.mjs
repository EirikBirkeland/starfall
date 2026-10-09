// The bomber (PLAN 3.3: "explodes on death in a telegraphed circle; hurts other
// enemies too"), as the simulation does it.
//
// Three promises here, and they are the whole of the kind:
//
//   the circle is honest - what is drawn is `blastRadius`, what hurts is
//   `blastRadius`, measured from a centre both for the crowd and for the ship;
//   the warning gets louder as the thing gets more dangerous, and the walk and the
//   warning are read out of the same two numbers so they cannot drift apart;
//   and whoever lit the fuse is paid for everything that died to it, including a
//   second bomber that went off in the first one's circle.
//
// Everything here runs on the scripted world (tools/headless/scripted.js) at the
// game's own step, next to test/kinds.test.mjs, which already proves the general
// kind promises for every kind including this one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { blastPressure, blastRadius, isCritical, makeEnemy } from '../src/game/kinds.js';
import { killEnemy } from '../src/game/enemies.js';
import { spawnEnemy } from '../src/game/waves.js';
import { STATE } from '../src/game/state.js';
import { scriptedRun, stepTheWorld, enemyAt, bulletFlyingToward } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const STATS = BALANCE.kinds.bomber;
const B = STATS.blast;
const SHIP = { x: BALANCE.arena.w / 2, y: BALANCE.arena.h / 2 };

/** A run with one bomber in it at (x, y), walking at the speed its kind was given. */
function parked(seed, x, y) {
  const field = scriptedRun(seed);
  const bomber = makeEnemy(field, 'bomber', x, y);
  field.enemies.push(bomber);
  return { field, bomber };
}

/** Stand something else in the arena for the blast to find. */
function standing(field, type, x, y) {
  const enemy = makeEnemy(field, type, x, y);
  enemy.speed = 0;         // these are props, not actors
  field.enemies.push(enemy);
  return enemy;
}

/** How far one enemy came in `steps` steps, in px. */
function travelled(enemy, steps) {
  const x = enemy.x;
  const y = enemy.y;
  for (let i = 0; i < steps; i++) stepTheWorld();
  return Math.hypot(enemy.x - x, enemy.y - y);
}

/** The ship, hurtable again, which is the only thing the scripted run fixes. */
function vulnerable(field) {
  field.player.invuln = 0;
  return field.player;
}

/** A ship nowhere near anything, so a blast is the only thing that can touch it. */
function unharmed(player) {
  return { hull: player.hull, invuln: player.invuln };
}

// --- the walk and the tell -----------------------------------------------------

test('a bomber walks the straight line at the ship, nose first', () => {
  const { bomber } = parked(1, 1500, 1100);
  const expect = STATS.speed * STEP;

  const moved = travelled(bomber, 1);

  assert.ok(Math.abs(moved - expect) < 1e-6,
    'it covered its speed for one step: ' + moved.toFixed(4) + ' against ' + expect.toFixed(4));
  assert.ok(Math.abs(bomber.rot - Math.PI / 2) < 1e-9, 'its nose points at the ship');
});

test('it is in a hurry once it is critical, and not one moment before', () => {
  const { field, bomber } = parked(2, 1500, 1100);
  const calm = STATS.speed * STEP;
  const quick = STATS.speed * STATS.blast.rush * STEP;

  assert.equal(isCritical(bomber), false, 'whole, it is just walking');
  assert.ok(Math.abs(travelled(bomber, 1) - calm) < 1e-6, 'at its walking pace');

  bomber.hp = Math.floor(bomber.maxhp * B.arm);
  assert.equal(isCritical(bomber), true, 'at `arm` of its hull left, it is critical');
  assert.ok(Math.abs(travelled(bomber, 1) - quick) < 1e-6,
    'so it is covering ' + quick.toFixed(2) + ' px a step instead of ' + calm.toFixed(2));

  bomber.hp = 1;
  assert.equal(isCritical(bomber), true, 'and it stays in a hurry to the end');
  assert.equal(field.enemies.length, 1, 'nothing about being wounded removes it');
});

test('the tell is a share of its hull, from nothing when whole to everything when critical', () => {
  const { bomber } = parked(3, 1500, 1100);
  assert.equal(blastPressure(bomber), 0, 'a whole one has nothing to say yet');

  const steps = 8;
  let last = -1;
  for (let i = 1; i <= steps; i++) {
    bomber.hp = bomber.maxhp * (1 - i / steps);
    const now = blastPressure(bomber);
    assert.ok(now >= last, 'it never gets quieter: ' + now.toFixed(3));
    if (now < 1) assert.ok(now > last, 'and it climbs the whole way up: ' + now.toFixed(3));
    assert.equal(now === 1, isCritical(bomber),
      'the tell is at full volume exactly when the behaviour turns');
    last = now;
  }
  assert.equal(last, 1, 'and it is at 1 by the time the walk starts to rush');
  bomber.hp = -3;
  assert.equal(blastPressure(bomber), 1, 'and it does not shout past 1 on the way out');
});

// --- the circle --------------------------------------------------------------

test('the circle it is drawn standing in is exactly the blast', () => {
  const { bomber } = parked(4, 1500, 1100);
  assert.equal(blastRadius(bomber), B.radius);
  assert.equal(blastRadius(makeEnemy(scriptedRun(4), 'drifter', 100, 100)), 0,
    'and a kind that does not go off asks for no ring at all');

  // The one arithmetic the player is doing with the ring: can I still be leaving
  // when it goes off. Anything under half a second at full speed is readable.
  const toRunOut = B.radius / BALANCE.ships.wisp.maxSpeed;
  assert.ok(toRunOut < 0.5, 'the circle is ' + B.radius + ' px, which is '
    + toRunOut.toFixed(2) + ' s of full speed away');
  assert.ok(B.radius > BALANCE.player.hitShoveRadius,
    'and it reaches further than the shove a ship hit gets, so it is worth stepping back');
});

test('everything inside the circle is hurt and everything outside is not', () => {
  const { field, bomber } = parked(5, 1500, 1000);
  const edge = standing(field, 'drifter', 1500, 1000 - B.radius);
  const outside = standing(field, 'drifter', 1500, 1000 + B.radius + 1);
  const bystander = standing(field, 'tank', 1500, 1000 + 40);
  const sideways = standing(field, 'drifter', 1500 + 60, 1000);

  killEnemy(field, bomber, true);

  const hurt = BALANCE.kinds.drifter.hull - edge.hp;
  assert.equal(hurt, B.damage, 'a centre standing exactly on the line is inside it, so it took ' + B.damage);
  assert.equal(outside.hp, BALANCE.kinds.drifter.hull,
    'and the one a pixel further out was outside it and took nothing');
  assert.ok(edge.flash > 0, 'and it shows the hit, whoever did it');
  assert.equal(bystander.hp, BALANCE.kinds.tank.hull - B.damage,
    'a tank in the middle of it is hurt too and survives it');

  // The shove points away from the blast, which is what makes a chain spread.
  assert.ok(edge.iy < 0 && Math.abs(edge.ix) < 1e-9,
    'the one above the blast is thrown up: ix ' + edge.ix.toFixed(3) + ', iy ' + edge.iy.toFixed(1));
  assert.ok(bystander.iy > 0, 'and the one below it down');
  assert.ok(sideways.ix > 0 && Math.abs(sideways.iy) < 1e-9,
    'and the one beside it sideways, with nothing it did not ask for');
});

test('the ship standing in the circle pays a hull for it', () => {
  const { field, bomber } = parked(6, SHIP.x + 60, SHIP.y);
  const player = vulnerable(field);
  const was = unharmed(player);
  assert.equal(was.hull, BALANCE.ships.wisp.hull);

  killEnemy(field, bomber, true);

  assert.equal(player.hull, was.hull - 1, 'a hull, no more and no less');
  assert.ok(player.invuln > 0, 'and the grace after it, so one blast is one hit');
});

test('a ship outside the circle, or a ship that cannot be hurt, pays nothing', () => {
  const far = parked(7, SHIP.x + B.radius + 40, SHIP.y);
  const player = vulnerable(far.field);
  const was = unharmed(player);

  killEnemy(far.field, far.bomber, true);
  assert.equal(player.hull, was.hull, 'a blast that did not reach it did not touch it');

  // A dash through one is free in the same way a dash through a shot is free.
  const dashing = parked(8, SHIP.x + 40, SHIP.y);
  dashing.field.player.dashLeft = 5;
  const dasher = unharmed(dashing.field.player);
  killEnemy(dashing.field, dashing.bomber, true);
  assert.equal(dasher.hull, dashing.field.player.hull, 'invulnerable means the blast missed');
});

test('a blast stops the run for a moment, and stops there', () => {
  const { field, bomber } = parked(9, 1500, 1000);
  const itsOwn = STATS.death.particles + STATS.death.debris;    // the wreck every kind makes

  killEnemy(field, bomber, true);

  assert.equal(field.freeze, B.hitStop, 'hit-stop, PLAN section 4');
  assert.equal(field.shake, 0,
    'and no trauma: a bomber is a routine death and the window is only moved for a boss');
  assert.equal(field.particles.count, itsOwn + B.flash.count,
    'the corpse sprays its own mess and the blast adds its flash on top: ' + field.particles.count);
  assert.equal(field.rings.count, 2, 'one shockwave for the death and one for the blast');
});

// --- who did it -------------------------------------------------------------

test('a blast the player lit pays the player for everything it kills', () => {
  const { field, bomber } = parked(10, 1500, 1000);
  const victim = standing(field, 'drifter', 1500, 1040);

  killEnemy(field, bomber, true);

  assert.equal(field.enemies.length, 0, 'both of them are gone');
  assert.equal(field.kills, 2, 'the bomber and its neighbour');
  assert.equal(field.score, STATS.score + BALANCE.kinds.drifter.score,
    'and the score is the two of them, not just the one that was shot');
  assert.ok(victim.hp <= 0);
});

test('a blast nobody lit is nobody profit', () => {
  const { field, bomber } = parked(11, 1500, 1000);
  standing(field, 'drifter', 1500, 1040);

  killEnemy(field, bomber, false);

  assert.equal(field.enemies.length, 0, 'the dying still happens...');
  assert.equal(field.kills, 0, '...but a chain reaction nobody started is worth nothing');
  assert.equal(field.score, 0);
});

test('one blast does not set off another bomber; it only wounds it', () => {
  // `damage` is under a bomber's own hull on purpose. A knot of bombers is
  // therefore something to pick apart - the second one survives the first with 1
  // hull left, which makes it critical, which means it comes at you. That is a
  // better problem to hand a player than a chain that clears the screen by luck.
  const { field, bomber } = parked(12, 1500, 1000);
  const neighbour = standing(field, 'bomber', 1500, 1060);
  assert.ok(B.damage < STATS.hull, 'the blast does ' + B.damage + ' to a hull of ' + STATS.hull);

  killEnemy(field, bomber, true);

  assert.equal(field.enemies.length, 1, 'the neighbour is still standing');
  assert.equal(neighbour.hp, STATS.hull - B.damage);
  assert.equal(isCritical(neighbour), true, 'and it is on its way in a hurry now');
  assert.equal(field.kills, 1, 'one kill, one payout');
});

test('a chain reaction is paid to whoever lit it, and everything dies once', () => {
  const { field, bomber } = parked(13, 1500, 1000);
  const already = standing(field, 'bomber', 1500, 1060);
  already.hp = 1;                                   // wounded by somebody else's shot
  const between = standing(field, 'drifter', 1500, 1030);

  killEnemy(field, bomber, true);

  assert.equal(field.enemies.length, 0, 'the whole knot came apart');
  assert.ok(already.hp <= 0 && between.hp <= 0);
  assert.equal(field.kills, 3, 'each of them counted exactly once, the neighbour twice removed');
  assert.equal(field.score, STATS.score * 2 + BALANCE.kinds.drifter.score);
});

// --- the roster --------------------------------------------------------------

test('the roster keeps the bomber off the stage for its six minutes', () => {
  const field = scriptedRun(14);
  assert.equal(STATS.from, 360, 'PLAN 3.3 puts it at 6:00');

  const roll = (seconds) => {
    field.elapsed = seconds;
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      field.enemies.length = 0;
      if (spawnEnemy(field)) seen.add(field.enemies[0].type);
    }
    return seen;
  };

  assert.equal(roll(STATS.from - 1).has('bomber'), false, 'not one before its minute');
  const late = roll(STATS.from + 60);
  for (const kind of ['drifter', 'weaver', 'tank', 'darter', 'spitter', 'bomber']) {
    assert.ok(late.has(kind), 'afterwards a ' + kind + ' shows up');
  }
});

test('a shot that finishes a bomber detonates in the middle of a live step', () => {
  // The blast happens inside `updateBullets`, part way through a step, with the
  // collision grid already built and holding bodies that are about to stop existing.
  // This is that step, played for real rather than called by hand.
  const field = scriptedRun(15);
  const bomber = enemyAt('bomber', SHIP.x, SHIP.y - 200);
  const neighbour = enemyAt('drifter', SHIP.x, SHIP.y - 160);
  const shot = bulletFlyingToward(SHIP.x, SHIP.y - 210, 0, 620);
  shot.dmg = STATS.hull;                  // one shot, however big the target is

  const stepped = stepTheWorld();

  assert.equal(stepped, true, 'the step survived it');
  assert.equal(field.enemies.length, 0, 'both of them went');
  assert.equal(field.kills, 2);
  assert.ok(bomber.hp <= 0 && neighbour.hp <= 0);

  // And the world still works afterwards: the grid spent the rest of that step
  // holding a crowd that no longer exists, and the next two rebuild it.
  stepTheWorld();
  stepTheWorld();
  assert.equal(field.state, STATE.PLAY, 'and the run is still being played');
});

test('a bomber is not the dearest thing the director can buy', () => {
  // The lockstep with the wave director: `cost` is what one of them is worth out of
  // the run's spawn budget. test/waves.test.mjs proves every kind fits in the
  // smallest wave; this is the half that says a late kind did not quietly become the
  // most expensive thing in the arena, which is how a mix turns into one kind.
  const dearest = Math.max(...Object.values(BALANCE.kinds).map((kind) => kind.cost));
  assert.equal(STATS.cost < dearest, true,
    'a tank costs ' + dearest + ' and is still the dearest arrival');
  assert.ok(STATS.score > BALANCE.kinds.spitter.score,
    'and it is worth more than a spitter, being later and rarer');
});
