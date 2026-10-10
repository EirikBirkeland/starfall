// The perks: the hangar's second rack, and what a bought rank does to the run that comes next
// (PLAN 3.7, game/perks.js, the money side of it in game/hangar.js).
//
// A ship is bought once; a rank is bought five times, and that difference is most of what this file
// has to hold: the ladder, the price of the next rung, a row that stops being for sale when it runs
// out, and a count in the save that is a number rather than a yes. Four ranks-worth of effect are
// tested too - the plating on the hull, what a run's dust is worth, and the two asks - at the gate
// each one buys, in the run that flies with it and not in the accessor that reads it.
//
// The visit this file walks came in with something already bought: one rank of plating (so a hull
// number can be seen to move), one ladder walked out to the top (so a row that has nothing left to
// sell can be seen), zero of a row that was stored anyway, and a count above the ladder on the
// Gleaner (so the clamp is a fact and not a hope). The purse covers two ranks of one row and not the
// next thing it is offered, which is the only interesting amount of money.
//
// Prices and ladders are read off BALANCE.perks rather than written here, so the sheet can be
// retuned without touching this file; what the file leans on is the sheet's *shape*, and that is
// checked on the way in.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame, everyPerkBought, perkLadderCost } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { dustTotal } from '../src/game/awards.js';
import { SHIPS } from '../src/game/ships.js';
import { perkPriceOf } from '../src/game/hangar.js';
import {
  PERKS, extraBanishesOf, extraRerollsOf, maxRankOf, newPerkRanks, perkAt, perkLedger, perkRow,
  rankOf, rankWords, startingHullOf,
} from '../src/game/perks.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

/** The perk a rack position names, and the number key that rack position is printed with. */
function perk(index) { return PERKS[index]; }
function keyOf(index) { return SHIPS.length + index + 1; }
function indexOf(id) { return PERKS.findIndex((row) => row.id === id); }
function cost(id, rank) { return BALANCE.perks[id].cost[rank]; }

// What the last visit left behind: every ladder walked out, three of them pulled back down again -
// one rank of plating (so a hull number can be seen to move), nothing at all of the row this visit
// is going to buy, and a count *above* the Gleaner's ladder stored as nine, which is what a page
// written by a build with longer ladders looks like from here.
const HELD = Object.assign(everyPerkBought(), { hull: 1, banish: 0, dust: 9 });
const LEDGER = Object.assign({}, HELD, { dust: maxRankOf('dust') });
const SHIPS_BOUGHT = ['bulwark'];

// Enough for two ranks of Banish and a hundred over, which is less than the next thing offered:
// one purchase, a second purchase, and a refusal, in that order.
const CHEAP = 'banish';
const DEAR = 'hull';
const PURSE = cost(CHEAP, 0) + cost(CHEAP, 1) + 100;

const game = await bootGame({
  root: ROOT,
  seed: 44,
  storage: {
    'starfall.save': JSON.stringify({
      version: 1,
      meta: { dust: PURSE },
      hangar: { ships: SHIPS_BOUGHT, perks: HELD },
    }),
  },
});
const world = game.world;
const ship = world.player;

function press(code, extra) {
  game.key(code, true, extra);
  game.key(code, false);
  game.step(FRAME);
}

/** Shift and a number: the purse buys the row that number names (game/hangar.js). */
function buy(index) { press('Digit' + keyOf(index), { shiftKey: true }); }

function hangarOpen() { return game.screen.hangarHidden === false; }

function rows() { return game.screen.perks; }

function stored() { return JSON.parse(game.storage['starfall.save']); }

function ranks() { return game.stats().perks; }

/** Put the run that is flying down, at a score the test can name. */
function killTheRun(score) {
  world.score = score;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;             // no shot, or it kills the body planted on it
  game.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.OVER, 'the run ended');
  for (let i = 0; i < Math.round(BALANCE.runOver.restartGuard * 2 * 1000 / FRAME); i++) {
    game.step(FRAME);
  }
}

// --- the table itself, before anything is booted -----------------------------------

test('the perk table is the shape this file is written against', () => {
  assert.ok(PERKS.length > 0, 'there are perks');
  const ids = PERKS.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, 'no id is on the rack twice');

  for (const row of PERKS) {
    const spec = perkRow(row.id);
    assert.ok(row.name.length > 0 && row.blurb.length > 0, row.id + ' has no words on its row');
    assert.ok(Number.isInteger(spec.ranks) && spec.ranks > 0, row.id + ' has a ladder to climb');
    assert.equal(spec.cost.length, spec.ranks, 'and one price per rung of it');
    assert.ok(Number.isInteger(spec.step) && spec.step > 0, 'and a rank is worth a whole something');
    assert.ok(spec.says.length > 0, 'and says what in one word');
    for (let i = 0; i < spec.cost.length; i++) {
      const price = spec.cost[i];
      assert.ok(Number.isInteger(price) && price > 0, row.id + ' price ' + i + ' is ' + price);
      if (i > 0) assert.ok(price > spec.cost[i - 1], row.id + "'s ladder does not rise");
    }
  }

  // The whole hangar is picked with the number keys, and the game reads 1-9 and nothing else
  // (src/input/keyboard.js). Nine rows is the most it can ever have.
  assert.ok(SHIPS.length + PERKS.length <= 9,
    'the two racks together outrun the number keys: ' + SHIPS.length + '+' + PERKS.length);
  for (let i = 0; i < PERKS.length; i++) {
    assert.equal(keyOf(i), i + SHIPS.length + 1, 'the keys count on from the last ship');
    assert.equal(perkAt(i), PERKS[i]);
  }
  assert.equal(perkAt(PERKS.length), null, 'and a row past the table is nobody\'s key');
  assert.equal(perkAt(-1), null, 'nor is a row before the first');
  assert.throws(() => perkRow('glow'), /no perk is called glow/);
});

test('a rank is priced per rung, and a rung that does not exist is an error', () => {
  assert.equal(perkPriceOf(CHEAP, 0), cost(CHEAP, 0));
  assert.equal(perkPriceOf(CHEAP, 1), cost(CHEAP, 1));
  // Past the top of the ladder there is no price, and the shop says so instead of spending the
  // purse on `undefined` (game/hangar.js would buy a rank nobody has priced).
  assert.throws(() => perkPriceOf(CHEAP, maxRankOf(CHEAP)), /has no price for rank/);
  assert.throws(() => perkPriceOf('glow', 0), /no perk is called glow/);
  assert.throws(() => perkPriceOf(CHEAP, -1), /holds no rank -1/);
  assert.throws(() => perkPriceOf(CHEAP, 1.5), /holds no rank 1.5/);
});

test('a rank is counted in the words the rack prints', () => {
  assert.deepEqual(newPerkRanks(), Object.fromEntries(PERKS.map((row) => [row.id, 0])),
    'a visit that bought nothing still has one number per row');
  for (const row of PERKS) {
    const spec = perkRow(row.id);
    const words = rankWords(row.id);
    assert.ok(words.startsWith('+' + spec.step), words + ' does not say what a rank is worth');
    assert.ok(words.endsWith(' PER RANK'), words + ' does not say it is per rank');
    assert.ok(words.includes(spec.says), words + ' does not say what it is worth in');
    if (spec.percent === true) assert.ok(words.includes('%'), words + ' is a share and does not say so');
  }
});

test('a count is read as a rank: nothing missing, nothing past the top', () => {
  const has = (ranks) => ({ perkRanks: ranks });
  assert.equal(rankOf(null, 'hull'), 0, 'no world at all is no ranks');
  assert.equal(rankOf(has({}), 'hull'), 0, 'a row with nothing stored is rank zero');
  assert.equal(rankOf(has({ hull: 3 }), 'hull'), 3);
  assert.equal(rankOf(has({ hull: 900 }), 'hull'), maxRankOf('hull'), 'and a count past the ladder is');
  assert.equal(rankOf(has({ hull: -2 }), 'hull'), 0, 'a negative count is zero');
  assert.equal(rankOf(has({ hull: 'three' }), 'hull'), 0, 'a count that is not a number is zero');
  assert.equal(rankOf(has({ hull: 2.7 }), 'hull'), 2, 'and a fraction is the rung it is standing on');
  // The ledger is what the save is written with, so it is one key per row, clamped, in table order.
  assert.deepEqual(Object.keys(perkLedger(has({ reroll: 12 }))), PERKS.map((row) => row.id));
  assert.deepEqual(perkLedger(has({ reroll: 12 })), Object.assign(newPerkRanks(), { reroll: 5 }));
});

// --- the visit that came in with ranks already bought ------------------------------

test('what the last visit bought is what this one reads', () => {
  assert.deepEqual(ranks(), LEDGER, 'a stored count came back, clamped to this build\'s ladders');
  assert.deepEqual(world.ownedShips, SHIPS_BOUGHT, 'and so did the ship it bought');
  // The gates, read straight off the visit (game/perks.js). The run that flies these is below.
  assert.equal(startingHullOf(world), HELD.hull);
  assert.equal(extraRerollsOf(world), HELD.reroll);
  assert.equal(extraBanishesOf(world), HELD.banish);
});

test('the rack prints both racks, and stops selling what has been paid for', () => {
  const lines = rows();
  assert.equal(lines.length, PERKS.length, 'one line per perk');
  for (let i = 0; i < lines.length; i++) {
    const id = perk(i).id;
    const held = LEDGER[id];
    const max = maxRankOf(id);
    assert.ok(lines[i].label.startsWith(String(keyOf(i))), lines[i].label + ' is not keyed ' + keyOf(i));
    assert.ok(lines[i].label.includes(perk(i).name), 'it says which perk it is');
    assert.ok(lines[i].label.includes(perk(i).blurb), 'and what it is for');
    assert.ok(lines[i].label.includes('RANK ' + held + ' OF ' + max),
      lines[i].label + ' does not say which rank the purse is on');
    assert.ok(lines[i].label.includes(rankWords(id)), 'and what one rank is worth');
    assert.equal(lines[i].maxed, held >= max, lines[i].label + ' has the wrong maxed state');
    if (held >= max) {
      // A walked ladder keeps every word and loses the price: there is nothing left on the row. The
      // rank line says "STARDUST" too on the Gleaner's row, so what is asked for is the price line's
      // own words and not the coin they are written in.
      assert.ok(!lines[i].label.includes('BUYS'), lines[i].label + ' is still for sale');
    } else {
      assert.ok(lines[i].label.includes(cost(id, held).toLocaleString('en-US') + ' STARDUST'),
        lines[i].label + ' does not name its price');
      assert.ok(lines[i].label.includes('SHIFT + ' + keyOf(i) + ' BUYS RANK ' + (held + 1)),
        lines[i].label + ' does not name the key that pays it');
    }
  }
  assert.equal(ranks()[DEAR], 1, 'the plating row is one rung up, not at the top');
  assert.equal(ranks()[CHEAP], 0, 'and the row this visit is going to buy is at the bottom');
});

test('a perk key shows the row and takes nothing', () => {
  // There is nothing to *pick* about a rank: a rank is bought and then it is simply on, every run.
  // So the number has exactly one honest answer, which is where the row lives (main.js
  // `onPickCard`) - and it is not a fake success, because the purse does not move until Shift says
  // so and the ship about to be flown does not either.
  const before = ranks();
  const flown = game.stats().ship;
  press('Digit' + keyOf(0));
  assert.equal(game.stats().state, game.STATE.START, 'and it did not launch anything either');
  assert.equal(game.stats().ship, flown, 'nor did it pick anything');
  assert.equal(game.stats().dust, PURSE, 'the purse did not move');
  assert.deepEqual(ranks(), before, 'and no rank arrived');
  assert.equal(hangarOpen(), true, 'it put up the panel that says what the row costs');
  press('KeyH');
  assert.equal(hangarOpen(), false, 'and H takes it away again');
});

test('the whole ladder is priced out of an evening and one rank out of an afternoon', () => {
  // The same measurement bargain as the ships (session 75 measured what runs pay: 164-781 dust for
  // a bot run that dies, about 1,000 for one that beats the arena). A first rank is a run or two;
  // a walked ladder is a night of the arena, and the dearest thing on the sheet is dearer than the
  // cheapest, so the hangar has a queue and not a queue-jump.
  const first = PERKS.map((row) => cost(row.id, 0));
  assert.ok(Math.max(...first) < 200, 'a first rank is one run: ' + first.join('/'));
  const ladders = PERKS.map((row) => perkLadderCost(row.id));
  assert.ok(Math.min(...ladders) > 1000, 'a whole ladder is many runs: ' + ladders.join('/'));
  for (const row of PERKS) {
    if (row.id === 'dust') continue;
    assert.ok(perkLadderCost('dust') >= perkLadderCost(row.id),
      'the Gleaner pays for itself and is priced like it');
  }
});

test('a rank cannot be bought from a screen that does not print its price', () => {
  assert.equal(hangarOpen(), false, 'the visit opens on the title');
  buy(indexOf(CHEAP));
  assert.equal(game.stats().dust, PURSE, 'nothing was spent from the title');
  assert.equal(ranks()[CHEAP], 0, 'and nothing arrived for it');
});

test('shift and the perk key buys one rank', () => {
  press('KeyH');
  assert.equal(hangarOpen(), true, 'the rack is up, and its price is on the glass');
  buy(indexOf(CHEAP));
  assert.equal(game.stats().dust, PURSE - cost(CHEAP, 0), 'the purse paid exactly the price');
  assert.equal(ranks()[CHEAP], 1, 'and one rank arrived');
  assert.equal(stored().hangar.perks[CHEAP], 1, 'and the next visit will find it bought');
  assert.deepEqual(stored().hangar.ships, SHIPS_BOUGHT,
    'and the ship section of the same save was not touched on the way');
  assert.ok(rows()[indexOf(CHEAP)].label.includes('RANK 1 OF ' + maxRankOf(CHEAP)),
    'and the row says so: ' + rows()[indexOf(CHEAP)].label);
  assert.equal(game.screen.hangarDust, (PURSE - cost(CHEAP, 0)).toLocaleString('en-US'),
    'and so does the purse at the top of the panel');
  assert.deepEqual(ranks(), Object.assign({}, LEDGER, { [CHEAP]: 1 }), 'and nothing else moved');
});

test('the next rung asks the next price', () => {
  buy(indexOf(CHEAP));
  assert.equal(ranks()[CHEAP], 2);
  assert.equal(game.stats().dust, PURSE - cost(CHEAP, 0) - cost(CHEAP, 1), 'and it was paid');
  const line = rows()[indexOf(CHEAP)].label;
  assert.ok(line.includes(cost(CHEAP, 2).toLocaleString('en-US') + ' STARDUST'),
    'the row now asks the third price: ' + line);
  assert.ok(line.includes('BUYS RANK 3'), 'and says which rank that one is: ' + line);
});

test('a purse that is short buys no rank, and takes nothing back', () => {
  const before = game.stats().dust;
  assert.ok(before < cost(DEAR, 1), 'the purse really is short of the next plating rank');
  buy(indexOf(DEAR));
  assert.equal(game.stats().dust, before, 'the purse kept what it could not spend');
  assert.equal(ranks()[DEAR], 1, 'and no rank arrived for it');
  assert.equal(stored().hangar.perks[DEAR], 1, 'and the save was not touched either');
});

test('a ladder that has been walked out has nothing left to sell', () => {
  // Reroll came in at the top of its ladder. There is no price for a sixth rank and so nothing on
  // the row to buy: the purse stays where it is, the row keeps every word it has, and the shop never
  // asks `perkPriceOf` for a rung that does not exist.
  const top = indexOf('reroll');
  assert.equal(rows()[top].maxed, true);
  const dust = game.stats().dust;
  buy(top);
  assert.equal(game.stats().dust, dust, 'the row took money for nothing');
  assert.equal(ranks().reroll, maxRankOf('reroll'), 'and no sixth rank appeared');
  assert.ok(!rows()[top].label.includes('BUYS'), 'and it never asked: ' + rows()[top].label);
});

test('a bought rank goes on the run that comes next', () => {
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY, 'and one key still launches');
  assert.equal(hangarOpen(), false, 'with the panel coming down');
  const body = BALANCE.ships[game.stats().ship];
  // The ledger as it stands now, not as the save brought it: this file has bought two ranks of
  // Banish on the way here, and a run is built from what the purse holds when it is put together.
  const held = ranks();
  assert.equal(game.stats().maxHull, body.maxHull + held.hull, 'the plating is in the bar');
  assert.equal(game.stats().hull, body.hull + held.hull, 'and it is there to start on');
  assert.equal(world.rerollsLeft, BALANCE.cards.rerolls + held.reroll,
    'and the table may be dealt again as many times as the purse paid for');
  assert.equal(world.banishesLeft, BALANCE.cards.banishes + held.banish);
  // The Gleaner: five ranks of +10% (the stored nine was clamped to the ladder), so a run worth a
  // hundred dust pays a hundred and fifty (game/stardust.js).
  world.score = BALANCE.stardust.perScore * 100;
  assert.equal(game.stats().dustEarned, 150);
});

test('and it pays that much when the run goes down', () => {
  const purse = game.stats().dust;
  killTheRun(BALANCE.stardust.perScore * 100);
  // The awards this ending won are paid in the same breath as the run is scored (game/awards.js),
  // so the honest line is the two of them together and not the Gleaner's share on its own.
  const won = dustTotal(game.stats().awardsNew);
  assert.equal(game.stats().dust, purse + 150 + won, 'the purse was paid the Gleaner\'s share');
  assert.ok(game.screen.finalDust.includes('+150'), 'and the card says what the run paid: '
    + game.screen.finalDust);
});

test('and the next run flies with them too', () => {
  // The ranks belong to the visit and not to a run: `resetRun` clears the build, the asks and the
  // ship, and then reads the ledger again (game/run.js). A run that spent them is not the last one.
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY);
  const body = BALANCE.ships[game.stats().ship];
  const held = ranks();
  assert.equal(game.stats().hull, body.hull + held.hull);
  assert.equal(world.rerollsLeft, BALANCE.cards.rerolls + held.reroll);
  assert.equal(world.banishesLeft, BALANCE.cards.banishes + held.banish);
  assert.equal(held[CHEAP], 2, 'and the row is still two ranks up');
});

test('a purchase is remembered as a ledger, in the table\'s own shape', () => {
  const written = stored().hangar.perks;
  assert.deepEqual(Object.keys(written), Object.keys(written).slice().sort(),
    'the ledger is written in one order, so the same purchases write the same text');
  assert.deepEqual(written, Object.assign({}, LEDGER, { [CHEAP]: 2 }),
    'clamped to this build\'s ladders, and nothing else');
});
