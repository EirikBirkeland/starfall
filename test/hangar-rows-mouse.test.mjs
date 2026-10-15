// The shop under a cursor (PLAN section 6).
//
// The thumb's shop is the same shop, so most of what this file holds is what did *not* move: a visit the
// browser says has no fingers is given no HANGAR chip on the rail and no CLOSE chip on the panel, and it
// reads the Shift chords the page ships. What did move is that a row now answers a click as well as a tap -
// a press is a press, and there is one press handler in the game - and that the click has to say what it is
// doing in the words this visit reads, which is CLICK and not TAP.
//
// One boot per process, so the thumb half of this lives in test/thumb-hangar.test.mjs and the two files
// differ only in what the stub browser was told about its own fingers.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { STATE } from '../src/game/state.js';
import { SHIPS } from '../src/game/ships.js';
import { PERKS } from '../src/game/perks.js';
import { priceOf } from '../src/game/hangar.js';
import { hasFinger } from '../src/input/touch.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const VIEW = { width: 1280, height: 720 };
const SEED = 4025;

/** The very boxes the thumb visit is given: the difference between the two visits is not the layout. */
const LAYOUT = {
  thumbRail: { rect: { left: 300, top: 640, width: 680, height: 48 } },
  chipToday: { rect: { left: 310, top: 640, width: 90, height: 48 } },
  chipRule: { rect: { left: 410, top: 640, width: 80, height: 48 } },
  chipMute: { rect: { left: 500, top: 640, width: 90, height: 48 } },
  chipSettings: { rect: { left: 600, top: 640, width: 130, height: 48 } },
  chipHangar: { rect: { left: 740, top: 640, width: 120, height: 48 } },
  hangarClose: { rect: { left: 560, top: 600, width: 160, height: 44 } },
};

const CLOSE = { x: 640, y: 622 };
const SHIP_LEFT = 120;
const PERK_LEFT = 600;
const RACK_TOP = 200;
const ROW_H = 44;
const ROW_W = 420;

function shipPoint(i) { return { x: SHIP_LEFT + ROW_W / 2, y: RACK_TOP + i * ROW_H + ROW_H / 2 }; }
function perkPoint(i) { return { x: PERK_LEFT + ROW_W / 2, y: RACK_TOP + i * ROW_H + ROW_H / 2 }; }
const BETWEEN = { x: SHIP_LEFT + ROW_W / 2, y: RACK_TOP - 14 };

/** Enough for the second ship and a rank, and for asking about the third. */
const PURSE = 900;

const game = await bootGame({
  root: ROOT, seed: SEED, width: VIEW.width, height: VIEW.height, layout: LAYOUT,
});
const world = game.world;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

function click(x, y) {
  game.pressMouse(x, y, 0);
  game.releaseMouse(0);
  frames(2);
}

function layOut() {
  game.layOutRows('shipRow', SHIPS.map((s, i) => ({
    left: SHIP_LEFT, top: RACK_TOP + i * ROW_H, width: ROW_W, height: ROW_H,
  })));
  game.layOutRows('perkRow', PERKS.map((p, i) => ({
    left: PERK_LEFT, top: RACK_TOP + i * ROW_H, width: ROW_W, height: ROW_H,
  })));
}

/** A title, a purse, and the shop put up the only way this visit can put it up. */
async function shop() {
  await game.resetToTitle(SEED);
  frames(2);
  assert.equal(world.state, STATE.START);
  world.dust = PURSE;
  game.key('KeyH', true);
  game.key('KeyH', false);
  frames(2);
  assert.equal(game.screen.hangarHidden, false, 'H put the shop up');
  layOut();
}

function ships() { return game.screen.ships; }
function perks() { return game.screen.perks; }

test('a visit with no fingers is given no chip for the shop and no way out of it', () => {
  assert.equal(hasFinger(), false, 'the stub browser said so when it was asked');
  assert.equal(game.classes('thumbRail').includes('hidden'), true, 'and the rail stayed put away');
  assert.ok(game.classes('hangarClose').includes('gone'),
    'and so did the chip on the shop, because this visit has H');
});

test('the rows teach the chord, because this visit has the chord', async () => {
  await shop();
  assert.equal(game.text('hangarHintPick'), '1 \u2013 5 PICK A SHIP', 'the pick, in keyboard words');
  assert.equal(game.text('hangarHintLaunch'), ' \u00b7 SPACE TO LAUNCH', 'and the launch, which is on the title');
  assert.ok(!game.classes('hangarHintBack').includes('gone'), 'and H is named, because this visit has H');
  assert.ok(!game.classes('hangarKeysLine').includes('gone'), 'and so are the chords');
  assert.match(ships()[1].label, /SHIFT \+ 2 BUYS IT/, 'a locked ship says the chord that buys it');
  assert.match(perks()[0].label, /SHIFT \+ 6 BUYS RANK 1/, 'and so does a perk ladder');
});

test('a click on a row that costs stardust asks, in the words this visit reads', async () => {
  await shop();
  const cost = priceOf(SHIPS[1].id);

  click(shipPoint(1).x, shipPoint(1).y);
  assert.equal(world.dust, PURSE, 'the purse did not move');
  assert.equal(ships()[1].locked, true, 'and the ship is still on the shelf');
  assert.equal(ships()[1].asking, true, 'but the row is asking');
  assert.match(ships()[1].label, new RegExp(cost.toLocaleString('en-US') + ' STARDUST'),
    'with the price still on it');
  assert.match(ships()[1].label, /CLICK AGAIN TO BUY IT/,
    'and the ask names a click, which is the press this visit has');
});

test('the second click is the purchase, and a bought row answers the next one', async () => {
  await shop();
  const cost = priceOf(SHIPS[1].id);
  const flown = world.ship;

  click(shipPoint(1).x, shipPoint(1).y);
  click(shipPoint(1).x, shipPoint(1).y);
  assert.equal(world.dust, PURSE - cost, 'the purse paid the price the row was printing');
  assert.equal(ships()[1].locked, false, 'the row is handed over');
  assert.equal(world.ship, flown, 'and buying is still not picking');

  click(shipPoint(1).x, shipPoint(1).y);
  assert.equal(world.ship, SHIPS[1].id, 'and the row now answers the click as the number key answers it');
  assert.equal(ships()[1].picked, true, 'lit the same light');
});

test('a click between the rows asks nothing, spends nothing and launches nothing', async () => {
  await shop();
  click(perkPoint(1).x, perkPoint(1).y);
  assert.equal(perks()[1].asking, true, 'a row is asking');

  click(BETWEEN.x, BETWEEN.y);
  assert.equal(perks()[1].asking, false, 'the glass between the rows took the ask off');
  assert.equal(world.dust, PURSE, 'and spent nothing');
  assert.equal(game.screen.hangarHidden, false, 'the shop is still up, because the shop owns its glass');
  assert.equal(world.state, STATE.START, 'and nothing launched behind it');
});

test('the ask does not outlive the shop, and the shop still opens and closes on H', async () => {
  await shop();
  click(shipPoint(2).x, shipPoint(2).y);
  assert.equal(ships()[2].asking, true, 'a row is asking');

  game.key('KeyH', true);
  game.key('KeyH', false);
  frames(2);
  assert.equal(game.screen.hangarHidden, true, 'H took the shop down, the way it always did');

  game.key('KeyH', true);
  game.key('KeyH', false);
  frames(2);
  layOut();
  assert.equal(game.screen.hangarHidden, false, 'and H put it back up');
  for (const row of ships()) assert.equal(row.asking, false, 'asking nothing');
  assert.equal(world.dust, PURSE, 'with the purse exactly where it was');
});
