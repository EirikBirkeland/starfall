// A settled screen writes nothing (PLAN section 5's performance rules; the guard half of the audit
// session 124 started and session 125 found the reason for).
//
// Every word of this game's interface is DOM, and the arena is a canvas. That is only free while the page
// is written when something has actually *changed*: a card that repaints itself sixty times a second is
// spending the frame's time rebuilding boxes nobody asked for, and it is invisible in the browser until it
// costs a run. Session 125 found the death's card doing exactly that - its "press to go" flag forgotten, so
// the ending was painted again on every frame it was up - and fixed the one case. This file is the general
// one: it settles each screen of the game and holds that the page is then still.
//
// The instrument is the harness's `domWrites()`: every element it hands out counts the text put into it and
// the children added or taken away, which is what a browser charges for. A class toggled to the value it
// already had is not counted, because the real `classList.toggle` does nothing then either.
//
// One boot, walked in the order a player would walk it, because an ending can only be watched once per visit
// (test/session.test.mjs holds why).

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { bootGame, everyShipBought } from '../tools/headless/harness.js';
import { BALANCE } from '../src/game/balance.js';
import { damageEnemy } from '../src/game/enemies.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const FRAME = 16.7;
const SEED = 4028;

/** How long a screen is held still before the page is asked whether it moved. */
const SETTLE = 60;

const SCHEDULE = BALANCE.bosses.schedule;
const LAST = SCHEDULE.length - 1;
const DUE = SCHEDULE[LAST].at;

const game = await bootGame({
  root: ROOT, seed: SEED, width: 1280, height: 720,
  storage: { 'starfall.save': JSON.stringify({ version: 1, hangar: { ships: everyShipBought() } }) },
});
const world = game.world;

function frames(n) {
  for (let i = 0; i < n; i++) game.step(FRAME);
}

function key(code) {
  game.key(code, true);
  game.key(code, false);
  frames(2);
}

/** Step until `seen` answers true. Bounded: a regression has to fail, not hang the box. */
function until(seen, seconds) {
  const limit = Math.ceil(seconds * 1000 / FRAME);
  let walked = 0;
  while (!seen() && walked < limit) { game.step(FRAME); walked++; }
  return seen();
}

/**
 * Hold the screen still for `SETTLE` frames and say how many times the page was written during them.
 *
 * The reset is the test: the boot writes the whole page once, and a number that includes it would say
 * everything is fine whatever happens afterwards.
 */
function writesWhileStill() {
  game.resetDomWrites();
  frames(SETTLE);
  return game.domWrites();
}

test('the title, with nothing happening on it, leaves the page alone', async () => {
  await game.resetToTitle(SEED);
  frames(4);
  assert.equal(world.state, game.STATE.START);
  assert.equal(writesWhileStill(), 0, 'the title is not rewriting itself between launches');
});

test('the three panels, once up, leave the page alone', async () => {
  await game.resetToTitle(SEED);
  frames(4);

  key('KeyH');
  assert.equal(game.screen.hangarHidden, false, 'the shop is up');
  assert.equal(writesWhileStill(), 0, 'and its nine rows are not being repainted sixty times a second');

  key('KeyH');
  key('KeyC');
  assert.equal(game.screen.codexHidden, false, 'the record is up');
  assert.equal(writesWhileStill(), 0, 'and its forty-odd rows are not either');

  key('KeyC');
  key('KeyO');
  assert.equal(game.screen.settingsHidden, false, 'and the settings are up');
  assert.equal(writesWhileStill(), 0, 'with its rows read from their owners and not re-written per frame');
  key('KeyO');
});

test('the counter counts a page that really is written', async () => {
  // The instrument's own check, before any of the zeros below can mean anything: a press that changes
  // the page is seen. Putting the shop up paints its nine rows on the way (main.js `openRack`).
  await game.resetToTitle(SEED);
  frames(4);

  game.resetDomWrites();
  key('KeyH');
  assert.equal(game.screen.hangarHidden, false, 'the shop came up');
  assert.ok(game.domWrites() > 0, 'and the counter saw the page being written');

  assert.equal(writesWhileStill(), 0,
    'the very same page, settled, writes nothing - which is what makes every zero here mean something');
  key('KeyH');
});

test('a run being flown leaves the page alone too', () => {
  // A flying run writes the page not at all: its score, its purse and its level line are painted on the
  // canvas with the fight (render/hud.js), and the DOM is only the screens around it. That is worth
  // holding, because the day any of that moves onto the page it has to be written when it changes and
  // not once per frame - and this is the test that would say so.
  game.pressMouse(640, 240);
  game.releaseMouse(0);
  frames(4);
  assert.equal(world.state, game.STATE.PLAY, 'the run is flying');
  assert.equal(writesWhileStill(), 0, 'and the page is still behind it');
});

test('the wreck\u2019s card, once landed, leaves the page alone', () => {
  // The exact bug session 125 found: the card's "press to go" flag forgotten, and the whole ending
  // painted again on every frame it was up. It is reached the way a player reaches it.
  key('KeyP');
  assert.equal(world.paused, true, 'the run is held');

  game.resetDomWrites();
  key('KeyG');
  assert.ok(until(() => game.screen.overHidden === false, 2), 'the card never came up');
  assert.ok(game.domWrites() > 0, 'the ending is written once, when it arrives');
  frames(4);

  assert.equal(writesWhileStill(), 0, 'and then not again, on any frame after it');
});

test('the pause, over a held run, leaves the page alone', () => {
  // A second run, held rather than ended, because the pause reads a live run off the page and it is the
  // one panel whose numbers could plausibly be refreshed every frame.
  game.pressMouse(640, 240);
  game.releaseMouse(0);
  frames(10);
  assert.equal(world.state, game.STATE.PLAY);
  key('KeyP');
  assert.equal(world.paused, true, 'and the rack is up over it');
  assert.equal(game.screen.pauseHidden, false, 'the rack itself is on the glass');

  assert.equal(writesWhileStill(), 0, 'a held run is held: its readout is painted once, with the rack');
  key('KeyP');
});

test('the win\u2019s card, once its keys have arrived, leaves the page alone', () => {
  // Parked at the last fight the way test/victory-card.test.mjs does - the honest version of starting
  // the run fifteen minutes in, since the whole curve reads the run's clock.
  game.pressMouse(640, 240);
  game.releaseMouse(0);
  frames(4);
  assert.equal(world.state, game.STATE.PLAY);

  world.elapsed = DUE - 0.05;
  world.bossIndex = LAST;
  world.player.invuln = Infinity;
  world.spawnTimer = Infinity;
  world.enemies.length = 0;

  assert.ok(until(() => game.stats().bossCores > 0, 20), 'the last fight never walked in');
  const boss = world.boss;
  assert.ok(boss, 'the last fight is standing in the arena');
  damageEnemy(world, boss.enemy, boss.enemy.maxhp * 10, true);
  assert.ok(until(() => world.state === game.STATE.WON, 6), 'the schedule ran out and the glass never heard');

  assert.ok(until(() => game.screen.winHidden === false, BALANCE.victory.hush + 1),
    'the win card never came up');
  assert.ok(until(() => game.screen.winHintShown, BALANCE.victory.guard + 1),
    'and its line of keys never arrived');
  frames(4);

  assert.equal(writesWhileStill(), 0,
    'the card and its keys are painted once between them, and then left to be read');
});

test('the counter is not counting the harness looking at the page', () => {
  // Reading is not writing. Every test above reads the snapshot - `game.screen` walks the whole stub page
  // and asks each element for its text and its classes - and if that counted as a write, a screen that is
  // merely being *looked at* would fail its own test.
  game.resetDomWrites();
  const screen = game.screen;
  frames(1);
  assert.equal(game.domWrites(), 0, 'a frame that changes nothing writes nothing');
  assert.ok(Object.keys(screen).length > 40, 'and the snapshot was taken, which is the reading half');
});
