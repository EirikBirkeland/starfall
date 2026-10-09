// The synergies, as the deal does them (PLAN 3.5's table: "needs X + Y, becomes Z").
//
// A synergy is dealt by what the run is built of and not by the draw, and that one difference is
// what these tests are about:
//
//   it is never face up before the run has earned it, however many levels are dealt;
//   once earned it is face up every time, because a payoff cannot be left to the luck of a
//     weighted draw - and it takes a place in the table rather than being added to a full one;
//   taking it is one rank and one level, and there is no second rank of it to take;
//   it cannot be banished - a run refusing what its own build became is not a choice the game
//     offers - while a reroll can turn it over for a level, and it comes back at the next one;
//   and none of this touches the ordinary deal: a run that has earned nothing sees the cards it
//     always saw, which is why the reference run is the run it was (NOTES, session 49).
//
// These are the rule tests, so they run on the scripted world and never press a key: what the
// keys and the mouse do about a synergy card belongs to test/synergy-card.test.mjs, and the two
// must not share a process (NOTES session 48: the world is a singleton).

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { levelUp } from '../src/game/progress.js';
import {
  LINES, banishOffer, describeRanks, effectOf, hasSynergy, isSynergy, lineOf, maxRanksOf,
  needsOf, rankOf, rerollOffer, takeOffer,
} from '../src/game/upgrades.js';
import { scriptedRun } from '../tools/headless/scripted.js';

const SHOCK = 'thermalShock';
const NEEDS = BALANCE.upgrades[SHOCK].needs;
const TABLE = BALANCE.cards.offer;

/** A run stopped at a choice, its build set to `ranks` and nothing else in the way. */
function aRunChoosing(seed, ranks) {
  const field = scriptedRun(seed);
  for (const line of LINES) field.upgrades[line.id] = ranks[line.id] === undefined ? 0 : ranks[line.id];
  field.offer.length = 0;
  field.pendingLevels = 0;
  field.banished.length = 0;
  levelUp(field);
  assert.equal(field.state, STATE.LEVEL, 'the run stopped to ask');
  return field;
}

/** Both parents at exactly the depth the card asks for, and nothing else. */
function earnedBuild(extra) {
  const ranks = {};
  for (const need of NEEDS) ranks[need.line] = need.rank;
  return Object.assign(ranks, extra === undefined ? {} : extra);
}

test('a synergy is a card with needs, and a line is a card without them', () => {
  assert.ok(isSynergy(SHOCK), 'thermal shock is one');
  assert.deepEqual(needsOf(SHOCK), NEEDS, 'and what it needs is written down');
  for (const line of LINES) {
    if (line.id === SHOCK) continue;
    assert.equal(isSynergy(line.id), false, line.id + ' is a line');
    assert.equal(needsOf(line.id), undefined, line.id + ' is dealt out of the deck');
  }

  assert.equal(maxRanksOf(SHOCK), 1, 'PLAN 3.5 gives it no ranks to grow into');
  assert.equal(effectOf(SHOCK), lineOf(SHOCK).becomes, 'its card prints what it becomes');
});

test('the needs are PLAN 3.5  - burn 3 and chill 3', () => {
  const byLine = {};
  for (const need of NEEDS) byLine[need.line] = need.rank;
  assert.equal(byLine.burn, 3, 'burn three');
  assert.equal(byLine.chill, 3, 'chill three');
});

test('it is never face up before the run has earned it', () => {
  const almost = {};
  almost[NEEDS[0].line] = NEEDS[0].rank;          // one of the two, all the way
  almost[NEEDS[1].line] = NEEDS[1].rank - 1;      // and the other one short

  for (let seed = 0; seed < 40; seed++) {
    const field = aRunChoosing(100 + seed, almost);
    assert.ok(!field.offer.includes(SHOCK),
      'seed ' + seed + ' was dealt ' + field.offer.join(', ') + ' on one rank short');
  }

  // ...and not one level after either: it is the next level that shows it, because the level that
  // bought the last rank has already been answered by the card that bought it.
  const field = aRunChoosing(141, almost);
  field.upgrades[NEEDS[1].line] = NEEDS[1].rank;
  field.offer.length = 0;
  field.pendingLevels = 0;
  levelUp(field);
  assert.ok(field.offer.includes(SHOCK), 'and then it came');
});

test('once earned it is face up every time, and not in place of the other two cards', () => {
  for (let seed = 0; seed < 40; seed++) {
    const field = aRunChoosing(200 + seed, earnedBuild());
    assert.ok(field.offer.includes(SHOCK),
      'seed ' + seed + ' earned the card and was dealt ' + field.offer.join(', '));
    assert.equal(field.offer.length, TABLE,
      'and the table is still the table: a synergy takes a place in it, it is not added to it');
    assert.equal(field.offer[field.offer.length - 1], SHOCK,
      'and it is always the right-hand card, so a player learns where to look');
    assert.equal(new Set(field.offer).size, TABLE, 'and no card comes twice');
  }
});

test('taking it is one rank, one level, and the last of it', () => {
  const field = aRunChoosing(301, earnedBuild());
  const level = field.player.level;

  assert.equal(takeOffer(field, field.offer.indexOf(SHOCK)), true, 'the card was taken');
  assert.equal(field.upgrades[SHOCK], 1, 'and one rank banked');
  assert.equal(field.pendingLevels, 0, 'and the level paid for');
  assert.equal(field.player.level, level, 'the level was spent by answering, not by taking it');
  assert.equal(field.state, STATE.PLAY, 'and the run is flying again');
  assert.ok(hasSynergy(field, SHOCK), 'which is the whole question the sim asks');

  field.offer.length = 0;
  field.pendingLevels = 0;
  levelUp(field);
  assert.ok(!field.offer.includes(SHOCK), 'and it is never dealt again: one rank is one rank');
  assert.equal(field.offer.length, TABLE, 'so the table went back to being three lines');
});

test('a reroll turns the earned card over for a level, and the next level shows it again', () => {
  const field = aRunChoosing(302, earnedBuild());
  const before = field.offer.slice();

  assert.equal(rerollOffer(field), true, 'the run may argue with a table it has been handed');
  assert.ok(!field.offer.includes(SHOCK), 'and turning the table over is how it says not now');
  assert.equal(field.upgrades[SHOCK], 0, 'the ask bought a look and not a rank');
  assert.equal(field.pendingLevels, 1, 'and the level is still owed');
  assert.equal(field.offer.length, TABLE, 'on a full table of its own');
  assert.notDeepEqual(field.offer.slice(), before, 'which is not the table it was');

  takeOffer(field, 0);
  field.pendingLevels = 0;
  field.offer.length = 0;
  levelUp(field);
  assert.ok(field.offer.includes(SHOCK), 'and it comes back at the next level, because it is earned');
});

test('a synergy cannot be banished, and asking costs nothing', () => {
  const field = aRunChoosing(303, earnedBuild());
  const at = field.offer.indexOf(SHOCK);
  const banishes = field.banishesLeft;
  const table = field.offer.slice();

  assert.equal(banishOffer(field, at), false, 'the ask is refused');
  assert.equal(field.banishesLeft, banishes, 'and not spent');
  assert.deepEqual(field.offer.slice(), table, 'on a table nobody touched');
  assert.equal(rankOf(field, SHOCK), 0, 'and the card is still face up, still owed');

  // and the game-over line does not list it as something the run refused
  assert.ok(describeRanks(field).indexOf('NO ') < 0, describeRanks(field));
});

test('a run that has taken everything else is offered only the synergy, and cannot get rid of it', () => {
  const everything = {};
  for (const line of LINES) everything[line.id] = maxRanksOf(line.id);
  delete everything[SHOCK];                       // everything except the synergy, which is earned
  const field = aRunChoosing(304, everything);

  assert.deepEqual(field.offer, [SHOCK], 'one card, because one card is all that is left to give');
  assert.equal(rerollOffer(field), false, 'and there is no other table to deal');
  assert.equal(banishOffer(field, 0), false, 'and no way to refuse this one');
  assert.equal(field.state, STATE.LEVEL, 'so the run holds still until it takes it');
  assert.equal(takeOffer(field, 0), true, 'and taking it is the answer');
  assert.equal(field.state, STATE.PLAY, 'after which a level is a level and not a pause');
});

test('the ordinary deal spends what it always spent: a run that earned nothing sees three lines', () => {
  // The guarantee of "at least one line the run has never taken" is drawn from the lines, and must
  // not reach for a synergy it has no business dealing - and when a synergy *is* face up it is the
  // newest thing there, so the promise is already kept.
  for (let seed = 0; seed < 40; seed++) {
    const field = aRunChoosing(400 + seed, {});
    assert.equal(field.offer.length, TABLE);
    for (const id of field.offer) assert.equal(isSynergy(id), false, 'nothing earned, nothing special');
    assert.ok(field.offer.some((id) => rankOf(field, id) === 0),
      'and one of them is still a line the run has never taken');
  }

  const earned = aRunChoosing(441, earnedBuild());
  assert.ok(earned.offer.some((id) => rankOf(earned, id) === 0),
    'and a table with a synergy on it still has something new on it');
});

test('the build line names a synergy by itself, without a rank after it', () => {
  const field = aRunChoosing(500, earnedBuild({ damage: 2 }));
  takeOffer(field, field.offer.indexOf(SHOCK));

  const build = describeRanks(field);
  assert.ok(build.indexOf('THERMAL SHOCK') >= 0, build);
  assert.ok(build.indexOf('THERMAL SHOCK 1') < 0, 'one rank is not worth printing: ' + build);
  assert.ok(build.indexOf('DAMAGE 2') >= 0, 'next to the lines that have depths: ' + build);
});

test('a new run has not found it again, and can find it a second time', () => {
  const field = aRunChoosing(600, earnedBuild());
  takeOffer(field, field.offer.indexOf(SHOCK));
  assert.equal(hasSynergy(field, SHOCK), true);

  scriptedRun(601);
  assert.equal(rankOf(field, SHOCK), 0, 'the ranks are this run\'s and this run starts with none');
  assert.equal(hasSynergy(field, SHOCK), false);
  field.upgrades.burn = 3;
  field.upgrades.chill = 3;
  field.offer.length = 0;
  field.pendingLevels = 0;
  levelUp(field);
  assert.ok(field.offer.includes(SHOCK), 'and it can be earned again from the beginning');
});
