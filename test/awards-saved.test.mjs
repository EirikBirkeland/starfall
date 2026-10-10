// A visit that *arrived* with awards already won (PLAN 3.7, game/awards.js).
//
// The purse, the ships, the codex and the awards are all read once when a visit opens, and the one
// thing a test can only prove about a ledger is what happens on the visit *after* the one that
// filled it in: that the awards it came with are neither announced again nor paid again, that the
// new ones join them in the write, and that nonsense in the document is not a save.
//
// One boot reads one save (tools/headless/harness.js), so this is its own file: test/awards.test.mjs
// spends its visit on a first one.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { AWARDS, nameOf } from '../src/game/awards.js';
import { makeEnemy } from '../src/game/kinds.js';
import { toastCount } from '../src/render/toast.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const WON = ['century', 'warmed-up'];

const game = await bootGame({
  root: ROOT, seed: 4112, width: 1280, height: 720,
  storage: { 'starfall.save': JSON.stringify({ version: 1, awards: { won: WON } }) },
});

function saveIn() {
  return JSON.parse(game.storage['starfall.save']).awards.won;
}

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

test('the awards a save came with are on the title before anything is played', () => {
  assert.deepEqual(game.stats().awards, WON);
  assert.equal(game.screen.titleAwards, 'AWARDS ' + WON.length + ' OF ' + AWARDS.length);
  assert.equal(toastCount(), 0, 'and nobody is congratulated for a save reloading');
});

test('a threshold the last visit already cleared is neither announced nor paid again', async () => {
  await game.resetToTitle(4113);
  launch();
  // The exact rule CENTURY is made of, walked past a second time by a second run.
  game.world.kills = BALANCE.awards.rows['century'].need;
  game.step(FRAME);
  assert.equal(toastCount(), 0, 'no plate for a thing this save already has');
  assert.equal(game.world.runAwards.length, 0);

  killTheShip();
  assert.equal(game.stats().awardsNew.length, 0, 'and nothing new to say about it on the card');
  assert.equal(game.screen.finalAwards, '');
  assert.deepEqual(game.stats().awards, WON, 'the ledger is the two it arrived with');
  assert.deepEqual(saveIn(), WON.slice().sort(), 'and the write says the same');
});

test('what this visit wins joins what it arrived with, and the card names only the new', async () => {
  await game.resetToTitle(4114);
  launch();
  // STREAKED, which the arriving save did not have, and which has no lower rung a level fifty run
  // would drag in with it: two hundred and fifty dashes, counted on the spot.
  game.world.tally.dashes = BALANCE.awards.rows.streaked.need;
  game.step(FRAME);
  assert.equal(toastCount(), 1, 'and it is announced on its own, because it is new to this save');
  assert.equal(game.texts().some((word) => word.text === nameOf('streaked')), true);

  killTheShip();
  const stats = game.stats();
  assert.deepEqual(stats.awardsNew, ['streaked']);
  assert.deepEqual(stats.awards, WON.concat(['streaked']));
  assert.equal(game.screen.finalAwards.indexOf('STREAKED') >= 0, true, 'named on the card');
  assert.equal(game.screen.finalAwards.indexOf('CENTURY'), -1, 'and only the new one');
  assert.deepEqual(saveIn(), WON.concat(['streaked']).sort(), 'the write is the union, sorted');
  assert.equal(game.screen.titleAwards, 'AWARDS 3 OF ' + AWARDS.length);
  // The purse: the run's own worth, plus the one new award and not the two old ones.
  assert.equal(stats.dust, stats.dustEarned + BALANCE.awards.rows.streaked.dust);
});
