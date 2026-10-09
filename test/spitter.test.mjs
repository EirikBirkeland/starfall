// The spitter (PLAN 3.3) and the shots it fires: the first enemy that attacks from a
// distance, and the first thing in the game that can hurt you without touching you.
//
// Two promises are measured here. One is the spitter's: it keeps its distance, and it
// tells you a shot is coming by standing still with its mouth pointed at you - and the
// shot then goes the way it was pointing when it *stopped*, never the way it points
// when the shot leaves. The other belongs to the shots themselves: they fly, they
// despawn at the edge of the world or at the end of their life, one costs one hull, and
// a ship that cannot be hurt right now is let through rather than billed twice. A boss's
// shots are in it too, for the one way they are different: they stop at its cage.
//
// Seconds are what is measured, on the scripted world at the game's own step, as in
// test/darter.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { closeField } from '../src/game/field.js';
import { enemyShotAt } from '../src/game/enemyshots.js';
import { makeEnemy } from '../src/game/kinds.js';
import { spawnEnemy } from '../src/game/waves.js';
import { resetRun } from '../src/game/run.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const ARENA = BALANCE.arena;
const SPIT = BALANCE.kinds.spitter.spit;
const BAND = (SPIT.range.near + SPIT.range.far) / 2;   // the middle of the band it likes
const SHIP = { x: ARENA.w / 2, y: ARENA.h / 2 };
const CYCLE = SPIT.wind.time + SPIT.after;            // one spit, and the wait for the next

function stepsIn(seconds) {
  return Math.round(seconds / STEP);
}

function closeTo(actual, want, tolerance, what) {
  assert.ok(Math.abs(actual - want) <= tolerance,
    what + ': got ' + actual + ', wanted ' + want + ' (plus or minus ' + tolerance + ')');
}

/** A run with one spitter in it and the ship wherever the test wants it. */
function spaced(seed, x, y, shipAt) {
  const field = scriptedRun(seed);
  if (shipAt) {
    field.player.x = shipAt.x;
    field.player.y = shipAt.y;
  }
  const spitter = makeEnemy(field, 'spitter', x, y);
  field.enemies.push(spitter);
  return { field, spitter };
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function walk(seconds) {
  for (let i = 0; i < stepsIn(seconds); i++) stepTheWorld();
}

/**
 * Step while `notYet` holds. The cap is there so that a spitter that never does the
 * thing fails a test instead of hanging the machine.
 */
function walkUntil(notYet, capSeconds, what) {
  let seconds = 0;
  while (notYet() && seconds < capSeconds) {
    stepTheWorld();
    seconds += STEP;
  }
  assert.ok(!notYet(), 'it never happened: ' + what);
  return seconds;
}

/**
 * Step for `seconds` and answer how many shots left the spitter. A shot is counted on
 * the step the pool grows, because by the end of the window the early ones have flown
 * out and expired.
 */
function spitsIn(field, seconds) {
  let fired = 0;
  let live = field.enemyShots.count;
  for (let i = 0; i < stepsIn(seconds); i++) {
    stepTheWorld();
    if (field.enemyShots.count > live) fired++;
    live = field.enemyShots.count;
  }
  return fired;
}

/** Like spitsIn, but answers *when* each shot went out, in run seconds. */
function spitTimes(field, seconds) {
  const times = [];
  let live = field.enemyShots.count;
  for (let i = 0; i < stepsIn(seconds); i++) {
    stepTheWorld();
    if (field.enemyShots.count > live) times.push(field.elapsed);
    live = field.enemyShots.count;
  }
  return times;
}

test('it walks in from across the arena and stops at the edge of its band', () => {
  const { field, spitter } = spaced(1, SHIP.x, SHIP.y - 700);

  walk(8);

  const now = distanceBetween(spitter, field.player);
  assert.ok(now <= SPIT.range.far + 5 && now >= SPIT.range.near,
    'it settled ' + now.toFixed(0) + ' px out, in the band '
    + SPIT.range.near + '-' + SPIT.range.far);
});

test('it gives ground when you crowd it', () => {
  const { field, spitter } = spaced(2, SHIP.x + 120, SHIP.y);

  const was = distanceBetween(spitter, field.player);
  walk(4);
  const now = distanceBetween(spitter, field.player);

  assert.ok(now > was + 40, 'it came from ' + was.toFixed(0) + ' px to ' + now.toFixed(0) + ' px away');
  assert.ok(now <= SPIT.range.far + 40, 'and did not run away to the next county');
});

test('it will not start at something it cannot reach', () => {
  const { field } = spaced(3, SHIP.x, SHIP.y - 900);

  const fired = spitsIn(field, 6);

  assert.equal(fired, 0, 'not one shot across an arena it has not walked yet');
});

test('it spits once a cycle, and the cycle is what its numbers say', () => {
  const { field } = spaced(4, SHIP.x, SHIP.y - BAND);

  const times = spitTimes(field, 9);

  assert.ok(times.length >= 4, 'it spat ' + times.length + ' times in nine seconds');
  for (let i = 1; i < times.length; i++) {
    closeTo(times[i] - times[i - 1], CYCLE, 0.3,
      'spit ' + (i + 1) + ' came ' + (times[i] - times[i - 1]).toFixed(2) + ' s after the last one');
  }
});

test('it stops dead to spit', () => {
  const { field, spitter } = spaced(14, SHIP.x, SHIP.y - BAND);
  walkUntil(() => spitter.stage !== 'spit', 5, 'the spitter took a spit position');

  const x = spitter.x;
  const y = spitter.y;
  walk(SPIT.wind.time * 0.6);

  assert.equal(spitter.stage, 'spit', 'still winding up');
  assert.equal(spitter.x, x, 'a spitter mid-wind-up does not drift forward');
  assert.equal(spitter.y, y);
});

test('the shot goes the way it was pointing when it stopped, not the way it points now', () => {
  // Diagonal on purpose: on an axis one component is nil, and a shot that ignored
  // half of its own direction would look exactly the same.
  const { field, spitter } = spaced(5, SHIP.x + 220, SHIP.y - 240);
  walkUntil(() => spitter.stage !== 'spit', 8, 'the spitter took a spit position');

  const locked = { x: spitter.dirX, y: spitter.dirY };

  // The ship leaves. The shot on its way does not follow it.
  field.player.x = SHIP.x - 800;
  field.player.y = SHIP.y;
  walkUntil(() => field.enemyShots.count === 0, 5, 'a shot left the spitter');

  const shot = field.enemyShots.items[0];
  const speed = Math.hypot(shot.vx, shot.vy);
  closeTo(speed, SPIT.shot.speed, 1e-9, 'the shot flies at the speed its kind was given');
  closeTo(shot.vx / speed, locked.x, 1e-9, 'and along the line locked before the wind-up began');
  closeTo(shot.vy / speed, locked.y, 1e-9, 'the whole line, in fact');
  assert.ok(Math.hypot(shot.x - spitter.x, shot.y - spitter.y) >= spitter.r - 1e-9,
    'it left from the rim of its mouth, not from its middle');
});

test('a shot that reaches the ship costs one hull and is spent', () => {
  const { field, spitter } = spaced(6, SHIP.x + 300, SHIP.y);
  field.player.invuln = 0;
  const hull = field.player.hull;

  walkUntil(() => field.enemyShots.count === 0, 5, 'a shot was fired');
  walkUntil(() => field.player.hull === hull, 3, 'the shot landed');

  assert.equal(field.player.hull, hull - 1, 'one shot, one hull');
  assert.equal(field.enemyShots.count, 0, 'and the shot is gone');
  assert.ok(field.player.invuln > 0, 'and the grace after a hit began');
  assert.ok(spitter.hp > 0, 'nothing about that hurt the spitter');
  assert.equal(field.tally.hurtBy['shot:spitter'], 1,
    'and the run\'s sheet knows whose spit it was (game/tally.js)');
});

test('the grace after a hit lets a shot through instead of billing it twice', () => {
  const { field } = spaced(7, SHIP.x + 260, SHIP.y);
  field.player.invuln = 0;
  const hull = field.player.hull;

  walkUntil(() => field.player.hull === hull, 6, 'the first shot landed');
  assert.ok(field.player.invuln > 0, 'the ship is blinking');

  const second = makeEnemy(field, 'spitter', field.player.x + 90, field.player.y);
  field.enemies.push(second);
  walk(1);

  const crossed = field.enemyShots.items.some((s) => s.x < field.player.x);
  assert.ok(crossed, 'the second one fired and flew straight across the blinking ship');
  assert.equal(field.player.hull, hull - 1, 'and not one hull of it was charged');
});

test('it is the ship you can see that gets hit, not the one you steer', () => {
  const { field } = spaced(8, SHIP.x, SHIP.y - 500);
  field.player.invuln = 0;
  const shot = enemyShotAt(field, SHIP.x - 200, SHIP.y + 26, 1, 0, SPIT.shot);
  const hull = field.player.hull;

  walk(1);

  assert.ok(shot.life > 0, 'the shot is still in the air');
  assert.ok(shot.x > SHIP.x, 'and it has gone past where the ship is');
  assert.equal(field.player.hull, hull,
    'a shot 26 px past the ship missed it: the shot is ' + SPIT.shot.radius
    + ' px and the ship is ' + BALANCE.player.hitRadius + ' px across the middle');
});

test('a shot ends at the edge of the world, and at the end of its life', () => {
  const field = scriptedRun(9);
  const margin = BALANCE.enemyShots.despawnMargin;

  const atTheEdge = enemyShotAt(field, ARENA.w - 30, SHIP.y, 1, 0, SPIT.shot);
  walk((margin + 30) / SPIT.shot.speed + 0.1);
  assert.ok(atTheEdge.life > 0, 'it still had its life left, so this one was the wall');
  assert.equal(field.enemyShots.count, 0, 'and the edge of the arena took it');

  const shortLived = enemyShotAt(field, SHIP.x, SHIP.y - 900, 0, -1, {
    speed: 4, radius: 4, life: 0.2, color: SPIT.shot.color,
  });
  walk(0.3);
  assert.ok(shortLived.life <= 0, 'this one ran out of life');
  assert.equal(field.enemyShots.count, 0, 'and went');
});

test('a shot the room owns stops at its own wall', () => {
  // game/enemyshots.js `caged`: a boss fights you inside a cage it shut round the duel
  // (game/field.js), and the shots it aims at you belong to that room, so the room is what stops
  // them. A spitter's spit is not caged and keeps the arena-wide rule the test above owns - the
  // crowd was never shut in with you, and neither was what it throws.
  const field = scriptedRun(11);
  closeField(field, { x0: 300, y0: 200, x1: 900, y1: 700 });

  const caged = enemyShotAt(field, 850, 300, 1, 0,
    { speed: 200, radius: 5, life: 30, color: '#ffffff', caged: true }, 'warden');
  const loose = enemyShotAt(field, 850, 340, 1, 0,
    { speed: 200, radius: 5, life: 30, color: '#ffffff' }, 'spitter');
  const hull = field.player.hull;

  // 0.4 s at 200 px/s is 80 px: ten past the cage's east wall and a long way inside the arena's.
  walk(0.4);
  assert.ok(caged.life > 0, 'it had its whole life left, so this one was the wall');
  assert.equal(field.enemyShots.count, 1, 'the caged shot outlived the wall it was fired at');
  assert.ok(loose.life > 0, 'and an ordinary shot flew through the same wall, as it should');
  assert.equal(field.player.hull, hull, 'nothing reached the ship on the way out');
});

test('a restart clears the air', () => {
  const { field } = spaced(10, SHIP.x + 300, SHIP.y);
  enemyShotAt(field, SHIP.x + 100, SHIP.y, -1, 0, SPIT.shot);
  assert.ok(field.enemyShots.count > 0);

  resetRun(field);

  assert.equal(field.enemyShots.count, 0, 'nothing was left flying from the last run');
});

test('it cannot back its way out of the world', () => {
  const wall = ARENA.w;
  // The ship is between the spitter and the wall, and close enough that backing away
  // from it means backing into the wall.
  const { field, spitter } = spaced(11, wall - 100, SHIP.y, { x: wall - 160, y: SHIP.y });

  walk(6);

  assert.ok(spitter.x <= wall - spitter.r + 1e-9,
    'it walked out of the arena instead of stopping at the wall (x = ' + spitter.x.toFixed(1) + ')');
  assert.ok(spitter.x > wall - spitter.r - 1,
    'and it stayed pinned where the wall stopped it, rather than wandering off');
  assert.ok(spitter.hp > 0, 'still here, still spitting at a ship in the corner');
});

test('the roster keeps the spitter off the stage for its three minutes', () => {
  const field = scriptedRun(12);
  const spitterFrom = BALANCE.kinds.spitter.from;
  assert.equal(spitterFrom, 180, 'PLAN 3.3 puts it at 3:00');

  const roll = (seconds) => {
    field.elapsed = seconds;
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      field.enemies.length = 0;
      if (spawnEnemy(field)) seen.add(field.enemies[0].type);
    }
    return seen;
  };

  assert.equal(roll(spitterFrom - 1).has('spitter'), false, 'not one before its minute');
  const late = roll(spitterFrom + 60);
  for (const kind of ['drifter', 'weaver', 'tank', 'darter', 'spitter']) {
    assert.ok(late.has(kind), 'afterwards a ' + kind + ' shows up');
  }
});

test('there is time to decide about a shot', () => {
  // The warning is the wind-up, and then the shot has to cross the gap that was left.
  // Measured from the closest distance the spitter likes to hold.
  const fromTheNearEdge = SPIT.wind.time + SPIT.range.near / SPIT.shot.speed;
  assert.ok(SPIT.wind.time >= 0.4, 'the mouth is lit for ' + SPIT.wind.time + ' s before anything leaves it');
  assert.ok(fromTheNearEdge >= 1, 'a shot from its nearest adds up to ' + fromTheNearEdge.toFixed(2) + ' s of warning');
  assert.ok(SPIT.shot.speed < BALANCE.ships.wisp.maxSpeed,
    'and a shot is slower than a ship that knows which way to go');
});

test('a spitter is a kind like any other: its numbers, its walk, its shots', () => {
  const { field, spitter } = spaced(13, SHIP.x, SHIP.y - BAND);

  assert.equal(spitter.kind.stats, BALANCE.kinds.spitter);
  assert.equal(spitter.speed, BALANCE.kinds.spitter.speed);
  assert.equal(spitter.hp, BALANCE.kinds.spitter.hull);

  walkUntil(() => field.enemyShots.count === 0, 5, 'a shot was spit');
  const shot = field.enemyShots.items[0];
  assert.equal(shot.r, SPIT.shot.radius, 'the shot is as big as its kind says');
  assert.equal(shot.color, SPIT.shot.color, 'and warm, because it can hurt you');
});
