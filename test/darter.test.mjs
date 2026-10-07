// The darter (PLAN 3.3): the enemy that shows you the line it is going to come
// down, and then comes down it faster than you can run.
//
// Everything here is about the four beats of the hunt and the one promise it makes:
// that the warning line the renderer draws is the way the enemy actually goes, and
// as long as the lunge actually is. The line is painted out of `isAiming`,
// `aimProgress` and `lungeReach`, so those are measured here rather than guessed at
// from the other side of the canvas (test/telegraph.test.mjs covers the painting).
//
// As in test/kinds.test.mjs, seconds are what is being measured, and the world is
// stepped at the game's own fixed step to measure them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { TAU } from '../src/core/math.js';
import { aimProgress, isAiming, isLunging, lungeReach, makeEnemy } from '../src/game/kinds.js';
import { killEnemy, spawnEnemy } from '../src/game/enemies.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const STEP = BALANCE.sim.step;
const HUNT = BALANCE.kinds.darter.hunt;
const ARENA = BALANCE.arena;
const SHIP = { x: ARENA.w / 2, y: ARENA.h / 2 };   // where a fresh run puts the ship

function stepsIn(seconds) {
  return Math.round(seconds / STEP);
}

function walk(seconds) {
  for (let i = 0; i < stepsIn(seconds); i++) stepTheWorld();
}

function closeTo(actual, want, tolerance, what) {
  assert.ok(Math.abs(actual - want) <= tolerance,
    what + ': got ' + actual + ', wanted ' + want + ' (plus or minus ' + tolerance + ')');
}

function angleDifference(a, b) {
  let diff = (a - b) % TAU;
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  return diff;
}

/** A run with one darter in it, optionally with the ship moved somewhere else. */
function hunted(seed, x, y, shipAt) {
  const field = scriptedRun(seed);
  if (shipAt) {
    field.player.x = shipAt.x;
    field.player.y = shipAt.y;
  }
  const darter = makeEnemy(field, 'darter', x, y);
  field.enemies.push(darter);
  return { field, darter };
}

/**
 * Step while the hunt is in one of `beats`, and say how long it stayed there. The
 * cap is there so that a hunt that wedges itself fails a test instead of hanging
 * the machine.
 */
function whileBeat(darter, beats, capSeconds) {
  let seconds = 0;
  while (beats.indexOf(darter.stage) >= 0 && seconds < capSeconds) {
    stepTheWorld();
    seconds += STEP;
  }
  assert.ok(seconds < capSeconds, 'the hunt never left ' + (darter.stage || 'the walk'));
  return seconds;
}

/** Step out of the beat it is in now, and say how long that beat lasted. */
function throughBeat(darter, capSeconds) {
  return whileBeat(darter, [darter.stage], capSeconds);
}

test('a darter walks at the ship from far away and does not lunge out of nowhere', () => {
  const { darter } = hunted(1, SHIP.x, SHIP.y - 900);   // well past `commit`

  walk(2);

  assert.equal(darter.stage, '', 'it never decided to aim');
  assert.equal(isAiming(darter), false);
  assert.equal(isLunging(darter), false);
  const came = darter.y - (SHIP.y - 900);
  closeTo(came, darter.speed * 2, darter.speed * 0.2, 'it walked at the ship for two seconds');
});

test('it stops to take aim the moment you are close enough', () => {
  const { darter } = hunted(2, SHIP.x, SHIP.y - 300);

  stepTheWorld();

  assert.equal(darter.stage, 'aim', 'it should have committed at once');
  const line = Math.atan2(darter.dirY, darter.dirX);
  const atTheShip = Math.atan2(SHIP.y - darter.y, SHIP.x - darter.x);
  closeTo(angleDifference(line, atTheShip), 0, 0.02, 'the line it locked is the way to the ship');
});

test('the aim lasts exactly as long as its numbers say', () => {
  const { darter } = hunted(3, SHIP.x, SHIP.y - 300);
  stepTheWorld();
  assert.equal(darter.stage, 'aim');

  const held = throughBeat(darter, 5);
  assert.equal(darter.stage, 'lunge');
  closeTo(held, HUNT.aim.time, STEP, 'the aim held');
});

test('the telegraph counts down out of the number the hunt keeps', () => {
  const { darter } = hunted(4, SHIP.x, SHIP.y - 300);
  stepTheWorld();

  let previous = -1;
  for (let i = 0; i < stepsIn(HUNT.aim.time); i++) {
    const progress = aimProgress(darter);
    assert.ok(progress >= 0 && progress <= 1, 'the countdown stays a fraction');
    assert.ok(progress >= previous, 'and only ever runs forward');
    previous = progress;
    stepTheWorld();
  }
  assert.ok(previous > 0.98, 'it reached the end of its countdown: ' + previous);
});

test('it holds still while it aims, and brings its nose onto the line', () => {
  const { darter } = hunted(5, SHIP.x, SHIP.y - 300);
  stepTheWorld();

  const x = darter.x;
  const y = darter.y;
  darter.rot = Math.PI;                 // pointing anywhere but at the ship
  walk(0.45);

  assert.equal(darter.stage, 'aim', 'still aiming');
  assert.equal(darter.x, x, 'a darter taking aim does not drift forward');
  assert.equal(darter.y, y);
  closeTo(angleDifference(darter.rot, Math.atan2(darter.dirY, darter.dirX)), 0, 0.01,
    'its nose is on the line it locked');
});

test('the lunge is the line it showed you, and exactly as long as the line', () => {
  const { field, darter } = hunted(6, SHIP.x, SHIP.y - 400);
  stepTheWorld();
  assert.equal(darter.stage, 'aim');

  const dirX = darter.dirX;
  const dirY = darter.dirY;
  const from = { x: darter.x, y: darter.y };
  const reach = lungeReach(darter);

  // The ship runs for the far corner of the arena while the darter holds its aim.
  // The line it was shown does not move with it: a darter that changed its mind
  // halfway would make the telegraph a threat instead of a warning.
  field.player.x = 2700;
  field.player.y = 2700;
  whileBeat(darter, ['aim', 'lunge'], 5);

  const dx = darter.x - from.x;
  const dy = darter.y - from.y;
  const length = Math.hypot(dx, dy);
  closeTo(length, reach, darter.speed * HUNT.lunge.mul * STEP * 1.5,
    'the lunge covered exactly the reach the line drew');
  assert.equal(isLunging(darter), false, 'and then it was over');

  const along = dx * dirX + dy * dirY;
  assert.ok(along > length * 0.999,
    'it went down the locked line, not after the ship that ran away');
});

test('a lunge that reaches the wall ends there', () => {
  const startX = ARENA.w - 120;
  const { darter } = hunted(7, startX, SHIP.y, { x: ARENA.w - 40, y: SHIP.y });
  stepTheWorld();
  assert.equal(darter.stage, 'aim');

  const reach = lungeReach(darter);
  assert.ok(reach > ARENA.w - 40 - startX, 'the wall is nearer than the lunge is long');

  whileBeat(darter, ['aim', 'lunge'], 5);

  assert.equal(darter.stage, 'rest', 'the arena ended the lunge for it');
  assert.ok(darter.x <= ARENA.w - darter.r + 1e-9, 'and it never left the arena');
  const toTheWall = darter.x - startX;
  assert.ok(toTheWall < reach * 0.9,
    'it stopped short of its reach, at ' + toTheWall.toFixed(0) + ' px of ' + reach.toFixed(0));
});

test('the hunt runs its beats in order, again and again', () => {
  const { darter } = hunted(8, SHIP.x, SHIP.y - 300);

  const timeline = [];
  let last = null;
  let lunges = 0;
  for (let i = 0; i < stepsIn(6); i++) {
    stepTheWorld();
    if (isLunging(darter) && last !== 'lunge') lunges++;
    if (darter.stage !== last) {
      timeline.push({ stage: darter.stage || 'hunt', at: (i + 1) * STEP });
      last = darter.stage;
    }
  }

  assert.deepEqual(timeline.slice(0, 4).map((t) => t.stage), ['aim', 'lunge', 'rest', 'hunt'],
    'the four beats, in order: ' + JSON.stringify(timeline.map((t) => t.stage)));

  const spanOf = (stage) => {
    const at = timeline.findIndex((t) => t.stage === stage);
    assert.ok(at >= 0 && timeline[at + 1], 'the timeline never got to ' + stage);
    return timeline[at + 1].at - timeline[at].at;
  };
  closeTo(spanOf('aim'), HUNT.aim.time, STEP, 'the aim held for');
  closeTo(spanOf('lunge'), HUNT.lunge.time, STEP, 'the lunge ran for');
  closeTo(spanOf('rest'), HUNT.rest.time, STEP, 'the rest lasted for');

  assert.equal(lunges, 3, 'one lunge per cycle, and the cycle is '
    + (HUNT.aim.time + HUNT.lunge.time + HUNT.rest.time + HUNT.beat).toFixed(2) + ' s');
});

test('coming out of a lunge it brings its nose back around to the ship', () => {
  const { darter } = hunted(9, SHIP.x, SHIP.y - 300);
  whileBeat(darter, ['', 'aim', 'lunge'], 5);
  assert.equal(darter.stage, 'rest');

  darter.rot = 3;                       // whatever way the lunge left it pointing
  stepTheWorld();

  const atTheShip = Math.atan2(SHIP.y - darter.y, SHIP.x - darter.x);
  closeTo(angleDifference(darter.rot, atTheShip), 0, 0.01,
    'the rest turns it back round, or the next aim starts from nowhere');
});

test('being hit does not put it off its aim', () => {
  const { darter } = hunted(10, SHIP.x + 300, SHIP.y - 100);
  stepTheWorld();
  assert.equal(darter.stage, 'aim');

  const line = { x: darter.dirX, y: darter.dirY };
  const x = darter.x;
  darter.hp -= 1;
  darter.flash = BALANCE.enemies.hitFlash;
  darter.ix = 260;                    // a bullet's kick, across the line

  walk(0.3);

  assert.equal(darter.stage, 'aim', 'a shot staggers it, it does not reset it');
  assert.equal(darter.dirX, line.x, 'and it cannot change its mind');
  assert.equal(darter.dirY, line.y);
  assert.ok(darter.x > x, 'the kick still moved it: ' + (darter.x - x).toFixed(1) + ' px');

  whileBeat(darter, ['aim', 'lunge'], 5);
  assert.equal(darter.dirX, line.x, 'the lunge went down the line it had already locked');
  assert.equal(darter.dirY, line.y);
});

test('a darter comes apart along its own axis', () => {
  const field = scriptedRun(11);
  const spec = BALANCE.kinds.darter;
  const jet = spec.death.jet;

  const darter = makeEnemy(field, 'darter', 900, 900);
  field.enemies.push(darter);
  const before = field.particles.count;
  killEnemy(field, darter, true);
  const mess = field.particles.count - before;

  // Its own burst, plus as many chunks as its body is worth - and then the jets,
  // which are the only thing this kind adds to a death.
  const itsOwn = spec.death.particles + spec.death.debris;
  assert.equal(mess - itsOwn, jet.count * 2,
    'a jet out of the nose and one out of the tail, and nothing else');
});

test('the mix does not send a darter before its time', () => {
  const field = scriptedRun(12);
  const darterFrom = BALANCE.enemies.mix.find((entry) => entry.type === 'darter').from;

  const roll = (seconds) => {
    field.elapsed = seconds;
    field.difficulty = 0.5;
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      field.enemies.length = 0;
      if (spawnEnemy(field)) seen.add(field.enemies[0].type);
    }
    return seen;
  };

  const early = roll(darterFrom - 1);
  assert.equal(early.has('darter'), false, 'nothing that lunges before ' + darterFrom + 's');
  assert.ok(early.has('drifter') && early.has('weaver') && early.has('tank'),
    'the kinds that were here before it still are');

  const late = roll(darterFrom + 30);
  for (const kind of ['drifter', 'weaver', 'tank', 'darter']) {
    assert.ok(late.has(kind), 'after ' + darterFrom + 's a ' + kind + ' shows up');
  }
});

test('a darter is a kind like any other: its numbers, its walk, its death', () => {
  const { field, darter } = hunted(13, SHIP.x, SHIP.y - 300);

  assert.equal(darter.kind.stats, BALANCE.kinds.darter);
  assert.equal(darter.r, BALANCE.kinds.darter.radius);
  assert.equal(darter.speed, BALANCE.kinds.darter.speed, 'at the start of a run nothing has scaled it');

  walk(1);
  assert.equal(field.enemies.length, 1, 'it is still the only thing out here');
  assert.ok(darter.y > SHIP.y - 300, 'and it came closer');
});
