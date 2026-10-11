// What the SHOT SPEED card actually buys, measured on the world and not on a bot.
//
// The card has a bad history: `tools/line-ab.js` hands five free ranks to a batch of runs and the
// middle run of the batch does not move (NOTES sessions 97, 98, 103: 1.00x on the pulse). That is a
// real measurement and it is not a fault in the instrument - it is a fact about the thing being
// measured. The bot aims at where a body *is* on the step it looks, and the crowd walks itself into
// the shot, so a slow shell is never punished for being slow. A person holds the aim in the wrong
// place when the trigger pulls, and for that hand shot speed is the difference between a hit and a
// shot that lands behind the body it was aimed at.
//
// So the card's three real mechanisms are proved here on the world, where none of them needs a pair
// of hands:
//
//   **a shot's fuse is seconds** (`BALANCE.weapons.*.life`), so the distance it can fall short of is
//   `speed x life` and a rank of this line buys reach along with velocity;
//   **a shot is in the air for less time**, which is the whole of "less lead to hold" - and a body
//   that walks has less ground to cover before the shot arrives; and
//   the honest negative: **the crowd comes to you**, so it is standing inside the reach a plain shot
//   already had and nearly all of the fuse this card lengthens goes unspent. That is why a run of the
//   bot reads 1.00x, and it is what the numbers in `BALANCE.upgrades.bulletSpeed` are quoted against.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { fire } from '../src/game/weapons.js';
import { scriptedRun, enemyAt, stepTheWorld as step } from '../tools/headless/scripted.js';

const gun = BALANCE.weapons.pulse;
const line = BALANCE.upgrades.bulletSpeed;

/** What the line is worth at `ranks`, and the reach that buys: the fuse is seconds (see above). */
const gainAt = (ranks) => 1 + line.step * ranks;
const reachAt = (ranks) => gun.speed * gainAt(ranks) * gun.life;

/**
 * The ranks the flying measurements are made at.
 *
 * A fifth-rank shot would fly 1,497 px from the middle of a 3,000 px arena and come out of the far
 * side almost exactly as its fuse ran out, which would make the test about the edge of the world.
 * Three ranks is the same law with room in it.
 */
const FLY_RANKS = 3;

/** Point the nose straight up, hand the ship the ranks asked for, and pull the trigger once. */
function shootUp(field, ranks) {
  field.upgrades.bulletSpeed = ranks;
  field.bullets.clear();
  field.player.angle = -Math.PI / 2;
  fire(field);
  assert.equal(field.bullets.count, 1, 'the pulse throws one shot a pull');
  return field.bullets.items[0];
}

/** Step until `done` says so. Returns the steps taken, and throws rather than spin forever. */
function stepUntil(done, maxSteps) {
  for (let i = 1; i <= maxSteps; i++) {
    step();
    if (done()) return i;
  }
  throw new Error('never happened in ' + maxSteps + ' steps');
}

/** How far one step of the world is worth, in px, for a shot at `ranks`. */
const stepOf = (ranks) => gun.speed * gainAt(ranks) * BALANCE.sim.step;

/**
 * How far a shot fired at `ranks` gets before it stops being a shot, and how long it took.
 *
 * The shot is followed and its own `life` is never read, so what comes back is the flight and not
 * the arithmetic that predicts it.
 */
function flightOf(ranks) {
  const field = scriptedRun(71);
  const shot = shootUp(field, ranks);
  const from = { x: shot.x, y: shot.y };
  let farthest = 0;
  let steps = 0;
  while (field.bullets.count > 0 && steps < 400) {
    steps++;
    step();
    for (const bullet of field.bullets.items) {
      farthest = Math.max(farthest, Math.hypot(bullet.x - from.x, bullet.y - from.y));
    }
  }
  assert.equal(field.bullets.count, 0, 'the flight ended');
  return { px: farthest, s: steps * BALANCE.sim.step };
}

/**
 * How far behind a walking body a shot crossed its line, in px, and how long that took.
 *
 * The body walks past at `walk` and the shot is aimed at the place it was standing, which is what a
 * hand that has not led its target does. `miss` is therefore the lead: how much further along the
 * body had gone by the time the shot arrived. `scriptedRun` seeds the run and the stream is the run,
 * so both runs of this draw the gun's own aim error identically and the error cancels out of the
 * difference between them - which leaves the walk as the only thing being measured.
 */
function leadOf(ranks, distance, walk) {
  const field = scriptedRun(75);
  const target = enemyAt('darter', field.player.x, field.player.y - distance);
  const mark = target.y;
  shootUp(field, ranks);
  const steps = stepUntil(() => {
    target.x += walk * BALANCE.sim.step;      // the body is walking past, not chasing the ship
    return field.bullets.count === 0 || field.bullets.items[0].y <= mark;
  }, 400);
  assert.ok(field.bullets.count > 0, 'the shot was still a shot when it got there');
  return { miss: target.x - field.bullets.items[0].x, s: steps * BALANCE.sim.step };
}

test('a shot\'s fuse is seconds, so a rank of shot speed buys reach and not only velocity', () => {
  // The arithmetic first, because it is the claim: `life` is a fuse in seconds, so the reach a shot
  // can fall short of is speed x life, and this line is multiplied into the speed.
  assert.ok(reachAt(line.ranks) > reachAt(0) * 2,
    'five ranks more than doubles where a shot can land: '
      + Math.round(reachAt(0)) + ' px against ' + Math.round(reachAt(line.ranks)));

  const plain = flightOf(0);
  const quick = flightOf(FLY_RANKS);
  // One step of travel either way, because the world moves in steps and the farthest place a shot
  // can be seen at is one step behind wherever its fuse really ran out.
  assert.ok(Math.abs(plain.px - reachAt(0)) < stepOf(0),
    'a plain shot flies its speed x fuse (' + Math.round(plain.px) + ' px measured, '
      + Math.round(reachAt(0)) + ' predicted)');
  assert.ok(Math.abs(quick.px - reachAt(FLY_RANKS)) < stepOf(FLY_RANKS),
    'and a ranked one flies its own (' + Math.round(quick.px) + ' against '
      + Math.round(reachAt(FLY_RANKS)) + ' predicted)');
  assert.ok(quick.px / plain.px > gainAt(FLY_RANKS) - 0.05,
    'the ranks are worth their reach: ' + (quick.px / plain.px).toFixed(2) + 'x measured against '
      + gainAt(FLY_RANKS).toFixed(2) + 'x asked');

  // Which is a thing a player runs into, and the one thing the run measurement cannot see: a body
  // standing 900 px out is a body a plain pulse shot never arrives at, and it is well inside what
  // the third rank reaches.
  assert.ok(plain.px < 900 - 100, '900 px is out of a plain shot\'s world');
  assert.ok(quick.px > 900 + 100, 'and the ranked shot goes straight past it');
});

test('a faster shot lands less far behind a body that walks, by exactly the walk it saves', () => {
  // Same seed, same aim, same body walking past at a darter's own pace: one shot is slow and one is
  // fast and the only difference between them is the line. What matters is how far behind the body
  // each one crosses its line, because the difference between those two numbers is precisely the
  // ground the body covered while the plain shot was still in the air.
  const walk = BALANCE.kinds.darter.speed;
  const distance = 400;
  const plain = leadOf(0, distance, walk);
  const quick = leadOf(line.ranks, distance, walk);

  assert.ok(plain.miss > 0 && quick.miss > 0,
    'both arrived behind it - the aim was where the body was, and that is the lead: '
      + plain.miss.toFixed(1) + ' px against ' + quick.miss.toFixed(1));
  assert.ok(quick.miss < plain.miss, 'and the quick one is behind it by less');

  const saved = walk * (plain.s - quick.s);
  assert.ok(Math.abs((plain.miss - quick.miss) - saved) < walk * BALANCE.sim.step * 2,
    'less by exactly the walk it saved: ' + (plain.miss - quick.miss).toFixed(1)
      + ' px measured, ' + saved.toFixed(1) + ' px of walk');
  assert.ok(plain.miss - quick.miss > BALANCE.kinds.darter.radius * 2,
    'and the room it takes away is twice the width of the body it was aimed at, which is the'
      + ' difference between a hit and a miss to an aim that is a step behind');
});

test('the fifth rank more than halves the time a shot is in the air to reach a body', () => {
  // A tank, because it is a wide target and the gun throws its shot with a little aim error: what is
  // being timed is the flight, and nothing about the hit should be luck.
  const plain = flightTimeTo(300, 0);
  const quick = flightTimeTo(300, line.ranks);

  assert.ok(Math.abs(plain / quick - gainAt(line.ranks)) < 0.15,
    'the two flights differ by the multiplier (' + plain.toFixed(3) + 's against '
      + quick.toFixed(3) + 's)');
  assert.ok(quick < plain / 2, 'and that is more than twice as quick');
});

/** How long a shot fired from the ship takes to reach a body standing `px` above it. */
function flightTimeTo(px, ranks) {
  const field = scriptedRun(73);
  const target = enemyAt('tank', field.player.x, field.player.y - px);
  const whole = target.hp;
  shootUp(field, ranks);
  const steps = stepUntil(() => target.hp < whole, 400);
  assert.equal(field.bullets.count, 0, 'the shot was spent on it');
  return steps * BALANCE.sim.step;
}

test('and a crowd walks into the reach a plain shot already had, which is why a run barely notices', () => {
  // The honest negative. The bodies come to the ship, so they are inside the plain shot's reach
  // already, and the question is not how far a shot can go but how much of the fuse is left burning
  // when it lands. This is what makes `tools/line-ab.js` read 1.00x on the pulse: the reach and the
  // lead are each worth a great deal on an empty sky and nothing at all in a crowd.
  const field = scriptedRun(74);
  const target = enemyAt('drifter', field.player.x, field.player.y - 150);
  const whole = target.hp;
  shootUp(field, 0);
  const used = stepUntil(() => target.hp < whole, 400) * BALANCE.sim.step / gun.life;
  assert.ok(used < 0.3, 'it landed with ' + Math.round((1 - used) * 100)
    + '% of the fuse still to burn');
  assert.ok(reachAt(line.ranks) / reachAt(0) > 2,
    'so more than doubling that fuse bought this body nothing at all');
});
