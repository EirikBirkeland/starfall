// BY HAND (game/challenges.js, BALANCE.challenges.byhand): the shard net reaches a share of the way it
// ships with, so loot that is not under the ship stays where it fell and has to be flown to.
//
// The plain game pulls every shard within 145 px of the ship's centre off the floor, and the attractor
// line doubles that; the rule multiplies the whole of the reach by `reachMul` (two fifths as it ships, so
// a little under 60 px). Three things are worth holding about that, and each is what one of these tests
// is for:
//
//   **the rule shortens the net and nothing else about the loot.** A shard still lies where the body fell,
//     still waits the whole of `shards.life`, still pays what it pays, and a ship that flies on top of one
//     still banks it at the same `collectRadius`. The rule takes the free half of a kill away, not the
//     kill's reward.
//   **the attractor line keeps selling something.** The row holds a *share* and not a radius for exactly
//     this reason: five ranks of the line under the rule are five ranks of a shorter net, not five ranks
//     of nothing. A card that can do nothing is not a small choice but no choice, which is why NO DASH
//     takes the two dash lines out of the deck instead of dealing them dead (see `gatedOn`) - the
//     attractor line does not need that treatment, and this file is where that is checked.
//   **the well keeps its shape as it shrinks.** The pull gradient is measured over the reach and not over
//     the balance table (game/upgrades.js), so a shard at the rim of the shortened net is tugged as hard
//     as one at the rim of the wide one. Were it not so, the rule would leave a net that is not smaller
//     but merely weaker, and a run that took the line would pay the rule's price twice.
//
// No distance here is raced: every one of them is written from the reach itself, so moving the row moves
// the tests with it instead of turning them into a race nobody can win.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { world } from '../src/game/world.js';
import { attractorReachOf } from '../src/game/upgrades.js';
import { cardIsUsable, saysOf, setChallenge, shardReachMulOf } from '../src/game/challenges.js';
import { scriptedRun, shardAt, stepTheWorld } from '../tools/headless/scripted.js';

const BASE = BALANCE.shards.magnetRadius;
const COLLECT = BALANCE.shards.collectRadius;
const SHIPPED = BALANCE.challenges.byhand.reachMul;
const RANKS = BALANCE.upgrades.attractor.ranks;

/**
 * A run parked mid-flight under `id` as its rule, wearing `rank` ranks of the attractor line, with no
 * levels to be had.
 *
 * `xpNeed` is shut because collecting shards is what half these tests do, and a level arriving in the
 * middle of one would deal a card over the top of the test (game/progress.js stops the arena for the
 * rack). The scripted world is one per process (tools/headless/scripted.js), which is why the helpers
 * below read `world` rather than being handed it.
 */
function worldUnder(id, rank) {
  const field = scriptedRun(2400 + (rank === undefined ? 0 : rank));
  field.xpNeed = Infinity;
  field.upgrades.attractor = rank === undefined ? 0 : rank;
  setChallenge(field, id);
  return field;
}

/** A shard lying `far` px to the right of the ship and standing still. */
function shardBeyond(far) {
  return shardAt(world.player.x + far, world.player.y);
}

/** How far a shard stands from the ship's centre right now. */
function distanceTo(shard) {
  return Math.hypot(shard.x - world.player.x, shard.y - world.player.y);
}

/** Step the arena for `steps` of the game's own fixed steps. */
function steps(count) {
  for (let i = 0; i < count; i++) stepTheWorld();
}

// --- the number ---------------------------------------------------------------------

test('no rule flying leaves the net the whole reach the table ships', () => {
  const plain = worldUnder('');
  assert.equal(shardReachMulOf(plain), 1);
  assert.equal(attractorReachOf(plain), BASE);
  // ...and no *other* rule speaks about the loot, either. Every one of them is a rule about something
  // else, and a lever that answered for a rule that never asked would move runs nobody chose.
  for (const id of ['brittle', 'grounded', 'merciless', 'swift', 'thick', 'thin']) {
    assert.equal(shardReachMulOf({ challenge: id }), 1, id + ' spoke about the shard net');
  }
});

test('the rule cuts the whole net, at every rank of the line', () => {
  for (let rank = 0; rank <= RANKS; rank++) {
    const plain = attractorReachOf(worldUnder('', rank));
    const ruled = attractorReachOf(worldUnder('byhand', rank));
    assert.ok(Math.abs(ruled - plain * SHIPPED) < 1e-9,
      'rank ' + rank + ': ' + ruled.toFixed(1) + ' is not ' + SHIPPED + ' of ' + plain.toFixed(1));
  }
});

test('the attractor line still buys ground under the rule', () => {
  // The reason the row holds a share and not a radius. Rank for rank the line is worth the same *share*
  // of the net it has left, so a run under this rule can still buy a wider well - it just starts further
  // in. If this ever reads flat, the line has to join `gatedOn` or the deck is dealing dead cards.
  const none = attractorReachOf(worldUnder('byhand', 0));
  const high = attractorReachOf(worldUnder('byhand', RANKS));
  assert.ok(high > none * 2, 'a full stack is worth less than a doubling: ' + none + ' -> ' + high);
  assert.equal(cardIsUsable(worldUnder('byhand'), 'attractor'), true,
    'and the line is still on the rack, because it can still do something');
});

// --- the number where it is spent ---------------------------------------------------

test('a shard between the two nets lies where it fell under the rule and comes in plainly', () => {
  const plain = attractorReachOf(worldUnder(''));
  const ruled = attractorReachOf(worldUnder('byhand'));
  assert.ok(ruled < plain - 1, 'the rule has to leave a gap between the two nets to be seen at all');
  const between = ruled + (plain - ruled) / 2;

  worldUnder('byhand');
  const shard = shardBeyond(between);
  steps(30);
  assert.ok(Math.abs(distanceTo(shard) - between) < 1e-9,
    'a shard outside the net moved, and nothing should pull it');

  worldUnder('');
  const same = shardBeyond(between);
  steps(30);
  assert.ok(distanceTo(same) < between - 1,
    'the same shard in the plain game never came: ' + distanceTo(same) + ' of ' + between);
});

test('a shard inside the shortened net still comes in', () => {
  const ruled = attractorReachOf(worldUnder('byhand'));
  worldUnder('byhand');
  const shard = shardBeyond(ruled * 0.6);
  const start = distanceTo(shard);
  steps(30);
  assert.ok(distanceTo(shard) < start - 1,
    'a shard inside the net was not pulled: ' + distanceTo(shard) + ' of ' + start);
});

test('the tug at the rim of the net is the same tug however wide the net is', () => {
  // The gradient is measured over the reach (game/upgrades.js `attractorReachOf`), so a shard on the rim
  // of a short net is pulled as hard as one on the rim of a wide one: the rule moves the rim, it does not
  // thin the pull out over it.
  const tugsTo = (id) => {
    const field = worldUnder(id);
    const shard = shardBeyond(attractorReachOf(field) * 0.95);
    stepTheWorld();
    return Math.abs(shard.vx);
  };
  const wide = tugsTo('');
  const short = tugsTo('byhand');
  assert.ok(wide > 0, 'the plain net pulled nothing at its own rim');
  assert.ok(Math.abs(short - wide) / wide < 1e-9,
    'the short net tugs ' + short + ' and the wide one ' + wide);
});

test('flying at the pile still collects it', () => {
  // The whole of what the card asks for: come and get it. The ship does not move here and the shard is
  // laid on top of it, which is all "flying at it" costs under this rule and nothing more.
  const field = worldUnder('byhand');
  shardBeyond(COLLECT - 5);
  steps(10);
  assert.equal(field.shards.count, 0, 'the shard was lying on the ship and was not taken');
});

// --- the words ----------------------------------------------------------------------

test('the card says the share it charges, whatever the row says it is', () => {
  try {
    BALANCE.challenges.byhand.reachMul = 0.25;
    assert.equal(saysOf('byhand'), 'the shard pull reaches only 25% as far');
    BALANCE.challenges.byhand.reachMul = 1;
    assert.equal(saysOf('byhand'), 'the shard pull reaches only 100% as far');
  } finally {
    BALANCE.challenges.byhand.reachMul = SHIPPED;
  }
  assert.match(saysOf('byhand'), new RegExp(Math.round(SHIPPED * 100) + '% as far'));
});
