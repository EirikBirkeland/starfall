// The win, on the glass (PLAN 3.4: "After the Eclipse, the run is won").
//
// test/victory.test.mjs owns the simulation's half - the schedule running out, the hush as a
// number, the sheet - and test/endless.test.mjs the half after it, the run being handed back. This
// file boots the game and watches the ending arrive: a run parked at the last fight's mark, the
// fight coming down, the arena holding still with nothing over it, and then a card that says what
// the run was - and answers to the two keys that card takes.
//
// One boot, with the tests walking through it in the order a player would: the ending is a thing
// that can only be watched once per boot (see test/session.test.mjs), so everything after the first
// card has to reach another win to say anything about the glass. It wins three times in the end -
// once to read the card, once to prove the card can arrive twice, once to answer it with a number.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { SHIPS } from '../src/game/ships.js';
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

test('the card hands the arena back to the run that won it', () => {
  const score = game.stats().score;
  const bosses = game.stats().bossesDown;
  const hull = game.stats().hull;
  // The hush is spent and the ship is about to be on its own again, so the immunity this file put on
  // it to get here comes off: the grace the hand-back promises should be the only thing between the
  // ship and the arena, or the claim below is the test's and not the game's.
  ship().invuln = 0;
  game.key('Space', true);
  game.key('Space', false);
  game.step(FRAME);

  assert.equal(game.stats().state, game.STATE.PLAY, 'the run is flying again');
  assert.equal(game.stats().endless, true, 'and it knows it is past the end of the schedule');
  assert.equal(game.screen.winHidden, true, 'and the card is off the glass');
  assert.equal(game.stats().score, score, 'on the score it won, not a fresh sheet');
  assert.equal(game.stats().bossesDown, bosses, 'with every fight it buried still buried');
  assert.equal(game.stats().hull, hull, 'and the hull it had left');
  assert.ok(game.world.player.invuln > BALANCE.endless.resumeInvulnerability - 0.1,
    'and a moment before the crowd is allowed to hurt it again (a frame of it has already gone)');
  assert.equal(game.stats().dashLeft, 0, 'and the press that resumed the run was not also a dash');

  const at = game.stats().t;
  wait(0.5);
  assert.equal(game.stats().state, game.STATE.PLAY, 'and it keeps flying');
  assert.ok(game.stats().t > at, 'on the same run clock');
  assert.equal(game.screen.winHidden, true, 'while the card stays down');

  // And the interface says so. The word is looked for on the same line as the clock it belongs to,
  // because the label that floated over the ship on the step of the hand-back is on its way out by
  // now and is nobody's proof of anything.
  const painted = game.texts();
  const clockLine = painted.find((t) => t.text.startsWith('TIME '));
  assert.ok(clockLine, 'the clock is painted');
  assert.ok(painted.some((t) => t.y === clockLine.y && t.text.includes(BALANCE.endless.word)),
    'and the clock line has earned its second word');
});

test('a run that has been won can be won again', () => {
  // The frame loop remembers that it has put a card up until the world moves off that screen; if it
  // ever forgot to forget, the second win would be silent. This wins the same run a second time,
  // which is a thing the schedule cannot do (test/endless.test.mjs holds that) - the card is what is
  // being checked, and it has to be able to arrive more than once per boot.
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

test('R over the card asks for a new run instead', () => {
  // The card's launch key keeps this run, so the way out of it needs a key of its own - and a
  // new run means a fresh sheet in every way, the endless mark included.
  game.key('KeyR', true);
  game.key('KeyR', false);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY, 'a run is flying');
  assert.equal(game.screen.winHidden, true, 'and the card is off the glass');
  assert.equal(game.stats().score, 0, 'on a fresh sheet');
  assert.equal(game.stats().hull, BALANCE.ships[game.stats().ship].hull);
  assert.equal(game.stats().bossesDown, 0, 'and nothing is spent on the schedule yet');
  assert.equal(game.stats().endless, false, 'and this run has not been won yet');
});

test('a number on the card flies that ship, on a new run', () => {
  // The third card. A number is the other half of "fly again": the win's launch key is spent on
  // keeping the run, so a number there has to carry the whole answer - take this ship and begin.
  const world = game.world;
  world.elapsed = DUE - 0.05;
  world.bossIndex = LAST;
  ship().invuln = Infinity;
  world.spawnTimer = Infinity;
  world.enemies.length = 0;
  assert.ok(until(() => game.stats().bossCores > 0, 20), 'the last fight never walked in once more');

  const wanted = SHIPS[3];
  const boss = game.world.boss;
  damageEnemy(world, boss.enemy, boss.enemy.maxhp * 10, true);
  assert.ok(until(() => game.stats().state === game.STATE.WON, 6), 'and the win never came again');

  // Over the hush a number is refused: the ship a run is flying is not changed under a run that has
  // not finished being won, because the key that hands it back would then fly a different ship than
  // the one its hull and its dash were chosen for.
  game.key('Digit4', true);
  game.key('Digit4', false);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.WON, 'the hush holds');
  assert.notEqual(game.stats().ship, wanted.id, 'and so does the ship');

  assert.ok(until(() => game.screen.winHidden === false, HUSH + 1), 'the card never came up');
  game.key('Digit4', true);
  game.key('Digit4', false);
  game.step(FRAME);
  assert.equal(game.stats().state, game.STATE.PLAY, 'the pick was taken and the run began');
  assert.equal(game.stats().ship, wanted.id, 'as the ship that was asked for');
  assert.equal(game.stats().score, 0, 'on a fresh sheet, not the won one');
  assert.equal(game.stats().endless, false);
});

test('the card says what its keys do', () => {
  // The copy is in the markup and the keys are in main.js, which is exactly how a card ends up
  // advertising something the game stopped doing. This reads the card off the file the browser
  // reads, the same way structure.test.mjs reads the sources.
  const markup = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const card = markup.slice(markup.indexOf('id="winScreen"'), markup.indexOf('<script'));
  assert.ok(card.length > 0, 'the win card is in the markup');
  const hint = /class="hint">([^<]*)</.exec(card);
  assert.ok(hint, 'and it has a line saying what its keys do');
  const words = hint[1].toUpperCase();
  assert.match(words, /SPACE/, 'the key that keeps the run flying');
  assert.match(words, /\bR\b/, 'and the one that asks for a new run');
  assert.doesNotMatch(card, /FINAL SCORE/, 'the score is not final while the run can be kept');
});
