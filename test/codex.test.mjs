// The codex (PLAN 3.7): what the runs of a save have met, and what the glass says about the rows it
// has not.
//
// This is the file that walks a whole visit through it: a first visit that has met nothing, a run
// that fills rows in, the card that says so, the panel that shows it, the save that holds it, and the
// key that puts the panel up. *What counts* as a meeting - which body arrived, which fight was
// reached - is test/codex-rules.test.mjs, which drives the world directly; what is proved here is
// that the whole thing is wired up and honest on the glass.
//
// The run is played by the naive bot (tools/headless/bot.js) on a fixed seed, which means the
// second run of this file is the same run played again: the one situation where the codex can be
// proved to have written nothing, because it is the one situation where it has learned nothing. A
// visit that *arrived* with a codex already in its save is test/codex-found.test.mjs, because one
// boot reads one save (tools/headless/harness.js) and this file spends its one visit on the first.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { playOneRun } from '../tools/headless/bot.js';
import { BALANCE } from '../src/game/balance.js';
import { KINDS } from '../src/game/kinds.js';
import { LINES } from '../src/game/upgrades.js';
import { CARDS, ENTRIES, HOSTS, slugOf, SYNERGIES } from '../src/game/codex.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;

/** What the store will accept as a name (core/save.js). A codex row that is not one of these is a
    row that can never be remembered. */
const SAVE_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

/** The save document as it is stored right now, or null when nothing has been written. */
function saveIn(game) {
  const text = game.storage['starfall.save'];
  return text === undefined ? null : JSON.parse(text);
}

function panel(game) {
  return game.screen.codexPanels;
}

function met(rows) {
  return rows.filter((row) => !row.unknown);
}

function press(code) {
  game.key(code, true);
  game.key(code, false);
  game.step(FRAME);
}

test('the codex has one row for every body and one for every card, and none of them twice', () => {
  // The crowd, in the kind table's own order...
  const crowd = Object.keys(KINDS);
  // ...then the fights, out of the schedule the game actually fields (game/bosses.js).
  const fights = BALANCE.bosses.schedule.map((entry) => entry.boss);
  assert.deepEqual(HOSTS.map((row) => row.id), crowd.concat(fights),
    'every kind and every fight, in that order, and nothing else');

  // Both panels of cards together are the whole deal table, with no row in one that is in the other.
  assert.deepEqual(CARDS.map((row) => row.id).concat(SYNERGIES.map((row) => row.id)),
    LINES.map((line) => line.id), 'every card, once each');
  assert.ok(SYNERGIES.length > 0, 'and there is at least one synergy to find');

  // Every row says what it is, in words that are on the row and not in a test.
  for (const entry of ENTRIES) {
    assert.ok(entry.name.length > 0, entry.id + ' has a name');
    assert.ok(entry.says.length > 0, entry.id + ' says something');
    assert.equal(typeof entry.boss, 'boolean');
  }
  // A fight is named the way the win card names it, so the two cannot drift apart.
  for (const entry of HOSTS.filter((row) => row.boss)) {
    assert.equal(entry.name, BALANCE.bosses[entry.id].name);
    assert.equal(entry.says, BALANCE.bosses[entry.id].blurb);
  }

  // Every row's key is a name the store would take, and no panel has two rows sharing one. A key
  // that is not a name would be a row that is quietly dropped on the way to the save, forever.
  for (const panelRows of [HOSTS, CARDS, SYNERGIES]) {
    const keys = panelRows.map((row) => row.key);
    for (const key of keys) assert.ok(SAVE_NAME.test(key), key + ' is not a save name');
    assert.equal(new Set(keys).size, keys.length, 'a panel has no key twice');
  }
  assert.equal(slugOf('fireRate'), 'fire-rate', 'a camel case id is joined with a hyphen');
  assert.equal(slugOf('sniper'), 'sniper', 'and a plain one is left alone');
  assert.equal(ENTRIES.length, HOSTS.length + CARDS.length + SYNERGIES.length);
});

const game = await bootGame({ root: ROOT, seed: 3, width: 1280, height: 720, storage: {} });

test('a first visit has met nothing, and every row says so', () => {
  assert.equal(game.stats().codex.hosts.length, 0);
  assert.equal(game.screen.codexTally, 'MET 0 OF ' + ENTRIES.length);

  const all = panel(game).hosts.concat(panel(game).lines, panel(game).synergies);
  assert.equal(all.length, ENTRIES.length, 'every row is on the glass before anything is met');
  for (const row of all) {
    assert.equal(row.unknown, true, row.name + ' starts empty');
    assert.equal(row.name, 'UNKNOWN');
  }
  // The three panels refuse in their own words, because "not taken yet" about a card and "not met
  // yet" about a body are two different things a player has not done.
  assert.equal(panel(game).hosts[0].says, 'NOT MET YET');
  assert.equal(panel(game).lines[0].says, 'NOT TAKEN YET');
  assert.equal(panel(game).synergies[0].says, 'NOT FOUND YET');
});

test('C is the codex, and C again is the way back out', () => {
  assert.equal(game.screen.codexHidden, true, 'it starts away');
  press('KeyC');
  assert.equal(game.screen.codexHidden, false);
  press('KeyC');
  assert.equal(game.screen.codexHidden, true, 'and the same key is the way out');
});

test('one panel at a time: the codex and the hangar take each other down', () => {
  press('KeyH');
  assert.equal(game.screen.hangarHidden, false);
  press('KeyC');
  assert.equal(game.screen.codexHidden, false, 'the codex came up');
  assert.equal(game.screen.hangarHidden, true, 'and the hangar went down to let it');
  // And the way back out of the codex is the title, not the hangar coming back for a ride.
  press('KeyC');
  assert.equal(game.screen.codexHidden, true);
  assert.equal(game.screen.hangarHidden, true, 'nothing is left up');
});

test('a click on the codex is not a launch', () => {
  press('KeyC');
  game.pressMouse(640, 400);
  game.releaseMouse();
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.START, 'the visit is still on its title');
  assert.equal(game.screen.codexHidden, false, 'and still looking at the panel it was clicked on');
  press('KeyC');
});

test('a run fills the codex in, and its card says so', async () => {
  // Both of this file's two runs are played on a reset clock, because otherwise they are not the
  // same run at all: where a run starts in the step cycle decides which frame of the bot's input
  // lands on which step (test/seed.test.mjs), and the second run only proves "nothing new" if it is
  // the first one again.
  await game.resetToTitle();
  playOneRun(game, { maxSeconds: 600, policy: 'naive' });
  const stats = game.stats();
  assert.equal(stats.state, game.STATE.OVER, 'the naive bot goes down eventually');

  // Every body the run's own tally says arrived is met, and no body that did not is.
  const arrived = Object.keys(game.world.tally.kinds)
    .filter((type) => game.world.tally.kinds[type].arrived > 0);
  assert.deepEqual(stats.codex.hosts.slice().sort(), arrived.slice().sort());
  assert.ok(stats.codex.hosts.length >= 3, 'a run that met nothing would prove nothing');

  // Every line it took is met too.
  const taken = LINES.filter((line) => game.world.upgrades[line.id] > 0).map((line) => line.id);
  assert.deepEqual(stats.codex.lines.slice().sort(), taken.map(slugOf).sort());

  // The card says how much was learned, in the same count the panel will print.
  assert.equal(stats.codexNew, stats.codex.hosts.length + stats.codex.lines.length);
  assert.match(game.screen.stats, new RegExp(stats.codexNew + ' NEW IN THE CODEX'));
  assert.equal(game.screen.codexTally, 'MET ' + stats.codexNew + ' OF ' + ENTRIES.length);

  // And the save has it, in the shape the next visit reads it in.
  assert.deepEqual(saveIn(game).codex, {
    hosts: stats.codex.hosts.slice().sort(),
    lines: stats.codex.lines.slice().sort(),
  });

  // The panel, put up over the wreck, agrees with all of it.
  press('KeyC');
  assert.equal(game.screen.codexHidden, false);
  assert.equal(game.screen.codexTally, 'MET ' + stats.codexNew + ' OF ' + ENTRIES.length);
  const lit = met(panel(game).hosts).map((row) => row.name);
  assert.ok(lit.length === stats.codex.hosts.length, 'as many bodies lit as were met');
  assert.ok(lit.indexOf('TANK') >= 0 !== stats.codex.hosts.indexOf('tank') < 0,
    'a lit row is a met body');
  assert.ok(met(panel(game).lines).length === stats.codex.lines.length);
});

test('the same run played again teaches nothing, writes nothing, and says nothing', async () => {
  // The same seed on the same boot is the same run (test/seed.test.mjs), so this is the one case
  // where "nothing new" is not a guess: every body and every card it will meet is already in there.
  const known = game.stats().codex;
  const total = known.hosts.length + known.lines.length;
  const before = JSON.stringify(saveIn(game).codex);
  assert.equal(game.screen.codexHidden, false, 'the panel is still up over the wreck');
  await game.resetToTitle();
  assert.equal(game.screen.codexHidden, true, 'a visit back to its title takes its panels down');

  playOneRun(game, { maxSeconds: 600, policy: 'naive' });
  const stats = game.stats();
  assert.equal(stats.state, game.STATE.OVER);
  assert.equal(stats.codexNew, 0, 'the run added nothing, and says so on its own card');
  assert.deepEqual(stats.codex, known, 'and the visit still knows everything the first one taught');
  assert.equal(JSON.stringify(saveIn(game).codex), before, 'the save wrote the same thing again');
  assert.doesNotMatch(game.screen.stats, /CODEX/, 'and the card keeps quiet about it');
  assert.equal(game.screen.codexTally, 'MET ' + total + ' OF ' + ENTRIES.length);
});

test('launching a run takes the codex down with the rest of the screens', () => {
  // The panel is an overlay over the two screens about the next run, and a run that is flying has no
  // business being seen through a panel - which is the same promise the hangar made first.
  for (let i = 0; i < 40; i++) game.step(FRAME);    // the wreck's restart guard, spent (game/run.js)
  press('KeyC');
  assert.equal(game.screen.codexHidden, false);
  press('Space');
  assert.equal(game.stats().state, game.STATE.PLAY, 'the launch key still means launch');
  assert.equal(game.screen.codexHidden, true, 'and the panel went down for the run');
});

