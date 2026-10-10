// What counts as having been met (PLAN 3.7, game/codex.js).
//
// The codex is filled in by a run that has stopped, and the four rules it reads are all small
// claims about other people's bookkeeping: that the tally is the witness for a body arriving
// (game/tally.js), that a fight counts as reached when its schedule entry is spent *or* when it was
// the fight standing when the run stopped (game/bosses.js), and that a card counts when the run held
// a rank of it. Those are what this file drives directly, through the scripted world
// (tools/headless/scripted.js), because a bot that happens to meet three bodies proves very little
// about which bodies would have counted.
//
// The glass is test/codex.test.mjs. Nothing here has a browser: `core/save.js` finds no storage in a
// bare Node process and writes nothing, which is its own test - a codex with nowhere to be remembered
// still remembers for the visit and throws nothing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE } from '../src/game/balance.js';
import { enemyAt, scriptedRun, stepTheWorld } from '../tools/headless/scripted.js';
import { noteArrival } from '../src/game/tally.js';
import { emptyFound, foundLedger, metShare, recordRun, slugOf } from '../src/game/codex.js';
import { newRanks } from '../src/game/upgrades.js';
import { world } from '../src/game/world.js';

const SCHEDULE = BALANCE.bosses.schedule;

/**
 * A run parked and ready, with the schedule whole.
 *
 * `scriptedRun` marks every fight spent so that a test running to the eight-minute mark is not
 * standing in an unasked-for duel (its own header says so); for a codex test that difference is the
 * whole subject, so the schedule is put back here and each test spends exactly what it means to.
 */
function visit(seed) {
  scriptedRun(seed);
  world.bossIndex = 0;
  world.found = emptyFound();
  world.codexNew = 0;
  world.upgrades = newRanks();
  return world;
}

/** The one step every test needs before the world counts as having been anywhere. */
function oneStep() {
  stepTheWorld();
}

/** Say this body arrived, the way the wave director and a boss's hatchlings do (game/tally.js). */
function arrive(type) {
  const body = enemyAt(type, 300, 300);
  noteArrival(world, body);
  return body;
}

test('a body the world never put in play was never met', () => {
  // The attract screen's crowd and a test's planted body are not meetings - the same gate the
  // balance tables are built on, and for the same reason: a codex that filled itself in on the title
  // screen would be a codex that had met everything before anyone had flown anything.
  visit(1);
  enemyAt('sniper', 400, 400);
  oneStep();
  assert.equal(recordRun(world), 0, 'nothing was learned');
  assert.deepEqual(world.found.hosts, []);
  assert.equal(world.codexNew, 0);
});

test('a body that arrived is met, and only the kinds that arrived', () => {
  visit(2);
  arrive('drifter');
  arrive('drifter');
  arrive('sniper');
  enemyAt('bomber', 200, 200);       // standing in the arena, but never put in play
  oneStep();

  assert.equal(recordRun(world), 2);
  assert.deepEqual(world.found.hosts, ['drifter', 'sniper']);
  assert.equal(world.codexNew, 2, 'and the run knows how much it learned');
});

test('the same bodies met again teach nothing and write nothing', () => {
  visit(3);
  arrive('tank');
  oneStep();
  assert.equal(recordRun(world), 1);
  const learned = world.codexNew;

  arrive('tank');
  arrive('weaver');
  oneStep();
  assert.equal(recordRun(world), 1, 'only the new one counts');
  assert.deepEqual(world.found.hosts, ['tank', 'weaver']);
  assert.equal(world.codexNew, learned + 1, 'and what the visit thinks it taught adds up');
});

test('a fight is met when it is beaten, or when it was standing at the end', () => {
  // Beaten: the schedule entry is spent, which is what `world.bossIndex` counts (game/bosses.js).
  visit(4);
  world.bossIndex = 1;
  recordRun(world);
  assert.deepEqual(world.found.hosts, [SCHEDULE[0].boss]);
  assert.ok(world.found.hosts.indexOf(SCHEDULE[1].boss) < 0, 'the next one was never reached');

  // And standing: a run that walked into the second fight and was beaten *by* it has still met it.
  // The only thing `fightWasReached` asks of the fight is which one it was (game/bosses.js).
  visit(5);
  world.bossIndex = 1;
  world.boss = { id: SCHEDULE[1].boss };
  recordRun(world);
  assert.deepEqual(world.found.hosts, [SCHEDULE[0].boss, SCHEDULE[1].boss]);
  assert.ok(world.found.hosts.indexOf(SCHEDULE[2].boss) < 0);
});

test('a card counts when the run held a rank of it', () => {
  visit(6);
  world.upgrades.damage = 2;
  world.upgrades.fireRate = 1;
  world.upgrades.burn = 0;
  assert.equal(recordRun(world), 2);
  assert.deepEqual(world.found.lines, ['damage', 'fire-rate'],
    'a camel case id is remembered with a hyphen in it');
  assert.equal(slugOf('thermalShock'), 'thermal-shock');

  // A synergy is a card like any other, and a run that never earned one never meets it.
  assert.ok(world.found.lines.indexOf('thermal-shock') < 0);
  world.upgrades.thermalShock = 1;
  assert.equal(recordRun(world), 1, 'the same rule fills the synergy row in');
  assert.ok(world.found.lines.indexOf('thermal-shock') >= 0);
});

test('the ledger the save is written from is sorted, deduped, and the whole of what was met', () => {
  visit(7);
  arrive('weaver');
  arrive('drifter');
  world.found.hosts.push('weaver');       // the same meeting counted twice
  world.upgrades.nova = 1;
  recordRun(world);
  assert.deepEqual(foundLedger(world), {
    hosts: ['drifter', 'weaver'], lines: ['nova'],
  }, 'sorted on the way out, and no key twice');
});

test('what the codex counts as filled in is its own rows and nothing else', () => {
  visit(8);
  assert.equal(metShare(world.found).met, 0, 'nothing met yet');
  assert.ok(metShare(world.found).of > 0, 'and there is a whole codex of rows to meet');

  world.found.hosts.push('sniper');
  world.found.lines.push('burn');
  world.found.hosts.push('a-body-no-build-has-named');
  const share = metShare(world.found);
  assert.equal(share.met, 2, 'a key this build has no row for is neither shown nor counted');
});
