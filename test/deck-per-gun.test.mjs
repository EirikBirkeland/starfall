// Which part of the deck belongs to the gun (game/upgrades.js `spendableBy`, and the
// `cannotSpend` lists on the weapon rows of game/balance.js).
//
// Three of the five primaries cannot spend some of the lines at all: a chain and a beam throw no
// travelling shot, and a micro-missile is spent on the body it detonates against, so there is
// nothing for `pierce` to pass through and nothing for `ricochet` to turn. The *mechanism* of that
// is held by test/arc.test.mjs, test/lance.test.mjs and test/missiles.test.mjs, each of which fires
// its own gun with those ranks maxed and shows the same run either way. What this file holds is the
// other half, the half a player actually meets: a line a run's gun cannot spend is not dealt to it.
//
// Whether it was worth dealing with at all was measured first, and NOTES session 97 has the numbers:
// five free ranks of an inert line median exactly the run that never had them (1.000x, to the point),
// and the bot - which likes `ricochet` and `pierce`, third and fourth in its appetite - was paying
// four levels a run for nothing.
//
// Every deal here is dealt on the scripted world, which flies the default gun (pulse) unless the
// test says otherwise, so none of them depends on what another test left in the world.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/balance.js';
import { STATE } from '../src/game/state.js';
import { setWeapon } from '../src/game/weapons.js';
import {
  LINES, maxRanksOf, isSynergy, refreshOffer, banishOffer, banishedLines,
} from '../src/game/upgrades.js';
import { scriptedRun } from '../tools/headless/scripted.js';

const GUNS = ['pulse', 'scatter', 'arc', 'lance', 'swarm'];

/** Every line id the deck has, synergies included. */
const ALL = LINES.map((line) => line.id);
/** The ordinary lines: what a deal can draw, and so what a run's deck is made of. */
const ORDINARY = LINES.filter((line) => !isSynergy(line.id)).map((line) => line.id);

/** The guns that cannot spend something, each with the thing it cannot spend. */
function gunsWithADeadLine() {
  const rows = [];
  for (const id of GUNS) {
    const cannot = BALANCE.weapons[id].cannotSpend;
    if (cannot !== undefined && cannot.length > 0) rows.push({ id, cannot });
  }
  return rows;
}

/**
 * Deal `count` separate hands and report every line that came up, with how many hands were dealt at
 * all. The count is asserted by every caller: a loop over deals that silently dealt nothing would
 * otherwise agree with anything (NOTES session 96).
 */
function dealHands(field, count) {
  const seen = new Set();
  let deals = 0;
  for (let i = 0; i < count; i++) {
    field.offer.length = 0;
    field.pendingLevels = 1;
    refreshOffer(field);
    if (field.offer.length === 0) continue;
    deals++;
    for (const id of field.offer) seen.add(id);
  }
  return { seen, deals };
}

/** Max every line, so a deal can only come from whatever the test leaves with room. */
function maxTheDeck(field) {
  for (const id of ALL) field.upgrades[id] = maxRanksOf(id);
}

/** Put one level's worth of choice on the table and leave it there. */
function dealOneHand(field) {
  field.offer.length = 0;
  field.pendingLevels = 1;
  refreshOffer(field);
  return field.offer;
}

test('the cannot-spend lists are lines, and only three guns need one', () => {
  const rows = gunsWithADeadLine();
  assert.deepEqual(rows.map((row) => row.id), ['arc', 'lance', 'swarm'],
    'the arc and the lance throw no travelling shot; the Swarm spends its shells on impact');

  for (const row of rows) {
    for (const id of row.cannot) {
      assert.ok(ORDINARY.includes(id), row.id + ' lists ' + id + ', which is not an ordinary line');
    }
  }

  // No ship may begin with a rank of a line its own gun cannot spend: that would be a purse handing
  // out a level that buys nothing, which is the whole thing this file is about.
  for (const id of Object.keys(BALANCE.ships)) {
    const ship = BALANCE.ships[id];
    if (typeof ship !== 'object') continue;                 // the `default` key
    const cannot = BALANCE.weapons[ship.weapon].cannotSpend || [];
    for (const line of Object.keys(ship.ranks)) {
      assert.equal(cannot.indexOf(line), -1,
        id + ' begins with ' + line + ', which its own ' + ship.weapon + ' cannot spend');
    }
  }
});

test('a gun that can spend everything is dealt everything, over 300 hands', () => {
  const field = scriptedRun(401);
  const { seen, deals } = dealHands(field, 300);

  assert.equal(deals, 300, 'every hand had a card in it');
  for (const id of ORDINARY) {
    assert.ok(seen.has(id), 'the pulse was never offered ' + id);
  }
});

for (const row of gunsWithADeadLine()) {
  test('the ' + row.id + ' run is never dealt ' + row.cannot.join(' or '), () => {
    const field = scriptedRun(402);
    setWeapon(field, row.id);

    const { seen, deals } = dealHands(field, 400);
    assert.equal(deals, 400, 'and yet the deck was never empty');

    for (const id of row.cannot) {
      assert.equal(seen.has(id), false, id + ' came up on a ' + row.id + ' run');
    }
    // A filter and not a shrunken view of the deck: every line this gun *can* spend still comes up,
    // or the deal would pass this test by dealing almost nothing.
    for (const id of ORDINARY) {
      if (row.cannot.includes(id)) continue;
      assert.ok(seen.has(id), 'the ' + row.id + ' was never offered ' + id + ', which it can spend');
    }
  });
}

test('the something-new promise cannot deal a dead line through the back door', () => {
  const field = scriptedRun(403);
  setWeapon(field, 'lance');
  const cannot = BALANCE.weapons.lance.cannotSpend;

  // Max everything, then give two live lines one rank back (so they are dealable but not *new*) and
  // put the dead ones back at rank 0, where the "at least one card must be new" rule would find them
  // waiting. Without the draw's filter a dead line is dealt here; without the promise's own filter it
  // is placed by the guarantee instead. Both are on trial, and so is the rule that this rack is short.
  maxTheDeck(field);
  const live = ORDINARY.filter((id) => !cannot.includes(id));
  const spared = [live[0], live[1]];
  for (const id of spared) field.upgrades[id] = maxRanksOf(id) - 1;
  for (const id of cannot) field.upgrades[id] = 0;

  const offer = dealOneHand(field);
  assert.equal(field.state, STATE.LEVEL, 'there is a choice to make');
  assert.deepEqual(offer, spared, 'the two lines with a rank left, and not a dead one instead');
});

test('a run with nothing live left to deal is not stalled by a dead line', () => {
  const field = scriptedRun(404);
  setWeapon(field, 'lance');

  maxTheDeck(field);
  for (const id of BALANCE.weapons.lance.cannotSpend) field.upgrades[id] = 0;

  const offer = dealOneHand(field);
  assert.equal(offer.length, 0, 'nothing was dealt, because nothing is left to give');
  assert.equal(field.state, STATE.PLAY, 'so the run keeps flying instead of pausing on an empty rack');
  assert.equal(field.pendingLevels, 0, 'and the owed level is handed back, not spent on nothing');
});

test('a banish on a filtered deck is replaced by something the gun can spend', () => {
  const field = scriptedRun(405);
  setWeapon(field, 'arc');
  const cannot = BALANCE.weapons.arc.cannotSpend;

  dealOneHand(field);
  assert.equal(field.offer.length, BALANCE.cards.offer, 'a full rack to start with');

  field.banishesLeft = 1;
  const gone = field.offer[0];
  assert.equal(banishOffer(field, 0), true, 'the ask was spent');
  assert.deepEqual(banishedLines(field), [gone]);

  for (const id of field.offer) {
    assert.equal(cannot.includes(id), false, id + ' came back as the replacement on an arc run');
  }
  assert.equal(field.offer.length, BALANCE.cards.offer, 'and the rack is full again');
});
