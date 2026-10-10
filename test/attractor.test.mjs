// ATTRACTOR (PLAN milestone 10's first item, and the owner's request of 2026-10-10: "an Attractor
// mod ... increases attraction range allowing you to collect faster").
//
// One number, read where shards are drawn in: how far off a shard lets go of the arena and starts
// coming towards the ship. So everything this file proves is about a distance:
//
//   rank 0 is the game that shipped - the reach is the balance table's own, exactly, and a shard
//     outside it is not touched at all;
//   every rank buys the share the card says it does, and that share is a distance in the arena and
//     not only a number on a card: the same shard, planted at the same place on the same seed, is
//     left where it is by rank 0 and dragged home by the last rank;
//   a rank widens the well *and* deepens it, because the pull gradient is measured over the reach
//     and not over the table's radius - the deliberate choice written down in game/upgrades.js, and
//     proved here as an inward speed rather than as an argument;
//   and it buys reach and not grab: `shards.collectRadius` is nothing to do with this line, so a
//     wide net still has to be paid for by a shard actually arriving.
//
// The scripted world's ship sits in the middle of the arena and does not move unless a test drives
// it, and a planted shard does not move either until the reach reaches it, so "outside the net" and
// "inside it" are distances this file chooses rather than races it hopes to win.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { dropShards } from '../src/game/pickups.js';
import { attractorReachOf, effectOf, gainOf, lineOf } from '../src/game/upgrades.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const ATT = BALANCE.upgrades.attractor;
const SHARDS = BALANCE.shards;
const RANKS = ATT.ranks;
const BASE = SHARDS.magnetRadius;
const STEP = BALANCE.sim.step;

/**
 * A run wearing `rank` ranks of the line and nothing else, with no levels to be had. The seed is
 * the caller's to pin when two of these have to hold the same loot out to the same test.
 */
function wearing(rank, seed) {
  const field = scriptedRun(seed === undefined ? 1900 + rank : seed);
  field.xpNeed = Infinity;
  field.upgrades.attractor = rank;
  return field;
}

/** A shard lying at (x, y) and standing still, written field by field like any spawner must. */
function shardAt(field, x, y) {
  const shard = field.shards.spawn();
  shard.x = x;
  shard.y = y;
  shard.px = x;
  shard.py = y;
  shard.vx = 0;
  shard.vy = 0;
  shard.life = SHARDS.life;
  shard.spin = 0;
  shard.rot = 0;
  shard.worth = 1;
  return shard;
}

/** Step the world for `seconds` of the game's own steps. */
function forSeconds(seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) stepTheWorld();
}

/** The ship's middle, so the tests talk in distances and not in arena coordinates. */
function shipAt(field) {
  return { x: field.player.x, y: field.player.y };
}

// --- the number itself ---------------------------------------------------------------

test('rank 0 is the shipped game: the reach is the table and the gain is one', () => {
  const field = wearing(0);
  assert.equal(attractorReachOf(field), BASE);
  assert.equal(gainOf(field, 'attractor'), 1);
});

test('every rank is the share the card prints, and the line is a line of shares', () => {
  const field = wearing(0);
  assert.equal(lineOf('attractor').unit, 'percent', 'it sells a share and not a count');
  assert.equal(effectOf('attractor'), '+' + Math.round(ATT.step * 100) + '% shard reach');

  for (let rank = 0; rank <= RANKS; rank++) {
    field.upgrades.attractor = rank;
    assert.ok(Math.abs(attractorReachOf(field) - BASE * (1 + ATT.step * rank)) < 1e-9,
      'rank ' + rank + ' reaches ' + attractorReachOf(field).toFixed(1) + ' px');
  }
  assert.ok(attractorReachOf(field) > 2 * BASE,
    'and a full stack more than doubles the net: ' + attractorReachOf(field).toFixed(0) + ' px');
});

// --- the number where it is spent ----------------------------------------------------

test('a shard outside the reach is not touched, and one inside it is', () => {
  const field = wearing(0);
  const ship = shipAt(field);
  const outside = shardAt(field, ship.x + BASE + 1, ship.y);
  const inside = shardAt(field, ship.x + BASE - 1, ship.y);
  const outsideAt = BASE + 1;
  const insideAt = BASE - 1;

  forSeconds(0.5);

  assert.ok(Math.abs(outside.x - (ship.x + outsideAt)) < 1e-6,
    'the one a pixel beyond the net has not moved at all');
  assert.ok(inside.x < ship.x + insideAt - 1,
    'the one a pixel inside it is on its way in: ' + (ship.x + insideAt - inside.x).toFixed(1)
      + ' px gone');
});

test('a rank buys a distance in the arena and not only a line on a card', () => {
  // The same place on the arena and the same shard, twice: the only thing that differs is the rank.
  // At the old rim's distance rank 0 has no business with it and the last rank collects it.
  const out = BASE + 60;

  const cold = wearing(0);
  const coldShard = shardAt(cold, shipAt(cold).x + out, shipAt(cold).y);
  forSeconds(6);
  assert.equal(cold.shardsCollected, 0, 'rank 0 never noticed it');
  assert.equal(coldShard.worth, 1, 'and it is still lying there');

  const warm = wearing(RANKS);
  shardAt(warm, shipAt(warm).x + out, shipAt(warm).y);
  forSeconds(6);
  assert.equal(warm.shardsCollected, 1, 'five ranks of it are yours in six seconds');
});

test('a rank widens the well and deepens it: the same shard is pulled harder', () => {
  // The gradient is measured over the reach, so a shard that used to sit on the rim sits a little
  // inside the new one (game/upgrades.js). If that ever stops being true this is the test that says
  // so, and it is a real behaviour and not a comment: the shard arrives faster, not just from
  // further off.
  const at = BASE - 1;
  const measure = (rank) => {
    const field = wearing(rank);
    const ship = shipAt(field);
    const shard = shardAt(field, ship.x + at, ship.y);
    forSeconds(0.4);
    return -shard.vx;
  };

  const plain = measure(0);
  const full = measure(RANKS);
  assert.ok(plain > 0, 'the rim is inside the old net, so it is pulled at all: ' + plain.toFixed(1));
  assert.ok(full > plain * 1.5,
    'and at five ranks the same place is pulled ' + (full / plain).toFixed(2) + 'x as hard');
});

test('it buys reach and not grab: a shard still has to be paid for by arriving', () => {
  const field = wearing(RANKS);
  const ship = shipAt(field);
  const just = SHARDS.collectRadius + 6;
  const shard = shardAt(field, ship.x + just, ship.y);

  stepTheWorld();
  assert.equal(field.shardsCollected, 0, 'inside the net is not inside the ship');
  assert.ok(shard.life > 0, 'and it is not gone, only on its way');

  forSeconds(1);
  assert.equal(field.shardsCollected, 1, 'and it lands');
});

test('a pile the ship never flies over is what the wide net is for', () => {
  // The same seed scatters the same loot in both worlds - a rank of this line spends no number out
  // of the run's stream - so the two collections are the same pile, gathered twice.
  const scatterOver = (rank) => {
    const field = wearing(rank, 1977);
    const ship = shipAt(field);
    // Far enough out that nothing in the scatter can drift into the old net as it dies down (a
    // shard's whole flight is about a hundred px), and inside what five ranks reach.
    dropShards(field, ship.x + BASE + 130, ship.y, 30);
    forSeconds(8);
    return field.shardsCollected;
  };

  const plain = scatterOver(0);
  const full = scatterOver(RANKS);
  assert.equal(plain, 0, 'none of a pile a net-width off the old reach comes in for free: ' + plain);
  assert.ok(full > 10, 'and most of the same pile arrives for a run that took the line: ' + full);
});
