// Ricochet (PLAN 3.5): a shot that would die turns on to another body and goes again,
// one more body per rank.
//
// This is the third line that lives in the collision loop rather than in the gun, and the
// first thing in the game that changes a shot's velocity after the gun wrote it. So most
// of what is tested here is the shot's bookkeeping again, next to what only a turn can
// get wrong:
//
//   how many bodies one shot may be turned on to, and that it cannot reach one more;
//   that it never comes back for a body it has already been through - pierce's memory
//     does that for free, and this is the test that says so;
//   that a turn is a change of heading only: same place, same speed, less weight;
//   that a bounce is not a homing missile: it only finds a body inside the line's reach;
//   that a shot with nowhere to turn dies exactly when a plain one would have, and is not
//     paid for;
//   and how the two lines that let a shot survive a hit divide the work: straight on while
//     a body stands ahead of it, a turn the moment none does.
//
// The scripted world's ship sits in the middle of the arena pointing straight up
// (game/run.js), so a body planted above it is one the shot is aimed at, and a body
// planted beside that one is only ever reached by a turn.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { bounceOf, countOf, effectOf } from '../src/game/upgrades.js';
import { fire } from '../src/game/player.js';
import { bulletFlyingToward, enemyAt, scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const RICOCHET = BALANCE.upgrades.ricochet;
const PIERCE = BALANCE.upgrades.pierce;
const GUN = BALANCE.bullets;
const DAMAGE = BALANCE.upgrades.damage;
const RANKS = RICOCHET.ranks;

/** One pull of the trigger into an empty magazine, as the shots that came out. */
function pull(field, ranks) {
  field.upgrades.ricochet = ranks;
  field.bullets.clear();
  fire(field);
  return field.bullets.items.slice(0);
}

/** `count` bodies along a line across the arena, `gap` apart, nearest first. */
function row(field, count, gap, hp) {
  const ship = field.player;
  const bodies = [];
  for (let i = 0; i < count; i++) {
    bodies.push(enemyAt('drifter', ship.x + i * gap, ship.y - 90, hp));
  }
  return bodies;
}

/** Fly whatever is in the air until it stops. Shards and XP are swept as it goes, so a
 *  paying crowd cannot level the run up and stop the arena mid-test. */
function flyUntilQuiet(field, limit) {
  const cap = limit === undefined ? 600 : limit;
  let steps = 0;
  while (field.bullets.count > 0 && steps < cap) {
    field.shards.clear();
    field.xp = 0;
    stepTheWorld({ firing: false });
    steps++;
  }
  assert.ok(steps < cap, 'the shot finished flying');
  return steps;
}

/**
 * Fire one shot at a row of bodies and report what each one lost. The world is built
 * here, so whatever a test wants on the other lines goes in `wanted`.
 */
function shootAtRow(seed, wanted) {
  const field = scriptedRun(seed);
  field.upgrades.damage = wanted.damage === undefined ? 0 : wanted.damage;
  // A level-up would stop the arena mid-flight and the test would measure the pause, so
  // there is no next level to earn here. A crowd still pays out its shards; they just
  // buy nothing.
  field.xpNeed = Infinity;
  const bodies = row(field, wanted.count, wanted.gap, wanted.hp);
  for (const body of bodies) body.hpBefore = body.hp;
  const shots = pull(field, wanted.ranks);
  // What the shot left with, read before it spends itself: a bullet carries one `dmg`
  // field and both lines here write it down as it goes.
  const weight = shots[0].dmg;

  flyUntilQuiet(field);
  assert.equal(field.state, STATE.PLAY, 'and nothing stopped the run on the way');
  return {
    field,
    shots,
    weight,
    bodies,
    took: bodies.map((body) => body.hpBefore - body.hp),
  };
}

/** Does this body look like it took exactly this much, allowing for the float it rode in on? */
function took(body, amount) {
  return Math.abs((body.hpBefore - body.hp) - amount) < 1e-9;
}

test('one rank lets one shot turn on to one more body, and no more than that', () => {
  // Seven bodies in a row of tough ones, all of them within reach of a turn, so there is
  // always somebody left standing for the shot to prove it has stopped: rank r may have
  // r + 1 of them and never reaches the ones past that.
  const ROW = 7;

  for (let rank = 0; rank <= RANKS; rank++) {
    const lost = shootAtRow(400 + rank, { ranks: rank, count: ROW, gap: 60, hp: 1000 }).took;
    const hits = lost.filter((damage) => damage > 0).length;
    assert.equal(hits, rank + 1, 'rank ' + rank + ' touched ' + hits + ' bodies');
    for (let i = rank + 1; i < ROW; i++) {
      assert.equal(lost[i], 0, 'rank ' + rank + ' never reached body ' + (i + 1));
    }
  }
});

test('a turn is a change of heading and nothing else', () => {
  // The shot does not teleport to its new target and is not faster for the trip: it
  // kinks. That is what makes a bounce read as a glance off the body it hit rather than
  // as a second shot fired from where the first one ended.
  const field = scriptedRun(410);
  const ship = field.player;
  const aimed = enemyAt('drifter', ship.x, ship.y - 120, 1000);
  const side = enemyAt('drifter', ship.x + 190, ship.y - 160, 1000);
  const shot = bulletFlyingToward(ship.x, ship.y - 80, 0, -GUN.speed, 0, 1);

  // Straight up until the body above it is hit, which is the step the turn happens on.
  let steps = 0;
  while (shot.vx === 0 && steps < 200) { stepTheWorld({}); steps++; }
  assert.ok(steps < 200, 'the shot hit the body above it and was turned');
  assert.ok(aimed.hp < 1000, 'and that body paid for it');

  assert.equal(Math.hypot(shot.vx, shot.vy), GUN.speed, 'the same speed after the turn');
  const bearing = Math.atan2(side.y - shot.y, side.x - shot.x);
  const heading = Math.atan2(shot.vy, shot.vx);
  const off = Math.abs(Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading)));
  assert.ok(off < 0.25, 'and it now points at the body it turned on to, off by ' + off.toFixed(3));

  // Still where the hit happened, give or take one step of flying: nowhere near the body
  // it has just been pointed at.
  assert.ok(Math.abs(shot.x - ship.x) < GUN.speed * BALANCE.sim.step * 2,
    'the turn did not move the shot sideways');
});

test('a turned shot never comes back for a body it has already been through', () => {
  // The memory pierce needed is the memory a turn needed too, and it is the same one: a
  // body the shot has spent cannot pay out again just because the shot turned around.
  const result = shootAtRow(411, { ranks: RANKS, count: 2, gap: 60, hp: 1000 });
  const weight = result.weight;

  assert.ok(took(result.bodies[0], weight), 'the aimed body was hit once, not twice: '
    + (1000 - result.bodies[0].hp));
  assert.ok(took(result.bodies[1], weight * RICOCHET.share), 'and the one beside it once');
});

test('every body turned on to takes a share of what the one before it took', () => {
  // The price of the card, in the same shape as the pierce line's: a turn buys a body the
  // player did not aim at, and pays weight for it.
  const weight = GUN.damage * (1 + DAMAGE.step * DAMAGE.ranks);
  const lost = shootAtRow(412, {
    ranks: RANKS, count: RANKS + 1, gap: 60, hp: 1000, damage: DAMAGE.ranks,
  }).took;

  assert.ok(Math.abs(lost[0] - weight) < 1e-9, 'the body you aimed at takes a whole shot');
  for (let i = 1; i < lost.length; i++) {
    assert.ok(lost[i] > 0, 'body ' + (i + 1) + ' was found');
    assert.ok(Math.abs(lost[i] - lost[i - 1] * RICOCHET.share) < 1e-9,
      'and takes ' + RICOCHET.share + ' of what body ' + i + ' took');
  }
  const total = lost.reduce((sum, damage) => sum + damage, 0);
  assert.ok(total > weight, 'a knot feels it: ' + total.toFixed(2) + ' shots worth');
  assert.ok(total < weight * lost.length, 'and it is not free');
});

test('a bounce only reaches as far as the line says', () => {
  // Two bodies, one inside the line's reach and one outside it, and a shot that can only
  // ever find the first. This is what stops a ricochet being a missile across the arena.
  const inside = shootAtRow(413, { ranks: 1, count: 2, gap: RICOCHET.reach - 40, hp: 1000 });
  assert.ok(inside.took[1] > 0, 'a body ' + (RICOCHET.reach - 40) + 'px away was found');

  const outside = shootAtRow(414, { ranks: 1, count: 2, gap: RICOCHET.reach + 60, hp: 1000 });
  assert.equal(outside.took[1], 0, 'and one ' + (RICOCHET.reach + 60) + 'px away was not');
});

test('a shot with nowhere to turn dies as a plain one, and is not paid for', () => {
  // A bounce that finds nobody is not spent. A shot must not get a free life extension,
  // or an empty arena would quietly be a place this line pays out in.
  const field = scriptedRun(415);
  enemyAt('drifter', field.player.x, field.player.y - 90, 1000);
  const shot = pull(field, RANKS)[0];

  flyUntilQuiet(field);
  assert.equal(field.bullets.count, 0, 'the shot ended');
  assert.equal(shot.bounce, RANKS * RICOCHET.step, 'and never spent a turn on nothing');
});

test('a shot turns while it still has passes left, once nothing is ahead of it', () => {
  // The two lines together, which is what a long run ends up with. Going straight is only
  // worth a pass when there is something ahead to go through: once the column is spent,
  // the shot takes the turn it bought instead of flying away with it unspent.
  const field = scriptedRun(416);
  field.upgrades.pierce = 2;
  const column = [
    enemyAt('drifter', field.player.x, field.player.y - 90, 1000),
    enemyAt('drifter', field.player.x, field.player.y - 130, 1000),
  ];
  const side = enemyAt('drifter', field.player.x + 150, field.player.y - 130, 1000);
  for (const body of column.concat([side])) body.hpBefore = body.hp;

  const shot = pull(field, 2)[0];
  let steps = 0;
  while (shot.bounce === 2 && steps < 300) { stepTheWorld({}); steps++; }
  assert.ok(steps < 300, 'the shot took a turn');
  assert.equal(shot.pierce, 1, 'with a pass still in its pocket');
  assert.equal(shot.bounce, 1, 'and one turn of its two spent');

  flyUntilQuiet(field);
  assert.ok(column[1].hp < 1000, 'it went on through the column while the column lasted');
  assert.ok(took(side, GUN.damage * PIERCE.share * RICOCHET.share),
    'and took the turn the moment there was nothing left ahead, carrying both shares');
});

test('and it keeps its straight line while a body stands ahead', () => {
  // The other half: a turn is not spent the moment one is *possible*, only when going
  // straight is pointless. The player aimed up the column, and up the column is where the
  // shot goes while there is a column.
  const field = scriptedRun(417);
  field.upgrades.pierce = 2;
  const near = enemyAt('drifter', field.player.x, field.player.y - 90, 1000);
  const far = enemyAt('drifter', field.player.x, field.player.y - 200, 1000);
  const side = enemyAt('drifter', field.player.x + 120, field.player.y - 90, 1000);

  const shot = pull(field, 2)[0];
  let steps = 0;
  while (near.hp === 1000 && steps < 200) { stepTheWorld({}); steps++; }
  assert.ok(steps < 200, 'the shot hit the body it was aimed at');

  assert.equal(side.hp, 1000, 'and did not turn, however close the body beside it was');
  assert.equal(shot.bounce, 2, 'nothing was spent on a turn');
  assert.equal(shot.pierce, 1, 'one pass was, on a body standing ahead');

  // And the one ahead is where it ended up.
  steps = 0;
  while (far.hp === 1000 && steps < 200) { stepTheWorld({}); steps++; }
  assert.ok(far.hp < 1000, 'the shot went on up the line the player aimed');
});

test('a shot that turns is lighter, and still dies in the end', () => {
  const field = scriptedRun(417);
  row(field, 2, 60, 1000);
  const shot = pull(field, 1)[0];
  const weight = shot.dmg;

  flyUntilQuiet(field);
  assert.equal(field.bullets.count, 0, 'the shot spent itself');
  assert.ok(Math.abs(weight * RICOCHET.share - shot.dmg) < 1e-9,
    'and ended its flight a share lighter than it started');
});

test('every projectile of a pull carries the turns the gun had', () => {
  const field = scriptedRun(418);
  field.upgrades.split = 3;
  field.upgrades.ricochet = 2;
  field.bullets.clear();
  fire(field);

  assert.equal(field.bullets.count, 1 + 3 * BALANCE.upgrades.split.step);
  for (const shot of field.bullets.items) {
    assert.equal(shot.bounce, bounceOf(field));
    assert.equal(shot.hits.length, 0, 'and nobody is in its memory yet');
  }
});

test('a recycled shot does not inherit the last shot\'s turns', () => {
  // The pool's contract, again: `shoot` writes every field, including this one, or a
  // plain shot comes back wearing a bought line.
  const field = scriptedRun(419);
  row(field, 3, 60, 1000);
  pull(field, RANKS);
  flyUntilQuiet(field);
  assert.ok(field.bullets.made > 0, 'the pool has built shots to hand back');

  const plain = pull(field, 0)[0];
  assert.equal(plain.bounce, 0);
  assert.equal(plain.pierce, 0);
  assert.equal(plain.hits.length, 0);
});

test('the line is a count, not a multiplier, and the card says so', () => {
  const field = scriptedRun(420);
  assert.equal(bounceOf(field), 0, 'a fresh run turns nowhere');

  field.upgrades.ricochet = RANKS;
  assert.equal(bounceOf(field), RANKS * RICOCHET.step);
  assert.equal(countOf(field, 'ricochet'), bounceOf(field), 'and it is the line, counted');
  assert.equal(effectOf('ricochet'), '+' + RICOCHET.step + ' body turned onto');
});

test('a knot of bodies gets thinner faster with the line taken', () => {
  // The claim the card sells, end to end: the same bodies, the same gun, the same seconds
  // of trigger, and the run that took the line kills far more of them - because a shot
  // that lands on a body beside the one it was aimed at is a shot that was never wasted.
  const plain = knotCleared(0);
  const bouncing = knotCleared(RANKS);
  assert.ok(bouncing >= plain * 1.5,
    plain + ' bodies with no ricochet, ' + bouncing + ' with the line maxed');
});

/**
 * One block of bodies - the bot's problem, which is a crowd in every direction - and a
 * fixed two seconds of trigger. They die to any touch at all, so the count is of bodies
 * *touched*, and there are far more of them than either build can reach: a plain shot
 * touches the one it was aimed at and a turned one touches everything it can find.
 */
function knotCleared(ranks) {
  const field = scriptedRun(421);
  field.xpNeed = Infinity;        // a level-up would stop the arena and freeze the count
  for (let rowOf = 0; rowOf < 6; rowOf++) {
    for (let column = 0; column < 7; column++) {
      enemyAt('drifter', field.player.x - 165 + column * 55, field.player.y - 150 - rowOf * 55, 0.2);
    }
  }
  field.upgrades.ricochet = ranks;

  const steps = Math.round(2 / BALANCE.sim.step);
  for (let i = 0; i < steps; i++) {
    field.shards.clear();
    field.xp = 0;
    stepTheWorld({ firing: true });
  }
  return field.kills;
}
