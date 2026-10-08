// Pierce (PLAN 3.5): a shot goes through one more body per rank and on to the next.
//
// This is the second line that is not a multiplier, and it is the first one that lives in
// the collision loop rather than in the gun: a shot that used to die on the body it hit
// now has a say in whether it keeps flying. So most of what is tested here is the shot's
// bookkeeping, which nothing else in the game can see:
//
//   how many bodies one shot may take, and that it cannot take one more;
//   that it never shaves the same body twice on its way through it;
//   what each body past the first is worth, which is the price of the card;
//   that a body is paid for exactly once, shards and all.
//
// The scripted world's ship sits in the middle of the arena pointing straight up
// (game/run.js), so a column of bodies planted above it is a column the shot goes down.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { countOf, effectOf, pierceOf } from '../src/game/upgrades.js';
import { fire } from '../src/game/weapons.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const PIERCE = BALANCE.upgrades.pierce;
const GUN = BALANCE.bullets;
const DAMAGE = BALANCE.upgrades.damage;
const RANKS = PIERCE.ranks;

/** One pull of the trigger into an empty magazine, as the shots that came out. */
function pull(field, ranks) {
  field.upgrades.pierce = ranks;
  field.bullets.clear();
  fire(field);
  return field.bullets.items.slice(0);      // the live list, snapshotted
}

/**
 * A column of `count` bodies up the nose, `gap` apart, each with the hull it is given.
 * Answers them in order, nearest first.
 */
function column(field, count, gap, hp) {
  const ship = field.player;
  const bodies = [];
  for (let i = 0; i < count; i++) {
    bodies.push(enemyAt('drifter', ship.x, ship.y - 90 - i * gap, hp));
  }
  return bodies;
}

/** The hull each body of the column lost, in order. */
function took(bodies) {
  return bodies.map((body) => body.hpBefore - body.hp);
}

/**
 * Fire one shot and fly it until it stops. Shards are swept off the floor as it goes,
 * because a crowd paying out its XP would level the run up and stop the arena, and none
 * of that is what these tests are about.
 */
function shootOnce(field, ranks) {
  const shots = pull(field, ranks);
  assert.equal(shots.length, 1, 'one pull, whatever the pierce line says');
  const weight = shots[0].dmg;
  for (const body of field.enemies) body.hpBefore = body.hp;

  let steps = 0;
  while (field.bullets.count > 0 && steps < 600) {
    field.shards.clear();
    field.xp = 0;
    stepTheWorld({ firing: false });
    steps++;
  }
  assert.ok(steps < 600, 'the shot finished flying');
  assert.equal(field.state, STATE.PLAY, 'and nothing stopped the run on the way');
  return { shots, weight, steps, took: took(field.enemies) };
}

/**
 * Fire one shot at a column and report what each body lost. The run is set up here, so
 * whatever a test wants to spend on the other lines goes in `wanted` rather than being
 * written on a world this function is about to reset.
 */
function shootAtColumn(seed, wanted) {
  const field = scriptedRun(seed);
  field.upgrades.damage = wanted.damage === undefined ? 0 : wanted.damage;
  const bodies = column(field, wanted.count, wanted.gap, wanted.hp);
  for (const body of bodies) body.hpBefore = body.hp;
  pull(field, wanted.ranks);

  let steps = 0;
  while (field.bullets.count > 0 && steps < 600) {
    field.shards.clear();
    field.xp = 0;
    stepTheWorld({ firing: false });
    steps++;
  }
  assert.ok(steps < 600, 'the shot finished flying');
  return took(bodies);
}

test('one rank lets one shot take one more body, and no more than that', () => {
  // Eight bodies in a column of tough ones, so there is always a body left over for the
  // shot to prove it has stopped: rank r may have r + 1 of them and never reaches the
  // ones past that.
  const COLUMN = 8;

  for (let rank = 0; rank <= RANKS; rank++) {
    const lost = shootAtColumn(200 + rank, { ranks: rank, count: COLUMN, gap: 40, hp: 1000 });
    const hits = lost.filter((damage) => damage > 0).length;
    assert.equal(hits, rank + 1, 'rank ' + rank + ' went through ' + hits + ' bodies');
    for (let i = rank + 1; i < COLUMN; i++) {
      assert.equal(lost[i], 0, 'rank ' + rank + ' never reached body ' + (i + 1));
    }
  }
});

test('a shot that has gone through a body does not shave it again on the way out', () => {
  // The one failure this line could have: a bullet at 620 px/s is inside a body for
  // several steps, and a passed-through body it kept meeting would lose a little hull in
  // every one of them. So the whole shot's damage must arrive exactly once.
  const field = scriptedRun(210);
  const body = column(field, 1, 40, 1000)[0];

  const shot = shootOnce(field, RANKS);
  assert.ok(Math.abs((1000 - body.hp) - shot.weight) < 1e-9,
    'one hit of exactly one shot, not one hit per step');
});

test('a second shot lands on the same body even though the first went through it', () => {
  // The memory of who has been pierced belongs to the shot, not to the body: two shots
  // are two hits, however much the first one did.
  const field = scriptedRun(211);
  const body = column(field, 1, 40, 1000)[0];
  field.upgrades.damage = DAMAGE.ranks;

  const first = shootOnce(field, RANKS);
  const second = shootOnce(field, RANKS);
  assert.equal(second.weight, first.weight, 'two identical shots');
  assert.ok(Math.abs((1000 - body.hp) - first.weight * 2) < 1e-9, 'and two hits, no more');
});

test('every body past the first takes a share of what the one before it took', () => {
  // The card says "one more body", not "one more shot": the shot spends itself as it
  // ploughs, which is what stops a rank being a flat multiplier on the gun.
  const weight = GUN.damage * (1 + DAMAGE.step * DAMAGE.ranks);
  const lost = shootAtColumn(212, {
    ranks: RANKS, count: RANKS + 1, gap: 40, hp: 1000, damage: DAMAGE.ranks,
  });
  assert.ok(Math.abs(lost[0] - weight) < 1e-9, 'the body you aimed at takes a whole shot');
  for (let i = 1; i < lost.length; i++) {
    assert.ok(lost[i] > 0, 'body ' + (i + 1) + ' was reached');
    assert.ok(Math.abs(lost[i] - lost[i - 1] * PIERCE.share) < 1e-9,
      'and takes ' + PIERCE.share + ' of what body ' + i + ' took');
  }

  // Which is still a gift and not a tax: the whole stack is worth more than the one shot
  // it started as, and a good deal less than the same number of whole shots would be.
  const total = lost.reduce((sum, damage) => sum + damage, 0);
  assert.ok(total > weight, 'a column feels it: ' + total.toFixed(2) + ' shots worth');
  assert.ok(total < weight * lost.length, 'and it is not free');
});

test('a passed-through body is paid for exactly once, like any other kill', () => {
  const field = scriptedRun(213);
  const bodies = column(field, RANKS + 2, 40, 0.01);   // cheap enough that any hit ends them
  for (const body of bodies) body.hpBefore = body.hp;
  const score = field.score;
  const kills = field.kills;

  shootOnce(field, RANKS);

  assert.equal(field.kills - kills, RANKS + 1, 'as many bodies as the shot may go through');
  assert.equal(field.score - score, (RANKS + 1) * BALANCE.kinds.drifter.score,
    'and every one of them is worth its own price, none of them twice');
  assert.equal(bodies[bodies.length - 1].hp, 0.01, 'and the last one was not touched');
});

test('a shot that goes through is still flying afterwards', () => {
  const field = scriptedRun(214);
  const body = column(field, 1, 40, 1000)[0];
  const shot = pull(field, 1)[0];

  // The step the hit happens on: the body is scratched and the shot is still live.
  let steps = 0;
  while (body.hp === 1000 && steps < 200) { stepTheWorld({}); steps++; }
  assert.ok(body.hp < 1000, 'it hit');
  assert.equal(field.bullets.count, 1, 'and it did not stop');

  const speed = Math.hypot(shot.vx, shot.vy);
  const height = shot.y;
  stepTheWorld({});
  assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - speed) < 1e-9, 'still at the gun\'s speed');
  assert.ok(shot.y < height, 'still going up the column');
});

test('a shot is lighter for every body it has been through, and dies in the end', () => {
  const field = scriptedRun(215);
  column(field, 1, 40, 1000);

  const shot = shootOnce(field, 2);
  assert.equal(field.bullets.count, 0, 'the shot spent itself in the end');
  assert.ok(Math.abs(shot.weight * PIERCE.share - shot.shots[0].dmg) < 1e-9,
    'and it ended its flight a share lighter than it started');
});

test('every projectile of a pull carries the pierce the gun had', () => {
  // The two lines are allowed to multiply each other: a fan that goes through things is
  // what a run that took both has earned.
  const field = scriptedRun(216);
  field.upgrades.split = 3;
  field.upgrades.pierce = 2;
  field.bullets.clear();
  fire(field);

  assert.equal(field.bullets.count, 1 + 3 * BALANCE.upgrades.split.step);
  for (const shot of field.bullets.items) {
    assert.equal(shot.pierce, pierceOf(field));
    assert.equal(shot.hits.length, 0, 'and nobody is in its memory yet');
  }
});

test('a recycled shot does not inherit the last shot\'s pierce', () => {
  // The pool's contract with a fresh eye: `shoot` writes every field, including the two
  // this line added, or a plain shot comes back wearing a bought one.
  const field = scriptedRun(217);
  shootOnce(field, RANKS);
  assert.ok(field.bullets.made > 0, 'the pool has built shots to hand back');

  const plain = pull(field, 0)[0];
  assert.equal(plain.pierce, 0);
  assert.equal(plain.hits.length, 0);
});

test('the line is a count, not a multiplier, and the card says so', () => {
  const field = scriptedRun(218);
  assert.equal(pierceOf(field), 0, 'a fresh run passes through nothing');

  field.upgrades.pierce = RANKS;
  assert.equal(pierceOf(field), RANKS * PIERCE.step);
  assert.equal(countOf(field, 'pierce'), pierceOf(field), 'and it is the line, counted');
  assert.equal(effectOf('pierce'), '+' + PIERCE.step + ' body passed through');
});

test('a thick crowd gets thinner faster with the line taken', () => {
  // The claim the card sells, end to end: the same fourteen bodies, the same gun, the
  // same seconds of trigger - and the run that took the line kills more of them, because
  // a shot that does not stop on the first body reaches the ones behind it. Same seed
  // both times, so the aim error is dealt out the same way to both.
  const plain = crowdCleared(0);
  const pierced = crowdCleared(RANKS);
  assert.ok(pierced >= plain * 1.5,
    plain + ' bodies with no pierce, ' + pierced + ' with the line maxed');
});

function crowdCleared(ranks) {
  const field = scriptedRun(219);
  column(field, 14, 34, 3);                 // three shots to a body either way
  field.upgrades.pierce = ranks;

  const steps = Math.round(3 / BALANCE.sim.step);
  for (let i = 0; i < steps; i++) {
    field.shards.clear();
    field.xp = 0;
    stepTheWorld({ firing: true });
  }
  return field.kills;
}
