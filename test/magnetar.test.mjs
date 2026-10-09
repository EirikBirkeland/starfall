// Magnetar (PLAN 3.5): the shards the ship picks up charge the field round it, and when the field
// is full it lets go on everything standing in the field.
//
// There is no clock in game/magnetar.js, which is the whole shape of the card and so the whole
// shape of these tests: what gets proved is the bank, the reach, and the one thing the crack
// deliberately does not do.
//
//   the bank: a shard collected charges it and a large one is six of them; the field lets go when
//     the bank has paid for one crack and keeps what was left over; a pile worth several cracks
//     pays out one crack per step and not all of them at once; and rank 0 is not a field that
//     does nothing, it is no field at all - nothing is banked and nothing is spent;
//   the reach: every body inside it loses exactly `rank` shots of the ship's own gun and every
//     body outside it loses nothing, on the line and one pixel off it, which is the promise the
//     collapsing ring is drawn at; a rank buys weight and not reach, so the fifth rank comes
//     round the same crowd five times heavier;
//   and what it does not do: it never hurts the ship, it is not a *hit* - no fire and no frost,
//     which is the deliberate exception every other source of the ship's damage makes - and below
//     the third rank it spends no number out of the run's own stream, so a seed is still a seed.
//
// The scripted world's ship sits in the middle of the arena and does not move unless a test drives
// it, and the bodies do not move either, so "outside the field" is a distance and not a race. The
// bodies that are measured rather than killed are given a hull no crack can take off.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { logic } from '../src/core/rng.js';
import { dropBigShard, dropShards } from '../src/game/pickups.js';
import { resetRun } from '../src/game/run.js';
import { countOf, crackShotsOf, effectOf, gainOf } from '../src/game/upgrades.js';
import { chargeOf, feedField, hasMagnetar, isPrimed } from '../src/game/magnetar.js';
import { ignite } from '../src/game/burn.js';
import { chill } from '../src/game/chill.js';
import { scriptedRun, enemyAt, stepTheWorld } from '../tools/headless/scripted.js';

const MAG = BALANCE.upgrades.magnetar;
const GUN = BALANCE.bullets;
const RANKS = MAG.ranks;
const STEP = BALANCE.sim.step;
const IMMORTAL = 1e9;

/** What one body inside the field loses at `rank` ranks, on a plain gun. */
function weight(rank) {
  return GUN.damage * MAG.step * rank;
}

function marked(bodies) {
  for (const body of bodies) body.hpBefore = body.hp;
  return bodies;
}

function hullGone(body) {
  return body.hpBefore - body.hp;
}

/** A run wearing `rank` ranks of the line and nothing else, with no levels to be had. */
function wearing(rank) {
  const field = scriptedRun(1400 + rank);
  field.xpNeed = Infinity;
  field.upgrades.magnetar = rank;
  return field;
}

/** One body `distance` above the ship - above, so nothing else about the run reaches it. */
function ahead(field, distance, hp) {
  const ship = field.player;
  return marked([enemyAt('swarmling', ship.x, ship.y - distance, hp)])[0];
}

/** Charge the bank with `shards` shards' worth, straight through the door pickups.js knocks on. */
function feed(field, shards) {
  feedField(field, shards);
}

/**
 * Step the world for `seconds`, sweeping anything that could pause the run, so a test measures the
 * field and not a level-up or a hit-stop.
 */
function runFor(field, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    field.shards.clear();
    field.xp = 0;
    stepTheWorld();
  }
}

/**
 * Drop `count` shards at the ship's own feet and let it collect them - the real door, through
 * game/pickups.js, with the mint and the XP and everything. Bounded, and the bound is asserted:
 * a shard that never came in would otherwise hang the file (NOTES session 9's rule).
 */
function collect(field, count) {
  dropShards(field, field.player.x, field.player.y, count);
  let guard = 0;
  while (field.shards.count > 0 && guard++ < 600) {
    field.xp = 0;
    stepTheWorld();
  }
  assert.ok(guard < 600, 'every shard the ship was standing on came in');
  return guard;
}

test('the card prints what the line is: one more shot of the gun per rank', () => {
  assert.equal(effectOf('magnetar'), '+1 shot off the field');
  const field = wearing(0);
  assert.equal(countOf(field, 'magnetar'), 0, 'and a build with no ranks hands out nothing');
  assert.equal(crackShotsOf(field), 0, 'which is no shots, not one shot of nothing');
  assert.equal(crackShotsOf(wearing(4)), 4 * MAG.step, 'and four ranks is four shots');
  assert.throws(() => gainOf(field, 'magnetar'), /not a line of shares/,
    'and it is a line of whole things, so nobody can ask it for a multiplier');
});

test('rank 0 is not a field that does nothing, it is no field at all', () => {
  const field = wearing(0);
  const body = ahead(field, 60, IMMORTAL);

  feed(field, MAG.cost * 3);
  assert.equal(field.magnetar.charge, 0, 'nothing is banked by a ship that has no field');
  assert.equal(chargeOf(field), 0);
  assert.equal(isPrimed(field), false);
  assert.equal(hasMagnetar(field), false);

  runFor(field, 1);
  assert.equal(hullGone(body), 0, 'and nothing lets go either');
});

test('a shard collected charges the field, and a gold one is six of them', () => {
  const field = wearing(1);
  assert.equal(field.magnetar.charge, 0);

  collect(field, 1);
  assert.equal(field.magnetar.charge, 1, 'one shard, one of the bank');

  field.magnetar.charge = 0;
  const rings = field.rings.count;
  dropBigShard(field, field.player.x, field.player.y);
  let guard = 0;
  while (field.shards.count > 0 && guard++ < 600) { field.xp = 0; stepTheWorld(); }
  assert.ok(guard < 600, 'the big shard came in');
  assert.ok(field.rings.count > rings, 'and one gold shard on its own is enough to let go');
  assert.equal(field.magnetar.charge, BALANCE.shards.big.worth - MAG.cost,
    'six of the bank, and the crack kept what the price did not spend');
});

test('the field lets go when the bank has paid for it, and spends exactly one price', () => {
  const field = wearing(1);
  const body = ahead(field, 60, IMMORTAL);

  feed(field, MAG.cost - 1);
  runFor(field, STEP);
  assert.equal(hullGone(body), 0, 'three shards of four is a field that has not let go');

  feed(field, 1);
  assert.equal(isPrimed(field), true);
  runFor(field, STEP);
  assert.equal(hullGone(body), weight(1), 'and the fourth one is the one that lets go');
  assert.equal(field.magnetar.charge, 0, 'the price and not the bank is what it costs');
});

test('a crack comes round every body inside the field and none outside it', () => {
  const field = wearing(2);
  const ship = field.player;
  const near = ahead(field, MAG.reach - 1, IMMORTAL);
  const onTheLine = marked([enemyAt('swarmling', ship.x + MAG.reach, ship.y, IMMORTAL)])[0];
  const outside = marked([enemyAt('swarmling', ship.x, ship.y + MAG.reach + 1, IMMORTAL)])[0];

  feed(field, MAG.cost);
  runFor(field, STEP);

  assert.equal(hullGone(near), weight(2), 'just inside, at two ranks');
  assert.equal(hullGone(onTheLine), weight(2), 'and standing on the line is inside it');
  assert.equal(hullGone(outside), 0, 'one px further out is out');
});

test('a rank buys weight and not reach: five ranks is the same crowd, five times heavier', () => {
  const ranks = [];
  const gone = [];
  for (const rank of [1, 2, 3, 4, 5]) {
    const field = wearing(rank);
    const bodies = [
      ahead(field, 50, IMMORTAL),
      ahead(field, MAG.reach - 1, IMMORTAL),
      marked([enemyAt('swarmling', field.player.x + MAG.reach + 1, field.player.y, IMMORTAL)])[0],
    ];
    feed(field, MAG.cost);
    runFor(field, STEP);
    ranks.push(rank);
    gone.push(hullGone(bodies[0]) + hullGone(bodies[1]));
    assert.equal(hullGone(bodies[2]), 0, 'the reach never moved, whatever the rank');
  }
  assert.deepEqual(ranks, [1, 2, 3, 4, 5]);
  assert.equal(gone[4], gone[0] * 5, 'and the fifth rank is five times the first, on the same crowd');
  for (let i = 1; i < gone.length; i++) assert.equal(gone[i], gone[0] * (i + 1));
});

test('a pile worth several cracks pays them out one per step', () => {
  const field = wearing(1);
  const body = ahead(field, 60, IMMORTAL);

  feed(field, MAG.cost * 3);
  runFor(field, STEP);
  assert.equal(hullGone(body), weight(1), 'one step, one crack, however full it was');
  assert.equal(field.magnetar.charge, MAG.cost * 2, 'and the rest of the bank is still there');

  runFor(field, STEP * 2);
  assert.equal(hullGone(body), weight(1) * 3, 'three cracks, three prices, three steps');
  assert.equal(field.magnetar.charge, 0);
});

test('what leaves a body is shots of the ship\'s own gun, so the damage line pays for it', () => {
  const field = wearing(3);
  field.upgrades.damage = 2;
  const body = ahead(field, 60, IMMORTAL);
  // Written in the order game/magnetar.js multiplies it, to the last bit.
  const expected = crackShotsOf(field) * GUN.damage * gainOf(field, 'damage');

  feed(field, MAG.cost);
  runFor(field, STEP);
  // A tolerance, not an equality: the body's hull is enormous on purpose, and an enormous number
  // with a fraction taken off it is not the same number twice over to the last bit.
  assert.ok(Math.abs(hullGone(body) - expected) < 1e-6,
    'lost ' + hullGone(body) + ' where rank, gun and the damage line say ' + expected
    + ' - exactly as a drone bite and a nova front are priced');
});

test('the field never hurts the ship, whatever is standing in it', () => {
  const field = wearing(1);
  const ship = field.player;
  ship.invuln = 0;
  ahead(field, 40, IMMORTAL);
  const hull = ship.hull;

  feed(field, MAG.cost);
  runFor(field, STEP * 4);
  assert.equal(ship.hull, hull, 'the ship is not one of the bodies in its own field');
});

test('a crack is not a hit: it sets nothing alight and freezes nothing', () => {
  const field = wearing(1);
  field.upgrades.burn = BALANCE.upgrades.burn.ranks;
  field.upgrades.chill = BALANCE.upgrades.chill.ranks;
  const body = ahead(field, 60, IMMORTAL);
  // A bullet would leave both behind on its way past (game/bullets.js). The field does not.
  ignite(field, body);
  const lit = field.fires.count;
  body.frost = 0;

  feed(field, MAG.cost);
  runFor(field, STEP);
  assert.ok(hullGone(body) > 0, 'it hurt it');
  assert.equal(field.fires.count, lit, 'and no fire was added by the hurt');
  assert.equal(body.frost, 0, 'and no frost either');
  chill(field, body);
  assert.ok(body.frost > 0, '(a hit does leave frost, so the compare above was reading something)');
});

test('from the third rank a body the field kills leaves a shard, and before it does not', () => {
  for (const rank of [MAG.seed.at - 1, MAG.seed.at]) {
    const field = wearing(rank);
    const doomed = ahead(field, 60, 1);
    field.shards.clear();
    // Every body pays its own shards when it comes down (game/enemies.js); what this card adds is
    // whether there is one *more* on top of that. So the body's own drop is the floor of the count
    // at every rank, and the third rank buys one above it.
    const itsOwn = doomed.drop;

    feed(field, MAG.cost);
    runFor(field, STEP);
    assert.ok(doomed.hp <= 0, 'the body came down at both ranks');
    assert.equal(field.enemies.includes(doomed), false, 'and it is out of the crowd');
    const extra = field.shards.count - itsOwn;
    if (rank >= MAG.seed.at) assert.equal(extra, MAG.seed.count, 'and the field paid a shard for it');
    else assert.equal(extra, 0, 'and two ranks is not three');
  }
});

test('a body the field kills is the run\'s own kill, score and all', () => {
  const field = wearing(1);
  const doomed = ahead(field, 60, 1);
  const before = { kills: field.kills, score: field.score };

  feed(field, MAG.cost);
  runFor(field, STEP);
  assert.ok(doomed.hp <= 0);
  assert.equal(field.enemies.includes(doomed), false, 'the kill took it out of the crowd');
  assert.equal(field.kills, before.kills + 1, 'the kill is credited');
  assert.ok(field.score > before.score, 'and so is the score it pays');
});

test('a crack that sets off a bomber does not come apart on the way out', () => {
  const field = wearing(1);
  const ship = field.player;
  // One body about to come apart and one standing next to it, both inside the field: the
  // corpse's blast is paid out in the middle of the crack's own loop, which is the whole reason
  // the crowd is picked out before any of it is hurt (game/nova.js, game/blast.js).
  const bomber = marked([enemyAt('bomber', ship.x, ship.y - 60, 1)])[0];
  const neighbour = marked([enemyAt('drifter', ship.x + 12, ship.y - 60, IMMORTAL)])[0];

  feed(field, MAG.cost);
  runFor(field, STEP * 2);
  assert.ok(bomber.hp <= 0, 'the crack brought it down');
  assert.ok(hullGone(neighbour) > weight(1),
    'and what stood beside it took the crack *and* the blast, with nothing coming apart twice');
});

test('the crack costs light, and the light is a ring and not a new sprite', () => {
  const field = wearing(1);
  ahead(field, 60, IMMORTAL);
  const ringsBefore = field.rings.count;

  feed(field, MAG.cost);
  stepTheWorld();
  assert.ok(field.rings.count > ringsBefore, 'two rings: the field collapsing in, and the ship');
  assert.ok(field.particles.count > 0, 'and the rim falling inwards');
});

test('the bank never goes past full for the frame that draws it', () => {
  const field = wearing(1);
  feed(field, MAG.cost * 4);
  assert.equal(chargeOf(field), 1, 'four cracks\' worth reads as one full ring');
  assert.equal(isPrimed(field), true);
});

test('the field spends no number out of the run stream, so a seed is still a seed', () => {
  const field = wearing(1);
  const bodies = [];
  for (let i = 0; i < 6; i++) bodies.push(ahead(field, 40 + i * 30, IMMORTAL));
  runFor(field, STEP);

  const state = logic.state;
  for (let i = 0; i < 400; i++) {
    feed(field, 1);
    field.shards.clear();
    field.xp = 0;
    stepTheWorld();
  }
  assert.ok(bodies.some((body) => hullGone(body) > 0), 'and it was cracking all the way through');
  assert.equal(logic.state, state, 'not one draw from the stream a run is made of');
});

test('a new run forgets whatever the last one had banked', () => {
  const field = wearing(2);
  feed(field, MAG.cost);
  assert.ok(field.magnetar.charge > 0);
  resetRun(field);
  assert.equal(field.magnetar.charge, 0, 'loot picked up by the last run is not this run\'s to spend');
});
