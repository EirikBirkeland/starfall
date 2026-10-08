// The particle system (PLAN section 4): three shapes on one pool - sparks, chunks
// of wreckage, and the wake off the engines - and the promise that none of it can
// move a run.
//
// The shapes are checked by what they do, not by what they are called: a chunk
// tumbles and coasts where a spark stops dead, a bigger wreck throws more chunks,
// the wake appears when the engines are lit and not otherwise. The last test is the
// one the whole file is built on: burn thousands of numbers off the effects stream
// and the run comes out identical, because `game/effects.js` asks that stream and
// nothing else for its sprinkle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedRun, enemyAt, flyFor, stepTheWorld } from '../tools/headless/scripted.js';
import { BALANCE } from '../src/game/balance.js';
import { DEBRIS, SMOKE, SPARK, burst, engineTrail, wreck } from '../src/game/effects.js';
import { killEnemy } from '../src/game/enemies.js';
import { fx } from '../src/core/rng.js';
import { shotsPerSecond } from '../src/game/weapons.js';

const SHAPES = [SPARK, DEBRIS, SMOKE];
const STEP = 1 / 120;

const ofShape = (field, shape) => field.particles.items.filter((p) => p.shape === shape);
const chips = (field) => ofShape(field, DEBRIS);
const puffs = (field) => ofShape(field, SMOKE);
const sparks = (field) => ofShape(field, SPARK);

/** How far a particle has got from the point it was born at. */
const travelled = (p) => Math.hypot(p.x - 400, p.y - 400);

/** `seconds` of the game's own step, with no controls held. */
function idle(field, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepTheWorld({});
}

/** Kill one of `type`, optionally with a different body, and report the mess. */
function messFrom(type, bodyRadius) {
  const field = scriptedRun(5);
  const foe = enemyAt(type, 500, 500);
  if (bodyRadius !== undefined) foe.r = bodyRadius;
  const before = chips(field).length;
  killEnemy(field, foe, false);
  return {
    chips: chips(field).length - before,
    sparks: sparks(field).length,
  };
}

test('a death throws sparks and chunks of the thing that died', () => {
  const field = scriptedRun(1);
  killEnemy(field, enemyAt('drifter', 500, 500), false);

  assert.ok(sparks(field).length > 8, 'sparks: ' + sparks(field).length);
  assert.ok(chips(field).length > 0, 'and it left chunks of itself behind');
});

test('the bigger the wreck, the more chunks it leaves', () => {
  const weaver = messFrom('weaver');
  const drifter = messFrom('drifter');
  const tank = messFrom('tank');

  assert.ok(tank.chips > drifter.chips && drifter.chips > weaver.chips,
    'chunks went weaver ' + weaver.chips + ', drifter ' + drifter.chips + ', tank ' + tank.chips);
  assert.ok(tank.sparks > drifter.sparks && drifter.sparks > weaver.sparks,
    'and the same for the sparks');
});

test('a small body makes a small mess, whatever kind it is', () => {
  // What a hatchling is: its parent's kind with its parent's smaller body.
  const whole = messFrom('tank');
  const hatchling = messFrom('tank', 12);
  assert.ok(hatchling.chips < whole.chips,
    'a 12 px tank threw ' + hatchling.chips + ' chunks, as many as the 26 px one');
  assert.ok(hatchling.chips > 0, 'a small wreck still leaves something');
});

test('a chunk tumbles and coasts, where a spark stops dead', () => {
  const field = scriptedRun(7);
  wreck(field, 400, 400, '#ffffff', 1, 100, 30);
  burst(field, 400, 400, '#ffffff', 1, 100, 30);
  const chip = chips(field)[0];
  const spark = sparks(field)[0];
  assert.equal(spark.spin, 0, 'a spark has nothing to tumble it');

  // The same shove for both, so whatever separates them at the end is their drag.
  for (const p of [chip, spark]) {
    p.x = 400; p.y = 400; p.px = 400; p.py = 400;
    p.vx = 180; p.vy = 0;
  }
  const spun = chip.rot;
  idle(field, 2);

  assert.notEqual(chip.rot, spun, 'a chunk turns over as it flies');
  const chipRun = travelled(chip);
  const sparkRun = travelled(spark);
  assert.ok(chipRun > sparkRun * 1.15,
    'a chunk coasted ' + chipRun.toFixed(1) + ' px against a spark\'s ' + sparkRun.toFixed(1));
});

test('the wake appears while the engines are lit', () => {
  const field = scriptedRun(9);
  assert.equal(puffs(field).length, 0, 'nothing at rest');

  const spawned = field.particles.spawned;
  flyFor(1, { moveX: 1, moving: true });
  const perSecond = field.particles.spawned - spawned;
  const rate = BALANCE.player.exhaust.rate;

  assert.ok(puffs(field).length > 2, 'there should be a wake behind a moving ship');
  assert.ok(perSecond > rate * 0.7 && perSecond < rate * 1.3,
    'the engines dropped ' + perSecond + ' puffs in a second, the rate is ' + rate);
});

test('a ship that is not being driven trails nothing', () => {
  const field = scriptedRun(11);
  flyFor(1, {});
  assert.equal(puffs(field).length, 0, 'a drifting ship has its engines off');
});

test('a dash leaves no wake; it has its own streak', () => {
  const field = scriptedRun(13);
  const before = field.particles.spawned;
  flyFor(0.5, { dash: true });
  assert.equal(puffs(field).length, 0, 'the dash threw puffs as well as sparks');
  assert.ok(field.particles.spawned > before, 'and it did throw sparks');
});

test('a puff is born holding part of the ship along with its own shove', () => {
  const field = scriptedRun(15);
  const ship = field.player;
  const spec = BALANCE.player.exhaust;
  ship.thrust = 1;
  ship.angle = 0;                       // pointing along +x, so the nozzles fire along -x

  /** The average vx of a fresh stream of puffs from a ship moving at `shipVx`. */
  const meanVx = (shipVx) => {
    field.particles.clear();
    ship.vx = shipVx;
    for (let i = 0; i < 40; i++) engineTrail(field, ship, 1 / spec.rate);
    const list = puffs(field);
    assert.ok(list.length > 30, 'the engines should be dropping a steady stream: ' + list.length);
    return list.reduce((sum, p) => sum + p.vx, 0) / list.length;
  };

  const parked = meanVx(0);
  const running = meanVx(200);
  assert.ok(parked < 0 && running < 0, 'every puff goes backwards out of the nozzles');
  const carry = running - parked;
  const want = 200 * spec.inherit;
  assert.ok(Math.abs(carry - want) < want * 0.3,
    'a puff carried ' + carry.toFixed(1) + ' px/s of the ship it came off, expected about ' + want.toFixed(1));
});

test('every live particle has every field written', () => {
  // A recycled object must never carry a leftover, so every spawner writes all of
  // it. Play long enough to have used each shape, then look at everything alive.
  const field = scriptedRun(17);
  enemyAt('tank', 480, 200);
  flyFor(1, { moveX: 1, moveY: -1, moving: true, dash: true, firing: true });
  for (const foe of field.enemies.slice()) killEnemy(field, foe, false);
  wreck(field, 400, 400, '#ffffff', 6, 200, 1);
  burst(field, 400, 400, '#ffffff', 6, 200, 1);
  stepTheWorld({ moveX: 1, moving: true });

  assert.ok(field.particles.count > 20, 'the exercise should have left things alive');
  const numbers = ['x', 'y', 'px', 'py', 'vx', 'vy', 'life', 'max', 'size', 'rot', 'spin'];
  const seen = new Set();
  for (const p of field.particles.items) {
    seen.add(p.shape);
    assert.ok(SHAPES.includes(p.shape), 'a particle of shape "' + p.shape + '"');
    assert.equal(typeof p.color, 'string', 'a particle with no colour');
    for (const key of numbers) {
      assert.ok(Number.isFinite(p[key]), p.shape + '.' + key + ' is ' + p[key]);
    }
    assert.ok(p.life > 0 && p.life <= p.max, p.shape + ' lives ' + p.life + ' of ' + p.max);
  }
  assert.equal(seen.size, SHAPES.length, 'the exercise only made ' + [...seen].join(', '));
});

test('a spray runs out, and the pool takes every one of them back', () => {
  const field = scriptedRun(23);
  burst(field, 400, 400, '#ffffff', 8, 200, 0.5);
  // Known lives, so "some have gone, then none are left" is arithmetic and not luck.
  field.particles.items.forEach((p, i) => { p.life = 0.02 * (i + 1); });

  idle(field, 0.07);
  assert.ok(field.particles.count < 8, 'the spray did not thin out');
  assert.ok(field.particles.count > 0, 'the spray went out all at once');

  idle(field, 0.2);
  assert.equal(field.particles.count, 0, 'a spray that never ends');
  assert.ok(field.particles.stats().free >= 8, 'the drawer kept none of them');
});

test('how thickly the sparks are thrown cannot move the run', () => {
  // The reason `fx` sits next to `logic` in core/rng.js: a spray is decoration, so
  // its numbers come from a stream a run may not read. Whatever that stream has
  // been through, the same seed plays the same run.
  const clean = playScriptedSeed(21, 0);
  const drained = playScriptedSeed(21, 5000);
  assert.ok(clean.kills > 0, 'the exercise has to kill something to mean anything');
  assert.deepEqual(drained, clean);
});

/**
 * A few seconds of a scripted run with shots flying and enemies dying, boiled down
 * to everything a player could tell apart. `burn` numbers are thrown away off the
 * effects stream first, which is what a thicker or a thinner spray would do.
 */
function playScriptedSeed(seed, burn) {
  const field = scriptedRun(seed);
  for (let i = 0; i < burn; i++) fx.next();

  enemyAt('drifter', 1500, 1400);
  enemyAt('drifter', 1500, 1300);
  enemyAt('weaver', 1500, 1200, 1);
  flyFor(2, { firing: true });

  return {
    score: field.score,
    kills: field.kills,
    xp: field.xp,
    t: field.elapsed,
    ship: [field.player.x, field.player.y, field.player.vx, field.player.vy],
    enemies: field.enemies.map((e) => [e.type, e.x, e.y, e.hp]),
    shards: field.shards.count,
    fireRate: shotsPerSecond(field),
  };
}
