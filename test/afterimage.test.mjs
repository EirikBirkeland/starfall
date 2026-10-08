// Afterimage (PLAN 3.5): "the dash leaves a decoy that enemies chase for 2 s".
//
// Ten things are measured here, in the order `game/afterimage.js` argues for itself:
//
//   the price - one image per rank, spread down the streak the dash covered, and rank 0 leaving
//     nothing at all rather than an image that does nothing;
//   what an image is - a place and not a body: it stands where the ship was, it never moves, it
//     is not in the crowd, nothing can shoot it and it cannot hurt the ship;
//   the reach - a body inside `bait` of an image chases it and a body outside it does not, and
//     that is the whole rule, held nowhere: a body that walks into an image's reach mid-life
//     starts chasing it and one the image loses track of goes back to the ship when it goes out;
//   the two seconds - an image is chased for `life` seconds, ± one step, and then every body in
//     the arena is looking at the ship again;
//   a chase is not a stun - a fooled body walks at full pace, and it is still a body: the crowd
//     still shoves it and the ship still hurts it;
//   a promise is not broken - a darter that has locked its line and a sniper whose lock has been
//     taken finish what they started whatever is standing next to them, because those walks read
//     the line they locked and not the quarry;
//   what the crowd throws goes where the ghost is - a fooled spitter spits at the image, which is
//     the shot that misses you;
//   and the whole roster - every kind in the game reads an image, including the one bolted to the
//     floor, which can only ever answer by turning its eye;
//   and the thing the card is for - a knot of bodies coming up behind you, measured a second and a
//     half after one dash away from them, with the line taken and with it not;
//   and the edges - a rank taken between two dashes is spent on the next one, and a new run does
//     not inherit the last one's ghosts.
//
// Everything runs in the scripted world on the game's own fixed step, with the wave director off
// and the XP ceiling out of reach, so no level-up can pause a measured window.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { TAU } from '../src/core/math.js';
import { KINDS, isAiming, isLocking, isLunging, isRooted } from '../src/game/kinds.js';
import { effectOf, imagesOf } from '../src/game/upgrades.js';
import { quarryFor } from '../src/game/afterimage.js';
import { scriptedRun, enemyAt, stepTheWorld, bulletFlyingToward } from '../tools/headless/scripted.js';
import { resetRun } from '../src/game/run.js';

const AI = BALANCE.upgrades.afterimage;
const DASH = BALANCE.player.dash;
const STEP = BALANCE.sim.step;
/** How far the ship covers in one step of a dash: the tolerance every position test below uses. */
const REACH_PER_STEP = DASH.distance / DASH.time * STEP;
const DASH_STEPS = Math.round(DASH.time / STEP);

/** A run that has taken `ranks` of the line, with nothing in it but what the test plants. */
function armed(seed, ranks) {
  const field = scriptedRun(seed);
  field.upgrades.afterimage = ranks;
  field.xpNeed = Infinity;
  // Unprotected, and with plenty of it: a few of these bodies do reach the ship, and a test that
  // is about where a crowd is walking must not be cut short by one of them ending the run.
  field.player.invuln = 0;
  field.player.hull = 99;
  return field;
}

/** A body that walks: `enemyAt` parks what it plants, and these tests are about walking. */
function bodyAt(field, type, x, y, speed) {
  const body = enemyAt(type, x, y);
  body.speed = speed === undefined ? 120 : speed;
  return body;
}

/** One dash north, and how many steps it took. */
function dashNorth(field) {
  const ship = field.player;
  stepTheWorld({ dash: true, aimX: ship.x, aimY: ship.y - 300 });
  for (let i = 0; i < DASH_STEPS; i++) stepTheWorld({});
}

/** The images standing in the arena, closest to where the dash began first. */
function images(field) {
  return field.afterimage.trail.items.slice();
}

function distanceTo(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Hold the world still for `seconds` of the game's own steps. */
function pass(field, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) stepTheWorld({});
}

test('PLAN is one decoy for two seconds, and a rank is one more decoy', () => {
  assert.equal(AI.life, 2, 'PLAN says 2 s and the code says 2 s');
  assert.equal(AI.ranks, 5);
  assert.equal(AI.step, 1, 'a rank is one whole image and not a share of one');
  assert.equal(effectOf('afterimage'), '+1 image left behind');

  const field = armed(1, 0);
  assert.equal(imagesOf(field), 0, 'rank 0 is no images at all');
  field.upgrades.afterimage = 4;
  assert.equal(imagesOf(field), 4);
});

test('a dash leaves one image per rank, spread down the streak it covered', () => {
  for (const ranks of [1, 2, 3, 5]) {
    const field = armed(2, ranks);
    const ship = field.player;
    const startX = ship.x;
    const startY = ship.y;

    dashNorth(field);
    const left = images(field);
    assert.equal(left.length, ranks, 'rank ' + ranks + ' left ' + left.length + ' images');

    const gap = DASH.distance / ranks;
    left.sort((a, b) => b.y - a.y);       // the dash went up, so the first one left is the lowest
    left.forEach((image, i) => {
      const travelled = startY - image.y;
      assert.ok(Math.abs(travelled - i * gap) <= REACH_PER_STEP + 1e-9,
        'image ' + i + ' came down at ' + travelled.toFixed(1) + ' px along a streak of '
        + (i * gap).toFixed(1) + ' (one step is ' + REACH_PER_STEP.toFixed(1) + ')');
      assert.equal(image.x, startX, 'the streak is the way the ship went and no other way');
      assert.ok(image.y > ship.drawR && image.y < field.arena.h - ship.drawR,
        'an image never stands outside the arena');
    });
    assert.ok(ship.y < left[0].y - REACH_PER_STEP,
      'the ship is still ahead of the last of them: an image is where it was, not where it is');
  }
});

test('a run that has not taken the line leaves nothing behind', () => {
  const field = armed(3, 0);
  dashNorth(field);
  assert.equal(images(field).length, 0);
  assert.equal(field.afterimage.left, 0, 'and nothing is even counted down');
});

test('an image stands where the ship was and never moves', () => {
  const field = armed(4, 2);
  dashNorth(field);
  const first = images(field).map((image) => ({ x: image.x, y: image.y, angle: image.angle }));
  pass(field, 1);
  const later = images(field);
  later.forEach((image, i) => {
    if (first[i] === undefined) return;      // a second trip of the same pool, which the ages tell
    assert.equal(image.x, first[i].x);
    assert.equal(image.y, first[i].y);
  });
  assert.ok(later.every((image) => Number.isFinite(image.age)), 'every image keeps its own clock');
});

test('an image is a place and not a body: nothing can shoot it', () => {
  const field = armed(5, 1);
  dashNorth(field);
  const image = images(field)[0];
  assert.equal(field.enemies.length, 0, 'the crowd is empty and yet something is standing there');
  assert.equal(field.enemies.includes(image), false);

  // A shot put straight through the middle of it, and nothing about either of them changes.
  const shot = bulletFlyingToward(image.x - 40, image.y, 900, 0, 0, 0);
  const life = shot.life;
  const before = images(field).length;
  pass(field, 0.05);
  assert.equal(images(field).length, before, 'the shot went through it and did not stop');
  assert.equal(shot.hits.length, 0, 'and it hit nothing, so it registered nothing');
  assert.ok(shot.life < life && shot.life > 0, 'the shot spent its own life and no more');
});

test('an image cannot hurt the ship', () => {
  const field = armed(6, 1);
  dashNorth(field);
  const image = images(field)[0];
  const ship = field.player;
  ship.x = image.x;
  ship.y = image.y;
  const hull = ship.hull;
  pass(field, 0.5);
  assert.equal(ship.hull, hull, 'the ship is standing on one and does not care');
  assert.equal(ship.invuln, 0, 'and nothing is pretending it was a hit');
});

test('a body next to an image chases it, and a body away from one does not', () => {
  const field = armed(7, 1);
  const ship = field.player;
  dashNorth(field);
  const image = images(field)[0];

  // One body standing on the image and one well out of its reach, both of them nowhere near the
  // ship, so the only thing either could be walking at is what they are looking at.
  const taken = bodyAt(field, 'drifter', image.x + 40, image.y + 30, 90);
  const clear = bodyAt(field, 'drifter', image.x - 400, image.y - 400, 90);
  const beforeTaken = distanceTo(taken, image);
  const beforeClear = distanceTo(clear, ship);

  pass(field, 0.5);

  assert.ok(distanceTo(taken, image) < beforeTaken,
    'the taken body walked at the image it was standing next to');
  assert.ok(distanceTo(clear, ship) < beforeClear,
    'and the one out of reach kept walking at the ship');
});

test('who chases what is worked out again every step, and nowhere remembered', () => {
  const field = armed(8, 1);
  const ship = field.player;
  dashNorth(field);
  const image = images(field)[0];

  // Walk a body into the image's reach from outside it: nothing has to notice the moment.
  const walker = bodyAt(field, 'drifter', image.x + AI.bait + 60, image.y, 0);
  assert.equal(quarryFor(field, walker), ship, 'out of reach it is the ship');
  walker.x = image.x + AI.bait - 1;
  assert.equal(quarryFor(field, walker), image, 'and one px inside it it is the image');
});

test('two seconds, and then every body in the arena is looking at the ship again', () => {
  const field = armed(9, 1);
  const ship = field.player;
  dashNorth(field);
  const body = bodyAt(field, 'drifter', images(field)[0].x + 30, images(field)[0].y, 90);

  // The image's own clock is what is being tested and not a count of steps: 240 steps of a
  // 1/120 s step do not add up to exactly 2, and nobody can tell, so the promise is one step wide
  // at each end (session 8's lesson about the frame clock, arrived at again in session 41).
  let guard = 0;
  while (images(field).length > 0 && images(field)[0].age < AI.life - 2 * STEP && guard++ < 1000) {
    stepTheWorld({});
  }
  assert.equal(images(field).length, 1, 'a live image still has its reach');
  assert.equal(quarryFor(field, body), images(field)[0]);
  pass(field, 4 * STEP);
  assert.equal(images(field).length, 0, 'and gone, a step past its two seconds');
  assert.equal(quarryFor(field, body), ship, 'the moment it goes out the ship is back');
});

test('a fooled body is not a stunned one: it walks at full pace', () => {
  const field = armed(10, 1);
  const ship = field.player;
  dashNorth(field);
  const image = images(field)[0];

  const fooled = bodyAt(field, 'drifter', image.x, image.y - 60, 150);
  const honest = bodyAt(field, 'drifter', ship.x + 900, ship.y + 900, 150);
  const fooledWas = distanceTo(fooled, image);
  const honestWas = distanceTo(honest, ship);
  pass(field, 0.4);
  const fooledGone = fooledWas - distanceTo(fooled, image);
  const honestGone = honestWas - distanceTo(honest, ship);
  assert.ok(fooledGone > honestGone * 0.5,
    'the fooled body covered ' + fooledGone.toFixed(0) + ' px against '
    + honestGone.toFixed(0) + ' for one that was never fooled');
});

test('a promise is not broken: what has been locked is what comes', () => {
  const field = armed(11, 3);
  const ship = field.player;

  // A darter that has already chosen its line, standing aside of the streak, and an image that
  // lands beside it afterwards. It is 40 px from where an image is going to be and 150 from the
  // ship, so the two lines it could be walking are a long way apart.
  const darter = bodyAt(field, 'darter', ship.x + 40, ship.y - 120, 90);
  let guard = 0;
  while (!isAiming(darter) && guard++ < 200) stepTheWorld({});
  assert.ok(isAiming(darter), 'the darter never came round to aiming');
  const aimX = darter.dirX;
  const aimY = darter.dirY;

  dashNorth(field);
  const near = images(field).reduce((best, image) => Math.min(best, distanceTo(darter, image)), 1e9);
  assert.ok(near < AI.bait, 'the test wants an image beside the darter, was ' + near.toFixed(0));

  guard = 0;
  while (!isLunging(darter) && guard++ < 200) stepTheWorld({});
  assert.ok(isLunging(darter), 'the darter never got to its lunge');
  assert.equal(darter.dirX, aimX, 'and it is still the line it locked, not the image');
  assert.equal(darter.dirY, aimY);
});

test('a locked eye keeps the line it took, whatever walks past it', () => {
  const field = armed(12, 3);
  const ship = field.player;
  const sniper = bodyAt(field, 'sniper', ship.x + 6, ship.y - 130, 0);
  assert.ok(isRooted(sniper), 'the sniper is the one body that cannot walk at anything');

  stepTheWorld({});
  assert.ok(isLocking(sniper), 'a planted sniper takes its lock straight away');
  const lockX = sniper.dirX;
  const lockY = sniper.dirY;

  dashNorth(field);
  assert.ok(distanceTo(sniper, images(field)[images(field).length - 1]) < AI.bait);
  stepTheWorld({});
  assert.ok(isLocking(sniper), 'and it is holding the same lock');
  assert.equal(sniper.dirX, lockX, 'the line it was shown is the line it fires down');
  assert.equal(sniper.dirY, lockY);
});

test('every kind in the game reads an image, and the bolted-down one only turns', () => {
  const field = armed(13, 1);
  const ship = field.player;
  dashNorth(field);
  const image = images(field)[0];

  // Every kind in the game, standing round one image, walked for half a second: what is being
  // promised here is that none of them throws on a quarry that is not the ship, and that the one
  // that cannot walk at all still notices.
  const kinds = Object.keys(KINDS);
  const crowd = kinds.map((type, i) => {
    const a = (i / kinds.length) * TAU;
    return bodyAt(field, type, image.x + Math.cos(a) * 44, image.y + Math.sin(a) * 44);
  });
  for (const body of crowd) {
    assert.equal(quarryFor(field, body), image, body.type + ' is standing on the image');
  }
  pass(field, 0.5);

  const sniper = crowd.find((body) => body.type === 'sniper');
  assert.ok(isRooted(sniper), 'the sniper is the one body that cannot walk at anything');
  assert.ok(isLocking(sniper), 'and it took a lock the moment it was put down');
  const want = Math.atan2(image.y - sniper.y, image.x - sniper.x);
  const got = Math.atan2(sniper.dirY, sniper.dirX);
  assert.ok(Math.abs(got - want) < 0.001,
    'the eye is on the image it was handed and not on the ship: ' + got.toFixed(3) + ' vs ' + want.toFixed(3));
});

test('a fooled spitter spits at the image, and the shot goes where the ghost is', () => {
  const field = armed(16, 1);
  const ship = field.player;
  dashNorth(field);
  const image = images(field)[0];

  // Standing in the image's reach, and inside the band a spitter likes to spit from, but off to
  // one side of the line from the ghost to the ship - so the two ways its first shot could go are
  // forty degrees apart and there is no mistaking which one it took.
  const spitter = bodyAt(field, 'spitter', image.x + 50, image.y + 30, 60);
  stepTheWorld({});                       // the wait is up, so this is the step it decides on
  assert.equal(quarryFor(field, spitter), image);
  pass(field, 0.6);                       // the wind-up, and the shot

  const shot = field.enemyShots.items[0];
  assert.ok(shot !== undefined, 'the spitter spat');
  const length = Math.hypot(shot.vx, shot.vy);
  const toImage = {
    x: (image.x - spitter.x) / Math.hypot(image.x - spitter.x, image.y - spitter.y),
    y: (image.y - spitter.y) / Math.hypot(image.x - spitter.x, image.y - spitter.y),
  };
  const dot = shot.vx / length * toImage.x + shot.vy / length * toImage.y;
  assert.ok(dot > 0.95, 'the shot went at the ghost it is chasing, not at the ship: ' + dot.toFixed(2));
});

test('the crowd that was on you ends up somewhere else', () => {
  // A paired measurement, same seed, same crowd, same seconds: twenty bodies coming up from the
  // south, and one dash straight away from them. What is being asked is not "is the crowd fooled"
  // - that is what the reach test above is for - but whether the whole of it ends up further from
  // the ship when the line has been taken, which is the only thing this card is for.
  const plain = pressFromBelow(0, 21);
  const lined = pressFromBelow(5, 21);
  assert.ok(lined.mean > plain.mean + 40,
    'the crowd stood ' + lined.mean.toFixed(0) + ' px off the ship with the line against '
    + plain.mean.toFixed(0) + ' without it');
  assert.ok(lined.min > plain.min + 40,
    'and the nearest of them ' + lined.min.toFixed(0) + ' against ' + plain.min.toFixed(0));
});

/**
 * One press of the dash away from a knot of bodies, and how far off the ship they ended up a
 * second and a half later: the whole press, and the mean and nearest distance of the knot.
 */
function pressFromBelow(ranks, seed) {
  const field = armed(seed, ranks);
  const ship = field.player;
  const knot = [];
  for (let i = 0; i < 20; i++) {
    knot.push(bodyAt(field, 'drifter', ship.x - 190 + i * 20, ship.y + 120 + (i % 4) * 14, 150));
  }
  dashNorth(field);
  pass(field, 1.5);
  const distances = knot.map((body) => distanceTo(body, ship));
  return {
    mean: distances.reduce((sum, one) => sum + one, 0) / distances.length,
    min: Math.min(...distances),
  };
}

test('a rank taken between two dashes is spent on the next one', () => {
  const field = armed(14, 1);
  dashNorth(field);
  assert.equal(images(field).length, 1);

  field.upgrades.afterimage = 3;
  assert.equal(images(field).length, 1, 'what is already standing there is not revised');

  let guard = 0;
  while (field.player.dashCd > 0 && guard++ < 600) stepTheWorld({});
  dashNorth(field);
  assert.equal(images(field).length, 3, 'and the next dash leaves what the ranks now say');
});

test('a new run does not inherit the last one ghosts', () => {
  const field = armed(15, 2);
  dashNorth(field);
  assert.equal(images(field).length, 2);
  resetRun(field);
  assert.equal(field.afterimage.trail.count, 0);
  assert.equal(field.afterimage.left, 0);
});
