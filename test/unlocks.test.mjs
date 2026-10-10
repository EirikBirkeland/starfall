// The hangar as a shop: what a ship costs, who owns what, and what a number key answers with when
// the answer is a price (PLAN 3.7, game/hangar.js).
//
// The rack is five ships and one of them is free: the purse a run pays (game/stardust.js) is what
// buys the other four, and until it does the ship is on the rack and not in the hangar. This file
// walks that: a visit that came in with one ship bought and enough dust for another, the keys that
// refuse what has not been bought, the key that buys, the purse and the document that both of them
// move, and the two screens that must not be talked into either.
//
// The prices are read off BALANCE.ships rather than written here, so the ladder can be retuned
// without touching this file - but the tests lean on the ladder's *shape* (one free row, a row the
// purse can afford and a row it cannot), which is stated below and checked on the way in.
//
// One boot, walked in the order a player meets it: the title, the rack, a purchase, a launch, a
// wreck, the win.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { SHIPS } from '../src/game/ships.js';
import { damageEnemy } from '../src/game/enemies.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SCHEDULE = BALANCE.bosses.schedule;
const LAST = SCHEDULE.length - 1;
const DUE = SCHEDULE[LAST].at;
const GUARD = BALANCE.victory.guard;

/** What one row costs, in the purse's own unit (game/hangar.js reads the same number). */
function cost(index) {
  return BALANCE.ships[SHIPS[index].id].cost;
}

const COST = SHIPS.map((row, index) => cost(index));

// What the visit brought with it: one ship already bought, and a purse between two of the prices -
// big enough for the cheapest thing it has not got, short of the next one. That is the interesting
// amount of money: enough to be able to buy one thing and not two.
const BOUGHT = ['bulwark'];
const BOUGHT_INDEX = SHIPS.findIndex((row) => row.id === BOUGHT[0]);
const CHEAPEST = COST.map((price, index) => ({ price, index }))
  .filter((row) => row.price > 0 && !BOUGHT.includes(SHIPS[row.index].id))
  .sort((a, b) => a.price - b.price)[0];
const DEAREST = COST.map((price, index) => ({ price, index }))
  .sort((a, b) => b.price - a.price)[0];
const STARTED_WITH = CHEAPEST.price + 200;

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

/** Shift and a number: the other thing that key can mean between runs - the purse buys. */
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
  ship.fireTimer = 5;
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

test('the ladder is the shape this file is written against', () => {
  // The prices are the balance sheet's business (game/balance.js, `ships`), but the file cannot
  // test "short" and "enough" without assuming something about them, so the assumption is checked
  // rather than leaned on: exactly one row is free, it is the row a visit starts in, and the purse
  // this boot came in with can cover one locked row and not the dearest.
  assert.equal(COST.filter((price) => price === 0).length, 1, 'exactly one ship is free');
  assert.equal(COST[SHIPS.findIndex((row) => row.id === BALANCE.ships.default)], 0,
    'and it is the ship a visit that bought nothing flies');
  assert.ok(STARTED_WITH >= CHEAPEST.price, STARTED_WITH + ' covers the cheapest locked row');
  assert.ok(STARTED_WITH < DEAREST.price, STARTED_WITH + ' does not cover the dearest');
  for (const price of COST) {
    assert.ok(Number.isInteger(price) && price >= 0, 'a price is a whole number of stardust');
  }
});

test('the rack says which ships are yours and what the rest cost', () => {
  const lines = rows();
  assert.equal(lines.length, SHIPS.length);
  for (let i = 0; i < lines.length; i++) {
    const spec = BALANCE.ships[SHIPS[i].id];
    const yours = COST[i] === 0 || BOUGHT.includes(SHIPS[i].id);
    assert.equal(lines[i].locked, !yours, lines[i].label + ' locked state');
    // A locked row keeps everything it said before there was a price on it, and adds the price and
    // the key that pays it: a shop that hides what it sells is not a shop.
    assert.ok(lines[i].label.includes(spec.name), 'it says which ship it is');
    assert.ok(lines[i].label.includes(spec.hull + ' HULL'), 'and what it is worth in hull');
    if (yours) {
      assert.ok(!lines[i].label.includes('STARDUST'), lines[i].label + ' is not for sale');
    } else {
      assert.ok(lines[i].label.includes(COST[i].toLocaleString('en-US') + ' STARDUST'),
        lines[i].label + ' names its price');
      assert.ok(lines[i].label.includes('SHIFT + ' + (i + 1) + ' BUYS IT'),
        lines[i].label + ' names the key that buys it');
    }
  }
  assert.ok(game.screen.titleShip.includes('WISP'), 'the free ship is what the visit flies: '
    + game.screen.titleShip);
  assert.deepEqual(game.stats().owned, BOUGHT, 'and the document said it too');
});

test('a bought ship answers its number the moment it is pressed', () => {
  // The whole point of remembering a purchase: the next visit pays nothing to fly what was paid for
  // in the last one (game/hangar.js `boughtShips`).
  press('Digit' + (BOUGHT_INDEX + 1));
  assert.equal(game.stats().ship, BOUGHT[0]);
  assert.equal(game.stats().dust, STARTED_WITH, 'and it cost nothing this time');
  assert.ok(game.screen.titleShip.includes(BALANCE.ships[BOUGHT[0]].name));
});

test('a number on a ship nobody bought does not pick it, and shows the rack instead', () => {
  const before = game.stats().ship;
  press('Digit' + (DEAREST.index + 1));
  assert.equal(game.stats().ship, before, 'the ship nobody bought was not picked');
  assert.equal(game.stats().state, game.STATE.START, 'and the key did not launch anything either');
  assert.equal(hangarOpen(), true, 'it put up the panel that says what it costs');
  assert.ok(rows()[DEAREST.index].locked, 'which is the row that says so');
  // The same key with the panel already up has nothing left to answer.
  press('Digit' + (DEAREST.index + 1));
  assert.equal(game.stats().ship, before, 'and again, nothing');
});

test('a purse that is short is refused, and nothing moves', () => {
  const dust = game.stats().dust;
  buy(DEAREST.index + 1);
  assert.equal(game.stats().dust, dust, 'the purse kept what it could not spend');
  assert.equal(rows()[DEAREST.index].locked, true, 'and the row is still locked');
  assert.deepEqual(stored().hangar.ships, BOUGHT, 'and the document was not touched');
});

test('a ship already bought, and a ship that was free, are not for sale', () => {
  const dust = game.stats().dust;
  buy(BOUGHT_INDEX + 1);
  buy(1);                       // the free one, if it is row 1 - and it is
  assert.equal(game.stats().dust, dust, 'nothing was charged for either');
  assert.equal(game.stats().ship, BOUGHT[0], 'and neither one moved the pick');
});

test('a purchase needs the rack up, where the price is on the glass', () => {
  press('KeyH');                          // back out to the title
  assert.equal(hangarOpen(), false);
  buy(CHEAPEST.index + 1);
  assert.equal(game.stats().dust, STARTED_WITH,
    'nothing is spent from a screen that does not show what it costs');
  assert.equal(rows()[CHEAPEST.index].locked, true);
  press('KeyH');                          // and back in, for the purchase that does go through
});

test('shift and the number buys the ship it names', () => {
  const before = game.stats().dust;
  buy(CHEAPEST.index + 1);
  assert.equal(game.stats().dust, before - CHEAPEST.price, 'the purse paid exactly the price');
  assert.equal(rows()[CHEAPEST.index].locked, false, 'the row came out from under the lock');
  assert.ok(!rows()[CHEAPEST.index].label.includes('STARDUST'),
    'and stopped advertising what it costs');
  assert.ok(rows()[CHEAPEST.index].label.includes('SPEED'), 'its numbers are what is left: '
    + rows()[CHEAPEST.index].label);
  assert.ok(stored().hangar.ships.includes(SHIPS[CHEAPEST.index].id),
    'and the next visit will find it bought');
  assert.equal(game.stats().ship, BOUGHT[0], 'buying is not picking: the pick stayed put');
  assert.equal(game.screen.hangarDust, (before - CHEAPEST.price).toLocaleString('en-US'),
    'and the purse on the panel moved with it');
});

test('a bought ship is picked, lit, and flown', () => {
  press('Digit' + (CHEAPEST.index + 1));
  assert.equal(game.stats().ship, SHIPS[CHEAPEST.index].id);
  assert.deepEqual(rows().map((row) => row.picked),
    SHIPS.map((row, i) => i === CHEAPEST.index), 'exactly one row is lit');
  const dust = game.stats().dust;
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY, 'and one key still launches');
  assert.equal(hangarOpen(), false, 'with the panel coming down');
  assert.equal(world.player.hull, BALANCE.ships[SHIPS[CHEAPEST.index].id].hull,
    'in the body that was bought');
  assert.equal(game.stats().weapon, BALANCE.ships[SHIPS[CHEAPEST.index].id].weapon,
    'with the gun that came with it');
  assert.equal(game.stats().dust, dust, 'and the pick itself cost nothing');
});

test('a wreck answers a locked number without starting the run it is sitting on', () => {
  killTheRun(1200);
  const before = game.stats().ship;
  press('Digit' + (DEAREST.index + 1));
  assert.equal(game.stats().ship, before, 'the pick did not move');
  assert.equal(game.stats().state, game.STATE.OVER, 'and no run was started under the card');
  assert.equal(hangarOpen(), true, 'the rack came up over the wreck, as it does over the title');
});

test('and a purchase over a wreck is allowed, because the rack is on the glass', () => {
  // The purse is topped up by hand here on purpose: what is being tested is *where* a ship may be
  // bought, not how the dust for it is earned, and the wreck is one of the two screens that show
  // the price (main.js `buyFromRack`).
  world.dust = DEAREST.price;
  const dust = game.stats().dust;
  buy(DEAREST.index + 1);
  assert.equal(game.stats().dust, dust - DEAREST.price, 'it paid');
  assert.equal(rows()[DEAREST.index].locked, false, 'and got the ship');
  assert.ok(stored().hangar.ships.includes(SHIPS[DEAREST.index].id), 'and remembered it');
  assert.equal(game.stats().state, game.STATE.OVER, 'without launching anything');
  // Then fly it, because that is what it was bought for.
  press('Digit' + (DEAREST.index + 1));
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY);
  assert.equal(game.stats().ship, SHIPS[DEAREST.index].id);
});

test('the win refuses a ship nobody bought, and spends nothing on it', () => {
  killTheRun(0);
  parkAtTheLastFight();
  const boss = world.boss;
  damageEnemy(world, boss.enemy, boss.enemy.maxhp * 10, true);
  assert.ok(until(() => game.stats().state === game.STATE.WON, 6), 'the schedule ran out');
  wait(GUARD + 0.2);                      // and the guard, so the card is answerable
  assert.equal(game.stats().state, game.STATE.WON);

  // Whatever this file has not bought is still locked, and a locked number over the win must not be
  // the one key that gets through: a number there means "fly this one, and begin again" (that is
  // what it means on the title and over a wreck, and the win's card is the one place the launch key
  // already means something else - game/hangar.js, main.js `onPickCard`).
  const locked = rows().map((row, i) => (row.locked ? i : -1)).filter((i) => i >= 0);
  assert.ok(locked.length > 0, 'this file has bought every ship, so there is nothing to refuse');
  const dust = game.stats().dust;
  const ship = game.stats().ship;
  for (const i of locked) {
    press('Digit' + (i + 1));
    assert.equal(game.stats().state, game.STATE.WON, SHIPS[i].id + ' was not refused');
    assert.equal(game.stats().ship, ship, 'and ' + SHIPS[i].id + ' was not picked either');
  }
  assert.equal(hangarOpen(), false, 'and no rack came up over the win to explain the price');
  for (const i of locked) {
    buy(i + 1);
  }
  assert.equal(game.stats().dust, dust, 'and nothing was spent there');
  for (const i of locked) {
    assert.equal(rows()[i].locked, true, SHIPS[i].id + ' was bought over a won run');
  }
});
