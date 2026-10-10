// The hangar as a shop: what a ship costs, who owns what, and what a number key answers with when
// the answer is a price (PLAN 3.7, game/hangar.js).
//
// A run pays stardust (game/stardust.js) and this is where it goes: four of the five ships are
// behind a price and the perks that join this screen later will be too. So the file walks a visit
// that came in with one ship already bought and a purse between two prices - enough to buy one
// thing and not two - through the keys that refuse what has not been bought, the key that buys, the
// purse and the save that both of them move, and the two screens that must be talked into neither.
//
// The prices are read off BALANCE.ships rather than written here, so the ladder can be retuned
// without touching this file. What the file does lean on is the ladder's *shape* - one free row,
// which is the row a visit starts in, a locked row the purse can cover and a locked row it cannot -
// and that shape is checked on the way in rather than assumed.
//
// One boot, walked in the order a player meets it: the title, the rack, a purchase, a launch, a
// wreck, the win. The panel and the end cards are test/hangar.test.mjs, which visits a rack it has
// already bought.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { SHIPS } from '../src/game/ships.js';
import { priceOf } from '../src/game/hangar.js';
import { damageEnemy } from '../src/game/enemies.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SCHEDULE = BALANCE.bosses.schedule;
const LAST = SCHEDULE.length - 1;
const DUE = SCHEDULE[LAST].at;
const GUARD = BALANCE.victory.guard;

/** What one row of the rack costs, in the purse's own unit (game/hangar.js reads the same). */
function cost(index) {
  return BALANCE.ships[SHIPS[index].id].cost;
}

const COST = SHIPS.map((row, index) => cost(index));

// What the visit brought with it: one ship already bought, and a purse that covers the cheapest
// thing it has not got and not the dearest. That is the only interesting amount of money - enough
// to be able to buy one thing, and to be refused the next.
const BOUGHT = ['bulwark'];
const BOUGHT_ROW = SHIPS.findIndex((row) => row.id === BOUGHT[0]) + 1;
function cheapestLocked() {
  for (let i = 0; i < SHIPS.length; i++) {
    if (COST[i] > 0 && !BOUGHT.includes(SHIPS[i].id)) return i;
  }
  throw new Error('every priced ship is bought already');
}
function dearest() {
  let top = 0;
  for (let i = 1; i < COST.length; i++) if (COST[i] > COST[top]) top = i;
  return top;
}
const CHEAP = cheapestLocked();
const DEAR = dearest();
const STARTED_WITH = COST[CHEAP] + 200;

const game = await bootGame({
  root: ROOT,
  seed: 92,
  audio: true,
  storage: {
    'starfall.save': JSON.stringify({
      version: 1,
      meta: { dust: STARTED_WITH },
      hangar: { ships: BOUGHT },
    }),
  },
});

const world = game.world;

/** One key, pressed and released, and the frame that hears it. */
function press(code, extra) {
  game.key(code, true, extra);
  game.key(code, false);
  game.step(FRAME);
}

/** Shift and a number: the other thing that key means between runs - the purse buys (main.js). */
function buy(row) {
  press('Digit' + row, { shiftKey: true });
}

function wait(seconds) {
  const frames = Math.round(seconds * 1000 / FRAME);
  for (let i = 0; i < frames; i++) game.step(FRAME);
}

/** Step until `seen` answers true. Bounded: a regression has to fail, not hang the box. */
function until(seen, seconds) {
  const limit = Math.ceil(seconds * 1000 / FRAME);
  let frames = 0;
  while (!seen() && frames < limit) { game.step(FRAME); frames++; }
  return seen();
}

function hangarOpen() {
  return game.screen.hangarHidden === false;
}

function rows() {
  return game.screen.ships;
}

function stored() {
  return JSON.parse(game.storage['starfall.save']);
}

/** Launch what the title (or the wreck) is offering, with the mouse. */
function launch() {
  game.pressMouse(640, 240);
  game.step(FRAME);
  game.releaseMouse();
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run is flying');
}

/** Put the run that is flying down, at a score the test can name. */
function killTheRun(score) {
  const ship = world.player;
  world.score = score;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;             // no shot, or it kills the body planted on it
  game.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.OVER, 'the run ended');
  wait(BALANCE.runOver.restartGuard * 2);
}

/** A run that cannot be hurt and cannot be mobbed, parked where the last fight is due. */
function parkAtTheLastFight() {
  launch();
  world.elapsed = DUE - 0.05;
  world.bossIndex = LAST;
  world.player.invuln = Infinity;
  world.spawnTimer = Infinity;
  world.enemies.length = 0;
  assert.ok(until(() => game.stats().bossCores > 0, 20), 'the last fight never walked in');
}

test('the price ladder is the shape this file is written against', () => {
  // The prices are the balance sheet's business (game/balance.js, `ships`), but nothing below can
  // say "short" and "enough" without assuming something about them, so the assumption is stated and
  // checked: exactly one row is free, it is the one a visit that bought nothing arrives in, and the
  // purse this boot came with covers one locked row and not the dearest.
  assert.deepEqual(COST.filter((price) => price === 0), [0], 'exactly one ship is free');
  assert.equal(cost(SHIPS.findIndex((row) => row.id === BALANCE.ships.default)), 0,
    'and it is the ship a first visit flies');
  assert.ok(STARTED_WITH >= COST[CHEAP], 'the purse covers the cheapest locked row');
  assert.ok(STARTED_WITH < COST[DEAR], 'and not the dearest');
  for (const price of COST) {
    assert.ok(Number.isInteger(price) && price >= 0, 'a price is a whole number of stardust: ' + price);
  }
  // And the shop insists on one. A row without a price would be locked forever and then bought for
  // not-a-number, which is the one thing a purse must never be (game/hangar.js `priceOf`).
  const priced = BALANCE.ships.wisp.cost;
  delete BALANCE.ships.wisp.cost;
  assert.throws(() => priceOf('wisp'), /the ship wisp has no price/);
  BALANCE.ships.wisp.cost = priced;
  assert.equal(priceOf('wisp'), 0, 'and the row is whole again');
  assert.throws(() => priceOf('wispz'), /no ship is called/);
});

test('the rack says which ships are yours and what the rest cost', () => {
  const lines = rows();
  assert.equal(lines.length, SHIPS.length, 'one line per ship on the rack');
  for (let i = 0; i < lines.length; i++) {
    const spec = BALANCE.ships[SHIPS[i].id];
    const yours = COST[i] === 0 || BOUGHT.includes(SHIPS[i].id);
    assert.equal(lines[i].locked, !yours, lines[i].label + ' has the wrong locked state');
    // A locked row keeps every word it said before there was a price on it, and adds the price and
    // the key that pays it. A shop that hides what it sells is not a shop.
    assert.ok(lines[i].label.includes(spec.name), 'it says which ship it is');
    assert.ok(lines[i].label.includes(spec.hull + ' HULL'), 'and what it is worth in hull');
    if (yours) {
      assert.ok(!lines[i].label.includes('STARDUST'), lines[i].label + ' is not for sale');
    } else {
      assert.ok(lines[i].label.includes(COST[i].toLocaleString('en-US') + ' STARDUST'),
        lines[i].label + ' does not name its price');
      assert.ok(lines[i].label.includes('SHIFT + ' + (i + 1) + ' BUYS IT'),
        lines[i].label + ' does not name the key that buys it');
    }
  }
  assert.ok(game.screen.titleShip.includes('WISP'),
    'the free ship is what the visit flies: ' + game.screen.titleShip);
  assert.deepEqual(game.stats().owned, BOUGHT, 'and the save said the same');
});

test('a ship the last visit bought answers its number for nothing', () => {
  // The whole point of remembering a purchase: the next visit pays nothing to fly what an earlier
  // one paid for (game/hangar.js `boughtShips`).
  press('Digit' + BOUGHT_ROW);
  assert.equal(game.stats().ship, BOUGHT[0], 'and it cost nothing this time');
  assert.equal(game.stats().dust, STARTED_WITH);
  assert.ok(game.screen.titleShip.includes(BALANCE.ships[BOUGHT[0]].name),
    'and the line moved: ' + game.screen.titleShip);
});

test('a number for a ship nobody bought shows the rack instead of picking it', () => {
  press('Digit' + (DEAR + 1));
  assert.equal(game.stats().ship, BOUGHT[0], 'the ship nobody bought was not picked');
  assert.equal(game.stats().state, game.STATE.START, 'and the key did not launch anything either');
  assert.equal(hangarOpen(), true, 'it put up the panel that says what it costs');
  assert.ok(rows()[DEAR].locked, 'which is the row that says so');
  press('Digit' + (DEAR + 1));
  assert.equal(game.stats().ship, BOUGHT[0], 'and the same key with the panel up has nothing left to do');
});

test('a purse that is short is refused, and nothing moves', () => {
  buy(DEAR + 1);
  assert.equal(game.stats().dust, STARTED_WITH, 'the purse kept what it could not spend');
  assert.equal(rows()[DEAR].locked, true, 'and the row is still locked');
  assert.deepEqual(stored().hangar.ships, BOUGHT, 'and the save was not touched');
  assert.equal(game.stats().ship, BOUGHT[0], 'and the pick did not move');
});

test('a ship already bought, and a ship that was free, are not for sale', () => {
  buy(BOUGHT_ROW);
  buy(1);                       // the free row, which is row 1 and always will be
  assert.equal(game.stats().dust, STARTED_WITH, 'nothing was charged for either');
  assert.deepEqual(stored().hangar.ships, BOUGHT, 'and nothing was written for either');
});

test('a purchase needs the rack up, where the price is on the glass', () => {
  press('KeyH');                            // back out to the title
  assert.equal(hangarOpen(), false);
  buy(CHEAP + 1);
  assert.equal(game.stats().dust, STARTED_WITH,
    'nothing is spent from a screen that does not show what it costs');
  assert.equal(rows()[CHEAP].locked, true, 'and the row is still locked');
  press('KeyH');                            // and back in, for the purchase that does go through
});

test('shift and the number buys the ship it names', () => {
  buy(CHEAP + 1);
  assert.equal(game.stats().dust, STARTED_WITH - COST[CHEAP], 'the purse paid exactly the price');
  assert.equal(rows()[CHEAP].locked, false, 'and the row came out from under the lock');
  assert.ok(!rows()[CHEAP].label.includes('STARDUST'),
    'and stopped advertising what it costs: ' + rows()[CHEAP].label);
  assert.ok(rows()[CHEAP].label.includes('SPEED'), 'its numbers are what is left');
  assert.ok(stored().hangar.ships.includes(SHIPS[CHEAP].id),
    'and the next visit will find it bought');
  assert.equal(game.stats().ship, BOUGHT[0], 'and buying is not picking: the pick stayed put');
  assert.equal(game.screen.hangarDust, (STARTED_WITH - COST[CHEAP]).toLocaleString('en-US'),
    'and the purse on the panel moved with it');
});

test('a bought ship is then picked, lit, and flown', () => {
  press('Digit' + (CHEAP + 1));
  assert.equal(game.stats().ship, SHIPS[CHEAP].id);
  assert.deepEqual(rows().map((row) => row.picked),
    SHIPS.map((row, i) => i === CHEAP), 'exactly one row is lit');
  const dust = game.stats().dust;
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY, 'and one key still launches');
  assert.equal(hangarOpen(), false, 'with the panel coming down');
  assert.equal(world.player.hull, BALANCE.ships[SHIPS[CHEAP].id].hull, 'in the body that was bought');
  assert.equal(game.stats().weapon, BALANCE.ships[SHIPS[CHEAP].id].weapon,
    'with the gun that came with it');
  assert.equal(game.stats().dust, dust, 'and the pick itself cost nothing');
});

test('a wreck answers a locked number without starting the run it is sitting on', () => {
  killTheRun(1200);
  const ship = game.stats().ship;
  press('Digit' + (DEAR + 1));
  assert.equal(game.stats().ship, ship, 'the pick did not move');
  assert.equal(game.stats().state, game.STATE.OVER, 'and no run was started under the card');
  assert.equal(hangarOpen(), true, 'the rack came up over the wreck, as it does over the title');
});

test('and a purchase over a wreck is allowed, because the rack is on the glass', () => {
  // The purse is topped up by hand here on purpose: what is being tested is *where* a ship may be
  // bought, not how the dust for it is earned, and the wreck is one of the two screens that print
  // the price (main.js `buyFromRack`).
  world.dust = COST[DEAR];
  buy(DEAR + 1);
  assert.equal(game.stats().dust, 0, 'it paid the whole purse');
  assert.equal(rows()[DEAR].locked, false, 'and got the ship');
  assert.ok(stored().hangar.ships.includes(SHIPS[DEAR].id), 'and remembered it');
  assert.equal(game.stats().state, game.STATE.OVER, 'without launching anything');
  press('Digit' + (DEAR + 1));
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY, 'and then flew it, which is what it was bought for');
  assert.equal(game.stats().ship, SHIPS[DEAR].id);
});

test('the win refuses a ship nobody bought, and spends nothing on it', () => {
  killTheRun(0);
  parkAtTheLastFight();
  const boss = world.boss;
  damageEnemy(world, boss.enemy, boss.enemy.maxhp * 10, true);
  assert.ok(until(() => game.stats().state === game.STATE.WON, 6), 'the schedule ran out');
  wait(GUARD + 0.2);                        // and the guard, so the card is answerable
  assert.equal(game.stats().state, game.STATE.WON);

  // Whatever is left unbought must still be refused here: over the win a number means "fly this one,
  // and begin again" - which is what it means on the title and over a wreck - and the win has
  // already been flown (main.js `onPickCard`, and the hangar that refuses to cover a win).
  const locked = rows().map((row, i) => (row.locked ? i : -1)).filter((i) => i >= 0);
  assert.ok(locked.length > 0, 'this file has bought the whole rack, so there is nothing left to refuse');
  const dust = game.stats().dust;
  const ship = game.stats().ship;
  for (const i of locked) {
    press('Digit' + (i + 1));
    assert.equal(game.stats().state, game.STATE.WON, SHIPS[i].id + ' was not refused');
    assert.equal(game.stats().ship, ship, 'and ' + SHIPS[i].id + ' was not picked either');
  }
  assert.equal(hangarOpen(), false, 'and no rack came up over the win to show the price');
  for (const i of locked) buy(i + 1);
  assert.equal(game.stats().dust, dust, 'and nothing was spent there');
  for (const i of locked) {
    assert.equal(rows()[i].locked, true, SHIPS[i].id + ' was bought over a won run');
  }
});
