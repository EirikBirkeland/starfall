// The awards on the glass, third rack of the hangar (PLAN 3.7, game/awards.js).
//
// The rules are test/awards-rules.test.mjs and the plate that announces one mid-run is
// test/awards.test.mjs. What is proved here is the *rack*: that the whole table can be read, which
// until now it could not - thirty rows of content with a count on the title and no way to see what
// the count was counting.
//
// So: every row is there, in the table's own words (the panel is not allowed to paraphrase an award
// or disagree with the plate that announced it), which of them are lit and which say what they still
// pay, the count in the rack's own heading agreeing with the one on the title, and the rack knowing
// about an award the run that just stopped won - it is painted at boot and at every ending, which is
// the same promise the codex and the log make (test/codex.test.mjs, test/history.test.mjs).
//
// This visit starts with an empty save. A visit that *arrived* with awards won, including one id
// this build has never heard of, is test/awards-rack-saved.test.mjs, because one boot reads one save
// (tools/headless/harness.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { AWARDS, dustOf } from '../src/game/awards.js';
import { makeEnemy } from '../src/game/kinds.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

const game = await bootGame({ root: ROOT, seed: 4201, width: 1280, height: 720, storage: {} });

function saveIn() {
  const text = game.storage['starfall.save'];
  return text === undefined ? null : JSON.parse(text).awards.won;
}

/** The rack as the player reads it: one line per award in the table. */
function rack() {
  return game.screen.awards;
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

test('the whole table is on the glass before anything is flown, and none of it is earned yet', () => {
  const rows = rack();
  assert.equal(rows.length, AWARDS.length, 'one row per award, and not one less');
  assert.equal(game.screen.awardTitle, 'AWARDS 0 OF ' + AWARDS.length);
  assert.equal(game.screen.titleAwards, game.screen.awardTitle,
    'the title and the rack say the same number, because it is the same number');

  for (let i = 0; i < rows.length; i++) {
    const award = AWARDS[i];
    const row = rows[i];
    // The panel's words *are* the table's: an award is described once, in one place, and a rack that
    // re-worded it would be free to promise something the rule does not require.
    assert.equal(row.name, award.name, award.id);
    assert.equal(row.says, award.says, award.id);
    assert.equal(row.unwon, true, award.id + ' is not earned yet, so its row is dim');
    assert.equal(row.pays, 'PAYS ' + dustOf(award.id),
      award.id + ' says what it still pays, which is what the purse is being saved up for');
  }
});

test('the rack is on the back of the hangar, on the panel that says what stardust buys', () => {
  // H puts it up with everything else the hangar has; H again takes the whole panel down, rows and
  // all. It is not a panel of its own on a key of its own: an award is stardust, and the hangar is
  // where stardust lives.
  assert.equal(game.screen.hangarHidden, true);
  game.key('KeyH', true); game.key('KeyH', false); game.step(FRAME);
  assert.equal(game.screen.hangarHidden, false);
  assert.equal(rack().length, AWARDS.length, 'the rack came up with the panel');

  game.key('KeyH', true); game.key('KeyH', false); game.step(FRAME);
  assert.equal(game.screen.hangarHidden, true, 'and went back down with it');

  // The codex, which is the other panel of rows, does not carry it: what a save has *won* is not the
  // same list as what it has *met*, and the codex's own tally would have started meaning two things.
  game.key('KeyC', true); game.key('KeyC', false); game.step(FRAME);
  assert.equal(game.screen.codexHidden, false);
  assert.equal(game.screen.hangarHidden, true, 'the two panels are never up at once');
  game.key('KeyC', true); game.key('KeyC', false); game.step(FRAME);
});

test('an award the run wins is lit on the rack the moment the card goes up', () => {
  launch();
  // The exact rule CENTURY is made of, walked past while the run is still flying.
  game.world.kills = BALANCE.awards.rows.century.need;
  game.step(FRAME);

  killTheShip();
  const stats = game.stats();
  assert.deepEqual(stats.awardsNew, ['century'], 'the ending won the one');
  assert.deepEqual(stats.awards, ['century'], 'and the save now holds exactly that');

  const rows = rack();
  const century = rows[AWARDS.findIndex((a) => a.id === 'century')];
  assert.equal(century.unwon, false, 'its row is lit');
  assert.equal(century.pays, '',
    'and gives up its number: a paid award is not still for sale, and a rack of gold numbers the purse already collected would be a lie');

  assert.equal(rows.filter((row) => row.unwon).length, AWARDS.length - 1);
  assert.equal(game.screen.awardTitle, 'AWARDS 1 OF ' + AWARDS.length);
  assert.equal(game.screen.titleAwards, game.screen.awardTitle,
    'and the title was written from the same ids as the rack');
  assert.deepEqual(saveIn(), ['century'], 'and the save has it, so the next visit reads it lit');
});

test('an ending that wins nothing leaves the rack exactly as it was', async () => {
  const before = rack().map((row) => row.name + '|' + row.unwon + '|' + row.pays);
  await game.resetToTitle(4202);
  launch();
  killTheShip();
  assert.deepEqual(game.stats().awardsNew, [], 'nothing new this time');
  assert.deepEqual(game.stats().awards, ['century'], 'what it arrived with is still its own');
  assert.deepEqual(rack().map((row) => row.name + '|' + row.unwon + '|' + row.pays), before,
    'and a card that says nothing about awards does not touch the panel that does');
});
