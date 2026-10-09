// The two asks a run may make about its own deal (PLAN 3.7): reroll the table, or banish
// one of the lines on it out of the run for good.
//
// This is the rule, played out on the scripted world - what may be refused, what is spent,
// what can never come back, and what a fresh run is granted. What the keys and the mouse do
// about it belongs to test/level-up.test.mjs, which boots the real game.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { levelUp } from '../src/game/progress.js';
import {
  LINES, banishOffer, banishedLines, describeRanks, maxRanksOf, rankOf,
  rerollOffer, takeOffer,
} from '../src/game/upgrades.js';
import { scriptedRun } from '../tools/headless/scripted.js';

const IDS = LINES.map((line) => line.id);
const GRANTS = BALANCE.cards;

/** Max out every line but the ones named, so the deck is exactly as big as the name says. */
function leaveOnly(world, ids) {
  for (const id of IDS) {
    world.upgrades[id] = ids.indexOf(id) >= 0 ? 0 : maxRanksOf(id);
  }
}

/**
 * A run holding still with a fresh table, dealt from a deck that holds only `ids`.
 *
 * The table has to be swept before the level is earned: a choice already on the table is
 * the choice the run is having, and a second level does not print over it.
 */
function aRunChoosing(seed, ids) {
  const world = scriptedRun(seed);
  if (ids !== undefined) leaveOnly(world, ids);
  world.offer.length = 0;
  world.pendingLevels = 0;
  levelUp(world);

  assert.equal(world.state, STATE.LEVEL, 'the run stopped to ask');
  assert.ok(world.offer.length > 0, 'and dealt what it has');
  assert.ok(world.offer.length <= GRANTS.offer, 'and no more than a table holds');
  return world;
}

// ---- the rule ----------------------------------------------------------------

test('a reroll deals a different table and costs one ask', () => {
  const world = aRunChoosing(71);
  const before = world.offer.slice();
  const asks = world.rerollsLeft;

  assert.ok(rerollOffer(world), 'the run got its table back');
  assert.equal(world.rerollsLeft, asks - 1, 'and paid for it');
  assert.equal(world.offer.length, GRANTS.offer, 'a full table again');
  for (const id of world.offer) {
    assert.ok(before.indexOf(id) < 0, id + ' was face up already; a reroll that hands it back bought nothing');
  }
  assert.equal(world.pendingLevels, 1, 'and the level is still owed - a reroll is not an answer');
  assert.equal(world.state, STATE.LEVEL, 'so the run is still holding still');
});

test('a reroll re-deals the same deck: it does not reset what has been taken', () => {
  const world = aRunChoosing(72);
  const first = world.offer[0];
  takeOffer(world, 0);
  levelUp(world);

  const ranks = Object.assign({}, world.upgrades);
  rerollOffer(world);
  assert.deepEqual(world.upgrades, ranks, 'taking a card is the only thing that banks a rank');
  assert.ok(world.offer.length > 0, 'and there is still a table to look at');
});

test('a reroll is refused when every line with a rank left is already face up', () => {
  const world = aRunChoosing(73, [IDS[0], IDS[1]]);
  // Two lines left in the whole deck, both on the table: any other deal would have to
  // repeat one of them, so there is no other table to deal.
  const asks = world.rerollsLeft;
  assert.ok(world.offer.length < GRANTS.offer, 'the table is short, because the deck is: ' + world.offer.length);
  assert.equal(rerollOffer(world), false, 'and there is nothing to deal it out of');
  assert.equal(world.rerollsLeft, asks, 'an ask that bought nothing is kept');
});

test('a reroll is refused once the run has spent its asks, and every run is granted one', () => {
  const world = aRunChoosing(74);
  assert.equal(world.rerollsLeft, GRANTS.rerolls, 'a fresh run holds ' + GRANTS.rerolls);

  while (world.rerollsLeft > 0) assert.ok(rerollOffer(world), 'and it can spend each one');
  const table = world.offer.slice();
  assert.equal(rerollOffer(world), false, 'the next ask is refused');
  assert.deepEqual(world.offer.slice(), table, 'and the table is left alone');
});

test('a banished line is out of the run, refilled on the spot, and never dealt again', () => {
  const world = aRunChoosing(75);
  const gone = world.offer[1];
  const asks = world.banishesLeft;

  assert.ok(banishOffer(world, 1), 'the ask is granted');
  assert.equal(world.banishesLeft, asks - 1, 'and paid for');
  assert.deepEqual(banishedLines(world), [gone], 'the line is on the list of what is gone');
  assert.equal(world.offer.length, GRANTS.offer, 'and the slot was filled, so the run still has its three');
  assert.ok(world.offer.indexOf(gone) < 0, 'but not with the line that just went');
  assert.equal(world.pendingLevels, 1, 'a banish is not an answer to the level');
  assert.equal(world.state, STATE.LEVEL, 'and the run is still being asked');

  // ...and it stays gone: every card the run is offered from now on, however it is dealt.
  for (let i = 0; i < 40; i++) {
    if (world.state !== STATE.LEVEL) levelUp(world);
    rerollOffer(world);
    assert.ok(world.offer.indexOf(gone) < 0, gone + ' came back to the table');
  }
});

test('a banish that cannot be replaced still leaves a table to choose from', () => {
  const room = [IDS[0], IDS[1], IDS[2]];
  const world = aRunChoosing(76, room);
  const gone = world.offer[0];
  assert.equal(world.offer.length, room.length, 'three lines, three cards');

  assert.ok(banishOffer(world, 0), 'the cut is granted even with nothing to stand in for it');
  assert.ok(world.offer.indexOf(gone) < 0, 'the line went');
  assert.ok(world.offer.length >= 1, 'and ' + world.offer.length + ' cards are left to answer the level with');
  assert.equal(world.state, STATE.LEVEL, 'which the run still has to do');

  const taking = world.offer[0];
  const before = rankOf(world, taking);
  takeOffer(world, 0);
  assert.equal(rankOf(world, taking), before + 1, 'and taking one of them pays for it as usual');
});

test('a banish is refused when nothing is left to put in the slot, and keeps its ask', () => {
  const world = aRunChoosing(77, [IDS[0]]);
  assert.equal(world.offer.length, 1, 'one line, one card');

  const asks = world.banishesLeft;
  const ranks = rankOf(world, IDS[0]);
  assert.equal(banishOffer(world, 0), false, 'cutting it would leave an empty table and an unpaid level');
  assert.equal(world.banishesLeft, asks, 'the ask is kept');
  assert.deepEqual(banishedLines(world), [], 'nothing was cut');
  assert.equal(rankOf(world, IDS[0]), ranks, 'and nothing was taken either');
});

test('a banish is refused once the run has spent its asks', () => {
  const world = aRunChoosing(78);
  assert.equal(world.banishesLeft, GRANTS.banishes, 'a fresh run holds ' + GRANTS.banishes);

  assert.ok(banishOffer(world, 0), 'one is spendable');
  const asks = world.banishesLeft;
  const table = world.offer.slice();
  assert.equal(asks, 0, 'and then there are none');
  assert.equal(banishOffer(world, 0), false, 'so the next one is refused');
  assert.deepEqual(world.offer.slice(), table, 'on a table nobody touched');
});

test('an ask about a card that is not on the table is refused, and asks nothing', () => {
  const world = aRunChoosing(79);
  const banishes = world.banishesLeft;
  const rerolls = world.rerollsLeft;

  assert.equal(banishOffer(world, 9), false, 'there is no ninth card');
  assert.equal(banishOffer(world, -1), false, 'and no minus-first card');
  assert.equal(world.banishesLeft, banishes, 'both were refused before anything was spent');

  world.state = STATE.PLAY;
  assert.equal(rerollOffer(world), false, 'and with no choice on the table, a reroll is refused too');
  assert.equal(world.rerollsLeft, rerolls);
});

test('a run that cut something out says so on its game-over card', () => {
  const world = aRunChoosing(82);
  banishOffer(world, 0);
  const cut = banishedLines(world)[0];

  assert.ok(describeRanks(world).indexOf('NO ' + LINES.filter((line) => line.id === cut)[0].name) >= 0,
    'the build line names what the run refused: ' + describeRanks(world));
});

test('the next run is granted its asks again and has cut nothing', () => {
  const world = aRunChoosing(83);
  rerollOffer(world);
  banishOffer(world, 0);
  assert.equal(world.rerollsLeft, 0, 'this run spent its reroll');
  assert.ok(banishedLines(world).length > 0, 'and spent its banish on something');

  scriptedRun(84);   // the same world, a new run: resetRun is what hands both back
  assert.equal(world.rerollsLeft, GRANTS.rerolls, 'the reroll is back');
  assert.equal(world.banishesLeft, GRANTS.banishes, 'the banish is back');
  assert.deepEqual(banishedLines(world), [], 'and the deck has nothing cut out of it');
});
