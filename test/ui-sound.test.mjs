// The interface's own sounds (BALANCE.ui).
//
// PLAN section 5 asks for "UI ticks" and this is them: a ship picked, a run launched, a card
// taken, the table dealt again, a line cut out, a run's card landing, and the mute switch coming
// back. They are the only sounds in the game the simulation did not ask for - a screen goes up on
// a frame, not on a step, and `game/` may not know audio exists - so they come from main.js and
// ui/screens.js straight to audio/sfx.js `uiTick`, and nothing else in the game can make them.
//
// What a test can see of a voice is what the fake audio device logs: a pitch is logged when a
// voice is asked for one, so "the interface answered with the note its row says" is a fact that
// is read here and not hoped (tools/headless/harness.js).
//
// One boot, walked in the order a player meets the interface, because the game is one world per
// process and the title only answers the first time.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { SHIPS } from '../src/game/ships.js';
import { dropShards } from '../src/game/pickups.js';
import { makeEnemy } from '../src/game/kinds.js';
import { damageEnemy } from '../src/game/enemies.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const UI = BALANCE.ui;
const FRAME = 16.7;

const game = await bootGame({ root: ROOT, seed: 21, audio: true });
const world = game.world;
const ship = world.player;

/** Where the pitch log stands right now. Pass it to `notesSince`. */
function mark() { return game.audio.ramps.length; }

/** Every pitch asked for since `at`. */
function notesSince(at) {
  return game.audio.ramps.slice(at)
    .filter((r) => r.name === 'pitch' && r.op === 'set')
    .map((r) => r.v);
}

function heard(at, hz) {
  return notesSince(at).some((v) => Math.abs(v - hz) < 0.001);
}

/** Did any voice slide to `hz` since `at`? (What a rising tick is made of.) */
function sweptTo(at, hz) {
  return game.audio.ramps.slice(at).some((r) => r.name === 'pitch' && r.op === 'exp'
    && Math.abs(r.v - hz) < 0.001);
}

/** Press a key and let go of it, without letting a frame run in between. */
function tap(code, extra) {
  const at = mark();
  game.key(code, true, extra);
  game.key(code, false);
  return at;
}

function wait(frames) {
  for (let i = 0; i < frames; i++) game.step(FRAME);
}

/** Step until `seen` answers true. Bounded: a regression has to fail, not hang the box. */
function until(seen, seconds) {
  const limit = Math.ceil(seconds * 1000 / FRAME);
  let frames = 0;
  while (!seen() && frames < limit) { game.step(FRAME); frames++; }
  return seen();
}

/**
 * Answer whatever is on the table until the run is flying again. The tests that need a card
 * sometimes arrive while one is already up, and a paused run collects nothing.
 */
function backToPlay() {
  let guard = 0;
  while (world.state === game.STATE.LEVEL && guard < 30) { tap('Digit1'); guard++; }
  assert.equal(world.state, game.STATE.PLAY, 'the table never emptied');
}

/**
 * Stop the run for one card, the way a level does (test/level-up.test.mjs does the same for the
 * same reason): the bank is emptied and exactly enough loot is dropped on the ship to pay for one.
 */
function dealOneCard() {
  backToPlay();
  world.xp = 0;
  world.shards.clear();
  world.pendingLevels = 0;
  dropShards(world, ship.x, ship.y, Math.ceil(world.xpNeed / BALANCE.shards.xp));
  assert.ok(until(() => world.state === game.STATE.LEVEL, 10), 'the run never stopped for a card');
}

test('the title keeps quiet until it is asked', () => {
  wait(30);
  assert.equal(game.audio.voices, 0,
    'nothing has been pressed, so nothing has been scheduled: ' + game.audio.voices + ' voices');
});

test('picking a ship answers with a note', () => {
  const at = tap('Digit2');
  assert.equal(game.stats().ship, SHIPS[1].id, 'the pick itself went through');
  assert.ok(heard(at, UI.pick.freq), 'the pick was silent');
  assert.ok(sweptTo(at, UI.pick.slide), 'and it rose, which is what a beginning sounds like');
});

test('a number with no ship behind it says nothing', () => {
  // The rule the whole row lives by: a tick answers a press that was taken. Six ships are on the
  // rack and `Digit9` is not one of them, so the key is refused - in silence, like the title has
  // always refused it (main.js `onPickCard`).
  const at = tap('Digit9');
  assert.equal(notesSince(at).length, 0, 'a refused key made ' + notesSince(at).join(', '));
});

test('the mute switch is silent going quiet and answers coming back', () => {
  const off = tap('KeyM');
  wait(2);
  assert.equal(notesSince(off).length, 0, 'going quiet is its own answer, and made no voice');

  const on = tap('KeyM');
  assert.ok(heard(on, UI.unmute.freq), 'coming back said nothing');
});

test('launching a run answers with the confirm note', () => {
  const at = mark();
  game.pressMouse(640, 240);
  assert.equal(game.stats().state, game.STATE.PLAY);
  assert.ok(heard(at, UI.confirm.freq), 'the launch was silent');
  // The ship is not what this file is about: it cannot be hurt, and no crowd turns up to be in
  // the way of the tests after this one.
  ship.invuln = Infinity;
  world.spawnTimer = Infinity;
  game.releaseMouse();
});

test('taking a card answers with its own note', () => {
  dealOneCard();
  const at = tap('Digit1');
  assert.ok(heard(at, UI.take.freq), 'taking a card made no sound');
  assert.equal(world.state, game.STATE.PLAY, 'and the card was taken');
});

test('dealing the table again answers going down', () => {
  dealOneCard();
  const at = tap('KeyR');
  assert.ok(heard(at, UI.reroll.freq), 'the reroll was silent');
  assert.equal(world.state, game.STATE.LEVEL, 'and the level is still owed its card');
});

test('a cut line answers lower than a reroll', () => {
  world.banishesLeft = BALANCE.cards.banishes;
  const at = tap('Digit1', { shiftKey: true });
  assert.ok(heard(at, UI.banish.freq), 'the banish was silent');
  assert.equal(world.state, game.STATE.LEVEL, 'and a banish does not pay the level');
});

test('a ask the run has spent is refused in silence', () => {
  // Same rule as the number with no ship behind it: rerollOffer refuses when there is no ask
  // left, and a tick over a refusal would be the interface lying about what the key did.
  dealOneCard();
  world.rerollsLeft = 0;
  world.banishesLeft = 0;
  const at = tap('KeyR');
  assert.equal(notesSince(at).length, 0, 'a spent ask made a sound');
  const banished = tap('Digit1', { shiftKey: true });
  assert.equal(notesSince(banished).length, 0, 'a spent banish made a sound');

  world.rerollsLeft = 1;
  const got = tap('KeyR');
  assert.ok(heard(got, UI.reroll.freq), 'and with an ask left it answers again');
});

test('nothing at all is heard while the game is muted', () => {
  tap('KeyM');                        // mute
  const at = mark();
  dealOneCard();
  tap('Digit1');                      // a card taken: the loudest tick in the interface
  game.pressMouse(640, 300);
  wait(4);
  assert.equal(notesSince(at).length, 0, 'muted means muted, and heard ' + notesSince(at).length);
  tap('KeyM');                        // and back
});

test("a run's own card lands with a knock", () => {
  // The death card is put up on a frame, after the step that ended the run, so no cue could have
  // carried its sound: this is the interface making its own noise and nothing else (game/run.js,
  // and `victory` in the balance sheet for why the simulation stays out of it).
  backToPlay();
  ship.invuln = 0;
  let frames = 0;
  let at = mark();
  while (world.state !== game.STATE.OVER && frames < 600) {
    ship.hull = 1;
    ship.invuln = 0;
    ship.fireTimer = 5;               // no shot, or it kills the body planted on it
    world.enemies.push(makeEnemy(world, 'drifter', ship.x, ship.y, {
      hp: 1, speed: 0, drop: 0, score: 0,
    }));
    at = mark();
    game.step(FRAME);
    frames++;
  }
  assert.equal(world.state, game.STATE.OVER, 'the run did not end');
  assert.equal(game.screen.overHidden, false, 'and its card went up');
  // The wreck's own chord is 520, 392 and 262 (BALANCE.runOver.sound) and the hiss behind it has
  // no pitch to log, so a knock at the card's own note is the card and not the wreck.
  assert.ok(heard(at, UI.card.freq), 'the card landed without a sound of its own: '
    + notesSince(at).join(', '));
});

test("a win's card lands with the same knock", () => {
  // The other ending, and the reason the row is one row: the schedule is out, the arena holds
  // still for the hush, and the card goes up over the fight's own going-down (BALANCE.victory).
  // The fight is the last one on the schedule, walked in the honest way - the clock put where it
  // is due (test/victory-card.test.mjs does exactly this for the card's words).
  const schedule = BALANCE.bosses.schedule;
  const last = schedule.length - 1;
  wait(30);                             // the death card's restart guard is spent, then
  game.pressMouse(640, 240);             // the death card's launch key: another run
  game.releaseMouse();
  assert.equal(game.stats().state, game.STATE.PLAY);
  ship.invuln = Infinity;
  world.spawnTimer = Infinity;
  world.enemies.length = 0;
  world.elapsed = BALANCE.bosses.schedule[last].at - 0.05;
  world.bossIndex = last;
  assert.ok(until(() => game.stats().bossCores > 0, 30), 'the last fight never walked in');

  const boss = world.boss;
  damageEnemy(world, boss.enemy, boss.enemy.maxhp * 10, true);
  assert.ok(until(() => game.stats().state === game.STATE.WON, 6), 'the run was never won');

  let at = mark();
  let frames = 0;
  while (game.screen.winHidden && frames < Math.ceil(BALANCE.victory.hush * 2000 / FRAME)) {
    at = mark();
    game.step(FRAME);
    frames++;
  }
  assert.equal(game.screen.winHidden, false, 'the card never came up');
  assert.ok(heard(at, UI.card.freq), 'the win card landed without a knock: '
    + notesSince(at).join(', '));
});
