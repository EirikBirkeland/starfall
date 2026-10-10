// A hangar that *arrived* with awards already won (PLAN 3.7, game/awards.js).
//
// The rack is the one place the whole table can be read, so the thing worth proving about it is the
// visit after the one that filled it in: that a save which earned three awards last time opens with
// three lit rows and a heading that counts them, and that a number in the heading is this build's
// table and not whatever list the document happens to hold.
//
// The second point is the one that needs an uninvited guest: a save written by a newer page can name
// an award this build has never heard of (`core/save.js` keeps any well-formed name, and it is not
// wrong to). There is no row to light for it, so it is counted out of the total rather than invented
// one - and it still rides back out through the next write, because this build does not get to
// forget an award it cannot see.
//
// One boot reads one save (tools/headless/harness.js), so this is its own file.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { AWARDS, dustOf, shareOf } from '../src/game/awards.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

/** Two this build knows, and one it does not. */
const WON = ['century', 'warmed-up', 'moonlit'];

const game = await bootGame({
  root: ROOT, seed: 4211, width: 1280, height: 720,
  storage: { 'starfall.save': JSON.stringify({ version: 1, awards: { won: WON } }) },
});

function saveIn() {
  return JSON.parse(game.storage['starfall.save']).awards.won;
}

function rack() {
  return game.screen.awards;
}

function rowOf(id) {
  return rack()[AWARDS.findIndex((award) => award.id === id)];
}

/** Launch a run, then park it: nothing arrives, and the clock runs. */
function launch() {
  game.pressMouse(640, 300);
  game.step(FRAME);
  game.releaseMouse();
  game.step(FRAME);
  game.world.spawnTimer = Infinity;
  assert.equal(game.stats().state, game.STATE.PLAY);
}

/** Park a lethal enemy on the ship and run one frame, the way test/session.test.mjs does. */
function killTheShip() {
  const ship = game.player;
  ship.hull = 1;
  ship.invuln = 0;
  ship.fireTimer = 5;
  game.enemies.push(makeEnemy(game.world, 'drifter', ship.x, ship.y, {
    hp: 1, speed: 0, drop: 0, score: 0,
  }));
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.OVER);
}

test('the rows the save came with are lit before anything is flown, and nothing else is', () => {
  assert.deepEqual(game.stats().awards, ['century', 'moonlit', 'warmed-up'],
    'the save was read whole, stranger and all (the store keeps a set of names in its own order)');
  assert.equal(rack().filter((row) => !row.unwon).length, 2,
    'two rows are lit, because two of these awards exist in this build');
  assert.equal(rowOf('century').unwon, false);
  assert.equal(rowOf('century').pays, '');
  assert.equal(rowOf('warmed-up').unwon, false);
  assert.equal(rowOf('warmed-up').pays, '');
  assert.equal(rack().filter((row) => row.unwon).length, AWARDS.length - 2);

  // The heading counts this build's table, which is the only table there are rows for: three ids in
  // the document is two rows lit and a heading that says two, not a heading that says three about a
  // row that is not in the game.
  assert.equal(shareOf(WON).won, 2, 'and the count itself agrees');
  assert.equal(game.screen.awardTitle, 'AWARDS 2 OF ' + AWARDS.length);
  assert.equal(game.screen.titleAwards, game.screen.awardTitle);
});

test('what the visit wins joins what it arrived with, on the rack and in the save', async () => {
  await game.resetToTitle(4212);
  launch();
  game.world.tally.dashes = BALANCE.awards.rows.streaked.need;
  game.step(FRAME);
  killTheShip();

  assert.deepEqual(game.stats().awardsNew, ['streaked']);
  assert.equal(rowOf('streaked').unwon, false, 'the new one is lit the moment the card goes up');
  assert.equal(rowOf('streaked').pays, '', 'and stops being for sale in the same breath');
  assert.equal(game.screen.awardTitle, 'AWARDS 3 OF ' + AWARDS.length);
  assert.equal(game.screen.titleAwards, game.screen.awardTitle);

  // The write is the union, and it keeps the award this build cannot see: a save is one document and
  // this build is one page in its life.
  assert.deepEqual(saveIn(), ['century', 'moonlit', 'streaked', 'warmed-up']);
  assert.equal(rack().filter((row) => !row.unwon).length, 3);
  assert.equal(dustOf('streaked'), BALANCE.awards.rows.streaked.dust);
});
