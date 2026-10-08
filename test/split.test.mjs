// Split shot (PLAN 3.5): the first upgrade line that hands out whole projectiles
// instead of a share of one, so it is tested where it actually lands - in the gun, and
// against a crowd wide enough for a fan to be worth taking.
//
// The scripted world again, and its ship is parked in the middle of the arena pointing
// straight up (game/run.js), which is what makes the fan's geometry arithmetic a test
// can do on purpose rather than a screenshot somebody hopes is symmetrical.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { fire, shotsPerSecond, shotsPerPull } from '../src/game/weapons.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const SPLIT = BALANCE.upgrades.split;
const GUN = BALANCE.weapons.pulse;
const SPREAD = GUN.spread;               // the aim error every shot is allowed
const RANKS = SPLIT.ranks;

/**
 * The fan the line is meant to make, in gaps of `SPLIT.fan`: the aimed shot on the nose
 * first, then the extras one ring out from it, alternating sides. Written out as data
 * here so the code under test has nothing to say about what the test expects.
 */
const FANS = [
  [0],
  [0, 1],
  [0, 1, -1],
  [0, 1, -1, 2],
  [0, 1, -1, 2, -2],
  [0, 1, -1, 2, -2, 3],
];

/** One pull of the trigger into an empty magazine, as the shots that came out. */
function pull(field, ranks) {
  field.upgrades.split = ranks;
  field.bullets.clear();
  fire(field);
  return field.bullets.items.slice(0);      // the live list, snapshotted
}

/** How far off the nose a shot left, in radians. */
function leanOf(shot, ship) {
  const heading = Math.atan2(shot.vy, shot.vx);
  const lean = heading - ship.angle;
  return Math.atan2(Math.sin(lean), Math.cos(lean));   // folded back to [-pi, pi]
}

function sorted(numbers) {
  return numbers.slice(0).sort((a, b) => a - b);
}

test('one pull fires one shot, and every rank of the line adds one', () => {
  const field = scriptedRun(70);

  for (let rank = 0; rank <= RANKS; rank++) {
    const shots = pull(field, rank);
    assert.equal(shots.length, 1 + rank * SPLIT.step, 'rank ' + rank + ' fires ' + shots.length);
    assert.equal(shots.length, shotsPerPull(field), 'and the gun agrees with the line');
  }
});

test('the fan is the shape the line says it is, and it is centred on the aim', () => {
  const field = scriptedRun(71);
  const ship = field.player;

  for (let rank = 0; rank <= RANKS; rank++) {
    const shots = pull(field, rank);
    assert.ok(Math.abs(leanOf(shots[0], ship)) <= SPREAD + 1e-9,
      'rank ' + rank + ': the shot you aimed is the first one, and it goes where you pointed');

    const wanted = sorted(FANS[rank].map((gaps) => gaps * SPLIT.fan));
    const got = sorted(shots.map((shot) => leanOf(shot, ship)));
    assert.equal(got.length, wanted.length);
    for (let i = 0; i < got.length; i++) {
      assert.ok(Math.abs(got[i] - wanted[i]) <= SPREAD + 1e-9,
        'rank ' + rank + ', shot ' + i + ': expected ' + wanted[i].toFixed(3) + ', got ' + got[i].toFixed(3));
    }
  }
});

test('the aimed shot is the heaviest thing the fan carries, and none of them is free', () => {
  const field = scriptedRun(72);
  const weight = GUN.damage * (1 + BALANCE.upgrades.damage.step * 2);
  field.upgrades.damage = 2;

  const shots = pull(field, RANKS);
  assert.equal(shots.length, 1 + RANKS * SPLIT.step);
  assert.ok(Math.abs(shots[0].dmg - weight) < 1e-9, 'the aimed shot is a whole one');

  let total = 0;
  for (let i = 1; i < shots.length; i++) {
    assert.ok(Math.abs(shots[i].dmg - weight * SPLIT.share) < 1e-9, 'an extra is a share of one');
    total += shots[i].dmg;
  }
  total += shots[0].dmg;

  // The whole point of the share: a rank buys coverage, not a free multiplying of the
  // gun. Six shots at full weight would be six times the damage per pull.
  assert.ok(total < weight * shots.length, 'the extras are not free: ' + total / weight + ' shots worth');
  assert.ok(total > weight, 'and they are not nothing either');

  for (const shot of shots) {
    assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - GUN.speed * (1 + BALANCE.upgrades.bulletSpeed.step * field.upgrades.bulletSpeed)) < 1e-9,
      'the whole fan leaves at the gun\'s speed');
  }
});

test('a fan is one pull of the trigger, however many shots came with it', () => {
  const field = scriptedRun(73);
  const plain = shotsPerSecond(field);

  field.upgrades.split = RANKS;
  assert.equal(shotsPerSecond(field), plain, 'the line does not touch the cycle at all');

  const ship = field.player;
  ship.fireTimer = 0;
  const gaps = [];
  for (let i = 0; i < 120 && gaps.length < 2; i++) {
    const before = field.bullets.count;
    stepTheWorld({ firing: true });
    if (field.bullets.count > before) gaps.push(ship.fireTimer);
  }
  assert.equal(gaps.length, 2, 'the gun pulled twice');
  for (const gap of gaps) assert.ok(Math.abs(gap - 1 / plain) < 1e-9, 'and waited the plain gun\'s wait');
});

/**
 * Two enemies standing `range` away, one on the nose and one `gaps` of the fan off it,
 * with one pull fired at them. Answers how many of the two were hit.
 *
 * The geometry is chosen so that the answer cannot be luck: at 300 px one gap of the fan
 * is 26 px of sideways, the aim error is worth +-14 px of it, and a drifter is touched
 * at 18 px - so the shot aimed at the near one can never reach the far one, and the
 * shot two gaps out can never miss it.
 */
function fanReaches(field, ranks, range, gaps) {
  const ship = field.player;
  const lean = gaps * SPLIT.fan;
  const onTheNose = enemyAt('drifter', ship.x, ship.y - range);
  const offToTheSide = enemyAt('drifter',
    ship.x + Math.sin(lean) * range, ship.y - Math.cos(lean) * range);

  const hullBefore = [onTheNose.hp, offToTheSide.hp];
  pull(field, ranks);

  let steps = 0;
  while (field.bullets.count > 0 && steps < 400) {
    stepTheWorld({ firing: false });
    steps++;
  }
  assert.ok(steps < 400, 'the fan finished flying');
  return [onTheNose, offToTheSide].filter((enemy, i) => enemy.hp < hullBefore[i]).length;
}

test('one pull of a fan reaches past the enemy you aimed at, and a plain shot does not', () => {
  // Which is the whole trade of the line, measured: the fan buys sideways reach with
  // shots that are a share of the one you aimed, so it is worth taking when the crowd
  // is wide and close, and worth nothing when it is a single body far away.
  const RANGE = 300;
  const GAPS = 2;

  assert.equal(fanReaches(scriptedRun(74), 0, RANGE, GAPS), 1,
    'a plain shot is one line, and it hits the one thing standing in it');
  assert.equal(fanReaches(scriptedRun(75), 3, RANGE, GAPS), 2,
    'a fan of four touches both of them with one pull');
  assert.equal(fanReaches(scriptedRun(76), 1, RANGE, GAPS), 1,
    'and a fan of two has not spread far enough yet - the line grows sideways, rank by rank');
});

test('the fan has an edge: what stands outside it is not touched', () => {
  // The biggest fan reaches three gaps either side of the nose and no further, so an
  // enemy standing six gaps out can only ever meet the shot on the nose. That is the
  // other half of what the line costs: the fan hits what stands in it and spends the
  // rest of its shots on air.
  assert.equal(fanReaches(scriptedRun(77), RANKS, 300, 6), 1,
    'the near one was hit and the wide one was not');
});
