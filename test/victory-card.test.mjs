// The win, on the glass (PLAN 3.4: "After the Eclipse, the run is won").
//
// test/victory.test.mjs owns the simulation's half - the schedule running out, the hush as a
// number, the sheet. This file boots the game and watches the ending arrive: a run parked at the
// last fight's mark, the fight coming down, the arena holding still with nothing over it, and
// then a card that says what the run was.
//
// One boot and one win, with the tests walking through it in the order a player would - the
// ending is a thing that can only be watched once per boot (see test/session.test.mjs). The
// last test wins a second time on purpose, to prove the glass will say it again.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { damageEnemy } from '../src/game/enemies.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const game = await bootGame({ root: ROOT, seed: 4, audio: true });

const HUSH = BALANCE.victory.hush;
const SCHEDULE = BALANCE.bosses.schedule;
const LAST = SCHEDULE.length - 1;
const DUE = SCHEDULE[LAST].at;
const FRAME = 16.7;

/** Step until `seen` answers true. Bounded: a regression has to fail, not hang the box. */
function until(seen, seconds) {
  const limit = Math.ceil(seconds * 1000 / FRAME);
  let frames = 0;
  while (!seen() && frames < limit) {
    game.step(FRAME);
    frames++;
  }
  return seen();
}

/** One frame's worth of time. */
function wait(seconds) {
  const frames = Math.round(seconds * 1000 / FRAME);
  for (let i = 0; i < frames; i++) game.step(FRAME);
}

function ship() {
  return game.world.player;
}

test('a run parked at the last fight meets it', () => {
  // The mouse launches it, so the key that follows is not spent on the dash the title would eat.
  game.pressMouse(640, 240);
  game.step();
  assert.equal(game.stats().state, game.STATE.PLAY);

  const world = game.world;
  // The honest version of "start the run fifteen minutes in" - the same thing
  // `tools/simulate.js --at` does, and for the same reason: the whole curve reads the run's
  // clock, and everything on the schedule due before that mark has been and gone.
  world.elapsed = DUE - 0.05;
  world.bossIndex = LAST;
  // The ship is not what this file is about: it cannot be hurt, and no crowd turns up to be in
  // the way of the ending (both doors game/tools/headless/scripted.js uses for the same reason).
  ship().invuln = Infinity;
  world.spawnTimer = Infinity;
  world.enemies.length = 0;

  assert.ok(until(() => game.stats().bossCores > 0, 20),
    'the last fight never walked in');
  assert.equal(game.stats().boss, BALANCE.bosses[SCHEDULE[LAST].boss].name);
  assert.equal(game.stats().state, game.STATE.PLAY, 'and the run is still flying while it is up');
  assert.equal(game.stats().caged, true, 'the duel has its room');
});

test('the fight coming down ends the run, and no card comes up yet', () => {
  const boss = game.world.boss;
  assert.ok(boss, 'the last fight is standing in the arena');
  damageEnemy(game.world, boss.enemy, boss.enemy.maxhp * 10, true);

  assert.ok(until(() => game.stats().state === game.STATE.WON, 6),
    'the schedule ran out and the glass never heard about it');
  assert.equal(game.screen.overHidden, true, 'a win is not shown as a death');
  assert.equal(game.screen.winHidden, true, 'and the win keeps its hush before its card');
});

test('the hush cannot be pressed through', () => {
  wait(HUSH * 0.5);
  game.key('Space', true);
  game.key('Space', false);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.WON, 'the key found nothing to restart yet');
  assert.equal(game.screen.winHidden, true, 'and it put no card up');
});

test('the card lands when the hush is spent', () => {
  assert.ok(until(() => game.screen.winHidden === false, HUSH + 1),
    'the card never came up');
  assert.equal(game.screen.overHidden, true, 'and the death card never came up at all');
});

test('the card says what the run was', () => {
  const stats = game.stats();
  const screen = game.screen;
  assert.equal(screen.winScore, stats.score.toLocaleString('en-US'), 'the score, with its comma');
  assert.equal(screen.winBest, game.world.best.toLocaleString('en-US'));
  assert.equal(screen.winNewBestShown, true, 'a first win is a first best');
  assert.match(screen.winStats, new RegExp('CLEARED IN \\d+m\\d\\ds'), 'a run of a quarter hour');
  assert.match(screen.winStats, new RegExp('SEED ' + stats.seed));
  assert.match(screen.winStats, new RegExp(stats.bossesDown + ' BOSS'));
  // The fights it went through, named out of the schedule itself (game/bosses.js).
  for (const entry of SCHEDULE) {
    assert.match(screen.winCleared, new RegExp(BALANCE.bosses[entry.boss].name));
  }
  // The card shows the names the balance sheet prints (ship and gun, upper case); the stats
  // report their ids, so the comparison has to be blind to that.
  assert.match(screen.winBuild, new RegExp(stats.ship, 'i'));
  assert.match(screen.winBuild, new RegExp(stats.weapon, 'i'));
});

test('the win is kept as the best, the way a wreck keeps its score', () => {
  const best = Number(game.storage['starfall.best']);
  assert.ok(Number.isFinite(best), 'it went into the store at all');
  assert.equal(best, game.stats().score);
});

test('the card lets the ship fly again', () => {
  game.key('Space', true);
  game.key('Space', false);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY, 'the run began again');
  assert.equal(game.screen.winHidden, true, 'and the card is off the glass');
  assert.equal(game.stats().score, 0, 'on a fresh sheet');
  assert.equal(game.stats().hull, BALANCE.ships[game.stats().ship].hull);
  assert.equal(game.stats().bossesDown, 0, 'and nothing is spent on the schedule yet');
});

test('a run that has been won can be won again', () => {
  // The frame loop remembers that it has put a card up until the world moves off that screen;
  // if it ever forgot to forget, the second win would be silent.
  const world = game.world;
  world.elapsed = DUE - 0.05;
  world.bossIndex = LAST;
  ship().invuln = Infinity;
  world.spawnTimer = Infinity;
  world.enemies.length = 0;
  assert.ok(until(() => game.stats().bossCores > 0, 20), 'the last fight never walked in again');

  const boss = game.world.boss;
  damageEnemy(world, boss.enemy, boss.enemy.maxhp * 10, true);
  assert.ok(until(() => game.stats().state === game.STATE.WON, 6), 'and the win never came again');
  assert.ok(until(() => game.screen.winHidden === false, HUSH + 1), 'and the card stayed down');
});
