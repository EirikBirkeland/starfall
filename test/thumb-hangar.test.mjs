// The shop under a thumb (PLAN 3.7, PLAN section 6, main.js `pressHangarPanel`).
//
// A phone visitor has been earning stardust all run and spending none of it: the hangar opens with `H`,
// its rows are picked with number keys and bought with a Shift chord. This file holds the fifth chip on
// the rail and the shop it opens - and above all the one rule that makes a shop safe under a finger:
// **a row that costs stardust asks.** The first tap puts the ask on the row and takes nothing; the second
// tap on that same row is the purchase; anything else takes the ask off.
//
// Two things are said rather than measured, because the harness has no layout engine: `touch: true` boots
// a browser that reports fingers, and the boxes below say where the page laid the chips and the two racks
// out (`layOutRows`, after the racks exist). Everything else - the hit-testing, the purse, the save write,
// the rank arriving - is the shipped code.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { SHIPS } from '../src/game/ships.js';
import { PERKS } from '../src/game/perks.js';
import { priceOf, perkPriceOf } from '../src/game/hangar.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4024;

/** What the purse starts each of these tests with: enough to be interesting, not enough for everything. */
const PURSE = 3000;

/** Where the browser put the rail, its five chips, and the chip standing on the shop. */
const LAYOUT = {
  thumbRail: { rect: { left: 300, top: 640, width: 680, height: 48 } },
  chipToday: { rect: { left: 310, top: 640, width: 90, height: 48 } },
  chipRule: { rect: { left: 410, top: 640, width: 80, height: 48 } },
  chipMute: { rect: { left: 500, top: 640, width: 90, height: 48 } },
  chipSettings: { rect: { left: 600, top: 640, width: 130, height: 48 } },
  chipHangar: { rect: { left: 740, top: 640, width: 120, height: 48 } },
  hangarClose: { rect: { left: 560, top: 600, width: 160, height: 44 } },
};

const HANGAR = { x: 800, y: 664 };
const CLOSE = { x: 640, y: 622 };

/** The two racks, side by side the way the page lays them: five ships, then four perks. */
const SHIP_LEFT = 120;
const PERK_LEFT = 600;
const RACK_TOP = 200;
const ROW_H = 44;
const ROW_W = 420;

function shipPoint(i) { return { x: SHIP_LEFT + ROW_W / 2, y: RACK_TOP + i * ROW_H + ROW_H / 2 }; }
function perkPoint(i) { return { x: PERK_LEFT + ROW_W / 2, y: RACK_TOP + i * ROW_H + ROW_H / 2 }; }

/** Anywhere on the shop that is neither a row nor the chip. */
const BETWEEN = { x: SHIP_LEFT + ROW_W / 2, y: RACK_TOP - 14 };

const game = await bootGame({
  root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height,
  touch: true, layout: LAYOUT,
});
const world = game.world;

const PAGE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let fingerId = 0;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

function tap(x, y) {
  const id = fingerId++;
  game.touchDown(x, y, id);
  game.touchUp(0, 0, id);
  frames(2);
}

/** Say where the browser laid both racks out. Called after the shop has been put up. */
function layOut() {
  const ships = [];
  for (let i = 0; i < SHIPS.length; i++) {
    ships.push({ left: SHIP_LEFT, top: RACK_TOP + i * ROW_H, width: ROW_W, height: ROW_H });
  }
  game.layOutRows('shipRow', ships);
  const perks = [];
  for (let i = 0; i < PERKS.length; i++) {
    perks.push({ left: PERK_LEFT, top: RACK_TOP + i * ROW_H, width: ROW_W, height: ROW_H });
  }
  game.layOutRows('perkRow', perks);
}

/** A fresh title, a purse with something in it, and the shop up with its rows laid out. */
async function shop(dust) {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(world.state, STATE.START);
  world.dust = dust === undefined ? PURSE : dust;
  tap(HANGAR.x, HANGAR.y);
  assert.equal(game.screen.hangarHidden, false, 'the chip put the shop up');
  layOut();
}

function ships() { return game.screen.ships; }
function perks() { return game.screen.perks; }

test('the rail has a HANGAR chip and the shop has a way out', () => {
  assert.ok(/<span class="chip" id="chipHangar">HANGAR<\/span>/.test(PAGE),
    'the page ships the fifth chip with its own word on it');
  assert.ok(/<div class="chip gone" id="hangarClose">CLOSE<\/div>/.test(PAGE),
    'and the shop ships its CLOSE chip put away');
  assert.equal(game.classes('hangarClose').includes('gone'), false,
    'and this visit, which arrived on a finger, has it put out');
});

test('the HANGAR chip is the H key, and the shop owns the glass it is up on', async () => {
  await shop();
  tap(HANGAR.x, HANGAR.y);
  assert.equal(game.screen.hangarHidden, false, 'the chip behind the shop answers nothing');
  assert.equal(world.state, STATE.START, 'and the tap did not go through to the launch');

  tap(CLOSE.x, CLOSE.y);
  assert.equal(game.screen.hangarHidden, true, 'the way out is the chip standing on the shop');
  assert.equal(world.state, STATE.START, 'and shutting a panel is not a launch either');
});

test('the shop is written for the hand that arrived', async () => {
  await shop();
  assert.equal(game.text('hangarHintPick'), 'TAP A SHIP TO FLY IT', 'the pick, in thumb words');
  assert.equal(game.text('hangarHintLaunch'), ' \u00b7 CLOSE TO LAUNCH',
    'and the launch, which a finger gets by closing the shop and tapping the title');
  assert.ok(game.classes('hangarHintBack').includes('gone'), 'and the clause naming H is put away');
  assert.ok(game.classes('hangarKeysLine').includes('gone'),
    'and the whole line of Shift chords goes with it');
  // The rows say the rest, where it matters: every row that costs anything names the tap that pays.
  assert.match(ships()[1].label, /TAP TO BUY IT/, 'a locked ship says which tap buys it');
  assert.match(perks()[0].label, /TAP TO BUY RANK 1/, 'and so does a perk ladder');
});

test('the first tap on a row that costs stardust asks, and takes nothing', async () => {
  await shop();
  const cost = priceOf(SHIPS[1].id);
  assert.equal(ships()[1].locked, true, 'the second ship is not the purse\u2019s yet');

  tap(shipPoint(1).x, shipPoint(1).y);
  assert.equal(world.dust, PURSE, 'the purse did not move');
  assert.equal(ships()[1].locked, true, 'the ship is still not yours');
  assert.equal(ships()[1].asking, true, 'and the row is asking');
  assert.match(ships()[1].label, new RegExp(cost.toLocaleString('en-US') + ' STARDUST'),
    'the price is still on the row, where it was before the ask');
  assert.match(ships()[1].label, /TAP AGAIN TO BUY IT/, 'and the row says what the next tap is');
});

test('the second tap on that row is the purchase', async () => {
  await shop();
  const cost = priceOf(SHIPS[1].id);
  const flown = world.ship;

  tap(shipPoint(1).x, shipPoint(1).y);
  tap(shipPoint(1).x, shipPoint(1).y);
  assert.equal(world.dust, PURSE - cost, 'the purse paid the price the row was printing');
  assert.equal(ships()[1].locked, false, 'the row is handed over');
  assert.equal(ships()[1].asking, false, 'and the ask is off it');
  assert.equal(ships()[1].label.includes('STARDUST'), false, 'a bought row keeps every word but its price');
  assert.equal(world.ship, flown, 'and buying is not picking: the ship about to be flown did not move');
});

test('a tap on a ship the purse has is the number key: the next run flies it', async () => {
  await shop();
  const cost = priceOf(SHIPS[2].id);
  tap(shipPoint(2).x, shipPoint(2).y);
  tap(shipPoint(2).x, shipPoint(2).y);
  assert.equal(ships()[2].picked, false, 'and buying a ship did not pick it');

  tap(shipPoint(2).x, shipPoint(2).y);
  assert.equal(world.ship, SHIPS[2].id, 'one tap on a bought row flies that one');
  assert.equal(ships()[2].picked, true, 'and the row lights, the same light the number key lights');
  assert.equal(world.dust, PURSE - cost, 'a pick costs nothing');
});

test('a perk rank arrives on the second tap', async () => {
  await shop();
  const cost = perkPriceOf(PERKS[0].id, 0);
  assert.match(perks()[0].label, /RANK 0 OF/, 'the ladder starts at the bottom');

  tap(perkPoint(0).x, perkPoint(0).y);
  assert.match(perks()[0].label, /TAP AGAIN TO BUY RANK 1/, 'the row asks first, same as a ship');
  assert.equal(world.dust, PURSE, 'and nothing has been spent');

  tap(perkPoint(0).x, perkPoint(0).y);
  assert.equal(world.dust, PURSE - cost, 'the second tap is the purchase');
  assert.match(perks()[0].label, /RANK 1 OF/, 'and the rank is on the row');
});

test('a purse that cannot pay is a silent press', async () => {
  // The needle is the one ship none of these tests has bought and this purse cannot cover.
  await shop(10);
  assert.equal(ships()[3].locked, true, 'and it is still on the shelf');

  tap(shipPoint(3).x, shipPoint(3).y);
  assert.equal(ships()[3].asking, false, 'the shop does not ask a question it knows the purse cannot answer');
  assert.match(ships()[3].label, /TAP TO BUY IT/, 'the row says the same thing it said before');
  assert.equal(world.dust, 10, 'and the purse is untouched');
});

test('a tap on another row takes the ask off the first', async () => {
  await shop();
  tap(perkPoint(0).x, perkPoint(0).y);
  assert.equal(perks()[0].asking, true, 'the first row is asking');

  tap(perkPoint(2).x, perkPoint(2).y);
  assert.equal(perks()[0].asking, false, 'the ask moved with the tap');
  assert.equal(perks()[2].asking, true, 'and the row that was tapped is the one asking now');
  assert.match(perks()[0].label, /TAP TO BUY RANK/, 'the first row is back to asking to be asked');
  assert.equal(world.dust, PURSE, 'and nothing was spent on either of them');
});

test('a tap between the rows asks nothing and spends nothing', async () => {
  await shop();
  tap(perkPoint(1).x, perkPoint(1).y);
  assert.equal(perks()[1].asking, true, 'a row is asking');

  tap(BETWEEN.x, BETWEEN.y);
  assert.equal(perks()[1].asking, false, 'the glass between the rows took the ask off');
  assert.equal(world.dust, PURSE, 'and spent nothing');
  assert.equal(game.screen.hangarHidden, false, 'the shop is still the shop');
  assert.equal(world.state, STATE.START, 'and nothing launched behind it');
});

test('the ask does not outlive the shop', async () => {
  await shop();
  tap(shipPoint(3).x, shipPoint(3).y);
  assert.equal(ships()[3].asking, true, 'a row is asking');

  tap(CLOSE.x, CLOSE.y);
  tap(HANGAR.x, HANGAR.y);
  layOut();
  assert.equal(game.screen.hangarHidden, false, 'the shop came back up');
  for (const row of ships()) {
    assert.equal(row.asking, false, 'and it came back up asking nothing');
  }
  assert.equal(world.dust, PURSE, 'with the purse exactly where it was');
});
