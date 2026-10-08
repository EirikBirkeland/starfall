// The upgrade lines and the level-up choice (PLAN 3.5, 3.6), as the simulation does
// it: the curve, what a rank is worth, what gets dealt, what happens when it is taken,
// and what happens when there is nothing left to deal.
//
// These run on the scripted world (tools/headless/scripted.js), so they can hand the
// run a level and then count what the pause did and did not do. What the *keys* and
// the mouse do about it belongs to test/level-up.test.mjs, which boots the real game.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { xpNeededFor, firstLevelXp, levelUp } from '../src/game/progress.js';
import {
  LINES, gainOf, rankOf, takeOffer, describeRanks, lineOf, effectOf,
  countOf, pierceOf, rateOf,
} from '../src/game/upgrades.js';
import { fire, shotsPerSecond, shotsPerPull } from '../src/game/weapons.js';
import { scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';

const PROGRESS = BALANCE.progression;
const IDS = LINES.map((line) => line.id);

/** Is this deal in the order the table prints it? */
function inTableOrder(offer) {
  const places = offer.map((id) => IDS.indexOf(id));
  return places.every((place, i) => i === 0 || place > places[i - 1]);
}

/** Everything the pause must hold still, as one comparable string. */
function whereEverythingStands(field) {
  const ship = field.player;
  const parts = [
    'elapsed:' + field.elapsed, 'score:' + field.score, 'kills:' + field.kills,
    'ship:' + ship.x + ',' + ship.y + ',' + ship.vx,
  ];
  for (const e of field.enemies) parts.push('e:' + e.x + ',' + e.y + ',' + e.hp);
  for (const b of field.bullets.items) parts.push('b:' + b.x + ',' + b.y);
  for (const s of field.shards.items) parts.push('s:' + s.x + ',' + s.y);
  return parts.join('|');
}

/** Level the run up exactly once: the XP is there, and the chime is spent. */
function earnLevel(field) {
  field.xp = field.xpNeed;
  levelUp(field);
}

test('one level costs what the curve says and more than the level before it', () => {
  assert.equal(xpNeededFor(4), Math.round(PROGRESS.base + 4 * PROGRESS.linear + 16 * PROGRESS.quad));
  assert.equal(firstLevelXp(), xpNeededFor(1), 'a fresh run is one level short of two');
  assert.ok(xpNeededFor(9) > xpNeededFor(8), 'and it gets dearer');
});

test('a level earned stops the run, and nothing in the arena moves while it is stopped', () => {
  const field = scriptedRun(31);
  earnLevel(field);

  assert.equal(field.state, STATE.LEVEL, 'the run is holding still');
  assert.equal(field.offer.length, BALANCE.cards.offer, 'and three cards are on the table');

  const before = whereEverythingStands(field);
  for (let i = 0; i < 10; i++) {
    assert.equal(stepTheWorld(), false, 'a paused step answers that it paused');
  }
  assert.equal(whereEverythingStands(field), before, 'nothing in the arena moved');
  assert.equal(field.player.level, 2, 'the level was banked');
  assert.equal(field.xp, 0, 'and paid for');
  assert.equal(field.xpNeed, xpNeededFor(2), 'and the next one is priced');
});

test('the cards on the table are three different lines with a rank left, in table order', () => {
  const field = scriptedRun(32);
  earnLevel(field);

  assert.equal(field.offer.length, BALANCE.cards.offer, 'as many cards as the table has places');
  assert.equal(new Set(field.offer).size, field.offer.length, 'no line comes twice');
  for (const id of field.offer) assert.ok(IDS.includes(id), id + ' is a line the game knows');
  assert.ok(inTableOrder(field.offer), 'and they are printed in the order the table knows them');

  // Max every line but three: the deal has to be exactly those three, whatever the
  // weights did, because there is nothing else to deal - and a maxed line stays off the
  // table however many levels are dealt.
  for (const id of IDS) field.upgrades[id] = BALANCE.upgrades[id].ranks;
  const room = IDS.slice(1, BALANCE.cards.offer + 1);
  for (const id of room) field.upgrades[id] = BALANCE.upgrades[id].ranks - 1;
  field.offer.length = 0;
  earnLevel(field);

  assert.deepEqual(field.offer, room, 'the three with a rank left, and nobody else');
  for (const id of field.offer) {
    assert.ok(field.upgrades[id] < BALANCE.upgrades[id].ranks, id + ' really did have a rank to give');
  }
});

test('a deal always has something the run has never taken (PLAN 3.5)', () => {
  // Three slots and four lines is the first time this can bite: a build that has been
  // going a while must not stop ever seeing a new line, or the game of choices stops
  // offering choices. So it is proved over a fistful of seeds rather than one.
  for (let seed = 0; seed < 60; seed++) {
    const field = scriptedRun(400 + seed);
    field.upgrades.damage = 3;
    field.upgrades.fireRate = 2;
    field.upgrades.bulletSpeed = 1;      // three lines with ranks, others still fresh
    earnLevel(field);

    assert.equal(field.offer.length, BALANCE.cards.offer);
    assert.ok(field.offer.some((id) => field.upgrades[id] === 0),
      'seed ' + seed + ' dealt nothing new: ' + field.offer.join(', '));
  }
});

test('a line with no ranks to give is never dealt, not even as the something new', () => {
  // `ranks: 0` is how a line is taken out of the game - it is what a measurement does to
  // get a baseline without it - and the guarantee above must not slip it in behind the
  // door. It took exactly that to make a "the nova is not in this game" A/B measure one
  // rank of the nova instead of none, because a line with no ranks in it is untouched
  // forever and so was the first thing the guarantee reached for (NOTES session 32).
  //
  // The shape that makes the guarantee fire: every line with a rank left has been taken
  // at least once, so there is nothing fresh in the deal and the guarantee goes looking.
  const ghost = 'split';
  const depth = BALANCE.upgrades[ghost].ranks;
  BALANCE.upgrades[ghost].ranks = 0;
  try {
    for (let seed = 0; seed < 40; seed++) {
      const field = scriptedRun(700 + seed);
      for (const id of IDS) {
        if (id !== ghost) field.upgrades[id] = BALANCE.upgrades[id].ranks - 1;
      }
      field.offer.length = 0;
      earnLevel(field);

      assert.equal(field.offer.length, BALANCE.cards.offer,
        'there were three cards to deal, of the lines that have a rank left');
      assert.ok(!field.offer.includes(ghost),
        'seed ' + seed + ' dealt ' + field.offer.join(', ') + ', and ' + ghost + ' has no ranks');
      assert.ok(field.offer.every((id) => field.upgrades[id] > 0),
        'and every card in it was a line the run had already taken, which is the case the '
        + 'guarantee is asked about');
    }
  } finally {
    BALANCE.upgrades[ghost].ranks = depth;
  }
});

test('taking a card banks the rank and hands the run back', () => {
  const field = scriptedRun(33);
  assert.equal(describeRanks(field), 'NO UPGRADES', 'a fresh run has no build to show');

  earnLevel(field);
  const taking = field.offer[0];
  assert.equal(takeOffer(field, 0), true);

  assert.equal(field.upgrades[taking], 1, 'the left-hand card was the ' + taking + ' line');
  assert.equal(rankOf(field, taking), 1);
  assert.equal(field.pendingLevels, 0);
  assert.equal(field.offer.length, 0, 'the table is clear');
  assert.equal(field.state, STATE.PLAY, 'and the run is running again');
  assert.equal(describeRanks(field), lineOf(taking).name + ' 1', 'and the build can be described');
});

test('a card that is not on the table is refused, and refuses to do anything', () => {
  const field = scriptedRun(34);
  assert.equal(takeOffer(field, 0), false, 'nothing is offered yet');

  earnLevel(field);
  assert.equal(takeOffer(field, field.offer.length), false, 'there is no fourth card');
  assert.equal(takeOffer(field, -1), false, 'and no minus-first card');
  assert.equal(field.state, STATE.LEVEL, 'so the run is still waiting');
  assert.equal(field.upgrades.damage, 0, 'and nothing was taken');
});

test('two levels at once are two choices, one after the other', () => {
  const field = scriptedRun(35);
  earnLevel(field);
  earnLevel(field);          // a fat shard can be worth two levels in one step

  assert.equal(field.pendingLevels, 2);
  assert.equal(field.state, STATE.LEVEL);
  assert.equal(field.offer.length, BALANCE.cards.offer, 'but only one choice is on the table');

  const second = field.offer[1];
  assert.equal(takeOffer(field, 1), true);
  assert.equal(field.state, STATE.LEVEL, 'the second level wants answering too');
  assert.equal(field.pendingLevels, 1);
  assert.equal(field.upgrades[second], 1, 'and the first card went to the middle one');

  const first = field.offer[0];
  const beforeFirst = field.upgrades[first];
  assert.equal(takeOffer(field, 0), true);
  assert.equal(field.state, STATE.PLAY, 'and then it is over');
  assert.equal(field.pendingLevels, 0);
  assert.equal(field.upgrades[first], beforeFirst + 1, 'and this one went to the left-hand card');
});

test('every line is five ranks deep and worth its step, in its own kind of number', () => {
  const field = scriptedRun(36);
  for (const line of LINES) {
    const spec = BALANCE.upgrades[line.id];
    assert.equal(spec.ranks, 5, line.id + ' is five ranks deep, as PLAN 3.5 starts them');
    field.upgrades[line.id] = spec.ranks;

    if (line.unit === 'percent') {
      assert.equal(gainOf(field, line.id), 1 + spec.step * spec.ranks);
    } else if (line.unit === 'rate') {
      // A rate line is neither multiplied nor counted. Its rank is a share of something, per
      // second of its own, which is why the card prints a percentage and the sim reads a
      // product - and why the first rank matters more than the arithmetic says: at rank 0
      // there is no fire at all, not fire of strength zero.
      assert.ok(spec.step < 1, line.id + ' sells a fraction and not a whole thing');
      assert.equal(effectOf(line.id), '+' + Math.round(spec.step * 100) + '% ' + line.what);
      assert.equal(rateOf(field, line.id), spec.step * spec.ranks);
      field.upgrades[line.id] = 0;
      assert.equal(rateOf(field, line.id), 0, line.id + ' is nothing at all at rank 0');
      field.upgrades[line.id] = spec.ranks;
    } else {
      // A line of whole things is counted, not multiplied, and the card says so.
      assert.ok(Number.isInteger(spec.step), line.id + ' hands out whole things');
      assert.equal(effectOf(line.id), '+' + spec.step + ' ' + line.what);
      assert.equal(countOf(field, line.id), spec.step * spec.ranks);
    }
  }

  // And asking the wrong kind of line for the wrong kind of number is a mistake that
  // says so out loud, instead of quietly multiplying by a plausible-looking six.
  assert.throws(() => gainOf(field, 'split'), /not a line of shares/);
  assert.throws(() => countOf(field, 'damage'), /not a line of whole things/);
  assert.throws(() => rateOf(field, 'damage'), /does not sell a rate/);
  field.upgrades.split = 2;
  field.upgrades.pierce = 3;
  assert.equal(shotsPerPull(field), BALANCE.weapons.pulse.pellets + 2 * BALANCE.upgrades.split.step);
  assert.equal(pierceOf(field), 3 * BALANCE.upgrades.pierce.step);
});

test('a card prints the number its line is worth', () => {
  assert.equal(effectOf('damage'), '+' + Math.round(BALANCE.upgrades.damage.step * 100) + '% shot damage');
  assert.equal(effectOf('split'), '+' + BALANCE.upgrades.split.step + ' extra shot');
  assert.equal(effectOf('pierce'), '+' + BALANCE.upgrades.pierce.step + ' body passed through');
});

test('damage and shot speed come out of the gun, not just onto the ledger', () => {
  const field = scriptedRun(37);
  const gun = BALANCE.weapons.pulse;

  field.bullets.clear();
  fire(field);
  let shot = field.bullets.items[0];
  assert.equal(shot.dmg, gun.damage, 'a plain shot is a plain shot');
  assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - gun.speed) < 1e-9, 'at the plain speed');

  field.upgrades.damage = 3;
  field.upgrades.bulletSpeed = 2;
  field.bullets.clear();
  fire(field);
  shot = field.bullets.items[0];
  assert.ok(Math.abs(shot.dmg - gun.damage * gainOf(field, 'damage')) < 1e-9, 'heavier');
  assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - gun.speed * gainOf(field, 'bulletSpeed')) < 1e-9, 'and faster');
});

test('the fire rate line shortens the gap between two pulls, whatever a pull fires', () => {
  const field = scriptedRun(38);
  const spec = BALANCE.weapons.pulse;
  assert.equal(shotsPerSecond(field), spec.fireRate, 'a plain gun cycles at its own rate');

  field.upgrades.fireRate = BALANCE.upgrades.fireRate.ranks;
  const fast = shotsPerSecond(field);
  assert.ok(Math.abs(fast - spec.fireRate * gainOf(field, 'fireRate')) < 1e-9, 'a tuned one faster');
  assert.ok(fast < BALANCE.weapons.rateMax, 'and the ceiling sits above what the line can reach');

  // And the wiring: the timer a shot leaves behind is the gap the line asked for.
  const ship = field.player;
  ship.fireTimer = 0;
  const gaps = [];
  for (let i = 0; i < 60 && gaps.length < 2; i++) {
    const before = field.bullets.count;
    stepTheWorld({ firing: true });
    if (field.bullets.count > before) gaps.push(ship.fireTimer);
  }
  assert.equal(gaps.length, 2, 'the gun fired twice');
  for (const gap of gaps) assert.ok(Math.abs(gap - 1 / fast) < 1e-9, 'and waited exactly as long as it should');
});

test('a line that is maxed never comes back, however many levels are dealt', () => {
  const field = scriptedRun(39);
  field.upgrades.damage = BALANCE.upgrades.damage.ranks;

  for (let round = 0; round < 40; round++) {
    earnLevel(field);
    if (field.state !== STATE.LEVEL) break;      // nothing left to deal
    assert.equal(field.offer.indexOf('damage'), -1, 'damage stayed off the table');
    assert.equal(takeOffer(field, 0), true);
  }
  assert.equal(field.upgrades.damage, BALANCE.upgrades.damage.ranks, 'and stayed maxed');
});

test('with every line maxed a level is still a level, but not a pause', () => {
  const field = scriptedRun(40);
  for (const id of IDS) field.upgrades[id] = BALANCE.upgrades[id].ranks;
  const level = field.player.level;

  earnLevel(field);

  assert.equal(field.state, STATE.PLAY, 'the run was never stopped for a card it could not give');
  assert.equal(field.player.level, level + 1, 'the level was still banked');
  assert.equal(field.offer.length, 0);
  assert.equal(field.pendingLevels, 0, 'and nothing is left owing');
  assert.equal(stepTheWorld(), true, 'and the next step is a real one');
});
