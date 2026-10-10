// A visit that arrived already knowing things (PLAN 3.7, game/codex.js).
//
// The codex is read out of the save when the visit opens, beside the purse and the ships the purse
// bought - which means the panel's first words come from a document and not from anything that
// happened on this page. That is worth its own file, because it is the half of the feature a player
// meets most often: most visits do not discover anything new, they open on a codex that is partly
// filled in and say which rows are still empty.
//
// One boot, and one save: a body, a fight, a card, and a synergy, met by some earlier visit. The
// synergy is written by hand on purpose - it is the slowest thing in the game to earn, and the row has
// to be able to be lit without a whole schedule being walked to prove it can be.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { CARDS, ENTRIES, HOSTS, SYNERGIES } from '../src/game/codex.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

const CAME_WITH = {
  version: 1,
  codex: { hosts: ['tank', 'warden'], lines: ['burn', 'thermal-shock'] },
};

const game = await bootGame({
  root: ROOT,
  seed: 7,
  storage: { 'starfall.save': JSON.stringify(CAME_WITH) },
});

function panel(which) {
  return game.screen.codexPanels[which];
}

function met(rows) {
  return rows.filter((row) => !row.unknown);
}

function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

test('the save is read before anything is played, and the panel prints it', () => {
  assert.deepEqual(game.stats().codex, {
    hosts: ['tank', 'warden'], lines: ['burn', 'thermal-shock'],
  });
  // The tally line is the whole of the "how much is left" answer, and it counts four.
  assert.equal(game.screen.codexTally, 'MET 4 OF ' + ENTRIES.length);

  const tank = panel('hosts').find((row) => row.name === 'TANK');
  const warden = panel('hosts').find((row) => row.name === BALANCE.bosses.warden.name);
  assert.ok(tank !== undefined && warden !== undefined, 'both bodies are named on the glass');
  assert.equal(tank.unknown, false);
  assert.equal(warden.unknown, false);
  assert.ok(tank.says.length > 0 && tank.says !== 'NOT MET YET', 'and both say what they are');

  // The synergy row is lit like any other row, out of the save and not out of a run.
  assert.equal(met(panel('synergies')).length, 1);
  assert.equal(met(panel('synergies'))[0].says, SYNERGIES[0].says);
  assert.equal(met(panel('lines')).length, 1, 'and only the one card that was taken');
  assert.equal(met(panel('lines'))[0].name, 'BURN');

  // The rest is still empty: a save that has met four things has not met thirty.
  assert.equal(panel('hosts').filter((row) => row.unknown).length, HOSTS.length - 2);
  assert.equal(panel('lines').filter((row) => row.unknown).length, CARDS.length - 1);
  assert.equal(panel('synergies').filter((row) => row.unknown).length, SYNERGIES.length - 1);
});

test('what was met in an earlier visit does not count as new this visit', () => {
  press('KeyC');
  assert.equal(game.screen.codexHidden, false);
  assert.equal(game.screen.codexTally, 'MET 4 OF ' + ENTRIES.length);
  press('KeyC');
  assert.equal(game.stats().codexNew, 0, 'nothing has been played yet, and nothing was learned');
});

test('a row that is met keeps every word it has, and a row that is not keeps its place', () => {
  // The undiscovered rows are not left off the panel: how many are missing, and where they sit, is
  // the whole of what an undiscovered thing may say about itself (game/codex.js).
  const hosts = panel('hosts');
  assert.equal(hosts.length, HOSTS.length, 'every body has a row, met or not');
  const unknown = hosts.findIndex((row) => row.unknown);
  assert.ok(unknown >= 0, 'and on a save this empty most of them are empty');
  assert.equal(hosts[unknown].name, 'UNKNOWN');
  assert.equal(hosts[unknown].says, 'NOT MET YET');
});
