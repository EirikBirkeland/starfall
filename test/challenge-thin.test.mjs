// ONE CARD, the sixth rule and the only one about the **deal** (PLAN, After 1.0): the rack has one
// place instead of three, so which card a level buys is the game's business and not the run's.
//
// Two things are being held here, and only one of them is obvious:
//
//   **The rack is one card and not three** - which is the row, and reads where the deal counts its
//   places (game/upgrades.js asks `offerCountOf`, exactly as the crowd rules ask where their numbers are
//   spent). Everything else about a level-up stands: it still stops the run, still pays a level, still
//   stops dealing when the deck has nothing left.
//
//   **The fresh-line promise stands down**, and that is the half that would be a silent second rule.
//   `guaranteeSomethingNew` promises that while any line is untouched, one card on the table is one. On
//   a rack with a single place, keeping that promise would mean every card dealt is a fresh line - so no
//   line could ever be stacked twice, and the rule would be "a thin rack *and* a run that cannot commit"
//   without a number anywhere saying so. So the promise is about a table that offers a choice, and it
//   sits out when the table cannot. Test 3 below is the one that catches it: with the promise still
//   firing, `repeats` there is exactly zero, because the single card would be swapped for a fresh line
//   every single time.
//
// Rule tests, so the scripted world and no keys (the world is a singleton: one game per process).

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { levelUp } from '../src/game/progress.js';
import {
  LINES, maxRanksOf, rankOf, refreshOffer, rerollOffer, takeOffer,
} from '../src/game/upgrades.js';
import { offerCountOf } from '../src/game/challenges.js';
import { scriptedRun } from '../tools/headless/scripted.js';

const SHOCK = 'thermalShock';
const NEEDS = BALANCE.upgrades[SHOCK].needs;
const PLAIN_PLACES = BALANCE.cards.offer;
const RULE_PLACES = BALANCE.challenges.thin.offer;

/** A run stopped at a choice, under a rule, with its build set to `ranks` and nothing else in the way. */
function aRunChoosing(seed, ranks, challenge) {
  const field = scriptedRun(seed);
  field.challenge = challenge === undefined ? '' : challenge;
  for (const line of LINES) field.upgrades[line.id] = ranks[line.id] === undefined ? 0 : ranks[line.id];
  field.offer.length = 0;
  field.pendingLevels = 0;
  field.banished.length = 0;
  levelUp(field);
  assert.equal(field.state, STATE.LEVEL, 'the run stopped to ask');
  return field;
}

/** Both parents at the depth the synergy card asks for, and nothing else. */
function earnedBuild() {
  const ranks = {};
  for (const need of NEEDS) ranks[need.line] = need.rank;
  return ranks;
}

/** One level earned, mid-run: the run is holding still at a fresh choice. */
function earnLevel(field) {
  field.xp = field.xpNeed;
  levelUp(field);
}

test('the rack deals one card under the rule, and the whole one plainly', () => {
  for (let seed = 0; seed < 20; seed++) {
    const plain = aRunChoosing(900 + seed, {});
    assert.equal(plain.offer.length, PLAIN_PLACES, 'a plain run still has a choice to make');

    const thin = aRunChoosing(900 + seed, {}, 'thin');
    assert.equal(thin.offer.length, RULE_PLACES, 'the rule leaves one place to fill');
    assert.equal(thin.offer.length, offerCountOf(thin));
    assert.equal(thin.state, STATE.LEVEL, 'and the run still stops to ask');
  }
});

test('the one card is a line with a rank to give, and taking it is the answer', () => {
  const field = aRunChoosing(910, {}, 'thin');
  const taking = field.offer[0];
  assert.ok(LINES.some((line) => line.id === taking), taking + ' is a line the game knows');
  assert.ok(rankOf(field, taking) < maxRanksOf(taking), 'and it had a rank left to give');

  const owed = field.pendingLevels;
  assert.ok(owed > 0, 'the run owes a choice');
  assert.equal(takeOffer(field, 0), true);
  assert.equal(rankOf(field, taking), 1, 'the rank landed');
  assert.equal(field.pendingLevels, owed - 1, 'and the choice is paid for');
  assert.equal(field.state, STATE.PLAY, 'after which the run flies again');
});

test('the fresh-line promise stands down, so a line can be stacked twice under the rule', () => {
  // Forty levels taken under the rule, across five seeds, counting the times the card dealt was a line
  // the run had already opened. With the promise still firing this number is zero - that is what it means
  // for it to fire on a rack with one place - and with it standing down it is most of the forty, because
  // a deck of twenty-odd lines dealt forty times cannot help but come back round.
  let repeats = 0;
  let deals = 0;
  for (let seed = 0; seed < 5; seed++) {
    const field = aRunChoosing(920 + seed, {}, 'thin');
    for (let i = 0; i < 8; i++) {
      const id = field.offer[0];
      if (rankOf(field, id) > 0) repeats++;
      deals++;
      takeOffer(field, 0);
      field.state = STATE.PLAY;                 // the last take ended the pause; a level is owed again
      field.pendingLevels = 1;
      refreshOffer(field);
      assert.equal(field.state, STATE.LEVEL, 'the next level is another single card');
      assert.equal(field.offer.length, RULE_PLACES);
    }
  }
  assert.equal(deals, 40, 'every deal was dealt');
  assert.ok(repeats > 0, 'a run under ONE CARD can be handed a line it already opened; the fresh-line '
    + 'promise fired anyway, and a rule about a thin rack would also be a rule that no line can stack');

  // ...and the promise is alive where it has room: three places, and one of them is always a line the
  // run has never taken. This is the same claim test/upgrades.test.mjs makes of a plain deal, quoted
  // here because it is the promise this rule stands down, and a test that only checks the stand-down
  // could not tell "stood down" from "the promise was never there".
  const opened = { damage: 2, fireRate: 2, bulletSpeed: 1 };
  for (let seed = 0; seed < 40; seed++) {
    const plain = aRunChoosing(940 + seed, opened);
    assert.ok(plain.offer.some((id) => rankOf(plain, id) === 0),
      'a plain rack still shows something new: ' + plain.offer.join(', '));
  }
});

test('an earned synergy still takes the only place the rack has', () => {
  // The synergy is dealt by the build and not by the draw, and it takes a place in the table rather
  // than being added to a full one - so on a rack of one, it *is* the table.
  const field = aRunChoosing(960, earnedBuild(), 'thin');
  assert.deepEqual(field.offer, [SHOCK], 'one card, and it is the one the run walked towards');
});

test('a reroll still turns the one card over, and still costs the ask', () => {
  const field = aRunChoosing(970, {}, 'thin');
  const before = field.offer[0];
  const asks = field.rerollsLeft;
  assert.ok(asks > 0, 'a run is handed an ask to spend');

  assert.equal(rerollOffer(field), true, 'and there is another card to deal');
  assert.equal(field.rerollsLeft, asks - 1, 'the ask is spent');
  assert.equal(field.offer.length, RULE_PLACES, 'the rack is still one card');
  assert.notEqual(field.offer[0], before, 'and it is not the card it just sent back');

  // A rack with nothing else to deal is refused, and keeps the ask: an ask that buys nothing is never
  // charged, whichever rule is thinning the rack.
  for (const line of LINES) field.upgrades[line.id] = maxRanksOf(line.id);
  field.upgrades[LINES[1].id] = maxRanksOf(LINES[1].id) - 1;   // exactly one line has a rank left
  field.offer.length = 0;
  field.pendingLevels = 1;
  refreshOffer(field);
  assert.deepEqual(field.offer, [LINES[1].id], 'and that is the card it gets');
  const left = field.rerollsLeft;
  assert.equal(rerollOffer(field), false, 'no other table to deal');
  assert.equal(field.rerollsLeft, left, 'and the ask is still there');
});

test('a whole run under the rule is one card a level, and never a stall', () => {
  // Levels keep coming and the deck keeps thinning; the rule must not invent a fourth card or freeze the
  // run on an empty table. Taken to the point where the lines run out.
  const field = aRunChoosing(980, {}, 'thin');
  let levels = 0;
  for (let i = 0; i < 200; i++) {
    if (field.state !== STATE.LEVEL) {
      field.pendingLevels = 1;
      refreshOffer(field);
    }
    if (field.state !== STATE.LEVEL) break;         // the deck has nothing left to give
    assert.equal(field.offer.length, RULE_PLACES, 'one card, every time');
    takeOffer(field, 0);
    levels++;
    field.state = STATE.PLAY;
    field.pendingLevels = 1;
    refreshOffer(field);
  }
  assert.ok(levels >= 20, 'a run can spend a good many levels before the deck is empty: ' + levels);
  let ranks = 0;
  for (const line of LINES) ranks += rankOf(field, line.id);
  assert.equal(ranks, levels, 'every level bought exactly one rank');
});
